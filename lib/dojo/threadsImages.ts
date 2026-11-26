// Threads 貼文原圖：從公開頁面找出「這一則貼文本身」的圖片網址。純規則，不連網、不存檔。
// 兩個來源：貼文頁裡的結構化資料（能分辨是哪一則貼文、含整組輪播與順序），以及官方嵌入頁的 <img>（排除頭像與小圖）。
// 貼文頁找得到就用貼文頁；找不到才用嵌入頁。

export const THREADS_IMAGE_LIMIT = 20;

/** Only Threads' own image CDN. static.cdninstagram.com serves site assets and emoji, never post pictures. */
export function threadsImageHost(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port &&
      // external*.fbcdn.net proxies other sites' pictures, such as link previews; they are not the post's own.
      url.hostname !== "static.cdninstagram.com" && !/^external/i.test(url.hostname) && /(?:^|\.)(?:cdninstagram\.com|fbcdn\.net)$/i.test(url.hostname);
  } catch { return false; }
}

const decode = (raw: string) => raw
  .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#039;|&apos;/g, "'").replace(/&#x2F;/gi, "/")
  .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)));

function attr(tag: string, key: string): string {
  const match = new RegExp(`(?:\\s|^)${key}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i").exec(tag);
  return match ? decode(match[1] ?? match[2]) : "";
}

/** The same picture is often listed at several sizes; the address path without the query identifies it. */
const pictureKey = (value: string) => { try { return new URL(value).pathname.split("/").pop() || value; } catch { return value; } };

function unique(urls: string[]): string[] {
  const seen = new Set<string>();
  return urls.filter((url) => {
    if (!threadsImageHost(url)) return false;
    const key = pictureKey(url);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, THREADS_IMAGE_LIMIT);
}

type Candidate = { url?: unknown; width?: unknown; height?: unknown };

function largest(versions: unknown): string {
  const candidates = (versions as { candidates?: Candidate[] } | undefined)?.candidates;
  if (!Array.isArray(candidates)) return "";
  let best = "", area = -1;
  for (const item of candidates) {
    if (!item || typeof item.url !== "string") continue;
    const size = (Number(item.width) || 0) * (Number(item.height) || 0);
    if (size > area) { best = item.url; area = size; }
  }
  return best;
}

// Media types in Threads' data: 1 picture, 2 video, 8 carousel.
const isVideo = (item: Record<string, unknown>) => item.media_type === 2 || (Array.isArray(item.video_versions) && item.video_versions.length > 0);

function mediaOf(node: Record<string, unknown>): string[] {
  const carousel = node.carousel_media;
  if (Array.isArray(carousel) && carousel.length)
    return carousel.flatMap((item) => item && typeof item === "object" && !isVideo(item as Record<string, unknown>) ? [largest((item as Record<string, unknown>).image_versions2)] : []).filter(Boolean);
  if (isVideo(node)) return [];
  const one = largest(node.image_versions2);
  return one ? [one] : [];
}

/**
 * Pictures of one post from the post page's structured data: the node whose code (and author, when known) matches.
 * Returns null when the page carries no such node, so the embed page is used instead; [] when the post was found
 * and has no pictures (a text or video post).
 */
export function imagesFromPostPage(html: string, code: string, author = ""): string[] | null {
  for (const [, attributes, raw] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    if (attr(" " + attributes, "type").toLowerCase() !== "application/json" || raw.length > 2_400_000 || !raw.includes("image_versions2")) continue;
    let tree: unknown;
    try { tree = JSON.parse(raw); } catch { continue; }
    const queue: unknown[] = [tree];
    let steps = 0;
    while (queue.length && ++steps < 120_000) {
      const node = queue.pop();
      if (typeof node === "string") {
        if (node.length < 2_400_000 && node.includes("image_versions2") && /^[{[]/.test(node)) { try { queue.push(JSON.parse(node)); } catch { /* not JSON */ } }
        continue;
      }
      if (!node || typeof node !== "object") continue;
      const item = node as Record<string, unknown>;
      const user = item.user as { username?: unknown } | undefined;
      if (item.code === code && (!author || typeof user?.username !== "string" || user.username.toLowerCase() === author.toLowerCase()) &&
          ("image_versions2" in item || "carousel_media" in item)) {
        const found = unique(mediaOf(item));
        // 19 is Threads' text post. A text or video post has no pictures to save.
        if (found.length || isVideo(item) || item.media_type === 19 || Array.isArray(item.carousel_media)) return found;
      }
      for (const child of Object.values(item)) if (child && (typeof child === "object" || (typeof child === "string" && child.includes("image_versions2")))) queue.push(child);
    }
  }
  return null;
}

/** The widest picture a srcset lists, or src. */
function imageSource(tag: string): string {
  let best = attr(tag, "src"), width = 0;
  for (const part of attr(tag, "srcset").split(",")) {
    const [url, size] = part.trim().split(/\s+/);
    const w = Number.parseInt(size ?? "", 10) || 0;
    if (url && w > width) { best = url; width = w; }
  }
  return best;
}

/**
 * Pictures shown in the official embed page of one post. Profile pictures (inside a link to a profile, or named as
 * one) and small images such as emoji are left out.
 */
export function imagesFromEmbed(html: string): string[] {
  const visible = html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "");
  const anchors: boolean[] = [];
  const urls: string[] = [];
  for (const token of visible.match(/<[^>]+>/g) || []) {
    if (/^<a(?:\s|>)/i.test(token)) {
      const href = attr(token, "href");
      anchors.push(/^(?:https?:\/\/(?:www\.)?threads\.(?:com|net))?\/@[\w.]+\/?(?:[?#].*)?$/i.test(href));
      continue;
    }
    if (/^<\/a\s*>/i.test(token)) { anchors.pop(); continue; }
    if (!/^<img\b/i.test(token) || anchors.includes(true)) continue;
    if (/avatar|profile|大頭貼|頭像/i.test(attr(token, "class") + " " + attr(token, "alt"))) continue;
    const width = Number.parseInt(attr(token, "width"), 10), height = Number.parseInt(attr(token, "height"), 10);
    if ((width && width < 150) || (height && height < 150)) continue;
    urls.push(imageSource(token));
  }
  return unique(urls);
}

/** The post page's answer when it identified the post (even "no pictures"); otherwise the embed page's pictures. */
export function pickThreadsImages(page: string[] | null, embed: string[]): { urls: string[]; source: "page" | "embed" | null } {
  if (page) return { urls: page, source: "page" };
  if (embed.length) return { urls: embed, source: "embed" };
  return { urls: [], source: null };
}
