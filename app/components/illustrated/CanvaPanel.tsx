'use client';
import { useEffect, useState } from 'react';
import { get, mutate } from '../weaving/client';
import type { CanvaTransfer } from '@/lib/dojo/creativeStudio/canva';
export default function CanvaPanel({ deckId, versionId, revision, dirty }: {
    deckId: string;
    versionId: string;
    revision: number;
    dirty: boolean;
}) { const [items, setItems] = useState<CanvaTransfer[]>([]), [selected, setSelected] = useState(''), [designUrl, setDesignUrl] = useState(''), [external, setExternal] = useState(false), [result, setResult] = useState(''), [note, setNote] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false); const chosen = items.find(x => x.id === selected); useEffect(() => { get<{
    transfers: CanvaTransfer[];
}>('/api/dojo/creative-studio?deckId=' + deckId).then(r => setItems(r.transfers)).catch(e => setError(String(e))); }, [deckId]); async function create() { setBusy(true); setError(''); try {
    const r = await mutate<{
        transfer: CanvaTransfer;
    }>('/api/dojo/creative-studio', 'POST', { action: 'canva', deckId, versionId, expectedRevision: revision, designUrl, externalConfirmed: external });
    setItems([...items.filter(x => x.id !== r.transfer.id), r.transfer]);
    setSelected(r.transfer.id);
    setExternal(false);
}
catch (e) {
    setError(String(e));
}
finally {
    setBusy(false);
} } async function copy() { if (!chosen)
    return; try {
    await navigator.clipboard.writeText(chosen.title + '\n圖文版本：' + chosen.versionId + '\n\n' + chosen.pages.map((p, i) => '第 ' + (i + 1) + ' 頁\n標題：' + p.title + '\n正文：' + p.body).join('\n\n'));
    setError('已複製這次固定的逐頁文字；請手動帶到 Canva。');
}
catch {
    setError('無法複製，請從下方逐頁文字選取。');
} } async function save() { if (!chosen)
    return; setBusy(true); try {
    const r = await mutate<{
        transfer: CanvaTransfer;
    }>('/api/dojo/creative-studio', 'POST', { action: 'canva-result', id: chosen.id, expectedRevision: chosen.revision, resultUrl: result, note });
    setItems(items.map(x => x.id === r.transfer.id ? r.transfer : x));
    setError('成品連結已接回這份交接；未宣稱已自動驗證內容。');
}
catch (e) {
    setError(String(e));
}
finally {
    setBusy(false);
} } return <section className="ritual-card"><h2>帶到 Canva 精修，再接回成品</h2><p>保留這次逐頁文字及排版版本。只交接明選內容，不含原始日記、逐字稿與私人服務資料。</p>{error && <p role="status">{error}</p>}<label>你的 Canva 設計連結<input type="url" value={designUrl} onChange={e => setDesignUrl(e.target.value)}/></label><label className="publication-confirm"><input type="checkbox" checked={external} onChange={e => setExternal(e.target.checked)}/>本次逐頁文字可以交給 Canva（不等於同意公開）</label><button disabled={busy || dirty || !external} onClick={() => void create()}>固定目前版本的 Canva 交接稿</button>{dirty && <p>請先保存圖文稿，再固定外部交接。</p>}<label>接續哪份交接<select value={selected} onChange={e => { setSelected(e.target.value); setResult(''); }}><option value="">請選交接</option>{items.map(x => <option value={x.id} key={x.id}>{x.title} · {x.versionId === versionId ? '目前圖文版本' : '來源已有新版'} · {x.createdAt}</option>)}</select></label>{chosen && <><p>固定來源：{chosen.versionId}{chosen.versionId !== versionId ? '；目前圖文已有新版，舊交接保留。' : ''}</p><button onClick={() => void copy()}>複製固定逐頁文案</button>{chosen.designUrl && <a target="_blank" rel="noreferrer" href={chosen.designUrl}>開啟這份 Canva 設計</a>}<details><summary>查看逐頁文字</summary>{chosen.pages.map((p, i) => <p key={p.id} className="full-text-preview">第{i + 1}頁<br />{p.title}<br />{p.body}</p>)}</details><label>接回成品連結<input type="url" value={result} onChange={e => setResult(e.target.value)}/></label><label>調整與試用結果<textarea value={note} onChange={e => setNote(e.target.value)}/></label><button disabled={busy || !result} onClick={() => void save()}>保存到這份交接</button>{chosen.resultUrl && <a href={chosen.resultUrl} target="_blank" rel="noreferrer">已接回的成品連結</a>}</>}</section>; }
