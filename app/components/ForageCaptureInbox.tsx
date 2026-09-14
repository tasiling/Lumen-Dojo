"use client";

import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CAPTURE_CATEGORIES,
  CAPTURE_CLIP_PURPOSES,
  CAPTURE_CONTENT_TYPES,
  KNOWLEDGE_RELATIONS,
  type CaptureDestination,
  type CaptureEntry,
  type CaptureClaimRelation,
  type CreativeMaturity,
  type KnowledgeRelation,
  type LearningTrackKey,
} from "@/lib/dojo/formal";
import { LEARNING_TRACKS } from "@/lib/dojo/learning";
import { KNOWLEDGE_CLAIM_TYPES, currentClaimVersion, type Claimant, type KnowledgeClaim, type KnowledgeClaimType } from "@/lib/dojo/knowledgeClaims";

type InboxTab = "pending" | "adopted" | "faded";

async function responseJson<T>(response: Response): Promise<T> {
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((json as { error?: string }).error ?? `讀取失敗（${response.status}）`);
  return json as T;
}

function capturedTime(value: string): string {
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(new Date(value));
}

function sourceHost(sourceUrl: string): string {
  try { return new URL(sourceUrl).hostname.replace(/^www\./, ""); } catch { return "查看來源"; }
}

const DESTINATIONS: { key: CaptureDestination; label: string; hint: string }[] = [
  { key: "practice", label: "修習所", hint: "成為待學素材" },
  { key: "weaving", label: "織光堂", hint: "準備製作成品" },
  { key: "dao", label: "道藏", hint: "長期保存" },
];

const CREATIVE_MATURITY: Record<CreativeMaturity, { label: string; hint: string }> = {
  C0: { label: "C0 原始採集", hint: "先保存，還不知道要說什麼" },
  C1: { label: "C1 有感素材", hint: "已知道自己為何在意" },
  C2: { label: "C2 有方向", hint: "已有受眾、張力或切入角度" },
  C3: { label: "C3 創作就緒", hint: "已有作品問題與明確去向" },
};

const CLAIM_RELATIONS: Record<CaptureClaimRelation, string> = {
  source: "由此形成",
  supports: "支持",
  contradicts: "反駁",
  example: "作為案例",
  inspiration: "啟發",
};

export default function ForageCaptureInbox() {
  const [captures, setCaptures] = useState<CaptureEntry[]>([]);
  const [claims, setClaims] = useState<KnowledgeClaim[]>([]);
  const [claimsLoaded, setClaimsLoaded] = useState(false);
  const [claimsLoading, setClaimsLoading] = useState(false);
  const [tab, setTab] = useState<InboxTab>("pending");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const response = await fetch("/api/dojo/captures", { cache: "no-store" });
      const result = await responseJson<{ captures: CaptureEntry[] }>(response);
      setCaptures(result.captures ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load]);
  const loadClaims = useCallback(async () => {
    if (claimsLoaded || claimsLoading) return;
    setClaimsLoading(true);
    try {
      const result = await responseJson<{ claims: KnowledgeClaim[] }>(await fetch("/api/dojo/knowledge-claims", { cache: "no-store" }));
      setClaims(result.claims ?? []); setClaimsLoaded(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally { setClaimsLoading(false); }
  }, [claimsLoaded, claimsLoading]);

  const counts = useMemo(() => ({
    pending: captures.filter((capture) => capture.status === "pending").length,
    adopted: captures.filter((capture) => capture.status === "adopted").length,
    faded: captures.filter((capture) => capture.status === "faded").length,
  }), [captures]);
  const visible = captures.filter((capture) => capture.status === tab);

  function replaceCapture(next: CaptureEntry) {
    setCaptures((previous) => previous.map((item) => item.id === next.id ? next : item));
  }

  return (
    <section className="forage-inbox" aria-labelledby="forage-inbox-title">
      <div className="section-heading forage-heading">
        <div>
          <span className="eyebrow">擷取之後</span>
          <h2 id="forage-inbox-title">採集匣</h2>
          <p className="lead">先做十秒整理；有心力時，再補上理解與知識關聯。</p>
        </div>
        <Link href="/add" className="forage-capture-link">＋ 擷取</Link>
      </div>

      <div className="forage-tabs" role="tablist" aria-label="採集匣狀態">
        {([
          ["pending", "待處理"], ["adopted", "已採用"], ["faded", "已淡出"],
        ] as [InboxTab, string][]).map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? "on" : ""} onClick={() => setTab(key)}>
            {label}<span>{counts[key]}</span>
          </button>
        ))}
      </div>

      {tab === "faded" && <p className="forage-fade-note">待處理超過 30 天的原始材料會暫時淡出；資料仍完整保留，可隨時恢復。</p>}
      {loading && <div className="empty">正在打開採集匣…</div>}
      {error && <p className="form-error">{error}<button className="text-link" onClick={() => void load()}>重新讀取</button></p>}
      {!loading && !error && visible.length === 0 && (
        <div className="weaving-empty"><span>✦</span><b>{tab === "pending" ? "目前沒有等待處理的材料" : tab === "adopted" ? "還沒有採用素材" : "沒有淡出的材料"}</b><p>擷取後的原始內容會先安全留在這裡。</p></div>
      )}

      <div className="forage-list">
        {visible.map((capture) => (
          <ForageCard key={`${capture.id}-${capture.updatedAt}`} capture={capture} editing={editingId === capture.id}
            claims={claims} claimsLoading={claimsLoading}
            onEdit={() => { setEditingId(capture.id); void loadClaims(); }} onCancel={() => setEditingId(null)}
            onClaimCreated={(claim) => setClaims((current) => [claim, ...current])}
            onCaptureUpdated={replaceCapture}
            onSaved={(next) => { replaceCapture(next); setEditingId(null); if (next.status !== tab) setTab(next.status); }} />
        ))}
      </div>
    </section>
  );
}

function ForageCard({ capture, claims, claimsLoading, editing, onEdit, onCancel, onSaved, onClaimCreated, onCaptureUpdated }: {
  capture: CaptureEntry; claims: KnowledgeClaim[]; claimsLoading: boolean; editing: boolean; onEdit: () => void; onCancel: () => void; onSaved: (next: CaptureEntry) => void; onClaimCreated: (claim: KnowledgeClaim) => void; onCaptureUpdated: (capture: CaptureEntry) => void;
}) {
  const [draft, setDraft] = useState(capture);
  const [linkLabel, setLinkLabel] = useState("");
  const [linkRelation, setLinkRelation] = useState<KnowledgeRelation>("extends");
  const [candidateStatement, setCandidateStatement] = useState("");
  const [candidateType, setCandidateType] = useState<KnowledgeClaimType>("understanding");
  const [candidateClaimant, setCandidateClaimant] = useState<Claimant>("crystal");
  const [selectedClaimId, setSelectedClaimId] = useState("");
  const [claimRelation, setClaimRelation] = useState<CaptureClaimRelation>("supports");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const categoryLabel = capture.category ? CAPTURE_CATEGORIES[capture.category] : "未分類";
  const purposeLabel = CAPTURE_CLIP_PURPOSES[capture.clip.purpose];

  function toggleDestination(destination: CaptureDestination) {
    setDraft((current) => ({ ...current, destinations: current.destinations.includes(destination)
      ? current.destinations.filter((item) => item !== destination)
      : [...current.destinations, destination] }));
  }

  function toggleTrack(track: LearningTrackKey) {
    setDraft((current) => ({ ...current, learningTracks: current.learningTracks.includes(track)
      ? current.learningTracks.filter((item) => item !== track)
      : [...current.learningTracks, track] }));
  }

  function addKnowledgeLink() {
    const label = linkLabel.trim(); if (!label) return;
    setDraft((current) => ({ ...current, knowledgeLinks: [...current.knowledgeLinks, { id: crypto.randomUUID(), label, relation: linkRelation }] }));
    setLinkLabel("");
  }

  function linkExistingClaim() {
    if (!selectedClaimId || draft.claimRefs.some((ref) => ref.claimId === selectedClaimId && ref.relation === claimRelation)) return;
    setDraft((current) => ({ ...current, claimRefs: [...current.claimRefs, { claimId: selectedClaimId, relation: claimRelation }] }));
    setSelectedClaimId("");
  }

  async function createCandidateClaim() {
    if (!candidateStatement.trim()) return;
    if (draft.sourceKnowledgeMaturity !== "K1") {
      setError("建立 K2 前，請先確認這份材料已有可回找的來源或經驗紀錄（K1）。"); return;
    }
    setSaving(true); setError(null);
    try {
      const result = await responseJson<{ claim: KnowledgeClaim; capture: CaptureEntry }>(await fetch("/api/dojo/knowledge-claims", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_from_capture",
          captureId: capture.id,
          capture: draft,
          statement: candidateStatement,
          title: candidateStatement.slice(0, 80),
          type: candidateType,
          claimant: candidateClaimant,
        }),
      }));
      setDraft(result.capture); onCaptureUpdated(result.capture);
      onClaimCreated(result.claim); setCandidateStatement("");
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
    finally { setSaving(false); }
  }

  async function save(status: "pending" | "adopted" | "faded") {
    if (status === "adopted" && draft.destinations.includes("practice") && draft.learningTracks.length === 0) {
      setError("送往修習所前，請至少選擇一個學習項目。"); return;
    }
    if (status === "adopted" && draft.destinations.includes("weaving") && draft.creativeMaturity !== "C2" && draft.creativeMaturity !== "C3") {
      setError("送往織光堂前，請先確認創作成熟度至少為 C2；也可以先取消這個去向。"); return;
    }
    setSaving(true); setError(null);
    const now = new Date().toISOString();
    const hasDeepWork = Boolean(draft.forageSummary || draft.forageReason || draft.contentType || draft.knowledgeLinks.length || draft.claimRefs.length || draft.sourceLocator || draft.creativeMaturity !== "C0" || draft.sourceKnowledgeMaturity !== "K0");
    const next: CaptureEntry = {
      ...draft,
      status,
      processingDepth: hasDeepWork ? "deep" : status === "adopted" ? "light" : draft.processingDepth,
      fadedAt: status === "faded" ? now : null,
      sentToPracticeAt: status === "adopted" && draft.destinations.includes("practice") ? (draft.sentToPracticeAt ?? now) : draft.sentToPracticeAt,
      sentToWeavingAt: status === "adopted" && draft.destinations.includes("weaving") ? (draft.sentToWeavingAt ?? now) : draft.sentToWeavingAt,
      learningTracks: draft.destinations.includes("practice") ? draft.learningTracks : [],
    };
    try {
      const response = await fetch("/api/dojo/captures", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: capture.id, capture: next }) });
      const result = await responseJson<{ capture: CaptureEntry }>(response); onSaved(result.capture);
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
    finally { setSaving(false); }
  }

  return (
    <article className={`forage-card depth-${capture.processingDepth}`}>
      <div className="weaving-capture-meta"><span>{capture.clip.origin === "line" ? `LINE 剪藏 · ${purposeLabel}` : categoryLabel} · {capture.processingDepth === "raw" ? "原始擷取" : capture.processingDepth === "light" ? "輕整理" : "深整理"}</span><time>{capturedTime(capture.capturedAt)}</time></div>
      <h3>{capture.title}</h3>
      {capture.clip.origin === "line" && <div className="forage-clip-source"><span>{capture.clip.sourceKind === "screenshot" ? "截圖" : "網頁"}</span><span>{capture.clip.platform || "LINE"}</span>{capture.clip.webPreview.status === "unavailable" && <span>僅保存網址</span>}</div>}
      {capture.clip.attachments.length > 0 && <div className="forage-clip-images">{capture.clip.attachments.map((attachment) => <a key={attachment.id} href={`/api/dojo/captures/${capture.id}/images/${attachment.blockId}`} target="_blank" rel="noreferrer"><Image src={`/api/dojo/captures/${capture.id}/images/${attachment.blockId}`} alt="LINE 剪藏原始截圖" width={720} height={480} unoptimized /></a>)}</div>}
      {capture.excerpt && <p className="weaving-excerpt">{capture.excerpt}</p>}
      {capture.note && <div className="weaving-original-note"><b>擷取時的想法</b><p>{capture.note}</p></div>}
      {capture.sourceUrl && <a className="weaving-source" href={capture.sourceUrl} target="_blank" rel="noreferrer">↗ {sourceHost(capture.sourceUrl)}</a>}
      {!editing && capture.status === "adopted" && <div className="forage-result"><div><span>{capture.creativeMaturity}</span><span>{capture.sourceKnowledgeMaturity}</span>{capture.destinations.map((key) => <span key={key}>{DESTINATIONS.find((item) => item.key === key)?.label}</span>)}</div>{capture.forageSummary && <p>{capture.forageSummary}</p>}</div>}

      {!editing ? (
        <button type="button" className="weaving-edit-button" onClick={onEdit}>{capture.status === "faded" ? "恢復並整理" : capture.status === "adopted" ? "調整整理" : "開始十秒整理"}</button>
      ) : (
        <div className="forage-editor">
          <div className="weaving-editor-heading"><div><span className="label">輕整理</span><b>它大致屬於什麼？接下來用在哪裡？</b></div><button className="text-link" onClick={onCancel} disabled={saving}>收起</button></div>
          <label>分類</label>
          <select className="field" value={draft.category ?? ""} onChange={(event) => setDraft({ ...draft, category: event.target.value ? event.target.value as CaptureEntry["category"] : null })}>
            <option value="">暫不分類</option>{Object.entries(CAPTURE_CATEGORIES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
          {capture.clip.origin === "line" && <><label>當初為什麼收藏？</label><select className="field" value={draft.clip.purpose} onChange={(event) => setDraft({ ...draft, clip: { ...draft.clip, purpose: event.target.value as CaptureEntry["clip"]["purpose"] } })}>{Object.entries(CAPTURE_CLIP_PURPOSES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></>}
          <label>使用去向（可複選）</label>
          <div className="destination-grid">{DESTINATIONS.map((item) => <button type="button" key={item.key} className={draft.destinations.includes(item.key) ? "on" : ""} onClick={() => toggleDestination(item.key)}><b>{item.label}</b><small>{item.hint}</small></button>)}</div>
          {draft.destinations.includes("practice") && <><label>連到哪些學習項目？（可複選）</label><div className="learning-chip-row">{Object.entries(LEARNING_TRACKS).map(([key, config]) => <button type="button" key={key} className={draft.learningTracks.includes(key as LearningTrackKey) ? "on" : ""} onClick={() => toggleTrack(key as LearningTrackKey)}>{config.title}</button>)}</div></>}
          <label className="check forage-pin"><input type="checkbox" checked={draft.pinned} onChange={(event) => setDraft({ ...draft, pinned: event.target.checked })} />釘選這份材料，不讓它自動淡出</label>

          <details className="deep-forage" open={draft.processingDepth === "deep"}>
            <summary>深入整理（選填）<small>提煉理解與知識關聯</small></summary>
            <label>內容類型</label>
            <select className="field" value={draft.contentType ?? ""} onChange={(event) => setDraft({ ...draft, contentType: event.target.value ? event.target.value as CaptureEntry["contentType"] : null })}>
              <option value="">暫不判斷</option>{Object.entries(CAPTURE_CONTENT_TYPES).map(([key, value]) => <option key={key} value={key}>{value[0]}｜{value[1]}</option>)}
            </select>
            <label>這份材料在說什麼？</label><textarea className="field" rows={3} value={draft.forageSummary} onChange={(event) => setDraft({ ...draft, forageSummary: event.target.value })} placeholder="用自己的話留下一段摘要" />
            <label>為什麼值得留下？</label><textarea className="field" rows={2} value={draft.forageReason} onChange={(event) => setDraft({ ...draft, forageReason: event.target.value })} placeholder="可能的用途、疑問或個人理解" />
            <label>創作成熟度</label><div className="creative-maturity-grid">{(Object.keys(CREATIVE_MATURITY) as CreativeMaturity[]).map((key) => <button type="button" key={key} className={draft.creativeMaturity === key ? "on" : ""} onClick={() => setDraft({ ...draft, creativeMaturity: key })}><b>{CREATIVE_MATURITY[key].label}</b><small>{CREATIVE_MATURITY[key].hint}</small></button>)}</div>
            <label>來源成熟度</label><div className="knowledge-source-maturity"><button type="button" className={draft.sourceKnowledgeMaturity === "K0" ? "on" : ""} onClick={() => setDraft({ ...draft, sourceKnowledgeMaturity: "K0" })}><b>K0 未處理來源</b><small>來源或上下文仍不足，只保存</small></button><button type="button" className={draft.sourceKnowledgeMaturity === "K1" ? "on" : ""} onClick={() => setDraft({ ...draft, sourceKnowledgeMaturity: "K1" })}><b>K1 可追溯來源</b><small>能由網址、位置或經驗日期回找</small></button></div>
            <label>可定位來源</label><input className="field" value={draft.sourceLocator} onChange={(event) => setDraft({ ...draft, sourceLocator: event.target.value })} placeholder="頁碼、段落、時間碼，或其他可回找位置" />
            <label>這份材料可否交給日後的知識工具？</label><select className="field" value={draft.llmMaterialUse} onChange={(event) => setDraft({ ...draft, llmMaterialUse: event.target.value as CaptureEntry["llmMaterialUse"] })}><option value="disabled">禁用：不放入知識脈絡</option><option value="inspiration_only">僅靈感：不可寫成確定事實</option></select>
            <label>舊式知識標籤</label>
            <div className="knowledge-link-add"><input className="field" value={linkLabel} onChange={(event) => setLinkLabel(event.target.value)} placeholder="例如：八卦・坎卦" /><select className="field" value={linkRelation} onChange={(event) => setLinkRelation(event.target.value as KnowledgeRelation)}>{Object.entries(KNOWLEDGE_RELATIONS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><button type="button" onClick={addKnowledgeLink}>加入</button></div>
            {draft.knowledgeLinks.length > 0 && <div className="knowledge-links">{draft.knowledgeLinks.map((link) => <span key={link.id}>{KNOWLEDGE_RELATIONS[link.relation]}・{link.label}<button type="button" aria-label={`移除 ${link.label}`} onClick={() => setDraft({ ...draft, knowledgeLinks: draft.knowledgeLinks.filter((item) => item.id !== link.id) })}>×</button></span>)}</div>}
            <div className="claim-bridge"><b>知識主張</b><p>材料不會自動升格。你可以明確建立 K2 候選，或連到既有主張。</p>
              <textarea className="field" rows={2} value={candidateStatement} onChange={(event) => setCandidateStatement(event.target.value)} placeholder="寫成一句完整、可判斷的候選主張" />
              <div className="knowledge-create-grid"><select className="field" value={candidateType} onChange={(event) => setCandidateType(event.target.value as KnowledgeClaimType)}>{Object.entries(KNOWLEDGE_CLAIM_TYPES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><select className="field" value={candidateClaimant} onChange={(event) => setCandidateClaimant(event.target.value as Claimant)}><option value="crystal">Crystal 的主張</option><option value="external_author">來源作者的主張</option><option value="shared">共同形成</option><option value="unknown">尚未確認</option></select></div>
              <button type="button" disabled={saving || !candidateStatement.trim()} onClick={() => void createCandidateClaim()}>建立 K2 候選</button>
              {claimsLoading && <p className="muted-note">需要時才載入既有知識主張…</p>}
              {claims.length > 0 && <div className="knowledge-link-add"><select className="field" value={selectedClaimId} onChange={(event) => setSelectedClaimId(event.target.value)}><option value="">連到既有主張…</option>{claims.map((claim) => <option key={claim.id} value={claim.id}>{currentClaimVersion(claim).statement.slice(0, 60)}</option>)}</select><select className="field" value={claimRelation} onChange={(event) => setClaimRelation(event.target.value as CaptureClaimRelation)}>{Object.entries(CLAIM_RELATIONS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><button type="button" onClick={linkExistingClaim}>連結</button></div>}
              {draft.claimRefs.length > 0 && <div className="knowledge-links">{draft.claimRefs.map((ref) => { const linked = claims.find((claim) => claim.id === ref.claimId); return <span key={`${ref.claimId}-${ref.relation}`}>{CLAIM_RELATIONS[ref.relation]}・{linked ? currentClaimVersion(linked).statement.slice(0, 36) : ref.claimId}<button type="button" aria-label="移除主張關聯" onClick={() => setDraft({ ...draft, claimRefs: draft.claimRefs.filter((item) => item !== ref) })}>×</button></span>; })}</div>}
            </div>
          </details>
          {error && <p className="form-error">{error}</p>}
          <div className="forage-actions">
            <button type="button" onClick={() => void save("pending")} disabled={saving}>{capture.status === "faded" ? "恢復到待處理" : capture.status === "adopted" ? "放回待處理" : "儲存，稍後繼續"}</button>
            <button type="button" className="primary" onClick={() => void save("adopted")} disabled={saving}>{saving ? "儲存中…" : "採用並送往下一站"}</button>
          </div>
          {capture.status !== "faded" && <button type="button" className="text-link forage-fade-action" onClick={() => void save("faded")} disabled={saving}>暫時淡出這份材料</button>}
        </div>
      )}
    </article>
  );
}
