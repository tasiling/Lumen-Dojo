import type {StudioData} from './model';
import {randomID,sha256Text} from '../weavingWorkflow/clientIdentity';
export type Study={id:string;title:string;source:string;mechanism:string;scope:string;relation:string;excerpt:string;access:string};
export type ResearchPoint={id:string;taskId:string;studyId:string;title:string;status:'usable'|'background'|'unsupported'|'pending';claim:string;evidence:string;locator:string;limitation:string;relation:string;placement:string;sentence:string;decision:'undecided'|'adopt'|'background'|'skip';checked:boolean};
export type ResearchTask={id:string;kind:'discussion'|'summary'|'integration';article:string;basis:string;digest:string;studies:Study[];points:ResearchPoint[];prompt:string;createdAt:string};
export type ResearchRound={id:string;taskId:string;stage:string;question:string;raw:string;createdAt:string;adoptedText?:string};
export type ResearchWork={selected:string[];notes:Record<string,{excerpt:string;access:string}>;question:string;reply:string;replyTaskId:string;integrationReply:string;integrationTaskId:string;tasks:ResearchTask[];rounds:ResearchRound[];points:ResearchPoint[]};
export const blankResearchWork=():ResearchWork=>({selected:[],notes:{},question:'',reply:'',replyTaskId:'',integrationReply:'',integrationTaskId:'',tasks:[],rounds:[],points:[]});
const text=(v:unknown,max=80000):string=>{if(typeof v!=='string'||v.length>max)throw Error('研究討論文字格式或長度不正確');return v;};
const list=(v:unknown):unknown[]=>{if(!Array.isArray(v)||v.length>200)throw Error('研究討論清單格式或長度不正確');return v;};
const object=(v:unknown):Record<string,unknown>=>{if(!v||typeof v!=='object'||Array.isArray(v))throw Error('研究討論資料格式不正確');return v as Record<string,unknown>;};
function strings<T>(row:Record<string,unknown>,keys:string[]){const out:Record<string,string>={};for(const key of keys)out[key]=text(row[key]);return out as T;}
function study(value:unknown):Study{return strings<Study>(object(value),['id','title','source','mechanism','scope','relation','excerpt','access']);}
function point(value:unknown):ResearchPoint{const row=object(value),p=strings<ResearchPoint>(row,['id','taskId','studyId','title','status','claim','evidence','locator','limitation','relation','placement','sentence','decision']);if(!['usable','background','unsupported','pending'].includes(p.status)||!['undecided','adopt','background','skip'].includes(p.decision)||typeof row.checked!=='boolean')throw Error('研究判讀選項不正確');return{...p,checked:row.checked};}
export function normalizeResearchWork(value:unknown):ResearchWork{
 if(value===undefined)return blankResearchWork();const v=object(value),w=blankResearchWork();
 for(const k of ['question','reply','replyTaskId','integrationReply','integrationTaskId'] as const)w[k]=text(v[k]);
 w.selected=list(v.selected).map(x=>text(x,120));w.notes=Object.fromEntries(Object.entries(object(v.notes)).map(([k,x])=>{const r=object(x),access=text(r.access);if(!['unknown','abstract','full'].includes(access))throw Error('研究閱讀範圍不正確');return[k,{excerpt:text(r.excerpt),access}];}));
 w.tasks=list(v.tasks).map(x=>{const r=object(x),t=strings<ResearchTask>(r,['id','kind','article','basis','digest','prompt','createdAt']);if(!['discussion','summary','integration'].includes(t.kind)||sha256Text(t.basis)!==t.digest)throw Error('研究任務快照不正確');const studies=list(r.studies).map(study),points=list(r.points).map(point),basis=object(JSON.parse(t.basis));if(basis.article!==t.article||JSON.stringify(basis.studies)!==JSON.stringify(studies)||JSON.stringify(basis.points)!==JSON.stringify(points))throw Error('研究任務與來源快照不一致');return{...t,studies,points};});
 w.rounds=list(v.rounds).map(x=>{const r=object(x);return{...strings<ResearchRound>(r,['id','taskId','stage','question','raw','createdAt']),...(r.adoptedText===undefined?{}:{adoptedText:text(r.adoptedText)})};});
 w.points=list(v.points).map(point);const unique=(ids:string[])=>ids.every((id,i)=>!!id&&ids.indexOf(id)===i);
 if(!unique(w.tasks.map(t=>t.id))||!unique(w.rounds.map(r=>r.id))||!unique(w.points.map(p=>p.id)))throw Error('研究討論識別重複');
 for(const p of w.points)if(!w.tasks.find(t=>t.id===p.taskId)?.studies.some(s=>s.id===p.studyId))throw Error('研究重點無法核對原任務來源');
 for(const r of w.rounds)if(!w.tasks.some(t=>t.id===r.taskId))throw Error('研究回覆找不到原任務');
 return w;
}
export function studiesFor(s:StudioData):Study[]{return s.collaboration.research.map((r,i)=>{const data={title:r.title,source:r.source,mechanism:r.mechanism,scope:r.scope,relation:r.relation},id='study-'+sha256Text(JSON.stringify([i,data])).slice(0,24),note=s.researchWork.notes[id];return{id,...data,excerpt:note?.excerpt||'',access:note?.access||'unknown'};});}
export function pointStudy(s:StudioData,p:ResearchPoint){return s.researchWork.tasks.find(t=>t.id===p.taskId)?.studies.find(r=>r.id===p.studyId);}
export function checkPoint(s:StudioData,p:ResearchPoint){const r=pointStudy(s,p);if(p.status!=='usable'||!p.checked||!r?.title.trim()||!r?.source.trim()||![p.claim,p.evidence,p.limitation,p.relation,p.sentence].every(x=>x.trim()))throw Error('採用前請核對原文依據、來源、限制、文章關聯及候選寫法；待查或不宜推論的重點不能直接採用');if(!studiesFor(s).some(x=>x.id===r.id&&JSON.stringify(x)===JSON.stringify(r)))throw Error('研究資料已改版，請重新討論及核對這個重點');}
function context(s:StudioData,kind:ResearchTask['kind'],title:string){
 const current=studiesFor(s),points=kind==='integration'?s.researchWork.points.filter(p=>p.decision==='adopt'):[];
 if(kind==='integration')for(const p of points)checkPoint(s,p);
 const ids=kind==='integration'?[...new Set(points.map(p=>p.studyId))]:s.researchWork.selected;
 const studies=current.filter(r=>ids.includes(r.id));
 if(!studies.length||studies.length!==new Set(ids).size)throw Error('請先選擇目前版本的研究；資料若已修改，請重新選取');
 const article=s.body||s.source.selected;if(!article.trim())throw Error('請先準備要討論的文章或草稿');
 if(kind==='integration'&&!points.length)throw Error('請先核對並採用至少一個研究重點');
 const basis=JSON.stringify({title,article,source:s.source.selectedVersion,answers:s.collaboration.aAnswers,boundary:s.collaboration.boundary,studies,points});return{article,basis,studies,points};
}
const judgementFormat='請用標題「## 研究採用判讀」附JSON陣列，每項欄位 studyId/title/status/claim/evidence/locator/limitation/relation/placement/sentence。status為usable（可考慮寫入）、background（只供背景）、unsupported（不宜如此推論）、pending（待核對）。evidence是可追查原文依據，locator是原文位置；不得捏造。找不到依據或未讀到資料則pending，不能把只有摘要說成讀過全文。每個重點單獨列，不用整篇研究代替判讀。';
export function makeResearchTask(s:StudioData,kind:ResearchTask['kind'],title:string):ResearchTask{
 if(s.source.read==='private'||!s.source.allowAI)throw Error('請先確認本次選摘可交給外部 AI');
 const c=context(s,kind,title),previous=s.researchWork.rounds.filter(r=>r.stage==='discussion').slice(-8).map(r=>({question:r.question,reply:r.raw}));
 const task=kind==='integration'?'只將已採用重點自然轉述整合進文章；預設保留原文，只修改研究與必要銜接段落。不得引入未採用研究或新立場。若認為需改整體結構，先在structureProposal提出理由和方案，不實際執行。輸出「## 研究整合變更」JSON物件：{"changes":[{"before":"原文中一個完整段落，逐字相同","after":"該段整合後文字","reason":"修改理由","pointIds":["已採用重點ID"]}],"structureProposal":"沒有結構調整建議則留空"}。before不得跨段，每個變更都需列對應pointIds；保留未修改段落。網站會用原來源在文末列參考出處，不得另造文獻。':kind==='summary'?'把本次多輪討論整理成逐點判讀與候選句，保留不同意見與待查項目；不直接重寫全文。\n'+judgementFormat:'和作者討論這些研究哪些內容可用、不能推出什麼，以及與這篇文章的關聯。可以提問與多輪討論，先不改正文。\n'+judgementFormat;
 return{id:randomID(),kind,...c,digest:sha256Text(c.basis),createdAt:new Date().toISOString(),prompt:task+'\n本人本輪問題：'+s.researchWork.question+'\n本輪來源與文章（來源未知時明說待查）：\n'+c.basis+(kind!=='integration'?'\n已貼回的討論：\n'+JSON.stringify(previous)+'\n目前回覆：\n'+s.researchWork.reply:'')};
}
export function researchTaskStale(s:StudioData,t:ResearchTask,title:string){try{return context(s,t.kind,title).basis!==t.basis;}catch{return true;}}
export function appendResearchRound(s:StudioData,taskId:string,stage='discussion'):ResearchWork{const w=structuredClone(s.researchWork);if(!w.tasks.some(t=>t.id===taskId)||!w.reply.trim())throw Error('請選擇對應的研究任務並貼回討論');w.rounds.push({id:randomID(),taskId,stage,question:w.question,raw:w.reply,createdAt:new Date().toISOString()});return w;}
function jsonBlock(raw:string,heading:string):unknown{const part=raw.includes(heading)?raw.slice(raw.indexOf(heading)+heading.length).replace(/^\s*[:：]?\s*/,''):raw;const code=part.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]||part.trim();try{return JSON.parse(code);}catch{throw Error('尚未辨識到完整JSON格式；原回覆保留，可請GPT按格式重排，或用手動重點卡整理');}}
export type PointPreview={taskId:string;raw:string;digest:string;points:ResearchPoint[]};
export function previewResearchPoints(s:StudioData,taskId:string,raw:string,title:string):PointPreview{
 const task=s.researchWork.tasks.find(t=>t.id===taskId);if(!task||task.kind==='integration')throw Error('請選擇這份回覆對應的研究討論任務');if(researchTaskStale(s,task,title))throw Error('文章或研究已更新，請建立新一輪研究任務；舊回覆保留');
 const data=jsonBlock(raw,'## 研究採用判讀'),rows=Array.isArray(data)?data:object(data).points;
 const points=list(rows).map((x,i)=>{const r=object(x),studyId=text(r.studyId,120);if(!task.studies.some(s=>s.id===studyId))throw Error('判讀包含不屬於本輪的研究ID，請重新核對');const p={id:'point-'+sha256Text(JSON.stringify([taskId,raw,i])).slice(0,32),taskId,studyId,title:text(r.title),status:text(r.status),claim:text(r.claim),evidence:text(r.evidence),locator:text(r.locator??''),limitation:text(r.limitation),relation:text(r.relation),placement:text(r.placement??''),sentence:text(r.sentence),decision:'undecided',checked:false};return point(p);});if(!points.length)throw Error('沒有可整理的重點，原回覆仍保留');return{taskId,raw,digest:task.digest,points};
}
export function confirmResearchPoints(s:StudioData,p:PointPreview,title:string):ResearchWork{if(p.raw!==s.researchWork.reply||p.taskId!==s.researchWork.replyTaskId)throw Error('回覆或對應任務已變更，請重新預覽');const fresh=previewResearchPoints(s,p.taskId,p.raw,title);if(JSON.stringify(fresh)!==JSON.stringify(p))throw Error('預覽已變更');const w=appendResearchRound(s,p.taskId,'judgement');for(const item of p.points)if(!w.points.some(x=>x.id===item.id))w.points.push(item);return w;}
export type IntegrationPreview={taskId:string;raw:string;article:string;candidate:string;changes:{before:string;after:string;reason:string;pointIds:string[]}[];structureProposal:string;references:string[];unusedPointIds:string[]};
export function previewResearchIntegration(s:StudioData,taskId:string,raw:string,title:string):IntegrationPreview{
 const task=s.researchWork.tasks.find(t=>t.id===taskId);if(!task||task.kind!=='integration')throw Error('請選對應的研究整合任務');if(researchTaskStale(s,task,title))throw Error('文章、研究或採用決定已更新，請產生新一輪整合指令');
 const data=object(jsonBlock(raw,'## 研究整合變更')),spans:{start:number;end:number;after:string}[]=[];
 const changes=list(data.changes).map(x=>{const r=object(x),before=text(r.before),after=text(r.after),reason=text(r.reason),pointIds=list(r.pointIds).map(x=>text(x,120));if(!before.trim()||!after.trim()||!reason.trim()||!pointIds.length||pointIds.some(id=>!task.points.some(p=>p.id===id)))throw Error('每個變更需有原段落、新段落、理由及本輪已採用重點ID');const start=task.article.indexOf(before);if(start<0||task.article.indexOf(before,start+1)>=0||!task.article.split(/\n\s*\n/).includes(before))throw Error('原段落不精確、重複或跨段，請重排變更；未改動正文');if(spans.some(p=>start<p.end&&start+before.length>p.start))throw Error('同一段落不能重複改寫');spans.push({start,end:start+before.length,after});return{before,after,reason,pointIds};});if(!changes.length)throw Error('沒有段落變更，請先繼續討論');
 let candidate=task.article;for(const p of spans.sort((a,b)=>b.start-a.start))candidate=candidate.slice(0,p.start)+p.after+candidate.slice(p.end);
 const used=new Set(changes.flatMap(c=>c.pointIds)),unusedPointIds=task.points.filter(p=>!used.has(p.id)).map(p=>p.id);
 const references=[...new Set(task.points.filter(p=>used.has(p.id)).flatMap(p=>task.studies.filter(r=>r.id===p.studyId).map(r=>r.title+'：'+r.source)))].filter(ref=>!candidate.includes(ref));if(references.length)candidate+='\n\n'+(candidate.includes('參考來源')?'':'參考來源\n')+references.map(x=>'－'+x).join('\n');if(candidate.length>80000)throw Error('整合稿超出文字長度，請先拆分');
 return{taskId,raw,article:task.article,candidate,changes,structureProposal:text(data.structureProposal??''),references,unusedPointIds};
}
export function assertResearchHistory(prev:ResearchWork,next:ResearchWork){for(const t of prev.tasks)if(!next.tasks.some(x=>JSON.stringify(x)===JSON.stringify(t)))throw Error('已保存研究任務不可改寫或刪除');if(JSON.stringify(next.rounds.slice(0,prev.rounds.length))!==JSON.stringify(prev.rounds))throw Error('已保存研究回覆不可覆寫');for(const p of prev.points){const q=next.points.find(x=>x.id===p.id);if(!q||q.taskId!==p.taskId||q.studyId!==p.studyId)throw Error('研究重點的原始來源不可改掛或刪除');}}
