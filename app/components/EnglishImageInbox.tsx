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

async function json<T>(response: Response): Promise<T> {
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((result as { error?: string }).error ?? `操作失敗（${response.status}）`);
  return result as T;
}

const ROUTES: { key: "all" | EnglishImageRoute; label: string }[] = [
  { key: "all", label: "全部" }, { key: "pending", label: "待分類" },
  { key: "game", label: "遊戲英文" }, { key: "daily", label: "英文日常" }, { key: "classroom", label: "課堂英文" },
  { key: "reading", label: "閱讀英文" },
];

const STATUS_TABS: { key: "inbox" | "organized" | "all"; label: string }[] = [
  { key: "inbox", label: "待處理" },
  { key: "organized", label: "已完成" },
  { key: "all", label: "全部" },
];

function completionWarnings(entry: EnglishImageEntry): string[] {
  const failed = entry.vocabForgeSyncStates.filter((item) => item.status === "failed").length;
  const pending = entry.vocabForgeSyncStates.filter((item) => item.status === "pending_sync").length;
  return [
    failed ? `${failed} 個 VocabForge 單字同步失敗` : "",
    pending ? `${pending} 個 VocabForge 單字尚待確認` : "",
    entry.analysisStatus === "failed" ? "AI 分析仍為失敗狀態" : "",
  ].filter(Boolean);
}

function englishRecordLabel(route: EnglishImageRoute): string {
  if (route === "classroom") return "課堂回答整理";
  if (route === "reading") return "英文閱讀摘要";
  return "英文事件紀錄";
}

function contextRoomCopy(route: EnglishImageRoute) {
  if (route === "classroom") return {
    heading: "建立課堂練習", materialLabel: "課堂／主題", materialPlaceholder: "例如：英文課堂・工作描述",
    eventLabel: "這次課堂任務", eventPlaceholder: "例如：使用三種時態介紹工作",
  };
  if (route === "game") return {
    heading: "建立遊戲事件", materialLabel: "素材專案／遊戲名稱", materialPlaceholder: "例如：Animal Crossing",
    eventLabel: "這次事件名稱", eventPlaceholder: "例如：評論角色的穿搭",
  };
  if (route === "reading") return {
    heading: "加入閱讀批次", materialLabel: "素材專案／書名或文章", materialPlaceholder: "例如：Magic Tree House #1",
    eventLabel: "本次章節／閱讀範圍", eventPlaceholder: "例如：Chapter 1–2",
  };
  return {
    heading: "建立生活情境", materialLabel: "生活情境／主題", materialPlaceholder: "例如：按摩工作英文",
    eventLabel: "這次事件名稱", eventPlaceholder: "例如：提醒客人注意腳部水泡",
  };
}

type ContextCandidate = {
  key: string;
  text: string;
  meaning: string;
  usage: string;
  kind: "chunk" | "pattern" | "repair" | "usage";
};

type ContextProject = {
  id: string;
  title: string;
  batchCount: number;
  latestBatchLabel: string;
};

type ContextDispatchDraft = {
  entryId: string;
  materialId: string;
  materialTitle: string;
  eventTitle: string;
  candidateKeys: string[];
  candidates: ContextCandidate[];
  projects: ContextProject[];
};

type VocabCandidate = {
  key: string;
  expression: string;
  meaning: string;
  origin: "source" | "extension";
  recommendationReason: string;
};

type VocabBook = {
  name: string;
  count: number;
  source: "postgres" | "notion";
  updatedAt: string;
  countDefinition: "focus_deck_membership";
};

type VocabDispatchDraft = {
  entryId: string;
  vocabBook: string;
  candidateKeys: string[];
  candidates: VocabCandidate[];
  exportedKeys: string[];
  syncStates: { key: string; status: "pending_sync" | "synced" | "already_exists" | "failed"; lastError: string }[];
  books: VocabBook[];
};

const CONTEXT_KIND_LABEL: Record<ContextCandidate["kind"], string> = {
  chunk: "片語／語塊",
  pattern: "句型",
  repair: "修復策略",
  usage: "用法／語氣",
};

export default function EnglishImageInbox() {
  const [entries, setEntries] = useState<EnglishImageEntry[]>([]);
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_TABS)[number]["key"]>("inbox");
  const [filter, setFilter] = useState<(typeof ROUTES)[number]["key"]>("all");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<EnglishImageEntry | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [contextDraft, setContextDraft] = useState<ContextDispatchDraft | null>(null);
  const [vocabDraft, setVocabDraft] = useState<VocabDispatchDraft | null>(null);
  const [completionPromptId, setCompletionPromptId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [targetEntryId] = useState(() => typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("englishImageId")?.trim() || "");
  const load = useCallback(async () => {
    try { setEntries((await json<{ entries: EnglishImageEntry[] }>(await fetch("/api/dojo/english-images", { cache: "no-store" }))).entries); }
    catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  useEffect(() => {
    if (!targetEntryId || !entries.some((entry) => entry.id === targetEntryId)) return;
    const timer = window.setTimeout(() => {
      document.getElementById(`english-image-${targetEntryId}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [entries, targetEntryId]);
  const counts = useMemo(() => ({
    inbox: entries.filter((entry) => entry.status === "inbox").length,
    organized: entries.filter((entry) => entry.status === "organized").length,
    all: entries.length,
  }), [entries]);
  const shown = useMemo(() => entries.filter((entry) => (
    (statusFilter === "all" || entry.status === statusFilter) && (filter === "all" || entry.route === filter)
  )), [entries, filter, statusFilter]);

  function replaceEntries(updated: EnglishImageEntry[]) {
    const byId = new Map(updated.map((entry) => [entry.id, entry]));
    setEntries((old) => old.map((entry) => byId.get(entry.id) ?? entry));
  }

  async function setEntryStatus(entry: EnglishImageEntry, status: EnglishImageStatus) {
    if (status === "organized") {
      const warnings = completionWarnings(entry);
      if (warnings.length && !window.confirm(`這筆素材仍有以下狀態：\n• ${warnings.join("\n• ")}\n\n仍要完成本次整理嗎？錯誤紀錄會完整保留，也不會自動重試。`)) return;
    }
    setBusy(entry.id); setError(""); setNotice("");
    try {
      const result = await json<{ entry: EnglishImageEntry }>(await fetch("/api/dojo/english-images", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: entry.id, action: "setStatus", status }),
      }));
      replaceEntries([result.entry]);
      setSelectedIds((old) => old.filter((id) => id !== entry.id));
      setCompletionPromptId(null);
      setNotice(status === "organized" ? "已完成本次整理；原圖、分析與派送紀錄均已保留。" : "已重新開啟整理；既有資料均已保留。");
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
    finally { setBusy(null); }
  }

  async function batchComplete() {
    const selected = entries.filter((entry) => selectedIds.includes(entry.id) && entry.status === "inbox");
    if (!selected.length) return;
    const warningCount = selected.filter((entry) => completionWarnings(entry).length > 0).length;
    const warningCopy = warningCount ? `\n其中 ${warningCount} 筆仍有同步待確認或錯誤；紀錄會保留且不會自動重試。` : "";
    if (!window.confirm(`確定將選取的 ${selected.length} 筆素材標記為完成整理嗎？${warningCopy}\n此操作只更新整理狀態。`)) return;
    setBusy("batch"); setError(""); setNotice("");
    try {
      const result = await json<{ entries: EnglishImageEntry[]; failures: { id: string; error: string }[]; succeeded: number; failed: number }>(await fetch("/api/dojo/english-images", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "batchSetStatus", ids: selected.map((entry) => entry.id), status: "organized" }),
      }));
      replaceEntries(result.entries);
      const succeededIds = new Set(result.entries.map((entry) => entry.id));
      setSelectedIds((old) => old.filter((id) => !succeededIds.has(id)));
      setNotice(`批次完成：成功 ${result.succeeded} 筆，失敗 ${result.failed} 筆。`);
      if (result.failures.length) setError(result.failures.map((item) => `${item.id}：${item.error}`).join("；"));
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
    finally { setBusy(null); }
  }

  async function save(analyzeAfterSave = false) {
    if (!draft) return;
    setBusy(draft.id); setError("");
    try {
      const result = await json<{ entry: EnglishImageEntry }>(await fetch("/api/dojo/english-images", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: draft.id, entry: draft }) }));
      let saved = result.entry;
      if (analyzeAfterSave && saved.route !== "pending") {
        saved = (await json<{ entry: EnglishImageEntry }>(await fetch("/api/dojo/english-images", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: saved.id, action: "analyze" }),
        }))).entry;
      }
      setEntries((old) => old.map((entry) => entry.id === saved.id ? saved : entry)); setEditing(null); setDraft(null);
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
    finally { setBusy(null); }
  }

  async function action(entry: EnglishImageEntry, name: "analyze" | "moveToCapture") {
    if (name === "analyze" && entry.analysisAttempts > 0 && !window.confirm("重新分析會再次使用 API 額度，確定要繼續嗎？")) return;
    if (name === "moveToCapture" && !window.confirm("確定將這張英文影像轉成一般野採素材？原圖與已產生的文字仍會保留。")) return;
    setBusy(entry.id); setError("");
    try {
      const result = await json<{ entry?: EnglishImageEntry }>(await fetch("/api/dojo/english-images", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: entry.id, action: name }) }));
      if (name === "moveToCapture") setEntries((old) => old.filter((item) => item.id !== entry.id));
      else if (result.entry) setEntries((old) => old.map((item) => item.id === entry.id ? result.entry! : item));
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
    finally { setBusy(null); }
  }

  async function routeAndAnalyze(entry: EnglishImageEntry, route: EnglishImageLearningRoute) {
    if (entry.analysisAttempts > 0 && !window.confirm("這張圖片曾經分析過；再次執行會使用 API 額度，確定要繼續嗎？")) return;
    setBusy(entry.id); setError("");
    try {
      const result = await json<{ entry: EnglishImageEntry }>(await fetch("/api/dojo/english-images", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: entry.id, action: "routeAndAnalyze", route }),
      }));
      setEntries((old) => old.map((item) => item.id === entry.id ? result.entry : item));
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
    finally { setBusy(null); }
  }

  async function openContextDispatch(entry: EnglishImageEntry) {
    setBusy(entry.id); setError("");
    try {
      const result = await json<{
        candidates: ContextCandidate[];
        projects: ContextProject[];
        defaults: { materialId: string; materialTitle: string; eventTitle: string };
      }>(await fetch(`/api/dojo/english-images/context-room?id=${encodeURIComponent(entry.id)}`, { cache: "no-store" }));
      const selectedProject = result.projects.find((item) => item.id === result.defaults.materialId);
      setContextDraft({
        entryId: entry.id,
        materialId: selectedProject?.id || "",
        materialTitle: selectedProject?.title || result.defaults.materialTitle,
        eventTitle: result.defaults.eventTitle,
        candidateKeys: result.candidates.map((item) => item.key).slice(0, 3),
        candidates: result.candidates,
        projects: result.projects,
      });
      setVocabDraft(null);
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
    finally { setBusy(null); }
  }

  async function openVocabDispatch(entry: EnglishImageEntry) {
    setBusy(entry.id); setError("");
    try {
      const result = await json<{
        candidates: VocabCandidate[];
        books: VocabBook[];
        exports: { key: string; vocabBook: string }[];
        syncStates: VocabDispatchDraft["syncStates"];
      }>(await fetch(`/api/dojo/english-images/vocabforge?id=${encodeURIComponent(entry.id)}`, { cache: "no-store" }));
      setVocabDraft({
        entryId: entry.id,
        vocabBook: "",
        candidateKeys: [],
        candidates: result.candidates,
        exportedKeys: result.exports.map((item) => item.key),
        syncStates: result.syncStates,
        books: result.books,
      });
      setContextDraft(null);
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
    finally { setBusy(null); }
  }

  async function sendVocabDispatch() {
    if (!vocabDraft) return;
    setBusy(vocabDraft.entryId); setError("");
    try {
      const result = await json<{ entry: EnglishImageEntry; failures: { expression: string; lastError: string }[] }>(await fetch("/api/dojo/english-images/vocabforge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: vocabDraft.entryId,
          vocabBook: vocabDraft.vocabBook,
          candidateKeys: vocabDraft.candidateKeys,
        }),
      }));
      setEntries((old) => old.map((item) => item.id === result.entry.id ? result.entry : item));
      if (result.failures.length) setError(`${result.failures.length} 個單字尚未同步，可保留候選後重試：${result.failures.map((item) => item.expression).join("、")}`);
      if (result.failures.length < vocabDraft.candidateKeys.length) setCompletionPromptId(result.entry.id);
      setVocabDraft(null);
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
    finally { setBusy(null); }
  }

  async function sendContextDispatch() {
    if (!contextDraft) return;
    setBusy(contextDraft.entryId); setError("");
    try {
      const result = await json<{ entry: EnglishImageEntry }>(await fetch("/api/dojo/english-images/context-room", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: contextDraft.entryId,
          materialId: contextDraft.materialId,
          materialTitle: contextDraft.materialTitle,
          eventTitle: contextDraft.eventTitle,
          candidateKeys: contextDraft.candidateKeys,
        }),
      }));
      setEntries((old) => old.map((item) => item.id === result.entry.id ? result.entry : item));
      setCompletionPromptId(result.entry.id);
      setContextDraft(null);
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
    finally { setBusy(null); }
  }

  return <div className="english-image-inbox learning-resources">
    <div className="subsection-title"><div><span className="eyebrow">野採・LINE 專屬入口</span><h4>英文影像匣</h4></div><span>{counts.inbox} 待處理</span></div>
    <p className="muted-note">遊戲畫面、日常照片、課堂教材與英文讀物先留在野採的英文影像區；完成辨識與初步分類後，再決定是否連到修習所。AI 只在分類後分析一次。</p>
    {targetEntryId && <p className="muted-note" style={{ margin: "10px 0", padding: "10px 11px", border: "1px solid #d8b772", borderRadius: 11, background: "#fff7df", color: "#735723", fontWeight: 700 }}>已從 LINE 帶回剛才的素材。請在醒目卡片按「加入閱讀專案／新批次」，選擇既有專案或建立新專案。</p>}
    <div className="english-image-status-tabs" role="tablist" aria-label="英文影像整理狀態">{STATUS_TABS.map((item) => <button role="tab" aria-selected={statusFilter === item.key} key={item.key} className={statusFilter === item.key ? "on" : ""} onClick={() => { setStatusFilter(item.key); setSelectedIds([]); }}>{item.label}<span>{counts[item.key]}</span></button>)}</div>
    <div className="english-image-tabs">{ROUTES.map((item) => <button key={item.key} className={filter === item.key ? "on" : ""} onClick={() => setFilter(item.key)}>{item.label}</button>)}</div>
    {statusFilter === "inbox" && <div className="english-image-batch-bar"><span>已選取 {selectedIds.length} 筆</span><button disabled={!selectedIds.length || busy === "batch"} onClick={() => void batchComplete()}>{busy === "batch" ? "批次處理中…" : `批次完成整理（${selectedIds.length}）`}</button></div>}
    {notice && <p className="form-success">{notice}</p>}
    {error && <p className="form-error">{error}</p>}
    {shown.length === 0 ? <p className="muted-note">目前沒有這一類圖片。</p> : shown.map((entry) => {
      const open = editing === entry.id && draft;
      const contextForm = contextRoomCopy(entry.route);
      return <article id={`english-image-${entry.id}`} className="english-image-card" style={entry.id === targetEntryId ? { borderColor: "#b8812f", boxShadow: "0 0 0 3px rgba(212, 166, 82, .2)" } : undefined} key={entry.id}>
        {statusFilter === "inbox" && <label className="english-image-select"><input type="checkbox" checked={selectedIds.includes(entry.id)} onChange={(event) => setSelectedIds((old) => event.target.checked ? [...old, entry.id] : old.filter((id) => id !== entry.id))} />選取這筆素材</label>}
        <div className={`english-image-gallery ${entry.attachments.length > 1 ? "multiple" : ""}`}>{entry.attachments.map((attachment, index) => <Image key={attachment.blockId} src={`/api/dojo/english-images/image?id=${encodeURIComponent(entry.id)}&index=${index}`} alt={`${entry.title} ${index + 1}`} width={720} height={480} unoptimized />)}</div>
        <div className="english-image-head"><div><small>{englishImageRouteLabel(entry.route)}</small><b>{entry.title}</b></div><span className={`analysis-${entry.analysisStatus}`}>{entry.analysisStatus === "completed" ? "AI 已完成" : entry.analysisStatus === "needs-review" ? "需要確認" : entry.analysisStatus === "processing" ? "分析中" : entry.analysisStatus === "failed" ? "分析失敗" : "尚未分析"}</span></div>
        <div className="english-image-destinations"><span>{entry.attachments.length} 張圖片</span>{entry.status === "organized" && <span className="is-organized">✓ 已完成整理</span>}{entry.contextRoomStatus === "ready" && <a href={entry.contextRoomUrl} target="_blank" rel="noreferrer">語境修習室待接續 ↗</a>}{entry.contextRoomStatus === "synced" && <a href={entry.contextRoomUrl} target="_blank" rel="noreferrer">已送語境修習室・第 {entry.contextRoomExport?.batchPosition ?? 1} 批 ↗</a>}{entry.vocabForgeExports.length > 0 && <span title={entry.vocabForgeExports.map((item) => item.expression).join("、")}>本素材已同步 {entry.vocabForgeExports.length} 字</span>}{entry.vocabForgeSyncStates.some((item) => item.status === "failed") && <span>同步失敗 {entry.vocabForgeSyncStates.filter((item) => item.status === "failed").length} 字</span>}</div>
        {entry.analysisError && <p className="form-error">{entry.analysisError}</p>}
        {!open ? <>
          {entry.englishRecord && <div className="english-image-result"><small>{englishRecordLabel(entry.route)}</small><p>{entry.englishRecord}</p></div>}
          {entry.chineseExplanation && <div className="english-image-result"><small>中文理解</small><p>{entry.chineseExplanation}</p></div>}
          {entry.learningPhrases && <details><summary>可學詞句</summary><p>{entry.learningPhrases}</p></details>}
          {entry.vocabularyWords && <details><summary>單字候選</summary><p>{entry.vocabularyWords}</p></details>}
          {entry.route !== "pending" && entry.analysisStatus !== "idle" && <div className="english-image-learning-route">
            <div><small>學習分流</small><b>單字留給 VocabForge；用法與句型送往語境修習室</b></div>
            <div className="english-image-route-buttons">
              <button disabled={busy === entry.id} onClick={() => void openVocabDispatch(entry)}>{busy === entry.id ? "讀取中…" : entry.vocabForgeExports.length ? "查看／繼續選字" : "選擇 VocabForge 單字"}</button>
              <button className="primary" disabled={busy === entry.id} onClick={() => void openContextDispatch(entry)}>{busy === entry.id ? "讀取中…" : entry.contextRoomStatus === "synced" ? "查看語境專案／再次派送" : entry.route === "reading" ? "加入閱讀專案／新批次" : "加入語境專案／新批次"}</button>
            </div>
          </div>}
          {vocabDraft?.entryId === entry.id && <div className="english-image-vocab-dispatch">
            <div className="english-image-context-head"><div><small>VocabForge</small><h5>挑選要記住的單字</h5></div><button className="text-link" onClick={() => setVocabDraft(null)}>關閉</button></div>
            <label>選擇豆倉
              <select className="field" value={vocabDraft.vocabBook} onChange={(event) => setVocabDraft({ ...vocabDraft, vocabBook: event.target.value })}>
                <option value="">請選擇要放入的豆倉</option>
                {vocabDraft.books.map((book) => <option key={book.name} value={book.name}>{book.name}（正式詞庫歸屬 {book.count}）</option>)}
              </select>
            </label>
            {vocabDraft.books[0]?.source === "postgres" ? (
              <p className="muted-note">數量是 VocabForge PostgreSQL 正式詞庫的「豆倉歸屬」；同一個字可同時計入多個專注豆倉。</p>
            ) : (
              <p className="muted-note" style={{ color: "#9a5d24" }}>目前由 Notion 備援計算「豆倉歸屬」；可選擇並派送，正式存在仍以 VocabForge 接收結果為準。</p>
            )}
            <fieldset>
              <legend>選擇真正想複習的單字（每筆素材最多 5 字）</legend>
              {vocabDraft.candidates.length === 0 ? <p className="muted-note">目前沒有可派送的單一英文單字；可以先整理候選內容或重新分析。</p> : vocabDraft.candidates.map((candidate) => {
                const exported = vocabDraft.exportedKeys.includes(candidate.key);
                const syncState = vocabDraft.syncStates.find((item) => item.key === candidate.key);
                const checked = vocabDraft.candidateKeys.includes(candidate.key);
                const remaining = Math.max(0, 5 - vocabDraft.exportedKeys.length);
                return <label className={`english-image-context-choice ${exported ? "is-exported" : ""}`} key={candidate.key}>
                  <input type="checkbox" checked={checked || exported} disabled={exported || (!checked && vocabDraft.candidateKeys.length >= remaining)} onChange={(event) => setVocabDraft({ ...vocabDraft, candidateKeys: event.target.checked ? [...vocabDraft.candidateKeys, candidate.key] : vocabDraft.candidateKeys.filter((key) => key !== candidate.key) })} />
                  <span><small>{exported ? "已同步" : syncState?.status === "failed" ? "同步失敗・可重試" : syncState?.status === "pending_sync" ? "等待確認" : candidate.origin === "extension" ? "延伸推薦・非原文" : "原素材候選"}</small><b>{candidate.expression}</b>{candidate.meaning && <em>{candidate.meaning}</em>}{candidate.recommendationReason && <i>{candidate.recommendationReason}</i>}{syncState?.status === "failed" && syncState.lastError && <i>{syncState.lastError}</i>}</span>
                </label>;
              })}
            </fieldset>
            <p className="muted-note">只會送出這次勾選的單字；已存在於 VocabForge 的資料會回報「已存在」，不建立重複卡片。</p>
            <button className="primary" disabled={busy === entry.id || !vocabDraft.vocabBook || vocabDraft.candidateKeys.length === 0} onClick={() => void sendVocabDispatch()}>{busy === entry.id ? "派送中…" : `送出 ${vocabDraft.candidateKeys.length} 字至 VocabForge`}</button>
          </div>}
          {contextDraft?.entryId === entry.id && <div className="english-image-context-dispatch">
            <div className="english-image-context-head"><div><small>語境修習室</small><h5>{contextForm.heading}</h5></div><button className="text-link" onClick={() => setContextDraft(null)}>關閉</button></div>
            <label>加入方式
              <select className="field" value={contextDraft.materialId || "__new__"} onChange={(event) => {
                const materialId = event.target.value === "__new__" ? "" : event.target.value;
                const project = contextDraft.projects.find((item) => item.id === materialId);
                setContextDraft({ ...contextDraft, materialId, materialTitle: project?.title || contextDraft.materialTitle });
              }}>
                <option value="__new__">建立新的素材專案</option>
                {contextDraft.projects.map((project) => <option key={project.id} value={project.id}>加入「{project.title}」（{project.batchCount} 批）</option>)}
              </select>
            </label>
            {contextDraft.materialId && (() => {
              const project = contextDraft.projects.find((item) => item.id === contextDraft.materialId);
              return <p className="muted-note">將建立第 {(project?.batchCount ?? 0) + 1} 批{project?.latestBatchLabel ? `；上一批是「${project.latestBatchLabel}」` : ""}。原有五話題與修習紀錄不受影響。</p>;
            })()}
            <label>{contextForm.materialLabel}<input className="field" value={contextDraft.materialTitle} disabled={Boolean(contextDraft.materialId)} onChange={(event) => setContextDraft({ ...contextDraft, materialTitle: event.target.value })} placeholder={contextForm.materialPlaceholder} /></label>
            <label>{contextForm.eventLabel}<input className="field" value={contextDraft.eventTitle} onChange={(event) => setContextDraft({ ...contextDraft, eventTitle: event.target.value })} placeholder={contextForm.eventPlaceholder} /></label>
            <fieldset>
              <legend>選擇真正想留下的表達（最多 5 項）</legend>
              {contextDraft.candidates.length === 0 ? <p className="muted-note">目前沒有可派送的片語、句型或用法；單一單字不會出現在這裡。</p> : contextDraft.candidates.map((candidate) => {
                const checked = contextDraft.candidateKeys.includes(candidate.key);
                return <label className="english-image-context-choice" key={candidate.key}>
                  <input type="checkbox" checked={checked} disabled={!checked && contextDraft.candidateKeys.length >= 5} onChange={(event) => setContextDraft({ ...contextDraft, candidateKeys: event.target.checked ? [...contextDraft.candidateKeys, candidate.key] : contextDraft.candidateKeys.filter((key) => key !== candidate.key) })} />
                  <span><small>{CONTEXT_KIND_LABEL[candidate.kind]}</small><b>{candidate.text}</b>{candidate.meaning && <em>{candidate.meaning}</em>}{candidate.usage && <i>{candidate.usage}</i>}</span>
                </label>;
              })}
            </fieldset>
            <p className="muted-note">只會送出你勾選的項目；未勾選的 AI 建議仍留在原始影像紀錄。</p>
            <button className="primary" disabled={busy === entry.id || !contextDraft.materialTitle.trim() || !contextDraft.eventTitle.trim()} onClick={() => void sendContextDispatch()}>{busy === entry.id ? "派送中…" : contextDraft.materialId ? `加入既有專案，建立新批次` : `建立新專案並留下 ${contextDraft.candidateKeys.length} 項表達`}</button>
          </div>}
          {completionPromptId === entry.id && entry.status === "inbox" && <div className="english-image-completion-prompt"><div><small>{completionWarnings(entry).length ? "派送請求已結束・仍有狀態需確認" : "派送已完成"}</small><b>這筆素材還需要其他處理嗎？</b></div><div className="english-image-actions"><button className="primary" disabled={busy === entry.id} onClick={() => void setEntryStatus(entry, "organized")}>✓ 完成整理</button><button onClick={() => setCompletionPromptId(null)}>稍後繼續</button></div></div>}
          {entry.analyzedAt && <small className="english-image-usage">{entry.analysisModel}・{entry.inputTokens + entry.outputTokens} tokens・約 US${entry.estimatedCostUsd.toFixed(4)}</small>}
          {entry.route === "pending" && <div className="english-image-route-actions"><button className="primary" disabled={busy === entry.id} onClick={() => void routeAndAnalyze(entry, "game")}>{busy === entry.id ? "分析中…" : "遊戲英文並分析"}</button><button disabled={busy === entry.id} onClick={() => void routeAndAnalyze(entry, "daily")}>{busy === entry.id ? "分析中…" : "英文日常並分析"}</button><button disabled={busy === entry.id} onClick={() => void routeAndAnalyze(entry, "classroom")}>{busy === entry.id ? "分析中…" : "課堂英文並分析"}</button><button disabled={busy === entry.id} onClick={() => void routeAndAnalyze(entry, "reading")}>{busy === entry.id ? "分析中…" : "閱讀英文並分析"}</button></div>}
          <div className="english-image-actions"><button onClick={() => { setEditing(entry.id); setDraft(structuredClone(entry)); }}>整理</button>{entry.route !== "pending" && <button disabled={busy === entry.id} onClick={() => void action(entry, "analyze")}>{busy === entry.id ? "處理中…" : entry.analysisAttempts ? "重新分析" : "AI 分析"}</button>}<button className="text-link" disabled={busy === entry.id} onClick={() => void action(entry, "moveToCapture")}>轉為一般素材</button>{entry.status === "inbox" ? <button className="primary" disabled={busy === entry.id} onClick={() => void setEntryStatus(entry, "organized")}>✓ 完成本次整理</button> : <button disabled={busy === entry.id} onClick={() => void setEntryStatus(entry, "inbox")}>重新開啟整理</button>}</div>
        </> : <div className="english-image-editor">
          <label>類型</label><select className="field" value={draft.route} onChange={(event) => setDraft({ ...draft, route: event.target.value as EnglishImageRoute })}><option value="pending">待分類</option><option value="game">遊戲英文</option><option value="daily">英文日常</option><option value="classroom">課堂英文</option><option value="reading">閱讀英文</option></select>
          <label>標題／作品或場景</label><input className="field" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
          <label>情境補充</label><textarea className="field" rows={2} value={draft.contextNote} onChange={(event) => setDraft({ ...draft, contextNote: event.target.value })} />
          <label>圖片英文原文</label><textarea className="field" rows={5} value={draft.ocrText} onChange={(event) => setDraft({ ...draft, ocrText: event.target.value })} />
          <label>{englishRecordLabel(draft.route)}</label><textarea className="field" rows={4} value={draft.englishRecord} onChange={(event) => setDraft({ ...draft, englishRecord: event.target.value })} />
          <label>中文解釋</label><textarea className="field" rows={4} value={draft.chineseExplanation} onChange={(event) => setDraft({ ...draft, chineseExplanation: event.target.value })} />
          <label>可學詞句</label><textarea className="field" rows={5} value={draft.learningPhrases} onChange={(event) => setDraft({ ...draft, learningPhrases: event.target.value })} />
          <label>單字候選</label><textarea className="field" rows={5} value={draft.vocabularyWords} onChange={(event) => setDraft({ ...draft, vocabularyWords: event.target.value })} />
          <div className="english-image-actions"><button onClick={() => { setEditing(null); setDraft(null); }}>取消</button><button className="primary" disabled={busy === entry.id} onClick={() => void save(entry.route === "pending" && draft.route !== "pending")}>{busy === entry.id ? (draft.route === "pending" ? "儲存中…" : "分析中…") : entry.route === "pending" && draft.route !== "pending" ? "儲存並分析" : "儲存"}</button></div>
        </div>}
      </article>;
    })}
  </div>;
}
