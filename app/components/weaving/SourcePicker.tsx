'use client';
import { useEffect, useRef, useState } from 'react';
import type { SourceCandidate, SelectionRequest } from '@/lib/dojo/weavingWorkflow/sources';
import type { SourceKind } from '@/lib/dojo/weavingWorkflow/model';
import { get } from './client';
import { useWeavingDraft } from './useWeavingDraft';
const KINDS = { reading_note: '閱讀筆記', reading_insight: '閱讀洞察', forage_capture: '成熟野採', knowledge_claim: '已採用知識' } as const;
const CONTENT = { quote: '原文摘錄', understanding: '個人理解', experience: '自身經驗', insight: '洞察' };
export default function SourcePicker({ onSelect, onManual, bookId, pickerId = "create-shuttle" }: {
    pickerId?: string;
    onManual?: (v: {
        text: string;
        contentKind: "quote" | "understanding" | "experience" | "insight";
        locator: string;
    }) => void;
    onSelect: (request: SelectionRequest, preview: string) => void;
    bookId?: string;
}) {
    const empty = { id: `manual-source-${pickerId}`, revision: 0, text: '', contentKind: 'experience' as 'understanding' | 'experience' | 'quote' | 'insight', locator: '人工輸入' };
    const manualDraft = useWeavingDraft(empty, async (t) => { onManual?.({ text: t.value.text, contentKind: t.value.contentKind, locator: t.value.locator }); return empty; });
    const manual = manualDraft.value.text, manualKind = manualDraft.value.contentKind;
    function setManual(text: string) { manualDraft.edit({ ...manualDraft.value, text }); }
    function setManualKind(contentKind: typeof manualKind) { manualDraft.edit({ ...manualDraft.value, contentKind }); }
    const [kind, setKind] = useState<SourceKind>('reading_note'), [items, setItems] = useState<SourceCandidate[]>([]), [cursor, setCursor] = useState<string | null>(null), [active, setActive] = useState<SourceCandidate | null>(null), [range, setRange] = useState<[
        number,
        number
    ]>([0, 0]), [error, setError] = useState(''), [loading, setLoading] = useState(false);
    const [query, setQuery] = useState('');
    const visibleItems = items.filter(item => `${item.label} ${item.locator} ${item.text}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
    const text = useRef<HTMLTextAreaElement>(null), generation = useRef(0);
    async function load(next: string | null, reset = false) { const g = ++generation.current; setLoading(true); setError(''); try {
        const p = await get<{
            items: SourceCandidate[];
            cursor: string | null;
        }>(`/api/dojo/weaving-sources?kind=${kind}${bookId ? `&bookId=${encodeURIComponent(bookId)}` : ''}${next ? `&cursor=${next}` : ''}`);
        if (g !== generation.current)
            return;
        setItems(old => reset ? p.items : [...old, ...p.items]);
        setCursor(p.cursor);
    }
    catch (e) {
        setError(e instanceof Error ? e.message : String(e));
    }
    finally {
        if (g === generation.current)
            setLoading(false);
    } }
    useEffect(() => { const t = setTimeout(() => { setActive(null); setQuery(''); void load(null, true); }, 0); return () => { clearTimeout(t); generation.current++; }; }, [kind, bookId]); // eslint-disable-line react-hooks/exhaustive-deps
    return <section className="wf-source-picker"><h3>挑選要使用的素材</h3><label htmlFor="source-kind">素材種類</label><select id="source-kind" className="field" value={kind} onChange={e => setKind(e.target.value as SourceKind)}>{Object.entries(KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select><p className="wf-note">閱讀原文需搭配你自己的觀點。選取文字後，只有這一段會加入作品。</p>{loading && <p role="status">正在讀取素材…</p>}{error && <p role="alert">{error}<button onClick={() => void load(null, true)}>重新讀取</button></p>}<label htmlFor={`source-search-${pickerId}`}>搜尋已載入素材</label><input id={`source-search-${pickerId}`} type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="輸入書名、章節或內容關鍵字"/><div className="wf-source-list">{visibleItems.map(c => <button key={c.sourceId} onClick={() => { setActive(c); setRange([0, 0]); }} aria-pressed={active?.sourceId === c.sourceId}><b>{c.label}</b><small>{CONTENT[c.contentKind]} · {c.locator}</small><p className="wf-source-excerpt">{c.text.replace(/\s+/g, ' ').slice(0, 120)}</p><span className="wf-source-open">打開並選取片段</span></button>)}</div>{!loading && !error && !items.length && <p>目前沒有可用的這類素材。你也可以切換素材種類，或先從自己的想法開始。</p>}{!loading && items.length > 0 && !visibleItems.length && <p>已載入的素材沒有符合項目；可換關鍵字或讀取下一頁。</p>}{cursor && <button disabled={loading} onClick={() => void load(cursor)}>讀取下一頁</button>}{active && <div><label htmlFor="source-text">{active.label}：反白選取要引用的文字</label><textarea id="source-text" ref={text} className="field" readOnly value={active.text} rows={8} onSelect={() => { const t = text.current; if (t)
        setRange([t.selectionStart, t.selectionEnd]); }}/><p>已選 {range[1] - range[0]} 字元（第 {range[0]}–{range[1]} 字元）</p><div className="wf-actions"><button onClick={() => { text.current?.focus(); text.current?.select(); setRange([0, active.text.length]); }}>選取這份素材全文</button><button className="primary" disabled={range[0] === range[1]} onClick={() => { onSelect({ sourceType: active.sourceType, sourceId: active.sourceId, sourceVersion: active.version, start: range[0], end: range[1], contentKind: active.contentKind }, active.text.slice(...range)); setActive(null); }}>加入選摘</button></div></div>}{onManual && <div><h3>加入自己的經驗或理解</h3><label htmlFor="manual-content-kind">人工內容種類</label><select id="manual-content-kind" value={manualKind} onChange={e => setManualKind(e.target.value as typeof manualKind)}>{Object.entries(CONTENT).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select><label htmlFor="manual-selection">要加入的文字</label><textarea id="manual-selection" value={manual} rows={4} onChange={e => setManual(e.target.value)}/><button disabled={!manual.trim()} onClick={() => { void manualDraft.save(); }}>加入這段人工素材</button></div>}</section>;
}
