import type { StudioData } from './model';
import { cBase, frameworks, parseReply, replyText, recordRound, instructionsForSource, type Research } from './collaboration';
import { randomID } from '../weavingWorkflow/clientIdentity';
import { sha256Text } from '../weavingWorkflow/clientIdentity';
import { responseOrigin } from './tasks';
import { writingPlatforms } from './targets';
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
    platformDrafts: { platform: string; text: string }[];
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
        const m = line.match(/^\s*(?:[-*]\s*)?(?:\*\*)?(title|source|mechanism|scope|relation|kind|text|statement|quote|locator|出處|來源|連結|機制|適用範圍與限制|適用範圍|限制|與素材的關聯|素材關聯|種類|類型|文字|內容|來源原句|原句|位置|段落|理解|問題|角度|名稱|標題)(?:\*\*)?\s*[：:]\s*(.*)$/i);
        if (m) {
            field = /^[a-z]+$/i.test(m[1]) ? m[1].toLowerCase() : m[1];
            row[field] = m[2].replace(/\*\*$/, '').trim();
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
    // Natural research replies also use Chinese/Arabic enumeration, not only R1.
    // Keep this alternative scoped to research; ordinary prose is never a record.
    const number=prefix==='R'?'(?:R[0-9０-９]+|[一二三四五六七八九十百]+|[0-9０-９]+)':prefix+'[0-9０-９]+';
    const heading=`^[\\t ]*(?:#{1,4}[\\t ]*)?${number}(?:[\\t ]*[｜|：:．.、-][\\t ]*(.*)|[\\t ]*)$`;
    const blocks = text.split(new RegExp(`(?=${heading.replace('(.*)','.*')})`, 'm'));
    return blocks.flatMap(block => {
        const lines=block.trim().split('\n'),head=lines.shift()?.match(new RegExp(heading));
        return head?[{heading:head[1]||'',title:head[1]||'',...labelled(lines.join('\n'))}]:[];
    });
}
/** Conservative tab/Markdown tables: header names identify columns, never guess prose. */
function directionTable(text: string): Record<string, unknown>[] {
    const lines=text.split('\n'); let columns:string[]=[];
    const cells=(line:string)=>line.includes('\t')?line.trim().split(/\t+/):line.trim().replace(/^\||\|$/g,'').split(/\s*\|\s*/);
    const rows:Record<string,unknown>[]=[];
    for(const line of lines){
        if(!line.includes('\t')&&!line.includes('|'))continue;
        const c=cells(line).map(x=>x.trim());
        if(c.includes('方向')&&c.some(x=>/核心問題|理解|問題候選/.test(x))){columns=c;continue;}
        if(!columns.length||c.length!==columns.length||c.every(x=>/^:?-+:?$/.test(x)))continue;
        const at=(re:RegExp)=>c[columns.findIndex(x=>re.test(x))]||'';
        const title=at(/^方向$/),statement=at(/核心問題|理解|問題候選/),framework=at(/框架/);
        if(title&&statement)rows.push({title,statement:statement+(framework?'\n框架建議（未採用）：'+framework:'')});
    }return rows;
}
function experienceBullets(text:string):Record<string,unknown>[] {
    return text.split('\n').flatMap(line=>{
        const prefix='(experience|external|hypothetical|metaphor|本人真實經驗|外部案例|假設例子|比喻)';
        const before=line.match(new RegExp('^\\s*[-*]\\s+'+prefix+'[｜|]\\s*來源[：:]\\s*([^。]+)[。]\\s*(.+)$','i'));
        if(before)return[{kind:before[1].toLowerCase(),source:before[2].trim(),text:before[3].trim()}];
        const after=line.match(new RegExp('^\\s*[-*]\\s+'+prefix+'[：:]\\s*(.+?)\\s*來源[：:]\\s*(.+?)[。.]?\\s*$','i'));
        return after?[{kind:after[1].toLowerCase(),source:after[3].trim(),text:after[2].trim()}]:[];
    });
}
/** Suggestions are displayed as quotes, and only an explicit author click changes settings. */
export function bSettingSuggestions(reply:string) {
    const discussion=parseReply(reply)['討論回覆']||'';
    return {framework:Object.entries(frameworks).filter(([key,label])=>key!=='auto'&&discussion.includes(label)).map(([key,label])=>({key,label,excerpt:discussion})),closure:['認知閉合','情感閉合','意圖閉合'].filter(label=>discussion.includes(label)).map(label=>({key:label,label,excerpt:discussion}))};
}
export function confirmBSetting(s:StudioData,field:'framework'|'closure',key:string):Partial<StudioData> {
    const suggestion=bSettingSuggestions(s.b)[field].find(x=>x.key===key);
    if(s.module!=='B'||!suggestion)throw Error('這項設定不在本次 B 討論建議中，請核對原回覆');
    const f=structuredClone(s.collaboration),decision='本人確認'+(field==='framework'?'文章框架':'主要收束方式')+'：'+suggestion.label+'（依本次 B 討論建議）';
    f[field]=key;
    const next={...s,collaboration:f};
    if(!f.rounds.some(r=>r.mode==='setting-confirm'&&r.reply===s.b&&r.settings===instructionsForSource(next)))f.rounds.push({...recordRound(next,replySource(s),instructionsForSource(next)),answers:[f.aAnswers,decision].filter(Boolean).join('\n'),mode:'setting-confirm'});
    return{collaboration:f};
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
        const academic = value(r, 'title', '名稱', '標題'), heading=value(r,'heading'), title=heading&&heading!==academic?heading+'\n'+academic:academic, source = value(r, 'source', '出處', '來源', '連結');
        if (!title) {
            warnings.push('一筆研究缺少名稱，保留在完整回覆中。');
            continue;
        }
        const item:Research={ title, source, mechanism: value(r, 'mechanism', '機制').trim(), scope: value(r, 'scope', '適用範圍與限制', '適用範圍', '限制').trim(), relation: value(r, 'relation', '與素材的關聯', '素材關聯').trim(), use: 'background', chosen: false };
        research.push(item);
        const missing=(['source','mechanism','scope','relation'] as const).filter(k=>!item[k].trim()).map(k=>({source:'出處',mechanism:'機制',scope:'適用範圍與限制',relation:'文章關聯'}[k]));
        if(missing.length)warnings.push('「'+(heading||title)+'」缺少'+missing.join('、')+'；完整原文仍保留，可手動補齊。');
        if(!/https?:\/\/\S+|10\.\d{4,9}\/[^\s。]+/i.test(source))warnings.push('「'+(heading||title)+'」未附可複製的 DOI 或完整網址；僅書目或「論文 DOI」標籤不代表已核對來源。');
    }
    if (rs.trim() && !research.length)
        warnings.push('研究段落未能逐筆辨識，請手動整理或請 AI 按固定欄位重排。');
    for (const r of [...entries(sections['例子提案'] || '', 'E'),...experienceBullets(sections['例子提案']||'')]) {
        const type = value(r, 'kind', '種類', '類型'), kind = ({ experience: 'experience', original: 'experience', '本人真實經驗': 'experience', '原始經歷': 'experience', external: 'external', '外部案例': 'external', hypothetical: 'hypothetical', '假設例子': 'hypothetical', metaphor: 'metaphor', '比喻': 'metaphor' } as const)[type];
        const text = value(r, 'text', '文字', '內容');
        if (!kind || !text) {
            warnings.push('一筆例子缺少明確種類或文字，未自動加入。');
            continue;
        }
        examples.push({ kind, text, source: value(r, 'source', '來源', '出處'), module: s.module, mode: s.module === 'C' ? s.collaboration.cMode : '', adopted: false });
    }
    const candidateRows = [...entries(sections['候選方向'] || '', '[ADN]'),...directionTable(sections['候選方向']||'')];
    if(sections['候選方向']?.trim()&&!candidateRows.length&&!/^(?:無|本輪不|未提供)/.test(sections['候選方向'].trim()))warnings.push('候選方向未能逐筆辨識，請保留原文並手動整理。');
    for (const r of candidateRows.length ? candidateRows : originalCandidates(reply, s.module)) {
        const title = value(r, 'title', '名稱', '標題'), statement = value(r, 'statement', 'understanding', '理解', '問題', '角度');
        if (!title || !statement) {
            warnings.push('一個候選缺少名稱或理解，未自動加入。');
            continue;
        }
        candidates.push({ id: randomID(), module: s.module === 'D' ? 'D' : s.module==='B'?'B':'A', title, statement, quote: value(r, 'quote', 'originalQuote', '來源原句', '原句'), locator: value(r, 'locator', 'quoteLocator', '位置', '段落'), sourceVersion: '', topicId: '', directionId: '' });
    }
    if (!Object.keys(sections).length)
        warnings.push('沒有辨識到固定段落標題；完整回覆仍可保存，不會自動改動主稿。');
    if(sections['例子提案']?.trim()&&!examples.length&&!/不另加|未新增|不新增|無案例/.test(sections['例子提案']))warnings.push('例子提案未能逐筆辨識，請保留原文並手動整理。');
    const platformDrafts = s.module === 'B' ? writingPlatforms.flatMap(platform => sections['平台稿：' + platform]?.trim() ? [{ platform, text: sections['平台稿：' + platform].trim() }] : []) : [];
    return { module: s.module, mode: s.collaboration.cMode, reply, source: { ...source }, sections, research, examples, candidates, platformDrafts, warnings };
}
export function applyReplyPreview(s: StudioData, p: ReplyPreview, sourceVersion: string, include: {research: boolean; examples: boolean; candidates: boolean; platforms?: boolean} = { research: true, examples: true, candidates: true, platforms: true }, sourceText = replySource(s).text, confirmedManuscript?: string): Partial<StudioData> {
    if (p.module !== s.module || p.mode !== s.collaboration.cMode || p.reply !== replyText(s) || p.source.versionId !== sourceVersion || p.source.text !== sourceText)
        throw Error('模組、模式、回覆或來源已變更，請重新辨識再確認。');
    const f = structuredClone(s.collaboration), examples = structuredClone(s.examples);
    if (include.research)
        for (const r of p.research)
            { const existing=f.research.find(x=>(x.title===r.title||x.title===r.title.split('\n')[0])&&(!x.source||x.source===r.source));
              if(!existing)f.research.push({ ...r, use: 'background', chosen: false });
              else for(const k of ['title','source','mechanism','scope','relation'] as const)if(!existing[k].trim()||(k==='title'&&existing.title===r.title.split('\n')[0]))existing[k]=r[k];
            }
    if (include.examples)
        for (const e of p.examples)
            if (!examples.some(x => x.kind === e.kind && x.text === e.text && x.source === e.source && x.module === e.module && x.mode === e.mode))
                examples.push({ ...e, adopted: false });
    if (include.candidates)
        for (const c of p.candidates)
            if (!f.candidates.some(x => x.module === c.module && x.title === c.title && x.statement === c.statement && x.quote === c.quote))
                f.candidates.push({ ...c, sourceVersion });
    const manuscript = confirmedManuscript ?? p.sections['候選主文'];
    if (manuscript?.trim()) {
        if (s.module === 'B')
            { f.manuscript = manuscript; f.manuscriptReplyDigest = sha256Text(p.reply); }
        if (s.module === 'C' && f.cMode === 'condense')
            f.cManuscript = manuscript;
        if (s.module === 'C' && f.cMode === 'expand')
            f.cExpandedManuscript = manuscript;
    }
    if (s.module === 'B' && p.sections['編輯說明'] !== undefined)
        f.editorial = p.sections['編輯說明'];
    if (s.module === 'B') {
        const report = p.sections['研究查找狀態'];
        if (report !== undefined || p.research.length) {
            f.researchReport = report?.trim() || '回覆提供研究候選，來源仍需本人核對。';
            f.researchStatus = p.research.length ? 'candidates' : /無法|不能|未核實|待查/.test(report || '') ? 'unverified' : /未找到|查無/.test(report || '') ? 'reported-none' : /不查找|暫不/.test(report || '') ? 'skipped' : 'unverified';
        }
    }
    const platformDrafts = structuredClone(s.platformDrafts);
    if (s.module === 'B' && include.platforms !== false) {
        const taskId = responseOrigin(s)?.id || '', sourceBody = manuscript?.trim() ? manuscript : s.body;
        for (const d of p.platformDrafts) {
            // Reconfirming the same reply never overwrites a platform draft the author edited.
            const id = 'b-platform-' + sha256Text(JSON.stringify([taskId, p.reply, d.platform])).slice(0, 40);
            if (!platformDrafts.some(x => x.id === id)) platformDrafts.push({ id, ...d, sourceVersionId: '', sourceText: sourceBody, taskId, rawReply: p.reply });
        }
    }
    return { collaboration: f, examples, platformDrafts };
}
/** Missing research is recoverable next to discussion, without re-adopting the manuscript. */
export function bResearchRecovery(s:StudioData){
    const preview=previewReply(s),raw=preview.sections['研究參考']||'';
    const pending=preview.research.some(r=>!s.collaboration.research.some(x=>(x.title===r.title||x.title===r.title.split('\n')[0])&&(!x.source||x.source===r.source)&&(['source','mechanism','scope','relation'] as const).every(k=>!!x[k].trim()||!r[k].trim())))||(!preview.research.length&&/^(?:[ \t]*R[0-9０-９]+)|"title"/mi.test(raw));
    return{preview,pending:s.module==='B'&&pending};
}
export function confirmBResearchRecovery(s:StudioData,p:ReplyPreview):Partial<StudioData>{
    if(s.module!=='B'||!p.research.length)throw Error('尚未辨識到研究，完整 B 原文保留；請手動整理研究欄位');
    const patch=applyReplyPreview(s,p,p.source.versionId,{research:true,examples:false,candidates:false,platforms:false},replySource(s).text,s.collaboration.manuscript),next=patch.collaboration!;
    const f={...s.collaboration,research:next.research,researchReport:next.researchReport,researchStatus:next.researchStatus,rounds:[...s.collaboration.rounds]};
    if(!f.rounds.some(r=>r.mode==='research-intake'&&r.reply===p.reply))f.rounds.push({...recordRound(s,p.source,instructionsForSource(s)),mode:'research-intake'});
    return{collaboration:f};
}
/** A confirmed intake is retained even if the author does not adopt its manuscript. */
export function confirmBReply(s: StudioData, p: ReplyPreview, include: {research: boolean; examples: boolean; candidates: boolean; platforms?: boolean}, manuscript: string) {
    if (s.module !== 'B') throw Error('請回 B 模組確認這份回覆');
    const patch = applyReplyPreview(s,p,p.source.versionId,include,replySource(s).text,manuscript);
    if (p.reply.trim()) {
        const round = {...recordRound(s,p.source,instructionsForSource(s)),mode:'intake'};
        if (!patch.collaboration!.rounds.some(r => r.mode==='intake' && r.module==='B' && r.reply===round.reply && r.taskId===round.taskId && r.sourceText===round.sourceText && r.settings===round.settings)) patch.collaboration!.rounds.push(round);
    }
    return patch;
}
