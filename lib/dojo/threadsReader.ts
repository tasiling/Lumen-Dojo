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

export async function readThreadsPost(source: string): Promise<ThreadsPost | "invalid_post" | null> {
  const url = threadsPostUrl(source);
  if (!url) return null;
  try {
    const res = await fetch('https://r.jina.ai/' + url, { headers: { Accept: 'text/plain' }, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(22000) });
    if (!res.ok || !res.body) return null;
    const reader = res.body.getReader(), decoder = new TextDecoder();
    let bytes = 0, raw = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > 1048576) { await reader.cancel(); return null; }
      raw += decoder.decode(value, { stream: true });
    }
    raw += decoder.decode();
    return invalidPostPage(raw.split("Markdown Content:", 1)[0]) ? "invalid_post" : parseThreadsPost(raw, url);
  } catch { return null; }
}
