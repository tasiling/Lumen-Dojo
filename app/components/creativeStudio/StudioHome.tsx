'use client';
import {beginIntent,confirmIntent} from '@/lib/dojo/weavingWorkflow/clientIdentity';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import CreativeIcon from '../creative/CreativeIcon';
import { get, mutate } from '../weaving/client';
import type { WeavingWork } from '@/lib/dojo/weavingShuttle';
import './studio.css';
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
 <section className="ritual-card"><span className="eyebrow">從一件作品開始</span><h2>今天，想把什麼寫出來？</h2><p>選一段生活素材，或直接從想法試寫。織光杼可以稍後再歸屬。</p><button className="primary full-button" disabled={busy} onClick={() => void start()}><CreativeIcon name="pen"/>{busy ? '正在開啟…' : '從素材／想法開始'}</button>{work && <Link className="studio-entry" href={'/weaving/works/' + work.id}><CreativeIcon name="document"/><span>繼續目前作品<b>{work.title}</b></span><CreativeIcon name="chevron"/></Link>}</section>
 <section className="ritual-card"><h2>作品與主題</h2><div className="studio-link-grid"><Link href="/weaving/works">作品／探索草稿管理</Link><Link href="/weaving/topics">織光杼與多個方向</Link><Link href="/weaving/proposals">點點的提案</Link><Link href="/weaving/sources">來源與公開設定</Link><Link href="/forage">前往野採</Link><Link href="/weaving/import">舊資料預覽與匯入</Link><Link href="/weaving/voice">我的語氣庫</Link></div></section>
 </> : <><section className="ritual-card"><span className="eyebrow">品牌編排與發布</span><h2>把完成的作品，帶到外界</h2><p>接收織光堂的固定版本，選擇本次要使用的平台。</p><Link className="button-link" href="/liaojie/workbench">待整理／發布作品<CreativeIcon name="chevron"/></Link><Link className="studio-entry" href="/liaojie/releases">作品發布與交流回看<CreativeIcon name="eye"/></Link></section>
 <section className="ritual-card"><h2>活動、預約與個別交付</h2><p>新月、滿月小儀式與服務安排，分別處理集體訊息和每人的解讀。</p><Link className="button-link" href="/liaojie/services">活動與私人交付工作端<CreativeIcon name="chevron"/></Link><div className="studio-link-grid"><Link href="/calendar">行事曆</Link><Link href="/liaojie/sanko">日上三更</Link><Link href="/plurk">噗浪蓋樓</Link><Link href="/weaving/voice">語氣庫</Link></div></section></>}
 </div>;
}
