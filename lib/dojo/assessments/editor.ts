import type {EvidenceInput,Evaluation,Attempt,ProofRecord} from './model';
export function answerEvidence(evidence:EvidenceInput[],answer:string,include:boolean):EvidenceInput[]{
 if(!include)return evidence.filter(e=>!(e.id==='answer-as-evidence'&&e.kind==='text'));
 if(!answer.trim())throw Error('空白作答不能作為文字證據');
 const existing=evidence.find(e=>e.id==='answer-as-evidence');
 if(existing&&existing.kind!=='text')throw Error('作答證據 ID 已被另一來源使用');
 const value:EvidenceInput={id:'answer-as-evidence',kind:'text',label:'本次作答',selectedText:answer};
 return existing?evidence.map(e=>e.id===value.id?value:e):[...evidence,value];
}
export function aiFeedback(text:string):Evaluation{
 const value=JSON.parse(text);
 if(!value||typeof value!=='object'||value.evaluator?.type!=='ai')throw Error('匯入的 GPT 回饋必須明確標示為 AI 評估');
 return value;
}
export type PreparedExport={text:string;includeAnswer:boolean;evidenceIds:string[]};
export function preparedExportText(prepared:PreparedExport|null,includeAnswer:boolean,evidenceIds:string[]):string{
 if(!prepared||prepared.includeAnswer!==includeAnswer||JSON.stringify([...prepared.evidenceIds].sort())!==JSON.stringify([...evidenceIds].sort()))return '';
 return prepared.text;
}
export function editorDirty(status:string,draftChanged:boolean,review:string,baseline:string,imported:string,proofInputsChanged=false):boolean{
 return status==='draft'?draftChanged:status==='submitted'&&(review!==baseline||imported.length>0||proofInputsChanged);
}
export function initialEvaluation(attempt:Attempt,proofs:ProofRecord[]):Evaluation{
 if(attempt.evaluation)return attempt.evaluation;
 const proof=proofs.find(p=>attempt.definitionSnapshot.confirmationMethods.includes(p.attestation.evaluator.type));
 const type=attempt.definitionSnapshot.confirmationMethods[0];
 return {attemptId:attempt.id,definitionVersion:attempt.definitionVersion,attemptRevision:attempt.revision,evaluator:proof?{...proof.attestation.evaluator,proofEvidenceId:proof.evidenceId}:{type,name:type==='self'?'自己':''},criteria:attempt.definitionSnapshot.criteria.map(c=>({criterionId:c.id,verdict:'insufficient',feedback:''}))};
}
