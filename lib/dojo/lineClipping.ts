import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import { lookup } from "node:dns/promises";
import type { CaptureClipPurpose } from "./formal";

export type LineWebhookEvent = {
  type: "message" | "postback" | string;
  webhookEventId?: string;
  replyToken?: string;
  source?: { type?: string; userId?: string };
  message?: { id?: string; type?: string; text?: string };
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

function quickReplyItem(label: string, data: string) {
  return { type: "action", action: { type: "postback", label, data, displayText: label } };
}

export function imageRouteQuickReply(entryId: string) {
  return { items: [
    quickReplyItem("遊戲英文", new URLSearchParams({ action: "imageRoute", entryId, route: "game" }).toString()),
    quickReplyItem("英文日常", new URLSearchParams({ action: "imageRoute", entryId, route: "daily" }).toString()),
    quickReplyItem("一般剪藏", new URLSearchParams({ action: "imageRoute", entryId, route: "capture" }).toString()),
  ] };
}

export function clipQuickReply(captureId: string, includeScreenshot: boolean) {
  const items = PURPOSE_ACTIONS.map((purpose) => quickReplyItem(
    purpose.label,
    new URLSearchParams({ action: "purpose", captureId, purpose: purpose.key }).toString()
  ));
  if (includeScreenshot) {
    items.push(quickReplyItem("補截圖", new URLSearchParams({ action: "awaitScreenshot", captureId }).toString()));
  }
  return { items };
}

type LineQuickReply = { items: ReturnType<typeof quickReplyItem>[] };

export async function replyLineMessage(replyToken: string, text: string, quickReply?: LineQuickReply): Promise<void> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token || !replyToken) return;
  const response = await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ replyToken, messages: [{ type: "text", text: text.slice(0, 5000), ...(quickReply ? { quickReply } : {}) }] }),
  });
  if (!response.ok) throw new Error(`LINE 回覆失敗（${response.status}）`);
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
