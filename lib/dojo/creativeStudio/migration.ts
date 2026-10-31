import { createHash } from 'node:crypto';
import { blankStudio, normalizeStudio, object, type StudioData } from './model';
function copy<T>(v: T): T { return structuredClone(v); }
function canonical(v: unknown): unknown { if (Array.isArray(v))
    return v.map(canonical); if (v && typeof v === 'object')
    return Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canonical(v)])); return v; }
export const importDigest = (v: unknown) => createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex');
export type ImportWork = {
    sourceId: string;
    title: string;
    shuttleId: string | null;
    identity: string;
    studio: StudioData;
};
export type ImportPreview = {
    kind: 'html' | 'formal' | 'original-backup';
    digest: string;
    works: ImportWork[];
    archive: unknown;
    warnings: string[];
};
export function importPreview(value: unknown): ImportPreview {
    const p = object(value), digest = importDigest(p);
    if(p.work&&Array.isArray(p.completionVersions)){
      const w=object(p.work);if(w.recordType!=='weaving-work'||typeof w.id!=='string')throw Error('原生作品備份格式不正確');
      const studio=w.studio?normalizeStudio(w.studio):blankStudio();studio.body=String(w.draftText||studio.body);const data={title:w.title,draft:studio.body,versions:p.completionVersions.map(x=>{const c=object(x),snapshot=c.studioSnapshot as StudioData|undefined;return {...c,format:'text',body:c.text,adoptedDirection:snapshot?.direction?{directionId:snapshot.direction.directionId,understandingVersionId:snapshot.direction.versionId,title:snapshot.direction.title,understanding:{statement:snapshot.direction.statement}}:null};})};
      studio.legacy={...(studio.legacy||{}),nativeWork:structuredClone(w),data,packet:structuredClone(p)};const identity=importDigest(p);studio.importIdentity=identity;
      return {kind:'html',digest,works:[{sourceId:w.id,title:String(w.title||'恢復的作品'),shuttleId:typeof w.shuttleId==='string'?w.shuttleId:null,identity,studio}],archive:structuredClone(p),warnings:['原生文字備份：原件仍在時接續原 ID；原件缺失時建立可追溯的新紀錄。附件需另保留原檔／持久資產備份。']};
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
            s.research = String(object(d.bc || {}).research || d.theory || '');
            const viewed = sources.find(x => x.id === d.viewedSourceId) || sources[0];
            if (viewed) {
                const segments = Array.isArray(viewed.segments) ? viewed.segments as Record<string, unknown>[] : [];
                s.source.id = String(viewed.id || '');
                s.source.title = String(viewed.title || '');
                s.source.raw = String(viewed.rawText || segments.map(x => x.text).join('\n\n'));
                s.source.selected = segments.filter((_, i) => Array.isArray(d.selected) && d.selected.includes(i)).map(x => { const cs = x.corrections as Record<string, unknown>[] | undefined; return String(cs?.at(-1)?.text || x.text || ''); }).join('\n\n');
                // Per-segment correction history and all selected sources remain intact in legacy evidence.
                if (segments.length === 1)
                    s.source.corrections = (Array.isArray(segments[0].corrections) ? segments[0].corrections : []).map((x, i) => { const c = object(x); return { id: String(c.id || `r${i}`), text: String(c.text || ''), note: String(c.note || ''), createdAt: String(c.createdAt || '') }; });
            }
            s.legacy = { sourceWorkId: id, data: copy(d), sources: copy(sources), shuttles: copy(p.shuttles || []), directions: copy(p.directions || []), explorations: copy(p.explorations || []), packet: copy(p) };
            const identity = importDigest({ sourceId: id, shuttleId: w.shuttleId || null, data: d, sources });
            s.importIdentity = identity;
            return { sourceId: id, title: String(d.title || '未命名探索草稿'), shuttleId: typeof w.shuttleId === 'string' ? w.shuttleId : null, identity, studio: s };
        });
        return { kind: 'html', digest, works, archive: copy(p), warnings: ['先保留原識別、完整來源／校訂／模組／方向與版本備份。舊圖文及媒體輸出未驗證前保留為歷史，不標記為新生成成品。', '公開及外部工具許可須由本人重新核對。'] };
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
}[], preview: ImportPreview) { const create: ImportWork[] = [], resume: {
    sourceId: string;
    identity: string;
    workId: string;
}[] = []; for (const w of preview.works) {
    const found = existing.find(e => e.studio?.importIdentity === w.identity);
    if (found)
        resume.push({ sourceId: w.sourceId, identity:w.identity, workId: found.id });
    else
        create.push(w);
} return { create, resume, warnings: preview.warnings }; }
