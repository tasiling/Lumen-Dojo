import 'server-only';
import {LIAOJIE_PROJECT_TITLE_PREFIX,parseJson} from '../formal';
import {normalizeLiaojieProject,LIAOJIE_PLATFORMS} from '../liaojiePublication';
import {listJsonRecords} from '../notionStore';
import {readRecord,readWork,WEAVING_OWNER} from '../weavingWorkflow/store';
import {readCompletion} from '../weavingWorkflow/completions';
import {readTextVersion,readTextVariant,listTextVariants} from '../liaojieText/store';
import {WeavingError,stringValue} from '../weavingWorkflow/model';
import {parseReleaseKind,parseReleasePlatform,type ReleaseKind,type ReleasePlatform,type ReleaseSource,type LegacyReleaseLink} from './model';
const MEDIA={illustrated:['illustratedOutputRefs','行光圖文稿-v1-','行光圖文版本-v1-','行光圖文成品-v1-','deckId'],'short-video':['videoOutputRefs','行光短片稿-v1-','行光短片版本-v1-','行光短片成品-v1-','projectId'],podcast:['podcastOutputRefs','行光聲音稿-v1-','行光聲音版本-v1-','行光聲音成品-v1-','projectId'],comic:['comicOutputRefs','行光短漫稿-v1-','行光短漫版本-v1-','行光短漫成品-v1-','projectId'],'long-video':['longVideoOutputRefs','行光長片稿-v1-','行光長片版本-v1-','行光長片成品-v1-','projectId']} as const;
async function owned(id:string,prefix:string){const v=parseJson((await readRecord(id,prefix)).內容) as Record<string,unknown>;if(!v||v.owner!==WEAVING_OWNER)throw new WeavingError('成品歸屬不符',403);return v;}
async function publication(id:string){const p=normalizeLiaojieProject(parseJson((await readRecord(id,LIAOJIE_PROJECT_TITLE_PREFIX)).內容),{id});if(!p||!p.sourceCompletionVersionId)throw new WeavingError('這件企劃尚無固定來源，請使用既有發布欄位',409);const c=await readCompletion(p.sourceCompletionVersionId),w=await readWork(c.workId);if(c.owner!==WEAVING_OWNER||c.workId!==p.weavingWorkId||!w.completionVersionRefs.includes(c.id))throw new WeavingError('企劃固定來源不符',403);return{p,c,w};}
export async function resolveReleaseSource(publicationId:string,kindValue:unknown,sourceId:string,platform:ReleasePlatform):Promise<ReleaseSource>{
 const kind=parseReleaseKind(kindValue),{p,c,w}=await publication(publicationId);if(p.status==='archived')throw new WeavingError('企劃已封存，既有發布紀錄仍可回看',409);
 if((kind==='text'||kind==='platform-text')&&(p.sourceFormat!=='text'||w.format!=='text'))throw new WeavingError('這是非文字來源，請使用原發布欄位',403);
 if(kind==='text'){if(sourceId!==c.id)throw new WeavingError('固定文字不屬於這件企劃',403);return{kind,format:'text',id:c.id,title:c.title,versionId:c.id,platform:null};}
 if(kind==='platform-text'){const v=await readTextVersion(sourceId),parent=await readTextVariant(v.variantId);if(v.owner!==WEAVING_OWNER||parent.owner!==WEAVING_OWNER||parent.publicationId!==p.id||!parent.versionRefs.includes(v.id)||v.platform!==parent.platform||v.platform!==platform||parent.sourceCompletionVersionId!==c.id)throw new WeavingError('文字平台版次或平台不符',403);return{kind,format:'text',id:v.id,title:v.title,versionId:v.id,versionNumber:v.number,platform:parseReleasePlatform(v.platform)};}
 const [ref,projectPrefix,versionPrefix,outputPrefix,parentKey]=MEDIA[kind];if(!p[ref].includes(sourceId))throw new WeavingError('此成品尚未交接到這件企劃',403);const o=await owned(sourceId,outputPrefix),parentId=stringValue(o[parentKey],300,'成品專案',false),parent=await owned(parentId,projectPrefix),versionId=stringValue(o.versionId,300,'成品版次',false),v=await owned(versionId,versionPrefix);
 if(parent.completionId!==c.id||parent.workId!==p.weavingWorkId||!Array.isArray(parent.outputRefs)||!parent.outputRefs.includes(sourceId)||!Array.isArray(parent.versionRefs)||!parent.versionRefs.includes(versionId)||v[parentKey]!==parentId)throw new WeavingError('成品與來源版次關係不符',403);
 return{kind,format:kind,id:sourceId,title:stringValue(o.title,300,'成品名稱',false),versionId,platform:null};
}
export async function releaseSources(publicationId:string){
 const {p,c,w}=await publication(publicationId),text=p.sourceFormat==='text'&&w.format==='text',requests:{kind:ReleaseKind;id:string;platform:ReleasePlatform}[]=text?[{kind:'text',id:c.id,platform:'plurk'}]:[];
 for(const [kind,[ref]]of Object.entries(MEDIA))for(const id of p[ref as keyof typeof p] as string[])requests.push({kind:kind as ReleaseKind,id,platform:'plurk'});
 const missing:string[]=[];
 if(text)try{for(const v of await listTextVariants(p.id))for(const id of v.versionRefs)requests.push({kind:'platform-text',id,platform:parseReleasePlatform(v.platform)});}catch(e){missing.push('平台文字：'+(e instanceof Error?e.message:String(e)));}
 const results=await Promise.allSettled(requests.map(r=>resolveReleaseSource(p.id,r.kind,r.id,r.platform)));
 return{sources:results.flatMap(r=>r.status==='fulfilled'?[r.value]:[]),missing:[...missing,...results.flatMap((r,i)=>r.status==='rejected'?[requests[i].kind+'：'+(r.reason instanceof Error?r.reason.message:String(r.reason))]:[])]};
}
export async function legacyReleaseLinks(publicationId?:string):Promise<LegacyReleaseLink[]>{const rows=await listJsonRecords(LIAOJIE_PROJECT_TITLE_PREFIX),links:LegacyReleaseLink[]=[];for(const row of rows){if(publicationId&&row.id!==publicationId)continue;const p=normalizeLiaojieProject(row.value,{id:row.id});if(p?.publishedUrl)links.push({id:'project:'+p.id,publicationId:p.id,title:p.title||p.sourceTitle,platform:LIAOJIE_PLATFORMS[p.platform],publishedUrl:p.publishedUrl,status:p.status,responseNote:p.responseNote,nextStep:p.nextStep});}for(const v of await listTextVariants(publicationId))if(v.owner===WEAVING_OWNER&&v.publishedUrl)links.push({id:'text:'+v.id,publicationId:v.publicationId,title:'既有文字平台稿',platform:LIAOJIE_PLATFORMS[v.platform],publishedUrl:v.publishedUrl,status:v.status,responseNote:'',nextStep:''});return links;}
