'use client';
import {beginIntent,confirmIntent} from '@/lib/dojo/weavingWorkflow/clientIdentity';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import CreativeIcon from '../creative/CreativeIcon';
import CreativeFlowOverview from '../creative/CreativeFlowOverview';
import type { CreativeIconName } from '@/lib/dojo/creativeWorkflowSteps';
import { get, mutate } from '../weaving/client';
import type { WeavingWork } from '@/lib/dojo/weavingShuttle';
import './studio.css';
function Entry({href,icon,title,description}:{href:string;icon:CreativeIconName;title:string;description:string}) {
    return <Link className="studio-tool-entry" href={href}><span className="studio-tool-symbol"><CreativeIcon name={icon}/></span><span><b>{title}</b><small>{description}</small></span><CreativeIcon name="chevron"/></Link>;
}
export default function StudioHome({ realm = 'weaving' }: {
    realm?: 'weaving' | 'liaojie';
}) {
    const [work, setWork] = useState<WeavingWork | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
    const router = useRouter();
    useEffect(() => { let live = true; if (realm === 'weaving')
        get<{
            works: WeavingWork[];
        }>('/api/dojo/creative-studio').then(r => { if (live)
            setWork(r.works.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] || null); }).catch(e => { if (live)
            setError(String(e)); }); return () => { live = false; }; }, [realm]);
    async function start() {const intent=beginIntent('studio-home-start',{}); setBusy(true); setError(''); try {
        const r = await mutate<{
            work: WeavingWork;
        }>('/api/dojo/creative-studio', 'POST', { action:'create',title:'未命名探索草稿',requestNonce:intent.id });
        confirmIntent('studio-home-start',intent.id);router.push('/weaving/works/' + r.work.id);
    }
    catch (e) {
        setError(String(e));
    }
    finally {
        setBusy(false);
    } }
    return <div className="studio-home">{error && <p role="alert">{error}</p>}{realm === 'weaving' ? <>
 <section className="ritual-card studio-start-card"><span className="eyebrow">從一件作品開始</span><h2>今天，想把什麼寫出來？</h2><p>選一段生活素材，或直接從想法試寫。織光杼可以稍後再歸屬。</p><button className="primary full-button" disabled={busy} onClick={() => void start()}><CreativeIcon name="pen"/>{busy ? '正在開啟…' : '從素材／想法開始'}</button><CreativeFlowOverview/>{work && <Link className="studio-entry studio-resume" href={'/weaving/works/' + work.id}><CreativeIcon name="document"/><span><small>繼續目前作品</small><b>{work.title}</b></span><CreativeIcon name="chevron"/></Link>}</section>
 <section className="ritual-card"><div className="creative-section-heading"><CreativeIcon name="layers"/><h2>作品與主題</h2></div><div className="studio-entry-list"><Entry href="/weaving/works" icon="document" title="作品與探索草稿" description="接續已有作品，或找回保存的文字"/><Entry href="/weaving/topics" icon="layers" title="織光杼與多個方向" description="累積同一主題的不同理解"/><Entry href="/weaving/proposals" icon="compass" title="點點的提案" description="核對取材與角度，再選一件開始"/></div><details className="studio-secondary"><summary>素材、語氣與資料管理</summary><div className="studio-link-grid"><Entry href="/weaving/sources" icon="inbox" title="來源與公開設定" description="分別核對讀取與公開用途"/><Entry href="/forage" icon="sprout" title="前往野採" description="從生活紀錄找回素材"/><Entry href="/weaving/import" icon="handoff" title="舊資料預覽與匯入" description="先預覽，保留原稿與歷史"/><Entry href="/weaving/voice" icon="chat" title="我的語氣庫" description="從已發表作品累積語氣偏好"/></div></details></section>
 </> : <><section className="ritual-card studio-start-card"><span className="eyebrow">品牌編排與發布</span><div className="creative-section-heading"><CreativeIcon name="chat"/><h2>把完成的作品，帶到外界</h2></div><p>接收織光堂的固定版本，選擇本次要使用的平台。</p><Link className="button-link studio-primary-link" href="/liaojie/workbench">待整理／發布作品<CreativeIcon name="chevron"/></Link><Entry href="/liaojie/releases" icon="eye" title="作品發布與交流回看" description="記下實際發表與收到的回應"/></section>
 <section className="ritual-card"><div className="creative-section-heading"><CreativeIcon name="clock"/><h2>活動、預約與個別交付</h2></div><p>新月、滿月小儀式與服務安排，分別處理集體訊息和每人的解讀。</p><Link className="button-link studio-primary-link" href="/liaojie/services">活動與私人交付工作端<CreativeIcon name="chevron"/></Link><div className="studio-link-grid"><Entry href="/calendar" icon="calendar" title="行事曆" description="查看已安排的時間"/><Entry href="/liaojie/sanko" icon="sun" title="日上三更" description="開啟既有內容企劃"/><Entry href="/plurk" icon="layers" title="噗浪蓋樓" description="整理分樓與發布文字"/><Entry href="/weaving/voice" icon="chat" title="語氣庫" description="查看本人確認的語氣偏好"/></div></section></>}
 </div>;
}
