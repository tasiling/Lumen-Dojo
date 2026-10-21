"use client";
import LongVideoDelivery from './longVideo/LongVideoDelivery';
import ComicDelivery from './comic/ComicDelivery';
import PodcastDelivery from './podcast/PodcastDelivery';
import { useEffect, useState } from 'react';
import CreativeIcon from './creative/CreativeIcon';
import CreativeHeroArt from './creative/CreativeHeroArt';
import TextPlatformWorkspace from './liaojie/TextPlatformWorkspace';
import IllustratedDelivery from './illustrated/IllustratedDelivery';
import VideoDelivery from './shortVideo/VideoDelivery';
import LeaveProvider, { useLeave } from './weaving/LeaveDialog';
import { get, mutate } from './weaving/client';
import { useWeavingDraft } from './weaving/useWeavingDraft';
import { LIAOJIE_PLATFORMS, type LiaojiePublicationProject, type LiaojieStatus } from '@/lib/dojo/liaojiePublication';
import '@/app/weaving/workflow.css';

type LegacyDraft = Pick<LiaojiePublicationProject, 'id' | 'revision' | 'brandAngle' | 'audience' | 'platform' | 'title' | 'coverCopy' | 'summary' | 'callToAction' | 'themeGroup' | 'scheduledOn' | 'status' | 'publishedUrl' | 'responseNote' | 'nextStep'>;
const legacyDraft = (project: LiaojiePublicationProject): LegacyDraft => ({ id: project.id, revision: project.revision, brandAngle: project.brandAngle, audience: project.audience, platform: project.platform, title: project.title, coverCopy: project.coverCopy, summary: project.summary, callToAction: project.callToAction, themeGroup: project.themeGroup, scheduledOn: project.scheduledOn, status: project.status, publishedUrl: project.publishedUrl, responseNote: project.responseNote, nextStep: project.nextStep });
function LegacyPublicationEditor({ project, onUpdated }: { project: LiaojiePublicationProject; onUpdated: (value: LiaojiePublicationProject) => void }) {
  const draft = useWeavingDraft(legacyDraft(project), async ticket => { const { id: _id, revision: _revision, ...patch } = ticket.value; void _id; void _revision; const result = await mutate<{ project: LiaojiePublicationProject }>('/api/dojo/liaojie-projects', 'PATCH', { id: ticket.entityId, expectedRevision: ticket.revision, project: patch }); onUpdated(result.project); return legacyDraft(result.project); });
  const value = draft.value; const edit = (patch: Partial<LegacyDraft>) => draft.edit({ ...value, ...patch });
  return <section className="ritual-card legacy-publication-editor"><div className="creative-section-heading"><CreativeIcon name="document"/><div><span className="eyebrow">原發布整理流程</span><h2>整理這件作品的發布資料</h2></div></div><p className="wf-note">這張舊企劃或非文字作品不會被強制轉進文字平台稿；原本可編輯的欄位完整保留。</p>
    <label>品牌角度</label><textarea aria-label="品牌角度" rows={3} value={value.brandAngle} onChange={event => edit({ brandAngle: event.target.value })}/><label>受眾</label><textarea aria-label="受眾" rows={2} value={value.audience} onChange={event => edit({ audience: event.target.value })}/><label>平台</label><select aria-label="平台" value={value.platform} onChange={event => edit({ platform: event.target.value as LegacyDraft['platform'] })}>{Object.entries(LIAOJIE_PLATFORMS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><label>標題</label><input aria-label="標題" value={value.title} onChange={event => edit({ title: event.target.value })}/><label>封面文案</label><textarea aria-label="封面文案" rows={2} value={value.coverCopy} onChange={event => edit({ coverCopy: event.target.value })}/><label>摘要</label><textarea aria-label="摘要" rows={5} value={value.summary} onChange={event => edit({ summary: event.target.value })}/><label>行動邀請</label><textarea aria-label="行動邀請" rows={2} value={value.callToAction} onChange={event => edit({ callToAction: event.target.value })}/><label>主題群組</label><input aria-label="主題群組" value={value.themeGroup} onChange={event => edit({ themeGroup: event.target.value })}/><label>預計發布日期</label><input aria-label="預計發布日期" type="date" value={value.scheduledOn ?? ''} onChange={event => edit({ scheduledOn: event.target.value || null })}/><label>狀態</label><select aria-label="狀態" value={value.status} onChange={event => edit({ status: event.target.value as LiaojieStatus })}>{(['received','packaging','ready','scheduled','published'] as LiaojieStatus[]).map(status => <option key={status} value={status}>{status}</option>)}</select><label>發布連結</label><input aria-label="發布連結" type="url" value={value.publishedUrl} onChange={event => edit({ publishedUrl: event.target.value })}/><label>回收紀錄</label><textarea aria-label="回收紀錄" rows={3} value={value.responseNote} onChange={event => edit({ responseNote: event.target.value })}/><label>下一步</label><input aria-label="下一步" value={value.nextStep} onChange={event => edit({ nextStep: event.target.value })}/><button className="primary full-button" disabled={!draft.dirty || draft.busy} onClick={() => void draft.save()}>{draft.busy ? '保存中…' : '保存發布整理'}</button><p className="wf-save-state" role="status">{draft.dirty ? '有未保存的發布資料' : '發布資料已保存'}{draft.state.error && <span role="alert">；{draft.state.error}</span>}</p>
  </section>;
}
function PublicationEditor({ project, onArchived, onUpdated }: { project: LiaojiePublicationProject; onArchived: () => void; onUpdated: (value: LiaojiePublicationProject) => void }) {
  const [error, setError] = useState(''), [archiving, setArchiving] = useState(false);
  const leave = useLeave();
  async function archiveNow() {
    if (!window.confirm('封存這張聊解企劃？固定原稿與平台版本歷史仍會保留。')) return;
    setArchiving(true); setError('');
    try { await mutate('/api/dojo/liaojie-projects', 'DELETE', { id: project.id, expectedRevision: project.revision }); onArchived(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setArchiving(false); }
  }
  function archive() { leave.requestLeave(() => { void archiveNow(); }); }
  return <>
    <IllustratedDelivery ids={project.illustratedOutputRefs}/><VideoDelivery ids={project.videoOutputRefs}/><PodcastDelivery ids={project.podcastOutputRefs}/><ComicDelivery ids={project.comicOutputRefs}/><LongVideoDelivery ids={project.longVideoOutputRefs}/>
    <section className="ritual-card publication-source-card"><div className="creative-section-heading"><CreativeIcon name="inbox"/><div><span className="eyebrow">織光堂交接 · 固定來源</span><h2>{project.sourceTitle}</h2></div></div><p className="wf-note">這是交接時固定保存的原稿。平台改寫、回復舊版或送到噗浪蓋樓，都不會改動它。</p><p><b>核心觀點</b></p><p>{project.sourceCoreStatement}</p>{project.sourceOutputUrl && <a href={project.sourceOutputUrl} target="_blank" rel="noreferrer">查看織光堂成品 ↗</a>}<details><summary>查看固定文字原稿</summary><div className="full-text-preview">{project.sourceDraftSnapshot || '這件作品以外部成品連結為主。'}</div></details></section>
    {project.sourceFormat === 'text' && project.sourceCompletionVersionId && project.sourceDraftSnapshot
      ? <><TextPlatformWorkspace project={project}/><details className="legacy-publication-record"><summary>查看既有發布欄位</summary><LegacyPublicationEditor project={project} onUpdated={onUpdated}/></details></>
      : <LegacyPublicationEditor project={project} onUpdated={onUpdated}/>}
    {error && <p className="form-error" role="alert">{error}</p>}<button className="danger-button archive-project-button" disabled={archiving} onClick={archive}>封存這張聊解企劃</button>
  </>;
}
function PublicationWorkbench({ initialId }: { initialId: string | null }) {
  const [projects, setProjects] = useState<LiaojiePublicationProject[]>([]), [selectedId, setSelectedId] = useState(initialId), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const leave = useLeave();
  const selected = projects.find(project => project.id === selectedId) ?? projects[0] ?? null;
  useEffect(() => { let active = true; get<{ projects: LiaojiePublicationProject[] }>('/api/dojo/liaojie-projects').then(result => { if (active) setProjects(result.projects); }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : String(reason)); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, []);
  function choose(project: LiaojiePublicationProject) { leave.requestLeave(() => setSelectedId(project.id)); }
  return <section className="screen liaojie-workbench-screen wf-publication"><div className="hero li"><CreativeHeroArt realm="liaojie"/><span className="eyebrow">全零聊解室</span><h1>聊解室工作台</h1><p>從固定原稿，逐一製成你真正要發布的平台版本。</p></div>{loading && <div className="empty">正在整理待發布作品…</div>}{error && <p className="form-error" role="alert">{error}</p>}{!loading && projects.length === 0 && <div className="weaving-empty"><CreativeIcon name="inbox"/><b>還沒有送來的作品</b><p>作品只有在織光堂固定成品並按下「送往聊解室」後才會出現。</p></div>}{projects.length > 0 && <div className="publication-project-tabs">{projects.map(project => <button key={project.id} aria-pressed={selected?.id === project.id} onClick={() => choose(project)}><small>固定作品</small><b>{project.sourceTitle}</b></button>)}</div>}{selected && <PublicationEditor key={selected.id} project={selected} onUpdated={next => setProjects(rows => rows.map(project => project.id === next.id ? next : project))} onArchived={() => setProjects(rows => rows.filter(project => project.id !== selected.id))}/>}</section>;
}
export default function LiaojiePublicationWorkbench(props: { initialId: string | null }) { return <LeaveProvider><PublicationWorkbench {...props}/></LeaveProvider>; }
