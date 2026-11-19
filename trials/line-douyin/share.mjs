import { createHash } from 'node:crypto';

export class InputError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

export const digest = value => createHash('sha256').update(value).digest('hex');
const pages = new Set(['douyin.com', 'www.douyin.com', 'm.douyin.com', 'iesdouyin.com', 'www.iesdouyin.com']);

export function sourceUrl(value) {
  let url;
  try { url = new URL(value); } catch { return null; }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
  if (url.hostname === 'v.douyin.com' && /^\/[0-9a-z_-]{3,100}\/?$/i.test(url.pathname)) {
    return { url: 'https://v.douyin.com' + url.pathname.replace(/\/?$/, '/'), videoId: null };
  }
  const id = pages.has(url.hostname) && url.pathname.match(/^\/(?:share\/)?video\/(\d{10,22})\/?$/);
  return id ? { url: 'https://www.douyin.com/video/' + id[1], videoId: id[1] } : null;
}

export function readShare(raw, explicitNote = '') {
  if (typeof raw !== 'string' || !raw.trim() || raw.length > 10000 ||
      typeof explicitNote !== 'string' || explicitNote.length > 5000) throw new InputError('請貼上一則抖音分享文字或作品網址。');
  const text = raw.trim().replace(/\r\n?/g, '\n');
  const matches = [...text.matchAll(/https?:\/\/[^\s<>「」『』【】]+/giu)]
    .map(m => ({ original: m[0].replace(/[),.;!?，。；！？、）】》]+$/u, '') }))
    .map(m => ({ ...m, ref: sourceUrl(m.original) })).filter(m => m.ref);
  if (!matches.length) throw new InputError('目前支援抖音的影片分享短網址與作品網址。');
  if (new Set(matches.map(m => m.ref.url)).size !== 1) throw new InputError('請一次分享一支抖音影片。');
  const { ref, original } = matches[0];
  // Platform share boilerplate and attribution have their own unedited field.
  // Infer personal text only on a plain link, or when an author explicitly labels it.
  const marked = text.split('\n').filter(line => /^\s*(?:筆記|心得|感觸|我的筆記)\s*[：:]/u.test(line))
    .map(line => line.replace(/^\s*(?:筆記|心得|感觸|我的筆記)\s*[：:]\s*/u, '').trim()).filter(Boolean);
  const nativeShare = /(?:复制|複製|打开|打開).{0,16}抖音|的作品[】」]|【|#[^\s]+/u.test(text);
  const note = explicitNote.trim() || marked.join('\n') || (nativeShare ? '' : text.replace(original, '').trim());
  if (note.length > 5000) throw new InputError('筆記最多 5,000 字。');
  const title = text.match(/的作品[】」]\s*([^\n]{2,160}?)(?=\s*https?:\/\/|声[明]|聲明|$)/u)?.[1]?.trim();
  return { ...ref, raw: text, note, title: title || '抖音影片' };
}

export function validatedTranscript(data) {
  if (!data || typeof data.text !== 'string' || !data.text.trim() || data.text.length > 3_000_000 ||
      !Array.isArray(data.segments) || !data.segments.length || data.segments.length > 100000) throw new InputError('逐字稿缺少全文或時間戳。');
  let last = -1;
  for (const seg of data.segments) {
    if (!seg || !Number.isFinite(seg.start) || !Number.isFinite(seg.end) ||
        seg.start < 0 || seg.start < last || seg.end < seg.start ||
        typeof seg.text !== 'string' || !seg.text.trim()) throw new InputError('語音片段的文字或時間戳格式不符。');
    last = seg.start;
  }
  return { text: data.text.trim(), segments: data.segments.map(({start,end,text}) => ({start,end,text:text.trim()})) };
}
