/** Only chooses an existing editor; never creates a record or migrates data. */
export function contextualAdd(pathname:string,search:string):
  | {type:'record';space:'practice'|'dao';kind:string}
  | {type:'link';href:string} {
  if (/^\/dao(\/|$)/.test(pathname)) return {type:'record',space:'dao',kind:'入藏'};
  if (/^\/practice(\/|$)/.test(pathname)) {
    const item=new URLSearchParams(search).get('learningItem');
    if(item) return {type:'link',href:`/practice/records?${new URLSearchParams({new:'1',learningItem:item})}`};
    return {type:'record',space:'practice',kind:'修習'};
  }
  if (/^\/reading(\/|$)/.test(pathname)) return {type:'link',href:'/add?mode=reading'};
  return {type:'link',href:'/add'};
}

import type { LearningEntity } from './learningFoundation/model';
/** Canonicalize new-editor context from the already loaded, owner-scoped graph. */
export function newRecordItemId(items:LearningEntity[],requested:string):string|null {
  if(!requested) return '';
  const item=items.find(i=>i.kind==='item' && (i.id===requested || i.legacyKey===requested));
  return item && item.status!=='archived' ? item.id : null;
}
