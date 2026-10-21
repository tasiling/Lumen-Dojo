import {WeavingError} from '../weavingWorkflow/model';
import {assetId,cardText,wrapCardText,type ImageUse} from '../illustrated/model';
export const VIDEO_PREFIX='行光短片稿-v1-',VIDEO_VERSION_PREFIX='行光短片版本-v1-',VIDEO_OUTPUT_PREFIX='行光短片成品-v1-';
export type VoiceUse={assetId:string;kind:'self'|'test';sourceNote:string;publicConfirmed:boolean};
export type Scene={id:string;title:string;narration:string;caption:string;duration:number;motion:'still'|'drift'|'paper';image:ImageUse|null};
export type VideoDraft={title:string;angle:string;style:'watercolor'|'crayon'|'mixed';rawTranscript:string;scenes:Scene[];voice:VoiceUse|null};
export type VideoVersion=VideoDraft&{id:string;projectId:string;number:number;createdAt:string};
export type VideoProject={id:string;owner:string;revision:number;completionId:string;workId:string;sourceDigest:string;currentVersionId:string;versionRefs:string[];outputRefs:string[];createdAt:string;updatedAt:string};
export type VideoOutput={id:string;projectId:string;versionId:string;title:string;assetId:string;tool:string;returnNote:string;draft:VideoDraft;createdAt:string};
export type VideoBundle={project:VideoProject;version:VideoVersion;versions:VideoVersion[];outputs:VideoOutput[]};
function object(v:unknown):Record<string,unknown>{if(!v||typeof v!=='object'||Array.isArray(v))throw new WeavingError('短片格式不正確');return v as Record<string,unknown>;}
function keys(v:Record<string,unknown>,allowed:string[]){if(Object.keys(v).some(k=>!allowed.includes(k)))throw new WeavingError('短片含未知或受保護欄位');}
export function newScene(id:string):Scene{return{id,title:'',narration:'',caption:'',duration:4,motion:'drift',image:null};}
export function duration(d:VideoDraft){return Math.round(d.scenes.reduce((n,s)=>n+s.duration,0)*1000)/1000;}
export function parseVideoDraft(value:unknown):VideoDraft{
 const v=object(value);keys(v,['title','angle','style','rawTranscript','scenes','voice']);if(!['watercolor','crayon','mixed'].includes(String(v.style)))throw new WeavingError('請選擇短片風格');
 if(!Array.isArray(v.scenes)||v.scenes.length<1||v.scenes.length>12)throw new WeavingError('短片需要1–12鏡');const ids=new Set<string>();
 const scenes=v.scenes.map(value=>{const s=object(value);keys(s,['id','title','narration','caption','duration','motion','image']);const id=cardText(s.id,120,'鏡頭識別');if(!/^[\w-]{1,120}$/.test(id)||ids.has(id))throw new WeavingError('鏡頭識別重複或無效');ids.add(id);
 if(typeof s.duration!=='number'||!Number.isFinite(s.duration)||s.duration<1||s.duration>30||!['still','drift','paper'].includes(String(s.motion)))throw new WeavingError('每鏡需要1–30秒及有效動作');
 let image:ImageUse|null=null;if(s.image!==null){const i=object(s.image);keys(i,['assetId','kind','tool','prompt','sourceNote','publicConfirmed']);if(!['generated','own','licensed'].includes(String(i.kind))||typeof i.publicConfirmed!=='boolean')throw new WeavingError('配圖來源不正確');image={assetId:assetId(i.assetId),kind:i.kind as ImageUse['kind'],tool:cardText(i.tool,200,'工具'),prompt:cardText(i.prompt,4000,'提示'),sourceNote:cardText(i.sourceNote,2000,'來源'),publicConfirmed:i.publicConfirmed};}
 return{id,title:cardText(s.title,100,'鏡頭名稱'),narration:cardText(s.narration,2000,'口播'),caption:cardText(s.caption,180,'字幕'),duration:s.duration,motion:s.motion as Scene['motion'],image};});
 let voice:VoiceUse|null=null;if(v.voice!==null){const a=object(v.voice);keys(a,['assetId','kind','sourceNote','publicConfirmed']);if(!['self','test'].includes(String(a.kind))||typeof a.publicConfirmed!=='boolean')throw new WeavingError('聲音來源不正確');voice={assetId:assetId(a.assetId),kind:a.kind as VoiceUse['kind'],sourceNote:cardText(a.sourceNote,2000,'錄音來源'),publicConfirmed:a.publicConfirmed};}
 const result={title:cardText(v.title,200,'短片名稱'),angle:cardText(v.angle,2000,'觀點'),style:v.style as VideoDraft['style'],rawTranscript:cardText(v.rawTranscript,40000,'原始逐字稿'),scenes,voice};if(duration(result)>180)throw new WeavingError('短片總長不可超過180秒');return result;
}
export function assertVideoReady(d:VideoDraft){if(!d.title.trim()||!d.angle.trim())throw new WeavingError('請填短片名稱與觀點');for(const [i,s]of d.scenes.entries()){if(!s.image)throw new WeavingError(`第${i+1}鏡尚未加入圖片`);if(!s.caption.trim()||wrapCardText(s.caption,13).length>3)throw new WeavingError(`第${i+1}鏡字幕請填寫並縮短至3行以內`);if(!s.image.publicConfirmed||!s.image.sourceNote.trim())throw new WeavingError(`第${i+1}鏡圖片公開確認尚未完成`);}if(!d.voice||!d.voice.publicConfirmed||!d.voice.sourceNote.trim())throw new WeavingError('聲音來源及公開確認尚未完成');}
