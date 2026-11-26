import "server-only";

import { appendCaptureImage, getCaptureEntry } from "./captureStore";
import { captureSourceImagesQuickReply, clipQuickReply, pushLineMessage } from "./lineClipping";
import { threadAddress } from "./threadsPage";
import { THREADS_IMAGE_LIMIT, imagesFromEmbed, imagesFromPostPage, pickThreadsImages, threadsImageHost } from "./threadsImages";

const IMAGE_MAX_BYTES = 8 * 1024 * 1024;
const IMAGE_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

async function limitedBytes(response: Response, limit: number): Promise<Uint8Array | null> {
  if (!response.body) return null;
  const reader = response.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) { await reader.cancel(); return null; }
    parts.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.length; }
  return bytes;
}

/** One public Threads page as text, or "" when it cannot be read. Redirects are not followed. */
async function page(url: string): Promise<string> {
  try {
    const response = await fetch(url, { headers: { Accept: "text/html" }, redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(10_000) });
    if (!response.ok || !(response.headers.get("content-type") || "").includes("text/html")) { await response.body?.cancel(); return ""; }
    const bytes = await limitedBytes(response, 2_400_000);
    return bytes ? new TextDecoder().decode(bytes) : "";
  } catch { return ""; }
}

/** One picture from Threads' image CDN. Throws a sentence the owner can read. */
async function picture(url: string): Promise<{ bytes: ArrayBuffer; mimeType: string; extension: string }> {
  if (!threadsImageHost(url)) throw new Error("圖片不在 Threads 的圖片網址上。");
  const response = await fetch(url, { headers: { Accept: "image/jpeg,image/png,image/webp" }, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(15_000) });
  const mimeType = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (!response.ok) { await response.body?.cancel(); throw new Error(`Threads 圖片回傳 HTTP ${response.status}。`); }
  if (!IMAGE_TYPES[mimeType]) { await response.body?.cancel(); throw new Error("Threads 回傳的不是圖片。"); }
  const bytes = await limitedBytes(response, IMAGE_MAX_BYTES);
  if (!bytes) throw new Error("圖片超過 8 MB。");
  return { bytes: bytes.buffer as ArrayBuffer, mimeType, extension: IMAGE_TYPES[mimeType] };
}

/**
 * Saves the pictures of a clipped Threads post onto its capture, as if the owner had sent them as screenshots,
 * then tells the owner on LINE. Runs after the clipping reply. Text-only posts end quietly. Never reads the text in
 * the pictures; that stays the owner's choice.
 */
export async function saveThreadsImages(captureId: string): Promise<void> {
  let { capture } = await getCaptureEntry(captureId);
  const address = threadAddress(capture.clip.threadsPost?.canonicalUrl || capture.sourceUrl);
  if (!address?.code) return;
  if (capture.clip.attachments.some((item) => item.sourceMessageId.startsWith(`threads:${address.code}:`))) return;
  const room = THREADS_IMAGE_LIMIT - capture.clip.attachments.length;
  if (room <= 0) return;

  const [embedHtml, pageHtml] = await Promise.all([
    page(`https://www.threads.com/t/${address.code}/embed/`),
    address.author ? page(address.url) : Promise.resolve(""),
  ]);
  const fromPage = pageHtml ? imagesFromPostPage(pageHtml, address.code, address.author) : null;
  const fromEmbed = embedHtml ? imagesFromEmbed(embedHtml) : [];
  const chosen = pickThreadsImages(fromPage, fromEmbed);
  const urls = chosen.urls.slice(0, room);
  let saved = 0;
  const problems: string[] = [];
  for (const [index, url] of urls.entries()) {
    try {
      const image = await picture(url);
      capture = await appendCaptureImage({
        capture, bytes: image.bytes, mimeType: image.mimeType, fromSource: true,
        filename: `threads-${address.code}-${index + 1}.${image.extension}`, sourceMessageId: `threads:${address.code}:${index + 1}`,
      });
      saved++;
    } catch (error) {
      problems.push(error instanceof Error && /[㐀-鿿]/.test(error.message) ? error.message : "下載或保存沒有完成。");
    }
  }
  // Counts only, so the first real posts show whether the public pages give the whole carousel.
  console.info("[threads-images]", JSON.stringify({
    code: address.code, page: { read: Boolean(pageHtml), identified: fromPage !== null, found: fromPage?.length ?? 0 }, embed: { read: Boolean(embedHtml), found: fromEmbed.length },
    used: chosen.source, saved, failed: problems.length, skipped: chosen.urls.length - urls.length,
  }));
  if (!urls.length) return;

  const title = `「${capture.title}」`;
  if (!saved) {
    await pushLineMessage([`這則 Threads 貼文有 ${urls.length} 張圖片，但沒有存下來。`, `原因：${problems[0]}`,
      `可以按「補截圖」把圖片傳進${title}。`].join("\n"), clipQuickReply(capture.id, true)).catch(() => undefined);
    return;
  }
  const missing = urls.length - saved;
  await pushLineMessage([
    `已把 Threads 貼文的 ${saved} 張圖片存進${title}。`,
    missing ? `另有 ${missing} 張沒有取得（${problems[0]}），可以按「補截圖」補上。` : "",
    "張數請對照原貼文；若少了，可以用「補截圖」補上。",
    "圖裡有重要文字時，可以按「讀取圖片文字」請 AI 讀出來，核對後才會帶進淬鍊。",
  ].filter(Boolean).join("\n"), missing ? clipQuickReply(capture.id, true) : captureSourceImagesQuickReply(capture.id)).catch(() => undefined);
}
