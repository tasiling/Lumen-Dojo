import type { StudioData } from './model';
import { cBase, parseReply, replyText, type Research } from './collaboration';
import { randomID } from '../weavingWorkflow/clientIdentity';
export type ReplyPreview = {
    module: StudioData['module'];
    mode: string;
    reply: string;
    source: {
        versionId: string;
        text: string;
    };
    sections: Record<string, string>;
    research: Research[];
    examples: StudioData['examples'];
    candidates: StudioData['collaboration']['candidates'];
    warnings: string[];
};
const obj = (v: unknown): Record<string, unknown> | null => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null;
const str = (v: unknown) => typeof v === 'string' ? v : '';
function array(text: string): unknown[] | null {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i), data = fenced?.[1] ?? text.trim();
    try {
        const v = JSON.parse(data);
        return Array.isArray(v) ? v : null;
    }
    catch {
        return null;
    }
}
const value = (row: Record<string, unknown>, ...keys: string[]) => keys.map(k => str(row[k])).find(Boolean) || '';
function labelled(text: string): Record<string, string> {
    const row: Record<string, string> = {};
    let field = '';
    for (const line of text.split('\n')) {
        const m = line.match(/^\s*(?:[-*]\s*)?(?:\*\*)?(出處|來源|連結|機制|適用範圍與限制|適用範圍|限制|與素材的關聯|素材關聯|種類|類型|文字|內容|來源原句|原句|位置|段落|理解|問題|角度|名稱|標題)(?:\*\*)?\s*[：:]\s*(.*)$/);
        if (m) {
            field = m[1];
            row[field] = m[2];
        }
        else if (field)
            row[field] += '\n' + line;
    }
    return row;
}
function entries(text: string, prefix: string): Record<string, unknown>[] {
    const parsed = array(text);
    if (parsed)
        return parsed.map(obj).filter((x): x is Record<string, unknown> => !!x);
    const blocks = text.split(new RegExp(`(?=^\\s*(?:#{1,4}\\s*)?${prefix}[0-9０-９]+\\s*[｜|：:．.、-])`, 'm'));
    return blocks.flatMap(block => { const lines = block.trim().split('\n'); const head = lines.shift()?.match(new RegExp(`^\\s*(?:#{1,4}\\s*)?${prefix}[0-9０-９]+\\s*[｜|：:．.、-]\\s*(.*)`)); return head ? [{ title: head[1], ...labelled(lines.join('\n')) }] : []; });
}
function originalCandidates(reply: string, module: string): Record<string, unknown>[] {
    if (module === 'A') {
        const fenced = [...reply.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)].map(x => x[1]);
        for (const text of [reply.trim(), ...fenced]) {
            try {
                const data = obj(JSON.parse(text));
                if (Array.isArray(data?.candidates))
                    return data.candidates.map(obj).filter((x): x is Record<string, unknown> => !!x);
            }
            catch { /* Free discussion stays in the unchanged raw reply. */ }
        }
        return [];
    }
    if (module !== 'D')
        return [];
    const axes = ['垂直深挖', '水平平移', '反面驗證', '跨系統嫁接'], records: Record<string, unknown>[] = [];
    let axis = '', block: string[] = [];
    const flush = () => {
        const at = block.findIndex(line => /^來源[：:]/.test(line));
        if (axis && at >= 2) {
            const source = block.slice(at).join('\n').replace(/^來源[：:]\s*/, '');
            records.push({ title: block[0], statement: block.slice(1, at).join('\n'), quote: source, locator: source.match(/第\s*[0-9一二三四五六七八九十]+\s*段/)?.[0] || '' });
        }
        block = [];
    };
    for (const raw of reply.split('\n')) {
        const line = raw.trim().replace(/^#{1,6}\s*/, '').replace(/\*\*/g, '').replace(/^[-*]\s+/, '');
        if (/第[二三23]層/.test(line)) {
            flush();
            break;
        }
        if (!line || /第一層|第1層/.test(line))
            continue;
        const name = line.replace(/^[一二三四1-4][、.．)）]\s*/, '').replace(/[：:]$/, '');
        if (axes.includes(name)) {
            flush();
            axis = name;
            continue;
        }
        if (axis) {
            block.push(line);
            if (/^來源[：:]/.test(line))
                flush();
        }
    }
    flush();
    return records;
}
export function replySource(s: StudioData) {
    return s.module === 'C' ? cBase(s.collaboration) : { versionId: s.module === 'D' ? '' : s.source.selectedVersion, text: s.module === 'B' ? [s.source.selected, s.body ? '目前主稿：\n' + s.body : ''].filter(Boolean).join('\n\n') : s.module === 'A' && s.collaboration.aMode === 'draft' ? s.body || s.source.selected : s.source.selected };
}
export function previewReply(s: StudioData, source = replySource(s)): ReplyPreview {
    const reply = replyText(s), sections = parseReply(reply), warnings: string[] = [], research: Research[] = [], examples: StudioData['examples'] = [], candidates: ReplyPreview['candidates'] = [];
    const rs = sections['研究參考'] || '';
    for (const r of entries(rs, 'R')) {
        const title = value(r, 'title', '名稱', '標題'), source = value(r, 'source', '出處', '來源', '連結');
        if (!title) {
            warnings.push('一筆研究缺少名稱，保留在完整回覆中。');
            continue;
        }
        research.push({ title, source, mechanism: value(r, 'mechanism', '機制'), scope: value(r, 'scope', '適用範圍與限制', '適用範圍', '限制'), relation: value(r, 'relation', '與素材的關聯', '素材關聯'), use: 'background' });
    }
    if (rs.trim() && !research.length)
        warnings.push('研究段落未能逐筆辨識，請手動整理或請 AI 按固定欄位重排。');
    for (const r of entries(sections['例子提案'] || '', 'E')) {
        const type = value(r, 'kind', '種類', '類型'), kind = ({ experience: 'experience', original: 'experience', '本人真實經驗': 'experience', '原始經歷': 'experience', external: 'external', '外部案例': 'external', hypothetical: 'hypothetical', '假設例子': 'hypothetical', metaphor: 'metaphor', '比喻': 'metaphor' } as const)[type];
        const text = value(r, 'text', '文字', '內容');
        if (!kind || !text) {
            warnings.push('一筆例子缺少明確種類或文字，未自動加入。');
            continue;
        }
        examples.push({ kind, text, source: value(r, 'source', '來源', '出處'), module: s.module, mode: s.module === 'C' ? s.collaboration.cMode : '', adopted: false });
    }
    const candidateRows = entries(sections['候選方向'] || '', '[ADN]');
    for (const r of candidateRows.length ? candidateRows : originalCandidates(reply, s.module)) {
        const title = value(r, 'title', '名稱', '標題'), statement = value(r, 'statement', 'understanding', '理解', '問題', '角度');
        if (!title || !statement) {
            warnings.push('一個候選缺少名稱或理解，未自動加入。');
            continue;
        }
        candidates.push({ id: randomID(), module: s.module === 'D' ? 'D' : 'A', title, statement, quote: value(r, 'quote', 'originalQuote', '來源原句', '原句'), locator: value(r, 'locator', 'quoteLocator', '位置', '段落'), sourceVersion: '', topicId: '', directionId: '' });
    }
    if (!Object.keys(sections).length)
        warnings.push('沒有辨識到固定段落標題；完整回覆仍可保存，不會自動改動主稿。');
    return { module: s.module, mode: s.collaboration.cMode, reply, source: { ...source }, sections, research, examples, candidates, warnings };
}
export function applyReplyPreview(s: StudioData, p: ReplyPreview, sourceVersion: string, include = { research: true, examples: true, candidates: true }, sourceText = replySource(s).text): Partial<StudioData> {
    if (p.module !== s.module || p.mode !== s.collaboration.cMode || p.reply !== replyText(s) || p.source.versionId !== sourceVersion || p.source.text !== sourceText)
        throw Error('模組、模式、回覆或來源已變更，請重新辨識再確認。');
    const f = structuredClone(s.collaboration), examples = structuredClone(s.examples);
    if (include.research)
        for (const r of p.research)
            if (!f.research.some(x => x.title === r.title && x.source === r.source))
                f.research.push({ ...r, use: 'background' });
    if (include.examples)
        for (const e of p.examples)
            if (!examples.some(x => x.kind === e.kind && x.text === e.text && x.source === e.source && x.module === e.module && x.mode === e.mode))
                examples.push({ ...e, adopted: false });
    if (include.candidates)
        for (const c of p.candidates)
            if (!f.candidates.some(x => x.module === c.module && x.title === c.title && x.statement === c.statement && x.quote === c.quote))
                f.candidates.push({ ...c, sourceVersion });
    if (p.sections['候選主文']?.trim()) {
        if (s.module === 'B')
            f.manuscript = p.sections['候選主文'];
        if (s.module === 'C' && f.cMode === 'condense')
            f.cManuscript = p.sections['候選主文'];
        if (s.module === 'C' && f.cMode === 'expand')
            f.cExpandedManuscript = p.sections['候選主文'];
    }
    if (s.module === 'B' && p.sections['編輯說明'] !== undefined)
        f.editorial = p.sections['編輯說明'];
    return { collaboration: f, examples };
}
