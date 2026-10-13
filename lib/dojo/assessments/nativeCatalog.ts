import 'server-only';
import {notion,withNotionRateLimit} from '@/lib/notion/client';
import {DATA_SOURCES} from '@/lib/notion/schema';
import {LearningError,uuidPattern} from '../learningFoundation/model';
export type NativeSource={id:string;label:string};
export type NativeCandidate={referenceId:string;fileBlockId:string;label:string;blockType:'file'|'audio'|'image'};
const privatePrefixes=['行光能力規準-','行光能力嘗試-','行光能力證明-','行光學成事件-'];
const obj=(v:unknown):Record<string,unknown>=>v&&typeof v==='object'?v as Record<string,unknown>:{};
function same(a:unknown,b:string){return typeof a==='string'&&a.replaceAll('-','').toLowerCase()===b.replaceAll('-','').toLowerCase()}
function guid(value:string){if(!uuidPattern.test(value))throw new LearningError('附件來源 ID 不正確');return value}
function plain(v:unknown){return Array.isArray(v)?v.map(x=>{const a=obj(x);return typeof a.plain_text==='string'?a.plain_text:typeof obj(a.text).content==='string'?obj(a.text).content:''}).join(''):''}
function title(page:Record<string,unknown>){const properties=obj(page.properties),raw=plain(obj(properties['標題']).title);if(raw.startsWith('行光學習正文-')){const body=plain(obj(properties['內容']).rich_text);try{const value=JSON.parse(body);return typeof value.title==='string'&&value.title.trim()?value.title.slice(0,180):'學習紀錄附件'}catch{return '學習紀錄附件'}}return (raw||'未命名來源').slice(0,180)}
export function isPrivateNativeSource(page:unknown){const p=obj(page);const raw=plain(obj(obj(p.properties)['標題']).title);return privatePrefixes.some(prefix=>raw.startsWith(prefix));}
function owner(page:Record<string,unknown>){if(!same(obj(page.parent).data_source_id,DATA_SOURCES.DB14_知識庫))throw new LearningError('附件來源不屬於本 owner',403);if(page.archived||page.in_trash)throw new LearningError('附件來源已封存，請先恢復來源',409)}
export async function nativeSources(cursor?:string){
 if(cursor&&(cursor.length>2000||!cursor.trim()))throw new LearningError('附件來源分頁游標不正確');
 const page=await withNotionRateLimit(()=>notion().dataSources.query({data_source_id:DATA_SOURCES.DB14_知識庫,page_size:20,...(cursor?{start_cursor:cursor}:{})}));
 if(page.has_more&&(!page.next_cursor||page.next_cursor.length>2000||page.next_cursor===cursor))throw new LearningError('附件來源分頁未前進',503);
 const sources:NativeSource[]=[];for(const value of page.results){const p=obj(value);owner(p);const raw=plain(obj(obj(p.properties)['標題']).title);if(privatePrefixes.some(prefix=>raw.startsWith(prefix)))continue;sources.push({id:guid(String(p.id)),label:title(p)})}
 return {sources,cursor:page.has_more?page.next_cursor:null};
}
export async function nativeAttachments(pageId:string){
 guid(pageId);const page=obj(await withNotionRateLimit(()=>notion().pages.retrieve({page_id:pageId})));owner(page);if(isPrivateNativeSource(page))throw new LearningError('私有驗收狀態頁不可作附件來源',403);
 const attachments:NativeCandidate[]=[],visited=new Set<string>();let count=0,requests=0;
 async function walk(container:string,depth:number){
  if(depth>15||visited.has(container))throw new LearningError('附件來源階層無法完整核對',503);visited.add(container);
  let cursor:string|undefined,numberOfPages=0;const cursors=new Set<string>();
  do{if(++numberOfPages>20||++requests>2000)throw new LearningError('附件分頁太多，無法完整核對',503);const result=await withNotionRateLimit(()=>notion().blocks.children.list({block_id:container,page_size:100,...(cursor?{start_cursor:cursor}:{})}));
   if(result.has_more&&(!result.next_cursor||cursors.has(result.next_cursor)||result.next_cursor===cursor))throw new LearningError('附件區塊分頁未前進',503);
   for(const value of result.results){if(++count>2000)throw new LearningError('附件來源太大，無法完整核對',503);const b=obj(value),parent=obj(b.parent);if(!(container===pageId?parent.type==='page_id'&&same(parent.page_id,pageId):parent.type==='block_id'&&same(parent.block_id,container)))throw new LearningError('附件區塊不屬於所選來源',403);if(b.archived||b.in_trash)continue;
    const type=String(b.type),payload=obj(b[type]);if(['file','audio','image'].includes(type)&&payload.type==='file'){const label=plain(payload.caption)||String(payload.name||'既有附件');attachments.push({referenceId:pageId,fileBlockId:guid(String(b.id)),label:label.slice(0,180),blockType:type as NativeCandidate['blockType']});}
    if(b.has_children&&!['child_page','child_database','synced_block'].includes(type))await walk(guid(String(b.id)),depth+1);
   }
   if(!result.has_more)break;cursors.add(result.next_cursor!);cursor=result.next_cursor!;
  }while(cursor);
 }
 await walk(pageId,0);return {attachments};
}
