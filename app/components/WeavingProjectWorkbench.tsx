'use client';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { currentCore, type WeavingShuttleBundle, type WeavingWork } from '@/lib/dojo/weavingShuttle';
import { WEAVING_FORMATS } from '@/lib/dojo/weavingProjects';
import ClaimCandidateComposer from './ClaimCandidateComposer';
import LeaveProvider, { useLeave } from './weaving/LeaveDialog';
import TextWorkspace from './weaving/TextWorkspace';
import { DirectionForm, NewWorkForm, ReflectionForm } from './weaving/SupportingForms';
import WeeklyAction from './weaving/WeeklyAction';
import { useWeavingDraft } from './weaving/useWeavingDraft';
import { get, mutate } from './weaving/client';
import '@/app/weaving/workflow.css';
function OtherWork({ work, onSaved }: {
    work: WeavingWork;
    onSaved: (w: WeavingWork) => void;
}) { const d = useWeavingDraft(work, async (t) => { const r = await mutate<{
    work: WeavingWork;
}>('/api/dojo/weaving-works', 'PATCH', { id: work.id, expectedRevision: t.revision, work: { title: t.value.title, nextAction: t.value.nextAction, outputUrl: t.value.outputUrl } }); onSaved(r.work); return r.work; }); return <section className="ritual-card"><h2>{work.format === 'comic' ? '漫畫' : '影片'}作品線已保留</h2><p>製作工作台留待後續開放。</p><label htmlFor="other-title">作品名稱</label><input id="other-title" value={d.value.title} onChange={e => d.edit({ ...d.value, title: e.target.value })}/><label htmlFor="other-url">成品連結</label><input id="other-url" type="url" value={d.value.outputUrl} onChange={e => d.edit({ ...d.value, outputUrl: e.target.value })}/><label htmlFor="other-next">下一步</label><input id="other-next" value={d.value.nextAction} onChange={e => d.edit({ ...d.value, nextAction: e.target.value })}/><button disabled={d.busy} onClick={() => void d.save()}>保存作品線</button>{d.state.error && <p role="alert">{d.state.error}</p>}</section>; }
function Workbench() {
    const { id } = useParams<{
        id: string;
    }>(), router = useRouter(), params = useSearchParams(), leave = useLeave();
    const [bundle, setBundle] = useState<WeavingShuttleBundle | null>(null), [selected, setSelected] = useState<string | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState(''), [busy, setBusy] = useState(false), [newOpen, setNewOpen] = useState(false);
    useEffect(() => { let active = true; get<{
        bundle: WeavingShuttleBundle;
    }>(`/api/dojo/weaving-shuttles?id=${encodeURIComponent(id)}`).then(r => { if (!active)
        return; setBundle(r.bundle); const w = r.bundle.works.find(w => w.id === params.get('work')) ?? r.bundle.works.find(w => !['completed', 'sent_to_liaojie', 'archived'].includes(w.status)) ?? r.bundle.works[0]; setSelected(w?.id ?? null); }).catch(e => { if (active)
        setError(e.message); }).finally(() => { if (active)
        setLoading(false); }); return () => { active = false; }; }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
    function saved(w: WeavingWork) { setBundle(b => b ? { ...b, works: b.works.map(old => old.id === w.id ? w : old) } : b); }
    function choose(w: WeavingWork) { leave.requestLeave(() => { setSelected(w.id); router.replace(`/weaving/${id}?work=${encodeURIComponent(w.id)}`, { scroll: false }); }); }
    async function migrate() { if (!bundle?.legacyProjectId)
        return; setBusy(true); try {
        const r = await mutate<{
            bundle: WeavingShuttleBundle;
        }>('/api/dojo/weaving-shuttles', 'POST', { action: 'migrate', legacyProjectId: bundle.legacyProjectId });
        router.replace(`/weaving/${r.bundle.shuttle.id}`);
    }
    catch (e) {
        setError(e instanceof Error ? e.message : String(e));
    }
    finally {
        setBusy(false);
    } }
    async function archive() { if (!bundle || !window.confirm('封存這張織光杼？作品與成品仍保留。'))
        return; setBusy(true); try {
        await mutate('/api/dojo/weaving-shuttles', 'PATCH', { id: bundle.shuttle.id, expectedRevision: bundle.shuttle.revision, shuttle: { status: 'archived' } });
        router.push('/weaving');
    }
    catch (e) {
        setError(e instanceof Error ? e.message : String(e));
    }
    finally {
        setBusy(false);
    } }
    if (loading)
        return <section className="screen"><p role="status">正在打開織光杼…</p></section>;
    if (!bundle)
        return <section className="screen"><p role="alert">{error || '找不到織光杼'}</p><button onClick={() => location.reload()}>重新讀取</button></section>;
    const s = bundle.shuttle, c = currentCore(s), w = bundle.works.find(w => w.id === selected);
    return <section className="screen wf-workspace"><div className="hero we"><span className="eyebrow">織光堂 · 核心經線 v{c.number}</span><h1>{s.title}</h1><p>{c.statement}</p></div>{error && <p role="alert">{error}</p>}{bundle.legacyProjectId ? <section className="ritual-card"><h2>把舊版織光案升級成織光杼</h2><p>保留來源、核心、舊稿、成品及原始 ID 對照。讀取不會自動遷移。</p><button className="primary" disabled={busy} onClick={() => void migrate()}>確認升級這張</button></section> : <>
 <section className="ritual-card"><h2>核心經線</h2><p>{c.statement}</p><details><summary>查看題材與觀點變化</summary><div className="full-text-preview">{s.sourceSnapshot}</div><ol>{s.coreVersions.map(v => <li key={v.id}><b>v{v.number} · {v.statement}</b><p>{v.changeNote}</p></li>)}</ol></details><ClaimCandidateComposer source={{ sourceType: 'weaving_core', sourceId: `${s.id}:${c.id}`, label: `${s.title}・核心經線 v${c.number}`, locator: `核心經線 v${c.number}`, url: '', snapshot: s.sourceSnapshot }} defaultStatement={c.statement} defaultType="perspective" buttonLabel="整理成目前立場候選"/><DirectionForm key={s.id} shuttle={s} onSaved={shuttle => setBundle(b => b ? { ...b, shuttle } : b)}/></section>
 <section className="ritual-card"><h2>作品緯線</h2><div className="work-line-tabs">{bundle.works.map(item => <button key={item.id} aria-pressed={item.id === selected} onClick={() => choose(item)}><b>{item.title}</b><small>{WEAVING_FORMATS[item.format]} · {({selecting:'選擇中',drafting:'草稿中',producing:'製作中',reviewing:'確認中',completed:'已完成',sent_to_liaojie:'已送聊解室',archived:'已封存'})[item.status]}</small></button>)}</div><button onClick={() => leave.requestLeave(() => setNewOpen(!newOpen))}>{newOpen ? '收起新作品表單' : '＋ 發展新作品'}</button>{newOpen && <NewWorkForm shuttle={s} onCreated={(item,shuttle) => { setBundle(b => b ? { ...b,shuttle, works: [...b.works, item] } : b); setNewOpen(false); setSelected(item.id); router.replace(`/weaving/${id}?work=${item.id}`, { scroll: false }); }}/>}</section>
 {w && <>{w.format === 'text' ? <TextWorkspace key={w.id} work={w} shuttle={s} onSaved={saved} onConverted={(item,shuttle)=>{setBundle(b=>b?{...b,shuttle,works:[...b.works,item]}:b);setSelected(item.id);router.replace(`/weaving/${id}?work=${item.id}`,{scroll:false});}}/> : <OtherWork key={w.id} work={w} onSaved={saved}/>}<WeeklyAction work={w} shuttle={s}/>{(w.currentCompletionVersionId || ['completed', 'sent_to_liaojie'].includes(w.status)) && <><ReflectionForm key={w.id} work={w} shuttle={s} onSaved={r => { if (r.shuttle.id !== s.id) {
            router.push(`/weaving/${r.shuttle.id}?work=${r.nextWork?.id ?? ''}`);
            return;
        } setBundle(b => b ? { ...b, shuttle: r.shuttle, works: [...b.works.map(old => old.id === r.work.id ? r.work : old), ...(r.nextWork ? [r.nextWork] : [])] } : b); if (r.nextWork)
            setSelected(r.nextWork.id); }}/>{w.reflection && <ClaimCandidateComposer source={{ sourceType: 'weaving_reflection', sourceId: `${w.id}:${w.reflection.createdAt}`, label: `${w.title}・作品回杼`, locator: w.reflection.createdAt, url: w.outputUrl, snapshot: w.finalSnapshot.slice(0, 12000) }} defaultStatement={w.reflection.insight} defaultType="experience" buttonLabel="整理成創作後知識候選"/>}</>}</>}
 <button disabled={busy} className="danger-button" onClick={() => leave.requestLeave(() => void archive())}>封存這張織光杼</button>
 </>}</section>;
}
export default function WeavingProjectWorkbench() { return <LeaveProvider><Workbench /></LeaveProvider>; }
