import {WeavingError} from '../weavingWorkflow/model';
import {assetId,cardText,wrapCardText,type ImageUse} from '../illustrated/model';
import type {VoiceUse} from '../shortVideo/model';
export const PODCAST_PREFIX='行光聲音稿-v1-',PODCAST_VERSION_PREFIX='行光聲音版本-v1-',PODCAST_OUTPUT_PREFIX='行光聲音成品-v1-';
export type Segment={id:string;title:string;script:string;editNote:string;startSeconds:number|null};
export type PodcastDraft={title:string;showName:string;angle:string;description:string;rawTranscript:string;segments:Segment[];recording:VoiceUse|null;cover:ImageUse|null};
export type PodcastVersion=PodcastDraft&{id:string;projectId:string;number:number;createdAt:string};
export type PodcastProject={id:string;owner:string;revision:number;completionId:string;workId:string;sourceDigest:string;currentVersionId:string;versionRefs:string[];outputRefs:string[];createdAt:string;updatedAt:string};
export type PodcastOutput={id:string;projectId:string;versionId:string;title:string;assetId:string;coverAssetId:string;tool:string;returnNote:string;editConfirmed:boolean;draft:PodcastDraft;createdAt:string};
export type PodcastBundle={project:PodcastProject;version:PodcastVersion;versions:PodcastVersion[];outputs:PodcastOutput[]};
function obj(v:unknown):Record<string,unknown>{if(!v||typeof v!=='object'||Array.isArray(v))throw new WeavingError('Podcast格式不正確');return v as Record<string,unknown>;}
function exact(v:Record<string,unknown>,allowed:string[]){if(Object.keys(v).some(k=>!allowed.includes(k)))throw new WeavingError('Podcast含未知或受保護欄位');}
export function newSegment(id:string):Segment{return{id,title:'',script:'',editNote:'',startSeconds:null};}
export function parsePodcastDraft(value:unknown):PodcastDraft{
 const d=obj(value);exact(d,['title','showName','angle','description','rawTranscript','segments','recording','cover']);
 if(!Array.isArray(d.segments)||!d.segments.length||d.segments.length>40)throw new WeavingError('Podcast需要1–40段');
 const ids=new Set<string>(),segments=d.segments.map(v=>{const s=obj(v);exact(s,['id','title','script','editNote','startSeconds']);const id=cardText(s.id,120,'段落識別');if(!/^[\w-]{1,120}$/.test(id)||ids.has(id))throw new WeavingError('段落識別無效或重複');ids.add(id);if(s.startSeconds!==null&&(typeof s.startSeconds!=='number'||!Number.isFinite(s.startSeconds)||s.startSeconds<0||s.startSeconds>=3600))throw new WeavingError('章節起秒須在0–3600秒內');return{id,title:cardText(s.title,200,'段落名稱'),script:cardText(s.script,4000,'段落稿'),editNote:cardText(s.editNote,2000,'剪輯註記'),startSeconds:s.startSeconds as number|null};});
 let recording:VoiceUse|null=null,cover:ImageUse|null=null;
 if(d.recording!==null){const a=obj(d.recording);exact(a,['assetId','kind','sourceNote','publicConfirmed']);if(!['self','test'].includes(String(a.kind))||typeof a.publicConfirmed!=='boolean')throw new WeavingError('錄音來源不正確');recording={assetId:assetId(a.assetId),kind:a.kind as VoiceUse['kind'],sourceNote:cardText(a.sourceNote,2000,'錄音來源'),publicConfirmed:a.publicConfirmed};}
 if(d.cover!==null){const a=obj(d.cover);exact(a,['assetId','kind','tool','prompt','sourceNote','publicConfirmed']);if(!['own','generated','licensed'].includes(String(a.kind))||typeof a.publicConfirmed!=='boolean')throw new WeavingError('封面來源不正確');cover={assetId:assetId(a.assetId),kind:a.kind as ImageUse['kind'],tool:cardText(a.tool,200,'圖片工具'),prompt:cardText(a.prompt,4000,'製作紀錄'),sourceNote:cardText(a.sourceNote,2000,'封面來源'),publicConfirmed:a.publicConfirmed};}
 return{title:cardText(d.title,200,'單集名稱'),showName:cardText(d.showName,200,'節目名稱'),angle:cardText(d.angle,2000,'觀點'),description:cardText(d.description,4000,'介紹'),rawTranscript:cardText(d.rawTranscript,40000,'原始逐字稿'),segments,recording,cover};
}
export function assertChapters(d:PodcastDraft,seconds:number){let last=-1;for(const s of d.segments){if(s.startSeconds===null)continue;if(!s.title.trim()||!Number.isFinite(s.startSeconds)||s.startSeconds<=last||s.startSeconds>=seconds)throw new WeavingError('章節需有名稱、起秒遞增且在成品長度內');last=s.startSeconds;}}
export function assertPodcastReady(d:PodcastDraft){
 if(!d.title.trim()||!d.showName.trim()||!d.angle.trim()||!d.description.trim())throw new WeavingError('請填單集、節目、觀點與介紹');
 if(!d.recording?.publicConfirmed||!d.recording.sourceNote.trim())throw new WeavingError('原始錄音來源與公開確認尚未完成');
 if(!d.cover?.publicConfirmed||!d.cover.sourceNote.trim())throw new WeavingError('封面來源與公開確認尚未完成');
 if(wrapCardText(d.title,13).length>3||wrapCardText(d.showName,24).length>1)throw new WeavingError('封面標題過長，請縮短後重新預覽');
 if(d.segments.some(s=>!s.title.trim()||!s.script.trim()))throw new WeavingError('請填妥各段名稱與節目稿');
}
export function episodeScript(d:PodcastDraft){return `# ${d.title}\n\n${d.showName}\n\n${d.description}\n\n`+d.segments.map(s=>`## ${s.title}\n\n${s.script}\n\n剪輯註記：${s.editNote}`).join('\n\n');}
