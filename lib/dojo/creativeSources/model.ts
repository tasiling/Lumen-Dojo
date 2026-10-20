import { LearningError, uuidPattern } from '../learningFoundation/model';
export const SOURCE_TYPES = ['reading_note', 'reading_insight', 'knowledge_claim', 'forage_capture'] as const;
export type PolicySourceType = typeof SOURCE_TYPES[number];
export type SourceRef = { sourceType: PolicySourceType; sourceId: string };
export const PERMISSIONS = ['allow', 'ask', 'private'] as const;
export type Permission = typeof PERMISSIONS[number];
export type SourcePolicy = { schema: 1; owner: string; ref: SourceRef; discovery: Permission; publication: Permission; revision: number; createdAt: string; updatedAt: string };
export type PolicyInput = Pick<SourcePolicy, 'ref'|'discovery'|'publication'> & { expectedRevision: number; operationId: string };
export type PolicySource = { ref: SourceRef; label: string; href: string; text: string; version: string | null };
export const SOURCE_POLICY_PREFIX = '行光創作來源設定-v1-';
export const defaultPolicy = (): Pick<SourcePolicy,'discovery'|'publication'> => ({discovery:'ask',publication:'ask'});
export function parseSourceRef(value: unknown): SourceRef {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new LearningError('來源識別不正確');
  const v=value as Record<string,unknown>;
  if (Object.keys(v).some(k=>!['sourceType','sourceId'].includes(k)) || !SOURCE_TYPES.includes(v.sourceType as PolicySourceType) || typeof v.sourceId!=='string') throw new LearningError('來源識別不正確');
  const parts=v.sourceId.toLowerCase().split(':');
  if (v.sourceType==='reading_note' ? !([2,3].includes(parts.length)&&uuidPattern.test(parts[0])&&uuidPattern.test(parts[1])&&(parts.length===2||parts[2]==='reflection')) : !(parts.length===1&&uuidPattern.test(parts[0]))) throw new LearningError('來源識別不正確');
  return {sourceType:v.sourceType as PolicySourceType,sourceId:parts.join(':')};
}
export function sourceKey(ref: SourceRef): string {const r=parseSourceRef(ref);return `${r.sourceType}:${r.sourceId}`;}
export function sourceHref(ref: SourceRef): string {
  const r=parseSourceRef(ref),[book,note,fragment]=r.sourceId.split(':');
  return r.sourceType==='reading_note'?`/reading/books/${book}?note=${note}${fragment?'&fragment=reflection':''}`:r.sourceType==='reading_insight'?`/reading/cards?card=${r.sourceId}`:r.sourceType==='knowledge_claim'?`/dao/knowledge?claim=${r.sourceId}`:'/forage';
}
export function validatePolicyInput(value: unknown): PolicyInput {
  if (!value || typeof value!=='object'||Array.isArray(value))throw new LearningError('來源設定格式不正確');
  const v=value as Record<string,unknown>;
  if(Object.keys(v).some(k=>!['ref','discovery','publication','expectedRevision','operationId'].includes(k)))throw new LearningError('來源設定含有未知欄位');
  if(!PERMISSIONS.includes(v.discovery as Permission)||!PERMISSIONS.includes(v.publication as Permission)||!Number.isSafeInteger(v.expectedRevision)||Number(v.expectedRevision)<0||typeof v.operationId!=='string'||!uuidPattern.test(v.operationId))throw new LearningError('來源許可、修訂或操作識別不正確');
  return {ref:parseSourceRef(v.ref),discovery:v.discovery as Permission,publication:v.publication as Permission,expectedRevision:Number(v.expectedRevision),operationId:v.operationId};
}
export function validPolicy(value: unknown, owner: string): value is SourcePolicy {
  if(!value||typeof value!=='object')return false;
  const p=value as SourcePolicy;
  try{return p.schema===1&&p.owner===owner&&!!sourceKey(p.ref)&&PERMISSIONS.includes(p.discovery)&&PERMISSIONS.includes(p.publication)&&Number.isSafeInteger(p.revision)&&p.revision>0&&typeof p.createdAt==='string'&&!!p.createdAt&&typeof p.updatedAt==='string'&&!!p.updatedAt;}catch{return false;}
}
