'use client';
import { useState } from 'react';
import Link from 'next/link';
import { get, mutate } from '../weaving/client';
import { CardPreview } from '../illustrated/CardPreview';
import type { GraphicsPreview } from '@/lib/dojo/creativeStudio/graphicsMigration';
import type { DeckBundle } from '@/lib/dojo/illustrated/model';
import type { CompletionVersion } from '@/lib/dojo/weavingWorkflow/completions';
type Preview = GraphicsPreview & {
    existingDeck: {
        id: string;
        revision: number;
    } | null;
};
export default function LegacyGraphicsPanel({ id, choices, completions, dirty, realm = 'weaving' }: {
    realm?: 'weaving' | 'liaojie';
    id: string;
    choices: {
        id: string;
        title: string;
    }[];
    completions: CompletionVersion[];
    dirty: boolean;
}) {
    const [choice, setChoice] = useState(choices[0]?.id || 'draft'), [completionId, setCompletion] = useState(''), [preview, setPreview] = useState<Preview | null>(null), [confirmed, setConfirmed] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(''), [deck, setDeck] = useState('');
    if (!choices.length)
        return null;
    async function inspect() {
        setError('');
        setBusy(true);
        setConfirmed(false);
        try {
            setPreview(await get<Preview>('/api/dojo/creative-studio?graphics=1&id=' + encodeURIComponent(id) + '&choice=' + encodeURIComponent(choice) + '&completionId=' + encodeURIComponent(completionId)));
        }
        catch (e) {
            setError(String(e));
        }
        finally {
            setBusy(false);
        }
    }
    async function restore() {
        if (!preview || !confirmed)
            return;
        setBusy(true);
        setError('');
        try {
            const b = await mutate<DeckBundle>('/api/dojo/creative-studio', 'POST', { action: 'restore-graphics', id, choice, completionId, confirm: true, expectedDeckRevision: preview.existingDeck?.revision || 0 });
            setDeck(b.deck.id);
        }
        catch (e) {
            setError(String(e));
        }
        finally {
            setBusy(false);
        }
    }
    return <details className="ritual-card"><summary>搬遷舊版圖文配置</summary><p>先選舊配置及本件固定完稿，核對後另存為可編輯圖文版本。舊資料保留，圖片公開許可需重新確認。</p>{error && <p role="alert">{error}</p>}<label>舊圖文配置<select value={choice} onChange={e => { setChoice(e.target.value); setPreview(null); setConfirmed(false); }}>{choices.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}</select></label><label>對應本件完稿<select value={completionId} onChange={e => { setCompletion(e.target.value); setPreview(null); setConfirmed(false); }}><option value="">請明確選擇</option>{completions.map(c => <option key={c.id} value={c.id}>{c.title} · {c.createdAt}</option>)}</select></label><button disabled={busy || dirty} onClick={() => void inspect()}>預覽舊配置，不修改圖文</button>{dirty && <p>請先保存目前作品再搬遷。</p>}{preview && <><p>{preview.draft.pages.length} 頁；{Object.keys(preview.images).length} 張可搬遷配圖。</p>{preview.warnings.map(w => <p key={w}>{w}</p>)}<div className="studio-graphic-preview">{preview.draft.pages.map((p, i) => <details key={p.id}><summary>第 {i + 1} 頁：{p.title}</summary><CardPreview page={p} index={i} total={preview.draft.pages.length} imageData={preview.images[p.id]}/></details>)}</div>{preview.existingDeck && <p>這份完稿已有圖文。確認後會在既有圖文追加新版本，先前保存版本與成品保留。</p>}<label><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)}/>我已核對配置與完稿的對應，確認另存圖文版本</label><button disabled={busy || dirty || !confirmed || !completionId} onClick={() => void restore()}>搬遷並保存可編輯圖文</button></>}{deck && <Link href={'/' + realm + '/illustrated?deckId=' + encodeURIComponent(deck)}>開啟已搬遷圖文，核對與編輯</Link>}</details>;
}
