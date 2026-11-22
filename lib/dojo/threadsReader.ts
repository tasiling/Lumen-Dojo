import { extractThreadBody, fullCaption, samePost, sourceMeta, threadAddress, threadCanonical, type ThreadAddress } from './threadsPage';

/** Extract only the public post identified by its permalink, before replies and recommendations. */
export function threadsPostUrl(value: string): string | null {
  try {
    const u = new URL(value);
    if (!/^https?:$/.test(u.protocol) || !/^(www\.)?threads\.(com|net)$/.test(u.hostname) || u.password || u.username || u.port) return null;
    if (!/^\/(share\/[\w-]+|@[\w.]+\/post\/[\w-]+)\/?$/.test(u.pathname)) return null;
    return 'https://' + u.hostname + u.pathname.replace(/\/$/, '');
  } catch { return null; }
}

export type ThreadsPost = { text: string; canonicalUrl: string; partial: boolean };

export function parseThreadsPost(raw: string, source: string): ThreadsPost | null {
  const at = raw.indexOf('Markdown Content:');
  const url = threadsPostUrl(source);
  if (!url || at < 0) return null;
  const header = raw.slice(0, at);
  const body = raw.slice(at + 'Markdown Content:'.length).split(/^\s*(?:#{1,4}\s*)?(?:Related threads|相關串文|相關貼文)\s*$/im)[0];
  if (invalidPostPage(header) || /^Title: Threads\s*[•·|]\s*(?:Log in|登入)/im.test(header)) return null;
  const target = url.includes('/post/') ? url : threadsPostUrl(header.match(/^Final URL:\s*(\S+)/m)?.[1] || '')
    || threadsPostUrl(body.match(/^#{1,3} \[(?:Thread|串文)\]\(([^)]+)\)/m)?.[1] || '');
  if (!target?.includes('/post/')) return null;
  const path = new URL(target).pathname;
  const lines = body.split(/\r?\n/);
  const start = lines.findIndex(line => {
    const href = line.trim().match(/^\[[^\]]+\]\((https?:\/\/[^)]+)\)$/)?.[1];
    const link = href && threadsPostUrl(href);
    return link && new URL(link).pathname === path;
  });
  if (start < 0) return null;
  const content: string[] = [];
  for (const line of lines.slice(start + 1)) {
    const s = line.trim();
    if (/^(Translate|See translation|翻譯|查看翻譯|View activity|Log in (?:or|to)|登入以|\[Log in|\[登入|\[?!\[Image|\[Video \d+\]|#{1,3} \[Thread\])/i.test(s)) break;
    if (/^\[[^\]]+\]\(https:\/\/(?:www\.)?threads\.(?:net|com)\/@[^)]+\)$/.test(s)) break;
    content.push(line);
  }
  const text = content.join('\n').trim().replace(/(?:\n\s*\d[\d.,]*[KMB]?\s*)+$/i, '').trim()
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '$1 ($2)').replace(/\n{3,}/g, '\n\n');
  if (!text || /^(?:Threads|Log in|登入|Sign up|[\d.,]+[KMB]?)$/i.test(text)) return null;
  return { canonicalUrl: target, text: text.slice(0, 12000), partial: text.length > 12000 || /(?:…|\.\.\.|See more|顯示更多)$/.test(text) || /^Warning:/m.test(header) };
}

function invalidPostPage(raw: string): boolean {
  const final = raw.match(/^Final URL:\s*(\S+)/m)?.[1];
  if (!final) return false;
  try {
    const url = new URL(final);
    return /^(www\.)?threads\.(com|net)$/.test(url.hostname) && url.searchParams.get('error') === 'invalid_post';
  } catch { return false; }
}

/** Where a read stopped, in the order the steps run. */
export type ThreadsReadStep = "resolve" | "embed" | "verify" | "fallback";
export type ThreadsReadFailure = { step: ThreadsReadStep; reason: string };
export type ThreadsRead = {
  post: ThreadsPost | null;
  /** Threads redirected the link to its "invalid post" page. */
  invalid: boolean;
  /** Why the official pages gave no text; set even when the fallback then succeeded. */
  failure: ThreadsReadFailure | null;
  /** Whether the r.jina.ai fallback also ran and found nothing. */
  fallbackFailed: boolean;
  /** The text came from r.jina.ai, which joins a post's paragraphs into one line. */
  viaFallback: boolean;
};

const stepLabels: Record<ThreadsReadStep, string> = {
  resolve: "解析分享連結",
  embed: "讀取官方嵌入頁",
  verify: "以貼文頁核對原文",
  fallback: "備援轉讀",
};

/** One sentence for the owner saying which step stopped and why. */
export function threadsFailureLine(read: Pick<ThreadsRead, "failure" | "fallbackFailed">): string {
  if (!read.failure) return read.fallbackFailed ? "備援轉讀沒有取得主文。" : "";
  return `停在「${stepLabels[read.failure.step]}」：${read.failure.reason}${read.fallbackFailed ? "備援轉讀也沒有取得主文。" : ""}`;
}

class ReadStop extends Error {
  constructor(readonly step: ThreadsReadStep, reason: string, readonly invalid = false) {
    super(reason);
  }
}

async function limitedText(stream: ReadableStream<Uint8Array> | null, limit: number): Promise<string | null> {
  if (!stream) return null;
  const reader = stream.getReader(), decoder = new TextDecoder();
  let bytes = 0, raw = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.length;
    if (bytes > limit) { await reader.cancel(); return null; }
    raw += decoder.decode(value, { stream: true });
  }
  return raw + decoder.decode();
}

type Fetched = { html: string; redirect: ThreadAddress | null; invalid: boolean };

/** One public Threads page. Redirects are returned, never followed, so every request stays on threads.com. */
async function threadsPage(url: string, deadline: AbortSignal): Promise<Fetched> {
  const res = await fetch(url, { headers: { Accept: 'text/html' }, redirect: 'manual', cache: 'no-store',
    signal: AbortSignal.any([deadline, AbortSignal.timeout(9000)]) });
  if ([301, 302, 303, 307, 308].includes(res.status)) {
    const location = res.headers.get('location');
    await res.body?.cancel();
    let target: URL | null = null;
    try { target = location ? new URL(location, url) : null; } catch { /* treated as an unusable redirect */ }
    return { html: '', redirect: target ? threadAddress(target.href) : null,
      invalid: Boolean(target && /^(www\.)?threads\.(com|net)$/.test(target.hostname) && target.searchParams.get('error') === 'invalid_post') };
  }
  if (!res.ok || !(res.headers.get('content-type') || '').toLowerCase().includes('text/html')) {
    await res.body?.cancel();
    throw new Error(`Threads 回傳 HTTP ${res.status}，沒有提供公開頁面。`);
  }
  const html = await limitedText(res.body, 2400000);
  if (html === null) throw new Error('頁面超過單篇讀取範圍。');
  return { html, redirect: null, invalid: false };
}

const reasonOf = (error: unknown) => error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')
  ? 'Threads 回應逾時。'
  : error instanceof Error && /[\u3400-\u9fff]/.test(error.message) ? error.message : '連不上 Threads。';

const comparable = (text: string) => text.split(/\s+/).filter(Boolean).join(' ');

/**
 * Reads one post from Threads' own pages: resolve the link to the post's code, read threads.com/t/<code>/embed,
 * and check against the post page's structured caption or og fields when the embed is clipped or unattributed.
 */
async function readOfficial(start: ThreadAddress): Promise<ThreadsPost> {
  const deadline = AbortSignal.timeout(24000);
  let point: ThreadAddress | null = start;
  const seen = new Set<string>();
  for (let hop = 0; point && !point.code; hop++) {
    if (hop >= 4 || seen.has(point.url)) throw new ReadStop('resolve', '分享連結沒有導向任何貼文。');
    seen.add(point.url);
    let fetched: Fetched;
    try { fetched = await threadsPage(point.url + '/', deadline); }
    catch (error) { throw new ReadStop('resolve', reasonOf(error)); }
    if (fetched.invalid) throw new ReadStop('resolve', 'Threads 將這條連結導向無效貼文頁。', true);
    point = fetched.redirect || threadAddress(sourceMeta(fetched.html, 'og:url'));
  }
  if (!point) throw new ReadStop('resolve', '分享連結沒有導向任何貼文。');

  let embed: string;
  try { embed = (await threadsPage(`https://www.threads.com/t/${point.code}/embed/?utm_source=th_embed&utm_campaign=threads_api`, deadline)).html; }
  catch (error) { throw new ReadStop('embed', reasonOf(error)); }
  const rendered = extractThreadBody(embed, point);
  const source = rendered.address || point;
  if (rendered.text && rendered.address) return post(rendered.text, rendered.address.url, false);

  // The embed was clipped, showed several bodies, or did not name the post: check against the post page.
  const emptyEmbed = rendered.text ? '官方嵌入頁沒有標明這則貼文的網址。' : '官方嵌入頁沒有可辨認的單一主文。';
  if (!source.author) throw new ReadStop('embed', emptyEmbed);
  let page: string;
  try { page = (await threadsPage(source.url, deadline)).html; }
  catch (error) { throw new ReadStop('verify', reasonOf(error)); }
  const canonical = threadCanonical(page);
  if (!canonical?.author || !samePost(canonical, source)) throw new ReadStop('verify', '貼文頁沒有提供與這則貼文相符的網址。');
  const caption = fullCaption(page, canonical);
  if (caption) return post(caption, canonical.url, false);
  const description = sourceMeta(page, 'og:description');
  if (rendered.text && description && comparable(rendered.text) === comparable(description)) return post(rendered.text, canonical.url, false);
  // The og description is a preview Threads may shorten, so it is kept as a partial text to check against the post.
  if (description.trim()) return post(description, canonical.url, true);
  throw new ReadStop('verify', '已確認貼文網址，但 Threads 沒有提供可讀的主文。');
}

function post(text: string, canonicalUrl: string, partial: boolean): ThreadsPost {
  const clean = text.replace(/\r\n?|[\u2028\u2029]/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!clean) throw new ReadStop('embed', '官方嵌入頁沒有可辨認的單一主文。');
  return { canonicalUrl, text: clean.slice(0, 12000), partial: partial || clean.length > 12000 };
}

/** The earlier reader, kept as the fallback: r.jina.ai renders the whole page and the target post is searched in it. */
async function readThroughJina(url: string): Promise<ThreadsPost | "invalid_post" | null> {
  try {
    const res = await fetch('https://r.jina.ai/' + url, { headers: { Accept: 'text/plain' }, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(22000) });
    if (!res.ok) return null;
    const raw = await limitedText(res.body, 1048576);
    if (raw === null) return null;
    return invalidPostPage(raw.split("Markdown Content:", 1)[0]) ? "invalid_post" : parseThreadsPost(raw, url);
  } catch { return null; }
}

/** Reads a post and reports which step stopped when the official pages gave no full text. */
export async function readThreadsPostDetailed(source: string): Promise<ThreadsRead> {
  const url = threadsPostUrl(source);
  const start = url && threadAddress(url);
  if (!url || !start) return { post: null, invalid: false, failure: { step: 'resolve', reason: '這不是 Threads 貼文或分享連結。' }, fallbackFailed: false, viaFallback: false };
  let official: ThreadsPost | null = null;
  let failure: ThreadsReadFailure | null = null;
  let invalid = false;
  try {
    official = await readOfficial(start);
    if (!official.partial) return { post: official, invalid: false, failure: null, fallbackFailed: false, viaFallback: false };
    failure = { step: 'verify', reason: 'Threads 只提供了預覽文字，未能核對完整主文。' };
  } catch (error) {
    if (!(error instanceof ReadStop)) failure = { step: 'embed', reason: reasonOf(error) };
    else { failure = { step: error.step, reason: error.message }; invalid = error.invalid; }
  }
  const fallback = await readThroughJina(url);
  if (fallback && fallback !== "invalid_post" && (!fallback.partial || !official))
    return { post: fallback, invalid: false, failure, fallbackFailed: false, viaFallback: true };
  return { post: official, invalid: !official && (invalid || fallback === "invalid_post"), failure, fallbackFailed: true, viaFallback: false };
}

/** Same result shape as before the official-embed reader: the post, "invalid_post", or null. */
export async function readThreadsPost(source: string): Promise<ThreadsPost | "invalid_post" | null> {
  const read = await readThreadsPostDetailed(source);
  return read.post ?? (read.invalid ? "invalid_post" : null);
}

/**
 * The status line of a LINE reply about a Threads clip. A first failure says where the read stopped and offers a
 * retry; a repeated one (retry pressed, or the same link sent again) suggests a screenshot or pasted text instead.
 */
export function threadsReplyStatus({ post, failed, invalid, repeated, reason, viaFallback = false }: {
  post: Pick<ThreadsPost, "partial"> | null | undefined; failed: boolean; invalid: boolean; repeated: boolean; reason: string; viaFallback?: boolean;
}): string {
  if (post && failed) return ["本次未能更新，已保留之前的文字。", reason].filter(Boolean).join("\n");
  if (post && viaFallback && !post.partial) return "已由備援轉讀取得貼文原文。備援不保留段落換行，分段請對照原貼文。";
  if (post) return post.partial ? ["已取得部分貼文文字，請核對原文。", reason].filter(Boolean).join("\n") : "已取得貼文原文。";
  const lines = ["網址已存，原文待補。", reason];
  if (invalid) lines.push("若 App 裡仍可開啟這則貼文，請從原貼文重新複製連結。");
  else if (repeated) lines.push("已連續讀取失敗，再試多半結果相同。建議點「補截圖」把貼文截圖補進這筆素材，或點「繼續探索」開啟素材，把貼文文字貼進摘錄。");
  else lines.push("可點「重新擷取原文」再試一次。");
  return lines.filter(Boolean).join("\n");
}
