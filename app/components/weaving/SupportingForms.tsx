'use client';
import type { WeavingShuttle, WeavingWork, CoreImpact, ReflectionNextMove } from '@/lib/dojo/weavingShuttle';
import { WEAVING_FORMATS, type WeavingFormat } from '@/lib/dojo/weavingProjects';
import { useWeavingDraft } from './useWeavingDraft';
import ConflictRecovery from './ConflictRecovery';
import { get,mutate } from './client';
export function DirectionForm({ shuttle, onSaved }: {
    shuttle: WeavingShuttle;
    onSaved: (s: WeavingShuttle) => void;
}) {
    const draft = useWeavingDraft(shuttle, async (t) => { const r = await mutate<{
        shuttle: WeavingShuttle;
    }>('/api/dojo/weaving-shuttles', 'PATCH', { id: shuttle.id, expectedRevision: t.revision, shuttle: { audience: t.value.audience, direction: t.value.direction } }); onSaved(r.shuttle); return r.shuttle; });
    return <div><ConflictRecovery draft={draft} loadLatest={async()=>(await get<{bundle:{shuttle:WeavingShuttle}}>(`/api/dojo/weaving-shuttles?id=${shuttle.id}`)).bundle.shuttle} render={v=><><p>{v.audience}</p><div className="full-text-preview">{v.direction}</div></>}/><label htmlFor="shuttle-audience">這張杼想讓誰理解？</label><input id="shuttle-audience" value={draft.value.audience} onChange={e => draft.edit({ ...draft.value, audience: e.target.value })}/><label htmlFor="shuttle-direction">這張杼目前想寫往哪裡？</label><textarea id="shuttle-direction" rows={3} value={draft.value.direction} onChange={e => draft.edit({ ...draft.value, direction: e.target.value })}/><button disabled={draft.busy} onClick={() => void draft.save()}>保存創作方向</button><p className="wf-note" role="status">{draft.dirty ? '創作方向尚未保存' : draft.state.status === 'saved' ? '創作方向已保存' : ''}</p>{draft.state.error && <p role="alert">{draft.state.error}</p>}</div>;
}
export function NewWorkForm({ shuttle, onCreated }: {
    shuttle: WeavingShuttle;
    onCreated: (w: WeavingWork,s:WeavingShuttle) => void;
}) {
    const empty = { id: `new-work-${shuttle.id}`, revision: 0, title: '', format: 'text' as WeavingFormat };
    const draft = useWeavingDraft(empty, async (t) => { const r = await mutate<{
        work: WeavingWork;shuttle:WeavingShuttle;
    }>('/api/dojo/weaving-works', 'POST', { shuttleId: shuttle.id, title: t.value.title, format: t.value.format }); onCreated(r.work,r.shuttle); return empty; });
    return <div><label htmlFor="new-work-title">新作品名稱</label><input id="new-work-title" disabled={draft.busy} value={draft.value.title} onChange={e => draft.edit({ ...draft.value, title: e.target.value })}/><label htmlFor="new-work-format">作品形式</label><select id="new-work-format" disabled={draft.busy} value={draft.value.format} onChange={e => draft.edit({ ...draft.value, format: e.target.value as WeavingFormat })}>{Object.entries(WEAVING_FORMATS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select><p className="wf-note">漫畫與影片保留作品線，製作工作台留待後續。</p><button className="primary" disabled={!draft.value.title.trim() || draft.busy} onClick={() => void draft.save()}>建立這條作品緯線</button>{draft.state.error && <p role="alert">{draft.state.error}</p>}</div>;
}
const NEXT: Record<ReflectionNextMove, string> = { adapt: '發展作品 B', update_core: '更新核心後再創作', branch: '分支成新織光杼', rest: '先讓它沉澱' };
const IMPACT: Record<CoreImpact, string> = { unchanged: '沒有改變', expanded: '補充得更完整', changed: '理解已改變', branched: '長出另一個主題' };
export function ReflectionForm({ work, shuttle, onSaved }: {
    work: WeavingWork;
    shuttle: WeavingShuttle;
    onSaved: (r: {
        work: WeavingWork;
        shuttle: WeavingShuttle;
        nextWork: WeavingWork | null;
    }) => void;
}) {
    const empty = { id: `reflection-${work.id}`, revision: 0, insight: '', coreImpact: 'unchanged' as CoreImpact, nextMove: 'rest' as ReflectionNextMove, nextCoreStatement: '', branchTitle: '', nextTitle: '', nextFormat: 'text' as WeavingFormat };
    const draft = useWeavingDraft(empty, async (t) => { const { id: _id, revision: _revision, ...values } = t.value; void _id; void _revision; const r = await mutate<{
        work: WeavingWork;
        shuttle: WeavingShuttle;
        nextWork: WeavingWork | null;
    }>('/api/dojo/weaving-works', 'POST', { ...values, action: 'reflect', workId: work.id, shuttleId: shuttle.id, expectedRevision: work.revision, expectedShuttleRevision: shuttle.revision }); onSaved(r); return empty; });
    const v = draft.value;
    function edit(p: Partial<typeof v>) { draft.edit({ ...v, ...p }); }
    return <section className="ritual-card"><span className="eyebrow">回杼 · 可稍後補</span><h2>這件作品帶回了什麼？</h2>{work.reflection && <p>已保存回杼：{work.reflection.insight}</p>}<label htmlFor="reflection-insight">這次創作讓我更明白了什麼？</label><textarea id="reflection-insight" rows={4} value={v.insight} onChange={e => edit({ insight: e.target.value })}/><label htmlFor="core-impact">原本觀點需要改變嗎？</label><select id="core-impact" value={v.coreImpact} onChange={e => edit({ coreImpact: e.target.value as CoreImpact })}>{Object.entries(IMPACT).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select><label htmlFor="reflection-next">接下來呢？</label><select id="reflection-next" value={v.nextMove} onChange={e => edit({ nextMove: e.target.value as ReflectionNextMove })}>{Object.entries(NEXT).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>{(v.nextMove === 'branch' || v.nextMove === 'update_core') && <><label htmlFor="next-core">新的核心觀點</label><textarea id="next-core" rows={3} value={v.nextCoreStatement} onChange={e => edit({ nextCoreStatement: e.target.value })}/></>}{v.nextMove === 'branch' && <><label htmlFor="branch-title">分支織光杼名稱</label><input id="branch-title" value={v.branchTitle} onChange={e => edit({ branchTitle: e.target.value })}/></>}{v.nextMove !== 'rest' && <><label htmlFor="reflection-next-title">下一件作品名稱</label><input id="reflection-next-title" value={v.nextTitle} onChange={e => edit({ nextTitle: e.target.value })}/><label htmlFor="reflection-format">下一件作品形式</label><select id="reflection-format" value={v.nextFormat} onChange={e => edit({ nextFormat: e.target.value as WeavingFormat })}>{Object.entries(WEAVING_FORMATS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></>}<button className="primary" disabled={draft.busy || !v.insight.trim()} onClick={() => void draft.save()}>保存回杼並接續下一步</button>{draft.state.error && <p role="alert">{draft.state.error}</p>}</section>;
}
