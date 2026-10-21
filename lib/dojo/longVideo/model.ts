import {WeavingError} from '../weavingWorkflow/model';
import {assetId,cardText,wrapCardText,type ImageUse} from '../illustrated/model';
export const LONG_VIDEO_PREFIX='行光長片稿-v1-',LONG_VIDEO_VERSION_PREFIX='行光長片版本-v1-',LONG_VIDEO_OUTPUT_PREFIX='行光長片成品-v1-';
export type VoiceUse={assetId:string;kind:'self'|'test';sourceNote:string;publicConfirmed:boolean};
export type Scene={id:string;title:string;narration:string;caption:string;duration:number;motion:'still'|'drift'|'paper';image:ImageUse|null;voice:VoiceUse|null};
export type LongVideoDraft={title:string;angle:string;style:'watercolor'|'crayon'|'mixed';rawTranscript:string;scenes:Scene[]};
export type LongVideoVersion=LongVideoDraft&{id:string;projectId:string;number:number;createdAt:string};
export type LongVideoProject={id:string;owner:string;revision:number;completionId:string;workId:string;sourceDigest:string;currentVersionId:string;versionRefs:string[];outputRefs:string[];createdAt:string;updatedAt:string};
export type LongVideoOutput={id:string;projectId:string;versionId:string;title:string;assetId:string;tool:string;returnNote:string;draft:LongVideoDraft;createdAt:string};
export type LongVideoBundle={project:LongVideoProject;version:LongVideoVersion;versions:LongVideoVersion[];outputs:LongVideoOutput[]};
function object(v:unknown):Record<string,unknown>{if(!v||typeof v!=='object'||Array.isArray(v))throw new WeavingError('長影片格式不正確');return v as Record<string,unknown>;}
function keys(v:Record<string,unknown>,allowed:string[]){if(Object.keys(v).some(k=>!allowed.includes(k)))throw new WeavingError('長影片含未知或受保護欄位');}
export function newScene(id:string):Scene{return{id,title:'',narration:'',caption:'',duration:60,motion:'still',image:null,voice:null};}
export function duration(d:LongVideoDraft){return Math.round(d.scenes.reduce((n,s)=>n+s.duration,0)*1000)/1000;}
export function parseLongVideoDraft(value:unknown):LongVideoDraft{
 const v=object(value);keys(v,['title','angle','style','rawTranscript','scenes']);if(!['watercolor','crayon','mixed'].includes(String(v.style)))throw new WeavingError('請選擇長影片風格');
 if(!Array.isArray(v.scenes)||v.scenes.length<1||v.scenes.length>40)throw new WeavingError('長影片需要1–40章節');const ids=new Set<string>();
 const scenes=v.scenes.map(value=>{const s=object(value);keys(s,['id','title','narration','caption','duration','motion','image','voice']);const id=cardText(s.id,120,'鏡頭識別');if(!/^[\w-]{1,120}$/.test(id)||ids.has(id))throw new WeavingError('鏡頭識別重複或無效');ids.add(id);
 if(typeof s.duration!=='number'||!Number.isFinite(s.duration)||s.duration<5||s.duration>300||!['still','drift','paper'].includes(String(s.motion)))throw new WeavingError('每鏡需要5–300秒及有效動作');
 let image:ImageUse|null=null;if(s.image!==null){const i=object(s.image);keys(i,['assetId','kind','tool','prompt','sourceNote','publicConfirmed']);if(!['generated','own','licensed'].includes(String(i.kind))||typeof i.publicConfirmed!=='boolean')throw new WeavingError('配圖來源不正確');image={assetId:assetId(i.assetId),kind:i.kind as ImageUse['kind'],tool:cardText(i.tool,200,'工具'),prompt:cardText(i.prompt,4000,'提示'),sourceNote:cardText(i.sourceNote,2000,'來源'),publicConfirmed:i.publicConfirmed};}
 let voice:VoiceUse|null=null;if(s.voice!==null){const a=object(s.voice);keys(a,['assetId','kind','sourceNote','publicConfirmed']);if(!['self','test'].includes(String(a.kind))||typeof a.publicConfirmed!=='boolean')throw new WeavingError('聲音來源不正確');voice={assetId:assetId(a.assetId),kind:a.kind as VoiceUse['kind'],sourceNote:cardText(a.sourceNote,2000,'錄音來源'),publicConfirmed:a.publicConfirmed};}
 return{id,title:cardText(s.title,100,'鏡頭名稱'),narration:cardText(s.narration,4000,'口播'),caption:cardText(s.caption,180,'字幕'),duration:s.duration,motion:s.motion as Scene['motion'],image,voice};});

 const result={title:cardText(v.title,200,'長影片名稱'),angle:cardText(v.angle,2000,'觀點'),style:v.style as LongVideoDraft['style'],rawTranscript:cardText(v.rawTranscript,80000,'原始逐字稿'),scenes};if(duration(result)>3600)throw new WeavingError('長影片總長不可超過3600秒');return result;
}
export function chapters(d:LongVideoDraft){let start=0;return d.scenes.map(s=>{const c={sceneId:s.id,title:s.title,start,end:Math.round((start+s.duration)*1000)/1000};start=c.end;return c;});}
export function assertLongVideoReady(d:LongVideoDraft){if(!d.title.trim()||!d.angle.trim())throw new WeavingError('請填長影片名稱與觀點');if(duration(d)<=180)throw new WeavingError('長影片需要超過180秒，短作品可使用短影音');for(const [i,s]of d.scenes.entries()){if(!s.title.trim()||wrapCardText(s.title,30).length>2)throw new WeavingError(`第${i+1}章節名稱請填寫並縮短至2行`);if(!s.image)throw new WeavingError(`第${i+1}章節尚未加入圖片`);if(!s.caption.trim()||wrapCardText(s.caption,30).length>3)throw new WeavingError(`第${i+1}章節字幕請填寫並縮短至3行以內`);if(!s.image.publicConfirmed||!s.image.sourceNote.trim())throw new WeavingError(`第${i+1}章節圖片公開確認尚未完成`);if(!s.voice||!s.voice.publicConfirmed||!s.voice.sourceNote.trim())throw new WeavingError(`第${i+1}章節聲音來源及公開確認尚未完成`);}}
export function assertChapterAudio(d:LongVideoDraft,seconds:Record<string,number>){for(const [i,s]of d.scenes.entries()){const n=s.voice?seconds[s.voice.assetId]:undefined;if(n===undefined||!Number.isFinite(n)||Math.abs(n-s.duration)>.5)throw new WeavingError(`第${i+1}章節原音與預定時間差超過0.5秒；請調整秒數或在外部剪輯，不會自動裁切`);}}
