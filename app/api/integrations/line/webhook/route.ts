import { readThreadsPostDetailed, threadsFailureLine, threadsPostUrl, threadsReplyStatus } from "@/lib/dojo/threadsReader";
import { fileCaptureTitle, fileSourceLabel } from "@/lib/dojo/douyin/fileOffer";
import { douyinStatusLine } from "@/lib/dojo/douyin/lineStatus";
import { douyinQueue } from "@/lib/dojo/douyin/queue.mjs";
import { kickTranscriptSync } from "@/lib/dojo/douyin/transcriptSync";
import { InputError, readShare as readDouyinShare, sourceUrl as douyinSourceUrl } from "@/lib/dojo/douyin/share.mjs";
import { after, NextRequest, NextResponse } from "next/server";
import {
  appendCaptureImage,
  createCaptureEntry,
  listCaptureEntries,
  updateCaptureEntry,
  saveCaptureInitialReflection,
  saveCaptureEntry,
} from "@/lib/dojo/captureStore";
import { readLineImageBatch, setLineImageBatch, withLineImageBatchLock } from "@/lib/dojo/lineImageBatch";
import { randomUUID } from "node:crypto";
import { receiveLinePages } from "@/lib/reading/clipStore";
import { analyzeEnglishImage } from "@/lib/dojo/englishImageAnalysis";
import { autoBuildContextUnit } from "@/lib/dojo/englishImageAutoUnit";
import { readCaptureImageText } from "@/lib/dojo/captureImageReader";
import { saveThreadsImages } from "@/lib/dojo/threadsImageSaver";
import { autoUnitLineReport, autoUnitStatusLabel, type AutoUnitProject } from "@/lib/dojo/englishImageAutoUnitPlan";
import {
  appendEnglishImageAttachment,
  createEnglishImageEntry,
  getEnglishImageEntry,
  listEnglishImageEntries,
  moveEnglishImageToCapture,
  routeEnglishImage,
  saveEnglishImageEntry,
  updateEnglishImageEntry,
  undoLatestEnglishImageMerge,
} from "@/lib/dojo/englishImageStore";
import { routingEntryUrl, normalizeRoutingSelection } from "@/lib/dojo/englishImageRouting";
import { englishImageVocabCandidates, exportEnglishImageVocabs, listVocabForgeBooks, recommendedFocusDecks, PERMANENT_FOCUS_DECKS } from "@/lib/dojo/englishImageDispatch";
import {
  basicLineMenuQuickReply,
  captureImageQuickReply,
  captureScreenshotQuickReply,
  clipQuickReply,
  contextRoomQuickReply,
  englishImageBookQuickReply,
  englishImageFocusDeckQuickReply,
  englishImageOrganizeQuickReply,
  englishImageUnitQuickReply,
  englishImageVocabQuickReply,
  extractFirstUrl,
  forageQuickReply,
  fetchLineImage,
  fetchWebPreview,
  imageBatchCollectQuickReply,
  imageDraftQuickReply,
  imageRouteQuickReply,
  readingClipQuickReply,
  normalizeClipUrl,
  platformFromUrl,
  replyLineMessage,
  verifyLineSignature,
  type LineWebhookBody,
  type LineWebhookEvent,
} from "@/lib/dojo/lineClipping";
import { CAPTURE_CLIP_PURPOSES, type CaptureClipMeta, type CaptureClipPurpose } from "@/lib/dojo/formal";
import {
  englishImageRouteLabel,
  isEnglishImageLearningRoute,
  type EnglishImageEntry,
} from "@/lib/dojo/englishImage";
import { bankImageRoute,bankIntegrationEnabled,bankSummary,receivePerformance,processBankImage,receiveBankImage,setBankMode,wealthInboxUrl,type BankIntake } from "@/lib/dojo/wealthBank";
import {isPerformanceText,parsePerformanceText,performanceReply} from "@/lib/dojo/wealthPerformance";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const IMAGE_BATCH_WINDOW_MS = 30 * 60_000;
const lineWriteLocks = new Map<string, Promise<void>>();

async function withLineWriteLock(key: string, task: () => Promise<void>): Promise<void> {
  const previous = lineWriteLocks.get(key) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(task);
  lineWriteLocks.set(key, current);
  try { await current; }
  finally { if (lineWriteLocks.get(key) === current) lineWriteLocks.delete(key); }
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
    awaitingReflectionUntil: null,
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
  const game = entry.route === "game" ? entry.gameLearning : undefined;
  if (entry.route === "game" && entry.gameLearningMode === "interface" && !game?.screens.length) {
    return [intro, "逐圖介面資訊尚待辨識，可按「重新分析」再試一次。"].join("\n\n");
  }
  if (game && game.kind !== "story" && game.screens.length) {
    for (const screen of [...game.screens].sort((a, b) => a.index - b.index)) {
      const lines = [`圖 ${screen.index}｜${screen.title || (screen.kind === "interface" ? "遊戲介面" : "劇情／對白")}`];
      for (const label of screen.labels) {
        if (label.text) lines.push(label.meaning ? `${label.text} → ${label.meaning}` : label.text);
      }
      if (screen.kind === "interface") {
        if (screen.operation) lines.push(`操作：${screen.operation}`);
        if (screen.restriction) lines.push(`限制：${screen.restriction}`);
        if (screen.consequence) lines.push(`可能結果：${screen.consequence}`);
      }
      if (screen.evidence) lines.push(`畫面線索：${screen.evidence}`);
      if (screen.unit) lines.push(`學習重點：${screen.unit}`);
      sections.push(lines.join("\n"));
    }
    if (entry.analysisStatus === "needs-review") sections.push(`需要確認：${entry.analysisReviewReason || "部分畫面資訊尚待核對"}`);
    return sections.filter(Boolean).join("\n\n");
  }
  const recordLabel = entry.route === "classroom" ? "課堂回答整理" : entry.route === "reading" ? "英文閱讀摘要" : "英文事件紀錄";
  if (entry.englishRecord) sections.push(`【${recordLabel}】\n${entry.englishRecord.slice(0, 900)}`);
  if (entry.chineseExplanation) sections.push(`【中文理解】\n${entry.chineseExplanation.slice(0, 900)}`);
  if (entry.learningPhrases) sections.push(`【可學詞句】\n${entry.learningPhrases.slice(0, 1300)}`);
  if (entry.vocabularyWords) sections.push(`【單字候選】\n${entry.vocabularyWords.slice(0, 900)}`);
  if (entry.analysisStatus === "needs-review") sections.push(`⚠️ 需要確認：${entry.analysisReviewReason || "部分文字辨識信心較低"}`);
  if (entry.contextRoomAuto?.status !== "built") sections.push("接下來可以補充、修正，或派送到學習系統。");
  return sections.filter(Boolean).join("\n\n");
}

function unitQuickReply(entry: EnglishImageEntry, projects: AutoUnitProject[] = []) {
  const auto = entry.contextRoomAuto;
  if (!auto) return englishImageOrganizeQuickReply(entry.id, entry.route);
  return englishImageUnitQuickReply({
    entryId: entry.id, route: entry.route, status: auto.status, contextRoomUrl: entry.contextRoomUrl,
    manualUrl: routingEntryUrl(forageUrl(entry.id), entry.id, "context"), projects,
  });
}

/**
 * Build the learning unit right after analysis and say plainly what happened.
 * The unit report leads the message; the analysis summary follows as detail.
 */
async function replyWithLearningUnit(event: LineWebhookEvent, analyzed: EnglishImageEntry, summary: (entry: EnglishImageEntry) => string, choice: { projectId?: string; projectTitle?: string } = {}) {
  let built: Awaited<ReturnType<typeof autoBuildContextUnit>>;
  try { built = await autoBuildContextUnit(analyzed.id, choice); }
  catch (error) {
    console.error("LINE auto unit failed", analyzed.id, error instanceof Error ? error.message : String(error));
    await replyImage(event, [`⚠️ 學習單元尚未建立\n原因：${error instanceof Error ? error.message : "系統暫時無法處理"}\n原圖與 AI 整理都已保存，可按「建立學習單元」再試一次。`, summary(analyzed)].filter(Boolean).join("\n\n———\n\n"), englishImageOrganizeQuickReply(analyzed.id, analyzed.route));
    return;
  }
  const report = autoUnitLineReport(built.entry.contextRoomAuto);
  await replyImage(event, [report, summary(built.entry)].filter(Boolean).join("\n\n———\n\n"), unitQuickReply(built.entry, built.projects));
}

function forageUrl(englishImageId = ""): string {
  const base = process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://lumen-dojo.up.railway.app";
  try {
    const url = new URL("/forage", base);
    if (englishImageId) url.searchParams.set("englishImageId", englishImageId);
    return url.toString();
  }
  catch { return "https://lumen-dojo.up.railway.app/forage"; }
}

async function handleLineCommand(event: LineWebhookEvent, command: string): Promise<boolean> {
  const replyToken = event.replyToken ?? "";
  const userId = event.source?.userId ?? "";
  if (command === "銀行記帳") {
    if (!bankIntegrationEnabled()) {
      await replyLineMessage(replyToken, "銀行記帳目前尚未啟用。一般野採與英文圖片仍可照常使用。", basicLineMenuQuickReply());
      return true;
    }
    await setBankMode(userId, "bank");
    await replyLineMessage(replyToken, "銀行記帳模式已開啟 30 分鐘。接下來的銀行截圖只會送往財富豐盛記錄本，不會進入野採、英文影像匣或 Notion。完成後請按「結束銀行記帳」。", basicLineMenuQuickReply());
    return true;
  }
  if (command === "結束銀行記帳") {
    if (!bankIntegrationEnabled()) {
      await replyLineMessage(replyToken, "銀行記帳目前沒有啟用；圖片會維持原本的野採流程。", basicLineMenuQuickReply());
      return true;
    }
    await setBankMode(userId, "off");
    await replyLineMessage(replyToken, "已結束銀行記帳模式。之後的圖片會恢復原本的野採流程。", basicLineMenuQuickReply());
    return true;
  }
  if (command === "野採圖片") {
    await replyLineMessage(replyToken, "如果圖片彼此相關，可以在相簿一次勾選多張送出。超過 10 張時 LINE 可能自行拆成多組，請先按「分次收一組」；即使一次選 23 張，也會收進同一筆，直到你按「完成這組」。", captureImageQuickReply());
    return true;
  }
  if (command === "剪藏網址" || command === "貼網址") {
    await replyLineMessage(replyToken, "請直接貼上完整網頁網址；也可以在同一則訊息補上一句收藏原因。\n\n例如：\nhttps://example.com\n喜歡這篇的觀點切入方式。", basicLineMenuQuickReply());
    return true;
  }
  if (command === "最近一筆") {
    const [images, captures, batch] = await Promise.all([
      listEnglishImageEntries({includeReadingClips:true}), listCaptureEntries(), readLineImageBatch(userId),
    ]);
    const activeImage = batch?.entryId ? images.find(item => item.id === batch.entryId && item.lineBatchState === "open") : undefined;
    const image = activeImage || images[0];
    const capture = captures[0];
    if (!image && !capture) {
      await replyLineMessage(replyToken, "野採目前還沒有素材。可以先傳一張圖片或貼上一個網址。", captureImageQuickReply());
      return true;
    }
    if (image && (activeImage || !capture || image.capturedAt >= capture.capturedAt)) {
      const { entry: saved } = await getEnglishImageEntry(image.id);
      if (saved.readingClip) {
        await replyImage(event,"最近一筆是心知閱讀截圖，可開啟這組書頁繼續核對。",readingClipQuickReply(saved.id));
        return true;
      }
      const status = saved.route === "pending" ? "待分類" : saved.analysisStatus === "completed" ? "AI 已完成" : saved.analysisStatus === "needs-review" ? "需要確認" : "尚待整理";
      await replyImage(event, `最近一筆｜英文影像\n「${saved.title}」\n${saved.attachments.length} 張圖片\n狀態：${status}${saved.route === "pending" ? "" : `\n學習單元：${autoUnitStatusLabel(saved)}`}`, activeImage ? imageBatchCollectQuickReply(saved.id) : saved.route === "pending" ? imageDraftQuickReply(saved.id) : unitQuickReply(saved));
      return true;
    }
    if (capture) {
      await replyLineMessage(replyToken, `最近一筆｜一般素材\n「${capture.title}」\n${capture.sourceUrl || "圖片素材"}${douyinStatusFor(capture.id)}`, clipQuickReply(capture.id, capture.clip.attachments.length === 0 && Boolean(capture.sourceUrl)));
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
      "銀行記帳：暫時把銀行截圖安全送往財富帳本",
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
    const captures = await listCaptureEntries();
    const awaitingReflection = captures.find((capture) =>
      capture.clip.origin === "line" && capture.clip.awaitingReflectionUntil &&
      new Date(capture.clip.awaitingReflectionUntil).getTime() > Date.now()
    );
    if (awaitingReflection) {
      const updated = await saveCaptureInitialReflection(awaitingReflection.id, text, true);
      await replyLineMessage(
        event.replyToken ?? "",
        `已把這段感觸留在「${updated.title}」。最初原因會與之後的探索紀錄分開保存。`,
        clipQuickReply(updated.id, updated.clip.attachments.length === 0 && Boolean(updated.sourceUrl)),
      );
      return;
    }
    const images = await listEnglishImageEntries();
    const awaitingInput = images.find((entry) => entry.lineInputMode && entry.lineInputUntil && new Date(entry.lineInputUntil).getTime() > Date.now());
    if (awaitingInput) {
      if (awaitingInput.lineInputMode === "unitSource") {
        await replyWithLearningUnit(event, awaitingInput, () => "", { projectTitle: text.slice(0, 300) });
        return;
      }
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
        englishImageOrganizeQuickReply(updated.id, updated.route),
      );
      return;
    }
    const recent = images.find((entry) =>
      entry.route !== "pending" && entry.awaitingContextUntil && new Date(entry.awaitingContextUntil).getTime() > Date.now()
    );
    if (recent) {
      await saveEnglishImageEntry({ ...recent, contextNote: [recent.contextNote, text].filter(Boolean).join("\n"), awaitingContextUntil: null });
      await replyLineMessage(event.replyToken ?? "", "情境說明已補進野採英文影像。AI 不會自動重跑；需要時可在影像匣按「重新分析」。", englishImageOrganizeQuickReply(recent.id, recent.route));
      return;
    }
    await replyLineMessage(event.replyToken ?? "", "我目前沒有辨識到網址或操作指令。你可以直接傳圖片、貼網址，或從下方選擇功能。", basicLineMenuQuickReply());
    return;
  }

  if (douyinSourceUrl(foundUrl)) {
    try { await withLineWriteLock(`douyin:${userId}`, () => handleDouyinShare(event, text)); }
    catch {
      await replyLineMessage(event.replyToken ?? "", "這支抖音影片暫時未能排入轉錄，請再貼一次。", basicLineMenuQuickReply());
    }
    return;
  }

  const sourceUrl = normalizeClipUrl(foundUrl);
  const captures = await listCaptureEntries();
  const duplicate = captures.find((capture) =>
    capture.clip.externalMessageId === messageId ||
    (capture.clip.origin === "line" && capture.sourceUrl === sourceUrl)
  );
  if (threadsPostUrl(sourceUrl)) {
    const capture = duplicate || await createCaptureEntry({
      sourceUrl, title: "Threads", note: text.replace(foundUrl, "").trim(),
      clip: emptyClip({ sourceKind: "webpage", platform: "Threads", externalMessageId: messageId, externalEventId: event.webhookEventId || "" }),
    });
    // Sending a link again after it could not be read counts as a repeated attempt.
    await replyWithThreadsPost(capture, event.replyToken || "", false, Boolean(duplicate && !duplicate.clip.threadsPost));
    return;
  }
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
  const reflectionNote = note
    ? `\n已記下你當下的感觸：${note.slice(0, 500)}`
    : "\n\n為什麼想留下這份素材？可以補一句感觸，也可以直接先收下。";
  await replyLineMessage(
    event.replyToken ?? "",
    `已剪藏｜${preview.platform}\n「${capture.title}」\n${previewNote}${reflectionNote}`,
    clipQuickReply(capture.id, true)
  );
  void userId;
}

/** A "轉錄：…" line for a clip that has a transcription job; empty for every other capture. */
function douyinStatusFor(captureId: string): string {
  try {
    const queue = douyinQueue();
    const job = queue.view(captureId);
    return job ? `\n轉錄：${douyinStatusLine(job, queue.connection(), queue.mac().files)}` : "";
  } catch { return ""; }
}

async function handleDouyinShare(event: LineWebhookEvent, text: string): Promise<void> {
  const token = event.replyToken ?? "";
  let share;
  try { share = readDouyinShare(text); }
  catch (error) {
    if (!(error instanceof InputError)) throw error;
    await replyLineMessage(token, error.message, basicLineMenuQuickReply());
    return;
  }

  const queue = douyinQueue();
  const previous = [...await listCaptureEntries()].reverse();
  const ids = queue.matchingIds(share);
  const messageId = event.message?.id || "";
  const existing = ids.map(id => previous.find(capture => capture.id === id)).find(Boolean)
    ?? previous.find(capture => capture.clip.origin === "line" &&
      ((messageId && capture.clip.externalMessageId === messageId) || douyinSourceUrl(capture.sourceUrl)?.url === share.url));
  const capture = existing ?? await createCaptureEntry({
    sourceUrl: share.url,
    title: share.title,
    forageReason: share.note,
    clip: emptyClip({
      sourceKind: "webpage",
      platform: "抖音",
      externalMessageId: messageId,
      externalEventId: event.webhookEventId ?? "",
    }),
  });
  queue.enqueue(capture.id, share);

  const note = share.note.slice(0, 3000);
  const alreadyNoted = (reason: string) => `\n\n${reason}\n\n`.includes(`\n\n${note}\n\n`);
  if (existing && note && !alreadyNoted(existing.forageReason)) {
    await updateCaptureEntry(capture.id, current => alreadyNoted(current.forageReason) ? {} : ({
      forageReason: [current.forageReason, note].filter(Boolean).join("\n\n").slice(0, 3000),
      processingDepth: current.processingDepth === "raw" ? "light" : current.processingDepth,
    }));
  }
  const job = queue.view(capture.id);
  // A capture that joins an already transcribed video gets that transcript written to its own Notion record.
  if (job?.status === "done" && !job.synced) kickTranscriptSync();
  const status = douyinStatusLine(job, queue.connection());
  await replyLineMessage(token, ["已剪藏｜抖音", `「${job?.title || capture.title}」`, status].join("\n"),
    clipQuickReply(capture.id, false, false, "查看這筆素材"));
}

/** The owner answered which capture a media file on the Mac belongs to: an existing one, or a new one (null). */
async function handleFileChoice(event: LineWebhookEvent, file: string, captureId: string | null): Promise<void> {
  const token = event.replyToken ?? "";
  try {
    const queue = douyinQueue();
    const name = queue.offerName(file);
    // Checked before a capture is created, so pressing the button twice never leaves an empty capture behind.
    if (!name) throw new InputError("這個檔案已經指定過，或已不在 Mac 的資料夾裡。", 410);
    const capture = captureId === null
      ? await createCaptureEntry({ sourceUrl: "", title: fileCaptureTitle(name), note: "", clip: emptyClip({ platform: "影片檔", externalEventId: event.webhookEventId || "" }) })
      : (await listCaptureEntries()).find((item) => item.id === captureId);
    if (!capture) throw new InputError("找不到這筆素材，可能已經被移除。可以開啟另一筆素材，在逐字稿區塊指定這個檔案。", 404);
    const job = queue.assign(capture.id, file, { title: capture.title, source: fileSourceLabel(capture) });
    await replyLineMessage(token, [
      captureId === null ? "已新增素材並排入轉錄｜影片檔" : `已排入轉錄｜${fileSourceLabel(capture)}`,
      `「${capture.title}」`, `檔案：${name}`, douyinStatusLine(job, queue.connection(), queue.mac().files),
    ].join("\n"), clipQuickReply(capture.id, false, false, "查看這筆素材"));
  } catch (error) {
    if (!(error instanceof InputError)) throw error;
    await replyLineMessage(token, error.message, basicLineMenuQuickReply());
  }
}

async function replyWithThreadsPost(capture: Awaited<ReturnType<typeof createCaptureEntry>>, token: string, refresh = false, repeated = refresh) {
  let saved = capture;
  let post = capture.clip.threadsPost;
  let failed = false;
  let invalid = false;
  let reason = "";
  let viaFallback = false;
  if (!post || refresh || post.partial) {
    const read = await readThreadsPostDetailed(capture.sourceUrl);
    const found = read.post;
    invalid = read.invalid;
    reason = threadsFailureLine(read);
    viaFallback = read.viaFallback;
    if (found) {
      saved = await updateCaptureEntry(capture.id, current => {
        if (current.sourceUrl !== capture.sourceUrl) throw new Error("素材來源已變更");
        if (!found.partial || !current.clip.threadsPost || current.clip.threadsPost.partial) {
          const autoExcerpt = !current.excerpt || current.excerpt === current.clip.webPreview.description || current.excerpt === current.clip.threadsPost?.text;
          const autoTitle = ["Threads", "threads.com", "threads.net", "網頁", current.clip.threadsPost?.text.split("\n")[0].slice(0, 80)].includes(current.title);
          return { title: autoTitle ? found.text.split("\n")[0].slice(0,80) : current.title,
            excerpt: autoExcerpt ? found.text : current.excerpt, clip: { ...current.clip, platform: "Threads", threadsPost: found } };
        }
        return {};
      });
      post = saved.clip.threadsPost;
    } else failed = true;
  }
  const status = threadsReplyStatus({ post, failed, invalid, repeated, reason, viaFallback });
  await replyLineMessage(token, `已剪藏｜Threads\n${status}${post ? "\n\n" + post.text.slice(0, 320) : ""}`, clipQuickReply(saved.id, !saved.clip.attachments.length, true));
  // The post's own pictures are saved after the reply (this already runs after LINE's webhook was answered).
  // Done once per post (a retry tries again only when nothing was saved). Text-only posts end quietly.
  if (post) {
    try { await saveThreadsImages(saved.id); }
    catch (error) { console.error("threads images failed", saved.id, error instanceof Error ? error.name : "unknown"); }
  }
}

function replyImage(event: LineWebhookEvent, text: string, quickReply?: Parameters<typeof replyLineMessage>[2]) {
  return replyLineMessage(event.replyToken ?? "", text, quickReply, event);
}

async function handleImage(event: LineWebhookEvent, userId: string): Promise<void> {
  const messageId = event.message?.id ?? "";
  if (!messageId) throw new Error("LINE 圖片缺少 message id");
  const captures = await listCaptureEntries();
  const englishImages = await listEnglishImageEntries({ includeMerged: true, includeReadingClips:true });
  const duplicateCapture = captures.find((capture) => capture.clip.attachments.some((item) => item.sourceMessageId === messageId));
  const duplicateEnglish = englishImages.find((entry) => entry.externalMessageId === messageId || entry.attachments.some((attachment) => attachment.sourceMessageId === messageId));
  if (duplicateCapture) {
    await replyImage(event, `這張截圖已經保存於「${duplicateCapture.title}」。`, clipQuickReply(duplicateCapture.id, false));
    return;
  }
  if (duplicateEnglish) {
    const entryId = duplicateEnglish.mergedIntoId || duplicateEnglish.id;
    const { entry: saved } = await getEnglishImageEntry(entryId);
    const attachment = saved.attachments.find(item => item.sourceMessageId === messageId);
    if (!attachment || attachment.blockId === "pending") throw new Error("尚未核對 LINE 原圖");
    const batch = await readLineImageBatch(userId);
    if (batch && !batch.entryId && batch.sessionId && saved.lineImageSetId === "manual:" + batch.sessionId && saved.lineBatchState === "open" && !saved.mergedIntoId) {
      await setLineImageBatch(userId, { ...batch, entryId: saved.id });
    }
    if(saved.readingClip) {
      await receiveLinePages(saved);
      await replyImage(event,"這張原圖已送到心知，可繼續核對。",readingClipQuickReply(entryId));
      return;
    }
    await replyImage(event, `這張圖片已經保存於野採英文影像「${duplicateEnglish.title}」。`, saved.lineBatchState === "open" && batch && (batch.entryId === saved.id || (batch.sessionId && saved.lineImageSetId === "manual:" + batch.sessionId)) ? imageBatchCollectQuickReply(saved.id) : saved.route === "pending" ? imageDraftQuickReply(entryId) : englishImageOrganizeQuickReply(entryId, saved.route));
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
    const open = capture.clip.awaitingScreenshotUntil !== null;
    await replyImage(event, `截圖已補到「${capture.title}」，目前共 ${capture.clip.attachments.length} 張。${open ? "補圖時間內可以繼續傳；傳完請按「補完了」。" : "已達 20 張上限。"}\n圖裡有重要文字時，可以按「讀取圖片文字」請 AI 讀出來，核對後才會帶進淬鍊。`, captureScreenshotQuickReply(capture.id));
    return;
  }

  const rawImageSet = event.message?.imageSet;
  const imageSetId = rawImageSet?.id?.trim() ?? "";
  const imageSetIndex = Number.isFinite(rawImageSet?.index) ? Math.max(1, Math.floor(Number(rawImageSet?.index))) : null;
  const imageSetTotal = Number.isFinite(rawImageSet?.total) ? Math.max(1, Math.floor(Number(rawImageSet?.total))) : 0;

  // An explicitly opened batch takes precedence over LINE imageSet ids. LINE
  // commonly splits a single selection of more than ten images into several
  // image sets; the explicit user action is the reliable grouping boundary.
  const currentBatch = await readLineImageBatch(userId);
  if (currentBatch && (!event.timestamp || !currentBatch.startedAt || event.timestamp >= currentBatch.startedAt)) {
    const sessionKey = currentBatch.sessionId ? "manual:" + currentBatch.sessionId : "";
    let entry = currentBatch.entryId ? (await getEnglishImageEntry(currentBatch.entryId)).entry
      : sessionKey ? englishImages.find(item => item.lineImageSetId === sessionKey && !item.mergedIntoId) : undefined;
    if (entry && (entry.mergedIntoId || entry.lineBatchState !== "open" ||
        (entry.route !== "pending" && !currentBatch.sessionId?.startsWith("continue:")))) {
      await setLineImageBatch(userId, null);
    } else {
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
          lineImageSetId: sessionKey,
          lineBatchState: "open",
          lineBatchUntil: new Date(Date.now() + IMAGE_BATCH_WINDOW_MS).toISOString(),
        });
      }
      if (entry.readingClip) {
        await receiveLinePages(entry);
        await setLineImageBatch(userId, null);
        await replyImage(event, "書頁已加入心知的同一組。", readingClipQuickReply(entry.id));
        return;
      }
      const expiresAt = Date.now() + IMAGE_BATCH_WINDOW_MS;
      const nativeSetProgress = { ...currentBatch.nativeSetProgress };
      let reachedNativeSetEnd = true;
      if (imageSetId && imageSetTotal > 1 && imageSetIndex) {
        const received = new Set(nativeSetProgress[imageSetId] || []);
        received.add(imageSetIndex);
        reachedNativeSetEnd = received.size >= imageSetTotal;
        if (reachedNativeSetEnd) delete nativeSetProgress[imageSetId];
        else nativeSetProgress[imageSetId] = [...received];
      }
      await setLineImageBatch(userId, { ...currentBatch, entryId: entry.id, expiresAt, nativeSetProgress });
      if (reachedNativeSetEnd) {
        await replyImage(event, `已加入目前圖片組，現在共有 ${entry.attachments.length} 張。全部傳完後請按「完成這組」。`, imageBatchCollectQuickReply(entry.id));
      }
      return;
    }
  }

  if (imageSetId && imageSetTotal > 1) {
    await withLineWriteLock(imageSetId, async () => {
      let entry = englishImages.find((item) => item.lineImageSetId === imageSetId && !item.mergedIntoId);
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
      if (entry.readingClip) {
        await receiveLinePages(entry);
        if (entry.attachments.length >= imageSetTotal) {
          await replyImage(event, "書頁已加入心知的同一組。", readingClipQuickReply(entry.id));
        }
        return;
      }
      if (entry.attachments.length >= imageSetTotal) {
        entry = await updateEnglishImageEntry(entry.id, () => ({ lineBatchState: "closed", lineBatchUntil: null }));
        await replyImage(event, `已收到完整圖片組，共 ${entry.attachments.length} 張。請選擇這組素材的類型；選擇後才會開始 AI 分析。`, imageDraftQuickReply(entry.id));
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
  await replyImage(event, "圖片已獨立保存到野採。若還有相關畫面，請按「繼續補這組」；這張圖記錄的是哪種素材？系統不會再自動合併上一張。", imageDraftQuickReply(entry.id));
}

async function handlePostback(event: LineWebhookEvent, userId: string): Promise<void> {
  const params = new URLSearchParams(event.postback?.data ?? "");
  const action = params.get("action");
  if (action === "fileAttach" || action === "fileNew") {
    await handleFileChoice(event, params.get("file") ?? "", action === "fileAttach" ? params.get("captureId") ?? "" : null);
    return;
  }
  if (action === "imageBatchStart") {
    const sessionId = event.webhookEventId || randomUUID();
    const existing = await readLineImageBatch(userId);
    if ((existing?.startedAt && event.timestamp && event.timestamp < existing.startedAt) ||
        (event.deliveryContext?.isRedelivery && existing?.sessionId !== sessionId)) {
      await replyImage(event, "這張收圖卡已經失效。請用目前的收圖卡或輸入「最近一筆」。", basicLineMenuQuickReply());
      return;
    }
    if (existing?.sessionId !== sessionId) {
      await setLineImageBatch(userId, { entryId: "", expiresAt: Date.now() + IMAGE_BATCH_WINDOW_MS, sessionId, startedAt: event.timestamp || Date.now() });
    }
    await replyImage(event, "已開啟新的大型圖片組（30 分鐘）。傳完所有相關圖片後按「完成這組」。", imageBatchCollectQuickReply(existing?.sessionId === sessionId ? existing.entryId : undefined, sessionId));
    return;
  }
  if (action === "imageBatchCancel") {
    const current = await readLineImageBatch(userId);
    if (!current || !params.get("sessionId") || current.sessionId !== params.get("sessionId")) {
      await replyImage(event, "這張收圖卡已經失效。請輸入「最近一筆」查看已保存的圖片。", basicLineMenuQuickReply());
      return;
    }
    if (current.entryId) await updateEnglishImageEntry(current.entryId, () => ({ lineBatchState: "closed", lineBatchUntil: null }));
    await setLineImageBatch(userId, null);
    await replyImage(event, "已停止收圖。已經收到的圖片可從「最近一筆」查看。", basicLineMenuQuickReply());
    return;
  }
  if (action?.startsWith("image") && action !== "imageRoute") {
    const entryId = params.get("entryId") ?? "";
    if (!entryId) return;
    let entry;
    try { entry = (await getEnglishImageEntry(entryId)).entry; }
    catch {
      await replyImage(event, "找不到這筆英文影像，可能已經被移動或移除。");
      return;
    }
    if (entry.readingClip) {
      await replyImage(event,"這組書頁已送到心知。",readingClipQuickReply(entry.id));
      return;
    }
    if (action === "imageBatchContinue") {
      if (entry.mergedIntoId) {
        await replyImage(event, "這張圖片已經合併到另一組，可從「最近一筆」查看。", basicLineMenuQuickReply());
        return;
      }
      const expiresAt = Date.now() + IMAGE_BATCH_WINDOW_MS;
      const current = await readLineImageBatch(userId);
      if (current && current.entryId !== entry.id) {
        await replyImage(event, "目前已有另一組正在收圖。請先完成目前的圖片組。", imageBatchCollectQuickReply(current.entryId, current.sessionId));
        return;
      }
      const updated = await updateEnglishImageEntry(entry.id, () => ({ lineBatchState: "open", lineBatchUntil: new Date(expiresAt).toISOString() }));
      await setLineImageBatch(userId, { entryId: updated.id, expiresAt, sessionId: current?.sessionId?.startsWith("continue:") ? current.sessionId : "continue:" + (event.webhookEventId || randomUUID()), startedAt: current?.startedAt || event.timestamp || Date.now() });
      await replyImage(event, `已開啟「${updated.title}」的補圖模式，目前 ${updated.attachments.length} 張。接下來只會加入這一組。`, imageBatchCollectQuickReply(updated.id));
      return;
    }
    if (action === "imageBatchFinish") {
      const updated = await updateEnglishImageEntry(entry.id, () => ({ lineBatchState: "closed", lineBatchUntil: null }));
      if ((await readLineImageBatch(userId))?.entryId === entry.id) await setLineImageBatch(userId, null);
      await replyImage(event, `這組已完成，共 ${updated.attachments.length} 張。請選擇素材類型；選擇後才會開始 AI 分析。`, imageDraftQuickReply(updated.id));
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
        await replyLineMessage(event.replyToken ?? "", "請選擇這張圖記錄的素材類型。", imageRouteQuickReply(entry.id));
        return;
      }
      const analyzed = await analyzeEnglishImage(entry.id, { force: true });
      if (analyzed.analysisStatus === "completed" || analyzed.analysisStatus === "needs-review") {
        await replyWithLearningUnit(event, analyzed, latest => lineLearningSummary(latest, "重新分析完成｜野採英文影像"));
        return;
      }
      await replyImage(event, `重新分析尚未完成：${analyzed.analysisError || "請稍後再試"}\n學習單元：${autoUnitStatusLabel(analyzed)}`, englishImageOrganizeQuickReply(analyzed.id, analyzed.route));
      return;
    }
    if (action === "imageUndoMerge") {
      try {
        const result = await undoLatestEnglishImageMerge(entry);
        await replyLineMessage(event.replyToken ?? "", `已撤銷最近一次誤合併。\n「${result.parent.title}」保留 ${result.parent.attachments.length} 張；另一筆 ${result.restored.attachments.length} 張圖片已恢復為獨立素材。`, result.parent.route === "pending" ? imageDraftQuickReply(result.parent.id) : englishImageOrganizeQuickReply(result.parent.id, result.parent.route));
      } catch (error) {
        await replyLineMessage(event.replyToken ?? "", error instanceof Error ? error.message : "無法撤銷圖片合併");
      }
      return;
    }
    if (action === "imageKeep") {
      await replyLineMessage(event.replyToken ?? "", "已保留在野採；你可以之後再回來整理。");
      return;
    }
    if (action === "imageAutoUnitInput") {
      await saveEnglishImageEntry({ ...entry, lineInputMode: "unitSource", lineInputUntil: new Date(Date.now() + 10 * 60_000).toISOString() });
      await replyLineMessage(event.replyToken ?? "", "請在十分鐘內直接輸入學習專案的名稱，例如遊戲或書名（Dragon Quest V），或是一個長期主題（按摩工作英文）。名稱和既有專案相同時會放進那個專案，否則建立新專案。");
      return;
    }
    if (action === "imageAutoUnit" || (action === "imageDispatch" && params.get("target") === "context")) {
      if (entry.route === "pending") {
        await replyLineMessage(event.replyToken ?? "", "請先選擇這張圖記錄的素材類型；選擇後會自動分析並建立學習單元。", imageRouteQuickReply(entry.id));
        return;
      }
      const projectId = params.get("projectId")?.trim().slice(0, 200) ?? "";
      await replyWithLearningUnit(event, entry, () => "", projectId ? { projectId } : {});
      return;
    }
    if (action === "imageDispatch") {
      const target = params.get("target");
      if (target !== "context" && target !== "vocab" && target !== "both") return;
      await replyLineMessage(
        event.replyToken ?? "",
        "尚未派送。請開啟同一份確認表單，確認來源、目的專案與單元、最多五個單字及兩個常駐豆倉，再按一次「確認送出」。兩站會分別回報接收結果。",
        contextRoomQuickReply(entry.id, routingEntryUrl(forageUrl(entry.id), entry.id, target)),
      );
      return;
    }
    if (action === "imageVocabSourceInput") {
      await saveEnglishImageEntry({ ...entry, lineInputMode: "vocabSource", lineInputUntil: new Date(Date.now() + 10 * 60_000).toISOString() });
      await replyLineMessage(event.replyToken ?? "", entry.route === "reading"
        ? "請在十分鐘內直接輸入書名或文章來源，例如 Magic Tree House #1。它只會成為來源，不會建立新豆倉。"
        : "請在十分鐘內直接輸入遊戲或作品名稱，例如 Dragon Quest V。它只會成為來源，不會建立新豆倉。");
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
        await replyLineMessage(event.replyToken ?? "", `豆倉清單暫時無法讀取：${error instanceof Error ? error.message : String(error)}`, englishImageOrganizeQuickReply(entry.id, entry.route));
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
        await replyLineMessage(event.replyToken ?? "", `無法開始挑選單字：${error instanceof Error ? error.message : String(error)}`, englishImageOrganizeQuickReply(entry.id, entry.route));
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
        await replyLineMessage(event.replyToken ?? "", `VocabForge 尚未接收：${error instanceof Error ? error.message : String(error)}`, englishImageOrganizeQuickReply(entry.id, entry.route));
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
        await replyLineMessage(event.replyToken ?? "", `VocabForge 尚未接收：${error instanceof Error ? error.message : String(error)}`, englishImageOrganizeQuickReply(entry.id, entry.route));
      }
      return;
    }
    if (action === "imageVocabConfirm") {
      try {
        const { focusDecks, sourceName, selectedKeys } = normalizeRoutingSelection(entry.vocabForgeDraft);
        if (!focusDecks.length) throw new Error("請先確認常駐豆倉");
        if (!selectedKeys.length) throw new Error("請先勾選至少一個單字");
        const result = await exportEnglishImageVocabs(entry.id, selectedKeys, focusDecks[0], { focusDecks, sourceName });
        const imported = result.exports.map((item) => `${item.expression}（${item.cefrLevel}）`).join("、");
        const failed = result.failures.map((item) => item.expression).join("、");
        const updated = await saveEnglishImageEntry({ ...result.entry, vocabForgeDraft: { ...result.entry.vocabForgeDraft, selectedKeys: [] } });
        await replyLineMessage(
          event.replyToken ?? "",
          `${result.exports.length ? `已同步 ${result.exports.length} 字：${imported}` : "這次沒有單字完成同步"}${failed ? `\n同步失敗 ${result.failures.length} 字（候選已保留，可重試）：${failed}` : ""}\n\n來源：${sourceName || "未特別標示"}\n專注豆倉：${focusDecks.join("＋")}\n既有單字會追加這次遇見，不會重設複習進度。`,
          englishImageVocabQuickReply(updated.id, englishImageVocabCandidates(updated), [], updated.vocabForgeExports.map((item) => item.key), updated.contextRoomUrl),
        );
      } catch (error) {
        await replyLineMessage(event.replyToken ?? "", `VocabForge 尚未接收：${error instanceof Error ? error.message : String(error)}`, englishImageOrganizeQuickReply(entry.id, entry.route));
      }
      return;
    }
  }
  if (params.get("action") === "imageRoute") {
    const entryId = params.get("entryId") ?? "";
    const route = params.get("route");
    const {entry}=await getEnglishImageEntry(entryId).catch(()=>({entry:null}));
    if (entry?.readingClip) {
      await receiveLinePages(entry);
      await replyImage(event,"這組書頁已送到心知。",readingClipQuickReply(entry.id));
      return;
    }
    if (!entry || entry.mergedIntoId) {
      await replyImage(event, "找不到這筆圖片，可能已經被移動或移除。");
      return;
    }
    async function applyRoute<T>(change: (latest: EnglishImageEntry) => Promise<T>) {
      return withLineImageBatchLock(userId, async () => {
        const { entry: latest } = await getEnglishImageEntry(entryId);
        if (latest.mergedIntoId) throw new Error("這筆圖片已合併");
        const result = await change(latest);
        if ((await readLineImageBatch(userId))?.entryId === entryId) await setLineImageBatch(userId, null);
        return result;
      });
    }
    if (route === "xinzhi") {
      if(entry.route!=="pending") {
        await replyImage(event,"這組圖片已經選作英文學習素材。",englishImageOrganizeQuickReply(entry.id, entry.route));
        return;
      }
      try {
        const routed = await applyRoute(latest => saveEnglishImageEntry({
          ...latest, readingClip: true, title: "心知閱讀截圖", status: "organized",
          lineBatchState: "closed", lineBatchUntil: null, awaitingContextUntil: null,
        }));
        await receiveLinePages(routed);
      } catch {
        await replyImage(event,"原圖還在野採，送往心知尚未完成。請再點一次「心知閱讀截圖」。",imageDraftQuickReply(entry.id));
        return;
      }
      await replyImage(event,`已收到 ${entry.attachments.length} 張閱讀截圖。打開心知即可核對原文、選書和存筆記。`,readingClipQuickReply(entry.id));
      return;
    }
    if (route === "capture") {
      const capture = await applyRoute(moveEnglishImageToCapture);
      await replyImage(event, "已轉成一般素材，並留在野採採集匣。", clipQuickReply(capture.id, false));
      return;
    }
    if (isEnglishImageLearningRoute(route)) {
      const mode = route === "game" ? params.get("mode") : null;
      if (mode !== null && mode !== "auto" && mode !== "interface" && mode !== "story") {
        await replyImage(event, "請選擇遊戲畫面的整理方式。", imageRouteQuickReply(entry.id));
        return;
      }
      const routed = await applyRoute(latest => routeEnglishImage(latest, route, mode ?? undefined));
      let analyzed;
      try {
        analyzed = await analyzeEnglishImage(routed.id);
      } catch (error) {
        console.error("LINE image analysis failed", routed.id, error instanceof Error ? error.message : String(error));
        await replyImage(event, `這組 ${routed.attachments.length} 張原圖已保存。AI 分析尚未完成，可從「最近一筆」開啟素材，再按「重新分析」。`, englishImageOrganizeQuickReply(routed.id, routed.route));
        return;
      }
      const gameLabels = { interface: "遊戲介面學習", mixed: "遊戲介面與劇情", story: "遊戲劇情／對白" };
      const label = route === "game" ? (analyzed.gameLearning ? gameLabels[analyzed.gameLearning.kind] : "遊戲") : englishImageRouteLabel(route);
      if (analyzed.analysisStatus === "completed" || analyzed.analysisStatus === "needs-review") {
        await replyWithLearningUnit(event, analyzed, latest => lineLearningSummary(latest, `已放進「${label}」並完成 AI 整理`));
      } else {
        await replyImage(event, `已放進「${label}」，原圖已保存。\nAI 暫時未完成：${analyzed.analysisError || "稍後可在英文影像匣重新分析"}`, englishImageOrganizeQuickReply(analyzed.id, analyzed.route));
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

  if (action === "retryThreads" && threadsPostUrl(capture.sourceUrl)) {
    await replyWithThreadsPost(capture, event.replyToken || "", true);
    return;
  }
  if (action === "purpose") {
    const purpose = params.get("purpose") as CaptureClipPurpose | null;
    if (!purpose || !(purpose in CAPTURE_CLIP_PURPOSES)) return;
    await saveCaptureEntry({ ...capture, clip: { ...capture.clip, purpose } });
    await replyLineMessage(event.replyToken ?? "", `已標記為「${CAPTURE_CLIP_PURPOSES[purpose]}」。素材仍留在野採待處理。`);
    return;
  }
  if (action === "captureReflectionInput") {
    const awaitingReflectionUntil = new Date(Date.now() + 10 * 60_000).toISOString();
    await saveCaptureEntry({ ...capture, clip: { ...capture.clip, awaitingReflectionUntil } });
    await replyLineMessage(event.replyToken ?? "", "請在十分鐘內直接輸入：為什麼想留下這份素材？可以是一句話，也可以多寫幾句。");
    return;
  }
  if (action === "captureKeep") {
    if (capture.clip.awaitingReflectionUntil) {
      await saveCaptureEntry({ ...capture, clip: { ...capture.clip, awaitingReflectionUntil: null } });
    }
    await replyLineMessage(event.replyToken ?? "", "已先收下。原始素材、來源、圖片與目前留下的感觸都會保留；不會自動建立其他紀錄。", forageQuickReply(forageUrl()));
    return;
  }
  if (action === "captureScreenshotDone") {
    if (capture.clip.awaitingScreenshotUntil) await updateCaptureEntry(capture.id, (current) => ({ clip: { ...current.clip, awaitingScreenshotUntil: null } }));
    await replyLineMessage(event.replyToken ?? "", `補圖完成，「${capture.title}」共 ${capture.clip.attachments.length} 張圖。之後傳的圖片不會再補到這一筆。`, clipQuickReply(capture.id, false));
    return;
  }
  if (action === "captureImageText") {
    if (!capture.clip.attachments.length) {
      await replyLineMessage(event.replyToken ?? "", "這筆採集還沒有圖片。可以先按「補截圖」再傳圖。", clipQuickReply(capture.id, true));
      return;
    }
    let read;
    try { read = await readCaptureImageText(capture.id); }
    catch (error) {
      await replyImage(event, `圖片文字沒有讀取：${error instanceof Error ? error.message : "請稍後再試"}`, clipQuickReply(capture.id, false));
      return;
    }
    const result = read.clip.imageText;
    const lines = result?.state === "ready"
      ? [`已讀出「${read.title}」${result.pages.length} 張圖的文字。`, ...result.pages.slice(0, 3).map((page, index) => `圖 ${index + 1}｜${page.text.split("\n")[0]?.slice(0, 40) || "（沒有文字）"}`), result.pages.length > 3 ? "……" : "", "請到網頁的採集頁核對並按「確認為原文」，確認後淬鍊才會帶入。"]
      : [`圖片文字沒有讀完：${result?.error || "請稍後重試"}`];
    await replyImage(event, lines.filter(Boolean).join("\n"), clipQuickReply(capture.id, false, false, "到網頁核對"));
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
  if (event.type === "message" && event.message?.type === "image") return withLineImageBatchLock(userId, () => handleImage(event, userId));
  if (event.type === "postback") {
    const action = new URLSearchParams(event.postback?.data).get("action");
    if (action?.startsWith("imageBatch")) return withLineImageBatchLock(userId, () => handlePostback(event, userId));
    return handlePostback(event, userId);
  }
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

  // In bank mode the receiver must durably accept the image before LINE gets
  // a 200 response. Stable event/message ids make a LINE retry idempotent.
  const bankIntakes = new Map<string, BankIntake>();
  const performanceReplies=new Map<string,string>();
  try {
    for (const event of body.events ?? []) {
      const userId = event.source?.userId ?? "";
      if(userId===allowedUserId&&event.type==="message"&&event.message?.type==="text"&&isPerformanceText(event.message.text||"")){
        const eventId=event.webhookEventId||event.message.id||"";
        let parsed;
        try{const today=new Intl.DateTimeFormat("en-CA",{timeZone:"Australia/Melbourne",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());parsed=parsePerformanceText(event.message.text||"",today)}catch(e){performanceReplies.set(eventId,e instanceof Error?e.message:"業績格式不正確");continue}
        try{const result=await receivePerformance(userId,eventId,parsed);performanceReplies.set(eventId,performanceReply(result))}catch(e){const status=(e as {status?:number}).status;if(status&&[400,409,422].includes(status)){performanceReplies.set(eventId,e instanceof Error?e.message:"業績需核對");continue}throw e}
        continue;
      }
      if (userId !== allowedUserId || event.type !== "message" || event.message?.type !== "image") continue;
      const messageId = event.message.id ?? "";
      if (!messageId) throw new Error("LINE 圖片缺少 message id");
      const eventId = event.webhookEventId ?? messageId;
      const routing = await bankImageRoute(userId, eventId);
      if (routing.route === "ordinary") continue;
      if (routing.route === "bank-unavailable") throw new Error("財富帳本暫時無法可靠確認圖片路由");
      const image = await fetchLineImage(messageId);
      bankIntakes.set(eventId, await receiveBankImage(userId, { messageId, eventId, mimeType: image.mimeType, bytes: Buffer.from(image.bytes) }));
    }
  } catch {
    return NextResponse.json({ error: "財務紀錄尚未可靠保存，請讓 LINE 稍後重送" }, { status: 503 });
  }

  // LINE expects the webhook endpoint to acknowledge receipt within about two
  // seconds. Image analysis and external integrations can take longer, so keep
  // the work alive after the HTTP response has already been returned.
  after(async () => {
    for (const event of body.events ?? []) {
      const eventId = event.webhookEventId ?? event.message?.id ?? "";
      try {
        const performanceMessage=performanceReplies.get(eventId);
        if(performanceMessage){await replyLineMessage(event.replyToken??"",performanceMessage,basicLineMenuQuickReply());continue}
        const intake = bankIntakes.get(eventId);
        if (!intake) { await handleEvent(event, allowedUserId); continue; }
        try {
          const result = await processBankImage(event.source?.userId ?? "", intake.batchId);
          const url = wealthInboxUrl();
          await replyLineMessage(event.replyToken ?? "", `${bankSummary(result)}${url ? `\n\n待辦匣：${url}` : ""}`, basicLineMenuQuickReply());
        } catch {
          await replyLineMessage(event.replyToken ?? "", "銀行截圖已安全保存，但辨識暫時未完成；稍後可到財富待辦匣安全重試。", basicLineMenuQuickReply());
        }
      } catch (error) {
        console.error("LINE clipping event failed", eventId, error instanceof Error ? error.message : String(error));
        const ordinaryImage = event.type === "message" && event.message?.type === "image" && !bankIntakes.has(eventId);
        const imageAction = event.type === "postback" && new URLSearchParams(event.postback?.data).get("action")?.startsWith("image");
        if ((ordinaryImage || imageAction) && event.source?.userId === allowedUserId && !(error instanceof Error && error.name === "LineReplyDeliveryError")) {
          await replyImage(event, imageAction ? "這次圖片操作尚未完成。請輸入「最近一筆」查看保存狀態並重試。" : "這張圖片尚未核對完成。請輸入「最近一筆」查看已保存的張數，再補傳缺少的圖片。", basicLineMenuQuickReply())
            .catch(deliveryError => console.error("LINE image receipt failed", eventId, deliveryError instanceof Error ? deliveryError.message : String(deliveryError)));
        }
      }
    }
  });

  return NextResponse.json({ ok: true });
}
