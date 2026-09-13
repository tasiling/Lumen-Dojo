"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { EnglishImageEntry, EnglishImageRoute } from "@/lib/dojo/englishImage";

async function json<T>(response: Response): Promise<T> {
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((result as { error?: string }).error ?? `操作失敗（${response.status}）`);
  return result as T;
}

const ROUTES: { key: "all" | EnglishImageRoute; label: string }[] = [
  { key: "all", label: "全部" }, { key: "pending", label: "待分類" },
  { key: "game", label: "遊戲英文" }, { key: "daily", label: "英文日常" },
];

export default function EnglishImageInbox() {
  const [entries, setEntries] = useState<EnglishImageEntry[]>([]);
  const [filter, setFilter] = useState<(typeof ROUTES)[number]["key"]>("all");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<EnglishImageEntry | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try { setEntries((await json<{ entries: EnglishImageEntry[] }>(await fetch("/api/dojo/english-images", { cache: "no-store" }))).entries); }
    catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  const shown = useMemo(() => filter === "all" ? entries : entries.filter((entry) => entry.route === filter), [entries, filter]);

  async function save() {
    if (!draft) return;
    setBusy(draft.id); setError("");
    try {
      const result = await json<{ entry: EnglishImageEntry }>(await fetch("/api/dojo/english-images", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: draft.id, entry: draft }) }));
      setEntries((old) => old.map((entry) => entry.id === result.entry.id ? result.entry : entry)); setEditing(null); setDraft(null);
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
    finally { setBusy(null); }
  }

  async function action(entry: EnglishImageEntry, name: "analyze" | "moveToCapture") {
    if (name === "analyze" && entry.analysisAttempts > 0 && !window.confirm("重新分析會再次使用 API 額度，確定要繼續嗎？")) return;
    if (name === "moveToCapture" && !window.confirm("確定將這張圖片改送野採？英文影像匣中的紀錄會轉成一般剪藏。")) return;
    setBusy(entry.id); setError("");
    try {
      const result = await json<{ entry?: EnglishImageEntry }>(await fetch("/api/dojo/english-images", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: entry.id, action: name }) }));
      if (name === "moveToCapture") setEntries((old) => old.filter((item) => item.id !== entry.id));
      else if (result.entry) setEntries((old) => old.map((item) => item.id === entry.id ? result.entry! : item));
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
    finally { setBusy(null); }
  }

  return <div className="english-image-inbox learning-resources">
    <div className="subsection-title"><div><span className="eyebrow">LINE 專屬入口</span><h4>英文影像匣</h4></div><span>{entries.length}</span></div>
    <p className="muted-note">遊戲畫面與日常照片留在這裡，不會混進野採。AI 只在分類後分析一次。</p>
    <div className="english-image-tabs">{ROUTES.map((item) => <button key={item.key} className={filter === item.key ? "on" : ""} onClick={() => setFilter(item.key)}>{item.label}</button>)}</div>
    {error && <p className="form-error">{error}</p>}
    {shown.length === 0 ? <p className="muted-note">目前沒有這一類圖片。</p> : shown.map((entry) => {
      const open = editing === entry.id && draft;
      return <article className="english-image-card" key={entry.id}>
        <Image src={`/api/dojo/english-images/image?id=${encodeURIComponent(entry.id)}`} alt={entry.title} width={720} height={480} unoptimized />
        <div className="english-image-head"><div><small>{entry.route === "game" ? "遊戲英文" : entry.route === "daily" ? "英文日常" : "待分類"}</small><b>{entry.title}</b></div><span className={`analysis-${entry.analysisStatus}`}>{entry.analysisStatus === "completed" ? "AI 已完成" : entry.analysisStatus === "needs-review" ? "需要確認" : entry.analysisStatus === "processing" ? "分析中" : entry.analysisStatus === "failed" ? "分析失敗" : "尚未分析"}</span></div>
        {entry.analysisError && <p className="form-error">{entry.analysisError}</p>}
        {!open ? <>
          {entry.englishRecord && <div className="english-image-result"><small>英文事件紀錄</small><p>{entry.englishRecord}</p></div>}
          {entry.chineseExplanation && <div className="english-image-result"><small>中文理解</small><p>{entry.chineseExplanation}</p></div>}
          {entry.learningPhrases && <details><summary>可學詞句</summary><p>{entry.learningPhrases}</p></details>}
          {entry.analyzedAt && <small className="english-image-usage">{entry.analysisModel}・{entry.inputTokens + entry.outputTokens} tokens・約 US${entry.estimatedCostUsd.toFixed(4)}</small>}
          <div className="english-image-actions"><button onClick={() => { setEditing(entry.id); setDraft(structuredClone(entry)); }}>整理</button>{entry.route !== "pending" && <button disabled={busy === entry.id} onClick={() => void action(entry, "analyze")}>{busy === entry.id ? "處理中…" : entry.analysisAttempts ? "重新分析" : "AI 分析"}</button>}<button className="text-link" disabled={busy === entry.id} onClick={() => void action(entry, "moveToCapture")}>改送野採</button></div>
        </> : <div className="english-image-editor">
          <label>類型</label><select className="field" value={draft.route} onChange={(event) => setDraft({ ...draft, route: event.target.value as EnglishImageRoute })}><option value="pending">待分類</option><option value="game">遊戲英文</option><option value="daily">英文日常</option></select>
          <label>標題／遊戲或場景</label><input className="field" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
          <label>情境補充</label><textarea className="field" rows={2} value={draft.contextNote} onChange={(event) => setDraft({ ...draft, contextNote: event.target.value })} />
          <label>圖片英文原文</label><textarea className="field" rows={5} value={draft.ocrText} onChange={(event) => setDraft({ ...draft, ocrText: event.target.value })} />
          <label>英文事件紀錄</label><textarea className="field" rows={4} value={draft.englishRecord} onChange={(event) => setDraft({ ...draft, englishRecord: event.target.value })} />
          <label>中文解釋</label><textarea className="field" rows={4} value={draft.chineseExplanation} onChange={(event) => setDraft({ ...draft, chineseExplanation: event.target.value })} />
          <label>可學詞句</label><textarea className="field" rows={5} value={draft.learningPhrases} onChange={(event) => setDraft({ ...draft, learningPhrases: event.target.value })} />
          <label className="check"><input type="checkbox" checked={draft.status === "organized"} onChange={(event) => setDraft({ ...draft, status: event.target.checked ? "organized" : "inbox" })} />已整理完成</label>
          <div className="english-image-actions"><button onClick={() => { setEditing(null); setDraft(null); }}>取消</button><button className="primary" disabled={busy === entry.id} onClick={() => void save()}>{busy === entry.id ? "儲存中…" : "儲存"}</button></div>
        </div>}
      </article>;
    })}
  </div>;
}
