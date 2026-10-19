'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { contentKey, KIND_LABELS, type ContentKind, type ContentItem } from '@/lib/dojo/readingKnowledge/model';
import type { SearchPage } from '@/lib/dojo/readingKnowledge/search';
import RelationsPanel from './RelationsPanel';
import './readingKnowledge.css';
export default function ExploreWorkspace() {
    const [q, setQ] = useState(''), [kind, setKind] = useState(''), [book, setBook] = useState(''), [topic, setTopic] = useState(''), [subject, setSubject] = useState(''), [subjects, setSubjects] = useState<{
        id: string;
        name: string;
        status: string;
    }[]>([]), [subjectError, setSubjectError] = useState('');
    const [items, setItems] = useState<ContentItem[]>([]), [page, setPage] = useState<SearchPage | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
    const generation = useRef(0), active = useRef(false);
    const [books, setBooks] = useState<{
        id: string;
        title: string;
    }[]>([]), [bookCursor, setBookCursor] = useState<string | null>(null), [bookError, setBookError] = useState('');
    const load = useCallback(async (cursor: string | null, reset = false, g = generation.current) => { setBusy(true); active.current = true; setError(''); try {
        const p = new URLSearchParams({ q });
        if (kind)
            p.set('kind', kind);
        if (book)
            p.set('bookId', book);
        if (topic)
            p.set('topic', topic);
        if (subject)
            p.set('learningItemId', subject);
        if (cursor)
            p.set('cursor', cursor);
        const r = await fetch(`/api/dojo/reading-knowledge?${p}`, { cache: 'no-store' });
        const j = await r.json();
        if (!r.ok)
            throw Error(j.error ?? '無法搜尋');
        if (g !== generation.current)
            return;
        setPage(j);
        setItems(old => [...new Map([...(reset ? [] : old), ...j.items].map((i: ContentItem) => [contentKey(i.ref), i])).values()]);
    }
    catch (e) {
        if (g === generation.current)
            setError(e instanceof Error ? e.message : '無法搜尋');
    }
    finally {
        if (g === generation.current) {
            setBusy(false);
            active.current = false;
        }
    } }, [q, kind, book, topic, subject]);
    const invalidate = useCallback(() => { generation.current++; }, []);
    useEffect(() => { const g = ++generation.current; const t = setTimeout(() => { setItems([]); setPage(null); void load(null, true, g); }, 250); return () => { clearTimeout(t); invalidate(); }; }, [load, invalidate]);
    async function loadBooks(cursor: string | null) { try {
        setBookError('');
        const p = new URLSearchParams({ mode: 'books' });
        if (cursor)
            p.set('cursor', cursor);
        const r = await fetch(`/api/dojo/reading-knowledge?${p}`, { cache: 'no-store' });
        const j = await r.json();
        if (!r.ok)
            throw Error(j.error ?? '無法讀取書籍');
        setBooks(old => [...new Map([...old, ...j.items].map((b: {
                id: string;
                title: string;
            }) => [b.id, b])).values()]);
        setBookCursor(j.cursor);
    }
    catch (e) {
        setBookError(e instanceof Error ? e.message : '無法讀取書籍');
    } }
    useEffect(() => { const t = setTimeout(() => void loadBooks(null), 0); return () => clearTimeout(t); }, []);
    async function loadSubjects() { try {
        const r = await fetch('/api/dojo/reading-knowledge/annotations?mode=subjects', { cache: 'no-store' });
        const j = await r.json();
        if (!r.ok)
            throw Error(j.error ?? '無法讀取學科');
        setSubjects(j.subjects);
        setSubjectError('');
    }
    catch (e) {
        setSubjectError(e instanceof Error ? e.message : '無法讀取學科');
    } }
    useEffect(() => { const t = setTimeout(() => void loadSubjects(), 0); return () => clearTimeout(t); }, []);
    function clear() { setQ(''); setKind(''); setBook(''); setTopic(''); setSubject(''); }
    return <div className="rk-workspace"><section className="ritual-card rk-search"><label htmlFor="rk-query">搜尋內容</label><input id="rk-query" type="search" value={q} maxLength={200} onChange={e => setQ(e.target.value)} placeholder="書名、筆記、洞察或知識關鍵字"/><details><summary>篩選內容</summary><div className="rk-filters"><label>資料種類<select value={kind} onChange={e => setKind(e.target.value)}><option value="">全部種類</option>{(['reading_note', 'reading_insight', 'knowledge_claim'] as ContentKind[]).map(k => <option value={k} key={k}>{KIND_LABELS[k]}</option>)}</select></label><label>書籍與讀次<select value={book} onChange={e => setBook(e.target.value)}><option value="">全部書籍</option>{books.map(b => <option value={b.id} key={b.id}>{b.title}</option>)}</select></label>{bookCursor && <button disabled={busy} onClick={() => void loadBooks(bookCursor)}>載入更多書籍</button>}{bookError && <p role="alert">{bookError}<button onClick={() => void loadBooks(bookCursor)}>重新讀取書籍</button></p>}<label>關聯學科<select value={subject} onChange={e => setSubject(e.target.value)}><option value="">全部學科／未分類</option>{subjects.map(s => <option key={s.id} value={s.id}>{s.name}{s.status === 'archived' ? '（已封存）' : ''}</option>)}</select></label>{subjectError && <p role="alert">{subjectError}<button onClick={() => void loadSubjects()}>重新讀取學科</button></p>}<label>主題<input value={topic} maxLength={40} onChange={e => setTopic(e.target.value)} placeholder="原有分類或自訂主題"/></label></div></details><div className="rk-tags">{q && <button onClick={() => setQ('')}>關鍵字：{q} ×</button>}{kind && <button onClick={() => setKind('')}>{KIND_LABELS[kind as ContentKind]} ×</button>}{book && <button onClick={() => setBook('')}>{books.find(b => b.id === book)?.title ?? '已選書籍'} ×</button>}{subject && <button onClick={() => setSubject('')}>學科：{subjects.find(s => s.id === subject)?.name ?? '已選學科'} ×</button>}{topic && <button onClick={() => setTopic('')}>主題：{topic} ×</button>}</div>{(q || kind || book || topic || subject) && <button onClick={clear}>全部清除</button>}</section>
 <div className="rk-status" aria-live="polite">{busy ? <p>正在搜尋…</p> : page && <><p>{page.complete ? '已搜尋所有可讀取內容。' : '已搜尋部分資料，可繼續載入。'}</p><small>讀取時間：{new Date(page.readAt).toLocaleString('zh-TW')}</small>{Object.entries(page.sourceStates).filter(([, s]) => s === 'failed').map(([k]) => <p key={k}>{KIND_LABELS[k as ContentKind]}暫時讀取失敗，可繼續載入重試。</p>)}</>}{error && <p role="alert">{error}</p>}</div>
 {!busy && page?.complete && !items.length && <p className="empty">沒有符合條件的內容。</p>}
 <div className="rk-results">{items.map(i => <article className="ritual-card rk-result" key={contentKey(i.ref)}><small>{KIND_LABELS[i.ref.kind]} · {i.status}</small><h2><Link href={i.href}>{i.title}</Link></h2><p>{i.text.slice(0, 220)}</p><small>{i.locator}</small><div className="rk-tags">{i.originalTopics.map(t => <span key={t}>{t}</span>)}</div><p><Link href={i.href}>開啟原紀錄</Link></p><RelationsPanel target={i.ref} onClassified={() => { generation.current++; setItems([]); setPage(null); void load(null, true); }}/></article>)}</div>
 <div className="rk-actions">{!page?.complete && page?.cursor && <button className="primary" disabled={busy} onClick={() => { if (!active.current)
        void load(page.cursor); }}>繼續載入／重試未完成來源</button>}{error && <button disabled={busy} onClick={() => void load(page?.cursor ?? null, !page)}>重新讀取</button>}<button disabled={busy} onClick={() => { generation.current++; setItems([]); setPage(null); void load(null, true); }}>重新整理</button></div></div>;
}
