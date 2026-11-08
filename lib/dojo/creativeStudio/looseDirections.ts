import { nativeDirection } from './directionMapping';
export { nativeDirection } from './directionMapping';
import 'server-only';
import { listJsonRecords } from '../notionStore';
import { createStep, updateStep, expectRevision, readRecord, readShuttle, WEAVING_OWNER, operationId, type Body } from '../weavingWorkflow/store';
import { runWeavingOperation, operationDigest } from '../weavingWorkflow/operations';
import { WEAVING_SHUTTLE_TITLE_PREFIX } from '../formal';
import { normalizeWeavingShuttle } from '../weavingShuttle';
import { normalizeDirections, raw, type StudioDirection } from './model';
import { importDigest } from './migration';
export const LOOSE_PREFIX = '行光未歸屬方向-v1-';
export type LooseDirection = { id: string; revision: number; identity: string; direction: StudioDirection; assignedTo: string };
export async function looseDirections(all = false): Promise<LooseDirection[]> {
    return (await listJsonRecords(LOOSE_PREFIX)).flatMap(r => { const v=r.value as LooseDirection; return all || !v.assignedTo ? [{ ...v, id:r.id, direction:normalizeDirections([v.direction])[0] }] : []; });
}
export async function importLooseDirection(d: Record<string, unknown>) {
    const identity=importDigest(d), prior=(await looseDirections(true)).find(x=>x.identity===identity);
    if(prior)return prior;
    const result=await runWeavingOperation(WEAVING_OWNER,operationDigest(['loose-import',identity]),'migrate',{identity},[createStep(LOOSE_PREFIX,'loose',()=>({revision:1,identity,direction:nativeDirection(d),assignedTo:''}))]);
    return {...JSON.parse((await readRecord(result.result.loose.id,LOOSE_PREFIX)).內容),id:result.result.loose.id} as LooseDirection;
}
export async function saveLooseDirection(body: Body) {
    const id=raw(body.id,300),direction=normalizeDirections([body.direction])[0],topicId=raw(body.topicId ?? '',300);
    const steps=[updateStep(id,LOOSE_PREFIX,'loose',async row=>{const old=JSON.parse(row.內容);expectRevision(old,body.expectedRevision);if(old.assignedTo)throw Error('方向已歸屬，請從該主題接續');for(const v of old.direction.versions)if(!direction.versions.some(n=>JSON.stringify(n)===JSON.stringify(v)))throw Error('已保存的理解不可改寫，請追加新版本');if(topicId){const target=await readShuttle(topicId);expectRevision(target,body.expectedTopicRevision);if(target.studioDirections?.some(d=>d.id===direction.id))throw Error('此主題已有同識別方向，請先核對');}return {...old,direction,revision:old.revision+1};})];
    if(topicId)steps.push(updateStep(topicId,WEAVING_SHUTTLE_TITLE_PREFIX,'topic',row=>{const t=normalizeWeavingShuttle(JSON.parse(row.內容),{id:topicId})!;expectRevision(t,body.expectedTopicRevision);if(t.studioDirections?.some(d=>d.id===direction.id))throw Error('此主題已有同識別方向，請先核對');return {...t,studioDirections:[...(t.studioDirections||[]),direction],revision:t.revision+1};}),updateStep(id,LOOSE_PREFIX,'assigned',row=>{const old=JSON.parse(row.內容);return {...old,assignedTo:topicId,revision:old.revision+1};}));
    const result=await runWeavingOperation(WEAVING_OWNER,operationId(body),'patch',body,steps);
    return { loose:{...JSON.parse((await readRecord(result.result.assigned?.id || result.result.loose.id,LOOSE_PREFIX)).內容),id},topic:topicId?await readShuttle(topicId):null };
}
