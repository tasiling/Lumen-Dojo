import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import { lookup } from "node:dns/promises";
import type { CaptureClipPurpose } from "./formal";
import {
  normalizeSourceName,
  PERMANENT_FOCUS_DECKS,
  type EnglishImageVocabCandidate,
  type VocabForgeBook,
} from "./englishImageDispatch";

export type LineWebhookEvent = {
  type: "message" | "postback" | string;
  webhookEventId?: string;
  replyToken?: string;
  source?: { type?: string; userId?: string };
  message?: {
    id?: string;
    type?: string;
    text?: string;
    imageSet?: { id?: string; index?: number; total?: number };
  };
  postback?: { data?: string };
};

export type LineWebhookBody = { events?: LineWebhookEvent[] };

export type WebPreview = {
  title: string;
  description: string;
  imageUrl: string;
  platform: string;
  status: "ready" | "partial" | "unavailable";
  fetchedAt: string;
};

const PURPOSE_ACTIONS: { key: CaptureClipPurpose; label: string }[] = [
  { key: "contentOpinion", label: "內容觀點" },
  { key: "visualReference", label: "視覺參考" },
  { key: "learningMaterial", label: "學習資料" },
  { key: "researchLater", label: "待研究" },
  { key: "saveFirst", label: "先收著" },
];

export function verifyLineSignature(rawBody: string, signature: string, channelSecret: string): boolean {
  if (!signature || !channelSecret) return false;
  const expected = createHmac("sha256", channelSecret).update(rawBody).digest();
  let received: Buffer;
  try { received = Buffer.from(signature, "base64"); } catch { return false; }
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export function extractFirstUrl(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s<>「」『』]+/iu);
  if (!match) return null;
  return match[0].replace(/[),.;!?，。；！？、）】》]+$/u, "");
}

export function normalizeClipUrl(value: string): string {
  const url = new URL(value.trim());
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("只支援 http 或 https 網址");
  if (url.username || url.password) throw new Error("網址不可包含登入帳密");
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (/^(utm_.+|fbclid|gclid|igshid|si)$/i.test(key)) url.searchParams.delete(key);
  }
  return url.toString();
}

export function platformFromUrl(value: string): string {
  try {
    const host = new URL(value).hostname.toLowerCase().replace(/^www\./, "");
    if (host === "plurk.com" || host.endsWith(".plurk.com")) return "噗浪";
    if (host === "douyin.com" || host.endsWith(".douyin.com")) return "抖音";
    if (host === "youtube.com" || host.endsWith(".youtube.com") || host === "youtu.be") return "YouTube";
    if (host === "instagram.com" || host.endsWith(".instagram.com")) return "Instagram";
    if (host === "threads.net" || host.endsWith(".threads.net")) return "Threads";
    return host;
  } catch { return "網頁"; }
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)))
    .replace(/\s+/g, " ")
    .trim();
}

function metaContent(html: string, names: string[]): string {
  for (const name of names) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const patterns = [
      new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']*)["'][^>]*>`, "i"),
      new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`, "i"),
    ];
    for (const pattern of patterns) {
      const found = html.match(pattern)?.[1];
      if (found) return decodeHtml(found);
    }
  }
  return "";
}

function isPrivateAddress(address: string): boolean {
  const normalized = address.toLowerCase();
  if (normalized === "::1" || normalized === "::" || normalized.startsWith("fe80:") || normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
  const ipv4 = normalized.startsWith("::ffff:") ? normalized.slice(7) : normalized;
  const parts = ipv4.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return false;
  return parts[0] === 10 || parts[0] === 127 || parts[0] === 0 ||
    (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168) ||
    (parts[0] >= 224);
}

async function assertPublicUrl(url: URL): Promise<void> {
  const hostname = url.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) throw new Error("不支援內部網址");
  if (isIP(hostname)) {
    if (isPrivateAddress(hostname)) throw new Error("不支援內部網址");
    return;
  }
  const addresses = await lookup(hostname, { all: true });
  if (!addresses.length || addresses.some((item) => isPrivateAddress(item.address))) throw new Error("不支援內部網址");
}

async function fetchPublicHtml(initialUrl: string): Promise<{ html: string; finalUrl: string }> {
  let current = new URL(initialUrl);
  for (let redirect = 0; redirect <= 3; redirect += 1) {
    await assertPublicUrl(current);
    const response = await fetch(current, {
      redirect: "manual",
      signal: AbortSignal.timeout(3500),
      headers: { "User-Agent": "LumenDojoClipper/1.0", Accept: "text/html,application/xhtml+xml" },
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new Error("網頁重新導向缺少位置");
      current = new URL(location, current);
      continue;
    }
    if (!response.ok) throw new Error(`網頁回應 ${response.status}`);
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) throw new Error("網址不是一般網頁");
    const declaredLength = Number(response.headers.get("content-length") ?? 0);
    if (declaredLength > 1_000_000) throw new Error("網頁內容過大");
    return { html: (await response.text()).slice(0, 1_000_000), finalUrl: current.toString() };
  }
  throw new Error("網頁重新導向次數過多");
}

export async function fetchWebPreview(sourceUrl: string): Promise<WebPreview> {
  const normalized = normalizeClipUrl(sourceUrl);
  const fallbackTitle = platformFromUrl(normalized);
  const fetchedAt = new Date().toISOString();
  try {
    const { html, finalUrl } = await fetchPublicHtml(normalized);
    const titleTag = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "";
    const title = metaContent(html, ["og:title", "twitter:title"]) || decodeHtml(titleTag) || fallbackTitle;
    const description = metaContent(html, ["og:description", "description", "twitter:description"]);
    const rawImage = metaContent(html, ["og:image", "twitter:image"]);
    const imageUrl = rawImage ? new URL(rawImage, finalUrl).toString() : "";
    return {
      title: title.slice(0, 300), description: description.slice(0, 3000), imageUrl,
      platform: platformFromUrl(finalUrl), status: description || imageUrl ? "ready" : "partial", fetchedAt,
    };
  } catch {
    return { title: fallbackTitle, description: "", imageUrl: "", platform: fallbackTitle, status: "unavailable", fetchedAt };
  }
}

type LineQuickReplyItem = {
  type: "action";
  action:
    | { type: "postback"; label: string; data: string; displayText: string }
    | { type: "uri"; label: string; uri: string }
    | { type: "message"; label: string; text: string }
    | { type: "camera" | "cameraRoll"; label: string };
};

function quickReplyItem(label: string, data: string): LineQuickReplyItem {
  return { type: "action", action: { type: "postback", label, data, displayText: label } };
}

const LINE_POSTBACK_DATA_LIMIT = 300;

function boundedPostbackData(params: Record<string, string>, truncatableKey?: string): string {
  const values = { ...params };
  let data = new URLSearchParams(values).toString();
  if (Array.from(data).length <= LINE_POSTBACK_DATA_LIMIT) return data;
  if (!truncatableKey) throw new Error("LINE postback data exceeds 300 characters");

  const characters = Array.from(values[truncatableKey] ?? "");
  while (characters.length > 0 && Array.from(data).length > LINE_POSTBACK_DATA_LIMIT) {
    characters.pop();
    values[truncatableKey] = characters.join("");
    data = new URLSearchParams(values).toString();
  }
  if (Array.from(data).length > LINE_POSTBACK_DATA_LIMIT) throw new Error("LINE postback data exceeds 300 characters");
  return data;
}

function lineLabel(value: string): string {
  return Array.from(value.trim()).slice(0, 20).join("") || "未命名豆倉";
}

function uriQuickReplyItem(label: string, uri: string): LineQuickReplyItem {
  return { type: "action", action: { type: "uri", label, uri } };
}

function messageQuickReplyItem(label: string, text: string): LineQuickReplyItem {
  return { type: "action", action: { type: "message", label, text } };
}

export function captureImageQuickReply() {
  return { items: [
    { type: "action" as const, action: { type: "cameraRoll" as const, label: "開啟相簿" } },
    quickReplyItem("分次收一組", new URLSearchParams({ action: "imageBatchStart" }).toString()),
    { type: "action" as const, action: { type: "camera" as const, label: "拍攝單張" } },
    messageQuickReplyItem("取消", "選單"),
  ] };
}

export function imageBatchCollectQuickReply(entryId?: string) {
  const items: LineQuickReplyItem[] = [
    { type: "action", action: { type: "cameraRoll", label: "繼續選圖" } },
    { type: "action", action: { type: "camera", label: "繼續拍照" } },
  ];
  if (entryId) {
    items.push(quickReplyItem("完成這組", new URLSearchParams({ action: "imageBatchFinish", entryId }).toString()));
  } else {
    items.push(quickReplyItem("停止收圖", new URLSearchParams({ action: "imageBatchCancel" }).toString()));
  }
  return { items };
}

export function basicLineMenuQuickReply() {
  return { items: [
    messageQuickReplyItem("野採圖片", "野採圖片"),
    messageQuickReplyItem("剪藏網址", "剪藏網址"),
    messageQuickReplyItem("最近一筆", "最近一筆"),
    messageQuickReplyItem("待整理", "待整理"),
    messageQuickReplyItem("豆倉", "豆倉"),
  ] };
}

export function forageQuickReply(url: string) {
  return { items: [
    uriQuickReplyItem("開啟野採", url),
    messageQuickReplyItem("最近一筆", "最近一筆"),
    messageQuickReplyItem("選單", "選單"),
  ] };
}

export function imageRouteQuickReply(entryId: string) {
  return { items: [
    quickReplyItem("遊戲英文", new URLSearchParams({ action: "imageRoute", entryId, route: "game" }).toString()),
    quickReplyItem("英文日常", new URLSearchParams({ action: "imageRoute", entryId, route: "daily" }).toString()),
    quickReplyItem("課堂英文", new URLSearchParams({ action: "imageRoute", entryId, route: "classroom" }).toString()),
    quickReplyItem("閱讀英文", new URLSearchParams({ action: "imageRoute", entryId, route: "reading" }).toString()),
    quickReplyItem("一般剪藏", new URLSearchParams({ action: "imageRoute", entryId, route: "capture" }).toString()),
  ] };
}

export function imageDraftQuickReply(entryId: string) {
  return { items: [
    ...imageRouteQuickReply(entryId).items,
    quickReplyItem("繼續補這組", new URLSearchParams({ action: "imageBatchContinue", entryId }).toString()),
    quickReplyItem("撤銷誤合併", new URLSearchParams({ action: "imageUndoMerge", entryId }).toString()),
  ] };
}

export function englishImageOrganizeQuickReply(entryId: string) {
  return { items: [
    quickReplyItem("補充情境", new URLSearchParams({ action: "imageInput", entryId, mode: "context" }).toString()),
    quickReplyItem("修正原文", new URLSearchParams({ action: "imageInput", entryId, mode: "ocr" }).toString()),
    quickReplyItem("重新分析", new URLSearchParams({ action: "imageAnalyze", entryId }).toString()),
    quickReplyItem("撤銷誤合併", new URLSearchParams({ action: "imageUndoMerge", entryId }).toString()),
    quickReplyItem("送語境修習室", new URLSearchParams({ action: "imageDispatch", entryId, target: "context" }).toString()),
    quickReplyItem("送 VocabForge", new URLSearchParams({ action: "imageDispatch", entryId, target: "vocab" }).toString()),
    quickReplyItem("兩邊都送", new URLSearchParams({ action: "imageDispatch", entryId, target: "both" }).toString()),
    quickReplyItem("先留野採", new URLSearchParams({ action: "imageKeep", entryId }).toString()),
  ] };
}

export function englishImageBookQuickReply(entryId: string, books: VocabForgeBook[], page = 0) {
  const pageSize = 10;
  const lastPage = Math.max(0, Math.ceil(books.length / pageSize) - 1);
  const safePage = Math.min(Math.max(0, page), lastPage);
  const items = books.slice(safePage * pageSize, (safePage + 1) * pageSize).map((book) => quickReplyItem(
    lineLabel(book.name),
    boundedPostbackData({ action: "imageVocabBook", entryId, book: book.name }, "book"),
  ));
  if (safePage > 0) items.push(quickReplyItem("上一頁", new URLSearchParams({ action: "imageVocabBooks", entryId, page: String(safePage - 1) }).toString()));
  if (safePage < lastPage) items.push(quickReplyItem("下一頁", new URLSearchParams({ action: "imageVocabBooks", entryId, page: String(safePage + 1) }).toString()));
  items.push(quickReplyItem("先留野採", new URLSearchParams({ action: "imageKeep", entryId }).toString()));
  return { items };
}

export function englishImageSourceQuickReply(entryId: string, inferredSource = "", kind: "game" | "reading" = "game") {
  const suggestions = kind === "reading"
    ? [normalizeSourceName(inferredSource)]
    : [normalizeSourceName(inferredSource), "Dragon Quest V", "Zelda", "Chinese Parents", "Animal Crossing"];
  const commonSources = suggestions
    .map((source) => source.trim())
    .filter((source, index, values) => source && values.indexOf(source) === index)
    .slice(0, 5);
  return { items: [
    ...commonSources.map((source) => quickReplyItem(
      lineLabel(source),
      boundedPostbackData({ action: "imageVocabSource", entryId, source }, "source"),
    )),
    quickReplyItem(kind === "reading" ? "輸入書名／來源" : "輸入其他作品", new URLSearchParams({ action: "imageVocabSourceInput", entryId }).toString()),
    quickReplyItem("取消", new URLSearchParams({ action: "imageKeep", entryId }).toString()),
  ] };
}

export function englishImageFocusDeckQuickReply(entryId: string, selectedDecks: string[]) {
  const selected = new Set(selectedDecks);
  return { items: [
    ...PERMANENT_FOCUS_DECKS.map((deck) => quickReplyItem(`${selected.has(deck) ? "✓" : "＋"}${lineLabel(deck).slice(0, 17)}`, new URLSearchParams({ action: "imageVocabDeck", entryId, deck }).toString())),
    quickReplyItem(`確認分類 ${selected.size}/2`, new URLSearchParams({ action: "imageVocabDeckConfirm", entryId }).toString()),
    quickReplyItem("取消", new URLSearchParams({ action: "imageKeep", entryId }).toString()),
  ] };
}

export function englishImageVocabQuickReply(entryId: string, candidates: EnglishImageVocabCandidate[], selectedKeys: string[], exportedKeys: string[], contextRoomUrl = "") {
  const exported = new Set(exportedKeys);
  const selected = new Set(selectedKeys);
  const remainingSlots = Math.max(0, 5 - exportedKeys.length);
  const items: LineQuickReplyItem[] = candidates.filter((candidate) => !exported.has(candidate.key)).slice(0, remainingSlots).map((candidate) => quickReplyItem(
    `${selected.has(candidate.key) ? "✓" : "＋"}${candidate.expression} ${candidate.cefrLevel === "待確認" ? "?" : candidate.cefrLevel}`.slice(0, 20),
    new URLSearchParams({ action: "imageVocabToggle", entryId, key: candidate.key }).toString(),
  ));
  if (selected.size > 0) items.push(quickReplyItem(`確認送出 ${selected.size} 字`, new URLSearchParams({ action: "imageVocabConfirm", entryId }).toString()));
  if (contextRoomUrl) items.push(uriQuickReplyItem("開啟語境修習室", contextRoomUrl));
  items.push(quickReplyItem("完成", new URLSearchParams({ action: "imageKeep", entryId }).toString()));
  return { items };
}

export function contextRoomQuickReply(entryId: string, url: string) {
  return { items: [
    uriQuickReplyItem("到野採安排批次", url),
    quickReplyItem("送 VocabForge", new URLSearchParams({ action: "imageDispatch", entryId, target: "vocab" }).toString()),
    quickReplyItem("先留野採", new URLSearchParams({ action: "imageKeep", entryId }).toString()),
  ] };
}

export function clipQuickReply(captureId: string, includeScreenshot: boolean) {
  const base = process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://lumen-dojo.up.railway.app";
  let explorationUrl = `${base.replace(/\/$/, "")}/forage/captures?captureId=${encodeURIComponent(captureId)}`;
  try {
    const url = new URL("/forage/captures", base);
    url.searchParams.set("captureId", captureId);
    explorationUrl = url.toString();
  } catch { /* Use the safe fallback above. */ }
  const items: LineQuickReplyItem[] = [
    quickReplyItem("補一句感觸", new URLSearchParams({ action: "captureReflectionInput", captureId }).toString()),
    quickReplyItem("先收下", new URLSearchParams({ action: "captureKeep", captureId }).toString()),
    uriQuickReplyItem("繼續探索", explorationUrl),
    ...PURPOSE_ACTIONS.map((purpose) => quickReplyItem(
    purpose.label,
    new URLSearchParams({ action: "purpose", captureId, purpose: purpose.key }).toString()
    )),
  ];
  if (includeScreenshot) {
    items.push(quickReplyItem("補截圖", new URLSearchParams({ action: "awaitScreenshot", captureId }).toString()));
  }
  return { items };
}

type LineQuickReply = { items: LineQuickReplyItem[] };

export function splitLineText(text: string): string[] {
  const limit = 5000;
  const maxMessages = 5;
  const overflowNote = "\n\n（內容超過 LINE 回覆上限，完整紀錄請至野採查看。）";
  let remaining = text.trim() || " ";
  const chunks: string[] = [];
  while (Array.from(remaining).length > limit && chunks.length < maxMessages - 1) {
    const characters = Array.from(remaining);
    const window = characters.slice(0, limit).join("");
    const newline = window.lastIndexOf("\n");
    const splitAt = newline >= Math.floor(limit * 0.5) ? Array.from(window.slice(0, newline + 1)).length : limit;
    chunks.push(characters.slice(0, splitAt).join("").trimEnd());
    remaining = characters.slice(splitAt).join("").trimStart();
  }
  const remainingCharacters = Array.from(remaining);
  if (remainingCharacters.length > limit) {
    chunks.push(remainingCharacters.slice(0, limit - Array.from(overflowNote).length).join("").trimEnd() + overflowNote);
  } else {
    chunks.push(remaining);
  }
  return chunks;
}

export async function replyLineMessage(replyToken: string, text: string, quickReply?: LineQuickReply): Promise<void> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token || !replyToken) return;
  const response = await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      replyToken,
      messages: splitLineText(text).map((chunk, index, chunks) => ({
        type: "text",
        text: chunk,
        ...(quickReply && index === chunks.length - 1 ? { quickReply } : {}),
      })),
    }),
  });
  if (!response.ok) {
    const responseText = (await response.text()).slice(0, 1500);
    console.error(`[LINE] Reply failed (${response.status}): ${responseText || "No response body"}`);
    let detail = "";
    try {
      const payload = JSON.parse(responseText) as { message?: string; details?: Array<{ message?: string; property?: string }> };
      detail = payload.details?.map((item) => [item.property, item.message].filter(Boolean).join("：")).filter(Boolean).join("；")
        || payload.message
        || "";
    } catch {
      detail = responseText;
    }
    throw new Error(`LINE 回覆失敗（${response.status}）${detail ? `：${detail}` : ""}`);
  }
}

export async function fetchLineImage(messageId: string): Promise<{ bytes: ArrayBuffer; mimeType: string }> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) throw new Error("缺少 LINE_CHANNEL_ACCESS_TOKEN");
  const response = await fetch(`https://api-data.line.me/v2/bot/message/${encodeURIComponent(messageId)}/content`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`LINE 圖片下載失敗（${response.status}）`);
  const mimeType = (response.headers.get("content-type") ?? "image/jpeg").split(";")[0].trim();
  return { bytes: await response.arrayBuffer(), mimeType };
}
