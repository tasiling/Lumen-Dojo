import type { Attempt, Definition, DefinitionInput } from './model';
export type AttemptSummary = Pick<Attempt,'id'|'capabilityId'|'definitionVersion'|'revision'|'status'|'verdict'|'confirmedAt'|'revisitOf'|'updatedAt'> & { capabilityName: string };
export function capabilityProgress(definition: Pick<Definition,'capabilityId'|'definitionVersion'>, attempts: Pick<Attempt,'capabilityId'|'definitionVersion'|'status'|'verdict'|'confirmedAt'>[]) {
  const all=attempts.filter(a=>a.capabilityId===definition.capabilityId), current=all.filter(a=>a.definitionVersion===definition.definitionVersion);
  const state: "mastered"|"awaiting-review"|"practicing"|"not-started" = current.some(a=>a.confirmedAt && a.verdict==='meets') ? 'mastered' : current.some(a=>a.status==='submitted'||(a.status==='assessed'&&a.verdict==='meets'&&!a.confirmedAt)) ? 'awaiting-review' : current.length ? 'practicing' : 'not-started';
  return {state,historicalConfirmed:all.filter(a=>a.confirmedAt&&a.verdict==='meets'&&a.definitionVersion!==definition.definitionVersion).length,currentAttempts:current.length};
}
export function exampleDefinition(kind:'english'|'concept', learningItemId:string): DefinitionInput {
  const english=kind==='english';
  return {name:english?'英文日常經驗表達':'說明一個學科概念',objective:english?'獨立寫出一次新經歷，讓讀者理解事件與感受。':'以自己的話解釋一個概念，並用新例子說明。',scope:{learningItemId,level:'path',languageDimension:english?'writing':'none'},achievedRank:'bronze',tasks:[english?'選擇一次真實經歷，描述發生什麼與自己的感受。':'選擇一個概念，說明意思、用途及一個新例子。'],aids:['可使用筆記或字典；請註明使用的輔助。'],criteria:[{id:'meaning',description:english?'事件和感受表達清楚':'概念定義與例子對應',meetsDescription:english?'讀者能理解事件順序和至少一個感受。':'能解釋概念，並說明例子為何符合。',mandatory:true,requiredEvidenceKinds:['text']}],confirmationMethods:['self'],professionalPractice:false};
}

export function editLines(value:string){return value.split("\n");}
