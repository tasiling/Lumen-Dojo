'use client';
import {beginIntent,confirmIntent} from '@/lib/dojo/weavingWorkflow/clientIdentity';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { get, mutate } from '../weaving/client';
import { useRouter } from 'next/navigation';
import { catalogPage } from '@/lib/dojo/creativeStudio/model';
import type { WeavingWork } from '@/lib/dojo/weavingShuttle';
import './studio.css';
export default function StudioManager() { const [works, setWorks] = useState<WeavingWork[]>([]), [query, setQuery] = useState(''), [page, setPage] = useState(1), [error, setError] = useState(''), [busy, setBusy] = useState(false); const router = useRouter(); useEffect(() => { get<{
    works: WeavingWork[];
}>('/api/dojo/creative-studio').then(r => setWorks(r.works)).catch(e => setError(String(e))); }, []); const p = catalogPage(works, query, page); async function create() { const intent=beginIntent('studio-work-create',{});setBusy(true); try {
    const r = await mutate<{
        work: WeavingWork;
    }>('/api/dojo/creative-studio', 'POST', { action: 'create', another: true, requestNonce: intent.id, title: '未命名探索草稿' });
    confirmIntent('studio-work-create',intent.id);router.push('/weaving/works/' + r.work.id);
}
catch (e) {
    setError(String(e));
}
finally {
    setBusy(false);
} } return <section className="screen studio"><h1>作品與探索草稿</h1><p>每次保存接續同一件作品；只有明確「另做一件」才新增。</p>{error && <p role="alert">{error}</p>}<label>搜尋作品名稱或識別<input type="search" value={query} onChange={e => { setQuery(e.target.value); setPage(1); }}/></label><button className="primary" disabled={busy} onClick={() => void create()}>另做一件</button><div className="studio-catalog" data-testid="studio-catalog">{p.rows.map(w => <Link className="ritual-card studio-entry" href={'/weaving/works/' + w.id} key={w.id}><span><b>{w.title}</b><small>{w.shuttleId ? '已歸屬主題' : '未歸屬探索'} · {w.completionVersionRefs.length} 份完稿<br />{w.id}</small></span></Link>)}{!p.count && <p>還沒有符合條件的作品。</p>}</div><div className="studio-actions"><button disabled={p.page <= 1} onClick={() => setPage(p.page - 1)}>上一頁</button><span>{p.page} / {p.pages} · 共 {p.count} 件</span><button disabled={p.page >= p.pages} onClick={() => setPage(p.page + 1)}>下一頁</button></div><Link href="/weaving/legacy">查看舊正式作品與升級入口</Link><Link href="/weaving">返回織光堂</Link></section>; }
