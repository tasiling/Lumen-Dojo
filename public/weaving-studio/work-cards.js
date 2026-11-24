'use strict';

/* 寫文字時，卡片就在正文上方：已選用的、這一杼的、與目前內容字面相近的，以及搜尋全部。
   放進正文會同時把那張卡記為這件作品選用的卡，定稿時來源跟著保存。 */

let trayCaret=null, trayQuery='';

function trayBigrams(text) {
  const t=String(text||'').replace(/[\s　，。、！？：；「」『』（）,.!?:;…—\-]/g,''), out=new Set();
  for(let i=0;i<t.length-1;i++)out.add(t.slice(i,i+2));
  return out;
}
function trayOverlap(a,b) {
  if(!a.size||!b.size)return 0;
  let n=0;
  for(const k of b)if(a.has(k))n++;
  return n/b.size;
}
/** Cards that are not the reader's own words say so, so a GPT 延伸 is never mistaken for hers. */
function trayOwner(c) {
  return /GPT/.test(c.author||'')?'GPT 延伸，尚未確認':'';
}
function trayGroups(w) {
  const sh=findS(w.shuttle);
  const chosen=(w.cardIds||[]).filter(id=>sourceCards.has(id));
  const woven=shuttleCardIds(sh).filter(id=>!chosen.includes(id));
  const taken=new Set([...chosen,...woven]);
  const seed=trayBigrams([w.title,w.body,sh?.title,sh?.core].filter(Boolean).join(' '));
  const near=[...sourceCards.values()].filter(c=>!taken.has(c.id))
    .map(c=>({id:c.id,score:trayOverlap(seed,trayBigrams(c.idea+' '+c.quote))}))
    .filter(x=>x.score>=.12).sort((a,b)=>b.score-a.score).slice(0,5).map(x=>x.id);
  return {chosen,woven,near};
}
function trayCard(w,id) {
  const c=sourceCards.get(id);
  if(!c)return '';
  const used=w.cardIds?.includes(id), owner=trayOwner(c), sameText=c.quote===c.idea;
  return '<article class="tray-card'+(used?' is-used':'')+'">'+
    '<div class="tray-meta"><span class="tray-type" data-type="'+esc(c.type)+'">'+esc(c.type)+'</span>'+
      (owner?'<span class="tray-owner">'+esc(owner)+'</span>':'')+(used?'<span class="tray-used">已選用</span>':'')+'</div>'+
    '<b>'+esc(c.idea||c.title)+'</b>'+
    (c.quote&&!sameText?'<blockquote><small>'+esc(c.quoteLabel||'原文')+'</small>'+esc(c.quote)+'</blockquote>':'')+
    '<small class="tray-source">'+esc([c.source,c.location].filter(Boolean).join(' · '))+'</small>'+
    '<div class="actions">'+btn('放進正文','trayInsert',[id,'idea'],'light')+
      (c.quote&&!sameText?btn(c.quoteLabel==='我的原話'?'放進完整原話':'引用'+(c.quoteLabel||'原文'),'trayInsert',[id,'quote'],'tiny'):'')+
      btn(used?'取消選用':'先選用，稍後再放','trayToggle',[id],'tiny')+'</div></article>';
}
function trayBody(w) {
  if(catalogs.cards==='loading')return '<p>正在讀取卡片…</p>';
  if(catalogs.cards!=='ready')return '<p>卡片暫時讀不到，正文可以照常編寫。</p>';
  if(!sourceCards.size)return '<p>還沒有可以帶入的卡片。野採淬鍊或心知閱讀留下卡片後，會出現在這裡。</p>';
  const q=trayQuery.trim();
  if(q){
    const found=[...sourceCards.values()].filter(c=>[c.title,c.idea,c.quote,c.source,c.location].join(' ').includes(q)).slice(0,20);
    return found.length?found.map(c=>trayCard(w,c.id)).join(''):'<p>沒有符合「'+esc(q)+'」的卡片。</p>';
  }
  const g=trayGroups(w);
  const group=(label,hint,ids)=>ids.length?'<h4>'+esc(label)+'<small>'+esc(hint)+'</small></h4>'+ids.map(id=>trayCard(w,id)).join(''):'';
  return (group('這件作品選用的','',g.chosen)+group('這一杼的卡片','',g.woven)+
    group('可能相關','依字面相近排列，只是建議',g.near))||
    '<p>目前沒有和這篇相近的卡片。可以用上方的搜尋從全部 '+sourceCards.size+' 張裡找。</p>';
}
function workCardTray(w) {
  const n=(w.cardIds||[]).filter(id=>sourceCards.has(id)).length;
  return '<details class="work-card-tray" id="workCardTray" open><summary>可以帶入的卡片'+(n?'<span>已選用 '+n+' 張</span>':'')+'</summary>'+
    '<label class="field tray-search">搜尋全部卡片<input id="traySearch" type="search" value="'+esc(trayQuery)+'" autocomplete="off"></label>'+
    '<div id="trayList">'+trayBody(w)+'</div></details>';
}
function refreshTray() {
  const w=current(), list=$('trayList');
  if(!w||!list)return;
  list.innerHTML=trayBody(w);
  const n=(w.cardIds||[]).filter(id=>sourceCards.has(id)).length, summary=$('workCardTray')?.querySelector('summary');
  if(summary)summary.innerHTML='可以帶入的卡片'+(n?'<span>已選用 '+n+' 張</span>':'');
}
function trayText(c,part) {
  if(part!=='quote')return c.idea||c.title;
  // Her own words go in as they are; someone else's line goes in quoted, with where it came from.
  if(c.quoteLabel==='我的原話')return c.quote;
  return '「'+c.quote+'」\n——'+[c.source,c.location].filter(Boolean).join('，');
}

Object.assign(handlers,{
  trayInsert:(id,part)=>{
    const w=current(), c=sourceCards.get(id), el=$('body');
    if(!w||w.shelf||!c||!el)return;
    const text=trayText(c,part), at=trayCaret??el.value.length;
    const before=el.value.slice(0,at), after=el.value.slice(at);
    const lead=before&&!before.endsWith('\n')?'\n\n':before&&!before.endsWith('\n\n')?'\n':'';
    const tail=after&&!after.startsWith('\n')?'\n\n':'';
    el.value=before+lead+text+tail+after;
    trayCaret=(before+lead+text).length;
    if(!w.cardIds?.includes(id))w.cardIds=[...(w.cardIds||[]),id];
    el.dispatchEvent(new Event('input',{bubbles:true}));
    keep(w);refreshTray();
    toast('已放進正文'+(part==='quote'&&c.quoteLabel!=='我的原話'?'，來源一併附上':''));
  },
  trayToggle:id=>{
    const w=current();
    if(!w||w.shelf||!sourceCards.has(id))return;
    const before=w.cardIds||[], oldTime=w.updated;
    w.cardIds=before.includes(id)?before.filter(x=>x!==id):[...before,id];
    keep(w);
    if(!storageOK){w.cardIds=before;w.updated=oldTime;return;}
    refreshTray();
  }
});
let trayTimer;
document.addEventListener('input',e=>{
  if(e.target.id==='traySearch'){trayQuery=e.target.value;refreshTray();}
  // Suggestions follow what is being written, once typing pauses.
  else if(e.target.id==='body'||e.target.id==='workTitle'){clearTimeout(trayTimer);trayTimer=setTimeout(refreshTray,700);}
});
for(const type of ['keyup','click','blur','select'])document.addEventListener(type,e=>{
  if(e.target.id==='body')trayCaret=e.target.selectionStart;
},true);
window.addEventListener('hashchange',()=>{trayCaret=null;trayQuery='';});
