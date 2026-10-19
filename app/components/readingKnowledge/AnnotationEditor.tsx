'use client';
import { useEffect, useRef, useState } from 'react';
import { contentKey, type ContentRef } from '@/lib/dojo/readingKnowledge/model';
import type { Annotation, AnnotationInput, EffectiveClassification } from '@/lib/dojo/readingKnowledge/annotations';
import './readingKnowledge.css';
type Subject = {
    id: string;
    name: string;
    status: string;
};
export default function AnnotationEditor({ target, onSaved }: {
    target: ContentRef;
    onSaved?: () => void;
}) {
    const [open, setOpen] = useState(false), [loaded, setLoaded] = useState(false), [topics, setTopics] = useState(''), [ids, setIds] = useState<string[]>([]), [inherit, setInherit] = useState(true), [revision, setRevision] = useState(0), [subjects, setSubjects] = useState<Subject[]>([]), [effective, setEffective] = useState<EffectiveClassification | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState(''), [current, setCurrent] = useState<Annotation | null>(null), [pending, setPending] = useState<AnnotationInput | null>(null);
    const inFlight = useRef(false);
    const key = `rk-pending:${contentKey(target)}`;
    useEffect(() => { const t = setTimeout(() => { try {
        const saved = sessionStorage.getItem(key);
        if (saved)
            setPending(JSON.parse(saved));
    }
    catch {
        setError('無法讀取這個分頁的未確認操作，請先查核後台。');
    } }, 0); return () => clearTimeout(t); }, [key]);
    function retain(input: AnnotationInput | null) { setPending(input); try {
        if (input)
            sessionStorage.setItem(key, JSON.stringify(input));
        else
            sessionStorage.removeItem(key);
    }
    catch {
        setNotice('這個瀏覽器無法保存操作緩衝，請在此頁完成核對。');
    } }
    async function load(keepDraft = false) { if (inFlight.current)
        return; inFlight.current = true; setBusy(true); setError(''); try {
        const r = await fetch('/api/dojo/reading-knowledge/annotations?' + new URLSearchParams({ ref: JSON.stringify(target) }), { cache: 'no-store' });
        const j = await r.json();
        if (!r.ok)
            throw Error(j.error ?? '無法讀取分類');
        setSubjects(j.subjects);
        setRevision(j.annotation?.revision ?? 0);
        setCurrent(j.annotation);
        setEffective(j.effective);
        if (!keepDraft) {
            setTopics(j.annotation?.topics.join('、') ?? '');
            setIds(j.annotation?.learningItemIds ?? []);
            setInherit(j.annotation?.inheritBookSubjects ?? true);
        }
        setLoaded(true);
    }
    catch (e) {
        setError(e instanceof Error ? e.message : '無法讀取分類');
    }
    finally {
        inFlight.current = false;
        setBusy(false);
    } }
    async function send(input: AnnotationInput) { if (inFlight.current)
        return; inFlight.current = true; setBusy(true); setError(''); setNotice(''); retain(input); try {
        const r = await fetch('/api/dojo/reading-knowledge/annotations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
        const j = await r.json();
        if (!r.ok) {
            if (r.status >= 400 && r.status < 500)
                retain(null);
            throw Error(j.error ?? '無法儲存分類');
        }
        retain(null);
        setCurrent(j.annotation);
        setRevision(j.annotation.revision);
        setNotice('主題與學科已儲存。');
        onSaved?.();
    }
    catch (e) {
        setError(e instanceof Error ? e.message : '寫入結果未確認，請先核對原操作。');
    }
    finally {
        inFlight.current = false;
        setBusy(false);
    } }
    async function inspect() { if (!pending || inFlight.current)
        return; inFlight.current = true; setBusy(true); setError(''); try {
        const r = await fetch('/api/dojo/reading-knowledge/annotations?' + new URLSearchParams({ operationId: pending.operationId }), { cache: 'no-store' });
        const j = await r.json();
        if (!r.ok)
            throw Error(j.error ?? '無法核對');
        if (j.receipt?.state === 'confirmed') {
            setRevision(j.receipt.annotation.revision);
            setCurrent(j.receipt.annotation);
            retain(null);
            setNotice('已確認原操作成功。');
            onSaved?.();
        }
        else if (j.receipt?.state === 'rejected') {
            retain(null);
            setNotice('原操作已確認未成功，你的輸入仍保留。請重新讀取後再儲存。');
        }
        else
            setNotice(j.receipt ? '結果仍未確認，請保留此頁，待後台核對。' : '尚未找到收據；可以重送同一份原操作，不會改用新識別。');
    }
    catch (e) {
        setError(e instanceof Error ? e.message : '無法核對');
    }
    finally {
        inFlight.current = false;
        setBusy(false);
    } }
    const missing = ids.filter(id => !subjects.some(s => s.id === id));
    return <section className="rk-editor"><button aria-expanded={open} onClick={() => { setOpen(!open); if (!open && !loaded)
        void load(); }}>主題與學科</button>{open && <><p>分類可留空；這些標記不會改變筆記正文、知識版本或學習完成數。</p>{busy && <p role="status">處理中…</p>}{loaded && <><label>自訂主題<input value={topics} disabled={busy || Boolean(pending)} onChange={e => setTopics(e.target.value)} placeholder="用頓號分隔，例如：按摩、肩頸"/></label><fieldset disabled={busy || Boolean(pending)}><legend>直接關聯學科（可複選）</legend>{subjects.map(s => <label className="rk-check" key={s.id}><input type="checkbox" checked={ids.includes(s.id)} onChange={e => setIds(old => e.target.checked ? [...old, s.id] : old.filter(id => id !== s.id))}/>{s.name}{s.status !== 'active' ? `（${s.status === 'archived' ? '已封存' : s.status === 'paused' ? '暫停' : '已完成'}）` : ''}</label>)}{!subjects.length && <p>目前沒有可選的學科，仍可只保存主題。</p>}{missing.map(id => <label className="rk-check" key={id}><input type="checkbox" checked onChange={() => setIds(old => old.filter(v => v !== id))}/>學科已不可用（取消勾選可移除）</label>)}</fieldset>{(target.kind === 'reading_note' || target.kind === 'reading_insight') && <label className="rk-check"><input type="checkbox" checked={inherit} disabled={busy || Boolean(pending)} onChange={e => setInherit(e.target.checked)}/>沿用來源書籍的關聯學科</label>}{inherit && Boolean(effective?.inheritedLearningItemIds.length) && <p className="rk-inherited">來自書籍：{effective?.inheritedLearningItemIds.map(id => subjects.find(s => s.id === id)?.name ?? '學科已不可用').join('、')}</p>}
 <button className="primary" disabled={busy || Boolean(pending)} onClick={() => void send({ ref: target, topics: topics.split(/[、,，\n]/).map(t => t.trim()).filter(Boolean), learningItemIds: ids, inheritBookSubjects: inherit, expectedRevision: revision, operationId: crypto.randomUUID() })}>儲存主題與學科</button><button disabled={busy || Boolean(pending)} onClick={() => void load(true)}>重新讀取目前分類，保留我的輸入</button>{current && <details><summary>目前保存的分類</summary><p>主題：{current.topics.join('、') || '未分類'}</p><p>學科：{current.learningItemIds.map(id => subjects.find(s => s.id === id)?.name ?? '學科已不可用').join('、') || '未分類'}</p></details>}</>}{pending && <div><p role="status">有一筆尚待核對的操作；先確認結果再編輯。</p><button disabled={busy} onClick={() => void inspect()}>核對原操作結果</button><button disabled={busy} onClick={() => void send(pending)}>重送同一份原操作</button></div>}{error && <p role="alert">{error}</p>}{!loaded && !busy && <button onClick={() => void load()}>重新讀取分類</button>}{notice && <p role="status">{notice}</p>}</>}</section>;
}
