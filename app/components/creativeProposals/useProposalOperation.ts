'use client';
import {useRef,useState} from 'react';
import {get} from '../weaving/client';
type Input=Record<string,unknown>&{operationId:string};
const key='creative-proposal-operation';
const message=(input:Input)=>input.action==='edit'?'提案修改已保存。':input.action==='settings'?'找題設定已保存。':input.action==='skip'?'已略過這份提案。':'原操作已完成。';
export function useProposalOperation(onRecovered:(input:Input,result:Record<string,unknown>)=>Promise<void>){
 const [initial]=useState(()=>{try{const raw=sessionStorage.getItem(key),pending=raw?JSON.parse(raw) as Input:null;if(pending&&(typeof pending.operationId!=='string'||typeof pending.action!=='string'))throw Error();return{pending,broken:false};}catch{return{pending:null,broken:true};}});
 const [pending,setPending]=useState(initial.pending),ref=useRef(initial.pending),[busy,setBusy]=useState(false),inFlight=useRef(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 function retain(input:Input|null){try{if(input)sessionStorage.setItem(key,JSON.stringify(input));else sessionStorage.removeItem(key);}catch{throw Error('無法保存操作識別，尚未送出新的操作；請保留此頁並恢復瀏覽器儲存空間。');}ref.current=input;setPending(input);}
 async function send(input:Input){if(inFlight.current)throw Error('操作正在處理');inFlight.current=true;setBusy(true);setError('');setNotice('');try{
  retain(input);const r=await fetch('/api/dojo/creative-proposals',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)}),j=await r.json();
  if(!r.ok){if(r.status>=400&&r.status<500){try{const check=await get<{receipt:{state:string}|null}>('/api/dojo/creative-proposals?operationId='+input.operationId);if(check.receipt===null||check.receipt.state==='rejected')retain(null);}catch{/* Keep unresolved identity if read-only verification is unavailable. */}}throw Error(j.error??'提案操作尚未完成');}
  retain(null);setNotice(message(input));return j as Record<string,unknown>;
 }catch(e){setError(e instanceof Error?e.message:String(e));throw e;}finally{inFlight.current=false;setBusy(false);}}
 async function execute(input:Record<string,unknown>){if(initial.broken)throw Error('無法讀取原操作，請先核對這個分頁');if(ref.current)throw Error('請先核對原操作，避免重複建立');return send({...input,operationId:crypto.randomUUID()});}
 async function retry(){if(!ref.current)return;const input=ref.current;try{await onRecovered(input,await send(input));}catch{/* Error is retained beside the original operation. */}}
 async function inspect(){if(!ref.current||inFlight.current)return;const input=ref.current;inFlight.current=true;setBusy(true);setError('');try{
  const j=await get<{receipt:{state:string;result:Record<string,unknown>}|null}>('/api/dojo/creative-proposals?operationId='+input.operationId);
  if(j.receipt?.state==='confirmed'){retain(null);await onRecovered(input,j.receipt.result);setNotice('已確認原操作成功。');}
  else if(j.receipt?.state==='rejected'){retain(null);setNotice('原操作未完成，輸入保留；請比較保存版本後接續。');}
  else setNotice(j.receipt?'原操作仍待核對，不會另開操作重送。':'尚未找到收據，可以重送原操作。');
 }catch(e){setError(e instanceof Error?e.message:String(e));}finally{inFlight.current=false;setBusy(false);}}
 return {execute,retry,inspect,pending,busy,error:initial.broken?'無法讀取這個分頁的原操作，尚未送出新操作。':error,notice,blocked:busy||Boolean(pending)||initial.broken};
}
export type ProposalOperation=ReturnType<typeof useProposalOperation>;
