import { WeavingError } from '../weavingWorkflow/model';
import {cardText,assetId,wrapCardText,type ImageUse} from '../illustrated/model';
export const COMIC_PREFIX='行光短漫稿-v1-',COMIC_VERSION_PREFIX='行光短漫版本-v1-',COMIC_OUTPUT_PREFIX='行光短漫成品-v1-';
export type Character={id:string;name:string;description:string;reference:ImageUse|null};
export type Panel={id:string;scene:string;dialogue:string;speaker:string;characterIds:string[];fit:'contain'|'cover';position:number;image:ImageUse|null;confirmed:boolean};
export type ComicDraft={title:string;caption:string;characters:Character[];panels:Panel[]};
export type ComicProject={id:string;owner:string;revision:number;completionId:string;workId:string;sourceDigest:string;currentVersionId:string;versionRefs:string[];outputRefs:string[];createdAt:string;updatedAt:string};
export type ComicVersion=ComicDraft&{id:string;projectId:string;number:number;createdAt:string};
export type RenderRef={pageId:string;assetId:string};
export type ComicOutput={id:string;projectId:string;versionId:string;title:string;caption:string;draft:ComicDraft;renders:RenderRef[];createdAt:string};
export type ComicBundle={project:ComicProject;version:ComicVersion;versions:ComicVersion[];outputs:ComicOutput[]};
const obj=(v:unknown):Record<string,unknown>=>{if(!v||typeof v!=='object'||Array.isArray(v))throw new WeavingError('短漫格式不正確');return v as Record<string,unknown>;};
const exact=(v:Record<string,unknown>,keys:string[])=>{if(Object.keys(v).some(k=>!keys.includes(k)))throw new WeavingError('短漫含未知或受保護欄位');};
const identity=(v:unknown)=>{const id=cardText(v,120,'識別');if(!/^[\w-]{1,120}$/.test(id))throw new WeavingError('識別格式不正確');return id;};
function image(v:unknown):ImageUse|null{if(v===null)return null;const x=obj(v);exact(x,['assetId','kind','tool','prompt','sourceNote','publicConfirmed']);if(!['generated','own','licensed'].includes(String(x.kind))||typeof x.publicConfirmed!=='boolean')throw new WeavingError('圖片來源設定不正確');return {assetId:assetId(x.assetId),kind:x.kind as ImageUse['kind'],tool:cardText(x.tool,200,'工具'),prompt:cardText(x.prompt,4000,'提示詞'),sourceNote:cardText(x.sourceNote,2000,'圖片來源'),publicConfirmed:x.publicConfirmed};}
export function newPanel(id:string):Panel{return {id,scene:'',dialogue:'',speaker:'',characterIds:[],fit:'contain',position:50,image:null,confirmed:false};}
export function parseComicDraft(value:unknown):ComicDraft{
 const d=obj(value);exact(d,['title','caption','characters','panels']);
 if(!Array.isArray(d.characters)||d.characters.length>8)throw new WeavingError('最多8個角色');
 const ids=new Set<string>();const characters=d.characters.map(v=>{const c=obj(v);exact(c,['id','name','description','reference']);const id=identity(c.id);if(ids.has(id))throw new WeavingError('角色識別重複');ids.add(id);return {id,name:cardText(c.name,80,'角色名稱'),description:cardText(c.description,2000,'角色描述'),reference:image(c.reference)};});
 if(!Array.isArray(d.panels)||!d.panels.length||d.panels.length>12)throw new WeavingError('短漫需要1–12格');
 const pids=new Set<string>();const panels=d.panels.map(v=>{const p=obj(v);exact(p,['id','scene','dialogue','speaker','characterIds','fit','position','image','confirmed']);const id=identity(p.id);if(pids.has(id))throw new WeavingError('分格識別重複');pids.add(id);
 if(!Array.isArray(p.characterIds)||p.characterIds.length>8||p.characterIds.some(x=>typeof x!=='string'||!ids.has(x))||new Set(p.characterIds).size!==p.characterIds.length)throw new WeavingError('分格角色引用不正確');
 if(!['contain','cover'].includes(String(p.fit))||typeof p.position!=='number'||!Number.isFinite(p.position)||p.position<0||p.position>100||typeof p.confirmed!=='boolean')throw new WeavingError('分格版面不正確');
 return{id,scene:cardText(p.scene,2000,'分鏡'),dialogue:cardText(p.dialogue,160,'對白'),speaker:cardText(p.speaker,40,'說話者'),characterIds:p.characterIds as string[],fit:p.fit as Panel['fit'],position:p.position,image:image(p.image),confirmed:p.confirmed};});
 return{title:cardText(d.title,200,'短漫名稱'),caption:cardText(d.caption,5000,'配文'),characters,panels};
}
export function panelLayout(p:Panel){const lines=wrapCardText(p.dialogue,14),speaker=wrapCardText(p.speaker,18);return {lines,speaker,overflow:lines.length>4||speaker.length>1};}
export function comicSheets(d:ComicDraft){return Array.from({length:Math.ceil(d.panels.length/4)},(_,i)=>({id:`sheet-${i+1}`,panels:d.panels.slice(i*4,i*4+4)}));}
export function comicImageUses(d:ComicDraft){return [...d.characters.flatMap(c=>c.reference?[c.reference]:[]),...d.panels.flatMap(p=>p.image?[p.image]:[])];}
export function assertComicReady(d:ComicDraft){if(!d.title.trim())throw new WeavingError('請填短漫名稱');if(wrapCardText(d.title,23).length>2)throw new WeavingError('短漫標題超出版面');for(const c of d.characters)if(!c.name.trim()||!c.description.trim())throw new WeavingError('請補角色名稱與描述');for(const [i,p]of d.panels.entries()){if(!p.scene.trim()||!p.image)throw new WeavingError(`第${i+1}格請補分鏡與圖片`);if(panelLayout(p).overflow)throw new WeavingError(`第${i+1}格對白超出版面`);if(!p.confirmed)throw new WeavingError(`第${i+1}格尚未確認`);}for(const i of comicImageUses(d))if(!i.publicConfirmed||!i.sourceNote.trim())throw new WeavingError('圖片來源與公開確認尚未完成');}
export function assertComicTransition(previous:ComicDraft,next:ComicDraft){for(const p of previous.panels.filter(p=>p.confirmed)){const n=next.panels.find(n=>n.id===p.id);if(!n)throw new WeavingError('已確認格不可刪除，請先解除確認並保存',409);if(JSON.stringify({...n,confirmed:true})!==JSON.stringify(p))throw new WeavingError('已確認格請先解除確認並保存，再修改內容',409);for(const id of p.characterIds){const old=previous.characters.find(c=>c.id===id),now=next.characters.find(c=>c.id===id);if(JSON.stringify(old)!==JSON.stringify(now))throw new WeavingError('角色仍由已確認格使用，請先解除相關格確認並保存',409);}}}
