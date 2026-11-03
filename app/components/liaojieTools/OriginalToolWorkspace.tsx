'use client';
import Link from 'next/link';
import {useCallback,useEffect,useRef,useState} from 'react';
import type {ToolRealm} from '@/lib/liaojieTools/catalog';
import {readTool,saveTool,validSnapshot,type ToolSnapshot} from '@/lib/liaojieTools/snapshot';

function frameDocument(html:string, bridge:string, tool:string, token:string, snapshot:ToolSnapshot|null) {
  const config = JSON.stringify({tool,token,snapshot}).replaceAll('<','\\u003c');
  const csp = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data: blob:; connect-src 'none'; form-action 'none'; base-uri 'none'";
  const before = `<meta http-equiv="Content-Security-Policy" content="${csp}"><script>window.__LUMEN_TOOL__=${config};${bridge}</script>`;
  return html.replace(/<head>/i,'<head>'+before);
}
export default function OriginalToolWorkspace({tool,name,html,bridge,realm='liaojie'}:{tool:string;name:string;html:string;bridge:string;realm?:ToolRealm}) {
  const frame=useRef<HTMLIFrameElement>(null), current=useRef<ToolSnapshot|null>(null), revision=useRef(0), serialized=useRef(''), token=useRef('');
  const pending=useRef<ToolSnapshot|null>(null), saving=useRef(false), blocked=useRef(false), dirty=useRef(false);
  const [src,setSrc]=useState(''),[status,setStatus]=useState('正在讀取裝置草稿…'),[error,setError]=useState(''),[ready,setReady]=useState(false),[canBackup,setCanBackup]=useState(false);
  const input=useRef<HTMLInputElement>(null);
  const [frameHeight,setFrameHeight]=useState(650);
  const mount=useCallback((snapshot:ToolSnapshot|null)=>{
    token.current=crypto.randomUUID();setReady(false);current.current=snapshot;setCanBackup(!!snapshot);
    serialized.current=snapshot?JSON.stringify(snapshot):'';pending.current=null;
    setSrc(frameDocument(html,bridge,tool,token.current,snapshot));
  },[html,bridge,tool]);
  useEffect(()=>{
    let active=true;
    readTool(tool).then(record=>{if(!active)return;revision.current=record?.revision??0;mount(record?.snapshot??null);setStatus(record?'已讀取裝置草稿':'尚無草稿，開始編寫後自動保存');}).catch(()=>{if(active){blocked.current=true;setError('無法讀取裝置儲存，先保留目前視窗並下載草稿備份。');mount(null);}});
    return()=>{active=false;};
  },[tool,mount]);
  const flush=useCallback(async()=>{
    if(saving.current||blocked.current||!pending.current)return;
    saving.current=true;
    try {
      while(pending.current&&!blocked.current){
        const snapshot=pending.current;pending.current=null;setStatus('正在保存到這個裝置…');
        revision.current=await saveTool(tool,revision.current,snapshot);
        if(serialized.current===JSON.stringify(snapshot)){dirty.current=false;setStatus('已保存到這個裝置');}
      }
    } catch(reason){blocked.current=true;dirty.current=true;setError(reason instanceof Error?reason.message:String(reason));setStatus('目前修改尚未保存');}
    finally{saving.current=false;}
  },[tool]);
  useEffect(()=>{
    function receive(event:MessageEvent){
      if(event.source!==frame.current?.contentWindow||event.data?.lumenTool!==token.current)return;
      if(event.data.type==='ready'){setReady(true);return;}
      if(tool!=='carousel'&&event.data.type==='resize'&&Number.isFinite(event.data.height)){setFrameHeight(Math.max(300,Math.min(100000,event.data.height)));return;}
      if(event.data.type==='error'){setError(event.data.message);return;}
      if(event.data.type==='dirty'){dirty.current=true;setStatus('有修改，正在準備保存…');return;}
      if(event.data.type!=='snapshot'||!validSnapshot(event.data.snapshot,tool))return;
      const snapshot=event.data.snapshot as ToolSnapshot,key=JSON.stringify(snapshot);
      current.current=snapshot;setCanBackup(true);
      if(key===serialized.current){
        if(!pending.current&&!saving.current&&!blocked.current){dirty.current=false;setStatus('已保存到這個裝置');}
        return;
      }
      serialized.current=key;dirty.current=true;pending.current=snapshot;void flush();
    }
    function beforeLeave(event:BeforeUnloadEvent){if(dirty.current){event.preventDefault();event.returnValue='';}}
    addEventListener('message',receive);addEventListener('beforeunload',beforeLeave);
    return()=>{removeEventListener('message',receive);removeEventListener('beforeunload',beforeLeave);};
  },[tool,flush]);
  async function backup(){
    try {
      // Capture on demand so clicking immediately after typing never downloads the previous poll's draft.
      const snapshot=await new Promise<ToolSnapshot>((resolve,reject)=>{
        const requestId=crypto.randomUUID();
        const cleanup=()=>{clearTimeout(timeout);removeEventListener('message',receive);};
        const receive=(event:MessageEvent)=>{
          if(event.source!==frame.current?.contentWindow||event.data?.lumenTool!==token.current||event.data.requestId!==requestId||!validSnapshot(event.data.snapshot,tool))return;
          cleanup();resolve(event.data.snapshot);
        };
        const timeout=setTimeout(()=>{cleanup();reject(new Error('無法擷取最新內容，請稍後再下載草稿備份'));},8000);
        addEventListener('message',receive);frame.current?.contentWindow?.postMessage({lumenTool:token.current,type:'capture',requestId},'*');
      });
      const url=URL.createObjectURL(new Blob([JSON.stringify(snapshot)],{type:'application/json'}));
      const a=document.createElement('a');a.href=url;a.download=`liaojie-${tool}-backup.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    }catch(reason){setError(reason instanceof Error?reason.message:String(reason));}
  }
  async function restore(file:File){
    try{
      if(file.size>50*1024*1024)throw new Error('備份超過50MiB，未替換目前內容');
      const snapshot:unknown=JSON.parse(await file.text());
      if(!validSnapshot(snapshot,tool))throw new Error('這不是目前工具的有效備份，目前內容保持不變');
      if(!confirm('以這份備份替換目前工具內容？建議先下載目前內容備份。'))return;
      if(saving.current)throw new Error('正在保存，請稍後再匯入');
      // Validate and persist before replacing the visible frame; a conflict cannot discard the current draft.
      revision.current=await saveTool(tool,revision.current,snapshot);
      blocked.current=false;dirty.current=false;setError('');mount(snapshot);setStatus('已還原並保存到這個裝置');
    }catch(reason){setError(reason instanceof Error?reason.message:String(reason));}
  }
  async function reloadSaved(){
    if(!confirm('載入這個瀏覽器已保存的草稿？目前視窗尚未保存的修改會被替換，請先下載草稿備份。'))return;
    try{const record=await readTool(tool);if(saving.current)return;revision.current=record?.revision??0;blocked.current=false;dirty.current=false;setError('');mount(record?.snapshot??null);setStatus('已載入本機草稿');}catch{setError('仍無法載入本機草稿，目前內容保持不變');}
  }
  return <section className="original-tool-workspace">
    <header className="original-workspace-header">
      <Link className="original-workspace-back" href={`/${realm}/tools`} onClick={event=>{if(dirty.current&&!confirm('目前修改尚未保存。請先下載草稿備份；仍要離開？'))event.preventDefault();}}>← {realm==='weaving'?'織光堂工具':'聊解室工具'}</Link>
      <span className="original-workspace-eyebrow">{realm==='weaving'?'織光堂':'聊解室'} · 創作工具</span>
      <h1>{name}</h1>
      <p className="original-save-status" role="status">{status}</p>
      <details className="original-backup-panel"><summary>裝置保存與備份</summary>
        <p className="original-local-note">草稿僅保存在這個瀏覽器，未跨裝置同步。換裝置前請下載草稿備份；工具內的專案、圖片與文字下載仍可使用。</p>
        <div className="original-workspace-actions"><button onClick={()=>void backup()} disabled={!ready||!canBackup}>下載草稿備份</button><button onClick={()=>input.current?.click()} disabled={!ready}>從備份恢復草稿</button><button onClick={()=>void reloadSaved()} disabled={!ready}>載入本機草稿</button></div>
      </details>
      <input ref={input} aria-label="選擇草稿備份檔案" type="file" accept=".json,application/json" hidden onChange={event=>{const file=event.target.files?.[0];if(file)void restore(file);event.target.value='';}}/>
      {error&&<p role="alert">{error}</p>}
    </header>
    {src&&<iframe ref={frame} title={name} srcDoc={src} sandbox="allow-scripts allow-downloads allow-modals" className={"original-tool-frame"+(tool==='carousel'?' original-tool-frame--viewport':'')} style={{height:tool==='carousel'?'calc(100dvh - 110px)':frameHeight}}/>}
  </section>;
}
