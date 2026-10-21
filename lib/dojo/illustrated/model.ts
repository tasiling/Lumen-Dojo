import { WeavingError } from '../weavingWorkflow/model';
export const DECK_PREFIX = '行光圖文稿-v1-';
export const DECK_VERSION_PREFIX = '行光圖文版本-v1-';
export const DECK_OUTPUT_PREFIX = '行光圖文成品-v1-';
export type ImageUse = { assetId: string; kind: 'generated' | 'own' | 'licensed'; tool: string; prompt: string; sourceNote: string; publicConfirmed: boolean };
export type CardPage = { id: string; title: string; body: string; layout: 'image' | 'text'; palette: 'blue' | 'sage'; fit: 'contain' | 'cover'; position: number; image: ImageUse | null };
export type DeckDraft = { title: string; caption: string; pages: CardPage[] };
export type DeckVersion = DeckDraft & { id: string; deckId: string; number: number; createdAt: string };
export type Deck = { id: string; owner: string; revision: number; completionId: string; workId: string; sourceDigest: string; currentVersionId: string; versionRefs: string[]; outputRefs: string[]; createdAt: string; updatedAt: string };
export type RenderRef = { pageId: string; assetId: string };
export type DeckOutput = { id: string; deckId: string; versionId: string; title: string; caption: string; pages: CardPage[]; renders: RenderRef[]; createdAt: string };
export type DeckBundle = { deck: Deck; version: DeckVersion; versions: DeckVersion[]; outputs: DeckOutput[] };
const obj = (v: unknown): Record<string, unknown> => { if (!v || typeof v !== 'object' || Array.isArray(v)) throw new WeavingError('圖文格式不正確'); return v as Record<string, unknown>; };
const exact = (v: Record<string, unknown>, keys: string[]) => { if (Object.keys(v).some(k => !keys.includes(k))) throw new WeavingError('圖文含有未知或受保護欄位'); };
export function cardText(v: unknown, max: number, label: string) { if (typeof v !== 'string' || v.length > max) throw new WeavingError(`${label}最多 ${max} 字`); return v; }
export function assetId(v: unknown) { if (typeof v !== 'string' || !/^[a-f0-9]{64}$/.test(v)) throw new WeavingError('圖片識別不正確'); return v; }
export function newPage(id: string): CardPage { return { id, title: '', body: '', layout: 'image', palette: 'blue', fit: 'contain', position: 50, image: null }; }
export function parseDeckDraft(value: unknown): DeckDraft {
  const v = obj(value); exact(v, ['title', 'caption', 'pages']);
  if (!Array.isArray(v.pages) || !v.pages.length || v.pages.length > 12) throw new WeavingError('圖文需要 1–12 頁');
  const ids = new Set<string>();
  const pages = v.pages.map(item => {
    const p = obj(item); exact(p, ['id','title','body','layout','palette','fit','position','image']);
    const id = cardText(p.id, 120, '頁面識別'); if (!/^[\w-]{1,120}$/.test(id) || ids.has(id)) throw new WeavingError('頁面識別無效或重複'); ids.add(id);
    if (!['image','text'].includes(String(p.layout)) || !['blue','sage'].includes(String(p.palette)) || !['contain','cover'].includes(String(p.fit)) || typeof p.position !== 'number' || !Number.isFinite(p.position) || p.position < 0 || p.position > 100) throw new WeavingError('版面設定不正確');
    let image: ImageUse | null = null;
    if (p.image !== null) { const i = obj(p.image); exact(i, ['assetId','kind','tool','prompt','sourceNote','publicConfirmed']);
      if (!['generated','own','licensed'].includes(String(i.kind)) || typeof i.publicConfirmed !== 'boolean') throw new WeavingError('圖片來源設定不正確');
      image = { assetId: assetId(i.assetId), kind: i.kind as ImageUse['kind'], tool: cardText(i.tool, 200, '圖片工具'), prompt: cardText(i.prompt, 4000, '提示詞'), sourceNote: cardText(i.sourceNote, 2000, '圖片來源'), publicConfirmed: i.publicConfirmed };
    }
    return { id, title: cardText(p.title, 120, '每頁標題'), body: cardText(p.body, 600, '每頁正文'), layout: p.layout as CardPage['layout'], palette: p.palette as CardPage['palette'], fit: p.fit as CardPage['fit'], position: p.position, image };
  });
  return { title: cardText(v.title, 200, '圖文名稱'), caption: cardText(v.caption, 5000, '配文'), pages };
}
// Conservative glyph units keep layout stable between the SVG preview and PNG export.
export function wrapCardText(text: string, units: number): string[] {
  if (!text) return [];
  const lines: string[] = []; let line = '', used = 0;
  for (const glyph of Array.from(text)) {
    if (glyph === '\n') { lines.push(line); line = ''; used = 0; continue; }
    const width = /[ -~]/.test(glyph) ? (/[MW@#]/.test(glyph) ? 1 : .65) : 1;
    if (used + width > units && line) { lines.push(line); line = ''; used = 0; }
    line += glyph; used += width;
  }
  lines.push(line); return lines;
}
export function layoutPage(page: CardPage) {
  const title = wrapCardText(page.title, 15), body = wrapCardText(page.body, 24);
  const titleLimit = page.layout === 'image' ? 2 : 4, bodyLimit = page.layout === 'image' ? 6 : 12;
  return { title, body, titleY: page.layout === 'image' ? 760 : 195, bodyY: page.layout === 'image' ? 935 : 560, overflow: title.length > titleLimit || body.length > bodyLimit, titleLimit, bodyLimit };
}
export function assertReady(draft: DeckDraft) {
  if (!draft.title.trim()) throw new WeavingError('請填圖文名稱');
  for (const [index, p] of draft.pages.entries()) {
    if (!p.title.trim() || !p.body.trim()) throw new WeavingError(`第 ${index + 1} 頁請填標題與正文`);
    if (layoutPage(p).overflow) throw new WeavingError(`第 ${index + 1} 頁文字超出版面，請拆頁或縮短文字`);
    if (p.layout === 'image' && !p.image) throw new WeavingError(`第 ${index + 1} 頁尚未加入圖片`);
    if (p.image && (!p.image.publicConfirmed || !p.image.sourceNote.trim())) throw new WeavingError(`第 ${index + 1} 頁圖片來源與公開確認尚未完成`);
  }
}
