import { parseDeckDraft, wrapCardText, type DeckDraft, type CardPage, type TextFrame } from '../illustrated/model';
export type GraphicsPreview = {
    draft: DeckDraft;
    images: Record<string, string>;
    warnings: string[];
};
const obj = (x: unknown): Record<string, unknown> => x && typeof x === 'object' && !Array.isArray(x) ? x as Record<string, unknown> : {};
const txt = (x: unknown) => typeof x === 'string' ? x : '';
export function prototypeGraphics(title: string, pages: unknown): GraphicsPreview {
    if (!Array.isArray(pages) || !pages.length)
        throw Error('這份舊稿沒有圖文頁面');
    if (pages.length > 12)
        throw Error('這份舊稿超過12頁，請保留原檔並分批搬遷');
    const warnings = ['舊稿的字型與換行需在預覽核對；搬遷僅建立可編輯稿，不代表已生成或已公開。'], images: Record<string, string> = {};
    const result = pages.map((value, i): CardPage => {
        const p = obj(value), text = obj(p.text), size = p.size === 'story' ? 'story' : 'portrait', height = size === 'story' ? 1920 : 1350, template = txt(p.layout) || 'blank';
        if (!['blank', 'photo', 'dialogue', 'magazine', 'arch'].includes(template))
            throw Error(`第${i + 1}頁有未支援版型，請保留原稿`);
        const top = template === 'arch' ? 420 : template === 'photo' ? 660 : template === 'dialogue' ? 295 : template === 'magazine' ? 290 : 220;
        const frame = (v: unknown, defaults: {
            x: number;
            y: number;
            width: number;
            size: number;
            lineHeight: number;
            align: string;
        }): TextFrame => {
            const f = { ...defaults, ...obj(v) };
            for (const k of ['x', 'y', 'width', 'size', 'lineHeight'])
                if (typeof f[k as keyof typeof f] !== 'number' || !Number.isFinite(f[k as keyof typeof f]))
                    throw Error(`第${i + 1}頁排版數值無效`);
            return { x: f.x * 1080 / 100, y: f.y * height / 100 + f.size, width: f.width * 1080 / 100, fontSize: f.size, lineHeight: f.lineHeight, align: f.align as TextFrame['align'] };
        };
        const titleFrame = frame(text.title, { x: 8.333333333333334, y: top / 1350 * 100, width: 80.55, size: 70, lineHeight: 1.47, align: 'left' }), lines = wrapCardText(txt(p.title), titleFrame.width / titleFrame.fontSize);
        const bottom = titleFrame.y + Math.max(0, lines.length - 1) * titleFrame.fontSize * titleFrame.lineHeight;
        const bodyFrame = frame(text.body, { x: 8.7, y: (bottom + 70 * height / 1350) / height * 100, width: 79.63, size: 50, lineHeight: 1.52, align: 'left' });
        const id = 'legacy-page-' + (i + 1), image = txt(p.image);
        if (image) {
            if (/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=\r\n]+$/.test(image)) {
                if (image.length > 12 * 1024 * 1024)
                    throw Error(`第${i + 1}頁配圖過大，請保留原圖並另行匯入`);
                images[id] = image;
            }
            else
                warnings.push(`第${i + 1}頁的舊圖片連結無法搬遷，請重新加入原圖；沒有自動下載外部圖片。`);
        }
        return { id, title: txt(p.title), body: txt(p.body), layout: template === 'photo' ? 'image' : 'text', palette: 'blue', fit: 'cover', position: 50, image: null, typography: { schema: 1, size, title: titleFrame, body: bodyFrame }, style: { schema: 1, template: template as NonNullable<CardPage['style']>['template'], brand: p.brand === undefined ? '全零的聊解室' : txt(p.brand), footer: txt(p.footer) } };
    });
    return { draft: parseDeckDraft({ title, caption: '', pages: result }), images, warnings };
}
