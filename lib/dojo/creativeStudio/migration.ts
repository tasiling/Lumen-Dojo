import { createHash } from 'node:crypto';
import { blankStudio, normalizeStudio, object, type StudioData } from './model';
import type { WorkflowSelection } from '../weavingWorkflow/model';
function copy<T>(v: T): T { return structuredClone(v); }
function canonical(v: unknown): unknown {
    if (Array.isArray(v))
        return v.map(canonical);
    if (v && typeof v === 'object')
        return Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canonical(v)]));
    return v;
}
export const importDigest = (v: unknown) => createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex');
/** An exact page-text transcript anchors an illustrated version; it is not a new article. */
export function prototypePageText(value: unknown) {
    if (!Array.isArray(value))
        return '';
    return value.map((v, i) => { const page = object(v), text = [String(page.title || ''), String(page.body || '')].filter(Boolean).join('\n'); return `第 ${i + 1} 頁${text ? '\n' + text : '（沒有文字；配圖內容另在圖文編輯核對）'}`; }).join('\n\n');
}
export type ImportWork = {
    sourceId: string;
    title: string;
    shuttleId: string | null;
    identity: string;
    studio: StudioData;
    selections?: WorkflowSelection[];
};
export type ImportPreview = {
    kind: 'html' | 'formal' | 'original-backup';
    digest: string;
    works: ImportWork[];
    archive: unknown;
    warnings: string[];
};
function prototypeSelections(sources: Record<string, unknown>[], data: Record<string, unknown>) {
    const flat = sources.flatMap(source => (Array.isArray(source.segments) ? source.segments : []).map((value, index) => {
        const segment = object(value), corrections = Array.isArray(segment.corrections) ? segment.corrections.map(object) : [], last = corrections.at(-1);
        return { source, segment, corrections, segmentId: String(source.id) + '-' + index, revision: String(last?.id || 'original'), text: String(last?.text ?? segment.text ?? '') };
    }));
    const selected = Array.isArray(data.selected) ? data.selected.flatMap(index => Number.isInteger(index) && flat[Number(index)] ? [flat[Number(index)]] : []) : [];
    const selections: WorkflowSelection[] = selected.filter(r => r.text.trim()).map(r => ({ sourceType: 'manual', sourceId: String(r.source.id), sourceVersion: r.revision, locator: r.segmentId + (r.segment.time ? ' · ' + r.segment.time : ''), contentKind: 'quote', selectedText: r.text, capturedAt: String(r.source.createdAt || 'legacy-import'), digest: importDigest([r.source.id, r.segmentId, r.revision, r.text]) }));
    if (typeof data.imported === 'string' && data.imported.trim())
        selections.push({ sourceType: 'manual', sourceId: 'legacy-typed-text', sourceVersion: 'original', locator: '舊版另貼文字', contentKind: 'quote', selectedText: data.imported, capturedAt: 'legacy-import', digest: importDigest(data.imported) });
    const used = [...new Set(selected.map(r => r.source))], viewed = sources.find(source => source.id === data.viewedSourceId) || sources[0];
    if (!used.length && viewed)
        used.push(viewed);
    return { selections, selected, used, flat };
}
export function importPreview(value: unknown): ImportPreview {
    const envelope = object(value), p = envelope.state && (envelope.kind === 'lumen-weaving-flow-prototype') ? object(envelope.state) : envelope, digest = importDigest(p);
    if (p.work && Array.isArray(p.completionVersions)) {
        const w = object(p.work);
        if (w.recordType !== 'weaving-work' || typeof w.id !== 'string')
            throw Error('原生作品備份格式不正確');
        const studio = w.studio ? normalizeStudio(w.studio) : blankStudio();
        studio.body = String(w.draftText || studio.body);
        const data = { title: w.title, draft: studio.body, versions: p.completionVersions.map(x => { const c = object(x), snapshot = c.studioSnapshot as StudioData | undefined; return { ...c, format: 'text', body: c.text, adoptedDirection: snapshot?.direction ? { directionId: snapshot.direction.directionId, understandingVersionId: snapshot.direction.versionId, title: snapshot.direction.title, understanding: { statement: snapshot.direction.statement } } : null }; }) };
        studio.legacy = { ...(studio.legacy || {}), nativeWork: structuredClone(w), data, packet: structuredClone(p) };
        const identity = importDigest(p);
        studio.importIdentity = identity;
        return { kind: 'html', digest, works: [{ sourceId: w.id, title: String(w.title || '恢復的作品'), shuttleId: typeof w.shuttleId === 'string' ? w.shuttleId : null, identity, studio }], archive: structuredClone(p), warnings: ['原生文字備份：原件仍在時接續原 ID；原件缺失時建立可追溯的新紀錄。附件需另保留原檔／持久資產備份。'] };
    }
    if (Array.isArray(p.workSessions)) {
        const sources = Array.isArray(p.sources) ? p.sources as Record<string, unknown>[] : [];
        const works = (p.workSessions as unknown[]).map((x, i) => {
            const w = object(x), d = object(w.data), s = blankStudio(), id = String(w.id || `legacy-${i}`);
            s.a = String(d.aResponse || '');
            s.b = String(d.bResponse || '');
            s.c = String(d.cResponse || '');
            s.d = String(d.dResponse || '');
            s.body = String(d.draft || '');
            if (d.format === 'illustrated') {
                s.contentKind = 'illustrated';
                if (!s.body.trim())
                    s.body = prototypePageText(d.pages);
            }
            s.collaboration.cManuscript = s.c;
            s.collaboration.cExpandedManuscript = String(d.cExpandedResponse || '');
            const bc = object(d.bc || {}), f = s.collaboration;
            s.research = typeof d.theory === 'string' ? d.theory : '';
            for (const key of ['aMode', 'aAnswers', 'bMode', 'framework', 'closure', 'practices', 'cMode', 'cExpandedResponse', 'cSource', 'cFrameworkMode', 'cExpandFramework', 'cExpandLevel', 'dSystems'] as const)
                if (typeof d[key] === 'string')
                    (f as unknown as Record<string, unknown>)[key] = d[key];
            const notes = d.handoffNotes && typeof d.handoffNotes === 'object' ? object(d.handoffNotes) : {};
            for (const key of ['expression', 'boundary', 'keep', 'unresolved'] as const)
                f[key] = String(notes[key] || '');
            if (!f.aAnswers.trim()) f.aAnswers = [['原意',d.intent],['回答一',d.question1],['回答二',d.question2]].filter(([,v])=>typeof v==='string' && v.trim()).map(([label,v])=>label+'：'+v).join('\n\n');
            s.history = (Array.isArray(d.draftHistory)?d.draftHistory:[]).map((h,i)=>{const v=typeof h==='string'?{text:h}:object(h);return{id:'legacy-history-'+i,text:String(v.text || v.body || v.draft || ''),note:String(v.note || '舊版逐次草稿 '+(i+1)),createdAt:String(v.createdAt || '')};});
            const platformDrafts=d.platformDrafts && typeof d.platformDrafts==='object'?object(d.platformDrafts):{};
            s.platformDrafts=Object.entries(platformDrafts).map(([platform,value],i)=>({id:'legacy-platform-'+i,platform,text:typeof value==='string'?value:JSON.stringify(value,null,2),sourceVersionId:String(d.handoffId || '')}));
            s.publicationHistory=(Array.isArray(d.publicationHistory)?d.publicationHistory:[]).map((h,i)=>{const v=object(h),schedule=v.schedule && typeof v.schedule==='object'?object(v.schedule):{};return{id:'legacy-publication-'+i,platform:String(v.platform || (Array.isArray(v.platforms)?v.platforms.join('／'):'')),url:String(v.publishedUrl || v.url || ''),publishedOn:String(v.publishedOn || v.publishedAt || [schedule.date,schedule.time].filter(Boolean).join(' ')),timeZone:String(schedule.zone || v.zone || ''),sourceVersionId:String(v.versionId || ''),note:JSON.stringify(v,null,2)};});
            f.cExpandedSource = f.cSource;
            f.cExpandedVersionId = String(bc.baseChoice || 'manual');
            f.cVersionId = f.cExpandedVersionId;
            f.manuscript = String(bc.manuscript || '');
            f.editorial = String(bc.editorial || '');
            if (Array.isArray(bc.research))
                f.research = bc.research.map(x => { const r = object(x); return { title: String(r.title || ''), source: String(r.source || ''), mechanism: String(r.mechanism || ''), scope: String(r.scope || ''), relation: String(r.relation || ''), use: r.use === 'include' ? 'body' : r.use === 'unused' ? 'none' : 'background' }; });
            if (Array.isArray(bc.examples))
                s.examples = bc.examples.map(x => { const e = object(x); return { kind: e.kind === 'original' ? 'experience' : ['experience', 'external', 'hypothetical', 'metaphor'].includes(String(e.kind)) ? e.kind : 'hypothetical', text: String(e.text || ''), source: String(e.source || ''), module: String(e.module || ''), mode: String(e.mode || ''), adopted: e.selected === true }; }) as StudioData['examples'];
            const rows = (v: unknown) => Array.isArray(v) ? v.map(object) : [];
            f.rounds = rows(bc.runs).map((r, i) => { const base = r.base ? object(r.base) : {}; return { id: String(r.id || `bc-${i}`), module: String(r.module || 'B'), mode: String(r.mode || 'main'), reply: String(r.raw || r.text || ''), answers: String(r.authorAnswers || ''), sourceText: String(base.text || ''), sourceVersion: String(base.sourceVersionId || base.choice || 'unknown'), settings: JSON.stringify({ base: r.base, direction: r.direction, sources: r.sources, aReply: r.aReply, manuscript: r.manuscript, editorial: r.editorial, research: r.research, examples: r.examples }), createdAt: String(r.createdAt || '') }; });
            for (const e of rows(p.explorations).filter(e => e.workId === id)) {
                const origin = e.origin ? object(e.origin) : {};
                f.rounds.push({ id: String(e.id || `exploration-${f.rounds.length}`), module: String(e.stage || 'A'), mode: String(e.mode || 'material'), reply: String(e.aiReply || e.findings || e.summary || ''), answers: String(e.answers || ''), sourceText: String(origin.bodySnapshot || rows(origin.sourceRefs).map(r => r.text || '').join('\n\n')), sourceVersion: String(origin.workVersionId || origin.understandingVersionId || 'unknown'), settings: JSON.stringify(e), createdAt: String(e.createdAt || '') });
                for (const c of rows(e.candidates)) {
                    const co = c.origin ? object(c.origin) : origin;
                    f.candidates.push({ id: String(c.id || `candidate-${f.candidates.length}`), module: String(e.stage || 'A'), title: String(c.title || ''), statement: String(c.understanding || c.question || c.angle || ''), quote: String(c.originalQuote || ''), locator: String(c.quoteLocator || ''), sourceVersion: String(co.workVersionId || co.understandingVersionId || 'unknown'), topicId: '', directionId: '' });
                }
            }
            const material = prototypeSelections(sources, d);
            s.source.read = d.sourcePermit === 'private' ? 'private' : d.sourcePermit === 'allow' ? 'allowed' : 'selected';
            s.source.id = material.used.length === 1 ? String(material.used[0].id || '') : '';
            s.source.title = material.used.map(source => String(source.title || source.id || '')).join('／');
            s.source.raw = material.used.map(source => String(source.rawText || (Array.isArray(source.segments) ? source.segments.map(x => object(x).text || '').join('\n\n') : ''))).join('\n\n');
            s.source.selected = material.selections.map(r => r.selectedText).join('\n\n');
            const corrected = material.selected.length === 1 ? material.selected[0] : material.flat.length === 1 ? material.flat[0] : null;
            if (corrected) {
                s.source.corrections = corrected.corrections.map((c, i) => ({ id: String(c.id || `r${i}`), text: String(c.text || ''), note: String(c.note || ''), createdAt: String(c.createdAt || '') }));
                if (material.selected.length)
                    s.source.selectedVersion = corrected.revision;
            }
            s.legacy = { migrationVersion:2, sourceWorkId: id, data: copy(d), sources: copy(sources), shuttles: copy(p.shuttles || []), directions: copy(p.directions || []), explorations: copy(p.explorations || []), packet: copy(p) };
            const identity = importDigest({ sourceId: id, shuttleId: w.shuttleId || null, data: d, sources });
            s.importIdentity = identity;
            return { sourceId: id, title: String(d.title || '未命名探索草稿'), shuttleId: typeof w.shuttleId === 'string' ? w.shuttleId : null, identity, studio: s, selections: material.selections };
        });
        return { kind: 'html', digest, works, archive: copy(p), warnings: ['先保留原識別、完整來源／校訂／模組／方向與版本備份。舊圖文及媒體輸出未驗證前保留為歷史，不標記為新生成成品。', '公開及外部工具許可須由本人重新核對。', 'A 本人回答、B/C 設定與雙 C 回覆、逐筆研究已轉為可編輯欄位；B/C 及探索輪次、候選已轉為可查看欄位；候選的舊去向保留在輪次來源紀錄，請核對後重新連結正式方向。圖文配置保留，於作品中選擇「搬遷舊版圖文配置」預覽並另存可編輯版本；配圖來源與公開用途需本人重新核對。'] };
    }
    if (p.recordType === 'weaving-work')
        return { kind: 'formal', digest, works: [], archive: copy(p), warnings: ['既有正式作品直接開啟原 ID，不另建同名副本。'] };
    if (p.toolId || p.snapshot || p.snapshots || p.projects)
        return { kind: 'original-backup', digest, works: [], archive: copy(p), warnings: ['原工具備份已辨識。保留原工具匯入及完整備份，尚未冒稱自動轉成原生作品。'] };
    throw Error('無法辨識備份格式；原檔未變更');
}
export function planImport(existing: {
    id: string;
    studio?: {
        importIdentity?: string;
    };
}[], preview: ImportPreview) {
    const create: ImportWork[] = [], resume: {
        sourceId: string;
        identity: string;
        workId: string;
    }[] = [];
    for (const w of preview.works) {
        const found = existing.find(e => e.studio?.importIdentity === w.identity);
        if (found)
            resume.push({ sourceId: w.sourceId, identity: w.identity, workId: found.id });
        else
            create.push(w);
    }
    return { create, resume, warnings: preview.warnings };
}
