'use client';
import { useEffect, useRef, useState } from 'react';
import { clearCreativeCreateDraft, emptyCreativeCreateDraft, readCreativeCreateDraft, saveCreativeCreateDraft, type CreateDraft } from '@/lib/dojo/creativeCreateDraft';
import { mutate } from './client';
import { useLeave } from './LeaveDialog';
import SourcePicker from './SourcePicker';
import CreativeIcon from '../creative/CreativeIcon';
import type { WeavingShuttleBundle } from '@/lib/dojo/weavingShuttle';

export default function CreateShuttleForm() {
    const [v, setValue] = useState(emptyCreativeCreateDraft), [ready, setReady] = useState(false);
    const [busy, setBusy] = useState(false), [error, setError] = useState(''), [storageError, setStorageError] = useState('');
    const leave = useLeave(), local = useRef(v), storageFailure = useRef(''), pending = useRef(false);
    useEffect(() => { const timer = setTimeout(() => { const restored = readCreativeCreateDraft() ?? emptyCreativeCreateDraft(); local.current = restored; setValue(restored); setReady(true); }, 0); return () => clearTimeout(timer); }, []);
    function storageNotice(message: string) { storageFailure.current = message; setStorageError(message); }
    useEffect(() => leave.register('create-shuttle', {
        dirty: () => pending.current || !!storageFailure.current,
        save: async () => {
            if (pending.current) return false;
            try { saveCreativeCreateDraft(local.current); storageNotice(''); return true; }
            catch { return false; }
        },
        discard: () => {
            if (pending.current) throw new Error('正在建立作品，請等待結果後再離開。');
            storageNotice('');
        },
    }), [leave]);
    function edit(patch: Partial<CreateDraft>) {
        const next = { ...v, ...patch, updatedAt: new Date().toISOString() };
        local.current = next; setValue(next); setError('');
        try { saveCreativeCreateDraft(next); storageNotice(''); }
        catch { storageNotice('此瀏覽器無法保留草稿，離開前請複製輸入內容。'); }
    }
    useEffect(() => {
        const guard = (e: BeforeUnloadEvent) => { if (pending.current || storageFailure.current) { e.preventDefault(); e.returnValue = ''; } };
        window.addEventListener('beforeunload', guard); return () => window.removeEventListener('beforeunload', guard);
    }, []);
    const sourceReady = v.sourceMode === 'manual' ? !!v.sourceSnapshot.trim() : v.selectionRequests.length > 0;
    async function create() {
        if (busy || !sourceReady || !v.coreStatement.trim()) return;
        pending.current = true; setBusy(true); setError('');
        try {
            const r = await mutate<{ bundle: WeavingShuttleBundle }>('/api/dojo/weaving-shuttles', 'POST', {
                format: 'text', coreStatement: v.coreStatement, templateKey: v.templateKey,
                ...(v.sourceMode === 'manual' ? { sourceType: 'manual', sourceSnapshot: v.sourceSnapshot, manualContentKind: v.manualContentKind } : { selectionRequests: v.selectionRequests })
            });
            try { clearCreativeCreateDraft(); } catch { /* Known success can still open the created work. */ }
            pending.current = false; storageNotice('');
            location.href = `/weaving/${r.bundle.shuttle.id}?work=${r.bundle.works[0].id}`;
        } catch (e) { setError(`${e instanceof Error ? e.message : String(e)}。輸入仍保留；若結果未明，請以相同內容重試。`); pending.current = false; setBusy(false); }
    }
    if (!ready) return <p role="status">正在恢復建立草稿…</p>;
    return <div className="wf-workspace wf-create-form">
        <p className="wf-note" role="status">{storageError || '建立前的草稿只保留在此瀏覽器分頁，不會先寫入後台。'}</p>
        <h3><CreativeIcon name={v.step === 'sources' ? 'document' : 'compass'}/> {v.step === 'sources' ? '1．選素材' : '2．定觀點'}</h3>
        <fieldset disabled={busy} className="creative-create-fields">
        {v.step === 'sources' ? <>
            <p>先挑這次想創作的片段，下一步再整理觀點。</p>
            <div className="wf-actions"><button aria-pressed={v.sourceMode === 'manual'} onClick={() => edit({ sourceMode: 'manual' })}>從自己的想法開始</button><button aria-pressed={v.sourceMode === 'sources'} onClick={() => edit({ sourceMode: 'sources' })}>從閱讀與筆記開始</button></div>
            {v.sourceMode === 'manual' ? <>
                <label htmlFor="manual-kind">這段素材屬於</label><select id="manual-kind" value={v.manualContentKind} onChange={e => edit({ manualContentKind: e.target.value })}><option value="insight">洞察</option><option value="understanding">個人理解</option><option value="experience">自身經驗</option><option value="quote">原文摘錄（請保留來源定位）</option></select>
                <label htmlFor="new-source">整理好的成熟題材</label><p className="wf-note" id="source-example">先寫一個經驗或片段就好。例如：待辦很多時，我總覺得不能休息。</p><textarea id="new-source" aria-describedby="source-example" className="field" rows={4} value={v.sourceSnapshot} onChange={e => edit({ sourceSnapshot: e.target.value })}/>
            </> : <>
                <p role="status" className="wf-note">已選 {v.selectionRequests.length} 段素材；建立作品時一起保存。</p>
                {v.selectedPreviews.map((p, i) => <div className="wf-selection" key={i}><p>{p}</p><button onClick={() => edit({ selectionRequests: v.selectionRequests.filter((_, n) => n !== i), selectedPreviews: v.selectedPreviews.filter((_, n) => n !== i) })}>取消加入</button></div>)}
                <SourcePicker bookId={new URLSearchParams(typeof window === 'undefined' ? '' : location.search).get('book') ?? undefined} onSelect={(request, preview) => edit({ selectionRequests: [...v.selectionRequests, request], selectedPreviews: [...v.selectedPreviews, preview] })}/>
            </>}
            <button className="primary" disabled={!sourceReady} onClick={() => edit({ step: 'concept' })}>前往定觀點</button>
        </> : <>
            <details><summary>這次選用的素材</summary><div className="full-text-preview">{v.sourceMode === 'manual' ? v.sourceSnapshot : v.selectedPreviews.join('\n\n')}</div></details>
            <label htmlFor="new-core">自己最想說的一句話</label><p className="wf-note" id="core-example">例如：休息不必等到所有事情都完成。這句觀點就是這個主題的「核心經線」。</p><textarea id="new-core" aria-required="true" aria-describedby="core-example" className="field" rows={3} value={v.coreStatement} onChange={e => edit({ coreStatement: e.target.value })}/>
            <label htmlFor="first-template">第一件作品的文字形式</label><select id="first-template" value={v.templateKey} onChange={e => edit({ templateKey: e.target.value })}><option value="article">長文／文章</option><option value="plurk">短貼文／噗浪串文</option><option value="instagram_carousel">IG 輪播文案</option><option value="instagram_story">IG 限動文字</option><option value="spoken_script">口播稿</option></select>
            <p className="wf-note">確認後才建立主題與第一件文字作品；圖文與口播目前交付文案，不會自動生成圖片或聲音。</p>
            <div className="wf-actions"><button onClick={() => edit({ step: 'sources' })}>返回選素材</button><button className="primary" disabled={!sourceReady || !v.coreStatement.trim()} onClick={() => void create()}>{busy ? '建立中…' : '建立第一件作品'}</button></div>
        </>}
        </fieldset>
        {error && <p role="alert">{error}</p>}
    </div>;
}
