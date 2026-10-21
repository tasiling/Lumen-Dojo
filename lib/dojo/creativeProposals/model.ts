import {LearningError} from '../learningFoundation/model';
import {SOURCE_TYPES,parseSourceRef,sourceKey,type PolicySource,type PolicySourceType} from '../creativeSources/model';
import type {ContentKind} from '../weavingWorkflow/model';
export const PROPOSAL_PREFIX='行光創作提案-v1-';
export const SETTINGS_PREFIX='行光創作找題設定-v1-';
export const FORMATS={text:'純文字',illustrated:'圖文',short_video:'短影音',podcast:'Podcast',comic:'短漫',long_video:'長影片'} as const;
export type ProposalFormat=keyof typeof FORMATS;
export type ProposalSource=PolicySource & {contentKind:ContentKind;digest:string};
export type Proposal={schema:1;owner:string;id:string;revision:number;status:'pending'|'skipped'|'accepted';source:ProposalSource;title:string;angle:string;why:string;format:ProposalFormat;trial:string;createdAt:string;updatedAt:string;acceptedWorkId:string|null;acceptedShuttleId:string|null};
export type Settings={id:string;revision:number;audience:string;sourceTypes:PolicySourceType[];automaticEnabled:boolean;cadenceHours:number|null;lastScanAt:string|null;afterKey:string|null};
export const defaults=():Settings=>({id:'proposal-settings',revision:0,audience:'',sourceTypes:[...SOURCE_TYPES],automaticEnabled:false,cadenceHours:null,lastScanAt:null,afterKey:null});
function object(v:unknown){if(!v||typeof v!=='object'||Array.isArray(v))throw new LearningError('提案內容不正確');return v as Record<string,unknown>;}
function text(v:unknown,max:number,empty=false){if(typeof v!=='string'||v.length>max||(!empty&&!v.trim()))throw new LearningError(`提案欄位不能為空或超過 ${max} 字`);return v.trim();}
function only(v:Record<string,unknown>,keys:string[]){if(Object.keys(v).some(k=>!keys.includes(k)))throw new LearningError('含有受保護或未知欄位');}
export function parseProposalPatch(value:unknown){const v=object(value);only(v,['title','angle','format','trial']);if(typeof v.format!=='string'||!(v.format in FORMATS))throw new LearningError('建議形式不正確');return{title:text(v.title,200),angle:text(v.angle,3000),format:v.format as ProposalFormat,trial:text(v.trial,10000)};}
export function parseSettings(value:unknown){const v=object(value);only(v,['audience','sourceTypes','automaticEnabled','cadenceHours']);if(!Array.isArray(v.sourceTypes)||v.sourceTypes.some(t=>!SOURCE_TYPES.includes(t))||new Set(v.sourceTypes).size!==v.sourceTypes.length||typeof v.automaticEnabled!=='boolean'||!(v.cadenceHours===null||[4,12,24,168].includes(Number(v.cadenceHours))&&typeof v.cadenceHours==='number')||v.automaticEnabled&&v.cadenceHours===null)throw new LearningError('請選擇來源範圍及有效的整理頻率，啟用時必須指定頻率');return {audience:text(v.audience,1000,true),sourceTypes:v.sourceTypes as PolicySourceType[],automaticEnabled:v.automaticEnabled,cadenceHours:v.cadenceHours as number|null};}
// Stable text fingerprint, including full-source version and full body even when the excerpt is bounded.
export function fingerprint(source:PolicySource){const s=JSON.stringify([sourceKey(source.ref),source.version,source.text]);let a=2166136261,b=5381;for(let i=0;i<s.length;i++){a=Math.imul(a^s.charCodeAt(i),16777619);b=Math.imul(b,33)^s.charCodeAt(i);}return `${(a>>>0).toString(16)}-${(b>>>0).toString(16)}-${s.length}`;}
export function buildCandidate(source:PolicySource,audience:string,now:string,owner:string):Omit<Proposal,'id'>{
 const ref=parseSourceRef(source.ref),snippet=source.text.slice(0,1200),lead=snippet.replace(/\s+/g,' ').slice(0,52),contentKind=source.contentKind??'quote';
 const angle=`從「${lead}」出發：這個觀察，在哪些生活情境值得重新想一想？`;
 return {schema:1,owner,revision:1,status:'pending',source:{...source,ref,text:snippet,contentKind,digest:fingerprint(source)},title:`從${source.label.slice(0,60)}延伸的一個問題`,angle,why:`已有可追溯的${contentKind==='quote'?'原文片段':'生活理解'}，可以先提出問題，邀請${audience||'有相似經驗的人'}分享各自的看法；尚待你決定真正認同的觀點。`,format:'text',trial:`來源片段（${contentKind==='quote'?'引用，非本人立場':'素材，待本人確認'}）：\n${snippet}\n\n我想先追問：${angle}\n\n這份片段與我的生活有什麼連結？哪些部分我認同，又有哪些地方還需要補充例子？\n\n如果你也遇過相似情境，你會怎麼理解？`,createdAt:now,updatedAt:now,acceptedWorkId:null,acceptedShuttleId:null};
}
