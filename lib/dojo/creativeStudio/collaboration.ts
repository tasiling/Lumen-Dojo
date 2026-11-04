import { randomID } from '../weavingWorkflow/clientIdentity';
export type Research = {
    title: string;
    source: string;
    mechanism: string;
    scope: string;
    relation: string;
    use: 'background' | 'body' | 'none';
};
export type Collaboration = {
    reviewReply: string;
    aMode: string;
    aIntent: string;
    aAnswers: string;
    expression: string;
    boundary: string;
    keep: string;
    unresolved: string;
    bMode: string;
    framework: string;
    closure: string;
    practices: string;
    manuscript: string;
    editorial: string;
    cMode: 'condense' | 'expand';
    cExpandedResponse: string;
    cSource: string;
    cVersionId: string;
    cFrameworkMode: string;
    cExpandFramework: string;
    cExpandLevel: string;
    dSystems: string;
    research: Research[];
    candidates: {
        id: string;
        module: string;
        title: string;
        statement: string;
        quote: string;
        locator: string;
        sourceVersion: string;
        topicId: string;
        directionId: string;
    }[];
    rounds: {
        id: string;
        module: string;
        mode: string;
        reply: string;
        answers: string;
        sourceText: string;
        sourceVersion: string;
        settings: string;
        createdAt: string;
    }[];
};
export const frameworks = { auto: '依意圖建議', reflect: '起承轉合', diamond: '知識鑽石 2.0', single: '單一想法核心法', sb7: 'StoryBrand SB7', scqa: 'SCQA', turn: '痛點、轉折、新可能' };
export function blankCollaboration(): Collaboration { return { reviewReply: '', aMode: 'material', aIntent: '', aAnswers: '', expression: '', boundary: '', keep: '', unresolved: '', bMode: 'conservative', framework: 'auto', closure: '未定', practices: '', manuscript: '', editorial: '', cMode: 'condense', cExpandedResponse: '', cSource: '', cVersionId: '', cFrameworkMode: 'auto', cExpandFramework: 'diamond', cExpandLevel: 'standard', dSystems: '', research: [], candidates: [], rounds: [] }; }
export function normalizeCollaboration(v: unknown): Collaboration {
    const b = blankCollaboration();
    if (v === undefined)
        return b;
    if (!v || typeof v !== 'object' || Array.isArray(v))
        throw Error('協作設定格式不正確');
    const x = v as Record<string, unknown>;
    for (const k of Object.keys(b) as (keyof Collaboration)[]) {
        if (k === 'research' || k === 'rounds' || k === 'candidates')
            continue;
        if (k === 'reviewReply' && x[k] === undefined)
            continue;
        if (typeof x[k] !== 'string' || (x[k] as string).length > 80000)
            throw Error('協作文字格式或長度不正確');
        (b as unknown as Record<string, unknown>)[k] = x[k];
    }
    if (!['material', 'clarify', 'draft'].includes(b.aMode) || !['conservative', 'standard', 'focused'].includes(b.bMode) || !(b.framework in frameworks) || !['condense', 'expand'].includes(b.cMode) || !(b.cExpandFramework in frameworks) || !['auto', 'all'].includes(b.cFrameworkMode) || !['light', 'standard', 'deep'].includes(b.cExpandLevel))
        throw Error('協作選項不正確');
    for (const key of ['research', 'rounds'] as const) {
        if (!Array.isArray(x[key]) || x[key].length > 500)
            throw Error('協作清單格式或長度不正確');
    }
    b.candidates = Array.isArray(x.candidates) ? x.candidates.map(c => { if (!c || typeof c !== 'object')
        throw Error('候選格式不正確'); for (const k of ['id', 'module', 'title', 'statement', 'quote', 'locator', 'sourceVersion', 'topicId', 'directionId'])
        if (typeof c[k] !== 'string' || c[k].length > 8000)
            throw Error('候選欄位不正確'); return { ...c }; }) : [];
    b.research = (x.research as Research[]).map(r => { if (!r || !['background', 'body', 'none'].includes(r.use))
        throw Error('研究用途不正確'); for (const k of ['title', 'source', 'mechanism', 'scope', 'relation'] as const)
        if (typeof r[k] !== 'string' || r[k].length > 8000)
            throw Error('研究欄位不正確'); return { ...r }; });
    b.rounds = (x.rounds as Collaboration['rounds']).map(r => { for (const k of ['id', 'module', 'mode', 'reply', 'answers', 'sourceText', 'sourceVersion', 'settings', 'createdAt'] as const)
        if (typeof r[k] !== 'string' || r[k].length > 80000)
            throw Error('協作輪次不正確'); return { ...r }; });
    return b;
}
export function replyText(s: {
    a: string;
    b: string;
    c: string;
    d: string;
    module: string;
    collaboration: Collaboration;
}) { return s.module === 'C' && s.collaboration.cMode === 'expand' ? s.collaboration.cExpandedResponse : ({ A: s.a, B: s.b, C: s.c, D: s.d }[s.module] || ''); }
export function recordRound(s: Parameters<typeof replyText>[0], source: {
    text: string;
    versionId: string;
}, settings: string) { return { id: randomID(), module: s.module, mode: s.module === 'C' ? s.collaboration.cMode : 'main', reply: replyText(s), answers: s.collaboration.aAnswers, sourceText: source.text, sourceVersion: source.versionId, settings, createdAt: new Date().toISOString() }; }
export function collaborationInstructions(s: {
    module: string;
    collaboration: Collaboration;
    research: string;
    researchUse: string;
    examples: unknown[];
}) {
    const f = s.collaboration;
    const tasks = { A: `起點：${{ material: '素材盤點，探索候選', clarify: '釐清方向與必要時試寫', draft: '檢查草稿結構並提問' }[f.aMode]}。六段骨架只在適用時檢查。`, B: `修改幅度：${{ conservative: '保留原句', standard: '適度重寫', focused: '聚焦主線大幅收束' }[f.bMode]}；框架：${frameworks[f.framework as keyof typeof frameworks]}；主閉合：${f.closure}。研究不能代替本人確認意思，不把理論當他人動機證據。`, C: f.cMode === 'expand' ? `擴寫原稿；框架：${frameworks[f.cExpandFramework as keyof typeof frameworks]}；強度：${f.cExpandLevel}。不得補造經歷。` : `轉為一至兩頁限動，每頁150–200字；${f.cFrameworkMode === 'all' ? 'AIDA、PAS、BAB、FAB、QUEST 分別提案供本人比較' : '從 AIDA、PAS、BAB、FAB、QUEST 建議一個並說明'}。保留原意。`, D: '依固定完稿做四軸（垂直深挖、水平平移、反面驗證、跨系統嫁接）及三層（候選節點清單、跨主題連接、三分類延伸地圖）延伸；每軸先列1至2項，不是總數上限；每項附原文引句與位置。第三層使用「想更深入這個主題／想探索其他方向／準備好行動了」三分類，各選一個節點，副標30至50字，寫成機制、反差或疑問，不作優先排序。無適合節點就明示留空。跨系統資料僅使用本人提供的內容，不憑空推定。列為候選，不要求先發布。' };
    return `${tasks[s.module as keyof typeof tasks]}\n本次想談：${f.aIntent}\n本人已確認的回答：${f.aAnswers}\n表達：${f.expression}\n界線：${f.boundary}\n保留：${f.keep}\n未解：${f.unresolved}\n本人提供的行動：${f.practices}\n跨系統資料：${f.dSystems}\n研究（background僅背景、body可入正文、none不用；未核對標待查）：\n${JSON.stringify(f.research)}\n其他研究（用途 ${s.researchUse}）：${s.research}\n案例（僅adopted=true可採用；假設永遠標為假設）：\n${JSON.stringify(s.examples)}\n輸出使用固定標題：## 討論回覆、## 候選方向、## 研究參考、## 例子提案、## 編輯說明、## 候選主文。無內容的區段可留空。作者未確認的解讀保持候選。`;
}
export function parseReply(text: string) { const sections: Record<string, string> = {}; let key = ''; for (const line of text.split('\n')) {
    const match = line.match(/^\s*#{1,3}\s*(討論回覆|候選方向|研究參考|例子提案|編輯說明|候選主文)\s*$/);
    if (match) {
        key = match[1];
        sections[key] = '';
    }
    else if (key)
        sections[key] += (sections[key] ? '\n' : '') + line;
} return sections; }
