"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  WEAVING_OUTPUT_TYPES,
  type WeavingOutputType,
  type WeavingProductionStatus,
} from "@/lib/dojo/formal";
import type { ReadingWeavingProjectWithCards } from "@/lib/dojo/weavingProjects";

const STATUS_LABELS: Record<WeavingProductionStatus, string> = {
  ready: "可製作",
  outline: "組材／大綱",
  draft: "草稿",
  revision: "修訂",
  completed: "已完成",
};

async function responseJson<T>(response: Response): Promise<T> {
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((json as { error?: string }).error ?? `操作失敗（${response.status}）`);
  return json as T;
}

export default function ReadingInsightProjects() {
  const [projects, setProjects] = useState<ReadingWeavingProjectWithCards[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const response = await fetch("/api/dojo/weaving-projects", { cache: "no-store" });
      const json = await responseJson<{ projects: ReadingWeavingProjectWithCards[] }>(response);
      setProjects(json.projects ?? []);
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  const active = projects.filter((project) => project.status !== "completed");
  const completed = projects.filter((project) => project.status === "completed");

  return <section className="weaving-inbox reading-insight-projects">
    <div className="section-heading weaving-inbox-heading"><div><span className="eyebrow">閱讀萃取之後</span><h2>閱讀洞察企劃</h2><p className="lead">把一張或數張成熟洞察，組成文章、圖文或影音企劃。</p></div><span className="weaving-count">{active.length}</span></div>
    {loading && <div className="empty">正在整理閱讀企劃…</div>}
    {error && <p className="form-error">{error}<button className="text-link" onClick={() => void load()}>重新讀取</button></p>}
    {!loading && !error && active.length === 0 && <div className="weaving-empty"><span>◇</span><b>還沒有閱讀洞察企劃</b><p>先在洞察卡片庫選取已驗證或不成立的卡片。</p><Link href="/reading/cards">前往卡片庫</Link></div>}
    <div className="weaving-capture-list">{active.map((project) => <ReadingProjectCard key={project.id} project={project} editing={editingId === project.id} onEdit={() => setEditingId(project.id)} onCancel={() => setEditingId(null)} onSaved={(next) => { setProjects(next); setEditingId(null); }} />)}</div>
    {completed.length > 0 && <details className="woven-history"><summary>已完成閱讀成品 <span>{completed.length}</span></summary><div className="weaving-capture-list">{completed.map((project) => <ReadingProjectCard key={project.id} project={project} editing={editingId === project.id} onEdit={() => setEditingId(project.id)} onCancel={() => setEditingId(null)} onSaved={(next) => { setProjects(next); setEditingId(null); }} />)}</div></details>}
  </section>;
}

function ReadingProjectCard({
  project,
  editing,
  onEdit,
  onCancel,
  onSaved,
}: {
  project: ReadingWeavingProjectWithCards;
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSaved: (projects: ReadingWeavingProjectWithCards[]) => void;
}) {
  const [title, setTitle] = useState(project.title);
  const [outputType, setOutputType] = useState<WeavingOutputType>(project.outputType);
  const [status, setStatus] = useState<WeavingProductionStatus>(project.status);
  const [productionNote, setProductionNote] = useState(project.productionNote);
  const [outputUrl, setOutputUrl] = useState(project.outputUrl);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true); setError(null);
    try {
      const response = await fetch("/api/dojo/weaving-projects", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: project.id, project: { title, outputType, status, productionNote, outputUrl } }),
      });
      const json = await responseJson<{ projects: ReadingWeavingProjectWithCards[] }>(response);
      onSaved(json.projects ?? []);
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
    finally { setSaving(false); }
  }

  return <article className={`weaving-capture-card reading-project-card production-${project.status}`}>
    <div className="weaving-capture-meta"><span>閱讀洞察 · {project.cards.length} 張</span><time>{STATUS_LABELS[project.status]}</time></div>
    <h3>{project.title}</h3>
    <div className="reading-project-sources">{project.cards.map((card) => <div key={card.id}><b>{card.insight}</b><p>{card.action}</p><small>{card.sourceBookTitle}</small></div>)}</div>
    <div className="production-badges"><span>{WEAVING_OUTPUT_TYPES[project.outputType]}</span><span>{STATUS_LABELS[project.status]}</span></div>
    {project.outputUrl && <a className="weaving-source" href={project.outputUrl} target="_blank" rel="noreferrer">↗ 查看完成內容</a>}
    {!editing ? <button className="weaving-edit-button" onClick={onEdit}>{project.status === "ready" ? "開始組材" : "繼續製作"}</button> : <div className="weaving-editor">
      <div className="weaving-editor-heading"><div><span className="label">閱讀內容企劃</span><b>讓多張洞察形成一個成品</b></div><button className="text-link" onClick={onCancel}>收起</button></div>
      <label>企劃題目</label><input className="field" value={title} onChange={(event) => setTitle(event.target.value)} />
      <label>成品形式</label><div className="output-type-grid">{Object.entries(WEAVING_OUTPUT_TYPES).map(([key, label]) => <button type="button" key={key} className={outputType === key ? "on" : ""} onClick={() => setOutputType(key as WeavingOutputType)}>{label}</button>)}</div>
      <label>製作階段</label><select className="field" value={status} onChange={(event) => setStatus(event.target.value as WeavingProductionStatus)}>{Object.entries(STATUS_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
      <label>組材、大綱、草稿或修訂筆記</label><textarea className="field" rows={6} value={productionNote} onChange={(event) => setProductionNote(event.target.value)} placeholder="把不同洞察之間的共同線索先寫下來……" />
      <label>完成連結（選填）</label><input className="field" type="url" value={outputUrl} onChange={(event) => setOutputUrl(event.target.value)} placeholder="https://…" />
      {error && <p className="form-error">{error}</p>}
      <button className="primary production-save" disabled={saving || !title.trim()} onClick={() => void save()}>{saving ? "儲存中…" : "儲存製作進度"}</button>
    </div>}
  </article>;
}
