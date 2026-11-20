'use strict';

const api = '/api/dojo/weaving-studio';
const topicsFromCatalog = new Map(), worksFromCatalog = new Map();
const catalogs = {catalog:'loading', cards:'loading', media:'loading'};
const pendingKey = 'dojo.weaving.unsent.v1';
let baseRecords = {}, ready = false, sending = null, syncTimer, errorMessage = '', conflictFound = false;

async function request(url, init) {
  const response = await fetch(url, {credentials:'same-origin', cache:'no-store', ...init});
  const body = await response.json().catch(()=>({}));
  if (!response.ok) {
    const error = new Error(response.status===401 ? '請重新解鎖行光道場。' : body.error || '目前無法連到行光道場。');
    error.status=response.status;
    throw error;
  }
  return body;
}
function blankRecords() {
  return {works:[], workShelf:[], shuttles:[], topicExtras:{}, cardReadings:{}, shuttleForges:{},
    shuttleMatches:{}, relatedReviews:{}, pubs:[], inbox:[], days:{}, services:[]};
}
function unpack(records) {
  const next=blankRecords();
  for(const [key, value] of Object.entries(records)){
    const colon=key.indexOf(':'), type=key.slice(0,colon), id=key.slice(colon+1), record=structuredClone(value);
    switch(type){
      case 'work':(record.shelf?next.workShelf:next.works).push(record);break;
      case 'shuttle':next.shuttles.push(record);break;
      case 'topicExtras':next.topicExtras[id]=record;break;
      case 'reading':next.cardReadings[id]=record;break;
      case 'forge':next.shuttleForges[id]=record;break;
      case 'match':next.shuttleMatches[id]=record;break;
      case 'review':next.relatedReviews[id]=record;break;
      case 'publication':next.pubs.push(record);break;
      case 'inbox':next.inbox.push(record);break;
    }
  }
  for(const [id, topic] of topicsFromCatalog)next.shuttles.push({...structuredClone(topic),...structuredClone(next.topicExtras[id]||{})});
  next.pubs.reverse();
  return next;
}
function pack() {
  const result={};
  for(const w of [...state.works,...state.workShelf])result['work:'+w.id]=w;
  const extras={...state.topicExtras};
  for(const s of state.shuttles){
    const original=topicsFromCatalog.get(s.id);
    if(!original){result['shuttle:'+s.id]=s;continue;}
    const extra={};
    for(const k of Object.keys(s))if(!same(s[k],original[k]))extra[k]=s[k];
    if(Object.keys(extra).length)extras[s.id]=extra;else delete extras[s.id];
  }
  for(const [type,collection] of [['topicExtras',extras],['reading',state.cardReadings],['forge',state.shuttleForges],['match',state.shuttleMatches],['review',state.relatedReviews]]){
    for(const [id,val] of Object.entries(collection||{}))result[type+':'+id]=val;
  }
  for(const r of [...state.pubs].reverse())result['publication:'+r.id]=r;
  for(const r of state.inbox)result['inbox:'+r.id+':'+r.n]=r;
  return result;
}
function same(a,b){return JSON.stringify(a)===JSON.stringify(b);}
function changes(base, current) {
  return [...new Set([...Object.keys(base),...Object.keys(current)])].filter(k=>!same(base[k],current[k]))
    .map(key=>({key,before:base[key]??null,after:current[key]??null}));
}
function setRecord(records,key,value){if(value===null)delete records[key];else records[key]=value;}
function hasUnsaved(){return ready && changes(baseRecords,pack()).length>0;}
function restoreRecords(records){state=unpack(records);relatedDrafts.clear();}
function showSave(message='',failed=false) {
  const line=$('saved');if(line)line.textContent=message||'已儲存到行光道場';
  const notice=$('saveNotice');notice.replaceChildren();notice.hidden=!failed;
  if(!failed)return;
  const text=document.createElement('p');text.textContent=message;notice.append(text);
  const add=(label,fn)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=fn;notice.append(b);};
  add('下載未同步草稿',downloadDraft);
  if(conflictFound)add('重新載入',()=>{downloadDraft();sessionStorage.removeItem(pendingKey);ready=false;location.reload();});
  else add('重試儲存',()=>{void flush().catch(()=>{});});
}
function downloadDraft(){
  const blob=new Blob([JSON.stringify(changes(baseRecords,pack()),null,2)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='織光堂-未同步草稿.json';a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),500);
}
function retainPending(list){
  try{if(list.length)sessionStorage.setItem(pendingKey,JSON.stringify(list));else sessionStorage.removeItem(pendingKey);return true;}
  catch{return false;}
}
function scheduleSave(){
  if(!ready)return;
  const diff=changes(baseRecords,pack());
  if(!diff.length)return;
  const backedUp=retainPending(diff);
  storageOK=true;
  showSave(errorMessage || (backedUp?'正在儲存到行光道場…':'請等候儲存完成再離開'),!!errorMessage);
  clearTimeout(syncTimer);if(!conflictFound)syncTimer=setTimeout(()=>{void flush().catch(()=>{});},420);
}
function showSaveError(error){
  conflictFound=error.status===409 && !String(error.message).includes('另一筆學習寫入');
  errorMessage=error.message||'連線中斷，請重試儲存。';showSave(errorMessage,true);
}
function applyLocalEdits(sent, local, remote){
  if(same(sent,local))return remote;
  if(same(sent,remote))return local;
  if(sent && local && remote && [sent,local,remote].every(v=>typeof v==='object'&&!Array.isArray(v))){
    const merged={...remote};
    for(const k of new Set([...Object.keys(sent),...Object.keys(local)])){
      if(same(sent[k],local[k]))continue;
      if(!(k in local))delete merged[k];else merged[k]=applyLocalEdits(sent[k],local[k],remote[k]);
    }
    return merged;
  }
  return local;
}
async function sendPending(){
  while(true){
    const diff=structuredClone(changes(baseRecords,pack()));
    if(!diff.length){retainPending([]);errorMessage='';conflictFound=false;showSave();return;}
    const result=await request(api,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({changes:diff})});
    const live=pack();let merged=false;
    for(const {key,after} of diff){
      const remote=result.values[key];setRecord(baseRecords,key,remote);
      if(!same(remote,after)){setRecord(live,key,applyLocalEdits(after,live[key]??null,remote));merged=true;}
    }
    if(merged)restoreRecords(live);
    retainPending(changes(baseRecords,pack()));
    try{localStorage.setItem('dojo.weaving.changed',String(result.revision));}catch{}
  }
}
async function flush(){
  if(!ready)throw new Error('正在讀取織光堂。');
  clearTimeout(syncTimer);
  if(sending)return sending;
  sending=sendPending().catch(e=>{showSaveError(e);throw e;}).finally(()=>{sending=null;});
  return sending;
}
function renderIfReading(){
  const editing=document.activeElement?.matches('input:not([type=checkbox]),textarea,select,[contenteditable=true]');
  if(ready&&!editing&&!$('dialog').open&&($('main').querySelector('[data-wait-list]')||['home','works','shuttles','shuttle','card','cards','reading','match','related','liao','publish',''].includes(route)))render();
}
async function refreshWorkspace(){
  if(!ready||sending||hasUnsaved()||$('dialog').open || document.activeElement?.matches('input,textarea,select') || ['edit','forge','compare'].includes(route))return;
  const doc=await request(api);
  if(sending||hasUnsaved()||same(baseRecords,doc.records))return;
  baseRecords=doc.records;restoreRecords(baseRecords);renderIfReading();
}
window.addEventListener('focus',()=>{void refreshWorkspace().catch(()=>{});});
window.addEventListener('storage',e=>{if(e.key==='dojo.weaving.changed')void refreshWorkspace().catch(()=>{});});
window.addEventListener('online',()=>{if(ready&&hasUnsaved()&&!conflictFound)void flush().catch(()=>{});});
window.addEventListener('beforeunload',e=>{if(ready&&hasUnsaved()){e.preventDefault();e.returnValue='';}});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&ready&&hasUnsaved()&&!conflictFound)void flush().catch(()=>{});});

const nativeLocations={今天:'/',行事曆:'/calendar',新增:'/add',週盤:'/bingo',回看:'/review'};
async function openNative(url){
  if(!url.startsWith('/')||url.startsWith('//'))return;
  if(ready&&hasUnsaved())try{await flush();}catch{return;}
  location.assign(url);
}
function nativeRow(title,caption,ico,url){return row(title,caption,ico,'native',[url]);}
function productionTools(realm) {
  const links=realm==='liao'
    ? nativeRow('既有發布與交付','接續原有的平台稿與服務紀錄','send','/liaojie/manage')+
      nativeRow('聊解室工具','開啟既有的企劃與發布工具','layers','/liaojie/tools')
    : row('觀點與洞察','查看卡片、來源與相連的織光杼','book','go',['cards'])+
      nativeRow('創作工具','開啟既有的製作工作臺','pen','/weaving/tools')+
      nativeRow('素材來源','查看送入織光堂的素材','folder','/weaving/sources')+
      nativeRow('既有作品與企劃','回到原工作臺接續編輯','folder','/weaving/manage');
  return '<section class="panel">'+more(realm==='liao'?'工具與既有紀錄':'工具與素材',links)+'</section>';
}
handlers.native=openNative;
handlers.global=label=>openNative(nativeLocations[label]||'/');
handlers.realms=()=>openNative('/map');
handlers.timer=()=>openNative('/timer');
handlers.keep=async()=>{keep(current());try{await flush();updatePreview();toast('草稿已儲存到行光道場');}catch{}};
function collectionNote(key){
  if(catalogs[key]==='ready')return '';
  const label={cards:'觀點與洞察',catalog:'既有作品與織光杼',media:'影音與圖像作品'}[key];
  const message=catalogs[key]==='loading'?'正在讀取'+label+'…':label+'未能載入。 '+btn('重新讀取','retryCatalog',[key],'link');
  return '<p role="status" data-wait-list="'+esc(key)+'">'+message+'</p>';
}
handlers.retryCatalog=key=>loadCatalog(key);
function loadedNativeWork(w){
  return {...work(w.type,w.id),shuttle:w.shuttle||'',title:w.title,updated:w.updated,nativeStatus:w.status,nativeURL:w.url,nativeParent:w.workId};
}
function listedWorks(){
  return [...state.works,...[...worksFromCatalog.values()].map(w=>w.nativeParent?{...w,shuttle:worksFromCatalog.get(w.nativeParent)?.shuttle||''}:w)];
}
async function loadCatalog(key){
  catalogs[key]='loading';
  try{
    const result=await request(api+'?list='+key);
    if(key==='cards'){
      sourceCards.clear();for(const c of result.cards)sourceCards.set(c.id,c);
      availableMaterials.splice(0,availableMaterials.length,...result.cards.map(c=>({name:c.title,source:c.quote,note:c.idea===c.quote?'':c.idea,url:c.url})));
    }else{
      for(const w of result.works)worksFromCatalog.set(w.id,loadedNativeWork(w));
      if(key==='catalog')for(const t of result.topics){
        if(!topicsFromCatalog.has(t.id)){
          topicsFromCatalog.set(t.id,t);
          state.shuttles.push({...structuredClone(t),...structuredClone(state.topicExtras[t.id]||{})});
        }
      }
    }
    catalogs[key]='ready';
  }catch{catalogs[key]='error';}
  renderIfReading();
}
async function bootStudio(){
  try{
    const doc=await request(api);baseRecords=doc.records;
    const working=structuredClone(baseRecords);
    let pending=[];try{pending=JSON.parse(sessionStorage.getItem(pendingKey)||'[]');}catch{}
    for(const change of pending){
      if(same(change.after,baseRecords[change.key]??null))continue;
      setRecord(working,change.key,change.after);setRecord(baseRecords,change.key,change.before);
    }
    restoreRecords(working);ready=true;render();
    if(hasUnsaved())void flush().catch(()=>{});
    await Promise.all(['catalog','cards','media'].map(loadCatalog));renderIfReading();
  }catch{
    $('main').innerHTML='<h1>暫時無法開啟織光堂</h1><p>請確認連線，並重新讀取作品。</p>'+btn('重新讀取','boot',[],'primary')+' '+btn('前往既有工作臺','native',['/weaving/manage']);
  }
}
handlers.boot=bootStudio;
void bootStudio();
