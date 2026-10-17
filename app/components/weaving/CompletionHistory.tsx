import type { CompletionVersion } from '@/lib/dojo/weavingWorkflow/completions';
export default function CompletionHistory({ versions, legacy, onSelect }: {
    versions: CompletionVersion[];
    legacy: string;
    onSelect: (id: string) => void;
}) { return <section className="ritual-card wf-history"><h2>已確認的成品版本</h2>{!versions.length && <p>{legacy ? '舊版成品快照保留如下；再次確認完成時才建立新版本。' : '尚未確認成品。先保存草稿，再預覽目前保存版本。'}</p>}{!versions.length && legacy && <div className="full-text-preview">{legacy}</div>}{versions.map((v, i) => <details key={v.id}><summary>{v.title} · {new Date(v.createdAt).toLocaleString('zh-TW')} · {v.outputKind}</summary><p>使用核心 {v.coreVersionId} · {v.sourceSelections.length} 段素材</p><div className="full-text-preview">{v.text}</div>{v.outputUrl && <a href={v.outputUrl} target="_blank" rel="noreferrer">開啟成品連結</a>}<button onClick={() => onSelect(v.id)}>選擇這個成品版本交接</button>{i === 0 && <small>最新版本</small>}</details>)}</section>; }
