"use client";
import type { ReactNode } from "react";
import type { LearningRecord } from "@/lib/dojo/learningRecords/model";
import Link from "./PracticeRouteLink";
export default function PracticeRecentRecords({records,ready,error,itemId='',children,events}:{records:LearningRecord[];ready:boolean;error:string;itemId?:string;children?:ReactNode;events?:ReactNode}) {
  return <section className="practice-panel practice-recent-records" aria-label="最近修習">
    <div className="practice-panel-head"><h2>最近修習</h2><Link className="practice-text-link" href={`/practice/records${itemId ? `?learningItem=${encodeURIComponent(itemId)}` : ''}`}>完整學習歷程 <span aria-hidden="true">›</span></Link></div>
    {error && <p role="alert">{error}{records.length ? '；下方保留已讀取的紀錄。' : ''}</p>}{!ready && !error ? <p role="status">正在讀取學習紀錄…</p> : ready && !records.length && !error ? <div className="practice-empty"><b>這裡還沒有學習紀錄。</b><p>留下一筆後，可以回到這裡查看。</p></div> : records.map(r=><article className="practice-history-entry" key={r.id}><Link href={`/practice/records?record=${r.id}${itemId ? `&learningItem=${encodeURIComponent(itemId)}` : ''}`}><b>{r.title || r.whatIDid.slice(0,60)}</b><small>{r.practicedOn}・{r.status==='completed'?'正文完成':r.status==='archived'?'封存':'草稿'}</small><p className="practice-record-preview">{r.whatIDid}</p></Link></article>)}
    <Link className="primary practice-record-create" href={`/practice/records?new=1${itemId ? `&learningItem=${encodeURIComponent(itemId)}` : ''}`}>留下學習紀錄</Link>
    {children}
    <details className="practice-event-details"><summary>活動完成紀錄</summary>{events}</details>
  </section>;
}
