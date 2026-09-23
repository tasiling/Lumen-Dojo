"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  englishImageRouteLabel,
  type EnglishImageEntry,
  type EnglishImageLearningRoute,
  type EnglishImageRoute,
  type EnglishImageStatus,
} from "@/lib/dojo/englishImage";
import {
  englishImageStageLabel,
  filterAndSortEnglishImages,
  type EnglishImageSort,
  type EnglishImageStage,
} from "@/lib/dojo/englishImageInboxView";

async function json<T>(response: Response): Promise<T> {
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((result as { error?: string }).error ?? `操作失敗（${response.status}）`);
  return result as T;
}

const PAGE_SIZE = 20;
const ROUTES: { key: "all" | EnglishImageLearningRoute; label: string }[] = [
  { key: "all", label: "全部類別" }, { key: "game", label: "遊戲英文" }, { key: "daily", label: "英文日常" },
  { key: "classroom", label: "課堂英文" }, { key: "reading", label: "閱讀英文" },
];
const STATUS_TABS: { key: "inbox" | "organized" | "all"; label: string }[] = [
  { key: "inbox", label: "待處理" }, { key: "organized", label: "已完成" }, { key: "all", label: "全部" },
];
const STAGES: { key: EnglishImageStage; label: string }[] = [
  { key: "all", label: "全部階段" }, { key: "classification", label: "待分類" }, { key: "analysis", label: "待分析" },
  { key: "dispatch", label: "待挑選／派送" }, { key: "error", label: "處理異常" },
];

function completionWarnings(entry: EnglishImageEntry): string[] {
  const failed = entry.vocabForgeSyncStates.filter((item) => item.status === "failed").length;
  const pending = entry.vocabForgeSyncStates.filter((item) => item.status === "pending_sync").length;
  return [failed ? `${failed} 個 VocabForge 單字同步失敗` : "", pending ? `${pending} 個 VocabForge 單字尚待確認` : "", entry.analysisStatus === "failed" ? "AI 分析仍為失敗狀態" : ""].filter(Boolean);
}

function englishRecordLabel(route: EnglishImageRoute): string {
  if (route === "classroom") return "課堂回答整理";
  if (route === "reading") return "英文閱讀摘要";
  return "英文事件紀錄";
}

function analysisLabel(entry: EnglishImageEntry): string {
  if (entry.analysisStatus === "completed") return "AI 已完成";
  if (entry.analysisStatus === "needs-review") return "需要確認";
  if (entry.analysisStatus === "processing") return "分析中";
  if (entry.analysisStatus === "failed") return "分析失敗";
  return "尚未分析";
}

function contextRoomCopy(route: EnglishImageRoute) {
  if (route === "classroom") return { heading: "建立課堂練習", materialLabel: "課堂／主題", materialPlaceholder: "例如：英文課堂・工作描述", eventLabel: "這次課堂任務", eventPlaceholder: "例如：使用三種時態介紹工作" };
  if (route === "game") return { heading: "建立遊戲事件", materialLabel: "素材專案／遊戲名稱", materialPlaceholder: "例如：Animal Crossing", eventLabel: "這次事件名稱", eventPlaceholder: "例如：評論角色的穿搭" };
  if (route === "reading") return { heading: "加入閱讀批次", materialLabel: "素材專案／書名或文章", materialPlaceholder: "例如：Magic Tree House #1", eventLabel: "本次章節／閱讀範圍", eventPlaceholder: "例如：Chapter 1–2" };
  return { heading: "建立生活情境", materialLabel: "生活情境／主題", materialPlaceholder: "例如：按摩工作英文", eventLabel: "這次事件名稱", eventPlaceholder: "例如：提醒客人注意腳部水泡" };
}

type ContextCandidate = { key: string; text: string; meaning: string; usage: string; kind: "chunk" | "pattern" | "repair" | "usage" };
type ContextUnit = { id: string; label: string; learningGoal: string; status: string; position: number };
type ContextProject = { id: string; type: string; title: string; batchCount: number; latestBatchLabel: string; units: ContextUnit[] };
type ContextCapability = { mode: "v2" | "v1"; supportsExistingUnit: boolean; imageProxyReady: boolean };
type ContextDispatchDraft = { entryId: string; contractMode: "v2" | "v1"; projectMode: "create" | "existing"; materialId: string; materialTitle: string; projectType: string; unitMode: "create" | "existing"; unitId: string; eventTitle: string; crossTypeConfirmed: boolean; candidateKeys: string[]; candidates: ContextCandidate[]; projects: ContextProject[]; capability: ContextCapability };
type VocabCandidate = { key: string; expression: string; meaning: string; origin: "source" | "extension"; recommendationReason: string };
type VocabBook = { name: string; count: number; source: "postgres" | "notion"; updatedAt: string; countDefinition: "focus_deck_membership" };
type VocabDispatchDraft = { entryId: string; vocabBook: string; candidateKeys: string[]; candidates: VocabCandidate[]; exportedKeys: string[]; syncStates: { key: string; status: "pending_sync" | "synced" | "already_exists" | "failed"; lastError: string }[]; books: VocabBook[] };

const CONTEXT_KIND_LABEL: Record<ContextCandidate["kind"], string> = { chunk: "片語／語塊", pattern: "句型", repair: "修復策略", usage: "用法／語氣" };

function EnglishImageAsset({ entry, index, variant }: { entry: EnglishImageEntry; index: number; variant: "thumbnail" | "full" }) {
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const src = `/api/dojo/english-images/image?id=${encodeURIComponent(entry.id)}&index=${index}&retry=${attempt}`;
  const retry = () => { setLoaded(false); setFailed(false); setAttempt((value) => value + 1); };
  return <div className={`english-image-asset ${variant}`}>
    {!loaded && !failed && <span className="english-image-loading">圖片載入中…</span>}
    {failed ? <div className="english-image-load-error"><span>圖片載入失敗</span>{variant === "thumbnail" ? <span role="button" tabIndex={0} onClick={(event) => { event.stopPropagation(); retry(); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); retry(); } }}>重試</span> : <button onClick={retry}>重試</button>}</div> : <Image key={`${entry.id}-${index}-${attempt}`} src={src} alt={`${entry.title} ${index + 1}`} width={variant === "thumbnail" ? 320 : 1200} height={variant === "thumbnail" ? 220 : 900} sizes={variant === "thumbnail" ? "(max-width: 520px) 104px, 140px" : "(max-width: 720px) 100vw, 720px"} loading="lazy" unoptimized={variant === "full"} onLoad={() => setLoaded(true)} onError={() => setFailed(true)} />}
  </div>;
}

function DispatchBadges({ entry }: { entry: EnglishImageEntry }) {
  const failures = entry.vocabForgeSyncStates.filter((item) => item.status === "failed").length;
  const destinations = entry.contextRoomLinks.filter((link) => link.status === "synced").length || (entry.contextRoomExport ? 1 : 0);
  return <div className="english-image-destinations"><span>{entry.attachments.length} 張圖片</span>{entry.status === "organized" && <span className="is-organized">✓ 已完成整理</span>}<span>{entry.vocabForgeExports.length ? `VF 已同步 ${entry.vocabForgeExports.length} 字` : "VF 尚未派送"}</span>{entry.contextRoomStatus === "idle" || !entry.contextRoomUrl ? <span>語境尚未派送</span> : <a href={entry.contextRoomUrl} target="_blank" rel="noreferrer">語境 {destinations} 個目的地 ↗</a>}{failures > 0 && <span className="is-error">同步失敗 {failures} 字</span>}</div>;
}

export default function EnglishImageInbox() {
  const [entries, setEntries] = useState<EnglishImageEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_TABS)[number]["key"]>("inbox");
  const [routeFilter, setRouteFilter] = useState<(typeof ROUTES)[number]["key"]>("all");
  const [stageFilter, setStageFilter] = useState<EnglishImageStage>("all");
  const [sort, setSort] = useState<EnglishImageSort>("captured-desc");
  const [query, setQuery] = useState("");
  const [visibleWindow, setVisibleWindow] = useState({ key: "", count: PAGE_SIZE });
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<EnglishImageEntry | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [contextDraft, setContextDraft] = useState<ContextDispatchDraft | null>(null);
  const [vocabDraft, setVocabDraft] = useState<VocabDispatchDraft | null>(null);
  const [completionPromptId, setCompletionPromptId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [deepLinkMessage, setDeepLinkMessage] = useState("");
  const [targetEntryId, setTargetEntryId] = useState("");

  const load = useCallback(async () => {
    try {
      const result = await json<{ entries: EnglishImageEntry[] }>(await fetch("/api/dojo/english-images", { cache: "no-store" }));
      setEntries(result.entries);
      const requestedId = new URLSearchParams(window.location.search).get("englishImageId")?.trim() || "";
      setTargetEntryId(requestedId);
      if (requestedId) {
        const target = result.entries.find((entry) => entry.id === requestedId);
        if (target) { setSelectedEntryId(target.id); setCurrentImageIndex(0); setDeepLinkMessage("已從 LINE 開啟指定素材；不受目前篩選與分頁影響。"); }
        else setDeepLinkMessage("找不到 LINE 指定的英文素材；它可能已被移除，或連結已失效。");
      }
    }
    catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
    finally { setLoaded(true); }
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);

  const counts = useMemo(() => ({ inbox: entries.filter((entry) => entry.status === "inbox").length, organized: entries.filter((entry) => entry.status === "organized").length, all: entries.length }), [entries]);
  const filtered = useMemo(() => filterAndSortEnglishImages(entries, { status: statusFilter, route: routeFilter, stage: stageFilter, query, sort }), [entries, query, routeFilter, sort, stageFilter, statusFilter]);
  const listFilterKey = `${statusFilter}|${routeFilter}|${stageFilter}|${sort}|${query.normalize("NFKC").trim().toLocaleLowerCase()}`;
  const visibleCount = visibleWindow.key === listFilterKey ? visibleWindow.count : PAGE_SIZE;
  const shown = filtered.slice(0, visibleCount);
  const selectedEntry = selectedEntryId ? entries.find((entry) => entry.id === selectedEntryId) ?? null : null;

  function replaceEntries(updated: EnglishImageEntry[]) { const byId = new Map(updated.map((entry) => [entry.id, entry])); setEntries((old) => old.map((entry) => byId.get(entry.id) ?? entry)); }
  function setVisibleCount(update: (current: number) => number) { setVisibleWindow({ key: listFilterKey, count: update(visibleCount) }); }
  function openEntry(entry: EnglishImageEntry) { setSelectedEntryId(entry.id); setCurrentImageIndex(0); setEditing(null); setDraft(null); setContextDraft(null); setVocabDraft(null); setError(""); setNotice(""); window.requestAnimationFrame(() => document.getElementById("english-image-detail")?.scrollIntoView({ behavior: "smooth", block: "start" })); }
  function closeEntry() { setSelectedEntryId(null); setEditing(null); setDraft(null); setContextDraft(null); setVocabDraft(null); setCompletionPromptId(null); }

  async function setEntryStatus(entry: EnglishImageEntry, status: EnglishImageStatus) {
    if (status === "organized") { const warnings = completionWarnings(entry); if (warnings.length && !window.confirm(`這筆素材仍有以下狀態：\n• ${warnings.join("\n• ")}\n\n仍要完成本次整理嗎？錯誤紀錄會完整保留，也不會自動重試。`)) return; }
    setBusy(entry.id); setError(""); setNotice("");
    try { const result = await json<{ entry: EnglishImageEntry }>(await fetch("/api/dojo/english-images", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: entry.id, action: "setStatus", status }) })); replaceEntries([result.entry]); setSelectedIds((old) => old.filter((id) => id !== entry.id)); setCompletionPromptId(null); setNotice(status === "organized" ? "已完成本次整理；原圖、分析與派送紀錄均已保留。" : "已重新開啟整理；既有資料均已保留。"); }
    catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); } finally { setBusy(null); }
  }

  async function batchComplete() {
    const selected = entries.filter((entry) => selectedIds.includes(entry.id) && entry.status === "inbox"); if (!selected.length) return;
    const warningCount = selected.filter((entry) => completionWarnings(entry).length > 0).length; const warningCopy = warningCount ? `\n其中 ${warningCount} 筆仍有同步待確認或錯誤；紀錄會保留且不會自動重試。` : "";
    if (!window.confirm(`確定將選取的 ${selected.length} 筆素材標記為完成整理嗎？${warningCopy}\n此操作只更新整理狀態。`)) return;
    setBusy("batch"); setError(""); setNotice("");
    try { const result = await json<{ entries: EnglishImageEntry[]; failures: { id: string; error: string }[]; succeeded: number; failed: number }>(await fetch("/api/dojo/english-images", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "batchSetStatus", ids: selected.map((entry) => entry.id), status: "organized" }) })); replaceEntries(result.entries); const succeededIds = new Set(result.entries.map((entry) => entry.id)); setSelectedIds((old) => old.filter((id) => !succeededIds.has(id))); setNotice(`批次完成：成功 ${result.succeeded} 筆，失敗 ${result.failed} 筆。`); if (result.failures.length) setError(result.failures.map((item) => `${item.id}：${item.error}`).join("；")); }
    catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); } finally { setBusy(null); }
  }

  async function save(analyzeAfterSave = false) {
    if (!draft) return; setBusy(draft.id); setError("");
    try { const result = await json<{ entry: EnglishImageEntry }>(await fetch("/api/dojo/english-images", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: draft.id, entry: draft }) })); let saved = result.entry; if (analyzeAfterSave && saved.route !== "pending") saved = (await json<{ entry: EnglishImageEntry }>(await fetch("/api/dojo/english-images", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: saved.id, action: "analyze" }) }))).entry; replaceEntries([saved]); setEditing(null); setDraft(null); }
    catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); } finally { setBusy(null); }
  }

  async function action(entry: EnglishImageEntry, name: "analyze" | "moveToCapture") {
    if (name === "analyze" && entry.analysisAttempts > 0 && !window.confirm("重新分析會再次使用 API 額度，確定要繼續嗎？")) return;
    if (name === "moveToCapture" && !window.confirm("確定將這張英文影像轉成一般野採素材？原圖與已產生的文字仍會保留。")) return;
    setBusy(entry.id); setError("");
    try { const result = await json<{ entry?: EnglishImageEntry }>(await fetch("/api/dojo/english-images", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: entry.id, action: name }) })); if (name === "moveToCapture") { setEntries((old) => old.filter((item) => item.id !== entry.id)); closeEntry(); } else if (result.entry) replaceEntries([result.entry]); }
    catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); } finally { setBusy(null); }
  }

  async function routeAndAnalyze(entry: EnglishImageEntry, route: EnglishImageLearningRoute) {
    if (entry.analysisAttempts > 0 && !window.confirm("這張圖片曾經分析過；再次執行會使用 API 額度，確定要繼續嗎？")) return;
    setBusy(entry.id); setError("");
    try { const result = await json<{ entry: EnglishImageEntry }>(await fetch("/api/dojo/english-images", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: entry.id, action: "routeAndAnalyze", route }) })); replaceEntries([result.entry]); }
    catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); } finally { setBusy(null); }
  }

  async function openContextDispatch(entry: EnglishImageEntry) {
    setBusy(entry.id); setError("");
    try { const result = await json<{ candidates: ContextCandidate[]; projects: ContextProject[]; capability: ContextCapability; defaults: { materialId: string; materialTitle: string; eventTitle: string } }>(await fetch(`/api/dojo/english-images/context-room?id=${encodeURIComponent(entry.id)}`, { cache: "no-store" })); const selectedProject = result.projects.find((item) => item.id === result.defaults.materialId); setContextDraft({ entryId: entry.id, contractMode: result.capability.mode, projectMode: selectedProject ? "existing" : "create", materialId: selectedProject?.id || "", materialTitle: selectedProject?.title || result.defaults.materialTitle, projectType: selectedProject?.type || "", unitMode: "create", unitId: "", eventTitle: result.defaults.eventTitle, crossTypeConfirmed: false, candidateKeys: result.candidates.map((item) => item.key).slice(0, 3), candidates: result.candidates, projects: result.projects, capability: result.capability }); setVocabDraft(null); }
    catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); } finally { setBusy(null); }
  }

  async function openVocabDispatch(entry: EnglishImageEntry) {
    setBusy(entry.id); setError("");
    try { const result = await json<{ candidates: VocabCandidate[]; books: VocabBook[]; exports: { key: string; vocabBook: string }[]; syncStates: VocabDispatchDraft["syncStates"] }>(await fetch(`/api/dojo/english-images/vocabforge?id=${encodeURIComponent(entry.id)}`, { cache: "no-store" })); setVocabDraft({ entryId: entry.id, vocabBook: "", candidateKeys: [], candidates: result.candidates, exportedKeys: result.exports.map((item) => item.key), syncStates: result.syncStates, books: result.books }); setContextDraft(null); }
    catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); } finally { setBusy(null); }
  }

  async function sendVocabDispatch() {
    if (!vocabDraft) return; setBusy(vocabDraft.entryId); setError("");
    try { const requestedCount = vocabDraft.candidateKeys.length; const result = await json<{ entry: EnglishImageEntry; failures: { expression: string; lastError: string }[] }>(await fetch("/api/dojo/english-images/vocabforge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: vocabDraft.entryId, vocabBook: vocabDraft.vocabBook, candidateKeys: vocabDraft.candidateKeys }) })); replaceEntries([result.entry]); if (result.failures.length) setError(`${result.failures.length} 個單字尚未同步，可保留候選後重試：${result.failures.map((item) => item.expression).join("、")}`); if (result.failures.length < requestedCount) setCompletionPromptId(result.entry.id); setVocabDraft(null); }
    catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); } finally { setBusy(null); }
  }

  async function sendContextDispatch() {
    if (!contextDraft) return; setBusy(contextDraft.entryId); setError("");
    try { const result = await json<{ entry: EnglishImageEntry }>(await fetch("/api/dojo/english-images/context-room", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: contextDraft.entryId, contractMode: contextDraft.contractMode, projectMode: contextDraft.projectMode, materialId: contextDraft.materialId, materialTitle: contextDraft.materialTitle, projectType: contextDraft.projectType, unitMode: contextDraft.unitMode, unitId: contextDraft.unitId, eventTitle: contextDraft.eventTitle, crossTypeConfirmed: contextDraft.crossTypeConfirmed, candidateKeys: contextDraft.candidateKeys }) })); replaceEntries([result.entry]); setCompletionPromptId(result.entry.id); setNotice("素材已安全派送；原始圖片與既有目的地紀錄均已保留。"); setContextDraft(null); }
    catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); } finally { setBusy(null); }
  }

  function renderVocabDispatch(entry: EnglishImageEntry) {
    if (vocabDraft?.entryId !== entry.id) return null;
    return <div className="english-image-vocab-dispatch"><div className="english-image-context-head"><div><small>VocabForge</small><h5>挑選要記住的單字</h5></div><button className="text-link" onClick={() => setVocabDraft(null)}>關閉</button></div><label>選擇豆倉<select className="field" value={vocabDraft.vocabBook} onChange={(event) => setVocabDraft({ ...vocabDraft, vocabBook: event.target.value })}><option value="">請選擇要放入的豆倉</option>{vocabDraft.books.map((book) => <option key={book.name} value={book.name}>{book.name}（正式詞庫歸屬 {book.count}）</option>)}</select></label><p className="muted-note">{vocabDraft.books[0]?.source === "postgres" ? "數量是 VocabForge PostgreSQL 正式詞庫的豆倉歸屬；同一個字可同時計入多個豆倉。" : "目前由 Notion 備援計算豆倉歸屬；正式存在仍以 VocabForge 接收結果為準。"}</p><fieldset><legend>選擇真正想複習的單字（每筆素材最多 5 字）</legend>{vocabDraft.candidates.length === 0 ? <p className="muted-note">目前沒有可派送的單一英文單字。</p> : vocabDraft.candidates.map((candidate) => { const exported = vocabDraft.exportedKeys.includes(candidate.key); const syncState = vocabDraft.syncStates.find((item) => item.key === candidate.key); const checked = vocabDraft.candidateKeys.includes(candidate.key); const remaining = Math.max(0, 5 - vocabDraft.exportedKeys.length); return <label className={`english-image-context-choice ${exported ? "is-exported" : ""}`} key={candidate.key}><input type="checkbox" checked={checked || exported} disabled={exported || (!checked && vocabDraft.candidateKeys.length >= remaining)} onChange={(event) => setVocabDraft({ ...vocabDraft, candidateKeys: event.target.checked ? [...vocabDraft.candidateKeys, candidate.key] : vocabDraft.candidateKeys.filter((key) => key !== candidate.key) })} /><span><small>{exported ? "已同步" : syncState?.status === "failed" ? "同步失敗・可重試" : syncState?.status === "pending_sync" ? "等待確認" : candidate.origin === "extension" ? "延伸推薦・非原文" : "原素材候選"}</small><b>{candidate.expression}</b>{candidate.meaning && <em>{candidate.meaning}</em>}{candidate.recommendationReason && <i>{candidate.recommendationReason}</i>}{syncState?.status === "failed" && syncState.lastError && <i>{syncState.lastError}</i>}</span></label>; })}</fieldset><p className="muted-note">只送出這次勾選的單字；已存在的資料不會建立重複卡片。</p><button className="primary" disabled={busy === entry.id || !vocabDraft.vocabBook || vocabDraft.candidateKeys.length === 0} onClick={() => void sendVocabDispatch()}>{busy === entry.id ? "派送中…" : `送出 ${vocabDraft.candidateKeys.length} 字至 VocabForge`}</button></div>;
  }

  function renderContextDispatch(entry: EnglishImageEntry) {
    if (contextDraft?.entryId !== entry.id) return null;
    const form = contextRoomCopy(entry.route);
    const project = contextDraft.projects.find((item) => item.id === contextDraft.materialId);
    const activeUnits = project?.units.filter((unit) => unit.status === "active") ?? [];
    const expectedType = entry.route === "game" ? "game_journey" : entry.route === "classroom" ? "class_topic" : entry.route === "reading" ? "reading" : "custom";
    const crossType = contextDraft.projectMode === "existing" && Boolean(project?.type) && project?.type !== expectedType;
    const canSend = contextDraft.materialTitle.trim() && contextDraft.eventTitle.trim() && (!crossType || contextDraft.crossTypeConfirmed) && (contextDraft.unitMode !== "existing" || Boolean(contextDraft.unitId));
    return <div className="english-image-context-dispatch">
      <div className="english-image-context-head"><div><small>語境修習室・{contextDraft.contractMode === "v2" ? "Source Handoff v2" : "相容模式 v1"}</small><h5>{form.heading}</h5></div><button className="text-link" onClick={() => setContextDraft(null)}>關閉</button></div>
      {contextDraft.contractMode === "v1" && <p className="english-image-capability-warning">接收端尚未確認 v2 capability。本次只提供舊版「新 Project／既有 Project＋新學習單元」，不會假裝可加入既有單元。</p>}
      <label>學習專案<select className="field" value={contextDraft.projectMode === "create" ? "__new__" : contextDraft.materialId} onChange={(event) => { const materialId = event.target.value === "__new__" ? "" : event.target.value; const selected = contextDraft.projects.find((item) => item.id === materialId); setContextDraft({ ...contextDraft, projectMode: selected ? "existing" : "create", materialId, materialTitle: selected?.title || contextDraft.materialTitle, projectType: selected?.type || "", unitMode: "create", unitId: "", crossTypeConfirmed: false }); }}><option value="__new__">建立新的學習專案</option>{contextDraft.projects.map((item) => <option key={item.id} value={item.id}>加入「{item.title}」（{item.batchCount} 單元）</option>)}</select></label>
      <label>{form.materialLabel}<input className="field" value={contextDraft.materialTitle} disabled={contextDraft.projectMode === "existing"} onChange={(event) => setContextDraft({ ...contextDraft, materialTitle: event.target.value })} placeholder={form.materialPlaceholder} /></label>
      {contextDraft.projectMode === "existing" && contextDraft.contractMode === "v2" && <label>學習單元<select className="field" value={contextDraft.unitMode === "existing" ? contextDraft.unitId : "__new__"} onChange={(event) => { const unitId = event.target.value === "__new__" ? "" : event.target.value; const unit = activeUnits.find((item) => item.id === unitId); setContextDraft({ ...contextDraft, unitMode: unit ? "existing" : "create", unitId, eventTitle: unit?.label || contextDraft.eventTitle }); }}><option value="__new__">建立新的學習單元</option>{project?.units.map((unit) => <option key={unit.id} value={unit.id} disabled={unit.status !== "active"}>{unit.label}{unit.status !== "active" ? "（已封存）" : unit.learningGoal ? `｜${unit.learningGoal.slice(0, 42)}` : ""}</option>)}</select></label>}
      <label>{contextDraft.unitMode === "existing" ? "選定的學習單元" : form.eventLabel}<input className="field" value={contextDraft.eventTitle} disabled={contextDraft.unitMode === "existing"} onChange={(event) => setContextDraft({ ...contextDraft, eventTitle: event.target.value })} placeholder={form.eventPlaceholder} /></label>
      {crossType && <label className="english-image-cross-type"><input type="checkbox" checked={contextDraft.crossTypeConfirmed} onChange={(event) => setContextDraft({ ...contextDraft, crossTypeConfirmed: event.target.checked })}/><span>來源分類與「{project?.title}」的專案類型不同。我確認仍要派送，且不會改變 Project type。</span></label>}
      {entry.contextRoomLinks.length > 0 && <div className="english-image-context-history"><b>既有派送目的地</b>{entry.contextRoomLinks.map((link) => <div key={link.dispatchId}><span>{link.projectTitle || link.projectId} → {link.unitTitle || link.unitId}</span><small className={`status-${link.status}`}>{link.status === "synced" ? "已接收" : link.status === "unknown" ? "結果未知・再次送出會安全重試" : link.status === "failed" ? "失敗・可重試" : "派送中"}</small>{link.lastError && <em>{link.lastError}</em>}</div>)}</div>}
      <fieldset><legend>選擇真正想留下的表達（最多 5 項）</legend>{contextDraft.candidates.length === 0 ? <p className="muted-note">目前沒有可派送的片語、句型或用法。</p> : contextDraft.candidates.map((candidate) => { const checked = contextDraft.candidateKeys.includes(candidate.key); return <label className="english-image-context-choice" key={candidate.key}><input type="checkbox" checked={checked} disabled={!checked && contextDraft.candidateKeys.length >= 5} onChange={(event) => setContextDraft({ ...contextDraft, candidateKeys: event.target.checked ? [...contextDraft.candidateKeys, candidate.key] : contextDraft.candidateKeys.filter((key) => key !== candidate.key) })}/><span><small>{CONTEXT_KIND_LABEL[candidate.kind]}</small><b>{candidate.text}</b>{candidate.meaning && <em>{candidate.meaning}</em>}{candidate.usage && <i>{candidate.usage}</i>}</span></label>; })}</fieldset>
      <p className="muted-note">一組 {entry.attachments.length} 張圖片會成為一份 Source Item；未勾選的 AI 建議仍留在野採。</p>
      <button className="primary" disabled={busy === entry.id || !canSend} onClick={() => void sendContextDispatch()}>{busy === entry.id ? "派送中…" : contextDraft.unitMode === "existing" ? "加入既有學習單元" : contextDraft.projectMode === "existing" ? "建立新學習單元並派送" : "建立新專案與學習單元"}</button>
    </div>;
  }

  function renderDetail(entry: EnglishImageEntry) {
    const openEditor = editing === entry.id && draft;
    const attachment = entry.attachments[currentImageIndex] ?? entry.attachments[0];
    return <section id="english-image-detail" className="english-image-detail"><div className="english-image-detail-nav"><button onClick={closeEntry}>← 返回精簡清單</button><span>{entry.status === "organized" ? "已完成素材" : "待處理素材"}</span></div><header className="english-image-detail-head"><div><small>{englishImageRouteLabel(entry.route)}・{entry.capturedAt.slice(0, 10)}</small><h5>{entry.title}</h5><p>{englishImageStageLabel(entry)}</p></div><span className={`analysis-${entry.analysisStatus}`}>{analysisLabel(entry)}</span></header><DispatchBadges entry={entry} />{deepLinkMessage && <p className="english-image-deep-link-note">{deepLinkMessage}</p>}{notice && <p className="form-success">{notice}</p>}{error && <p className="form-error">{error}</p>}{entry.analysisError && <p className="form-error">{entry.analysisError}</p>}
      <details className="english-image-detail-section" open><summary>原始圖片 <span>{entry.attachments.length} 張</span></summary><div className="english-image-viewer"><EnglishImageAsset key={`${entry.id}-${currentImageIndex}`} entry={entry} index={currentImageIndex} variant="full" /><div className="english-image-viewer-meta"><span>第 {currentImageIndex + 1}／{entry.attachments.length} 張{attachment?.batchIndex ? `・批次序號 ${attachment.batchIndex}` : ""}</span><a href={`/api/dojo/english-images/image?id=${encodeURIComponent(entry.id)}&index=${currentImageIndex}`} target="_blank" rel="noreferrer">開啟原圖 ↗</a></div>{entry.attachments.length > 1 && <div className="english-image-viewer-controls"><button disabled={currentImageIndex === 0} onClick={() => setCurrentImageIndex((value) => Math.max(0, value - 1))}>上一張</button><div aria-label="圖片順序">{entry.attachments.map((item, index) => <button className={index === currentImageIndex ? "on" : ""} key={`${item.blockId}-${index}`} onClick={() => setCurrentImageIndex(index)} aria-label={`查看第 ${index + 1} 張`}>{item.batchIndex ?? index + 1}</button>)}</div><button disabled={currentImageIndex === entry.attachments.length - 1} onClick={() => setCurrentImageIndex((value) => Math.min(entry.attachments.length - 1, value + 1))}>下一張</button></div>}</div></details>
      <details className="english-image-detail-section"><summary>{englishRecordLabel(entry.route)} <span>{entry.englishRecord ? "已有內容" : "尚未建立"}</span></summary><p>{entry.englishRecord || "尚無英文事件紀錄。"}</p></details>
      <details className="english-image-detail-section"><summary>中文理解 <span>{entry.chineseExplanation ? "已有內容" : "尚未建立"}</span></summary><p>{entry.chineseExplanation || "尚無中文理解。"}</p></details>
      <details className="english-image-detail-section"><summary>可學詞句 <span>{entry.learningPhrases ? "可查看" : "尚無內容"}</span></summary><p>{entry.learningPhrases || "尚無可學詞句。"}</p></details>
      <details className="english-image-detail-section"><summary>單字候選 <span>{entry.vocabularyCandidates.length || 0} 項結構化候選</span></summary><p>{entry.vocabularyWords || "尚無單字候選。"}</p></details>
      <details className="english-image-detail-section english-image-dispatch-section" open={vocabDraft?.entryId === entry.id}><summary>VocabForge 派送 <span>{entry.vocabForgeExports.length ? `已同步 ${entry.vocabForgeExports.length} 字` : "尚未派送"}</span></summary><div className="english-image-section-body"><button disabled={busy === entry.id || entry.route === "pending" || entry.analysisStatus === "idle"} onClick={() => void openVocabDispatch(entry)}>{busy === entry.id ? "讀取中…" : entry.vocabForgeExports.length ? "查看／繼續選字" : "選擇 VocabForge 單字"}</button>{renderVocabDispatch(entry)}</div></details>
      <details className="english-image-detail-section english-image-dispatch-section" open={contextDraft?.entryId === entry.id}><summary>語境修習室派送 <span>{entry.contextRoomLinks.filter((link) => link.status === "synced").length || (entry.contextRoomExport ? 1 : 0)} 個目的地</span></summary><div className="english-image-section-body"><button disabled={busy === entry.id || entry.route === "pending" || entry.analysisStatus === "idle"} onClick={() => void openContextDispatch(entry)}>{busy === entry.id ? "讀取中…" : entry.contextRoomStatus === "synced" ? "查看目的地／再次派送" : "選擇學習專案與單元"}</button>{renderContextDispatch(entry)}</div></details>
      <details className="english-image-detail-section" open={Boolean(openEditor)}><summary>素材整理 <span>分類與文字修訂</span></summary>{!openEditor ? <div className="english-image-section-body"><button onClick={() => { setEditing(entry.id); setDraft(structuredClone(entry)); }}>編輯素材內容</button></div> : <div className="english-image-editor"><label>類型</label><select className="field" value={draft.route} onChange={(event) => setDraft({ ...draft, route: event.target.value as EnglishImageRoute })}><option value="pending">待分類</option><option value="game">遊戲英文</option><option value="daily">英文日常</option><option value="classroom">課堂英文</option><option value="reading">閱讀英文</option></select><label>標題／作品或場景</label><input className="field" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /><label>情境補充</label><textarea className="field" rows={2} value={draft.contextNote} onChange={(event) => setDraft({ ...draft, contextNote: event.target.value })} /><label>圖片英文原文</label><textarea className="field" rows={5} value={draft.ocrText} onChange={(event) => setDraft({ ...draft, ocrText: event.target.value })} /><label>{englishRecordLabel(draft.route)}</label><textarea className="field" rows={4} value={draft.englishRecord} onChange={(event) => setDraft({ ...draft, englishRecord: event.target.value })} /><label>中文解釋</label><textarea className="field" rows={4} value={draft.chineseExplanation} onChange={(event) => setDraft({ ...draft, chineseExplanation: event.target.value })} /><label>可學詞句</label><textarea className="field" rows={5} value={draft.learningPhrases} onChange={(event) => setDraft({ ...draft, learningPhrases: event.target.value })} /><label>單字候選</label><textarea className="field" rows={5} value={draft.vocabularyWords} onChange={(event) => setDraft({ ...draft, vocabularyWords: event.target.value })} /><div className="english-image-actions"><button onClick={() => { setEditing(null); setDraft(null); }}>取消</button><button className="primary" disabled={busy === entry.id} onClick={() => void save(entry.route === "pending" && draft.route !== "pending")}>{busy === entry.id ? "儲存中…" : entry.route === "pending" && draft.route !== "pending" ? "儲存並分析" : "儲存"}</button></div></div>}</details>
      {entry.route === "pending" && <div className="english-image-route-actions"><button className="primary" disabled={busy === entry.id} onClick={() => void routeAndAnalyze(entry, "game")}>遊戲英文並分析</button><button disabled={busy === entry.id} onClick={() => void routeAndAnalyze(entry, "daily")}>英文日常並分析</button><button disabled={busy === entry.id} onClick={() => void routeAndAnalyze(entry, "classroom")}>課堂英文並分析</button><button disabled={busy === entry.id} onClick={() => void routeAndAnalyze(entry, "reading")}>閱讀英文並分析</button></div>}
      {completionPromptId === entry.id && entry.status === "inbox" && <div className="english-image-completion-prompt"><div><small>{completionWarnings(entry).length ? "派送請求已結束・仍有狀態需確認" : "派送已完成"}</small><b>這筆素材還需要其他處理嗎？</b></div><div className="english-image-actions"><button className="primary" disabled={busy === entry.id} onClick={() => void setEntryStatus(entry, "organized")}>✓ 完成整理</button><button onClick={() => setCompletionPromptId(null)}>稍後繼續</button></div></div>}
      <div className="english-image-detail-actions"><button disabled={busy === entry.id || entry.route === "pending"} onClick={() => void action(entry, "analyze")}>{busy === entry.id ? "處理中…" : entry.analysisAttempts ? "重新分析" : "AI 分析"}</button><button className="text-link" disabled={busy === entry.id} onClick={() => void action(entry, "moveToCapture")}>轉為一般素材</button>{entry.status === "inbox" ? <button className="primary" disabled={busy === entry.id} onClick={() => void setEntryStatus(entry, "organized")}>✓ 完成本次整理</button> : <button disabled={busy === entry.id} onClick={() => void setEntryStatus(entry, "inbox")}>重新開啟整理</button>}</div>{entry.analyzedAt && <small className="english-image-usage">{entry.analysisModel}・{entry.inputTokens + entry.outputTokens} tokens・約 US${entry.estimatedCostUsd.toFixed(4)}</small>}
    </section>;
  }

  return <div className="english-image-inbox learning-resources"><div className="subsection-title"><div><span className="eyebrow">野採・LINE 專屬入口</span><h4>英文影像匣</h4></div><span>{counts.inbox} 待處理</span></div><p className="muted-note">先從精簡清單選擇素材，再進入詳情查看圖片、內容與學習派送。</p>{deepLinkMessage && !selectedEntry && <p className={`english-image-deep-link-note ${targetEntryId && !entries.some((entry) => entry.id === targetEntryId) ? "is-error" : ""}`}>{deepLinkMessage}</p>}{selectedEntry ? renderDetail(selectedEntry) : <><div className="english-image-status-tabs" role="tablist" aria-label="英文影像整理狀態">{STATUS_TABS.map((item) => <button role="tab" aria-selected={statusFilter === item.key} key={item.key} className={statusFilter === item.key ? "on" : ""} onClick={() => setStatusFilter(item.key)}>{item.label}<span>{counts[item.key]}</span></button>)}</div><div className="english-image-filter-panel"><label className="english-image-search"><span>搜尋素材</span><input className="field" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="標題、來源、情境或英文紀錄" /></label><label><span>處理階段</span><select className="field" value={stageFilter} onChange={(event) => setStageFilter(event.target.value as EnglishImageStage)}>{STAGES.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label><label><span>排序</span><select className="field" value={sort} onChange={(event) => setSort(event.target.value as EnglishImageSort)}><option value="captured-desc">最新擷取優先</option><option value="captured-asc">最舊擷取優先</option><option value="updated-desc">最近更新優先</option></select></label></div><div className="english-image-tabs" aria-label="英文類別">{ROUTES.map((item) => <button key={item.key} className={routeFilter === item.key ? "on" : ""} onClick={() => setRouteFilter(item.key)}>{item.label}</button>)}</div><div className="english-image-list-summary"><span>符合 {filtered.length} 筆・目前顯示 {shown.length} 筆</span>{(query || routeFilter !== "all" || stageFilter !== "all") && <button className="text-link" onClick={() => { setQuery(""); setRouteFilter("all"); setStageFilter("all"); }}>清除篩選</button>}</div>{statusFilter === "inbox" && <div className="english-image-batch-bar"><span>已選取 {selectedIds.length} 筆</span><button disabled={!selectedIds.length || busy === "batch"} onClick={() => void batchComplete()}>{busy === "batch" ? "批次處理中…" : `批次完成整理（${selectedIds.length}）`}</button></div>}{notice && <p className="form-success">{notice}</p>}{error && <p className="form-error">{error}</p>}{!loaded ? <p className="muted-note">正在讀取英文素材…</p> : shown.length === 0 ? <p className="muted-note">目前沒有符合條件的圖片。</p> : <div className="english-image-compact-list">{shown.map((entry) => <article className="english-image-compact-card" key={entry.id}>{statusFilter === "inbox" && <label className="english-image-select"><input type="checkbox" checked={selectedIds.includes(entry.id)} onChange={(event) => setSelectedIds((old) => event.target.checked ? [...old, entry.id] : old.filter((id) => id !== entry.id))} /><span className="sr-only">選取 {entry.title}</span></label>}<button className="english-image-thumb-button" onClick={() => openEntry(entry)} aria-label={`開啟 ${entry.title} 詳情`}><EnglishImageAsset entry={entry} index={0} variant="thumbnail" /><span>{entry.attachments.length} 張</span></button><div className="english-image-compact-main"><div className="english-image-compact-title"><div><small>{englishImageRouteLabel(entry.route)}・{entry.capturedAt.slice(0, 10)}</small><h5>{entry.title}</h5></div><span className={`stage-${entry.analysisStatus}`}>{englishImageStageLabel(entry)}</span></div><div className="english-image-compact-status"><span>{analysisLabel(entry)}</span><span>{entry.vocabForgeExports.length ? `VF ${entry.vocabForgeExports.length} 字` : "VF 未派送"}</span><span>{entry.contextRoomStatus === "synced" ? "語境已派送" : "語境未派送"}</span></div><p>下一步：{entry.route === "pending" ? "選擇英文類別並分析" : entry.analysisStatus === "idle" || entry.analysisStatus === "processing" ? "完成 AI 分析" : "查看內容並選擇學習派送"}</p><div className="english-image-compact-actions"><button className="primary" onClick={() => openEntry(entry)}>{entry.status === "organized" ? "查看詳情" : "繼續處理"}</button>{entry.status === "inbox" ? <button disabled={busy === entry.id} onClick={() => void setEntryStatus(entry, "organized")}>完成整理</button> : <button disabled={busy === entry.id} onClick={() => void setEntryStatus(entry, "inbox")}>重新開啟整理</button>}</div></div></article>)}</div>}{shown.length < filtered.length && <button className="english-image-load-more" onClick={() => setVisibleCount((value) => value + PAGE_SIZE)}>載入更多（尚有 {filtered.length - shown.length} 筆）</button>}<p className="english-image-performance-note">清單每次最多新增 {PAGE_SIZE} 筆卡片，且每筆只載入一張代表縮圖；搜尋與篩選目前仍使用本次取得的完整資料清單。</p></>}</div>;
}
