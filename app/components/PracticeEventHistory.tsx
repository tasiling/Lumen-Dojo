"use client";
import { useEffect, useState } from "react";
import type { CompletionEvent } from "@/lib/dojo/practiceEvents/model";
import Link from "./PracticeRouteLink";
export default function PracticeEventHistory({ learningItemId, recent = false }: { learningItemId?: string; recent?: boolean }) {
  const [events,setEvents]=useState<CompletionEvent[]>([]);const [error,setError]=useState("");const [cursor,setCursor]=useState<string|null>(null);const [busy,setBusy]=useState(false);const [loaded,setLoaded]=useState(false);
  async function read(url:string) {const r=await fetch(url,{cache:"no-store"});const j=await r.json();if(!r.ok)throw Error(j.error??"完成事件不可用");return j;}
  useEffect(()=>{let live=true;read(`/api/dojo/practice-events${learningItemId?`?learningItemId=${learningItemId}`:""}`).then(j=>{if(live){setEvents(j.events);setCursor(j.cursor);setLoaded(true);}}).catch(e=>{if(live)setError(e.message);});return()=>{live=false;};},[learningItemId]);
  async function retry(id:string){setBusy(true);setError("");try{const r=await fetch("/api/dojo/practice-events",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"retry",id})});const j=await r.json();if(!r.ok)throw Error(j.error);setEvents(es=>es.map(e=>e.id===id?j.event:e));}catch(e){setError(String(e));}finally{setBusy(false);}}
  async function more(){setBusy(true);try{const p=new URLSearchParams({cursor:cursor!});if(learningItemId)p.set("learningItemId",learningItemId);const j=await read(`/api/dojo/practice-events?${p}`);setEvents(es=>[...es,...j.events]);setCursor(j.cursor);}catch(e){setError(String(e));}finally{setBusy(false);}}
  const labels={pending:"待投影",applied:"已套用",needs_retry:"需重試",unlinked:"未連結",unmatched:"單位／規則未匹配"};
  return <section><h3>實際完成事件</h3><p>完成一次活動，不表示能力已學成。</p>{error&&<p role="alert">{error}</p>}{loaded&&!events.length&&<p>尚無完成事件。舊 activityLog 不自動轉為完成事實。</p>}{(recent?events.slice(0,5):events).map(e=><article className="card" key={e.id}><b>日記自譯・{e.quantity} {e.unit}</b><p>實際修習 {e.practicedOn} · 原始日記 {e.sourceDate}</p><p>光步：{labels[e.projections.output]} · 週盤：{labels[e.bindingStatus ?? e.projections.weekly]}</p><Link href={`/practice/records?record=${e.learningRecordId}`}>查看學習正文</Link>{["pending","needs_retry"].includes(e.projectionStatus)&&<button disabled={busy} onClick={()=>void retry(e.id)}>只重試投影</button>}{e.error&&<p role="alert">{e.error}</p>}</article>)}{cursor&&!recent&&<button disabled={busy} onClick={()=>void more()}>更多完成事件</button>}</section>;
}
