"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CAPTURE_CATEGORIES, type CaptureEntry } from "@/lib/dojo/formal";
import { WEAVING_FORMATS, type WeavingFormat } from "@/lib/dojo/weavingProjects";
import type { WeavingShuttleBundle } from "@/lib/dojo/weavingShuttle";

async function json<T>(response: Response): Promise<T> {
  const value = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((value as { error?: string }).error || `操作失敗（${response.status}）`);
  return value as T;
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
      const result = await json<{ captures: CaptureEntry[] }>(response);
      setCaptures((result.captures ?? []).filter((capture) => capture.status === "adopted" && (capture.creativeMaturity === "C2" || capture.creativeMaturity === "C3") && capture.destinations.includes("weaving")));
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load]);

  return <section className="weaving-inbox">
    <div className="section-heading weaving-inbox-heading"><div><span className="eyebrow">野採之後</span><h2>可製作素材</h2><p className="lead">只有已採用、創作成熟度達 C2 以上並送往織光堂的材料會出現。</p></div><span className="weaving-count">{captures.length}</span></div>
    {loading && <div className="empty">正在打開素材匣…</div>}
    {error && <p className="form-error">{error}</p>}
    {!loading && !error && captures.length === 0 && <div className="weaving-empty"><span>✦</span><b>目前沒有可製作素材</b><p>尚未成熟的材料可以先留在原處。</p><Link href="/forage">前往野採</Link></div>}
    <div className="weaving-capture-list">{captures.map((capture) => <CaptureProjectStarter key={capture.id} capture={capture} open={editingId === capture.id} onOpen={() => setEditingId(capture.id)} onClose={() => setEditingId(null)} />)}</div>
  </section>;
}

function CaptureProjectStarter({ capture, open, onOpen, onClose }: { capture: CaptureEntry; open: boolean; onOpen: () => void; onClose: () => void }) {
  const [coreStatement, setCoreStatement] = useState("");
  const [format, setFormat] = useState<WeavingFormat>("text");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function create() {
    if (!coreStatement.trim()) { setError("請先寫下這次最想說的一句話。"); return; }
    setSaving(true); setError(null);
    try {
      const response = await fetch("/api/dojo/weaving-shuttles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sourceType: "forage_capture", sourceId: capture.id, coreStatement, format }) });
      const result = await json<{ bundle: WeavingShuttleBundle }>(response);
      const work = result.bundle.works[0];
      window.location.href = `/weaving/${result.bundle.shuttle.id}${work ? `?work=${encodeURIComponent(work.id)}` : ""}`;
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); setSaving(false); }
  }
  return <article className="weaving-capture-card">
    <div className="weaving-capture-meta"><span>{capture.category ? CAPTURE_CATEGORIES[capture.category] : "未分類"} · {capture.processingDepth === "deep" ? "深整理" : "輕整理"}</span></div>
    <h3>{capture.title}</h3><p className="weaving-excerpt">{capture.forageSummary || capture.excerpt}</p>
    {!open ? <button className="weaving-edit-button" onClick={onOpen}>用這份素材建立織光杼</button> : <div className="weaving-editor">
      <div className="weaving-editor-heading"><b>這次只建立一條作品路徑</b><button className="text-link" onClick={onClose}>收起</button></div>
      <label>最想說的一句話</label><textarea className="field" rows={3} value={coreStatement} onChange={(event) => setCoreStatement(event.target.value)} placeholder="不是摘要，而是這次作品真正要說的主張。" />
      <label>先做成哪一種形式？</label><div className="format-choice-grid compact">{Object.entries(WEAVING_FORMATS).map(([key, label]) => <button key={key} className={format === key ? "on" : ""} onClick={() => setFormat(key as WeavingFormat)}>{label}</button>)}</div>
      {error && <p className="form-error">{error}</p>}<button className="primary production-save" disabled={saving} onClick={() => void create()}>{saving ? "建立中…" : "建立織光杼與作品 A"}</button>
    </div>}
  </article>;
}
