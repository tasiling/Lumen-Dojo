import type { TextBlock } from '@/lib/dojo/weavingWorkflow/model';
export default function TextBlockEditor({ blocks, onChange }: {
    blocks: TextBlock[];
    onChange: (blocks: TextBlock[]) => void;
}) {
    function update(id: string, patch: Partial<TextBlock>) { onChange(blocks.map(b => b.id === id ? { ...b, ...patch } : b)); }
    function move(i: number, d: number) { const next = [...blocks]; [next[i], next[i + d]] = [next[i + d], next[i]]; onChange(next); }
    return <div className="wf-blocks">{blocks.map((b, i) => <section className="wf-block" key={b.id}><div className="wf-block-heading"><label htmlFor={`role-${b.id}`}>段落 {i + 1}</label><div className="wf-actions"><button aria-label={`上移段落 ${i + 1}`} disabled={i === 0} onClick={() => move(i, -1)}>上移</button><button aria-label={`下移段落 ${i + 1}`} disabled={i === blocks.length - 1} onClick={() => move(i, 1)}>下移</button><button aria-label={`刪除段落 ${i + 1}`} onClick={() => { if (!b.text || window.confirm('刪除這一段文字？'))
        onChange(blocks.filter(row => row.id !== b.id)); }}>刪除</button></div></div><input id={`role-${b.id}`} className="field" value={b.role} onChange={e => update(b.id, { role: e.target.value })}/><label htmlFor={`text-${b.id}`}>{b.role}文字</label><textarea id={`text-${b.id}`} className="field" rows={6} value={b.text} onChange={e => update(b.id, { text: e.target.value })}/><label htmlFor={`media-${b.id}`}>畫面／聲音備註（選填）</label><input id={`media-${b.id}`} className="field" value={b.mediaNote} onChange={e => update(b.id, { mediaNote: e.target.value })}/></section>)}<button disabled={blocks.length >= 100} onClick={() => onChange([...blocks, { id: crypto.randomUUID(), role: `段落 ${blocks.length + 1}`, text: '', mediaNote: '' }])}>＋ 加入段落</button></div>;
}
