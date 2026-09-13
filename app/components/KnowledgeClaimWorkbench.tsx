"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  KNOWLEDGE_CLAIM_TYPES,
  currentClaimVersion,
  type Claimant,
  type KnowledgeClaim,
  type KnowledgeClaimStatus,
  type KnowledgeClaimType,
  type KnowledgeUse,
} from "@/lib/dojo/knowledgeClaims";

type ClaimView = "candidate" | "evaluating" | "current" | "history";

const VIEW_LABELS: Record<ClaimView, string> = {
  candidate: "待理解",
  evaluating: "評估中",
  current: "目前採用",
  history: "演化紀錄",
};

const STATUS_LABELS: Record<KnowledgeClaimStatus, string> = {
  candidate: "候選",
  active: "目前採用",
  partial: "部分支持",
  disputed: "仍有爭議",
  refuted: "已反證",
  superseded: "已被取代",
  archived: "已封存",
};

const CLAIMANT_LABELS: Record<Claimant, string> = {
  external_author: "外部作者",
  crystal: "Crystal",
  shared: "共同形成",
  unknown: "尚未確認",
};

const USE_LABELS: Record<KnowledgeUse, string> = {
  inspiration: "僅作靈感",
  perspective: "可作觀點",
  evidence: "可作證據",
  style: "可控制寫法",
};

async function responseJson<T>(response: Response): Promise<T> {
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((json as { error?: string }).error ?? `操作失敗（${response.status}）`);
  return json as T;
}

function claimView(claim: KnowledgeClaim): ClaimView {
  const current = currentClaimVersion(claim);
  if (current.status === "active" && current.maturity === "K4") return "current";
  if (current.status === "refuted" || current.status === "superseded" || current.status === "archived") return "history";
  if (current.maturity === "K3" || current.status === "partial" || current.status === "disputed") return "evaluating";
  return "candidate";
}

export default function KnowledgeClaimWorkbench() {
  const [claims, setClaims] = useState<KnowledgeClaim[]>([]);
  const [view, setView] = useState<ClaimView>("candidate");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [statement, setStatement] = useState("");
  const [type, setType] = useState<KnowledgeClaimType>("understanding");
  const [claimant, setClaimant] = useState<Claimant>("crystal");

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const result = await responseJson<{ claims: KnowledgeClaim[] }>(await fetch("/api/dojo/knowledge-claims", { cache: "no-store" }));
      setClaims(result.claims ?? []);
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load]);

  const counts = useMemo(() => Object.fromEntries((Object.keys(VIEW_LABELS) as ClaimView[]).map((key) => [key, claims.filter((claim) => claimView(claim) === key).length])) as Record<ClaimView, number>, [claims]);
  const visible = claims.filter((claim) => claimView(claim) === view);

  async function createClaim() {
    if (!statement.trim()) return;
    setCreating(true); setError(null);
    try {
      const result = await responseJson<{ claim: KnowledgeClaim }>(await fetch("/api/dojo/knowledge-claims", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statement, title: statement.slice(0, 80), type, claimant, generatedBy: "human", sources: [{ sourceType: "manual", sourceId: "", label: "手動建立", locator: "", url: "", snapshot: "" }] }),
      }));
      setClaims((current) => [result.claim, ...current]); setStatement(""); setView("candidate");
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
    finally { setCreating(false); }
  }

  return <section className="knowledge-workbench">
    <section className="ritual-card knowledge-intro">
      <span className="eyebrow">暫用名稱</span><h2>我的知識</h2>
      <p>這裡只收可獨立理解的主張。來源、素材、問題與作品仍留在各自的位置。</p>
      <details><summary>建立一項候選主張</summary>
        <label>一句完整、可判斷的主張</label><textarea className="field" rows={3} value={statement} onChange={(event) => setStatement(event.target.value)} placeholder="例如：在我開始工作前先列出三件事，通常能降低啟動阻力。" />
        <div className="knowledge-create-grid"><label>知識類型<select className="field" value={type} onChange={(event) => setType(event.target.value as KnowledgeClaimType)}>{Object.entries(KNOWLEDGE_CLAIM_TYPES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label>誰在主張？<select className="field" value={claimant} onChange={(event) => setClaimant(event.target.value as Claimant)}>{Object.entries(CLAIMANT_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label></div>
        <button className="primary" disabled={creating || !statement.trim()} onClick={() => void createClaim()}>{creating ? "建立中…" : "建立候選主張"}</button>
      </details>
    </section>

    <div className="forage-tabs knowledge-tabs" role="tablist" aria-label="知識主張狀態">
      {(Object.keys(VIEW_LABELS) as ClaimView[]).map((key) => <button key={key} type="button" role="tab" aria-selected={view === key} className={view === key ? "on" : ""} onClick={() => setView(key)}>{VIEW_LABELS[key]}<span>{counts[key]}</span></button>)}
    </div>
    {loading && <div className="empty">正在整理主張…</div>}
    {error && <p className="form-error">{error}<button className="text-link" onClick={() => void load()}>重新讀取</button></p>}
    {!loading && !error && visible.length === 0 && <div className="weaving-empty"><span>◇</span><b>這一區還沒有主張</b><p>沒有內容也沒關係；材料不必被迫成為知識。</p></div>}
    <div className="knowledge-claim-list">{visible.map((claim) => <KnowledgeClaimCard key={`${claim.id}-${claim.updatedAt}`} claim={claim} onSaved={(next) => setClaims((all) => all.map((item) => item.id === next.id ? next : item))} onArchived={() => setClaims((all) => all.filter((item) => item.id !== claim.id))} />)}</div>
  </section>;
}

function KnowledgeClaimCard({ claim, onSaved, onArchived }: { claim: KnowledgeClaim; onSaved: (claim: KnowledgeClaim) => void; onArchived: () => void }) {
  const [draft, setDraft] = useState(claim);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sourceLabel, setSourceLabel] = useState("");
  const [sourceLocator, setSourceLocator] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const current = currentClaimVersion(draft);
  const versionLocked = current.status === "active" || current.status === "refuted" || current.status === "superseded";

  function updateVersion(values: Partial<typeof current>) {
    setDraft((item) => ({ ...item, versions: item.versions.map((version) => version.id === item.currentVersionId ? { ...version, ...values } : version) }));
  }

  function toggleUse(use: KnowledgeUse) {
    setDraft((item) => ({ ...item, allowedUses: item.allowedUses.includes(use) ? item.allowedUses.filter((value) => value !== use) : [...item.allowedUses, use] }));
  }

  function addSource() {
    if (!sourceLabel.trim() && !sourceUrl.trim()) return;
    updateVersion({ sources: [...current.sources, { sourceType: "external", sourceId: "", label: sourceLabel.trim() || sourceUrl.trim(), locator: sourceLocator.trim(), url: sourceUrl.trim(), snapshot: "" }] });
    setSourceLabel(""); setSourceLocator(""); setSourceUrl("");
  }

  async function save(action: "save_draft" | "evaluate" | "adopt" | "refute", status?: "partial" | "disputed") {
    setSaving(true); setError(null);
    try {
      const result = await responseJson<{ claim: KnowledgeClaim }>(await fetch("/api/dojo/knowledge-claims", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: claim.id, action, status, claim: draft }) }));
      setDraft(result.claim); onSaved(result.claim); setEditing(false);
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
    finally { setSaving(false); }
  }

  async function createVersion() {
    const statement = window.prompt("新版主張（舊版會保留）", current.statement);
    if (!statement || statement.trim() === current.statement) return;
    const versionNote = window.prompt("這次為什麼修改？", "修正適用範圍或表述") ?? "";
    setSaving(true); setError(null);
    try {
      const result = await responseJson<{ claim: KnowledgeClaim }>(await fetch("/api/dojo/knowledge-claims", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: claim.id, action: "new_version", statement, versionNote }) }));
      setDraft(result.claim); onSaved(result.claim); setEditing(true);
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
    finally { setSaving(false); }
  }

  async function refuteCurrent() {
    const rebuttal = window.prompt("這項目前知識為什麼失效或被反證？");
    if (!rebuttal?.trim()) return;
    setSaving(true); setError(null);
    try {
      const result = await responseJson<{ claim: KnowledgeClaim }>(await fetch("/api/dojo/knowledge-claims", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: claim.id, action: "refute", rebuttal }) }));
      setDraft(result.claim); onSaved(result.claim);
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
    finally { setSaving(false); }
  }

  async function archive() {
    if (!window.confirm("要封存這項主張嗎？歷史仍會保留在 Notion。")) return;
    setSaving(true); setError(null);
    try { await responseJson(await fetch(`/api/dojo/knowledge-claims?id=${encodeURIComponent(claim.id)}`, { method: "DELETE" })); onArchived(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); setSaving(false); }
  }

  return <article className={`ritual-card knowledge-claim-card status-${current.status}`}>
    <div className="knowledge-claim-meta"><span>{KNOWLEDGE_CLAIM_TYPES[draft.type]}</span><span>{current.maturity} · {STATUS_LABELS[current.status]}</span><span>v{current.number}</span></div>
    {!editing ? <>
      <h3>{current.statement}</h3>
      <p>{CLAIMANT_LABELS[current.claimant]}提出 · {current.generatedBy === "llm_assisted" ? "LLM 協助整理" : current.generatedBy === "imported" ? "匯入內容" : "人工形成"}</p>
      {current.scope && <div className="knowledge-boundary"><b>適用邊界</b><p>{current.scope}</p></div>}
      {current.sources.length > 0 && <p className="knowledge-source-line">來源：{current.sources.map((source) => source.label || source.sourceId).join("、")}</p>}
      <div className="knowledge-use-row">{draft.allowedUses.map((use) => <span key={use}>{USE_LABELS[use]}</span>)}</div>
      {draft.versions.length > 1 && <details className="knowledge-sources"><summary>版本歷史（{draft.versions.length}）</summary>{[...draft.versions].reverse().map((version) => <div key={version.id}><b>v{version.number} · {STATUS_LABELS[version.status]}</b><p>{version.statement}</p>{version.versionNote && <span>{version.versionNote}</span>}</div>)}</details>}
      <div className="knowledge-card-actions">{!versionLocked && <button onClick={() => setEditing(true)}>審閱這項主張</button>}<button className="text-link" disabled={saving} onClick={() => void createVersion()}>建立新版</button>{current.status === "active" && <button className="text-link" disabled={saving} onClick={() => void refuteCurrent()}>標記反證</button>}</div>
    </> : <>
      <label>主張</label><textarea className="field" rows={3} value={current.statement} onChange={(event) => updateVersion({ statement: event.target.value })} />
      <div className="knowledge-create-grid"><label>知識類型<select className="field" value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value as KnowledgeClaimType })}>{Object.entries(KNOWLEDGE_CLAIM_TYPES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label>誰在主張？<select className="field" value={current.claimant} onChange={(event) => updateVersion({ claimant: event.target.value as Claimant })}>{Object.entries(CLAIMANT_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label></div>
      <label>支持材料／使用紀錄</label><textarea className="field" rows={3} value={current.supportingEvidence} onChange={(event) => updateVersion({ supportingEvidence: event.target.value })} placeholder="經驗日期、測試結果，或支持這項理解的材料" />
      <label>反例／衝突材料</label><textarea className="field" rows={2} value={current.contradictingEvidence} onChange={(event) => updateVersion({ contradictingEvidence: event.target.value })} />
      <label>適用情境與邊界</label><textarea className="field" rows={2} value={current.scope} onChange={(event) => updateVersion({ scope: event.target.value })} placeholder="它在哪些情境成立？不能推廣到哪裡？" />
      <label>限定語氣</label><input className="field" value={current.qualifier} onChange={(event) => updateVersion({ qualifier: event.target.value })} placeholder="例如：目前、在這些情境中、部分成立" />
      <label>失效原因／反證</label><textarea className="field" rows={2} value={current.rebuttal} onChange={(event) => updateVersion({ rebuttal: event.target.value })} />
      <fieldset className="knowledge-uses"><legend>可供日後使用的範圍</legend>{(Object.keys(USE_LABELS) as KnowledgeUse[]).map((use) => <label key={use} className="check"><input type="checkbox" checked={draft.allowedUses.includes(use)} onChange={() => toggleUse(use)} />{USE_LABELS[use]}</label>)}</fieldset>
      <details className="knowledge-sources" open={current.sources.length === 0}><summary>來源與定位（{current.sources.length}）</summary>{current.sources.map((source, index) => <div key={`${source.sourceType}-${source.sourceId}-${index}`}><b>{source.label || source.sourceType}</b>{source.locator && <span>{source.locator}</span>}{source.snapshot && <p>{source.snapshot}</p>}<button type="button" className="text-link" onClick={() => updateVersion({ sources: current.sources.filter((_, sourceIndex) => sourceIndex !== index) })}>移除</button></div>)}<div className="knowledge-source-add"><input className="field" value={sourceLabel} onChange={(event) => setSourceLabel(event.target.value)} placeholder="來源名稱／作者" /><input className="field" value={sourceLocator} onChange={(event) => setSourceLocator(event.target.value)} placeholder="頁碼、段落或時間碼" /><input className="field" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="來源網址（選填）" /><button type="button" onClick={addSource}>加入來源</button></div></details>
      {error && <p className="form-error">{error}</p>}
      <div className="knowledge-review-actions"><button disabled={saving} onClick={() => void save("save_draft")}>先保存</button><button disabled={saving} onClick={() => void save("evaluate", "partial")}>部分支持</button><button disabled={saving} onClick={() => void save("evaluate", "disputed")}>保留爭議</button><button className="primary" disabled={saving} onClick={() => void save("adopt")}>正式採用</button></div>
      <div className="knowledge-secondary-actions"><button className="text-link" disabled={saving} onClick={() => void save("refute")}>標記反證</button><button className="text-link" disabled={saving} onClick={() => { setDraft(claim); setEditing(false); }}>取消</button><button className="text-link danger" disabled={saving} onClick={() => void archive()}>封存</button></div>
    </>}
  </article>;
}
