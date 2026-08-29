"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  CAPTURE_CATEGORIES,
  WEAVING_OUTPUT_TYPES,
  type CaptureEntry,
  type WeavingOutputType,
  type WeavingProductionStatus,
} from "@/lib/dojo/formal";

const PRODUCTION_STATUS: Record<WeavingProductionStatus, string> = {
  ready: "可製作", outline: "組材／大綱", draft: "草稿", revision: "修訂", completed: "已完成",
};

async function responseJson<T>(response: Response): Promise<T> {
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((json as { error?: string }).error ?? `讀取失敗（${response.status}）`);
  return json as T;
}
function capturedTime(value: string): string {
  return new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", month: "numeric", day: "numeric" }).format(new Date(value));
}

export default function WeavingCaptureInbox() {
  const [captures, setCaptures] = useState<CaptureEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const response = await fetch("/api/dojo/captures", { cache: "no-store" });
      const result = await responseJson<{ captures: CaptureEntry[] }>(response);
      setCaptures((result.captures ?? []).filter((capture) => capture.status === "adopted" && capture.destinations.includes("weaving")));
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load]);
  const active = captures.filter((capture) => capture.weaving.status !== "completed");
  const completed = captures.filter((capture) => capture.weaving.status === "completed");

  function replace(next: CaptureEntry) {
    setCaptures((previous) => previous.map((item) => item.id === next.id ? next : item)); setEditingId(null);
  }

  return (
    <section className="weaving-inbox" aria-labelledby="weaving-inbox-title">
      <div className="section-heading weaving-inbox-heading"><div><span className="eyebrow">野採之後</span><h2 id="weaving-inbox-title">可製作素材</h2><p className="lead">這裡只接收已採用、並明確送往織光堂的材料。</p></div><span className="weaving-count">{active.length}</span></div>
      {loading && <div className="empty">正在打開素材匣…</div>}
      {error && <p className="form-error">{error}<button className="text-link" onClick={() => void load()}>重新讀取</button></p>}
      {!loading && !error && active.length === 0 && <div className="weaving-empty"><span>✦</span><b>目前沒有可製作素材</b><p>先在野採完成輕整理，再把適合的材料送到這裡。</p><Link href="/forage">前往野採</Link></div>}
      <div className="weaving-capture-list">{active.map((capture) => <ProductionCard key={`${capture.id}-${capture.updatedAt}`} capture={capture} editing={editingId === capture.id} onEdit={() => setEditingId(capture.id)} onCancel={() => setEditingId(null)} onSaved={replace} />)}</div>
      {completed.length > 0 && <details className="woven-history"><summary>已完成成品 <span>{completed.length}</span></summary><div className="weaving-capture-list">{completed.map((capture) => <ProductionCard key={`${capture.id}-${capture.updatedAt}`} capture={capture} editing={editingId === capture.id} onEdit={() => setEditingId(capture.id)} onCancel={() => setEditingId(null)} onSaved={replace} />)}</div></details>}
    </section>
  );
}

function ProductionCard({ capture, editing, onEdit, onCancel, onSaved }: { capture: CaptureEntry; editing: boolean; onEdit: () => void; onCancel: () => void; onSaved: (next: CaptureEntry) => void }) {
  const [outputType, setOutputType] = useState<WeavingOutputType | null>(capture.weaving.outputType);
  const [projectTitle, setProjectTitle] = useState(capture.weaving.projectTitle);
  const [status, setStatus] = useState<WeavingProductionStatus>(capture.weaving.status);
  const [productionNote, setProductionNote] = useState(capture.weaving.productionNote);
  const [outputUrl, setOutputUrl] = useState(capture.weaving.outputUrl);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const category = capture.category ? CAPTURE_CATEGORIES[capture.category] : "未分類";

  async function save() {
    if (!outputType) { setError("請先選擇要製作的成品形式。"); return; }
    setSaving(true); setError(null);
    try {
      const response = await fetch("/api/dojo/captures", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: capture.id, capture: { ...capture, weaving: { outputType, projectTitle: projectTitle.trim(), status, productionNote: productionNote.trim(), outputUrl: outputUrl.trim() } } }) });
      const result = await responseJson<{ capture: CaptureEntry }>(response); onSaved(result.capture);
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
    finally { setSaving(false); }
  }

  return <article className={`weaving-capture-card production-${capture.weaving.status}`}>
    <div className="weaving-capture-meta"><span>{category} · {capture.processingDepth === "deep" ? "深整理" : "輕整理"}</span><time>{capturedTime(capture.capturedAt)}</time></div>
    <h3>{capture.weaving.projectTitle || capture.title}</h3>
    {capture.forageSummary ? <p className="weaving-excerpt">{capture.forageSummary}</p> : capture.excerpt && <p className="weaving-excerpt">{capture.excerpt}</p>}
    <div className="production-badges"><span>{capture.weaving.outputType ? WEAVING_OUTPUT_TYPES[capture.weaving.outputType] : "尚未選擇形式"}</span><span>{PRODUCTION_STATUS[capture.weaving.status]}</span></div>
    {capture.weaving.outputUrl && <a className="weaving-source" href={capture.weaving.outputUrl} target="_blank" rel="noreferrer">↗ 查看完成內容</a>}
    {!editing ? <button className="weaving-edit-button" onClick={onEdit}>{capture.weaving.status === "ready" ? "建立製作項目" : "繼續製作"}</button> : <div className="weaving-editor">
      <div className="weaving-editor-heading"><div><span className="label">成品製作</span><b>把整理過的材料做成什麼？</b></div><button className="text-link" onClick={onCancel}>收起</button></div>
      <label>成品形式</label><div className="output-type-grid">{Object.entries(WEAVING_OUTPUT_TYPES).map(([key, label]) => <button type="button" key={key} className={outputType === key ? "on" : ""} onClick={() => setOutputType(key as WeavingOutputType)}>{label}</button>)}</div>
      <label>製作題目</label><input className="field" value={projectTitle} onChange={(event) => setProjectTitle(event.target.value)} placeholder={capture.title} />
      <label>製作階段</label><select className="field" value={status} onChange={(event) => setStatus(event.target.value as WeavingProductionStatus)}>{Object.entries(PRODUCTION_STATUS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
      <label>大綱、草稿或修訂筆記</label><textarea className="field" rows={5} value={productionNote} onChange={(event) => setProductionNote(event.target.value)} placeholder="從材料、觀點與下一步開始整理……" />
      <label>完成連結（選填）</label><input className="field" type="url" value={outputUrl} onChange={(event) => setOutputUrl(event.target.value)} placeholder="https://…" />
      {error && <p className="form-error">{error}</p>}<button className="primary production-save" onClick={() => void save()} disabled={saving}>{saving ? "儲存中…" : "儲存製作進度"}</button>
    </div>}
  </article>;
}
