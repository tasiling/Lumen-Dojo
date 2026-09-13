import { NextRequest, NextResponse } from "next/server";
import {
  appendCaptureImage,
  createCaptureEntry,
  listCaptureEntries,
  saveCaptureEntry,
} from "@/lib/dojo/captureStore";
import { analyzeEnglishImage } from "@/lib/dojo/englishImageAnalysis";
import {
  createEnglishImageEntry,
  listEnglishImageEntries,
  moveEnglishImageToCapture,
  routeEnglishImage,
  saveEnglishImageEntry,
} from "@/lib/dojo/englishImageStore";
import {
  clipQuickReply,
  extractFirstUrl,
  fetchLineImage,
  fetchWebPreview,
  imageRouteQuickReply,
  normalizeClipUrl,
  platformFromUrl,
  replyLineMessage,
  verifyLineSignature,
  type LineWebhookBody,
  type LineWebhookEvent,
} from "@/lib/dojo/lineClipping";
import { CAPTURE_CLIP_PURPOSES, type CaptureClipMeta, type CaptureClipPurpose } from "@/lib/dojo/formal";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function emptyClip(overrides: Partial<CaptureClipMeta>): CaptureClipMeta {
  return {
    origin: "line",
    purpose: "saveFirst",
    sourceKind: "note",
    platform: "LINE",
    externalEventId: "",
    externalMessageId: "",
    awaitingScreenshotUntil: null,
    webPreview: { description: "", imageUrl: "", fetchedAt: null, status: "none" },
    attachments: [],
    ...overrides,
  };
}

function imageFilename(messageId: string, mimeType: string): string {
  const extension = mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg";
  return `line-${messageId.replace(/[^a-zA-Z0-9_-]/g, "").slice(-40) || Date.now()}.${extension}`;
}

async function handleText(event: LineWebhookEvent, userId: string): Promise<void> {
  const messageId = event.message?.id ?? "";
  const text = event.message?.text?.trim() ?? "";
  const foundUrl = extractFirstUrl(text);
  if (!foundUrl) {
    const images = await listEnglishImageEntries();
    const recent = images.find((entry) =>
      entry.route !== "pending" && entry.awaitingContextUntil && new Date(entry.awaitingContextUntil).getTime() > Date.now()
    );
    if (recent) {
      await saveEnglishImageEntry({ ...recent, contextNote: [recent.contextNote, text].filter(Boolean).join("\n"), awaitingContextUntil: null });
      await replyLineMessage(event.replyToken ?? "", "情境說明已補進英文影像匣。AI 不會自動重跑；需要時可在影像匣按「重新分析」。");
      return;
    }
    await replyLineMessage(event.replyToken ?? "", "這個入口目前接收網頁網址與截圖。把網址直接貼過來，或傳送一張截圖即可。");
    return;
  }

  const sourceUrl = normalizeClipUrl(foundUrl);
  const captures = await listCaptureEntries();
  const duplicate = captures.find((capture) =>
    capture.clip.externalMessageId === messageId ||
    (capture.clip.origin === "line" && capture.sourceUrl === sourceUrl)
  );
  if (duplicate) {
    await replyLineMessage(
      event.replyToken ?? "",
      `這個網頁已經在野採採集匣裡：\n「${duplicate.title}」`,
      clipQuickReply(duplicate.id, duplicate.clip.attachments.length === 0)
    );
    return;
  }

  const preview = await fetchWebPreview(sourceUrl);
  const note = text.replace(foundUrl, "").trim();
  const capture = await createCaptureEntry({
    title: preview.title || platformFromUrl(sourceUrl),
    category: null,
    excerpt: preview.description,
    sourceUrl,
    note,
    clip: emptyClip({
      sourceKind: "webpage",
      platform: preview.platform,
      externalEventId: event.webhookEventId ?? "",
      externalMessageId: messageId,
      webPreview: {
        description: preview.description,
        imageUrl: preview.imageUrl,
        fetchedAt: preview.fetchedAt,
        status: preview.status,
      },
    }),
  });

  const previewNote = preview.status === "unavailable" ? "網址已保存；這個網站目前無法自動讀取摘要。" : "網址與網頁資訊已保存。";
  await replyLineMessage(
    event.replyToken ?? "",
    `已剪藏｜${preview.platform}\n「${capture.title}」\n${previewNote}\n可以順手標記用途，也可以先不處理。`,
    clipQuickReply(capture.id, true)
  );
  void userId;
}

async function handleImage(event: LineWebhookEvent): Promise<void> {
  const messageId = event.message?.id ?? "";
  if (!messageId) throw new Error("LINE 圖片缺少 message id");
  const captures = await listCaptureEntries();
  const englishImages = await listEnglishImageEntries();
  const duplicateCapture = captures.find((capture) => capture.clip.attachments.some((item) => item.sourceMessageId === messageId));
  const duplicateEnglish = englishImages.find((entry) => entry.externalMessageId === messageId || entry.attachment.sourceMessageId === messageId);
  if (duplicateCapture) {
    await replyLineMessage(event.replyToken ?? "", `這張截圖已經保存於「${duplicateCapture.title}」。`, clipQuickReply(duplicateCapture.id, false));
    return;
  }
  if (duplicateEnglish) {
    await replyLineMessage(event.replyToken ?? "", `這張圖片已經保存於英文影像匣「${duplicateEnglish.title}」。`, imageRouteQuickReply(duplicateEnglish.id));
    return;
  }

  const now = new Date();
  let capture = captures.find((item) =>
    item.clip.origin === "line" &&
    item.clip.awaitingScreenshotUntil !== null &&
    new Date(item.clip.awaitingScreenshotUntil).getTime() > now.getTime()
  );
  const image = await fetchLineImage(messageId);
  if (capture) {
    capture = await appendCaptureImage({ capture, bytes: image.bytes, mimeType: image.mimeType, filename: imageFilename(messageId, image.mimeType), sourceMessageId: messageId });
    await replyLineMessage(event.replyToken ?? "", `截圖已補到「${capture.title}」，網址與原圖保存在同一筆素材。`, clipQuickReply(capture.id, false));
    return;
  }
  const entry = await createEnglishImageEntry({
    bytes: image.bytes,
    mimeType: image.mimeType,
    filename: imageFilename(messageId, image.mimeType),
    sourceMessageId: messageId,
    externalEventId: event.webhookEventId ?? "",
  });
  await replyLineMessage(event.replyToken ?? "", "圖片已保存，尚未放進野採。這張比較像哪一類？", imageRouteQuickReply(entry.id));
}

async function handlePostback(event: LineWebhookEvent): Promise<void> {
  const params = new URLSearchParams(event.postback?.data ?? "");
  if (params.get("action") === "imageRoute") {
    const entryId = params.get("entryId") ?? "";
    const route = params.get("route");
    const images = await listEnglishImageEntries();
    const entry = images.find((item) => item.id === entryId);
    if (!entry) {
      await replyLineMessage(event.replyToken ?? "", "找不到這筆英文影像，可能已經被移動或移除。");
      return;
    }
    if (route === "capture") {
      const capture = await moveEnglishImageToCapture(entry);
      await replyLineMessage(event.replyToken ?? "", "已轉成一般剪藏並送進野採。", clipQuickReply(capture.id, false));
      return;
    }
    if (route === "game" || route === "daily") {
      const routed = await routeEnglishImage(entry, route);
      const analyzed = await analyzeEnglishImage(routed.id);
      const label = route === "game" ? "遊戲英文" : "英文日常";
      if (analyzed.analysisStatus === "completed" || analyzed.analysisStatus === "needs-review") {
        const review = analyzed.analysisStatus === "needs-review" ? "\n辨識信心較低，請到英文影像匣確認。" : "";
        await replyLineMessage(event.replyToken ?? "", `已放進「${label}」並完成 AI 整理。\n\n${analyzed.englishRecord.slice(0, 1200)}${review}\n\n十分鐘內再傳一句文字，可補充這張圖的情境。`);
      } else {
        await replyLineMessage(event.replyToken ?? "", `已放進「${label}」，原圖已保存。\nAI 暫時未完成：${analyzed.analysisError || "稍後可在英文影像匣重新分析"}`);
      }
      return;
    }
    return;
  }
  const captureId = params.get("captureId") ?? "";
  const action = params.get("action");
  if (!captureId) return;
  const captures = await listCaptureEntries();
  const capture = captures.find((item) => item.id === captureId && item.clip.origin === "line");
  if (!capture) {
    await replyLineMessage(event.replyToken ?? "", "找不到這筆剪藏，可能已經被移除。");
    return;
  }

  if (action === "purpose") {
    const purpose = params.get("purpose") as CaptureClipPurpose | null;
    if (!purpose || !(purpose in CAPTURE_CLIP_PURPOSES)) return;
    await saveCaptureEntry({ ...capture, clip: { ...capture.clip, purpose } });
    await replyLineMessage(event.replyToken ?? "", `已標記為「${CAPTURE_CLIP_PURPOSES[purpose]}」。素材仍留在野採待處理。`);
    return;
  }
  if (action === "awaitScreenshot") {
    const awaitingScreenshotUntil = new Date(Date.now() + 10 * 60_000).toISOString();
    await saveCaptureEntry({ ...capture, clip: { ...capture.clip, awaitingScreenshotUntil } });
    await replyLineMessage(event.replyToken ?? "", "請在十分鐘內傳送截圖；下一張圖片會補到這筆網址素材。");
  }
}

async function handleEvent(event: LineWebhookEvent, allowedUserId: string): Promise<void> {
  const userId = event.source?.userId ?? "";
  if (!userId) return;
  if (!allowedUserId) {
    await replyLineMessage(
      event.replyToken ?? "",
      `LINE 剪藏入口尚未指定擁有者。請把以下 user ID 加到 Railway 的 LINE_ALLOWED_USER_ID：\n${userId}`
    );
    return;
  }
  if (userId !== allowedUserId) return;
  if (event.type === "message" && event.message?.type === "text") return handleText(event, userId);
  if (event.type === "message" && event.message?.type === "image") return handleImage(event);
  if (event.type === "postback") return handlePostback(event);
  if (event.type === "message") {
    await replyLineMessage(event.replyToken ?? "", "目前只接收網頁網址與截圖。其他素材可以先留在原本的 LINE 收藏處。");
  }
}

export async function POST(req: NextRequest) {
  const channelSecret = process.env.LINE_CHANNEL_SECRET ?? "";
  const allowedUserId = process.env.LINE_ALLOWED_USER_ID ?? "";
  if (!channelSecret) {
    return NextResponse.json({ error: "LINE 剪藏入口尚未完成環境設定" }, { status: 503 });
  }

  const rawBody = await req.text();
  const signature = req.headers.get("x-line-signature") ?? "";
  if (!verifyLineSignature(rawBody, signature, channelSecret)) {
    return NextResponse.json({ error: "LINE 簽章驗證失敗" }, { status: 401 });
  }

  let body: LineWebhookBody;
  try { body = JSON.parse(rawBody) as LineWebhookBody; }
  catch { return NextResponse.json({ error: "LINE webhook JSON 格式錯誤" }, { status: 400 }); }

  try {
    for (const event of body.events ?? []) await handleEvent(event, allowedUserId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("LINE clipping webhook failed", error instanceof Error ? error.message : String(error));
    return NextResponse.json({ error: "LINE 剪藏處理失敗" }, { status: 500 });
  }
}
