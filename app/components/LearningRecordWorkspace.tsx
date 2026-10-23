"use client";
import { newRecordItemId } from "@/lib/dojo/contextualAdd";
import PracticeRecentRecords from "./PracticeRecentRecords";
import PracticeField from "./PracticeField";
import PracticeEventHistory from "./PracticeEventHistory";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import Link from "./PracticeRouteLink";
import { usePracticeLeaveGuard } from "@/lib/dojo/usePracticeLeaveGuard";
import type { LearningRecord } from "@/lib/dojo/learningRecords/model";
import type { LearningEntity } from "@/lib/dojo/learningFoundation/model";
import { taipeiTodayISO } from "@/lib/dojo/formal";
const labels = { title: "標題（選填）", whatIDid: "這次學了什麼？", myUnderstanding: "我目前怎麼理解？", questions: "還有哪些問題？", worthKeeping: "有什麼值得留下？", difficulties: "困難", discoveries: "發現", selectedExcerpt: "選摘", sourceSnapshot: "來源摘要（選填）", practiceKind: "練習種類" };
export default function LearningRecordWorkspace({ learningItemId, recent = false, children }: { learningItemId?: string; recent?: boolean; children?:ReactNode }) {
  const createRequestId = useRef("");
  const q = useSearchParams(); const recordId = q.get("record");
  const requestedItemId = learningItemId ?? q.get("learningItem") ?? "";
  const editing = !recent && (Boolean(recordId) || q.get("new") === "1");
  const [items, setItems] = useState<LearningEntity[]>([]);
  const [itemsReady,setItemsReady]=useState(false);
  const newItemsReady=Boolean(recordId)||itemsReady;
  const resolvedItemId=editing&&!recordId?newRecordItemId(items,requestedItemId):requestedItemId;
  const itemId=resolvedItemId??requestedItemId;
  const editorContext=JSON.stringify([recordId||'',itemId]);
  const [records, setRecords] = useState<LearningRecord[]>([]);
  const [draft, setDraft] = useState<Partial<LearningRecord>>({ practicedOn: taipeiTodayISO(), recordedOn: taipeiTodayISO(), learningItemIds: itemId ? [itemId] : [], primaryLearningItemId: itemId, whatIDid: "", status: "draft" });
  const [saved, setSaved] = useState(""); const [ready, setReady] = useState(false);
  const [loadedEditorContext,setLoadedEditorContext]=useState('');
  const editorReady=ready && loadedEditorContext===editorContext && resolvedItemId!==null;
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(""); const [cursor, setCursor] = useState<string | null>(null);
  const [stage, setStage] = useState(""); const [topic, setTopic] = useState("");
  usePracticeLeaveGuard(editing && editorReady && JSON.stringify(draft) !== saved);
  async function read(url: string) { const r = await fetch(url, { cache: "no-store" }); const j = await r.json(); if (!r.ok) throw Error(j.error ?? "紀錄不可用"); return j; }
  useEffect(() => { let live = true; read("/api/dojo/learning/foundation").then(j => { if(live) {setItems(j.entities);setItemsReady(true);} }).catch(e => { if(live) setError(e.message); }); return () => { live = false; }; }, []);
  useEffect(() => { if(!editing || !newItemsReady) return;
    setReady(false);setLoadedEditorContext('');setError('');
    if(!recordId && resolvedItemId===null){setError('找不到可新增紀錄的學習項目，請返回重新選擇。');return}
    let live = true;
    createRequestId.current = crypto.randomUUID();
    const initial = { practicedOn: taipeiTodayISO(), recordedOn: taipeiTodayISO(), learningItemIds: itemId ? [itemId] : [], primaryLearningItemId: itemId, whatIDid: "", status: "draft" as const };
    (recordId ? read(`/api/dojo/learning/records?id=${recordId}`).then(j => j.record) : Promise.resolve(initial)).then(r => { if(live) { setDraft(r); setSaved(JSON.stringify(r)); setLoadedEditorContext(editorContext);setReady(true); } }).catch(e => { if(live) setError(e.message); }); return () => { live = false; }; }, [recordId, itemId, editing, newItemsReady, resolvedItemId, editorContext]);
  useEffect(() => { if(editing) return; let live = true; const params = new URLSearchParams({ limit: recent ? "5" : "20" }); if(itemId) params.set("learningItemId", itemId); if(status) params.set("status", status); if(stage) params.set("stageId", stage); if(topic) params.set("topicId", topic);
    read(`/api/dojo/learning/records?${params}`).then(j => { if(live) { setRecords(j.records); setCursor(j.cursor); setReady(true); } }).catch(e => { if(live) setError(e.message); }); return () => { live = false; }; }, [itemId, status, stage, topic, editing, recent]);
  async function more() { setBusy(true); try { const p = new URLSearchParams({ cursor: cursor!, limit: "20" }); if(itemId) p.set("learningItemId", itemId); if(status) p.set("status", status); if(stage) p.set("stageId", stage); if(topic) p.set("topicId", topic); const j = await read(`/api/dojo/learning/records?${p}`); setRecords(r => [...r, ...j.records]); setCursor(j.cursor); } catch(e) { setError(String(e)); } finally { setBusy(false); } }
  function change(key: string, value: unknown) { setDraft(d => ({ ...d, [key]: value,
    ...(key === "primaryLearningItemId" ? {learningStageId:null,learningTopicId:null} : {}),
    ...(key === "learningStageId" ? {learningTopicId:null} : {}) })); }
  async function save(next: LearningRecord["status"]) { if(!editorReady){setError('請等待這份紀錄載入完成後再儲存。');return}setBusy(true); setError(""); try {
    const r = await fetch("/api/dojo/learning/records", { method: draft.id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: draft.id, revision: draft.revision, input: { ...draft, createRequestId: createRequestId.current, status: next } }) }); const j = await r.json(); if(!r.ok) throw Error(j.error);
    setDraft(j.record); setSaved(JSON.stringify(j.record)); window.history.replaceState(window.history.state, "", `/practice/records?record=${j.record.id}${itemId ? `&learningItem=${itemId}` : ""}`);
  } catch(e) { setError(String(e)); } finally { setBusy(false); } }
  const hints: Record<string,string> = {
    title:"一句短標題，方便日後搜尋；不填也可以。", whatIDid:"寫這次實際讀了、做了或練了什麼。從一句話開始，例如：讀完一段英文牌義，並用自己的話解釋。",
    myUnderstanding:"用自己的話說明目前理解；不確定之處也可以寫下來。",questions:"寫下還不懂、想查證或下次想問的問題。",worthKeeping:"寫下值得回看的重點或提醒；這裡不會自動採用知識主張。",
    difficulties:"哪個步驟卡住、容易出錯，或需要協助？",discoveries:"記下新注意到的現象、連結或收穫；推測請註明待驗證。",selectedExcerpt:"摘錄想留下的短句，並記下出處；分清原文與自己的理解。",sourceSnapshot:"選填。記下來源名稱、作者、章節／頁碼或影片時間及使用重點，方便追溯；不必貼整份教材。",practiceKind:"填練習方式，例如朗讀、摘要、解牌或觀察速寫。"
  };
  const disciplines = items.filter(i => i.kind === "item");
  if(recent) return <PracticeRecentRecords records={records} ready={ready} error={error} itemId={itemId} events={<PracticeEventHistory learningItemId={itemId || undefined} recent />}>{children}</PracticeRecentRecords>;
  return <section className="learning-records"><h2>{editing ? "留下學習紀錄" : "最近修習歷程"}</h2><p>紀錄完成代表正文寫完，不表示能力已掌握。</p>{error && <p role="alert">{error}</p>}
    {editing ? <>{!editorReady && !error && <p role="status">正在準備這份學習紀錄…</p>}{editorReady && <form onSubmit={e => { e.preventDefault(); void save("draft"); }}>
      <fieldset><legend>關聯學習項目（正文只有一份）</legend>{disciplines.map(i => <label key={i.id}><input type="checkbox" checked={draft.learningItemIds?.includes(i.id) ?? false} onChange={e => { const ids = e.target.checked ? [...(draft.learningItemIds ?? []), i.id] : (draft.learningItemIds ?? []).filter(id => id !== i.id); setDraft(d => ({ ...d, learningItemIds: ids, primaryLearningItemId: ids.includes(d.primaryLearningItemId ?? "") ? d.primaryLearningItemId : ids[0] ?? "", learningStageId: null, learningTopicId: null })); }} />{i.name}</label>)}</fieldset>
      <PracticeField id="record-primary" label="主要學習項目" help="先勾選關聯項目，再選其中一個作為這份紀錄的主要位置；更換後會清除原階段與主題。"><select id="record-primary" aria-describedby="record-primary-help" value={draft.primaryLearningItemId ?? ""} onChange={e => change("primaryLearningItemId", e.target.value)}><option value="">請選擇</option>{disciplines.filter(i => draft.learningItemIds?.includes(i.id)).map(i => <option key={i.id} value={i.id}>{i.name}</option>)}</select></PracticeField>
      <div className="practice-field-pair"><PracticeField id="record-date" label="實際修習日期" help="選實際修習發生的日期；補記舊練習時，請改成當天日期。"><input id="record-date" aria-describedby="record-date-help" type="date" required value={draft.practicedOn ?? ""} onChange={e => change("practicedOn", e.target.value)} /></PracticeField><PracticeField id="record-created" label="記錄日期" help="建立紀錄的日期，編輯不會改變；更新時間會另外保存。"><input id="record-created" aria-describedby="record-created-help" type="date" readOnly value={draft.recordedOn ?? ""} /></PracticeField></div>
      {(["title", "whatIDid", "myUnderstanding", "questions", "worthKeeping"] as const).map(k => <PracticeField key={k} id={`record-${k}`} label={labels[k]} help={hints[k]}><textarea id={`record-${k}`} aria-describedby={`record-${k}-help`} required={k === "whatIDid"} value={draft[k] ?? ""} onChange={e => change(k, e.target.value)} rows={k === "title" ? 2 : 4} /></PracticeField>)}
      <details><summary>階段、主題與其他選填</summary><div className="practice-field-pair">{(["learningStageId", "learningTopicId"] as const).map((key, index) => <PracticeField key={key} id={`record-${key}`} label={index ? "主題" : "階段"} help={index ? "選這次具體練習的主題。只顯示主要項目的對應階段；不確定可先留空。" : "選這次練習所在的較大階段，例如理解與練習；階段變更會清除原主題。"}><select id={`record-${key}`} aria-describedby={`record-${key}-help`} value={draft[key] ?? ""} onChange={e => change(key, e.target.value || null)}><option value="">尚未指定</option>{items.filter(i => i.kind === (index ? "topic" : "stage") && i.itemId === draft.primaryLearningItemId && (i.status !== "archived" || i.id === draft[key]) && (!index || !draft.learningStageId || i.stageId === draft.learningStageId)).map(i => <option key={i.id} value={i.id}>{i.name}</option>)}</select>{draft[key] && !items.some(i => i.id === draft[key]) && <p>歷史關聯待確認，未刪除。</p>}</PracticeField>)}</div>{(["difficulties", "discoveries", "selectedExcerpt", "sourceSnapshot", "practiceKind"] as const).map(k => <PracticeField key={k} id={`record-${k}`} label={labels[k]} help={hints[k]}><textarea id={`record-${k}`} aria-describedby={`record-${k}-help`} value={draft[k] ?? ""} onChange={e => change(k, e.target.value)} /></PracticeField>)}
      <PracticeField id="record-source" label="來源網址（選填）" help="貼原始文章、影片或教材的網址。沒有網址可留空，改在來源摘要寫書名與頁碼。"><input id="record-source" aria-describedby="record-source-help" type="url" value={draft.sourceRefs?.find(r => r.type === "url")?.url ?? ""} onChange={e => { const refs = draft.sourceRefs ?? []; const index = refs.findIndex(r => r.type === "url"); change("sourceRefs", [...refs.filter((_, i) => i !== index), ...(e.target.value ? [{ type: "url", id: e.target.value, url: e.target.value, label: "學習來源", status: "unverified" }] : [])]); }} /></PracticeField>
      {draft.sourceRefs?.map((ref, i) => <p key={`${ref.type}:${ref.id}:${i}`}>來源：{ref.label} · {({ available: "已確認", archived: "封存", missing: "已失效", unverified: "待確認" })[ref.status]}{ref.url && <a href={ref.url} target="_blank" rel="noreferrer"> 開啟來源</a>}</p>)}
      </details><p className="practice-record-status-note">草稿可續寫；正文完成表示文字已寫好，不代表活動完成、能力掌握或已計時，也不會自動入藏。</p><div className="record-actions"><button disabled={busy} type="submit">儲存草稿</button><button type="button" disabled={busy} onClick={() => void save("completed")}>正文完成</button>{draft.id && <button type="button" disabled={busy} onClick={() => void save(draft.status === "archived" ? "draft" : "archived")}>{draft.status === "archived" ? "恢復" : "封存"}</button>}</div><p role="status">{draft.id && JSON.stringify(draft) === saved ? "已保存" : "尚未保存"}</p><details><summary>進階資料</summary>{draft.id} · revision {draft.revision}</details>
    </form>}</> : <><Link className="primary" href={`/practice/records?new=1${itemId ? `&learningItem=${itemId}` : ""}`}>＋ 留下學習紀錄</Link>{!recent && <div className="practice-tabs"><label>狀態<select aria-label="狀態" value={status} onChange={e => setStatus(e.target.value)}><option value="">全部</option><option value="draft">草稿</option><option value="completed">完成紀錄</option><option value="archived">封存</option></select></label>{[["stage", stage, setStage], ["topic", topic, setTopic]].map(([kind, value, setter]) => <label key={String(kind)}>{kind === "stage" ? "階段" : "主題"}<select value={String(value)} onChange={e => (setter as (v: string) => void)(e.target.value)}><option value="">全部</option>{items.filter(i => i.kind === kind && (!itemId || i.itemId === itemId)).map(i => <option key={i.id} value={i.id}>{i.name}</option>)}</select></label>)}</div>}
      {!ready && !error && <p>讀取歷程中…</p>}{ready && !records.length && <p>此頁尚無紀錄，可留下真實學習內容。</p>}{records.map(r => <article className="card" key={r.id}><Link href={`/practice/records?record=${r.id}${itemId ? `&learningItem=${itemId}` : ""}`}>{r.title || r.whatIDid.slice(0, 60)}</Link><small>{r.practicedOn} · {r.status === "completed" ? "正文完成" : r.status === "archived" ? "封存" : "草稿"}</small><p>{r.whatIDid}</p></article>)}{cursor && !recent && <button disabled={busy} onClick={() => void more()}>下一頁</button>}{recent && <Link href={`/practice/records${itemId ? `?learningItem=${itemId}` : ""}`}>完整歷程／草稿／完成紀錄</Link>}</>}
    {!editing && <PracticeEventHistory learningItemId={itemId || undefined} recent={recent} />}
  </section>;
}
