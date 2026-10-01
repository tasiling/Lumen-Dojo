"use client";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "./PracticeRouteLink";
import { usePracticeLeaveGuard } from "@/lib/dojo/usePracticeLeaveGuard";
import type { LearningRecord } from "@/lib/dojo/learningRecords/model";
import type { LearningEntity } from "@/lib/dojo/learningFoundation/model";
import { taipeiTodayISO } from "@/lib/dojo/formal";
const labels = { title: "標題（選填）", whatIDid: "這次學了什麼？", myUnderstanding: "我目前怎麼理解？", questions: "還有哪些問題？", worthKeeping: "有什麼值得留下？", difficulties: "困難", discoveries: "發現", selectedExcerpt: "選摘", sourceSnapshot: "必要來源摘要", practiceKind: "練習種類" };
export default function LearningRecordWorkspace({ learningItemId, recent = false }: { learningItemId?: string; recent?: boolean }) {
  const createRequestId = useRef("");
  const q = useSearchParams(); const recordId = q.get("record");
  const itemId = learningItemId ?? q.get("learningItem") ?? "";
  const editing = !recent && (Boolean(recordId) || q.get("new") === "1");
  const [items, setItems] = useState<LearningEntity[]>([]);
  const [records, setRecords] = useState<LearningRecord[]>([]);
  const [draft, setDraft] = useState<Partial<LearningRecord>>({ practicedOn: taipeiTodayISO(), recordedOn: taipeiTodayISO(), learningItemIds: itemId ? [itemId] : [], primaryLearningItemId: itemId, whatIDid: "", status: "draft" });
  const [saved, setSaved] = useState(""); const [ready, setReady] = useState(false);
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(""); const [cursor, setCursor] = useState<string | null>(null);
  const [stage, setStage] = useState(""); const [topic, setTopic] = useState("");
  usePracticeLeaveGuard(editing && ready && JSON.stringify(draft) !== saved);
  async function read(url: string) { const r = await fetch(url, { cache: "no-store" }); const j = await r.json(); if (!r.ok) throw Error(j.error ?? "紀錄不可用"); return j; }
  useEffect(() => { let live = true; read("/api/dojo/learning/foundation").then(j => { if(live) setItems(j.entities); }).catch(e => { if(live) setError(e.message); }); return () => { live = false; }; }, []);
  useEffect(() => { if(!editing) return; let live = true; setReady(false);
    createRequestId.current = crypto.randomUUID();
    const initial = { practicedOn: taipeiTodayISO(), recordedOn: taipeiTodayISO(), learningItemIds: itemId ? [itemId] : [], primaryLearningItemId: itemId, whatIDid: "", status: "draft" as const };
    (recordId ? read(`/api/dojo/learning/records?id=${recordId}`).then(j => j.record) : Promise.resolve(initial)).then(r => { if(live) { setDraft(r); setSaved(JSON.stringify(r)); setReady(true); } }).catch(e => { if(live) setError(e.message); }); return () => { live = false; }; }, [recordId, itemId, editing]);
  useEffect(() => { if(editing) return; let live = true; const params = new URLSearchParams({ limit: recent ? "5" : "20" }); if(itemId) params.set("learningItemId", itemId); if(status) params.set("status", status); if(stage) params.set("stageId", stage); if(topic) params.set("topicId", topic);
    setReady(false); setError(""); read(`/api/dojo/learning/records?${params}`).then(j => { if(live) { setRecords(j.records); setCursor(j.cursor); setReady(true); } }).catch(e => { if(live) setError(e.message); }); return () => { live = false; }; }, [itemId, status, stage, topic, editing, recent]);
  async function more() { setBusy(true); try { const p = new URLSearchParams({ cursor: cursor!, limit: "20" }); if(itemId) p.set("learningItemId", itemId); if(status) p.set("status", status); if(stage) p.set("stageId", stage); if(topic) p.set("topicId", topic); const j = await read(`/api/dojo/learning/records?${p}`); setRecords(r => [...r, ...j.records]); setCursor(j.cursor); } catch(e) { setError(String(e)); } finally { setBusy(false); } }
  function change(key: string, value: unknown) { setDraft(d => ({ ...d, [key]: value })); }
  async function save(next: LearningRecord["status"]) { setBusy(true); setError(""); try {
    const r = await fetch("/api/dojo/learning/records", { method: draft.id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: draft.id, revision: draft.revision, input: { ...draft, createRequestId: createRequestId.current, status: next } }) }); const j = await r.json(); if(!r.ok) throw Error(j.error);
    setDraft(j.record); setSaved(JSON.stringify(j.record)); window.history.replaceState(window.history.state, "", `/practice/records?record=${j.record.id}${itemId ? `&learningItem=${itemId}` : ""}`);
  } catch(e) { setError(String(e)); } finally { setBusy(false); } }
  const disciplines = items.filter(i => i.kind === "item");
  return <section className="learning-records"><h2>{editing ? "留下學習紀錄" : "最近修習歷程"}</h2><p>紀錄完成代表正文寫完，不表示能力已掌握。</p>{error && <p role="alert">{error}</p>}
    {editing ? <>{ready && <form onSubmit={e => { e.preventDefault(); void save("draft"); }}>
      <fieldset><legend>關聯學科（正文只有一份）</legend>{disciplines.map(i => <label key={i.id}><input type="checkbox" checked={draft.learningItemIds?.includes(i.id) ?? false} onChange={e => { const ids = e.target.checked ? [...(draft.learningItemIds ?? []), i.id] : (draft.learningItemIds ?? []).filter(id => id !== i.id); setDraft(d => ({ ...d, learningItemIds: ids, primaryLearningItemId: ids.includes(d.primaryLearningItemId ?? "") ? d.primaryLearningItemId : ids[0] ?? "", learningStageId: null, learningTopicId: null })); }} />{i.name}</label>)}</fieldset>
      <label>主要學科<select value={draft.primaryLearningItemId ?? ""} onChange={e => change("primaryLearningItemId", e.target.value)}><option value="">請選擇</option>{disciplines.filter(i => draft.learningItemIds?.includes(i.id)).map(i => <option key={i.id} value={i.id}>{i.name}</option>)}</select></label>
      <label>實際修習日期<input type="date" required value={draft.practicedOn ?? ""} onChange={e => change("practicedOn", e.target.value)} /></label>
      {(["title", "whatIDid", "myUnderstanding", "questions", "worthKeeping"] as const).map(k => <label key={k}>{labels[k]}<textarea required={k === "whatIDid"} value={draft[k] ?? ""} onChange={e => change(k, e.target.value)} rows={k === "title" ? 2 : 4} /></label>)}
      <details><summary>階段、主題與其他選填</summary>{(["learningStageId", "learningTopicId"] as const).map((key, index) => <label key={key}>{index ? "主題" : "階段"}<select value={draft[key] ?? ""} onChange={e => change(key, e.target.value || null)}><option value="">尚未指定</option>{items.filter(i => i.kind === (index ? "topic" : "stage") && i.itemId === draft.primaryLearningItemId).map(i => <option key={i.id} value={i.id}>{i.name}</option>)}</select>{draft[key] && !items.some(i => i.id === draft[key]) && <p>歷史關聯待確認，未刪除。</p>}</label>)}{(["difficulties", "discoveries", "selectedExcerpt", "sourceSnapshot", "practiceKind"] as const).map(k => <label key={k}>{labels[k]}<textarea value={draft[k] ?? ""} onChange={e => change(k, e.target.value)} /></label>)}
      <label>來源網址（選填）<input type="url" value={draft.sourceRefs?.find(r => r.type === "url")?.url ?? ""} onChange={e => change("sourceRefs", e.target.value ? [{ type: "url", id: e.target.value, url: e.target.value, label: "學習來源", status: "unverified" }] : [])} /></label>
      </details><div className="record-actions"><button disabled={busy} type="submit">儲存草稿</button><button type="button" disabled={busy} onClick={() => void save("completed")}>完成紀錄</button>{draft.id && <button type="button" disabled={busy} onClick={() => void save(draft.status === "archived" ? "draft" : "archived")}>{draft.status === "archived" ? "恢復" : "封存"}</button>}</div><p role="status">{draft.id && JSON.stringify(draft) === saved ? "已保存" : "尚未保存"}</p><details><summary>進階資料</summary>{draft.id} · revision {draft.revision}</details>
    </form>}</> : <><Link className="primary" href={`/practice/records?new=1${itemId ? `&learningItem=${itemId}` : ""}`}>＋ 留下學習紀錄</Link>{!recent && <div className="practice-tabs"><label>狀態<select value={status} onChange={e => setStatus(e.target.value)}><option value="">全部</option><option value="draft">草稿</option><option value="completed">完成紀錄</option><option value="archived">封存</option></select></label>{[["stage", stage, setStage], ["topic", topic, setTopic]].map(([kind, value, setter]) => <label key={String(kind)}>{kind === "stage" ? "階段" : "主題"}<select value={String(value)} onChange={e => (setter as (v: string) => void)(e.target.value)}><option value="">全部</option>{items.filter(i => i.kind === kind && (!itemId || i.itemId === itemId)).map(i => <option key={i.id} value={i.id}>{i.name}</option>)}</select></label>)}</div>}
      {!ready && !error && <p>讀取歷程中…</p>}{ready && !records.length && <p>此頁尚無紀錄，可留下真實學習內容。</p>}{records.map(r => <article className="card" key={r.id}><Link href={`/practice/records?record=${r.id}${itemId ? `&learningItem=${itemId}` : ""}`}>{r.title || r.whatIDid.slice(0, 60)}</Link><small>{r.practicedOn} · {r.status === "completed" ? "正文完成" : r.status === "archived" ? "封存" : "草稿"}</small><p>{r.whatIDid}</p></article>)}{cursor && !recent && <button disabled={busy} onClick={() => void more()}>下一頁</button>}{recent && <Link href={`/practice/records${itemId ? `?learningItem=${itemId}` : ""}`}>完整歷程／草稿／完成紀錄</Link>}</>}
  </section>;
}
