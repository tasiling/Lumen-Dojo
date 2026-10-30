'use client';
import Link from 'next/link';
import { useState } from 'react';
import { mutate } from '../weaving/client';
import type { ImportPreview } from '@/lib/dojo/creativeStudio/migration';
import './studio.css';
export default function StudioImport() { const [packet, setPacket] = useState<unknown>(null), [preview, setPreview] = useState<ImportPreview | null>(null), [result, setResult] = useState<string[]>([]), [error, setError] = useState(''), [busy, setBusy] = useState(false); async function read(file: File | undefined) { if (!file)
    return; setBusy(true); setError(''); setResult([]); try {
    if (file.size > 3500000)
        throw Error('備份超過 3.5 MB，請保留原檔並分批處理');
    const packet = JSON.parse(await file.text());
    const r = await mutate<{
        preview: ImportPreview;
    }>('/api/dojo/creative-studio', 'POST', { action: 'import-preview', packet });
    setPacket(packet);
    setPreview(r.preview);
}
catch (e) {
    setError(String(e));
}
finally {
    setBusy(false);
} } async function apply() { setBusy(true); try {
    const r = await mutate<{
        workIds: string[];
    }>('/api/dojo/creative-studio', 'POST', { action: 'import', packet });
    setResult(r.workIds);
}
catch (e) {
    setError(String(e));
}
finally {
    setBusy(false);
} } function download() { const a = document.createElement('a'), url = URL.createObjectURL(new Blob([JSON.stringify(packet, null, 2)], { type: 'application/json' })); a.href = url; a.download = 'weaving-import-original.json'; a.click(); URL.revokeObjectURL(url); } return <section className="screen studio"><h1>舊資料預覽與匯入</h1><p>先保留原檔；預覽不改寫資料。同一內容再次匯入會接續原識別；同標題但正文或歷史不同的稿件分別保留。</p><label>選擇 HTML JSON／原工具備份<input type="file" accept=".json,application/json" disabled={busy} onChange={e => void read(e.target.files?.[0])}/></label>{error && <p role="alert">{error}</p>}{preview && <section className="ritual-card"><h2>{preview.kind === 'html' ? 'HTML 作品備份' : preview.kind === 'formal' ? '正式作品紀錄' : '原工具備份'}</h2><p>{preview.works.length} 件作品；完整來源、原稿、歷史與舊版本保留在備份中。</p>{preview.warnings.map(w => <p key={w}>{w}</p>)}<details><summary>逐件對照</summary>{preview.works.map(w => <p key={w.identity}>{w.title} · 原識別 {w.sourceId} · {w.studio.body.length} 字</p>)}</details><div className="studio-actions"><button onClick={download}>下載原始備份</button><button className="primary" disabled={busy || preview.kind !== 'html'} onClick={() => void apply()}>依此預覽匯入，接續已有稿</button></div>{preview.kind === 'original-backup' && <Link href="/liaojie/tools">回原工具載入這份備份</Link>}{result.map(id => <Link className="studio-entry" key={id} href={'/weaving/works/' + id}>開啟匯入作品 · {id}</Link>)}</section>}<Link href="/weaving">返回織光堂</Link></section>; }
