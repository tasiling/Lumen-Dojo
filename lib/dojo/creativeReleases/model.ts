import {WeavingError,stringValue} from '../weavingWorkflow/model';
export const RELEASE_PREFIX='行光作品發布紀錄-v1-';
export const RELEASE_PLATFORMS={plurk:'噗浪',threads:'Threads',instagram_post:'IG貼文'} as const;
export type ReleasePlatform=keyof typeof RELEASE_PLATFORMS;
export const RELEASE_FORMATS={text:'純文字',illustrated:'圖文','short-video':'短影音',podcast:'Podcast',comic:'短漫','long-video':'長影片'} as const;
export type ReleaseFormat=keyof typeof RELEASE_FORMATS;
export type ReleaseKind=ReleaseFormat|'platform-text';
export type ReleaseSource={kind:ReleaseKind;id:string;format:ReleaseFormat;title:string;versionId:string;platform:ReleasePlatform|null};
export type ReleaseStatus='planned'|'published'|'withdrawn';
export type ReleasePatch={status:ReleaseStatus;scheduledOn:string|null;publishedOn:string|null;publishedUrl:string;responseNote:string;nextStep:string};
export type CreativeRelease=ReleasePatch&{schema:1;owner:string;id:string;revision:number;publicationId:string;source:ReleaseSource;platform:ReleasePlatform;createdAt:string;updatedAt:string};
export type LegacyReleaseLink={id:string;publicationId:string;title:string;platform:string;publishedUrl:string;status:string;responseNote:string;nextStep:string};
export function releaseObject(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))throw new WeavingError('發布紀錄格式不正確');return value as Record<string,unknown>;}
export function exactReleaseKeys(v:Record<string,unknown>,allowed:string[]){if(Object.keys(v).some(k=>!allowed.includes(k)))throw new WeavingError('發布紀錄含未知或受保護欄位');}
export function parseReleasePlatform(v:unknown):ReleasePlatform{if(typeof v!=='string'||!Object.hasOwn(RELEASE_PLATFORMS,v))throw new WeavingError('請選噗浪、Threads或IG');return v as ReleasePlatform;}
export function parseReleaseKind(v:unknown):ReleaseKind{if(typeof v!=='string'||v!=='platform-text'&&!Object.hasOwn(RELEASE_FORMATS,v))throw new WeavingError('成品形式不正確');return v as ReleaseKind;}
export function safeReleaseURL(v:string){try{const u=new URL(v);return ['http:','https:'].includes(u.protocol)&&Boolean(u.hostname)&&!u.username&&!u.password?v:null;}catch{return null;}}
function date(v:unknown,label:string){if(v===null||v==='')return null;if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(Date.parse(v))||new Date(v).toISOString().slice(0,10)!==v)throw new WeavingError(label+'請填有效日期');return v;}
export function parseReleasePatch(value:unknown):ReleasePatch{
 const v=releaseObject(value);exactReleaseKeys(v,['status','scheduledOn','publishedOn','publishedUrl','responseNote','nextStep']);if(!['planned','published','withdrawn'].includes(String(v.status)))throw new WeavingError('發布紀錄狀態不正確');
 const p={status:v.status as ReleaseStatus,scheduledOn:date(v.scheduledOn,'預計發布日期'),publishedOn:date(v.publishedOn,'實際發布日期'),publishedUrl:stringValue(v.publishedUrl,2000,'發布連結'),responseNote:stringValue(v.responseNote,5000,'交流與回看'),nextStep:stringValue(v.nextStep,2000,'下一步')};
 if(p.publishedUrl&&!safeReleaseURL(p.publishedUrl))throw new WeavingError('發布連結須為完整http(s)網址，且不包含帳密');if(p.status==='published'&&(!p.publishedUrl||!p.publishedOn))throw new WeavingError('標記已自行發布前，請填實際發布日期與完整連結');return p;
}
export function normalizeRelease(value:unknown,id:string):CreativeRelease{
 const v=releaseObject(value),s=releaseObject(v.source),kind=parseReleaseKind(s.kind),format=kind==='platform-text'?'text':kind;
 if(v.schema!==1||!Number.isInteger(v.revision)||Number(v.revision)<1||s.format!==format)throw new WeavingError('發布紀錄版本或來源不正確',409);
 return{schema:1,id,owner:stringValue(v.owner,120,'歸屬',false),revision:Number(v.revision),publicationId:stringValue(v.publicationId,300,'聊解企劃',false),source:{kind,format,id:stringValue(s.id,300,'固定成品',false),title:stringValue(s.title,300,'成品名稱'),versionId:stringValue(s.versionId,300,'成品版次',false),platform:s.platform===null?null:parseReleasePlatform(s.platform)},platform:parseReleasePlatform(v.platform),...parseReleasePatch({status:v.status,scheduledOn:v.scheduledOn,publishedOn:v.publishedOn,publishedUrl:v.publishedUrl,responseNote:v.responseNote,nextStep:v.nextStep}),createdAt:stringValue(v.createdAt,50,'建立時間',false),updatedAt:stringValue(v.updatedAt,50,'更新時間',false)};
}
export function sourceKey(s:Pick<ReleaseSource,'kind'|'id'>){return s.kind+':'+s.id;}
