"use client";

import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CAPTURE_CATEGORIES,
  CAPTURE_CLIP_PURPOSES,
  CAPTURE_CONTENT_TYPES,
  CAPTURE_KNOWLEDGE_ORIGINS,
  type CaptureDestination,
  type CaptureEntry,
  type CaptureClaimRelation,
  type CreativeMaturity,
  type CaptureKnowledgeOrigin,
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

const CLAIM_RELATIONS = {
  source: "由此形成",
  supports: "支持",
  extends: "延伸",
  contradicts: "矛盾",
  example: "案例",
  question: "待解問題",
} as const satisfies Record<Exclude<CaptureClaimRelation, "inspiration">, string>;

type EditableClaimRelation = keyof typeof CLAIM_RELATIONS;

const ORIGIN_LOCATOR_HINTS: Record<CaptureKnowledgeOrigin, string> = {
  unknown: "先記下你還缺少什麼來源資訊",
  direct_teaching: "教導者、日期與情境，例如：經理 Alex・2026-09-14・肩頸按摩交接",
  self_observation: "日期、地點與實作情境，例如：2026-09-14・按摩工作・第 3 位客人",
  published_source: "書名頁碼、文章段落或影片時間碼",
  conversation_feedback: "對話對象、日期與情境；私人內容請只留必要摘要",
  ai_candidate: "工具／對話名稱、日期與可回找位置；仍需人工核對",
};

const CONTENT_TYPE_CLAIM_HINTS: Partial<Record<NonNullable<CaptureEntry["contentType"]>, string>> = {
  atomic: "若要升格，通常建立「理解知識」。",
  method: "若包含可重複步驟，通常建立「方法知識」。",
  observation: "若是你親自觀察或實作，通常建立「經驗知識」。",
  case: "案例先連到主張，不必把整件事件直接升格成知識。",
  insight: "若是你目前採用的解釋或判斷，可建立「立場知識」。",
  question: "問題本身不是知識，請用「待解問題」連到相關主張。",
  inspiration: "可以送往織光杼；事實不足時只能作靈感。",
  material: "先保留來源；從材料中另外抽取一句 Claim。",
};

export default function ForageCaptureInbox({ initialCaptureId = "" }: { initialCaptureId?: string }) {
  const [captures, setCaptures] = useState<CaptureEntry[]>([]);
  const [claims, setClaims] = useState<KnowledgeClaim[]>([]);
  const [claimsLoaded, setClaimsLoaded] = useState(false);
  const [claimsLoading, setClaimsLoading] = useState(false);
  const [tab, setTab] = useState<InboxTab>("pending");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deepLinkMessage, setDeepLinkMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const response = await fetch("/api/dojo/captures", { cache: "no-store" });
      const result = await responseJson<{ captures: CaptureEntry[] }>(response);
      setCaptures(result.captures ?? []);
      if (initialCaptureId) {
        const target = result.captures.find((capture) => capture.id === initialCaptureId);
        if (target) {
          setTab(target.status);
          setDeepLinkMessage("已定位最近素材；可直接展開整理。");
          window.setTimeout(() => document.getElementById(`capture-${target.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 0);
        } else {
          setDeepLinkMessage("找不到指定的一般素材；它可能已被移除，或連結已失效。");
        }
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally { setLoading(false); }
  }, [initialCaptureId]);

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

      {deepLinkMessage && <p className={`english-image-deep-link-note ${initialCaptureId && !captures.some((capture) => capture.id === initialCaptureId) ? "is-error" : ""}`}>{deepLinkMessage}</p>}

      {tab === "faded" && <p className="forage-fade-note">待處理超過 30 天的原始材料會暫時淡出；資料仍完整保留，可隨時恢復。</p>}
      {loading && <div className="empty">正在打開採集匣…</div>}
      {error && <p className="form-error">{error}<button className="text-link" onClick={() => void load()}>重新讀取</button></p>}
      {!loading && !error && visible.length === 0 && (
        <div className="weaving-empty"><span>✦</span><b>{tab === "pending" ? "目前沒有等待處理的材料" : tab === "adopted" ? "還沒有採用素材" : "沒有淡出的材料"}</b><p>擷取後的原始內容會先安全留在這裡。</p></div>
      )}

      <div className="forage-list">
        {visible.map((capture) => (
          <ForageCard key={`${capture.id}-${capture.updatedAt}`} capture={capture} editing={editingId === capture.id} targeted={capture.id === initialCaptureId}
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

function ForageCard({ capture, claims, claimsLoading, editing, targeted, onEdit, onCancel, onSaved, onClaimCreated, onCaptureUpdated }: {
  capture: CaptureEntry; claims: KnowledgeClaim[]; claimsLoading: boolean; editing: boolean; targeted: boolean; onEdit: () => void; onCancel: () => void; onSaved: (next: CaptureEntry) => void; onClaimCreated: (claim: KnowledgeClaim) => void; onCaptureUpdated: (capture: CaptureEntry) => void;
}) {
  const [draft, setDraft] = useState(capture);
  const [candidateStatement, setCandidateStatement] = useState("");
  const [candidateType, setCandidateType] = useState<KnowledgeClaimType>("understanding");
  const [candidateClaimant, setCandidateClaimant] = useState<Claimant>("crystal");
  const [selectedClaimId, setSelectedClaimId] = useState("");
  const [claimRelation, setClaimRelation] = useState<EditableClaimRelation>("supports");
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

  function selectKnowledgeOrigin(origin: CaptureKnowledgeOrigin) {
    setDraft((current) => ({ ...current, knowledgeOrigin: origin }));
    if (origin === "direct_teaching" || origin === "published_source" || origin === "conversation_feedback") setCandidateClaimant("external_author");
    if (origin === "self_observation") setCandidateClaimant("crystal");
    if (origin === "ai_candidate" || origin === "unknown") setCandidateClaimant("unknown");
  }

  function selectContentType(contentType: CaptureEntry["contentType"]) {
    setDraft((current) => ({ ...current, contentType }));
    if (contentType === "atomic") setCandidateType("understanding");
    if (contentType === "method") setCandidateType("procedure");
    if (contentType === "observation") setCandidateType("experience");
    if (contentType === "insight") setCandidateType("perspective");
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
    if (draft.knowledgeOrigin === "unknown") {
      setError("建立 K2 前，請先選擇這段內容從哪裡來。"); return;
    }
    if (!draft.sourceLocator.trim() && !(draft.knowledgeOrigin === "published_source" && draft.sourceUrl)) {
      setError(`請補上可定位來源：${ORIGIN_LOCATOR_HINTS[draft.knowledgeOrigin]}`); return;
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
    const hasDeepWork = Boolean(draft.forageSummary || draft.forageReason || draft.contentType || draft.knowledgeOrigin !== "unknown" || draft.claimRefs.length || draft.sourceLocator || draft.creativeMaturity !== "C0" || draft.sourceKnowledgeMaturity !== "K0");
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
    <article id={`capture-${capture.id}`} className={`forage-card depth-${capture.processingDepth} ${targeted ? "is-targeted" : ""}`}>
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
            <label>這段內容從哪裡來？</label>
            <select className="field" value={draft.knowledgeOrigin} onChange={(event) => selectKnowledgeOrigin(event.target.value as CaptureKnowledgeOrigin)}>
              {Object.entries(CAPTURE_KNOWLEDGE_ORIGINS).map(([key, value]) => <option key={key} value={key}>{value[0]}｜{value[1]}</option>)}
            </select>
            {draft.knowledgeOrigin === "direct_teaching" && <div className="knowledge-origin-guide"><b>經理教我的內容放這裡</b><p>操作步驟選「方法／操作」並建立「方法知識」；原理解釋選「概念／原理」並建立「理解知識」。來源請留下教導者、日期與工作情境。</p></div>}
            <label>這段內容扮演什麼角色？</label>
            <select className="field" value={draft.contentType ?? ""} onChange={(event) => selectContentType(event.target.value ? event.target.value as CaptureEntry["contentType"] : null)}>
              <option value="">暫不判斷</option>{Object.entries(CAPTURE_CONTENT_TYPES).map(([key, value]) => <option key={key} value={key}>{value[0]}｜{value[1]}</option>)}
            </select>
            {draft.contentType && CONTENT_TYPE_CLAIM_HINTS[draft.contentType] && <p className="knowledge-field-hint">{CONTENT_TYPE_CLAIM_HINTS[draft.contentType]}</p>}
            <label>這份材料在說什麼？</label><textarea className="field" rows={3} value={draft.forageSummary} onChange={(event) => setDraft({ ...draft, forageSummary: event.target.value })} placeholder="用自己的話留下一段摘要" />
            <label>為什麼值得留下？</label><textarea className="field" rows={2} value={draft.forageReason} onChange={(event) => setDraft({ ...draft, forageReason: event.target.value })} placeholder="可能的用途、疑問或個人理解" />
            <label>創作成熟度</label><div className="creative-maturity-grid">{(Object.keys(CREATIVE_MATURITY) as CreativeMaturity[]).map((key) => <button type="button" key={key} className={draft.creativeMaturity === key ? "on" : ""} onClick={() => setDraft({ ...draft, creativeMaturity: key })}><b>{CREATIVE_MATURITY[key].label}</b><small>{CREATIVE_MATURITY[key].hint}</small></button>)}</div>
            <label>來源成熟度</label><div className="knowledge-source-maturity"><button type="button" className={draft.sourceKnowledgeMaturity === "K0" ? "on" : ""} onClick={() => setDraft({ ...draft, sourceKnowledgeMaturity: "K0" })}><b>K0 未處理來源</b><small>來源或上下文仍不足，只保存</small></button><button type="button" className={draft.sourceKnowledgeMaturity === "K1" ? "on" : ""} onClick={() => setDraft({ ...draft, sourceKnowledgeMaturity: "K1" })}><b>K1 可追溯來源</b><small>能由網址、位置或經驗日期回找</small></button></div>
            <label>可定位來源</label><input className="field" value={draft.sourceLocator} onChange={(event) => setDraft({ ...draft, sourceLocator: event.target.value })} placeholder={ORIGIN_LOCATOR_HINTS[draft.knowledgeOrigin]} />
            <label>這份材料可否交給日後的知識工具？</label><select className="field" value={draft.llmMaterialUse} onChange={(event) => setDraft({ ...draft, llmMaterialUse: event.target.value as CaptureEntry["llmMaterialUse"] })}><option value="disabled">禁用：不放入知識脈絡</option><option value="inspiration_only">僅靈感：不可寫成確定事實</option></select>
            <div className="claim-bridge"><b>知識主張</b><p>材料不會自動升格。你可以明確建立 K2 候選，或連到既有主張。</p>
              <textarea className="field" rows={2} value={candidateStatement} onChange={(event) => setCandidateStatement(event.target.value)} placeholder="寫成一句完整、可判斷的候選主張" />
              <div className="knowledge-create-grid"><select className="field" value={candidateType} onChange={(event) => setCandidateType(event.target.value as KnowledgeClaimType)}>{Object.entries(KNOWLEDGE_CLAIM_TYPES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><select className="field" value={candidateClaimant} onChange={(event) => setCandidateClaimant(event.target.value as Claimant)}><option value="crystal">Crystal 的主張</option><option value="external_author">來源人物／作者的主張</option><option value="shared">共同形成</option><option value="unknown">尚未確認</option></select></div>
              <button type="button" disabled={saving || !candidateStatement.trim()} onClick={() => void createCandidateClaim()}>建立 K2 候選</button>
              {claimsLoading && <p className="muted-note">需要時才載入既有知識主張…</p>}
              {claims.length > 0 && <div className="knowledge-link-add"><select className="field" value={selectedClaimId} onChange={(event) => setSelectedClaimId(event.target.value)}><option value="">連到既有主張…</option>{claims.map((claim) => <option key={claim.id} value={claim.id}>{currentClaimVersion(claim).statement.slice(0, 60)}</option>)}</select><select className="field" value={claimRelation} onChange={(event) => setClaimRelation(event.target.value as EditableClaimRelation)}>{Object.entries(CLAIM_RELATIONS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><button type="button" onClick={linkExistingClaim}>連結</button></div>}
              {draft.claimRefs.length > 0 && <div className="knowledge-links">{draft.claimRefs.map((ref) => { const linked = claims.find((claim) => claim.id === ref.claimId); const relationLabel = ref.relation === "inspiration" ? "延伸" : CLAIM_RELATIONS[ref.relation]; return <span key={`${ref.claimId}-${ref.relation}`}>{relationLabel}・{linked ? currentClaimVersion(linked).statement.slice(0, 36) : ref.claimId}<button type="button" aria-label="移除主張關聯" onClick={() => setDraft({ ...draft, claimRefs: draft.claimRefs.filter((item) => item !== ref) })}>×</button></span>; })}</div>}
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
