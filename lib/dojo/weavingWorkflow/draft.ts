export type DraftEntity = {id:string;revision:number};
export type SaveTicket<T> = {entityId:string;sequence:number;revision:number;value:T};
export type DraftState<T extends DraftEntity> = {entityId:string;baseline:T;value:T;editSequence:number;status:'idle'|'saving'|'saved'|'error';error:string|null;errorOperationId?:string};
export function createDraft<T extends DraftEntity>(value:T):DraftState<T>{return{entityId:value.id,baseline:value,value,editSequence:0,status:'idle',error:null};}
export function dirtyDraft<T extends DraftEntity>(s:DraftState<T>){return JSON.stringify(s.value)!==JSON.stringify(s.baseline);}
export function editDraft<T extends DraftEntity>(s:DraftState<T>,value:T):DraftState<T>{return{...s,value,editSequence:s.editSequence+1,status:'idle',error:null};}
export function beginSave<T extends DraftEntity>(s:DraftState<T>):SaveTicket<T>{return{entityId:s.entityId,sequence:s.editSequence,revision:s.baseline.revision,value:structuredClone(s.value)};}
const equal=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const record=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
function merge(sent:unknown,current:unknown,server:unknown,key=''):unknown{
 if(equal(sent,current))return server;
 if(['selectionRequests','manualSelections','selectedPreviews'].includes(key)&&Array.isArray(sent)&&Array.isArray(current)&&Array.isArray(server)&&!server.length){
  const submitted=new Map<string,number>();for(const v of sent){const k=JSON.stringify(v);submitted.set(k,(submitted.get(k)??0)+1);}return current.filter(v=>{const k=JSON.stringify(v),n=submitted.get(k)??0;if(n){submitted.set(k,n-1);return false;}return true;});
 }
 if(record(sent)&&record(current)&&record(server)){return Object.fromEntries([...new Set([...Object.keys(server),...Object.keys(current)])].map(k=>[k,merge(sent[k],current[k],server[k],k)]));}
 return current;
}
export function acceptSave<T extends DraftEntity>(s:DraftState<T>,ticket:SaveTicket<T>,server:T):DraftState<T>{
 if(s.entityId!==ticket.entityId||server.id!==ticket.entityId||server.revision<s.baseline.revision)return s;
 const value=s.editSequence===ticket.sequence?server:({...merge(ticket.value,s.value,server) as T,revision:server.revision});
 return{...s,baseline:server,value,status:s.editSequence===ticket.sequence?'saved':'idle',error:null};
}
export function discardDraft<T extends DraftEntity>(s:DraftState<T>):DraftState<T>{return{...s,value:s.baseline,editSequence:s.editSequence+1,status:'idle',error:null};}

/** Explicitly called only after the user reviews local and server versions. */
export function rebaseDraft<T extends DraftEntity>(state:DraftState<T>,latest:T):DraftState<T>{
 if(latest.id!==state.entityId||latest.revision<state.baseline.revision)throw new Error('核對版本不屬於此筆資料或已過時');
 return {...state,baseline:latest,value:{...merge(state.baseline,state.value,latest) as T,revision:latest.revision},editSequence:state.editSequence+1,status:'idle',error:null};
}
