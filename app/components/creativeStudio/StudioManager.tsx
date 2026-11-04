'use client';
import { beginIntent, confirmIntent } from '@/lib/dojo/weavingWorkflow/clientIdentity';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { get, mutate } from '../weaving/client';
import { useRouter } from 'next/navigation';
import { catalogPage } from '@/lib/dojo/creativeStudio/model';
import type { WeavingWork } from '@/lib/dojo/weavingShuttle';
import './studio.css';
export default function StudioManager({ realm = 'weaving' }: {
    realm?: 'weaving' | 'liaojie';
}) {
    const [works, setWorks] = useState<WeavingWork[]>([]), [query, setQuery] = useState(''), [page, setPage] = useState(1), [tab, setTab] = useState('active'), [kind, setKind] = useState(''), [platform, setPlatform] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false), [selected, setSelected] = useState<string[]>([]);
    const router = useRouter();
    async function load() {
        const r = await get<{
            works: WeavingWork[];
        }>('/api/dojo/creative-studio?includeArchived=1');
        setWorks(r.works);
    }
    useEffect(() => {
        get<{
            works: WeavingWork[];
        }>('/api/dojo/creative-studio?includeArchived=1').then(r => { setWorks(r.works); }).catch(e => setError(String(e)));
    }, []);
    const rows = works.filter(w => (tab === 'archived' ? w.status === 'archived' : tab === 'completed' ? ['completed', 'sent_to_liaojie'].includes(w.status) : !['archived', 'completed', 'sent_to_liaojie'].includes(w.status)) && (!kind || w.studio?.contentKind === kind) && (!platform || w.studio?.platform === platform));
    const p = catalogPage(rows.map(w => ({ ...w, status: 'visible' })), query, page);
    async function create() {
        const intent = beginIntent('studio-work-create', {});
        setBusy(true);
        try {
            const r = await mutate<{
                work: WeavingWork;
            }>('/api/dojo/creative-studio', 'POST', { action: 'create', another: true, requestNonce: intent.id, title: '未命名探索草稿' });
            confirmIntent('studio-work-create', intent.id);
            router.push('/' + realm + '/works/' + r.work.id);
        }
        catch (e) {
            setError(String(e));
        }
        finally {
            setBusy(false);
        }
    }
    async function batch(transition: string) {
        setBusy(true);
        setError('');
        try {
            for (const id of selected) {
                const w = works.find(w => w.id === id);
                if (w)
                    await mutate('/api/dojo/creative-studio', 'POST', { action: 'transition', transition, id, expectedRevision: w.revision });
            }
            setSelected([]);
        }
        catch (e) {
            setError('部分操作未完成，請核對清單：' + String(e));
        }
        finally {
            await load();
            setBusy(false);
        }
    }
    return <section className="screen studio"><h1>作品與探索草稿</h1><p>原文與衍生稿各自管理，透過來源連結接續。完稿與封存後，會移出進行中。</p>{error && <p role="alert">{error}</p>}<nav className="studio-actions" aria-label="作品狀態">{Object.entries({ active: '進行中', completed: '已完稿', archived: '已封存' }).map(([v, l]) => <button key={v} aria-pressed={tab === v} onClick={() => { setTab(v); setPage(1); setSelected([]); }}>{l}</button>)}</nav><label>搜尋作品<input type="search" value={query} onChange={e => { setQuery(e.target.value); setPage(1); }}/></label><div className="studio-actions" aria-label="內容類型">{Object.entries({ '': '全部類型', article: '文章', story: '限動', illustrated: '圖文' }).map(([v, l]) => <button key={v} aria-pressed={kind === v} onClick={() => { setKind(v); setPage(1); }}>{l}</button>)}</div><div className="studio-actions" aria-label="發布平台">{['', 'IG', 'Threads', '噗浪'].map(v => <button key={v} aria-pressed={platform === v} onClick={() => { setPlatform(v); setPage(1); }}>{v || '全部平台'}</button>)}</div><button className="primary" disabled={busy} onClick={() => void create()}>開始創作</button>{selected.length > 0 && <button disabled={busy} onClick={() => void batch(tab === 'archived' ? 'restore' : 'archive')}>{tab === 'archived' ? '恢復' : '封存'}選取的 {selected.length} 件</button>}<div className="studio-catalog" data-testid="studio-catalog">{p.rows.map(w => <article className="ritual-card" key={w.id}><label><input type="checkbox" checked={selected.includes(w.id)} onChange={e => setSelected(e.target.checked ? [...selected, w.id] : selected.filter(id => id !== w.id))}/>選取</label><Link className="studio-entry" href={'/' + realm + '/works/' + w.id}><span><b>{w.title}</b><small>{{ article: '文章', story: '限動', illustrated: '圖文' }[w.studio?.contentKind || 'article'] || w.studio?.contentKind} · {w.studio?.platform || '未指定平台'} · {w.completionVersionRefs.length} 份完稿</small></span></Link>{w.derivedFromWorkId && <Link href={'/' + realm + '/works/' + w.derivedFromWorkId}>來源作品：{works.find(x => x.id === w.derivedFromWorkId)?.title || w.derivedFromWorkId}</Link>}</article>)}{!p.count && <p>這個區域目前沒有符合條件的作品。</p>}</div><div className="studio-actions"><button disabled={p.page <= 1} onClick={() => setPage(p.page - 1)}>上一頁</button><span>{p.page} / {p.pages} · 共 {p.count} 件</span><button disabled={p.page >= p.pages} onClick={() => setPage(p.page + 1)}>下一頁</button></div><Link href={'/'+realm+'/legacy'}>舊版作品（搬遷驗收期間保留）</Link><Link href={'/' + realm}>返回{realm === 'liaojie' ? '聊解室' : '織光堂'}</Link></section>;
}
