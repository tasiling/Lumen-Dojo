"use client";
import Link from "next/link";
import {useSearchParams} from "next/navigation";
import {useEffect,useState} from "react";
import {useDojo} from "@/lib/dojo/store";
import {STATUS_LABELS,type LearningEntity,type FoundationSnapshot} from "@/lib/dojo/learningFoundation/model";
import type {LearningTrackRecord} from "@/lib/dojo/learning";
const sorted=(e:LearningEntity[])=>[...e].sort((a,b)=>a.order-b.order);
export default function PracticeLearning(){
 const params=useSearchParams();const requested=params.get("learningItem");const tab=params.get("tab")??"overview";
 const [data,setData]=useState<FoundationSnapshot|null>(null);const [tracks,setTracks]=useState<LearningTrackRecord[]>([]);const [error,setError]=useState("");const [legacyError,setLegacyError]=useState("");
 const {entries,entriesError,openQuickAdd}=useDojo();
 useEffect(()=>{let live=true;async function read(url:string){const r=await fetch(url,{cache:"no-store"});const j=await r.json();if(!r.ok)throw Error(j.error??"學習資料不可用");return j;}
 read("/api/dojo/learning/foundation").then(j=>{if(live)setData(j);}).catch(e=>{if(live)setError(e.message);});read("/api/dojo/learning").then(j=>{if(live)setTracks(j.tracks);}).catch(e=>{if(live)setLegacyError(e.message);});return()=>{live=false;};},[]);
 const items=sorted(data?.entities.filter(e=>e.kind==="item")??[]);const item=requested?items.find(e=>e.id===requested||e.legacyKey===requested):undefined;
 function href(id:string,t="overview"){const q=new URLSearchParams(params.toString());q.set("learningItem",id);q.set("tab",t);return `/practice/learning?${q}`;}
 function record(){if(item)openQuickAdd({presetSpace:"practice",presetKind:`學習／${item.name}`,learningItemId:item.id});}
 const legacy=tracks.find(t=>t.key===item?.legacyKey);const stages=sorted(data?.entities.filter(e=>e.kind==="stage"&&e.itemId===item?.id)??[]);const topics=sorted(data?.entities.filter(e=>e.kind==="topic"&&e.itemId===item?.id)??[]);
 const toolsReturn=item?href(item.id,"tools"):"/practice/learning";
 return <><div className="learning-heading"><div><h1>心・知</h1><p>本期專注與全部學科，依自己的步調探索。</p></div><Link href={`/practice/manage${item?`?learningItem=${item.id}`:""}`}>管理學習項目</Link></div>
 {error?<p role="alert">{error}</p>:!data?<p>讀取學科中…</p>:<>{!item&&<><h2>本期專注</h2><div className="practice-shortcuts">{items.filter(e=>e.focused&&e.status==="active").map(e=><Link className="card practice-link" key={e.id} href={href(e.id)}>{e.name}</Link>)}</div>{!items.some(e=>e.focused&&e.status==="active")&&<p>尚未指定本期專注，可在管理頁選擇多項。</p>}</>}
 <details open={!item}><summary>全部學科（{items.length}）</summary><div className="practice-shortcuts">{items.map(e=><Link className="card practice-link" key={e.id} href={href(e.id)}><b>{e.name}</b><small>{STATUS_LABELS[e.status]}</small></Link>)}</div></details>
 {requested&&!item&&<p role="alert">此學科待確認或無法存取，沒有刪除歷史關聯。</p>}
 {item&&<section><h2>{item.name}</h2><nav className="practice-tabs" aria-label="學科分頁">{[["overview","總覽"],["path","學習路徑"],["tools","修習工具"],["logs","學習紀錄"]].map(([key,label])=><Link key={key} aria-current={tab===key?"page":undefined} href={href(item.id,key)}>{label}</Link>)}</nav>
 {tab==="overview"&&<><p>{item.description||"尚未填寫說明。"}</p><h3>長期願景</h3><p>{item.vision||"保留探索空間，尚未指定願景。"}</p>{legacy&&<div className="card"><p>目前階段：{legacy.currentStage}</p><p>目前專注：{legacy.currentFocus||"尚未指定"}</p><p>下一步：{legacy.nextAction||"尚未指定"}</p></div>}<button className="primary" onClick={record}>開始修習・留下紀錄</button></>}
 {tab==="path"&&<><p>階段是能力養成結構，沒有逐關解鎖。</p>{!stages.length&&!topics.length&&<p>空白路徑也能開始修習，尚無階段或主題。</p>}{stages.map(s=><article className="card" key={s.id}><h3>{s.name}</h3><small>{STATUS_LABELS[s.status]}</small><p>{s.description}</p><p>學習目標：{s.goal||"尚未指定"}</p><p>預期成果：{s.expectedOutcome||"尚未指定"}</p>{topics.filter(t=>t.stageId===s.id).map(t=><div key={t.id}><b>{t.name}</b><small>{STATUS_LABELS[t.status]}</small><p>{t.description}</p><p>{t.goal}</p><p>{t.expectedOutcome}</p></div>)}</article>)}{topics.filter(t=>!t.stageId||!stages.some(s=>s.id===t.stageId)).map(t=><article className="card" key={t.id}><h3>{t.name}</h3><p>尚未指定階段 · {STATUS_LABELS[t.status]}</p><p>{t.description}</p><p>{t.goal}</p><p>{t.expectedOutcome}</p></article>)}<button onClick={record}>留下修習紀錄</button></>}
 {tab==="tools"&&<div className="practice-shortcuts">{item.legacyKey==="english"&&[["context","語境修習室"],["vocabulary","VocabForge"],["journal","日記自譯"],["grammar","句型語法"],["topic","英文主題練習"],["rhythm","英文節奏"]].map(([key,label])=><Link className="card practice-link" key={key} href={`/practice/${key}?returnTo=${encodeURIComponent(toolsReturn)}`}>{label}</Link>)}<Link className="card practice-link" href={`/reading?returnTo=${encodeURIComponent(toolsReturn)}`}>閱讀筆記</Link><Link className="card practice-link" href="/forage">野採素材</Link><button onClick={record}>留下學習紀錄</button></div>}
 {tab==="logs"&&<>{entriesError&&<p role="alert">{entriesError}</p>}{legacyError&&<p role="alert">{legacyError}</p>}{entries.filter(e=>e.space==="practice"&&(e.learningItemId===item.id||(!e.learningItemId&&e.kind===`學習／${item.name}`))).map(e=><button className="card practice-link" key={e.id} onClick={()=>openQuickAdd({editId:e.id})}><b>{e.title}</b><small>{e.date}</small></button>)}{legacy?.activityLog.map(a=><article className="card" key={a.id}><b>{a.skill}</b><p>{a.weekStart} · {a.evidenceNote}</p></article>)}<p>尚無紀錄時，可從工具或此處留下真實修習紀錄。</p><button onClick={record}>留下學習紀錄</button></>}
 <details><summary>進階資料</summary><small>ID：{item.id} · revision {item.revision}</small></details></section>}
 </>}{legacyError&&tab!=="logs"&&<p role="alert">舊學習紀錄讀取失敗：{legacyError}</p>}</>;
}
