'use client';
import './readingKnowledge.css';
import { useRef, useState } from 'react';
import Link from 'next/link';
import AnnotationEditor from './AnnotationEditor';
import { contentKey, KIND_LABELS, type ContentRef } from '@/lib/dojo/readingKnowledge/model';
import type { RelationsPage, Relation } from '@/lib/dojo/readingKnowledge/relations';
export default function RelationsPanel({ target, onClassified }: {
    target: ContentRef;
    onClassified?: () => void;
}) {
    const [open, setOpen] = useState(false), [items, setItems] = useState<Relation[]>([]), [warnings, setWarnings] = useState<string[]>([]), [cursor, setCursor] = useState<string | null>(null), [complete, setComplete] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
    const pending = useRef(false);
    async function load(next: string | null) {
        if (pending.current)
            return;
        pending.current = true;
        setBusy(true);
        setError('');
        try {
            const p = new URLSearchParams({ ref: JSON.stringify(target) });
            if (next)
                p.set('cursor', next);
            const r = await fetch(`/api/dojo/reading-knowledge/relations?${p}`, { cache: 'no-store' });
            const j = await r.json();
            if (!r.ok)
                throw Error(j.error ?? '無法讀取關聯');
            const data = j as RelationsPage;
            setItems(old => [...new Map([...old, ...data.items].map(i => [`${i.direction}:${contentKey(i.item.ref)}`, i])).values()]);
            setWarnings(data.warnings);
            setCursor(data.cursor);
            setComplete(data.complete);
        }
        catch (e) {
            setError(e instanceof Error ? e.message : '讀取失敗');
        }
        finally {
            setBusy(false);
            pending.current = false;
        }
    }
    return <section className="rk-relations"><AnnotationEditor target={target} onSaved={onClassified}/><button type="button" aria-expanded={open} onClick={() => {
            setOpen(!open);
            if (!open && !items.length && !complete)
                void load(cursor);
        }}>來源與後續</button>{open && <div><p>查看這筆內容從哪裡來，以及實際用在哪些內容。</p>{items.map(i => <article key={`${i.direction}:${contentKey(i.item.ref)}`}><small>{i.direction === 'source' ? '來自' : '後續使用'} · {KIND_LABELS[i.item.ref.kind]}</small><p><Link href={i.item.href}>{i.item.title}</Link></p>{i.snapshot && <details><summary>{i.sourceVersion ? '引用當時的快照' : '建立時快照，未記錄來源版本'}</summary><p className="rk-snapshot">{i.snapshot}</p></details>}</article>)}{warnings.map((w, i) => <p role="status" key={i}>{w}</p>)}{busy && <p role="status">正在查找關聯…</p>}{error && <p role="alert">{error}</p>}{!busy && complete && !items.length && <p>目前沒有可確認的直接關聯。</p>}{!busy && (!complete || error) && <button onClick={() => void load(cursor)}>{error ? '重新讀取' : '繼續查找關聯'}</button>}</div>}</section>;
}
