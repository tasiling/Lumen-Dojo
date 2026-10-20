import 'server-only';
import { LearningError } from '../learningFoundation/model';
import { sourceKey, validatePolicyInput, validPolicy, type SourceRef, type SourcePolicy, type PolicySource, type PolicyInput } from './model';
export type PolicyDependencies = { owner:string; list:()=>Promise<unknown[]>; resolve:(ref:SourceRef)=>Promise<PolicySource|null>; run:(id:string,input:PolicyInput,prepare:()=>Promise<()=>Promise<SourcePolicy>>)=>Promise<SourcePolicy>; create:(p:SourcePolicy)=>Promise<void>; update:(p:SourcePolicy)=>Promise<void> };
export function sourcePolicyService(d:PolicyDependencies){
  async function list(){
    const values=await d.list(),keys=new Set<string>();
    for(const p of values){if(!validPolicy(p,d.owner)||keys.has(sourceKey(p.ref)))throw new LearningError('來源設定損毀或重複，請先核對；尚未授權取材或公開',409);keys.add(sourceKey(p.ref));}
    return values as SourcePolicy[];
  }
  async function read(ref:SourceRef){const key=sourceKey(ref);return (await list()).find(p=>sourceKey(p.ref)===key)??null;}
  return {read,list, async save(value:unknown){const v=validatePolicyInput(value);return d.run(v.operationId,v,async()=>{
    if(!await d.resolve(v.ref))throw new LearningError('來源不存在、尚未可用或無法存取',404);
    const old=await read(v.ref);
    if((old?.revision??0)!==v.expectedRevision)throw new LearningError('來源設定已被更新，請讀取最新設定比較；你的修改仍保留',409);
    const now=new Date().toISOString(),next:SourcePolicy={schema:1,owner:d.owner,ref:v.ref,discovery:v.discovery,publication:v.publication,revision:(old?.revision??0)+1,createdAt:old?.createdAt??now,updatedAt:now};
    return async()=>{if(old)await d.update(next);else await d.create(next);return next;};
  });}, async allowed(){
    // Resolve only explicitly allowed identities; never search private content then filter.
    const whitelist=(await list()).filter(p=>p.discovery==='allow'),sources:PolicySource[]=[];
    for(const p of whitelist){const s=await d.resolve(p.ref);if(s)sources.push(s);}
    return sources;
  }, async assertPublication(selections: {sourceType:string;sourceId:string}[],confirmed:unknown){
    if(confirmed!==true)throw new LearningError('請先確認這個成品的人物、私密細節與引用可以送往發布準備');
    const policies=await list();
    for(const s of selections){
      // Legacy/manual snapshots have no grant; the explicit per-completion review above is required.
      const p=policies.find(p=>p.ref.sourceType===s.sourceType&&p.ref.sourceId===s.sourceId.toLowerCase());
      if(p?.publication==='private')throw new LearningError('這個成品包含設為不公開的來源；請移除該選摘、重新確認成品，或先調整來源設定',403);
    }
  }};
}
