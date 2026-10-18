"use client";
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { WEAVING_FORMATS } from '@/lib/dojo/weavingProjects';
import { currentCore, type WeavingShuttleBundle } from '@/lib/dojo/weavingShuttle';
import LeaveProvider, { useLeave } from './weaving/LeaveDialog';
import CreateShuttleForm from './weaving/CreateShuttleForm';
import { get } from './weaving/client';
import '@/app/weaving/workflow.css';
const SHUTTLE_STATUS = { active: '正在發展', resting: '暫時沉澱', branched: '已產生分支', archived: '已封存' };
const WORK_STATUS = { selecting: '選擇中', drafting: '草稿中', producing: '製作中', reviewing: '確認中', completed: '已完成', sent_to_liaojie: '已送聊解室', archived: '已封存' };
function Hub() {
    const [bundles, setBundles] = useState<WeavingShuttleBundle[]>([]), [loading, setLoading] = useState(true), [error, setError] = useState<string | null>(null), [creating, setCreating] = useState(false);
    const leave = useLeave();
    const resumable = bundles.flatMap(bundle => bundle.works.filter(work => !['completed', 'sent_to_liaojie', 'archived'].includes(work.status)).map(work => ({bundle, work}))).find(({bundle}) => bundle.shuttle.status !== 'archived');
    const load = useCallback(async () => { setLoading(true); try {
        const r = await get<{
            bundles: WeavingShuttleBundle[];
        }>('/api/dojo/weaving-shuttles');
        setBundles(r.bundles);
        setError(null);
    }
    catch (e) {
        setError(e instanceof Error ? e.message : String(e));
    }
    finally {
        setLoading(false);
    } }, []);
    useEffect(() => { const t = setTimeout(() => void load(), 0); return () => clearTimeout(t); }, [load]);
    return <div className="wf-hub">
    <section className="ritual-card wf-start"><span className="eyebrow">從一件作品開始</span><h2>{resumable ? '接著寫，讓作品慢慢成形' : '今天，想把什麼寫出來？'}</h2><p>選一段素材，寫下自己的觀點，再完成文字。不需要先整理所有筆記。</p>
    <div className="wf-start-actions">{resumable && <Link className="primary wf-resume" href={`/weaving/${resumable.bundle.shuttle.id}?work=${resumable.work.id}`}>繼續創作：{resumable.work.title}</Link>}
    <button className={resumable ? '' : 'primary'} disabled={loading} onClick={() => leave.requestLeave(() => setCreating(!creating))}>{creating ? '收起建立表單' : resumable || bundles.length ? '＋ 開始新作品' : '開始第一件作品'}</button></div>
    <p className="wf-note">選素材 → 定觀點 → 寫內容 → 預覽定稿 → 準備發布</p>{creating && <CreateShuttleForm />}</section>
    <section className="weaving-inbox">
      <div className="section-heading weaving-inbox-heading"><div><span className="eyebrow">持續發展的觀點</span><h2>創作主題・織光杼</h2><p className="lead">同一個主題，可以長出文章、貼文與不同作品。</p></div><span className="weaving-count">{bundles.length}</span></div>
      {loading && <div className="empty">正在整理織光杼…</div>}
      {error && <p className="form-error">{error}<button className="text-link" onClick={() => void load()}>重新讀取</button></p>}
      {!loading && !error && bundles.length === 0 && <p className="wf-note">建立第一件作品後，主題與作品會一起收在這裡。</p>}
      <div className="weaving-project-list">{[...bundles].sort((a,b)=>Number(b.works.some(w=>!['completed','sent_to_liaojie','archived'].includes(w.status)))-Number(a.works.some(w=>!['completed','sent_to_liaojie','archived'].includes(w.status)))).map((bundle) => {
            const activeWork = bundle.works.find((work) => !["completed", "sent_to_liaojie", "archived"].includes(work.status)) ?? bundle.works[0];
            return <Link href={`/weaving/${bundle.shuttle.id}${activeWork ? `?work=${encodeURIComponent(activeWork.id)}` : ""}`} className="weaving-project-row shuttle-row" key={bundle.shuttle.id}>
          <div><small>{SHUTTLE_STATUS[bundle.shuttle.status]} · 核心經線 v{currentCore(bundle.shuttle).number}{bundle.legacyProjectId ? " · 舊版待升級" : ""}</small><b>{bundle.shuttle.title}</b><p>{currentCore(bundle.shuttle).statement}</p><em>{bundle.works.length} 件作品</em></div>
          <span>{activeWork ? `${WEAVING_FORMATS[activeWork.format]} · ${WORK_STATUS[activeWork.status]}` : "尚未建立作品"}<br /><b>{activeWork?.nextAction || "建立第一件作品"}</b></span>
        </Link>;
        })}</div>
    </section></div>;
}
export default function WeavingProjectHub() { return <LeaveProvider><Hub /></LeaveProvider>; }
