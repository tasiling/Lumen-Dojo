import type {EvidenceInput} from './model';
import type {LearningRecord} from '../learningRecords/model';
export function recordEvidence(record:Pick<LearningRecord,'id'|'title'|'status'|'whatIDid'|'selectedExcerpt'>,excerpt:string):EvidenceInput{
 if(record.status==='archived')throw Error('封存紀錄不能選為新證據');
 if(!excerpt.trim()||excerpt.length>20000||![record.whatIDid,record.selectedExcerpt].some(text=>text.includes(excerpt)))throw Error('選取內容需存在於來源紀錄');
 return {id:'learning-record:'+record.id,kind:'learning-record',label:(record.title||'選取的學習紀錄').slice(0,180),referenceId:record.id,selectedText:excerpt};
}
export function selectEvidence(existing:EvidenceInput[],input:EvidenceInput):EvidenceInput[]{
 const old=existing.find(e=>e.id===input.id);
 if(old&&(old.kind!==input.kind||old.referenceId!==input.referenceId||old.fileBlockId!==input.fileBlockId))throw Error('證據 ID 已被另一來源使用');
 if(!old&&existing.length>=40)throw Error('最多選取 40 份證據');
 return old?existing.map(e=>e.id===input.id?input:e):[...existing,input];
}
export function removeEvidence(existing:EvidenceInput[],id:string):EvidenceInput[]{return existing.filter(e=>e.id!==id)}
export function validateRecordPage(more:boolean,current:string|null,next:string|null,seen:string[]):void{
 if(more&&next&&(next===current||seen.includes(next)))throw Error('分頁未前進，請重新讀取紀錄');
}
export function recordPageState<T extends {id:string}>(previous:{records:T[];record:T|null;excerpt:string},incoming:T[],more:boolean){
 const records=more?[...previous.records,...incoming.filter(item=>!previous.records.some(old=>old.id===item.id))]:incoming;
 return {...previous,records};
}
