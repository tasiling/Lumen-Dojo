"use client";
import { useEffect, useState } from "react";
import { mondayOf, taipeiTodayISO, type WeeklyBoard } from "@/lib/dojo/formal";
import type { TargetBinding } from "@/lib/dojo/practiceEvents/model";
export default function JournalTargetPicker({ value, onChange }: { value: TargetBinding | null; onChange: (value: TargetBinding | null) => void }) {
 const [board,setBoard]=useState<WeeklyBoard|null>(null),[error,setError]=useState("");
 useEffect(()=>{let live=true;fetch(`/api/dojo/bingo?week=${mondayOf(taipeiTodayISO())}`,{cache:"no-store"}).then(async r=>{const j=await r.json();if(!r.ok)throw Error(j.error??"週盤不可用");if(live)setBoard(j.board);}).catch(e=>{if(live)setError(e.message);});return()=>{live=false;};},[]);
 const ids=board?.cells.map(c=>c.taskInstanceId)??[];
 const choices=board&&!board.archivedAt?board.cells.filter(c=>c.taskInstanceId&&!c.taskInstanceId.startsWith("legacy:")&&ids.filter(id=>id===c.taskInstanceId).length===1&&c.text.trim()&&c.completion.unit==="段"&&["single","count"].includes(c.completion.mode)):[];
 return <details><summary>週盤成果連結（選填）</summary><p>只連結已安排、單位為「段」的明確任務。不選擇就保持未連結。</p>{error&&<p role="alert">{error}；日記完成仍可保存。</p>}<label>連結任務<select value={value?.taskInstanceId??""} onChange={e=>onChange(e.target.value&&board?{weekStart:board.weekStart,taskInstanceId:e.target.value}:null)}><option value="">不連結週盤</option>{choices.map(c=><option key={c.taskInstanceId} value={c.taskInstanceId!}>{c.text}</option>)}</select></label></details>;
}
