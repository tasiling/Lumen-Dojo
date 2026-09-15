import { after, NextRequest, NextResponse } from "next/server";
import {
  appendCaptureImage,
  createCaptureEntry,
  listCaptureEntries,
  saveCaptureEntry,
} from "@/lib/dojo/captureStore";
import { analyzeEnglishImage } from "@/lib/dojo/englishImageAnalysis";
import {
  appendEnglishImageAttachment,
  createEnglishImageEntry,
  getEnglishImageEntry,
  listEnglishImageEntries,
  moveEnglishImageToCapture,
  routeEnglishImage,
  saveEnglishImageEntry,
  undoLatestEnglishImageMerge,
} from "@/lib/dojo/englishImageStore";
import { englishImageVocabCandidates, exportEnglishImageVocabs, listVocabForgeBooks, prepareEnglishImageForContextRoom, recommendedFocusDecks, PERMANENT_FOCUS_DECKS } from "@/lib/dojo/englishImageDispatch";
import {
  basicLineMenuQuickReply,
  captureImageQuickReply,
  clipQuickReply,
  contextRoomQuickReply,
  englishImageBookQuickReply,
  englishImageFocusDeckQuickReply,
  englishImageOrganizeQuickReply,
  englishImageSourceQuickReply,
  englishImageVocabQuickReply,
  extractFirstUrl,
  forageQuickReply,
  fetchLineImage,
  fetchWebPreview,
  imageBatchCollectQuickReply,
  imageDraftQuickReply,
  imageRouteQuickReply,
  normalizeClipUrl,
  platformFromUrl,
  replyLineMessage,
  verifyLineSignature,
  type LineWebhookBody,
  type LineWebhookEvent,
} from "@/lib/dojo/lineClipping";
import { CAPTURE_CLIP_PURPOSES, type CaptureClipMeta, type CaptureClipPurpose } from "@/lib/dojo/formal";
import type { EnglishImageEntry } from "@/lib/dojo/englishImage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const IMAGE_BATCH_WINDOW_MS = 30 * 60_000;
type ManualImageBatch = { entryId: string; expiresAt: number };
const manualImageBatches = new Map<string, ManualImageBatch>();
const imageSetLocks = new Map<string, Promise<void>>();

async function withImageSetLock(key: string, task: () => Promise<void>): Promise<void> {
  const previous = imageSetLocks.get(key) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(task);
  imageSetLocks.set(key, current);
  try { await current; }
  finally { if (imageSetLocks.get(key) === current) imageSetLocks.delete(key); }
}

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

function lineLearningSummary(entry: EnglishImageEntry, intro: string): string {
  const sections = [intro, entry.title ? `「${entry.title}」` : ""];
  if (entry.englishRecord) sections.push(`【${entry.route === "classroom" ? "課堂回答整理" : "英文事件紀錄"}】\n${entry.englishRecord.slice(0, 900)}`);
  if (entry.chineseExplanation) sections.push(`【中文理解】\n${entry.chineseExplanation.slice(0, 900)}`);
  if (entry.learningPhrases) sections.push(`【可學詞句】\n${entry.learningPhrases.slice(0, 1300)}`);
  if (entry.vocabularyWords) sections.push(`【單字候選】\n${entry.vocabularyWords.slice(0, 900)}`);
  if (entry.analysisStatus === "needs-review") sections.push(`⚠️ 需要確認：${entry.analysisReviewReason || "部分文字辨識信心較低"}`);
  sections.push("接下來可以補充、修正，或派送到學習系統。");
  return sections.filter(Boolean).join("\n\n");
}

function forageUrl(): string {
  const base = process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://lumen-dojo.up.railway.app";
  try { return new URL("/forage", base).toString(); }
  catch { return "https://lumen-dojo.up.railway.app/forage"; }
}

async function handleLineCommand(event: LineWebhookEvent, command: string): Promise<boolean> {
  const replyToken = event.replyToken ?? "";
  if (command === "野採圖片") {
    await replyLineMessage(replyToken, "如果圖片彼此相關，可以在相簿一次勾選多張送出。超過 10 張時 LINE 可能自行拆成多組，請先按「分次收一組」；即使一次選 23 張，也會收進同一筆，直到你按「完成這組」。", captureImageQuickReply());
    return true;
  }
  if (command === "剪藏網址" || command === "貼網址") {
    await replyLineMessage(replyToken, "請直接貼上完整網頁網址；也可以在同一則訊息補上一句收藏原因。\n\n例如：\nhttps://example.com\n喜歡這篇的觀點切入方式。", basicLineMenuQuickReply());
    return true;
  }
  if (command === "最近一筆") {
    const [images, captures] = await Promise.all([listEnglishImageEntries(), listCaptureEntries()]);
    const image = images[0];
    const capture = captures[0];
    if (!image && !capture) {
      await replyLineMessage(replyToken, "野採目前還沒有素材。可以先傳一張圖片或貼上一個網址。", captureImageQuickReply());
      return true;
    }
    if (image && (!capture || image.capturedAt >= capture.capturedAt)) {
      const status = image.route === "pending" ? "待分類" : image.analysisStatus === "completed" ? "AI 已完成" : image.analysisStatus === "needs-review" ? "需要確認" : "尚待整理";
      await replyLineMessage(replyToken, `最近一筆｜英文影像\n「${image.title}」\n${image.attachments.length} 張圖片\n狀態：${status}`, image.route === "pending" ? imageDraftQuickReply(image.id) : englishImageOrganizeQuickReply(image.id));
      return true;
    }
    if (capture) {
      await replyLineMessage(replyToken, `最近一筆｜一般素材\n「${capture.title}」\n${capture.sourceUrl || "圖片素材"}`, clipQuickReply(capture.id, capture.clip.attachments.length === 0 && Boolean(capture.sourceUrl)));
      return true;
    }
  }
  if (command === "待整理") {
    const [images, captures] = await Promise.all([listEnglishImageEntries(), listCaptureEntries()]);
    const pendingImages = images.filter((item) => item.status === "inbox").length;
    const pendingCaptures = captures.filter((item) => item.status === "pending").length;
    await replyLineMessage(replyToken, `野採目前共有 ${pendingImages + pendingCaptures} 筆待整理素材：\n\n英文影像：${pendingImages} 筆\n一般素材：${pendingCaptures} 筆`, forageQuickReply(forageUrl()));
    return true;
  }
  if (command === "豆倉") {
    try {
      const books = await listVocabForgeBooks({ forceRefresh: true });
      const counts = new Map(books.map((book) => [book.name, book.count]));
      const rows = PERMANENT_FOCUS_DECKS.map((name) => `・${name}（${counts.get(name) ?? 0}）`).join("\n");
      await replyLineMessage(replyToken, `VocabForge 六個常駐專注豆倉：\n\n${rows}\n\n作品名稱會另外保存為來源，不會再建立一本作品豆倉。要放入單字時，請先叫出「最近一筆」，再按「送 VocabForge」。`, basicLineMenuQuickReply());
    } catch (error) {
      await replyLineMessage(replyToken, `豆倉清單暫時無法讀取：${error instanceof Error ? error.message : String(error)}`, basicLineMenuQuickReply());
    }
    return true;
  }
  if (command === "幫助" || command === "選單") {
    await replyLineMessage(replyToken, [
      "行光野採｜LINE 指令",
      "",
      "野採圖片：單張、相簿多選，或分次收成一組",
      "剪藏網址：保存網頁與摘要",
      "最近一筆：叫回最近素材的整理按鈕",
      "待整理：查看野採待處理數量",
      "豆倉：查看 VocabForge 單字本",
      "幫助／選單：再次顯示這份說明",
    ].join("\n"), basicLineMenuQuickReply());
    return true;
  }
  return false;
}

async function handleText(event: LineWebhookEvent, userId: string): Promise<void> {
  const messageId = event.message?.id ?? "";
  const text = event.message?.text?.trim() ?? "";
  if (await handleLineCommand(event, text)) return;
  const foundUrl = extractFirstUrl(text);
  if (!foundUrl) {
    const images = await listEnglishImageEntries();
    const awaitingInput = images.find((entry) => entry.lineInputMode && entry.lineInputUntil && new Date(entry.lineInputUntil).getTime() > Date.now());
    if (awaitingInput) {
      if (awaitingInput.lineInputMode === "vocabSource") {
        const sourceName = text.slice(0, 300);
        const focusDecks = recommendedFocusDecks(awaitingInput, sourceName);
        const updated = await saveEnglishImageEntry({
          ...awaitingInput,
          lineInputMode: null,
          lineInputUntil: null,
          vocabForgeDraft: { sourceName, focusDecks, selectedKeys: [] },
        });
        await replyLineMessage(
          event.replyToken ?? "",
          `已記錄來源「${sourceName}」。系統先依作品與內容勾選建議分類；你可以保留或調整，最多兩個常駐豆倉。`,
          englishImageFocusDeckQuickReply(updated.id, focusDecks),
        );
        return;
      }
      const updated = await saveEnglishImageEntry(awaitingInput.lineInputMode === "context"
        ? { ...awaitingInput, contextNote: [awaitingInput.contextNote, text].filter(Boolean).join("\n"), lineInputMode: null, lineInputUntil: null }
        : { ...awaitingInput, ocrText: text, lineInputMode: null, lineInputUntil: null, analysisStatus: "needs-review", analysisReviewReason: "英文原文已由使用者修正；事件紀錄尚未重新產生。" });
      await replyLineMessage(
        event.replyToken ?? "",
        awaitingInput.lineInputMode === "context" ? "情境說明已補進這筆野採素材。" : "英文原文已修正並保存；需要時可再執行 AI 分析。",
        englishImageOrganizeQuickReply(updated.id),
      );
      return;
    }
    const recent = images.find((entry) =>
      entry.route !== "pending" && entry.awaitingContextUntil && new Date(entry.awaitingContextUntil).getTime() > Date.now()
    );
    if (recent) {
      await saveEnglishImageEntry({ ...recent, contextNote: [recent.contextNote, text].filter(Boolean).join("\n"), awaitingContextUntil: null });
      await replyLineMessage(event.replyToken ?? "", "情境說明已補進野採英文影像。AI 不會自動重跑；需要時可在影像匣按「重新分析」。", englishImageOrganizeQuickReply(recent.id));
      return;
    }
    await replyLineMessage(event.replyToken ?? "", "我目前沒有辨識到網址或操作指令。你可以直接傳圖片、貼網址，或從下方選擇功能。", basicLineMenuQuickReply());
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

async function handleImage(event: LineWebhookEvent, userId: string): Promise<void> {
  const messageId = event.message?.id ?? "";
  if (!messageId) throw new Error("LINE 圖片缺少 message id");
  const captures = await listCaptureEntries();
  const englishImages = await listEnglishImageEntries({ includeMerged: true });
  const duplicateCapture = captures.find((capture) => capture.clip.attachments.some((item) => item.sourceMessageId === messageId));
  const duplicateEnglish = englishImages.find((entry) => entry.externalMessageId === messageId || entry.attachments.some((attachment) => attachment.sourceMessageId === messageId));
  if (duplicateCapture) {
    await replyLineMessage(event.replyToken ?? "", `這張截圖已經保存於「${duplicateCapture.title}」。`, clipQuickReply(duplicateCapture.id, false));
    return;
  }
  if (duplicateEnglish) {
    const entryId = duplicateEnglish.mergedIntoId || duplicateEnglish.id;
    await replyLineMessage(event.replyToken ?? "", `這張圖片已經保存於野採英文影像「${duplicateEnglish.title}」。`, duplicateEnglish.route === "pending" ? imageDraftQuickReply(entryId) : englishImageOrganizeQuickReply(entryId));
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

  const rawImageSet = event.message?.imageSet;
  const imageSetId = rawImageSet?.id?.trim() ?? "";
  const imageSetIndex = Number.isFinite(rawImageSet?.index) ? Math.max(1, Math.floor(Number(rawImageSet?.index))) : null;
  const imageSetTotal = Number.isFinite(rawImageSet?.total) ? Math.max(1, Math.floor(Number(rawImageSet?.total))) : 0;

  // An explicitly opened batch takes precedence over LINE imageSet ids. LINE
  // commonly splits a single selection of more than ten images into several
  // image sets; the explicit user action is the reliable grouping boundary.
  const manualBatch = manualImageBatches.get(userId);
  if (manualBatch && manualBatch.expiresAt > Date.now()) {
    await withImageSetLock(`manual:${userId}`, async () => {
      const currentBatch = manualImageBatches.get(userId) ?? manualBatch;
      let entry: EnglishImageEntry | null = null;
      if (currentBatch.entryId) {
        try { entry = (await getEnglishImageEntry(currentBatch.entryId)).entry; }
        catch { entry = null; }
      }
      if (entry) {
        entry = await appendEnglishImageAttachment({
          entry,
          bytes: image.bytes,
          mimeType: image.mimeType,
          filename: imageFilename(messageId, image.mimeType),
          sourceMessageId: messageId,
        });
      } else {
        entry = await createEnglishImageEntry({
          bytes: image.bytes,
          mimeType: image.mimeType,
          filename: imageFilename(messageId, image.mimeType),
          sourceMessageId: messageId,
          externalEventId: event.webhookEventId ?? "",
          lineBatchState: "open",
          lineBatchUntil: new Date(Date.now() + IMAGE_BATCH_WINDOW_MS).toISOString(),
        });
      }
      const expiresAt = Date.now() + IMAGE_BATCH_WINDOW_MS;
      entry = await saveEnglishImageEntry({ ...entry, lineBatchState: "open", lineBatchUntil: new Date(expiresAt).toISOString() });
      manualImageBatches.set(userId, { entryId: entry.id, expiresAt });

      // Keep LINE quiet while it is still delivering one native image set.
      // A progress message at each native set boundary keeps the finish button
      // available without replying once per image.
      const reachedNativeSetEnd = !imageSetId || imageSetTotal <= 1 || (imageSetIndex ?? 0) >= imageSetTotal;
      if (reachedNativeSetEnd) {
        await replyLineMessage(event.replyToken ?? "", `已加入目前圖片組，現在共有 ${entry.attachments.length} 張。全部傳完後請按「完成這組」。`, imageBatchCollectQuickReply(entry.id));
      }
    });
    return;
  }
  manualImageBatches.delete(userId);

  if (imageSetId && imageSetTotal > 1) {
    await withImageSetLock(imageSetId, async () => {
      const currentEntries = await listEnglishImageEntries({ includeMerged: true });
      let entry = currentEntries.find((item) => item.lineImageSetId === imageSetId && !item.mergedIntoId);
      if (entry) {
        entry = await appendEnglishImageAttachment({
          entry,
          bytes: image.bytes,
          mimeType: image.mimeType,
          filename: imageFilename(messageId, image.mimeType),
          sourceMessageId: messageId,
          batchIndex: imageSetIndex,
        });
      } else {
        entry = await createEnglishImageEntry({
          bytes: image.bytes,
          mimeType: image.mimeType,
          filename: imageFilename(messageId, image.mimeType),
          sourceMessageId: messageId,
          externalEventId: event.webhookEventId ?? "",
          batchIndex: imageSetIndex,
          lineImageSetId: imageSetId,
          lineImageSetTotal: imageSetTotal,
          lineBatchState: "open",
          lineBatchUntil: new Date(Date.now() + IMAGE_BATCH_WINDOW_MS).toISOString(),
        });
      }
      if (entry.attachments.length >= imageSetTotal) {
        entry = await saveEnglishImageEntry({ ...entry, lineBatchState: "closed", lineBatchUntil: null });
        await replyLineMessage(event.replyToken ?? "", `已收到完整圖片組，共 ${entry.attachments.length} 張。請選擇這組素材的類型；選擇後才會開始 AI 分析。`, imageDraftQuickReply(entry.id));
      }
    });
    return;
  }

  const entry = await createEnglishImageEntry({
    bytes: image.bytes,
    mimeType: image.mimeType,
    filename: imageFilename(messageId, image.mimeType),
    sourceMessageId: messageId,
    externalEventId: event.webhookEventId ?? "",
    lineBatchState: "closed",
  });
  await replyLineMessage(event.replyToken ?? "", "圖片已獨立保存到野採。若還有相關畫面，請按「繼續補這組」；否則直接選擇素材類型。系統不會再自動合併上一張。", imageDraftQuickReply(entry.id));
}

async function handlePostback(event: LineWebhookEvent, userId: string): Promise<void> {
  const params = new URLSearchParams(event.postback?.data ?? "");
  const action = params.get("action");
  if (action === "imageBatchStart") {
    manualImageBatches.set(userId, { entryId: "", expiresAt: Date.now() + IMAGE_BATCH_WINDOW_MS });
    await replyLineMessage(event.replyToken ?? "", "已開啟新的大型圖片組（30 分鐘）。接下來即使 LINE 把一次選取拆成數批，也會加入同一筆；全部傳完後按「完成這組」。", imageBatchCollectQuickReply());
    return;
  }
  if (action === "imageBatchCancel") {
    manualImageBatches.delete(userId);
    await replyLineMessage(event.replyToken ?? "", "已停止收圖，尚未上傳任何圖片。", basicLineMenuQuickReply());
    return;
  }
  if (action?.startsWith("image") && action !== "imageRoute") {
    const entryId = params.get("entryId") ?? "";
    if (!entryId) return;
    let entry;
    try { entry = (await getEnglishImageEntry(entryId)).entry; }
    catch {
      await replyLineMessage(event.replyToken ?? "", "找不到這筆英文影像，可能已經被移動或移除。");
      return;
    }
    if (action === "imageBatchContinue") {
      const expiresAt = Date.now() + IMAGE_BATCH_WINDOW_MS;
      const updated = await saveEnglishImageEntry({ ...entry, lineBatchState: "open", lineBatchUntil: new Date(expiresAt).toISOString() });
      manualImageBatches.set(userId, { entryId: updated.id, expiresAt });
      await replyLineMessage(event.replyToken ?? "", `已開啟「${updated.title}」的補圖模式，目前 ${updated.attachments.length} 張。接下來只會加入這一組。`, imageBatchCollectQuickReply(updated.id));
      return;
    }
    if (action === "imageBatchFinish") {
      const updated = await saveEnglishImageEntry({ ...entry, lineBatchState: "closed", lineBatchUntil: null });
      manualImageBatches.delete(userId);
      await replyLineMessage(event.replyToken ?? "", `這組已完成，共 ${updated.attachments.length} 張。請選擇素材類型；選擇後才會開始 AI 分析。`, imageDraftQuickReply(updated.id));
      return;
    }
    if (action === "imageInput") {
      const mode = params.get("mode");
      if (mode !== "context" && mode !== "ocr") return;
      await saveEnglishImageEntry({ ...entry, lineInputMode: mode, lineInputUntil: new Date(Date.now() + 10 * 60_000).toISOString() });
      await replyLineMessage(event.replyToken ?? "", mode === "context" ? "請在十分鐘內傳送情境說明；我會補進這筆素材。" : "請在十分鐘內傳送正確的英文原文；這次輸入會取代目前 OCR 文字。");
      return;
    }
    if (action === "imageAnalyze") {
      if (entry.route === "pending") {
        await replyLineMessage(event.replyToken ?? "", "請先選擇遊戲英文、英文日常或課堂英文。", imageRouteQuickReply(entry.id));
        return;
      }
      const analyzed = await analyzeEnglishImage(entry.id, { force: true });
      const summary = analyzed.analysisStatus === "completed" || analyzed.analysisStatus === "needs-review"
        ? lineLearningSummary(analyzed, "重新分析完成｜野採英文影像")
        : `重新分析尚未完成：${analyzed.analysisError || "請稍後再試"}`;
      await replyLineMessage(event.replyToken ?? "", summary, englishImageOrganizeQuickReply(analyzed.id));
      return;
    }
    if (action === "imageUndoMerge") {
      try {
        const result = await undoLatestEnglishImageMerge(entry);
        await replyLineMessage(event.replyToken ?? "", `已撤銷最近一次誤合併。\n「${result.parent.title}」保留 ${result.parent.attachments.length} 張；另一筆 ${result.restored.attachments.length} 張圖片已恢復為獨立素材。`, result.parent.route === "pending" ? imageDraftQuickReply(result.parent.id) : englishImageOrganizeQuickReply(result.parent.id));
      } catch (error) {
        await replyLineMessage(event.replyToken ?? "", error instanceof Error ? error.message : "無法撤銷圖片合併");
      }
      return;
    }
    if (action === "imageKeep") {
      await replyLineMessage(event.replyToken ?? "", "已保留在野採；你可以之後再回來整理。");
      return;
    }
    if (action === "imageDispatch") {
      const target = params.get("target");
      if (target !== "context" && target !== "vocab" && target !== "both") return;
      try {
        let current = entry;
        if (target === "context" || target === "both") current = await prepareEnglishImageForContextRoom(current.id);
        if (target === "vocab" || target === "both") {
          const candidates = englishImageVocabCandidates(current);
          if (!candidates.length) {
            await replyLineMessage(event.replyToken ?? "", "目前沒有適合送入 VocabForge 的單字。可以先修正內容或重新分析。", target === "both" ? contextRoomQuickReply(current.id, current.contextRoomUrl) : englishImageOrganizeQuickReply(current.id));
            return;
          }
          if (current.route === "game" && !current.vocabForgeDraft.sourceName) {
            await replyLineMessage(
              event.replyToken ?? "",
              `${target === "both" ? "語境素材已備妥。" : ""}送出前先確認作品名稱。作品會成為「目前主玩」的來源篩選，不會另外建立豆倉。`,
              englishImageSourceQuickReply(current.id, current.sourceLabel),
            );
            return;
          }
          const sourceName = current.vocabForgeDraft.sourceName || current.sourceLabel || (current.route === "classroom" ? "本期課堂" : "英文日常");
          const focusDecks = current.vocabForgeDraft.focusDecks.length
            ? current.vocabForgeDraft.focusDecks
            : recommendedFocusDecks(current, sourceName);
          current = await saveEnglishImageEntry({
            ...current,
            vocabForgeDraft: { sourceName, focusDecks, selectedKeys: [] },
          });
          await replyLineMessage(
            event.replyToken ?? "",
            `${target === "both" ? "語境素材已備妥。" : ""}系統已先勾選建議分類。請確認或調整常駐豆倉，最多兩個。`,
            englishImageFocusDeckQuickReply(current.id, focusDecks),
          );
          return;
        }
        await replyLineMessage(event.replyToken ?? "", "語境素材已備妥。開啟語境修習室後可繼續建立修習專案；野採母紀錄會保留。", contextRoomQuickReply(current.id, current.contextRoomUrl));
      } catch (error) {
        await replyLineMessage(event.replyToken ?? "", `派送尚未完成：${error instanceof Error ? error.message : String(error)}`, englishImageOrganizeQuickReply(entry.id));
      }
      return;
    }
    if (action === "imageVocabSourceInput") {
      await saveEnglishImageEntry({ ...entry, lineInputMode: "vocabSource", lineInputUntil: new Date(Date.now() + 10 * 60_000).toISOString() });
      await replyLineMessage(event.replyToken ?? "", "請在十分鐘內直接輸入遊戲或作品名稱，例如 Dragon Quest V。它只會成為來源，不會建立新豆倉。");
      return;
    }
    if (action === "imageVocabSource") {
      const sourceName = params.get("source")?.trim().slice(0, 300) ?? "";
      if (!sourceName) return;
      const focusDecks = recommendedFocusDecks(entry, sourceName);
      const updated = await saveEnglishImageEntry({
        ...entry,
        vocabForgeDraft: { sourceName, focusDecks, selectedKeys: [] },
      });
      await replyLineMessage(
        event.replyToken ?? "",
        `來源是「${sourceName}」。系統先勾選建議分類；你可以保留或調整，最多兩個常駐豆倉。`,
        englishImageFocusDeckQuickReply(updated.id, focusDecks),
      );
      return;
    }
    if (action === "imageVocabDeck") {
      const deck = params.get("deck")?.trim() ?? "";
      if (!PERMANENT_FOCUS_DECKS.includes(deck as typeof PERMANENT_FOCUS_DECKS[number])) return;
      const current = entry.vocabForgeDraft.focusDecks;
      const focusDecks = current.includes(deck) ? current.filter((name) => name !== deck) : [...current, deck];
      if (focusDecks.length > 2) {
        await replyLineMessage(event.replyToken ?? "", "一次最多選兩個常駐豆倉；請先取消一個再新增。", englishImageFocusDeckQuickReply(entry.id, current));
        return;
      }
      const updated = await saveEnglishImageEntry({ ...entry, vocabForgeDraft: { ...entry.vocabForgeDraft, focusDecks } });
      await replyLineMessage(event.replyToken ?? "", `目前分類：${focusDecks.length ? focusDecks.join("＋") : "尚未選擇"}`, englishImageFocusDeckQuickReply(updated.id, focusDecks));
      return;
    }
    if (action === "imageVocabDeckConfirm") {
      if (!entry.vocabForgeDraft.focusDecks.length) {
        await replyLineMessage(event.replyToken ?? "", "請至少選一個常駐豆倉。", englishImageFocusDeckQuickReply(entry.id, []));
        return;
      }
      const candidates = englishImageVocabCandidates(entry);
      const exportedKeys = entry.vocabForgeExports.map((item) => item.key);
      await replyLineMessage(
        event.replyToken ?? "",
        `分類：${entry.vocabForgeDraft.focusDecks.join("＋")}\n來源：${entry.vocabForgeDraft.sourceName || "未特別標示"}\n\n請先勾選 1–5 個單字，確認後才會一次送出。按鈕後方是 AI 建議的 CEFR；「?」代表待確認。`,
        englishImageVocabQuickReply(entry.id, candidates, entry.vocabForgeDraft.selectedKeys, exportedKeys, entry.contextRoomUrl),
      );
      return;
    }
    if (action === "imageVocabBooks") {
      try {
        const books = await listVocabForgeBooks({ forceRefresh: true });
        const requestedPage = Number(params.get("page") ?? 0);
        const page = Number.isFinite(requestedPage) ? Math.max(0, Math.floor(requestedPage)) : 0;
        await replyLineMessage(event.replyToken ?? "", `請選擇要放入的豆倉（第 ${page + 1} 頁）。`, englishImageBookQuickReply(entry.id, books, page));
      } catch (error) {
        await replyLineMessage(event.replyToken ?? "", `豆倉清單暫時無法讀取：${error instanceof Error ? error.message : String(error)}`, englishImageOrganizeQuickReply(entry.id));
      }
      return;
    }
    if (action === "imageVocabBook") {
      const vocabBook = params.get("book")?.trim() ?? "";
      try {
        const candidates = englishImageVocabCandidates(entry);
        if (!candidates.length) throw new Error("目前沒有適合送入 VocabForge 的單字");
        const sourceName = entry.vocabForgeDraft.sourceName || entry.sourceLabel;
        const focusDecks = PERMANENT_FOCUS_DECKS.includes(vocabBook as typeof PERMANENT_FOCUS_DECKS[number])
          ? [vocabBook]
          : recommendedFocusDecks(entry, sourceName);
        const updated = await saveEnglishImageEntry({ ...entry, vocabForgeDraft: { sourceName, focusDecks, selectedKeys: [] } });
        await replyLineMessage(
          event.replyToken ?? "",
          `這是舊版豆倉按鈕。已保留來源並轉成目前的常駐分類「${focusDecks.join("＋")}」；請勾選單字，確認後才會送出。`,
          englishImageVocabQuickReply(updated.id, candidates, [], entry.vocabForgeExports.map((item) => item.key), entry.contextRoomUrl),
        );
      } catch (error) {
        await replyLineMessage(event.replyToken ?? "", `無法開始挑選單字：${error instanceof Error ? error.message : String(error)}`, englishImageOrganizeQuickReply(entry.id));
      }
      return;
    }
    if (action === "imageVocab") {
      const key = params.get("key") ?? "";
      const vocabBook = params.get("book")?.trim() ?? "";
      try {
        const candidates = englishImageVocabCandidates(entry);
        if (!candidates.some((candidate) => candidate.key === key)) throw new Error("找不到這個候選單字");
        const sourceName = entry.vocabForgeDraft.sourceName || entry.sourceLabel;
        const focusDecks = PERMANENT_FOCUS_DECKS.includes(vocabBook as typeof PERMANENT_FOCUS_DECKS[number])
          ? [vocabBook]
          : recommendedFocusDecks(entry, sourceName);
        const updated = await saveEnglishImageEntry({
          ...entry,
          vocabForgeDraft: { sourceName, focusDecks, selectedKeys: [key] },
        });
        await replyLineMessage(
          event.replyToken ?? "",
          "這是先前訊息中的舊版單字按鈕。已替你勾選，但尚未送出；請在下方確認送出，避免誤觸就建立單字。",
          englishImageVocabQuickReply(updated.id, candidates, [key], updated.vocabForgeExports.map((item) => item.key), updated.contextRoomUrl),
        );
      } catch (error) {
        await replyLineMessage(event.replyToken ?? "", `VocabForge 尚未接收：${error instanceof Error ? error.message : String(error)}`, englishImageOrganizeQuickReply(entry.id));
      }
      return;
    }
    if (action === "imageVocabToggle") {
      const key = params.get("key") ?? "";
      try {
        const candidates = englishImageVocabCandidates(entry);
        if (!candidates.some((candidate) => candidate.key === key)) throw new Error("找不到這個候選單字");
        const current = entry.vocabForgeDraft.selectedKeys;
        const selectedKeys = current.includes(key) ? current.filter((value) => value !== key) : [...current, key];
        if (selectedKeys.length > 5) throw new Error("每筆素材最多選五個單字");
        const updated = await saveEnglishImageEntry({ ...entry, vocabForgeDraft: { ...entry.vocabForgeDraft, selectedKeys } });
        await replyLineMessage(event.replyToken ?? "", `已勾選 ${selectedKeys.length} 個單字；尚未送出。`, englishImageVocabQuickReply(updated.id, candidates, selectedKeys, updated.vocabForgeExports.map((item) => item.key), updated.contextRoomUrl));
      } catch (error) {
        await replyLineMessage(event.replyToken ?? "", `VocabForge 尚未接收：${error instanceof Error ? error.message : String(error)}`, englishImageOrganizeQuickReply(entry.id));
      }
      return;
    }
    if (action === "imageVocabConfirm") {
      try {
        const { focusDecks, sourceName, selectedKeys } = entry.vocabForgeDraft;
        if (!focusDecks.length) throw new Error("請先確認常駐豆倉");
        if (!selectedKeys.length) throw new Error("請先勾選至少一個單字");
        const result = await exportEnglishImageVocabs(entry.id, selectedKeys, focusDecks[0], { focusDecks, sourceName });
        const imported = result.exports.map((item) => `${item.expression}（${item.cefrLevel}）`).join("、");
        const updated = await saveEnglishImageEntry({ ...result.entry, vocabForgeDraft: { ...result.entry.vocabForgeDraft, selectedKeys: [] } });
        await replyLineMessage(
          event.replyToken ?? "",
          `已確認送出 ${result.exports.length} 字：${imported}\n\n來源：${sourceName || "未特別標示"}\n專注豆倉：${focusDecks.join("＋")}\n既有單字會追加這次遇見，不會重設複習進度。`,
          englishImageVocabQuickReply(updated.id, englishImageVocabCandidates(updated), [], updated.vocabForgeExports.map((item) => item.key), updated.contextRoomUrl),
        );
      } catch (error) {
        await replyLineMessage(event.replyToken ?? "", `VocabForge 尚未接收：${error instanceof Error ? error.message : String(error)}`, englishImageOrganizeQuickReply(entry.id));
      }
      return;
    }
  }
  if (params.get("action") === "imageRoute") {
    const entryId = params.get("entryId") ?? "";
    const route = params.get("route");
    const images = await listEnglishImageEntries();
    const entry = images.find((item) => item.id === entryId);
    if (!entry) {
      await replyLineMessage(event.replyToken ?? "", "找不到這筆英文影像，可能已經被移動或移除。");
      return;
    }
    manualImageBatches.delete(userId);
    if (route === "capture") {
      const capture = await moveEnglishImageToCapture(entry);
      await replyLineMessage(event.replyToken ?? "", "已轉成一般素材，並留在野採採集匣。", clipQuickReply(capture.id, false));
      return;
    }
    if (route === "game" || route === "daily" || route === "classroom") {
      const routed = await routeEnglishImage(entry, route);
      const analyzed = await analyzeEnglishImage(routed.id);
      const label = route === "game" ? "遊戲英文" : route === "classroom" ? "課堂英文" : "英文日常";
      if (analyzed.analysisStatus === "completed" || analyzed.analysisStatus === "needs-review") {
        await replyLineMessage(event.replyToken ?? "", lineLearningSummary(analyzed, `已放進「${label}」並完成 AI 整理`), englishImageOrganizeQuickReply(analyzed.id));
      } else {
        await replyLineMessage(event.replyToken ?? "", `已放進「${label}」，原圖已保存。\nAI 暫時未完成：${analyzed.analysisError || "稍後可在英文影像匣重新分析"}`, englishImageOrganizeQuickReply(analyzed.id));
      }
      return;
    }
    return;
  }
  const captureId = params.get("captureId") ?? "";
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
  if (event.type === "message" && event.message?.type === "image") return handleImage(event, userId);
  if (event.type === "postback") return handlePostback(event, userId);
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

  // LINE expects the webhook endpoint to acknowledge receipt within about two
  // seconds. Image analysis and external integrations can take longer, so keep
  // the work alive after the HTTP response has already been returned.
  after(async () => {
    try {
      for (const event of body.events ?? []) await handleEvent(event, allowedUserId);
    } catch (error) {
      console.error("LINE clipping webhook background processing failed", error instanceof Error ? error.message : String(error));
    }
  });

  return NextResponse.json({ ok: true });
}
