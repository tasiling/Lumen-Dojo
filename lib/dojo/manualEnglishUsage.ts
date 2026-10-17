import type {EnglishImageEntry} from "./englishImage";
import type {EnglishImageVocabCandidate} from "./englishImageDispatch";
import {learningUsageIssues} from "./englishImageLearningUsage";
export function manualLearningUsagePatch(entry:EnglishImageEntry,candidates:EnglishImageVocabCandidate[],key:string,usage:string,translation:string):Partial<EnglishImageEntry>{
 const selected=candidates.find(x=>x.key===key);if(!selected)throw Error("候選已變更，請重新載入。");
 if(entry.vocabForgeExports.some(x=>x.key===key))throw Error("已同步單字保留原接收紀錄，不能改寫。");
 const sentence=usage.trim(),chinese=translation.trim(),issues=learningUsageIssues({expression:selected.expression,usage:sentence,usageTranslation:chinese});if(issues.length)throw Error(issues.join("、"));
 const canonical=(value:string)=>value.trim().replace(/^[\s'"“”「」]+|[\s'"“”「」]+$/g,"").slice(0,240).toLocaleLowerCase();
 const base=[...entry.vocabularyCandidates];
 // Preview can fall back to plain text even when raw structured entries exist.
 // Preserve those raw entries and add every real fallback candidate, not just
 // the edited one, so saving does not hide the other available words.
 for(const x of candidates){if(!base.some(raw=>canonical(raw.expression)===canonical(x.expression)))base.push({expression:x.expression,meaning:x.meaning,usage:x.usage.sentence,usageTranslation:x.usage.translation,partOfSpeech:x.usage.partOfSpeech||"",usageProvenance:x.usage.provenance,cefrLevel:x.cefrLevel,suggestedFocusDecks:x.suggestedFocusDecks,origin:x.origin,recommendationReason:x.recommendationReason});}
 return {vocabularyCandidates:base.map(x=>canonical(x.expression)===canonical(selected.expression)?{...x,usage:sentence,usageTranslation:chinese,usageProvenance:"unknown" as const}:x)};
}
