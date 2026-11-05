import { responseOrigin, type TaskTicket } from './tasks';
import type { StudioData } from './model';
import { prototypeTaskSpecifications } from './prototypeSpecifications';
import { WeavingError } from '../weavingWorkflow/model';
import { randomID, sha256Text } from '../weavingWorkflow/clientIdentity';
import { targetInstructions, type WritingPlatform } from './targets';
export type Research = {
    title: string;
    source: string;
    mechanism: string;
    scope: string;
    relation: string;
    use: 'background' | 'body' | 'none';
    chosen?: boolean;
};
export type Collaboration = {
    tasks: TaskTicket[];
    responseTasks: Record<string, string>;
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
    manuscriptReplyDigest: string;
    researchMode: 'suggest' | 'skip';
    researchStatus: 'not-started' | 'candidates' | 'reported-none' | 'unverified' | 'skipped';
    researchReport: string;
    editorial: string;
    cMode: 'condense' | 'expand';
    cExpandedResponse: string;
    cManuscript: string;
    cExpandedManuscript: string;
    cExpandedSource: string;
    cExpandedVersionId: string;
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
        taskSignature?: string;
        taskId?: string;
    }[];
};
export const frameworks = { auto: '依意圖建議', reflect: '起承轉合', diamond: '知識鑽石 2.0', single: '單一想法核心法', sb7: 'StoryBrand SB7', scqa: 'SCQA', turn: '痛點、轉折、新可能' };
export function blankCollaboration(): Collaboration { return { tasks: [], responseTasks: {}, reviewReply: '', aMode: 'material', aIntent: '', aAnswers: '', expression: '', boundary: '', keep: '', unresolved: '', bMode: 'conservative', framework: 'auto', closure: '未定', practices: '', manuscript: '', manuscriptReplyDigest: '', researchMode: 'suggest', researchStatus: 'not-started', researchReport: '', editorial: '', cMode: 'condense', cExpandedResponse: '', cManuscript: '', cExpandedManuscript: '', cExpandedSource: '', cExpandedVersionId: '', cSource: '', cVersionId: '', cFrameworkMode: 'auto', cExpandFramework: 'diamond', cExpandLevel: 'standard', dSystems: '', research: [], candidates: [], rounds: [] }; }
export function normalizeCollaboration(v: unknown): Collaboration {
    const b = blankCollaboration();
    if (v === undefined)
        return b;
    if (!v || typeof v !== 'object' || Array.isArray(v))
        throw Error('協作設定格式不正確');
    const x = v as Record<string, unknown>;
    for (const k of Object.keys(b) as (keyof Collaboration)[]) {
        if (k === 'research' || k === 'rounds' || k === 'candidates' || k === 'tasks' || k === 'responseTasks')
            continue;
        if (['reviewReply', 'cManuscript', 'cExpandedManuscript', 'cExpandedSource', 'cExpandedVersionId', 'manuscriptReplyDigest', 'researchMode', 'researchStatus', 'researchReport'].includes(k) && x[k] === undefined)
            continue;
        if (typeof x[k] !== 'string' || (x[k] as string).length > 80000)
            throw Error('協作文字格式或長度不正確');
        (b as unknown as Record<string, unknown>)[k] = x[k];
    }
    if (!['suggest', 'skip'].includes(b.researchMode) || !['not-started', 'candidates', 'reported-none', 'unverified', 'skipped'].includes(b.researchStatus)) throw Error('研究查找設定不正確');
    if (!['material', 'clarify', 'draft'].includes(b.aMode) || !['conservative', 'standard', 'focused'].includes(b.bMode) || !(b.framework in frameworks) || !['condense', 'expand'].includes(b.cMode) || !(b.cExpandFramework in frameworks) || !['auto', 'all'].includes(b.cFrameworkMode) || !['light', 'standard', 'deep'].includes(b.cExpandLevel))
        throw Error('協作選項不正確');
    for (const key of ['research', 'rounds'] as const) {
        if (!Array.isArray(x[key]) || x[key].length > 500)
            throw Error('協作清單格式或長度不正確');
    }
    if (x.tasks !== undefined && (!Array.isArray(x.tasks) || x.tasks.length > 500)) throw Error('協作任務清單不正確');
    b.tasks = (Array.isArray(x.tasks) ? x.tasks : []).map((t: TaskTicket) => {
        for (const k of ['id','key','sourceText','sourceVersion','answers','settings','signature','createdAt'] as const)
            if (typeof t[k] !== 'string' || t[k].length > (k === 'settings' ? 4000000 : 160000)) throw Error('協作任務快照不正確');
        if(t.prompt!==undefined && (typeof t.prompt!=='string'||t.prompt.length>4000000))throw Error('協作完整指令不正確');
        return { ...t };
    });
    if (x.responseTasks !== undefined && (!x.responseTasks || typeof x.responseTasks !== 'object' || Array.isArray(x.responseTasks))) throw Error('回覆任務對應不正確');
    b.responseTasks = Object.fromEntries(Object.entries(x.responseTasks || {}).map(([k,v]) => { if (typeof v !== 'string' || v.length > 120) throw Error('回覆任務對應不正確'); return [k,v]; }));
    b.candidates = Array.isArray(x.candidates) ? x.candidates.map(c => {
        if (!c || typeof c !== 'object')
            throw Error('候選格式不正確');
        for (const k of ['id', 'module', 'title', 'statement', 'quote', 'locator', 'sourceVersion', 'topicId', 'directionId'])
            if (typeof c[k] !== 'string' || c[k].length > 8000)
                throw Error('候選欄位不正確');
        return { ...c };
    }) : [];
    b.research = (x.research as Research[]).map(r => {
        if (r.chosen !== undefined && typeof r.chosen !== 'boolean') throw Error('研究採用確認格式不正確');
        if (!r || !['background', 'body', 'none'].includes(r.use))
            throw Error('研究用途不正確');
        for (const k of ['title', 'source', 'mechanism', 'scope', 'relation'] as const)
            if (typeof r[k] !== 'string' || r[k].length > 8000)
                throw Error('研究欄位不正確');
        return { ...r };
    });
    b.rounds = (x.rounds as Collaboration['rounds']).map(r => {
        for (const k of ['id', 'module', 'mode', 'reply', 'answers', 'sourceText', 'sourceVersion', 'settings', 'createdAt'] as const)
            if (typeof r[k] !== 'string' || r[k].length > (k === 'settings' ? 4000000 : k === 'sourceText' ? 160000 : 80000))
                throw Error('協作輪次不正確');
        return { ...r };
    });
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
export function recordRound(s: StudioData, source: { text: string; versionId: string }, settings: string) {
    const origin = responseOrigin(s);
    return { id: randomID(), module: s.module, mode: s.module === 'C' ? s.collaboration.cMode : 'main', reply: replyText(s), answers: origin?.answers ?? s.collaboration.aAnswers, sourceText: origin?.sourceText ?? source.text, sourceVersion: origin?.sourceVersion ?? source.versionId, settings: origin?.settings ?? settings, taskSignature: origin?.signature || '', taskId: origin?.id || '', createdAt: new Date().toISOString() };
}
export function collaborationInstructions(s: {
    module: string;
    collaboration: Collaboration;
    research: string;
    researchUse: string;
    examples: StudioData['examples'];
    contentKind?: string;
    platform?: string;
    targetPlatforms?: WritingPlatform[];
}) {
    const f = s.collaboration;
    const tasks = { A: `起點：${{ material: '素材盤點，探索候選', clarify: '釐清方向與必要時試寫', draft: '檢查草稿結構並提問' }[f.aMode]}。六段骨架只在適用時檢查。`, B: `修改幅度：${{ conservative: '保留原句', standard: '適度重寫', focused: '聚焦主線大幅收束' }[f.bMode]}；框架：${frameworks[f.framework as keyof typeof frameworks]}；主閉合：${f.closure}。研究不能代替本人確認意思，不把理論當他人動機證據。`, C: f.cMode === 'expand' ? `擴寫原稿；框架：${frameworks[f.cExpandFramework as keyof typeof frameworks]}；強度：${f.cExpandLevel}。不得補造經歷。` : '轉製金句型限動；保留原意。', D: '依固定完稿做四軸三層延伸；每軸先列1至2項，不是總數上限；每項附原文引句與位置。列為候選，不要求先發布。' };
    const discovery = s.module === 'B' ? (f.researchMode === 'skip' ? '本輪由本人選擇暫不找研究；不可將沒有查找寫成查無資料。保留先前研究與用途決定。' : '即使草稿沒有研究資料，也請主動提出有幫助的研究候選。先依本文問題找能解釋機制、補充背景或檢查理解的可靠資料，不為湊數強加理論；必要時提出查找問題。可檢索時提供可核對出處、實際查找範圍及限制；無法檢索時明說「無法檢索，待查」，只列待查線索，不冒稱已查證、不得編造來源。逐筆說明 title/source/mechanism/scope/relation，不替本人決定引用。只將本人明確選為 body 的研究寫入候選主文，其餘放研究參考；個人文章可以不引用研究。') : s.module === 'A' ? '探索時可協助指出值得研究的問題與查找方向；尚未查找不能解讀成沒有研究，具體資料可交 B 接續查找。' : '';
    return `${tasks[s.module as keyof typeof tasks]}\n${prototypeTaskSpecifications(s.module, f)}\n${discovery}\n${s.module === 'B' ? targetInstructions(s) : ''}\n本次想談：${f.aIntent}\n本人已確認的回答：${f.aAnswers}\n表達：${f.expression}\n界線：${f.boundary}\n保留：${f.keep}\n未解：${f.unresolved}\n本人提供的行動：${f.practices}\n跨系統資料：${f.dSystems}\n研究（本人已選用途；background僅背景、body可入正文、none不用；未核對標待查）：\n${JSON.stringify(f.research.filter(r => r.chosen !== false))}\n其他研究（用途 ${s.researchUse}）：${s.research}\n案例（僅本人adopted=true可採用；假設永遠標為假設）：\n${JSON.stringify(s.examples.filter(e => e.adopted && (!e.module || e.module === s.module) && (!e.mode || s.module !== 'C' || e.mode === f.cMode)))}\n研究參考、例子提案、候選方向的段落可各附 JSON 陣列，供系統辨識。研究欄位 title/source/mechanism/scope/relation；例子 kind（experience/external/hypothetical/metaphor）/text/source；候選 title/statement/quote/locator。來源未知留空，不得編造。所有建議只作候選，由本人決定採用。本文設定與本人採用狀態優先；規格中提到的素材、理論或經歷未提供時，不能為湊結構補造。\n輸出使用固定標題：## 討論回覆、## 候選方向、## 研究查找狀態、## 研究參考、## 例子提案、## 編輯說明、## 候選主文。研究查找狀態明寫「已提供候選／已查找未找到適用資料／無法檢索待查／本人暫不查找」，並說明查找範圍；由本人核對，不把空清單當無研究。無內容的區段可留空。C 的原格式（選用框架、限動頁次或擴寫全文）放在候選主文之內，不把編輯說明放入該欄；D 的原四軸三層放在討論回覆內，候選方向可另附 JSON。作者未確認的解讀保持候選。`;
}
export function parseReply(text: string) {
    const sections: Record<string, string> = {};
    let key = '';
    const aliases: Record<string, string> = { '研究參考及用途': '研究參考', '研究與參考': '研究參考', '研究參考': '研究參考', '研究查找狀態': '研究查找狀態', '例子提案': '例子提案', '案例提案': '例子提案', '候選方向': '候選方向', '候選主文': '候選主文', '主文調整版': '候選主文', '編輯說明與框架對照': '編輯說明', '編輯說明': '編輯說明', '討論回覆': '討論回覆', '平台稿：IG':'平台稿：IG', '平台稿：Threads':'平台稿：Threads', '平台稿：噗浪':'平台稿：噗浪' };
    let fenced = false;
    for (const line of text.split('\n')) {
        if (/^\s*```/.test(line)) fenced = !fenced;
        const clean = line.trim().replace(/^#{1,4}\s*/, '').replace(/^\*\*|\*\*$/g, '').replace(/^(?:第)?[一二三四五六七八九十0-9]+(?:部分|段|節)?[、．.：:]\s*/, '').replace(/[：:]$/, '').replace(/^平台稿\s*[:：]\s*/, '平台稿：');
        const next = !fenced && Object.hasOwn(aliases, clean) ? aliases[clean] : undefined;
        if (next) {
            key = next;
            sections[key] = sections[key] || '';
        }
        else if (key)
            sections[key] += (sections[key] ? '\n' : '') + line;
    }
    return sections;
}
export function manuscriptForAdoption(s: {
    collaboration: Collaboration;
    examples: StudioData['examples'];
    b?: string;
}, kind: 'B' | 'C-expand' | 'C-condense') {
    const f = s.collaboration, text = kind === 'B' ? f.manuscript : kind === 'C-expand' ? f.cExpandedManuscript : f.cManuscript;
    if (kind === 'B' && f.manuscriptReplyDigest && s.b !== undefined && f.manuscriptReplyDigest !== sha256Text(s.b)) throw new WeavingError('B 回覆已變更，請重新預覽並確認候選主文');
    if (!text.trim())
        throw new WeavingError('請先整理候選主文，完整 AI 回覆不會自動成為正文');
    for (const r of f.research.filter(r => r.chosen !== false && r.use === 'body'))
        if (!r.source.trim() || !r.mechanism.trim() || !r.scope.trim() || !r.relation.trim())
            throw new WeavingError('採用研究到正文前，請補齊來源、機制、適用範圍與素材關聯');
    for (const e of s.examples.filter(e => e.adopted && (!e.module || e.module === (kind === 'B' ? 'B' : 'C')) && (!e.mode || kind === 'B' || e.mode === (kind === 'C-expand' ? 'expand' : 'condense')))) {
        if (!e.text.trim())
            throw new WeavingError('選用的例子需要文字');
        if (['experience', 'external'].includes(e.kind) && !e.source?.trim())
            throw new WeavingError('選用經驗或外部案例前，請補上可核對的來源');
        if (e.kind === 'hypothetical' && !/假設|例如|比方|如果|想像|假如/.test(text))
            throw new WeavingError('候選主文需保留可辨識的假設語氣');
    }
    return text;
}
export function cBase(f: Collaboration) { return f.cMode === 'expand' ? { text: f.cExpandedSource, versionId: f.cExpandedVersionId } : { text: f.cSource, versionId: f.cVersionId }; }
/** Fixed content keeps its meaning; task, research and case choices belong to this round. */
export function instructionsForSource(s: StudioData, fixed?: StudioData) {
    if (!fixed)
        return collaborationInstructions(s)+'\n本人採用的方向版本：'+JSON.stringify(s.direction)+(s.module==='B'&&s.a?'\n未採用 A 討論（僅候選，不等於本人意思）：\n'+s.a:'');
    const f = fixed.collaboration, current = s.collaboration;
    return collaborationInstructions({ ...s, collaboration: { ...current,
            aIntent: f.aIntent, aAnswers: f.aAnswers, expression: f.expression,
            keep: f.keep, unresolved: f.unresolved, practices: f.practices,
            boundary: [...new Set([f.boundary, current.boundary].filter(Boolean))].join('\n')
        } })+'\n本人採用的方向版本：'+JSON.stringify(fixed.direction);
}
