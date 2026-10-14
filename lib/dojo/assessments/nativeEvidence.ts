import "server-only";
import { createHash } from "node:crypto";
import { notion, withNotionRateLimit } from "@/lib/notion/client";
import { DATA_SOURCES } from "@/lib/notion/schema";
import { LearningError, uuidPattern } from "../learningFoundation/model";
import { isPrivateNativeSource } from "./nativeCatalog";
type NativeResult = { status: "available" | "archived" | "missing" | "unverified"; snapshot: string; identity?: string; mediaKind?: "audio" | "file" };
function record(v: unknown): Record<string, unknown> { return v && typeof v === "object" ? v as Record<string, unknown> : {}; }
function unavailable(e: unknown) { const v = record(e); return v.code === "object_not_found" || v.status === 404; }
function sameId(a: unknown, b: string) { return typeof a === "string" && a.replaceAll("-", "").toLowerCase() === b.replaceAll("-", "").toLowerCase(); }
function allowedSignedUrl(value: unknown): URL | null {
  if (typeof value !== "string") return null;
  let url: URL; try { url = new URL(value); } catch { return null; }
  if (url.protocol !== "https:" || url.username || url.password) return null;
  if (url.hostname === "prod-files-secure.s3.us-west-2.amazonaws.com" || (url.hostname === "s3.us-west-2.amazonaws.com" && url.pathname.startsWith("/secure.notion-static.com/"))) return url;
  return null;
}
function media(bytes: Uint8Array, mime: string): "audio" | "file" | null {
  const ascii = Buffer.from(bytes).toString("latin1"), type = mime.split(";")[0].toLowerCase();
  if (type === "application/pdf" && ascii.startsWith("%PDF-")) return "file";
  if (type === "image/png" && bytes[0] === 0x89 && ascii.slice(1, 4) === "PNG") return "file";
  if (type === "image/jpeg" && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "file";
  if (type.startsWith("audio/") && (ascii.startsWith("ID3") || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) || (ascii.startsWith("RIFF") && ascii.slice(8, 12) === "WAVE") || ascii.startsWith("OggS") || ascii.slice(4, 8) === "ftyp" || (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3))) return "audio";
  return null;
}
type Inspection = NativeResult & { delivery?: { url: string; etag: string; size: number; mime: string } };
async function inspectNativeAttachment(pageId: string, blockId: string): Promise<Inspection> {
  if (!uuidPattern.test(pageId) || !uuidPattern.test(blockId)) throw new LearningError("附件來源 ID 不正確");
  const snapshot = `既有附件 ${pageId}:${blockId}`;
  let page: Record<string, unknown>, block: Record<string, unknown>;
  try { page = record(await withNotionRateLimit(() => notion().pages.retrieve({ page_id: pageId }))); }
  catch (e) { if (unavailable(e)) return { status: "missing", snapshot }; throw e; }
  if (!sameId(record(page.parent).data_source_id, DATA_SOURCES.DB14_知識庫)) throw new LearningError("附件不屬於本 owner", 403);
  if (page.archived || page.in_trash) return { status: "archived", snapshot };
  if (isPrivateNativeSource(page)) return { status: "unverified", snapshot };
  try { block = record(await withNotionRateLimit(() => notion().blocks.retrieve({ block_id: blockId }))); }
  catch (e) { if (unavailable(e)) return { status: "missing", snapshot }; throw e; }
  const original = block, visited = new Set<string>();
  for (let depth = 0; ; depth++) {
    if (block.archived || block.in_trash) return { status: "archived", snapshot };
    const parent = record(block.parent);
    if (parent.type === "page_id") { if (!sameId(parent.page_id, pageId)) throw new LearningError("附件不屬於所選來源頁面", 403); break; }
    if (depth >= 15 || parent.type !== "block_id" || typeof parent.block_id !== "string" || visited.has(parent.block_id)) throw new LearningError("附件來源階層無法確認", 409);
    visited.add(parent.block_id);
    try { block = record(await withNotionRateLimit(() => notion().blocks.retrieve({ block_id: parent.block_id as string }))); }
    catch (e) { if (unavailable(e)) return { status: "missing", snapshot }; throw e; }
  }
  if (!["file", "audio", "image"].includes(String(original.type))) return { status: "unverified", snapshot };
  const payload = record(original[String(original.type)]);
  if (payload.type !== "file") return { status: "unverified", snapshot };
  const url = allowedSignedUrl(record(payload.file).url); if (!url) return { status: "unverified", snapshot };
  let response: Response;
  try { response = await fetch(url.href, { method: "GET", redirect: "manual", cache: "no-store", headers: { Range: "bytes=0-63" }, signal: AbortSignal.timeout(5000) }); }
  catch { return { status: "unverified", snapshot }; }
  const reader = response.body?.getReader();
  try {
    if (response.status === 404) return { status: "missing", snapshot };
    const range = response.headers.get("content-range")?.match(/^bytes 0-(\d+)\/(\d+)$/), etag = response.headers.get("etag");
    if (response.status !== 206 || !range || Number(range[1]) > 63 || Number(range[2]) < Number(range[1]) + 1 || Number(range[2]) > 25 * 1024 * 1024 || !etag || etag.length > 200 || !reader) return { status: "unverified", snapshot };
    let bytes = new Uint8Array(0);
    for (;;) { const part = await reader.read(); if (part.done) break; if (bytes.length + part.value.length > 64) return { status: "unverified", snapshot }; const joined = new Uint8Array(bytes.length + part.value.length); joined.set(bytes); joined.set(part.value, bytes.length); bytes = joined; }
    if (bytes.length !== Number(range[1]) + 1) return { status: "unverified", snapshot };
    const mediaKind = media(bytes, response.headers.get("content-type") ?? "");
    if (!mediaKind || (original.type === "audio" && mediaKind !== "audio")) return { status: "unverified", snapshot };
    const identity = createHash("sha256").update(JSON.stringify([url.origin, url.pathname, etag, Number(range[2])])).digest("hex");
    return { status: "available", snapshot, identity, mediaKind, delivery: { url: url.href, etag, size: Number(range[2]), mime: (response.headers.get("content-type") ?? "").split(";")[0].toLowerCase() } };
  } catch { return { status: "unverified", snapshot }; }
  finally { await reader?.cancel().catch(() => {}); }
}

export async function ownedNativeAttachment(pageId: string, blockId: string): Promise<NativeResult> {
  const result = await inspectNativeAttachment(pageId, blockId);
  return { status: result.status, snapshot: result.snapshot, ...(result.identity ? { identity: result.identity } : {}), ...(result.mediaKind ? { mediaKind: result.mediaKind } : {}) };
}
/** Deliver only a bounded, verified owner attachment. Never expose its signed URL. */
export async function nativeAttachmentResponse(pageId: string, blockId: string, rangeHeader: string | null, expectedIdentity?: string): Promise<Response> {
  if (expectedIdentity && !/^[a-f0-9]{64}$/.test(expectedIdentity)) throw new LearningError("附件版本不正確");
  const result = await inspectNativeAttachment(pageId, blockId), source = result.delivery;
  if (result.status !== "available" || !source) throw new LearningError("附件目前無法核對，請重新讀取來源", result.status === "missing" ? 404 : 409);
  if (expectedIdentity && expectedIdentity !== result.identity) throw new LearningError("附件內容已改變，不能當作原先保存的作品播放", 409);
  let start = 0, end = source.size - 1;
  if (rangeHeader !== null) {
    const match = rangeHeader.match(/^bytes=(\d*)-(\d*)$/);
    if (!match || (!match[1] && !match[2])) throw new LearningError("不支援這個音訊範圍", 416);
    if (!match[1]) { const suffix = Number(match[2]); if (!Number.isSafeInteger(suffix) || suffix <= 0) throw new LearningError("音訊範圍不正確", 416); start = Math.max(0, source.size - suffix); }
    else { start = Number(match[1]); if (match[2]) end = Math.min(Number(match[2]), end); }
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= source.size) throw new LearningError("音訊範圍不正確", 416);
  }
  let response: Response;
  try { response = await fetch(source.url, { method: "GET", redirect: "manual", cache: "no-store", headers: { Range: `bytes=${start}-${end}`, "If-Match": source.etag }, signal: AbortSignal.timeout(15000) }); }
  catch { throw new LearningError("附件讀取中斷，請重試", 503); }
  const reader = response.body?.getReader(), length = end - start + 1;
  try {
    if (response.status !== 206 || !reader || response.headers.get("etag") !== source.etag || response.headers.get("content-range") !== `bytes ${start}-${end}/${source.size}` || (response.headers.get("content-type") ?? "").split(";")[0].toLowerCase() !== source.mime) throw new LearningError("附件回應無法核對，請重新讀取來源", 409);
    const chunks: Uint8Array[] = []; let size = 0;
    for (;;) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > length) throw new LearningError("附件超過預期範圍", 409); chunks.push(part.value); }
    if (size !== length) throw new LearningError("附件回應不完整", 503);
    const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return new Response(bytes, { status: rangeHeader === null ? 200 : 206, headers: { "Cache-Control": "private, no-store", "Content-Type": source.mime, "Content-Length": String(size), "Accept-Ranges": "bytes", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox", "Content-Disposition": "inline", ...(rangeHeader === null ? {} : { "Content-Range": `bytes ${start}-${end}/${source.size}` }) } });
  } finally { await reader?.cancel().catch(() => {}); }
}
