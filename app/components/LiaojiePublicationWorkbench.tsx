"use client";
import { useEffect, useState } from 'react';
import { LIAOJIE_PLATFORMS, type LiaojiePlatform, type LiaojiePublicationProject } from '@/lib/dojo/liaojiePublication';
import ConflictRecovery from './weaving/ConflictRecovery';
import LeaveProvider, { useLeave } from './weaving/LeaveDialog';
import { useWeavingDraft } from './weaving/useWeavingDraft';
import { get, mutate } from './weaving/client';
import '@/app/weaving/workflow.css';
import { beginSave } from '@/lib/dojo/weavingWorkflow/draft';
const STATUS: Record<LiaojiePublicationProject['status'], string> = { received: '已接收', packaging: '品牌整理中', ready: '可發布', scheduled: '已安排', published: '已發布', archived: '已封存' };
function PublicationEditor({ project, onSaved, onArchived }: {
    project: LiaojiePublicationProject;
    onSaved: (p: LiaojiePublicationProject) => void;
    onArchived: () => void;
}) {
    const [acting, setActing] = useState(false);
    const [preview, setPreview] = useState<number | null>(null), [error, setError] = useState<string | null>(null), [notice, setNotice] = useState<string | null>(null);
    const d = useWeavingDraft(project, async (t) => { const p = t.value; const editable = { brandAngle: p.brandAngle, audience: p.audience, platform: p.platform, title: p.title, coverCopy: p.coverCopy, summary: p.summary, callToAction: p.callToAction, themeGroup: p.themeGroup, scheduledOn: p.scheduledOn, publishedUrl: p.publishedUrl, responseNote: p.responseNote, nextStep: p.nextStep }; const r = await mutate<{
        project: LiaojiePublicationProject;
    }>('/api/dojo/liaojie-projects', 'PATCH', { id: p.id, expectedRevision: t.revision, project: editable }); onSaved(r.project); return r.project; });
    const draft = d.value, saving = d.busy || acting;
    function update(values: Partial<LiaojiePublicationProject>) { d.edit({ ...draft, ...values }); setPreview(null); setNotice(null); }
    async function save(status: LiaojiePublicationProject['status']) { if (preview !== d.state.editSequence) {
        setError('請先預覽目前版本。');
        return;
    } setError(null); setActing(true); const sequence = d.state.editSequence; const snapshot = draft; const nextStep = status === 'published' ? '留下這次發布的精簡回看' : status === 'scheduled' ? '依安排日期發布並補上連結' : '決定是否安排發布日期'; try {
        if (!await d.save())
            return;
        if (d.current().editSequence !== sequence)
            throw new Error('保存期間有新輸入，請重新預覽。');
        const ticket = beginSave(d.current());
        const r = await mutate<{
            project: LiaojiePublicationProject;
        }>('/api/dojo/liaojie-projects', 'PATCH', { id: snapshot.id, expectedRevision: d.current().baseline.revision, project: { status, nextStep } });
        d.applyServer(ticket, r.project);
        onSaved(r.project);
        setPreview(null);
        setNotice(status === 'published' ? '已標記發布。' : status === 'scheduled' ? '發布日期已安排；請於外站手動發布。' : '首發版本已保存。');
    }
    catch (e) {
        setError(e instanceof Error ? e.message : String(e));
    }
    finally {
        setActing(false);
    } }
    async function saveReview() { if (await d.save())
        setNotice('這次回看已保存。'); }
    async function archive() { if (!window.confirm('封存這張聊解企劃？來源成品仍會保留。'))
        return; try {
        if (d.dirty && !await d.save())
            return;
        await mutate('/api/dojo/liaojie-projects', 'DELETE', { id: draft.id, expectedRevision: d.current().baseline.revision });
        onArchived();
    }
    catch (e) {
        setError(e instanceof Error ? e.message : String(e));
    } }
    return <><ConflictRecovery draft={d} loadLatest={async()=>(await get<{project:LiaojiePublicationProject}>(`/api/dojo/liaojie-projects?id=${project.id}`)).project} render={v=><><h4>{v.title}</h4><p>{v.brandAngle}</p><div className="full-text-preview">{v.summary}</div><p>{v.publishedUrl}</p><p>{v.responseNote}</p><p>受眾：{v.audience}</p><p>平台：{LIAOJIE_PLATFORMS[v.platform]}</p><p>封面文案：{v.coverCopy}</p><p>CTA：{v.callToAction}</p><p>主題：{v.themeGroup}</p><p>發布日期：{v.scheduledOn}</p><p>下一步：{v.nextStep}</p></>}/>{error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}<div className="wf-save-state" role="status">{saving ? '正在保存…' : d.dirty ? '有未保存的發布欄位' : '目前發布欄位已保存'}{d.state.error && <p role="alert">{d.state.error}，輸入仍保留。</p>}<button disabled={saving} onClick={() => void d.save()}>保存編輯進度</button></div>
    <>
      <section className="ritual-card publication-source-card"><span className="eyebrow">來源作品</span><h2>{draft.sourceTitle}</h2><p><b>原始核心主張</b>{draft.sourceCoreStatement}</p>{draft.sourceOutputUrl && <a href={draft.sourceOutputUrl} target="_blank" rel="noreferrer">查看織光堂成品 ↗</a>}<details><summary>查看送來的文字快照</summary><div className="full-text-preview">{draft.sourceDraftSnapshot || "這件作品以外部成品連結為主。"}</div></details></section>
      <section className="ritual-card publication-fields"><span className="eyebrow">品牌編排</span><h2>先完成一個首發版本</h2>
        <label>品牌角度</label><textarea className="field" rows={3} value={draft.brandAngle} onChange={(event) => update({ brandAngle: event.target.value })} placeholder="全零聊解室要從哪個觀點帶讀者看這件作品？"/>
        <label>受眾</label><input className="field" value={draft.audience} onChange={(event) => update({ audience: event.target.value })}/>
        <label>首發平台</label><div className="platform-picker">{(Object.entries(LIAOJIE_PLATFORMS) as [
        LiaojiePlatform,
        string
    ][]).map(([key, label]) => <button key={key} className={draft.platform === key ? "on" : ""} onClick={() => update({ platform: key })}>{label}</button>)}</div>
        <label>標題</label><input className="field" value={draft.title} onChange={(event) => update({ title: event.target.value })}/>
        <label>封面文案</label><textarea className="field" rows={2} value={draft.coverCopy} onChange={(event) => update({ coverCopy: event.target.value })} placeholder="只有平台需要封面時才填。"/>
        <label>簡介／首發版本摘要</label><textarea className="field" rows={5} value={draft.summary} onChange={(event) => update({ summary: event.target.value })}/>
        <label>CTA</label><textarea className="field" rows={2} value={draft.callToAction} onChange={(event) => update({ callToAction: event.target.value })} placeholder="希望讀者看完後做什麼？可留白。"/>
        <label>主題週／主題群組（可稍後補）</label><input className="field" value={draft.themeGroup} onChange={(event) => update({ themeGroup: event.target.value })}/>
        <label>發布日期</label><input className="field" type="date" value={draft.scheduledOn?.slice(0, 10) ?? ""} onChange={(event) => update({ scheduledOn: event.target.value || null })}/>
        <label>發布連結</label><input className="field" type="url" value={draft.publishedUrl} onChange={(event) => update({ publishedUrl: event.target.value })} placeholder="標記已發布前必填"/>
        <button className="primary full-button" onClick={() => setPreview(d.state.editSequence)}>預覽首發版本</button>
      </section>
      {preview !== null && preview === d.state.editSequence && <section className="ritual-card publication-preview"><span className="eyebrow">{LIAOJIE_PLATFORMS[draft.platform]} · 首發預覽</span><h2>{draft.coverCopy || draft.title}</h2>{draft.coverCopy && <h3>{draft.title}</h3>}<p>{draft.summary || draft.sourceDraftSnapshot}</p>{draft.callToAction && <blockquote>{draft.callToAction}</blockquote>}<div className="publication-save-actions"><button disabled={saving} onClick={() => void save("ready")}>先保存</button><button disabled={saving} onClick={() => void save("scheduled")}>安排發布</button><button className="primary" disabled={saving} onClick={() => void save("published")}>已發布</button></div></section>}
      {draft.status === "published" && <section className="ritual-card publication-review"><span className="eyebrow">發布後回看</span><h2>只留下能幫助下次創作的資訊</h2><label>滿意的部分、實際反應與要保留或改寫的表達</label><textarea className="field" rows={6} value={draft.responseNote} onChange={(event) => update({ responseNote: event.target.value })} placeholder="不用抄完整數據，只留下真正會影響下一次創作的內容。"/><label>下一步是否值得延伸？</label><input className="field" value={draft.nextStep} onChange={(event) => update({ nextStep: event.target.value })}/><button disabled={saving} onClick={() => void saveReview()}>保存精簡回看</button></section>}
      <button className="danger-button archive-project-button" onClick={() => void archive()}>封存這張聊解企劃</button>
    </></>;
}
function PublicationWorkbench({ initialId }: {
    initialId: string | null;
}) {
    const [projects, setProjects] = useState<LiaojiePublicationProject[]>([]), [selectedId, setSelectedId] = useState(initialId), [loading, setLoading] = useState(true), [error, setError] = useState<string | null>(null);
    const notice = null;
    const leave = useLeave();
    const selected = projects.find(p => p.id === selectedId) ?? projects[0] ?? null;
    useEffect(() => { let active = true; get<{
        projects: LiaojiePublicationProject[];
    }>('/api/dojo/liaojie-projects').then(r => { if (active)
        setProjects(r.projects); }).catch(e => { if (active)
        setError(e.message); }).finally(() => { if (active)
        setLoading(false); }); return () => { active = false; }; }, []);
    function choose(p: LiaojiePublicationProject) { leave.requestLeave(() => setSelectedId(p.id)); }
    function saved(p: LiaojiePublicationProject) { setProjects(rows => rows.map(old => old.id === p.id ? p : old)); }
    return <section className="screen liaojie-workbench-screen wf-publication">
    <div className="hero li"><span className="eyebrow">全零聊解室</span><h1>聊解室工作台</h1><p>接收已完成作品，整理成一個可面向讀者的首發版本。</p></div>
    {loading && <div className="empty">正在整理待發布作品…</div>}{error && <p className="form-error" role="alert">{error}</p>}{notice && <p className="save-notice" role="status">{notice}</p>}
    {!loading && projects.length === 0 && <div className="weaving-empty"><span>◇</span><b>還沒有送來的作品</b><p>作品只有在織光堂按下「送往聊解室」後才會出現。</p></div>}
    {projects.length > 0 && <div className="publication-project-tabs">{projects.map((project) => <button key={project.id} className={selectedId === project.id ? "on" : ""} onClick={() => choose(project)}><small>{STATUS[project.status]}</small><b>{project.title || project.sourceTitle}</b></button>)}</div>}
    {selected && <PublicationEditor key={selected.id} project={selected} onSaved={saved} onArchived={() => setProjects(rows => rows.filter(p => p.id !== selected.id))}/>}
  </section>;
}
export default function LiaojiePublicationWorkbench(props: {
    initialId: string | null;
}) { return <LeaveProvider><PublicationWorkbench {...props}/></LeaveProvider>; }
