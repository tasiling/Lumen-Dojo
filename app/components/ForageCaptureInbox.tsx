"use client";

import Link from "next/link";
import ForageTabs from "./ForageTabs";
import ForageIcon from "./ForageIcon";
import ForageDouyin, { isDouyinCapture } from "./ForageDouyin";
import {CAPTURE_DETAIL_TABS} from "@/lib/dojo/forageUi";
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
import type { FoundationSnapshot, LearningEntity } from "@/lib/dojo/learningFoundation/model";
import { LEARNING_TRACKS } from "@/lib/dojo/learning";
import { KNOWLEDGE_CLAIM_TYPES, currentClaimVersion, type Claimant, type KnowledgeClaim, type KnowledgeClaimType } from "@/lib/dojo/knowledgeClaims";
import { captureOriginal, originalStateLabel, type RefineRecord } from "@/lib/dojo/refineRecord";
import { REFINE_MAX_SOURCES } from "@/lib/dojo/captureRefine";
import { decodeHtmlEntities } from "@/lib/dojo/htmlEntities";

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

function externalPreviewText(capture: CaptureEntry, value: string): string {
  return capture.clip.origin === "line" && capture.clip.sourceKind === "webpage"
    ? decodeHtmlEntities(value)
    : value;
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
  const [learningItems, setLearningItems] = useState<LearningEntity[]>([]);
  const [learningError, setLearningError] = useState("");
  const [captures, setCaptures] = useState<CaptureEntry[]>([]);
  const [claims, setClaims] = useState<KnowledgeClaim[]>([]);
  const [claimsLoaded, setClaimsLoaded] = useState(false);
  const [claimsLoading, setClaimsLoading] = useState(false);
  const [tab, setTab] = useState<InboxTab>("pending");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [detailId,setDetailId]=useState<string|null>(null);
  const [captureView,setCaptureView]=useState("content");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deepLinkMessage, setDeepLinkMessage] = useState("");
  const [selecting, setSelecting] = useState(false);
  const [selection, setSelection] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const response = await fetch("/api/dojo/captures", { cache: "no-store" });
      const result = await responseJson<{ captures: CaptureEntry[] }>(response);
      setCaptures(result.captures ?? []);
      try {
        const learning = await responseJson<FoundationSnapshot>(await fetch('/api/dojo/learning/foundation', { cache: 'no-store' }));
        setLearningItems(learning.entities.filter(e => e.kind === 'item')); setLearningError('');
      } catch (caught) { setLearningError(`學習項目目前無法讀取：${caught instanceof Error ? caught.message : String(caught)}；既有關聯會保留。`); }
      if (initialCaptureId) {
        const target = result.captures.find((capture) => capture.id === initialCaptureId);
        if (target) {
          setTab(target.status);setDetailId(target.id);
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
        <Link href="/forage/new" className="forage-capture-link">新增素材</Link>
      </div>

      {!detailId && <ForageDouyin />}
      <div className="forage-tabs" hidden={Boolean(detailId)} role="tablist" aria-label="採集匣狀態">
        {([
          ["pending", "待處理"], ["adopted", "已採用"], ["faded", "已淡出"],
        ] as [InboxTab, string][]).map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? "on" : ""} onClick={() => setTab(key)}>
            {label}<span>{counts[key]}</span>
          </button>
        ))}
      </div>

      {learningError && <p role="alert" className="form-error">{learningError}</p>}
      {deepLinkMessage && <p className={`english-image-deep-link-note ${initialCaptureId && !captures.some((capture) => capture.id === initialCaptureId) ? "is-error" : ""}`}>{deepLinkMessage}</p>}

      {tab === "faded" && <p className="forage-fade-note">待處理超過 30 天的原始材料會暫時淡出；資料仍完整保留，可隨時恢復。</p>}
      {loading && <div className="empty">正在打開採集匣…</div>}
      {error && <p className="form-error">{error}<button className="text-link" onClick={() => void load()}>重新讀取</button></p>}
      {!loading && !error && visible.length === 0 && (
        <div className="weaving-empty"><ForageIcon name="i-leaf"/><b>{tab === "pending" ? "目前沒有等待處理的材料" : tab === "adopted" ? "還沒有採用素材" : "沒有淡出的材料"}</b><p>擷取後的原始內容會先安全留在這裡。</p></div>
      )}

      {detailId&&<button type="button" onClick={()=>{if(editingId&&!window.confirm("目前未儲存的整理仍會留在此頁；要先返回列表嗎？"))return;setDetailId(null);}}>返回採集匣</button>}
      {!detailId && visible.length > 0 && <div className="refine-selection-bar">
        {selecting
          ? <><span>已選 {selection.length}／{REFINE_MAX_SOURCES} 則</span>
              {selection.length > 0 && <Link className="forage-refine-start" href={`/forage/refine?captures=${selection.map(encodeURIComponent).join(",")}`}>帶這幾則去淬鍊</Link>}
              <button type="button" onClick={() => { setSelecting(false); setSelection([]); }}>取消</button></>
          : <button type="button" onClick={() => setSelecting(true)}>挑幾則一起淬鍊</button>}
      </div>}
      <div className="forage-list">
        {visible.map((capture) => (
          <ForageCard key={capture.id} capture={capture} detail={detailId===capture.id} hidden={Boolean(detailId&&detailId!==capture.id)} activeTab={captureView} onTab={setCaptureView} onView={()=>{setDetailId(capture.id);setCaptureView("content");}} editing={editingId === capture.id} targeted={capture.id === initialCaptureId}
            claims={claims} claimsLoading={claimsLoading} learningItems={learningItems}
            onEdit={() => { setEditingId(capture.id); void loadClaims(); }} onCancel={() => setEditingId(null)}
            onClaimCreated={(claim) => setClaims((current) => [claim, ...current])}
            onCaptureUpdated={replaceCapture}
            selecting={selecting} selected={selection.includes(capture.id)} selectionFull={selection.length >= REFINE_MAX_SOURCES}
            onSelect={() => setSelection((current) => current.includes(capture.id) ? current.filter((id) => id !== capture.id) : current.length >= REFINE_MAX_SOURCES ? current : [...current, capture.id])}
            onSaved={(next) => { replaceCapture(next); setEditingId(null); if (next.status !== tab) setTab(next.status); }} />
        ))}
      </div>
    </section>
  );
}

/**
 * 淬鍊入口，取代原本的「感觸與探索」。舊的探索紀錄仍以歷史顯示；新的討論在淬鍊頁進行，這裡列出它參與過的淬鍊。
 */
function CaptureRefineEntry({ capture, active }: { capture: CaptureEntry; active: boolean }) {
  const [rounds, setRounds] = useState<RefineRecord[] | null>(null);
  const [error, setError] = useState("");
  const original = captureOriginal(capture);
  useEffect(() => {
    if (!active || rounds) return;
    let cancelled = false;
    fetch(`/api/dojo/refine?captureId=${encodeURIComponent(capture.id)}`, { cache: "no-store" })
      .then((response) => responseJson<{ rounds: RefineRecord[] }>(response))
      .then((result) => { if (!cancelled) setRounds(result.rounds ?? []); })
      .catch((caught) => { if (!cancelled) setError(caught instanceof Error ? caught.message : String(caught)); });
    return () => { cancelled = true; };
  }, [active, capture.id, rounds]);

  return (
    <section className="capture-exploration capture-refine-entry" aria-label="淬鍊">
      <div className="capture-exploration-heading">
        <div><b>淬鍊</b><span>帶著逐段編號的原文去和 GPT 討論，挑出自己說過的話。</span></div>
        {original.state === "none"
          ? <button type="button" disabled>開始淬鍊</button>
          : <Link className="forage-refine-start" href={`/forage/refine?captures=${encodeURIComponent(capture.id)}`}>開始淬鍊</Link>}
      </div>
      <p className={`refine-original is-${original.state}`}>{original.state === "none" ? "這則採集沒有原文，請先補上全文才能淬鍊。" : `原文：${original.kind}・${originalStateLabel(original.state)}`}{original.state === "unsegmented" ? "；討論包會暫時依句號切段。" : original.state === "partial" ? "；討論時請留意可能缺少的部分。" : ""}</p>
      {error && <p className="form-error">{error}</p>}
      {rounds && rounds.length > 0 && <div className="capture-refine-rounds"><b>參與過的淬鍊</b><ul>{rounds.map((round) => <li key={round.id}>
        <Link href={`/forage/refine?id=${encodeURIComponent(round.id)}`}>{round.topic}</Link>
        <small>{round.status === "open" ? "討論中" : round.status === "returned" ? `已貼回・挑選 ${round.picks.length} 則` : "已結束"}・{capturedTime(round.createdAt)}</small>
      </li>)}</ul></div>}
      {capture.explorationRecords.length > 0 && <details className="capture-exploration-history"><summary>查看探索歷程</summary><div>{capture.explorationRecords.map((record, index) => <article key={record.id}><div><b>第 {index + 1} 次</b><time>{capturedTime(record.createdAt)}</time><span>{record.source === "gpt_import" ? "GPT 整理後確認" : "自行記錄"}</span></div>{record.thoughts && <p><strong>探索中的想法</strong>{record.thoughts}</p>}{record.keyFinding && <p><strong>目前最值得保留</strong>{record.keyFinding}</p>}{record.openQuestions && <p><strong>還沒想清楚</strong>{record.openQuestions}</p>}</article>)}</div></details>}
    </section>
  );
}

function ForageCard({ detail,hidden,activeTab,onTab,onView,capture, learningItems, claims, claimsLoading, editing, targeted, onEdit, onCancel, onSaved, onClaimCreated, onCaptureUpdated, selecting = false, selected = false, selectionFull = false, onSelect }: {
  selecting?: boolean; selected?: boolean; selectionFull?: boolean; onSelect?: () => void;
  detail:boolean;hidden:boolean;activeTab:string;onTab:(tab:string)=>void;onView:()=>void;capture: CaptureEntry; learningItems: LearningEntity[]; claims: KnowledgeClaim[]; claimsLoading: boolean; editing: boolean; targeted: boolean; onEdit: () => void; onCancel: () => void; onSaved: (next: CaptureEntry) => void; onClaimCreated: (claim: KnowledgeClaim) => void; onCaptureUpdated: (capture: CaptureEntry) => void;
}) {
  const [draft, setDraft] = useState(capture);
  useEffect(()=>{if(editing)return;const t=window.setTimeout(()=>setDraft(current=>current.updatedAt===capture.updatedAt?current:capture),0);return()=>window.clearTimeout(t);},[capture,editing]);
  const [candidateStatement, setCandidateStatement] = useState("");
  const [candidateType, setCandidateType] = useState<KnowledgeClaimType>("understanding");
  const [candidateClaimant, setCandidateClaimant] = useState<Claimant>("crystal");
  const [selectedClaimId, setSelectedClaimId] = useState("");
  const [claimRelation, setClaimRelation] = useState<EditableClaimRelation>("supports");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const categoryLabel = capture.category ? CAPTURE_CATEGORIES[capture.category] : "未分類";
  const purposeLabel = CAPTURE_CLIP_PURPOSES[capture.clip.purpose];
  const displayTitle = externalPreviewText(capture, capture.title);
  const displayExcerpt = externalPreviewText(capture, capture.excerpt);
  const douyin = isDouyinCapture(capture.sourceUrl, capture.clip.platform);
  const original = captureOriginal(capture);

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

  function toggleItem(item: LearningEntity) {
    setDraft(current => {
      const ids = current.learningItemIds ?? [];
      const linked = ids.includes(item.id) || Boolean(item.legacyKey && current.learningTracks.includes(item.legacyKey));
      return { ...current, learningItemIds: linked ? ids.filter(id => id !== item.id) : [...ids, item.id], learningTracks: item.legacyKey ? linked ? current.learningTracks.filter(key => key !== item.legacyKey) : [...new Set([...current.learningTracks, item.legacyKey])] : current.learningTracks };
    });
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
    if (status === "adopted" && draft.destinations.includes("practice") && draft.learningTracks.length === 0 && !(draft.learningItemIds?.length)) {
      setError("送往修習所前，請至少選擇一個學習項目。"); return;
    }
    if (status === "adopted" && draft.destinations.includes("weaving") && draft.creativeMaturity !== "C2" && draft.creativeMaturity !== "C3") {
      setError("送往織光堂前，請先確認創作成熟度至少為 C2；也可以先取消這個去向。"); return;
    }
    setSaving(true); setError(null);
    const now = new Date().toISOString();
    const hasDeepWork = Boolean(draft.forageSummary || draft.contentType || draft.knowledgeOrigin !== "unknown" || draft.claimRefs.length || draft.sourceLocator || draft.creativeMaturity !== "C0" || draft.sourceKnowledgeMaturity !== "K0");
    const hasLightWork = Boolean(draft.forageReason || draft.explorationRecords.length);
    const next: CaptureEntry = {
      ...draft,
      status,
      processingDepth: hasDeepWork ? "deep" : hasLightWork || status === "adopted" ? "light" : draft.processingDepth,
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
    <article id={`capture-${capture.id}`} hidden={hidden} className={`forage-card depth-${capture.processingDepth} ${targeted ? "is-targeted" : ""}`}>
      <div className="weaving-capture-meta"><span>{capture.clip.origin === "line" ? `LINE 剪藏 · ${purposeLabel}` : categoryLabel} · {capture.processingDepth === "raw" ? "原始擷取" : capture.processingDepth === "light" ? "輕整理" : "深整理"}</span><time>{capturedTime(capture.capturedAt)}</time>{original.state !== "ok" && <span className={`refine-original is-${original.state}`}>{originalStateLabel(original.state)}</span>}</div>
      {selecting && !detail && <label className={`refine-select ${original.state === "none" ? "is-disabled" : ""}`}><input type="checkbox" checked={selected} disabled={original.state === "none" || (!selected && selectionFull)} onChange={onSelect} />{original.state === "none" ? "沒有原文，不能帶去淬鍊" : selected ? "帶去淬鍊" : selectionFull ? `一輪最多 ${REFINE_MAX_SOURCES} 則` : "帶去淬鍊"}</label>}
      {detail?<h1>{displayTitle}</h1>:<h3>{displayTitle}</h3>}{detail&&<ForageTabs items={CAPTURE_DETAIL_TABS} value={activeTab} label="一般素材分區" onChange={key=>{onTab(key);if(key==="organize"||key==="claims")onEdit();}} />}<div hidden={detail&&activeTab!=="content"}>
      {capture.clip.origin === "line" && <div className="forage-clip-source"><span>{capture.clip.sourceKind === "screenshot" ? "截圖" : douyin ? "影片" : "網頁"}</span><span>{capture.clip.platform || "LINE"}</span>{!douyin && capture.clip.webPreview.status === "unavailable" && <span>僅保存網址</span>}</div>}
      {capture.clip.attachments.length > 0 && <div className="forage-clip-images">{capture.clip.attachments.map((attachment) => <a key={attachment.id} href={`/api/dojo/captures/${capture.id}/images/${attachment.blockId}`} target="_blank" rel="noreferrer"><Image src={`/api/dojo/captures/${capture.id}/images/${attachment.blockId}`} alt="LINE 剪藏原始截圖" width={720} height={480} unoptimized /></a>)}</div>}
      {capture.clip.threadsPost && <details open><summary>{capture.clip.threadsPost.partial ? "已擷取的部分原文" : "Threads 貼文原文"}</summary><p style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{capture.clip.threadsPost.text}</p></details>}
      {displayExcerpt && capture.excerpt !== capture.clip.threadsPost?.text && <p className="weaving-excerpt">{displayExcerpt}</p>}
      {detail && <ForageDouyin captureId={capture.id} captureTitle={capture.title} douyin={douyin} stored={capture.clip.transcript} />}
      {capture.forageReason && !editing && <div className="capture-initial-reflection"><b>最初想記錄的原因</b><p>{capture.forageReason}</p></div>}
      {capture.note && capture.note !== capture.forageReason && <div className="weaving-original-note"><b>擷取時的其他補充</b><p>{capture.note}</p></div>}
      {capture.sourceUrl && <a className="weaving-source" href={capture.sourceUrl} target="_blank" rel="noreferrer">↗ {sourceHost(capture.sourceUrl)}</a>}
      </div><div hidden={!detail||activeTab!=="explore"}><CaptureRefineEntry capture={capture} active={detail&&activeTab==="explore"} /></div>
      {!editing && capture.status === "adopted" && <div className="forage-result"><div><span>{capture.creativeMaturity}</span><span>{capture.sourceKnowledgeMaturity}</span>{capture.destinations.map((key) => <span key={key}>{DESTINATIONS.find((item) => item.key === key)?.label}</span>)}</div>{capture.forageSummary && <p>{capture.forageSummary}</p>}</div>}

      {!editing || !detail ? (
        <div className="forage-actions">{!detail&&<button type="button" className="primary" onClick={onView}>查看素材</button>}<button type="button" className="weaving-edit-button" onClick={()=>{if(!detail)onView();onTab("organize");onEdit();}}>{capture.status === "faded" ? "恢復並整理" : capture.status === "adopted" ? "調整整理" : "開始十秒整理"}</button></div>
      ) : (
        <div className="forage-editor" hidden={!detail||(activeTab!=="organize"&&activeTab!=="claims")}><div hidden={activeTab!=="organize"}>
          <div className="weaving-editor-heading"><div><span className="label">輕整理</span><b>它大致屬於什麼？接下來用在哪裡？</b></div><button className="text-link" onClick={onCancel} disabled={saving}>收起</button></div>
          <label htmlFor={`capture-${capture.id}-field-5`}>為什麼想留下這份素材？</label><textarea id={`capture-${capture.id}-field-5`} className="field" rows={3} value={draft.forageReason} onChange={(event) => setDraft({ ...draft, forageReason: event.target.value })} placeholder="一句話、多句話都可以，也可以先留白。" />
          <small className="field-help">這是最初感觸，不會被之後的摘要或探索紀錄覆蓋。</small>
          <label htmlFor={`capture-${capture.id}-field-6`}>分類</label><select id={`capture-${capture.id}-field-6`} className="field" value={draft.category ?? ""} onChange={(event) => setDraft({ ...draft, category: event.target.value ? event.target.value as CaptureEntry["category"] : null })}>
            <option value="">暫不分類</option>{Object.entries(CAPTURE_CATEGORIES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
          {capture.clip.origin === "line" && <><label htmlFor={`capture-${capture.id}-field-7`}>當初為什麼收藏？</label><select id={`capture-${capture.id}-field-7`} className="field" value={draft.clip.purpose} onChange={(event) => setDraft({ ...draft, clip: { ...draft.clip, purpose: event.target.value as CaptureEntry["clip"]["purpose"] } })}>{Object.entries(CAPTURE_CLIP_PURPOSES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></>}
          <label>使用去向（可複選）</label>
          <div className="destination-grid">{DESTINATIONS.map((item) => <button type="button" key={item.key} className={draft.destinations.includes(item.key) ? "on" : ""} onClick={() => toggleDestination(item.key)}><b>{item.label}</b><small>{item.hint}</small></button>)}</div>
          {draft.destinations.includes("practice") && <><label>連到哪些學習項目？（可複選）</label><div className="learning-chip-row">{learningItems.filter(item => item.status !== 'archived' || draft.learningItemIds?.includes(item.id) || item.legacyKey && draft.learningTracks.includes(item.legacyKey)).sort((a,b) => a.order-b.order).map(item => <button type="button" key={item.id} className={draft.learningItemIds?.includes(item.id) || item.legacyKey && draft.learningTracks.includes(item.legacyKey) ? 'on' : ''} onClick={() => toggleItem(item)}>{item.name}{item.status === 'archived' ? '（封存）' : ''}</button>)}{Object.entries(LEARNING_TRACKS).filter(([key]) => !learningItems.some(item => item.legacyKey === key)).map(([key, config]) => <button type="button" key={key} className={draft.learningTracks.includes(key as LearningTrackKey) ? "on" : ""} onClick={() => toggleTrack(key as LearningTrackKey)}>{config.title}</button>)}{(draft.unresolvedLearningRefs ?? []).map(ref => <span key={ref}>舊學習關聯待確認：{ref}</span>)}{(draft.learningItemIds ?? []).filter(id => !learningItems.some(item => item.id === id)).map(id => <span key={id}>歷史關聯待確認：{id}</span>)}</div></>}
          <label className="check forage-pin"><input type="checkbox" checked={draft.pinned} onChange={(event) => setDraft({ ...draft, pinned: event.target.checked })} />釘選這份材料，不讓它自動淡出</label>

          </div><details className="deep-forage" hidden={activeTab!=="organize"} open={draft.processingDepth === "deep"}>
            <summary>深入整理（選填）<small>提煉理解與知識關聯</small></summary>
            <label htmlFor={`capture-${capture.id}-field-8`}>這段內容從哪裡來？</label><select id={`capture-${capture.id}-field-8`} className="field" value={draft.knowledgeOrigin} onChange={(event) => selectKnowledgeOrigin(event.target.value as CaptureKnowledgeOrigin)}>
              {Object.entries(CAPTURE_KNOWLEDGE_ORIGINS).map(([key, value]) => <option key={key} value={key}>{value[0]}｜{value[1]}</option>)}
            </select>
            {draft.knowledgeOrigin === "direct_teaching" && <div className="knowledge-origin-guide"><b>經理教我的內容放這裡</b><p>操作步驟選「方法／操作」並建立「方法知識」；原理解釋選「概念／原理」並建立「理解知識」。來源請留下教導者、日期與工作情境。</p></div>}
            <label htmlFor={`capture-${capture.id}-field-9`}>這段內容扮演什麼角色？</label><select id={`capture-${capture.id}-field-9`} className="field" value={draft.contentType ?? ""} onChange={(event) => selectContentType(event.target.value ? event.target.value as CaptureEntry["contentType"] : null)}>
              <option value="">暫不判斷</option>{Object.entries(CAPTURE_CONTENT_TYPES).map(([key, value]) => <option key={key} value={key}>{value[0]}｜{value[1]}</option>)}
            </select>
            {draft.contentType && CONTENT_TYPE_CLAIM_HINTS[draft.contentType] && <p className="knowledge-field-hint">{CONTENT_TYPE_CLAIM_HINTS[draft.contentType]}</p>}
            <label htmlFor={`capture-${capture.id}-field-10`}>這份材料在說什麼？</label><textarea id={`capture-${capture.id}-field-10`} className="field" rows={3} value={draft.forageSummary} onChange={(event) => setDraft({ ...draft, forageSummary: event.target.value })} placeholder="用自己的話留下一段摘要" />
            <label>創作成熟度</label><div className="creative-maturity-grid">{(Object.keys(CREATIVE_MATURITY) as CreativeMaturity[]).map((key) => <button type="button" key={key} className={draft.creativeMaturity === key ? "on" : ""} onClick={() => setDraft({ ...draft, creativeMaturity: key })}><b>{CREATIVE_MATURITY[key].label}</b><small>{CREATIVE_MATURITY[key].hint}</small></button>)}</div>
            <label>來源成熟度</label><div className="knowledge-source-maturity"><button type="button" className={draft.sourceKnowledgeMaturity === "K0" ? "on" : ""} onClick={() => setDraft({ ...draft, sourceKnowledgeMaturity: "K0" })}><b>K0 未處理來源</b><small>來源或上下文仍不足，只保存</small></button><button type="button" className={draft.sourceKnowledgeMaturity === "K1" ? "on" : ""} onClick={() => setDraft({ ...draft, sourceKnowledgeMaturity: "K1" })}><b>K1 可追溯來源</b><small>能由網址、位置或經驗日期回找</small></button></div>
            <label htmlFor={`capture-${capture.id}-field-11`}>可定位來源</label><input id={`capture-${capture.id}-field-11`} className="field" value={draft.sourceLocator} onChange={(event) => setDraft({ ...draft, sourceLocator: event.target.value })} placeholder={ORIGIN_LOCATOR_HINTS[draft.knowledgeOrigin]} />
            <label htmlFor={`capture-${capture.id}-field-12`}>這份材料可否交給日後的知識工具？</label><select id={`capture-${capture.id}-field-12`} className="field" value={draft.llmMaterialUse} onChange={(event) => setDraft({ ...draft, llmMaterialUse: event.target.value as CaptureEntry["llmMaterialUse"] })}><option value="disabled">禁用：不放入知識脈絡</option><option value="inspiration_only">僅靈感：不可寫成確定事實</option></select>

          </details>
          <div hidden={activeTab!=="claims"}><div className="claim-bridge"><b>知識主張</b><p>材料不會自動升格。你可以明確建立 K2 候選，或連到既有主張。</p>
              <textarea className="field" rows={2} value={candidateStatement} onChange={(event) => setCandidateStatement(event.target.value)} placeholder="寫成一句完整、可判斷的候選主張" />
              <div className="knowledge-create-grid"><select className="field" value={candidateType} onChange={(event) => setCandidateType(event.target.value as KnowledgeClaimType)}>{Object.entries(KNOWLEDGE_CLAIM_TYPES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><select className="field" value={candidateClaimant} onChange={(event) => setCandidateClaimant(event.target.value as Claimant)}><option value="crystal">Crystal 的主張</option><option value="external_author">來源人物／作者的主張</option><option value="shared">共同形成</option><option value="unknown">尚未確認</option></select></div>
              <button type="button" disabled={saving || !candidateStatement.trim()} onClick={() => void createCandidateClaim()}>建立 K2 候選</button>
              {claimsLoading && <p className="muted-note">需要時才載入既有知識主張…</p>}
              {claims.length > 0 && <div className="knowledge-link-add"><select className="field" value={selectedClaimId} onChange={(event) => setSelectedClaimId(event.target.value)}><option value="">連到既有主張…</option>{claims.map((claim) => <option key={claim.id} value={claim.id}>{currentClaimVersion(claim).statement.slice(0, 60)}</option>)}</select><select className="field" value={claimRelation} onChange={(event) => setClaimRelation(event.target.value as EditableClaimRelation)}>{Object.entries(CLAIM_RELATIONS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><button type="button" onClick={linkExistingClaim}>連結</button></div>}
              {draft.claimRefs.length > 0 && <div className="knowledge-links">{draft.claimRefs.map((ref) => { const linked = claims.find((claim) => claim.id === ref.claimId); const relationLabel = ref.relation === "inspiration" ? "延伸" : CLAIM_RELATIONS[ref.relation]; return <span key={`${ref.claimId}-${ref.relation}`}>{relationLabel}・{linked ? currentClaimVersion(linked).statement.slice(0, 36) : ref.claimId}<button type="button" aria-label="移除主張關聯" onClick={() => setDraft({ ...draft, claimRefs: draft.claimRefs.filter((item) => item !== ref) })}>×</button></span>; })}</div>}
            </div></div>
          {error && <p className="form-error">{error}</p>}
          {activeTab==="claims"&&<div className="forage-claim-save"><p className="field-help">連結與移除會先保留在草稿；保存後才會寫入，其他未儲存的素材整理也會一併保存。</p><button type="button" className="primary" disabled={saving} onClick={()=>void save(capture.status)}>{saving?"保存中…":"保存主張關聯"}</button></div>}
          <div className="forage-actions" hidden={activeTab!=="organize"}>
            <button type="button" onClick={() => void save("pending")} disabled={saving}>{capture.status === "faded" ? "恢復到待處理" : capture.status === "adopted" ? "放回待處理" : "儲存，稍後繼續"}</button>
            <button type="button" className="primary" onClick={() => void save("adopted")} disabled={saving}>{saving ? "儲存中…" : "採用並送往下一站"}</button>
          </div>
          {capture.status !== "faded" && <button type="button" hidden={activeTab!=="organize"} className="text-link forage-fade-action" onClick={() => void save("faded")} disabled={saving}>暫時淡出這份材料</button>}
        </div>
      )}
    </article>
  );
}
