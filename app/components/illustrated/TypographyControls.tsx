'use client';
import { defaultTypography, type CardPage, type PageTypography, type TextFrame } from '@/lib/dojo/illustrated/model';
export default function TypographyControls({ page, onChange }: {
    page: CardPage;
    onChange: (v: PageTypography) => void;
}) {
    const t = page.typography ?? defaultTypography(page);
    function frame(key: 'title' | 'body', patch: Partial<TextFrame>) { onChange({ ...t, [key]: { ...t[key], ...patch } }); }
    return <details className="graphic-controls"><summary>標題／正文的位置與字體</summary><label>成品尺寸<select value={t.size} onChange={e => onChange({ ...t, size: e.target.value as PageTypography['size'] })}><option value="portrait">直式圖文 · 1080 × 1350</option><option value="story">IG 限動 · 1080 × 1920</option></select></label>{(['title', 'body'] as const).map(key => <fieldset key={key}><legend>{key === 'title' ? '標題' : '正文'}</legend>{([['x', '水平位置', 36, 1008, 1], ['y', '垂直位置', 60, 1870, 1], ['width', '文字區寬度', 100, 1008, 1], ['fontSize', '字級', 16, 100, 1], ['lineHeight', '行距', 1, 2.5, .01]] as const).map(([k, label, min, max, step]) => <label key={k}>{label}<input type="number" aria-label={`${key === 'title' ? '標題' : '正文'}${label}`} min={min} max={max} step={step} value={k === 'lineHeight' ? Number(t[key][k].toFixed(2)) : t[key][k]} onChange={e => { const n = Number(e.target.value); if (Number.isFinite(n))
        frame(key, { [k]: Math.max(min, Math.min(max, n)) }); }}/></label>)}<label>對齊<select value={t[key].align} onChange={e => frame(key, { align: e.target.value as TextFrame['align'] })}><option value="left">靠左</option><option value="center">置中</option><option value="right">靠右</option></select></label></fieldset>)}<button onClick={() => onChange(defaultTypography(page))}>重設本頁文字位置</button><p>超出版面或標題與正文重疊時，請先調整再匯出。舊版設定在你調整前維持原樣。</p></details>;
}
