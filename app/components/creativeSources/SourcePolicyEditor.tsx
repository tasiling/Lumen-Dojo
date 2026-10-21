'use client';
import {useEffect,useRef,useState} from 'react';
import {defaultPolicy,sourceKey,type SourceRef,type SourcePolicy,type PolicyInput,type Permission} from '@/lib/dojo/creativeSources/model';
import {get} from '../weaving/client';
import {useWeavingDraft} from '../weaving/useWeavingDraft';
import CreativeIcon from '../creative/CreativeIcon';
type Snapshot={policy:SourcePolicy|null;source:{label:string;href:string}};
type Draft={id:string;revision:number;discovery:Permission;publication:Permission};
const values=(id:string,p:SourcePolicy|null):Draft=>({id,revision:p?.revision??0,...(p?{discovery:p.discovery,publication:p.publication}:defaultPolicy())});
const DISCOVERY={allow:'可主動取材',ask:'逐次詢問',private:'只限自己查看'};
const PUBLICATION={allow:'可用於公開作品',ask:'每件成品確認',private:'不公開'};
const url=(ref:SourceRef)=>'/api/dojo/creative-source-settings?'+new URLSearchParams({ref:JSON.stringify(ref)});
function PolicyForm({target,initial}:{target:SourceRef;initial:Snapshot}){
 const id='source-policy:'+sourceKey(target),key='creative-source-pending:'+sourceKey(target);
 const [pending,setPending]=useState<PolicyInput|null>(()=>{try{const raw=sessionStorage.getItem(key);return raw?JSON.parse(raw):null;}catch{return null;}});
 const pendingRef=useRef(pending),[storageError,setStorageError]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[latest,setLatest]=useState<SourcePolicy|null|undefined>(undefined);
 const working=useRef(false);
 function retain(input:PolicyInput|null){
   try{if(input)sessionStorage.setItem(key,JSON.stringify(input));else sessionStorage.removeItem(key);}catch{throw Error('無法保存操作識別，尚未送出新的設定。請保留此頁並恢復瀏覽器儲存空間。');}
   pendingRef.current=input;setPending(input);
 }
 const draft=useWeavingDraft(values(id,initial.policy),async ticket=>{
   if(pendingRef.current)throw Error('請先核對原操作，或重送同一份原操作。');
   const input:PolicyInput={ref:target,discovery:ticket.value.discovery,publication:ticket.value.publication,expectedRevision:ticket.revision,operationId:crypto.randomUUID()};
   return values(id,await send(input));
 });
 async function send(input:PolicyInput):Promise<SourcePolicy>{
   setError('');setNotice('');
   retain(input); // Refuse dispatch if a reload could lose the operation identity.
   try{
     const r=await fetch('/api/dojo/creative-source-settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)}),j=await r.json();
     if(!r.ok){if(r.status>=400&&r.status<500)retain(null);throw Error(j.error??'來源設定未保存');}
     retain(null);setNotice('來源設定已保存。');setLatest(undefined);return j.policy;
   }catch(e){throw e;}
 }
 async function retry(){if(!pendingRef.current||working.current)return;working.current=true;setBusy(true);try{const p=await send(pendingRef.current);draft.reset(values(id,p));}catch(e){setError(e instanceof Error?e.message:String(e));}finally{working.current=false;setBusy(false);}}
 async function inspect(){if(!pendingRef.current||working.current)return;working.current=true;setBusy(true);setError('');try{
   const j=await get<{receipt:{state:string;policy?:SourcePolicy}|null}>('/api/dojo/creative-source-settings?'+new URLSearchParams({operationId:pendingRef.current.operationId}));
   if(j.receipt?.state==='confirmed'&&j.receipt.policy){retain(null);draft.reset(values(id,j.receipt.policy));setNotice('已確認原操作成功。');}
   else if(j.receipt?.state==='rejected'){retain(null);setNotice('原操作已確認未成功，輸入保留；請讀取最新設定比較。');}
   else setNotice(j.receipt?'結果仍未確認，請保留操作識別，待後台核對。':'尚未找到收據；可以重送同一份原操作。');
 }catch(e){setError(e instanceof Error?e.message:String(e));}finally{working.current=false;setBusy(false);}}
 async function compare(){if(working.current)return;working.current=true;setBusy(true);setError('');try{setLatest((await get<Snapshot>(url(target))).policy);}catch(e){setError(e instanceof Error?e.message:String(e));}finally{working.current=false;setBusy(false);}}
 // If storage could not be inspected, refuse creating a replacement operation.
 useEffect(()=>{try{sessionStorage.getItem(key);}catch{const t=setTimeout(()=>setStorageError(true),0);return()=>clearTimeout(t);}},[key]);
 const disabled=busy||draft.busy||Boolean(pending)||storageError;
 return <section className="creative-source-policy" aria-label="這份來源的許可"><h3><CreativeIcon name="eye"/>這份來源怎麼使用？</h3><p><a href={initial.source.href}>回到來源原處 →</a></p><p>兩個許可分開決定；不會套用到整本書、其他筆記或個人日記。你仍可自行查看並製作私人草稿。</p><div className="creative-policy-fields"><label htmlFor={id+'-discovery'}>點點主動取材<select aria-label="點點主動取材" id={id+'-discovery'} value={draft.value.discovery} disabled={disabled} onChange={e=>draft.edit({...draft.value,discovery:e.target.value as Permission})}>{Object.entries(DISCOVERY).map(([v,label])=><option key={v} value={v}>{label}</option>)}</select><small>只有「可主動取材」會進入後續提案的來源白名單。</small></label><label htmlFor={id+'-publication'}>來源公開方式<select aria-label="來源公開方式" id={id+'-publication'} value={draft.value.publication} disabled={disabled} onChange={e=>draft.edit({...draft.value,publication:e.target.value as Permission})}>{Object.entries(PUBLICATION).map(([v,label])=><option key={v} value={v}>{label}</option>)}</select><small>允許取材不代表允許公開；送往聊解室前仍要確認成品。</small></label></div><p role="status">{draft.busy||busy?'正在處理…':draft.dirty?'有未保存的來源設定':`已讀取修訂 ${draft.state.baseline.revision}（未設定時兩項皆需詢問）`}</p>
 <div className="wf-actions"><button className="primary" disabled={disabled||!draft.dirty} onClick={()=>void draft.save()}>保存來源設定</button><button disabled={disabled} onClick={()=>void compare()}>讀取最新設定比較</button></div>
 {latest!==undefined&&<div className="creative-policy-comparison"><b>最新修訂：{latest?.revision??0}</b><p>點點：{DISCOVERY[latest?.discovery??'ask']}；公開：{PUBLICATION[latest?.publication??'ask']}</p><p>你的選擇仍保留在上方。核對後再決定是否以最新修訂保存。</p><button disabled={disabled} onClick={()=>{const current=draft.value;draft.reapply(values(id,latest));draft.edit({...current,revision:latest?.revision??0});setLatest(undefined);}}>保留我的選擇並套用最新修訂</button></div>}
 {pending&&<div className="creative-policy-pending"><p role="status">有一筆尚待核對的操作，先確認結果再編輯。</p><p className="creative-operation-id">操作識別：{pending.operationId}</p><div className="wf-actions"><button disabled={busy||draft.busy} onClick={()=>void inspect()}>核對原操作結果</button><button disabled={busy||draft.busy} onClick={()=>void retry()}>重送同一份原操作</button></div></div>}
 {(error||draft.state.error||storageError)&&<p role="alert">{error||draft.state.error||'無法檢查瀏覽器中的原操作；請保留此頁，尚未送出新的設定。'}</p>}{notice&&<p role="status">{notice}</p>}</section>;
}
export default function SourcePolicyEditor({target}:{target:SourceRef}){
 const [data,setData]=useState<Snapshot|null>(null),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 useEffect(()=>{let active=true;get<Snapshot>(url(target)).then(v=>{if(active)setData(v);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[target.sourceType,target.sourceId,retry]); // eslint-disable-line react-hooks/exhaustive-deps
 return data?<PolicyForm key={sourceKey(target)} target={target} initial={data}/>:<div className="creative-source-policy">{error?<><p role="alert">{error}。尚未載入設定，不能覆寫。</p><button onClick={()=>{setError('');setRetry(n=>n+1);}}>重新讀取來源設定</button></>:<p role="status">正在讀取這份來源的設定…</p>}</div>;
}
