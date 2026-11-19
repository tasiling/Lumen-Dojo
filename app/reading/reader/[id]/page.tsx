"use client";
import {use, useEffect, useState} from "react";
import Link from "next/link";
import type {ReadingBook,ReadingNote} from "@/lib/reading/types";
import {discussionHref,type ReadingDiscussion} from "@/lib/reading/discussion";
import {readingSelectionLabel} from "@/lib/reading/content";
import {originalHref} from "@/lib/reading/clips";
import {coverFor,markOpened,shelfTitle,shelfAuthor} from "../../readerShelf";
import "../reader.css";
import { ReadingOutcomes } from "../../ReadingOutcomes";

type Archive={id:string;title:string;lines:string[]};
type RecordData={book:ReadingBook;notes:ReadingNote[];archives:Archive[];discussions:ReadingDiscussion[];discussionUnavailable:boolean};
type Hit={book:string;title:string;note:string;label:string;text:string;field:string};
function passages(data:RecordData){return data.notes.filter(n=>n.kind==="excerpt"||n.kind==="thought"||n.kind==="free"&&!n.text.includes("｜已完成的閱讀討論"));}
function archivesFor(data:RecordData,n:ReadingNote){return data.archives.filter(a=>a.lines.some(line=>line.includes("選段「"+n.text+"」")));}
function label(data:RecordData,n:ReadingNote){return readingSelectionLabel(data.book,n,archivesFor(data,n)[0]?.title.split("｜")[0]);}
function rounds(data:RecordData,n:ReadingNote){return data.discussions.flatMap(d=>d.rounds.filter(r=>r.source.noteId===n.id).map(r=>({d,r})));}
async function read<T,>(url:string,signal:AbortSignal):Promise<T>{const r=await fetch(url,{cache:"no-store",signal});if(!r.ok)throw Error("讀取失敗");return r.json();}
function Archived({item}:{item:Archive}){
  const sections:{title:string;lines:string[]}[]=[];
  for(const line of item.lines){
    if(/^(討論小結與待查問題|候選成果|逐字問答)/.test(line))sections.push({title:line,lines:[]});
    else sections.at(-1)?.lines.push(line);
  }
  function entries(lines:string[],heading:RegExp){
    const rows:{title:string;lines:string[]}[]=[];
    for(const line of lines){if(heading.test(line))rows.push({title:line,lines:[]});else rows.at(-1)?.lines.push(line);}
    return rows;
  }
  function renderLines(lines:string[]){return lines.map((v,i)=><p key={i}>{v}</p>);}
  return <details><summary>看已完成的討論 · {item.title.split("｜")[0]}</summary>{sections.map(s=>{
    if(s.title.startsWith("候選成果")){
      const items=entries(s.lines,/^\d+[．.]\s*/);
      if(items.length)return ["觀點","洞察卡"].map(kind=>{
        const group=items.filter(item=>item.title.includes(kind));
        return <details key={kind}><summary>待挑選的{kind} · {group.length}</summary>{group.map(c=><div key={c.title}><small>{c.title}</small><p>{c.lines[0]}</p><details><summary>查看依據原句與行動</summary>{renderLines(c.lines.slice(1))}</details></div>)}</details>;
      });
    }
    if(s.title==="逐字問答"){
      const turns=entries(s.lines,/^T\d+ · (我|GPT)$/);
      if(turns.length)return <details key={s.title}><summary>逐字問答 · {turns.length} 則</summary>{turns.map(t=><details key={t.title}><summary>{t.title} · {t.lines[0]?.slice(0,18)}</summary>{renderLines(t.lines)}</details>)}</details>;
    }
    return <details key={s.title}><summary>{s.title}</summary>{renderLines(s.lines)}</details>;
  })}{!sections.length&&renderLines(item.lines)}</details>;
}
function NoteSearch({data}:{data:RecordData}){
  const [q,setQ]=useState(()=>new URLSearchParams(location.search).get("find")||""),[records,setRecords]=useState<RecordData[]>([data]),[status,setStatus]=useState("正在讀取書單…");
  useEffect(()=>{const c=new AbortController();
    async function index(){const {books}=await read<{books:ReadingBook[]}>("/api/dojo/reading/books",c.signal);let failed=0;
      for(const b of books.filter(b=>b.id!==data.book.id)){try{const record=await read<RecordData>("/api/dojo/reading/reader/"+b.id,c.signal);if(!c.signal.aborted)setRecords(prev=>[...prev,record]);}catch{if(c.signal.aborted)return;failed++;}}
      if(!c.signal.aborted)setStatus(failed?failed+" 本暫時無法搜尋":"");
    }void index().catch(()=>{if(!c.signal.aborted)setStatus("書單暫時無法讀取");});return()=>c.abort();
  },[data]);
  const hits:Hit[]=[];const term=q.trim().toLowerCase();
  if(term)for(const record of records)for(const n of passages(record)){
    const fields:[string,string][]=[["選段",label(record,n)],[n.kind==="excerpt"?"書中原文":"我的想法",n.text],["我的想法",n.metadata.reflection||""]];
    for(const {r} of rounds(record,n))for(const t of r.result?.turns||[])if(t.role==="我")fields.push(["我的發言",t.text]);
    for(const a of archivesFor(record,n)){let mine=false;for(const l of a.lines){if(/^T\d+ · /.test(l)){mine=l.endsWith(" · 我");continue;}if(mine)fields.push(["我的發言",l]);}}
    const match=fields.find(([,s])=>s.toLowerCase().includes(term));if(!match)continue;
    const pos=match[1].toLowerCase().indexOf(term);hits.push({book:record.book.id,title:record.book.title,note:n.id,label:label(record,n),field:match[0],text:match[1].slice(Math.max(0,pos-12),pos+term.length+30)});
  }
  return <section><h2>跨書找筆記</h2><input type="search" aria-label="搜尋閱讀筆記" placeholder="搜尋原文、想法或我的發言" value={q} onChange={e=>{setQ(e.target.value);const url=new URL(location.href);url.searchParams.set("find",e.target.value);history.replaceState(history.state,"",url);}}/><small role="status">{status}　{term&&hits.length+" 則選段"}</small>{hits.map(h=><a className="rr-hit" key={h.note} href={"/reading/reader/"+h.book+"?note="+h.note}><small>{h.title} · {h.field}</small><b>{h.label}</b>{h.text}</a>)}</section>;
}
export default function Reader({params}:{params:Promise<{id:string}>}){
  const {id}=use(params);const [data,setData]=useState<RecordData|null>(null),[error,setError]=useState(""),[open,setOpen]=useState(""),[last,setLast]=useState(""),[search,setSearch]=useState(false);
  useEffect(()=>{const c=new AbortController();void read<RecordData>("/api/dojo/reading/reader/"+id,c.signal).then(d=>{if(c.signal.aborted)return;setData(d);setError("");setSearch(new URLSearchParams(location.search).has("find"));setOpen(new URLSearchParams(location.search).get("note")||"");try{setLast(localStorage.getItem("rr-"+id)||"");}catch{}markOpened(d.book.id);}).catch(()=>{if(!c.signal.aborted)setError("筆記暫時無法載入");});return()=>c.abort();},[id]);
  useEffect(() => {
    if (data && location.hash === "#reading-outcomes") document.getElementById("reading-outcomes")?.scrollIntoView({ block: "start" });
  }, [data]);
  if(error)return <section className="screen">{error} <button onClick={()=>location.reload()}>重試</button></section>;
  if(!data||data.book.id.replaceAll("-","")!==id.replaceAll("-",""))return <p className="screen">正在翻開閱讀筆記…</p>;
  const {book}=data, notes=passages(data), workspace="/reading/books/"+book.id;
  function select(key:string){setOpen(key);if(key){setLast(key);try{localStorage.setItem("rr-"+id,key);}catch{}}}
  return <main className="screen rr"><small className="rr-crumb">修習所・心知</small><header className="rr-head"><h1>閱讀筆記</h1><button onClick={()=>{const url=new URL(location.href);if(search)url.searchParams.delete("find");else url.searchParams.set("find","");history.replaceState(history.state,"",url);setSearch(!search);}}>{search?"回到本書":"跨書找筆記"}</button></header>{search?<NoteSearch data={data}/>:<><div className="rr-title">{coverFor(book)&&<img alt="" src={coverFor(book)}/>}<div><h2>{shelfTitle(book)}</h2><p>{shelfAuthor(book)}</p></div><Link className="rr-switch" href={"/reading?"+new URLSearchParams(location.search).toString()}>換書 ⌄</Link></div><header><h2>第 {book.readCount||1} 次閱讀</h2><small>{notes.length} 則選段</small></header>
  {data.discussions.some(thread=>thread.rounds.some(round=>round.result?.candidates.length))&&<a className="rr-outcomes-link" href="#reading-outcomes">觀點與洞察 ↓</a>}
  {last&&last!==open&&notes.some(n=>n.id===last)&&<button onClick={()=>{select(last);requestAnimationFrame(()=>document.getElementById(last)?.scrollIntoView({block:"center"}));}}>回到上次選段</button>}
  {data.discussionUnavailable&&<p role="status">即時討論紀錄暫時無法載入。</p>}
  {notes.map((n,i)=>{const m=n.metadata;const archived=archivesFor(data,n), linked=rounds(data,n);return <div key={n.id}>{m.chapter&&m.chapter!==notes[i-1]?.metadata.chapter&&<h3>{m.chapter}</h3>}<article id={n.id}><button className="rr-row" aria-expanded={open===n.id} onClick={()=>select(open===n.id?"":n.id)}><b>{label(data,n)}</b>{open!==n.id&&<span>{n.text}</span>}<small>{[m.highlightColor&&m.highlightColor+"畫線",m.reflection&&"有我的想法",(archived.length>0||linked.some(x=>x.r.result?.status==="完成"))&&"討論已完成"].filter(Boolean).join(" · ")}</small></button>{open===n.id&&<section><small>{n.kind==="excerpt"?"書中原文":"我的筆記"} {m.location}</small><blockquote data-color={m.highlightColor}>{n.text}</blockquote>{m.reflection&&<aside><small>我當時的想法</small><p>{m.reflection}</p></aside>}{m.sourceFiles?.map((file,j)=><a key={file} href={"https://chatgpt.com/library?account_id=personal&file_id="+encodeURIComponent(file)} target="_blank" rel="noreferrer">來源截圖 {j+1} ↗　</a>)}{(m.clipSourceIds||[m.clipPageId]).filter(Boolean).map((file,j)=><a key={file} href={originalHref(file!)} target="_blank" rel="noreferrer">剪藏原圖 {j+1} ↗　</a>)}{archived.filter(a=>!linked.some(({r})=>r.archiveId===a.id)).map(a=><Archived key={a.id} item={a}/>)}{linked.map(({d,r})=><Link key={r.id} href={discussionHref({bookId:book.id,discussionId:d.id,roundId:r.id},n.id)}>{r.result?.status==="完成"?"看已完成的討論":"接續討論"} · {r.question||r.source.label}</Link>)}<Link href={workspace+"?discussion=&note="+n.id}>和 GPT 討論</Link></section>}</article></div>})}
  {!notes.length&&<p>這一讀還沒有選段。</p>}<ReadingOutcomes discussions={data.discussions}/><Link className="rr-work" href={workspace+"?manage=1"}>新增筆記與閱讀管理 →</Link></>}</main>;
}
