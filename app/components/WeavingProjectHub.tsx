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
    <section className="weaving-inbox">
      <div className="section-heading weaving-inbox-heading"><div><span className="eyebrow">創作脈絡</span><h2>織光杼</h2><p className="lead">母卡不必完成；它保存觀點如何經由作品持續生長。</p></div><span className="weaving-count">{bundles.length}</span></div>
      {loading && <div className="empty">正在整理織光杼…</div>}
      {error && <p className="form-error">{error}<button className="text-link" onClick={() => void load()}>重新讀取</button></p>}
      {!loading && !error && bundles.length === 0 && <div className="weaving-empty"><span>◇</span><b>還沒有織光杼</b><p>可從下方成熟素材開始，或手動建立第一張。</p></div>}
      <div className="weaving-project-list">{[...bundles].sort((a,b)=>Number(b.works.some(w=>!['completed','sent_to_liaojie','archived'].includes(w.status)))-Number(a.works.some(w=>!['completed','sent_to_liaojie','archived'].includes(w.status)))).map((bundle) => {
            const activeWork = bundle.works.find((work) => !["completed", "sent_to_liaojie", "archived"].includes(work.status)) ?? bundle.works[0];
            return <Link href={`/weaving/${bundle.shuttle.id}${activeWork ? `?work=${encodeURIComponent(activeWork.id)}` : ""}`} className="weaving-project-row shuttle-row" key={bundle.shuttle.id}>
          <div><small>{SHUTTLE_STATUS[bundle.shuttle.status]} · 核心經線 v{currentCore(bundle.shuttle).number}{bundle.legacyProjectId ? " · 舊版待升級" : ""}</small><b>{bundle.shuttle.title}</b><p>{currentCore(bundle.shuttle).statement}</p><em>{bundle.works.length} 件作品</em></div>
          <span>{activeWork ? `${WEAVING_FORMATS[activeWork.format]} · ${WORK_STATUS[activeWork.status]}` : "尚未建立作品"}<br /><b>{activeWork?.nextAction || "建立第一件作品"}</b></span>
        </Link>;
        })}</div>
    </section><section className="ritual-card"><div className="section-heading"><div><span className="eyebrow">新的創作根系</span><h2>建立織光杼</h2><p>杼（ㄓㄨˋ）牽引核心觀點，長成一件又一件作品。</p></div><button onClick={() => leave.requestLeave(() => setCreating(!creating))}>{creating ? '收起' : '＋ 建立織光杼'}</button></div>{creating && <CreateShuttleForm />}</section></div>;
}
export default function WeavingProjectHub() { return <LeaveProvider><Hub /></LeaveProvider>; }
