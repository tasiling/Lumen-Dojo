import 'server-only';
import { createHash } from 'node:crypto';
import { createKnowledgeEntry } from '@/lib/notion/mutations';
import { listJsonRecords, updateJsonRecordById } from '../notionStore';
import { learningOwner } from '../learningFoundation/store';
import { LearningError } from '../learningFoundation/model';
import { sourcePolicyService } from './service';
import { SOURCE_POLICY_PREFIX,sourceKey,type SourcePolicy } from './model';
import { resolvePolicySource } from './resolver';
import { runPolicyOperation } from './operations';
export const sourcePolicies=sourcePolicyService({owner:learningOwner,list:async()=>{const rows=await listJsonRecords(SOURCE_POLICY_PREFIX);return rows.map(r=>r.value);},resolve:resolvePolicySource,run:(id,input,prepare)=>runPolicyOperation(learningOwner,id,input,prepare),create:async(p)=>{await createKnowledgeEntry({標題:SOURCE_POLICY_PREFIX+createHash('sha256').update(`${p.owner}:${sourceKey(p.ref)}`).digest('hex'),內容:JSON.stringify(p)},{retryCreate:false});},update:async(p:SourcePolicy)=>{
  const rows=(await listJsonRecords(SOURCE_POLICY_PREFIX)).filter(r=>{try{return sourceKey((r.value as SourcePolicy).ref)===sourceKey(p.ref);}catch{return false;}});
  if(rows.length!==1)throw new LearningError('來源設定已變更，請重新讀取',409);
  await updateJsonRecordById(rows[0].id,SOURCE_POLICY_PREFIX,rows[0].title,p);
}});
