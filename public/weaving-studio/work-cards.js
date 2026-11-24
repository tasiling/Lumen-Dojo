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
    (c.basis?'<blockquote class="tray-basis"><small>回應的原文</small>'+esc(c.basis)+'</blockquote>':'')+
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
/* 起稿：把這一杼和它的卡片整理成一份給 GPT 的指令，不必自己動手貼。GPT 只能用本人說過的內容。 */
const DRAFT_MODES={
  ask:{name:'先問我，再用我的回答排出骨架',task:[
    '一次只問我一題，等我回答後才問下一題。每一題都要引用一張卡片的內容並標明編號，例如 K2。',
    '提問時的引用格式：K編號｜卡片內容｜出處｜由來，四項都要有。',
    '問題的目的是讓我把這件作品要說的話說出來：我想對誰說、最想讓對方帶走哪一句、哪一張卡是主幹、卡片之間怎麼接。',
    '我說「可以收尾」時，才依下方的回傳格式輸出。']},
  skeleton:{name:'直接排出骨架，標出我要補寫的地方',task:[
    '不用先問我，直接依下方的回傳格式排出骨架。',
    '卡片不足以支撐的段落，寫在「待我補寫」，不要替我補上內容。']}
};
function draftCardIds(w) {
  return [...new Set([...(w.cardIds||[]),...shuttleCardIds(findS(w.shuttle))])].filter(id=>sourceCards.has(id));
}
function draftPrompt(w,mode) {
  const sh=findS(w.shuttle), ids=draftCardIds(w), L=[];
  L.push('【織光堂起稿包｜織光起稿/v1】');
  L.push('作品：'+(w.title||'尚未命名')+'｜形式：'+(w.mode||TYPES[w.type].name));
  L.push('');
  L.push('【織光杼】'+(sh?.title||'尚未匹配'));
  const core=sh?coreHistory(sh).at(-1):null;
  L.push('目前的核心理解：'+(sh?.core||'（尚未寫下）'));
  if(core)L.push('核心理解的由來：第 '+core.n+' 版，'+(core.from||'未註明')+(core.time?'，'+new Date(core.time).toLocaleDateString('zh-TW'):''));
  if(w.understanding?.text)L.push('這件作品選用的方向理解：'+w.understanding.text);
  L.push('');
  L.push('【我的卡片】以下是這件作品可以使用的全部材料。');
  if(!ids.length)L.push('（這一杼還沒有連結卡片。請只根據我接下來的回答整理。）');
  ids.forEach((id,i)=>{
    const c=sourceCards.get(id), own=!/GPT/.test(c.author||'');
    L.push('');
    L.push('K'+(i+1)+'｜'+c.type+(own?'':'｜GPT 延伸，我尚未確認')+'｜'+(c.idea||c.title));
    const mine=c.quoteLabel==='我的原話', where=[c.source,c.location].filter(Boolean).join(' · ');
    if(mine&&c.quote&&c.quote!==c.idea)L.push('我的原話：'+c.quote);
    L.push('出處：'+(where||'未記載')+(c.author?'（'+c.author+'）':''));
    // 由來 is wherever the card can be traced back to: the passage that prompted it when there is one, otherwise the source itself.
    if(c.basis)L.push('由來：我回應這段原文時說的——'+c.basis);
    else if(!own&&c.quote)L.push('由來：這是 GPT 在討論中說的，不是我的話——「'+c.quote+'」'+(where?'（'+where+'）':''));
    else if(!mine&&c.quote&&c.quote!==c.idea)L.push('由來：我讀到這段'+(c.quoteLabel||'原文')+'時留下的——「'+c.quote+'」'+(where?'（'+where+'）':''));
    else if(where)L.push('由來：'+where);
    const use=(sh?.cardUses||[]).find(u=>cardsInUse(u).includes(id)), why=use?cardUseText(use):'';
    if(why)L.push('接到這一杼的理由：'+why);
    if(c.url&&/^https?:/.test(c.url))L.push('原始資料：'+c.url);
  });
  L.push('');
  L.push('【正文目前的內容】');
  L.push(w.body.trim()||'（尚未動筆）');
  L.push('');
  L.push('【你的任務：'+DRAFT_MODES[mode].name+'】');
  DRAFT_MODES[mode].task.forEach(t=>L.push('- '+t));
  L.push('');
  L.push('【規則】');
  ['只能使用卡片和我的回答裡出現過的內容，不替我增加新的觀點、例子或結論。',
   '引用我的話必須逐字，並標明來自哪一張卡或哪一次回答，不要替我換句話說。',
   '每一次提到卡片，都要連同它的出處與由來一起寫出來，照卡片上的記載抄寫，不得省略、合併或改寫。只寫「K1｜你的原話」是不夠的。',
   '談到這一杼的核心理解時，也要寫出它的由來。書名與位置本身就是由來；只有出處與由來兩行都沒有內容的卡片，才寫「由來未記載」，不要自行推測。',
   '你自己的建議要另外列在「GPT 建議」，並標示「尚未由本人確認」。',
   '標示為「GPT 延伸」的卡片不是我的話，使用前要先問我是否同意。',
   '不要替我寫成完整的文章，文字由我自己寫；你只負責排出骨架。'].forEach(r=>L.push('- '+r));
  L.push('');
  L.push('【回傳格式】整段放在一個程式碼區塊裡，標記行照抄。');
  L.push('===織光起稿/v1===');
  L.push('===骨架===');
  L.push('第一段｜這一段要說什麼｜使用 K1');
  L.push('我的話：（逐字，來自卡片或我的回答）');
  L.push('出處與由來：（照卡片上的記載；來自我這次回答的，寫「本次討論的回答」）');
  L.push('===待我補寫===');
  L.push('- （骨架裡還缺、需要我自己寫的部分）');
  L.push('===GPT 建議===');
  L.push('- （你的建議，尚未由本人確認）');
  L.push('===結束===');
  return L.join('\n');
}
function draftDialog(w,mode='ask') {
  const ids=draftCardIds(w);
  modal('帶這一杼去和 GPT 起稿',
    '<p>'+(ids.length?'已自動帶入這一杼和這件作品的 '+ids.length+' 張卡片。':'這一杼還沒有連結卡片，指令裡只會有題目與目前的正文。')+'</p>'+
    pick('要 GPT 怎麼協助','draftMode',Object.keys(DRAFT_MODES).map(k=>DRAFT_MODES[k].name),DRAFT_MODES[mode].name)+
    '<div class="actions">'+btn('複製給 GPT 的指令','draftCopy',[],'primary')+'</div>'+
    more('查看指令全文','<textarea id="draftPrompt" readonly rows="10">'+esc(draftPrompt(w,mode))+'</textarea>')+
    field('貼回 GPT 的整理結果','draftReturn','',true)+
    '<div class="actions">'+btn('存到候選，和正文比較','draftKeep',[],'light')+'</div>'+
    '<p class="statusline">貼回的內容會先放在候選，不會直接改動正文。</p>');
}
function workCardTray(w) {
  const n=(w.cardIds||[]).filter(id=>sourceCards.has(id)).length;
  return '<div class="actions tray-draft">'+btn('帶這一杼去和 GPT 起稿','draftOpen',[],'primary')+'</div><details class="work-card-tray" id="workCardTray" open><summary>可以帶入的卡片'+(n?'<span>已選用 '+n+' 張</span>':'')+'</summary>'+
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
  draftOpen:()=>{const w=current();if(w&&!w.shelf)draftDialog(w);},
  draftCopy:async()=>{
    const el=$('draftPrompt');
    if(!el)return;
    if(await copyText(el.value))toast('已複製，貼到 GPT 後把它的整理結果帶回來');
    else{el.closest('details').open=true;el.focus();el.select();toast('請長按複製選取的指令');}
  },
  draftKeep:()=>{
    const w=current(), text=val('draftReturn');
    if(!w||w.shelf)return;
    if(!text){toast('先貼入 GPT 的整理結果');return;}
    w.candidate=text;keep(w);
    modal('GPT 的整理結果',(w.body.trim()?'<h3>目前正文</h3><pre>'+esc(w.body)+'</pre>':'')+'<h3>GPT 排出的骨架</h3><pre>'+esc(text)+'</pre>'+
      '<div class="actions">'+btn(w.body.trim()?'接在正文後面':'放進正文','draftAppend',[],'primary')+
      (w.body.trim()?btn('取代目前正文','adoptCandidate'):'')+btn('先留在候選','close')+'</div>');
  },
  draftAppend:()=>{
    const w=current();
    if(!w||w.shelf||!w.candidate?.trim())return;
    // Format markers become plain section labels, so the body reads as a working outline.
    const outline=w.candidate.split('\n').filter(l=>!/^\s*```/.test(l)).map(l=>{
      const m=l.match(/^\s*=+\s*(.+?)\s*=+\s*$/);
      return !m?l:/^織光起稿|^結束$/.test(m[1])?null:'【'+m[1]+'】';
    }).filter(l=>l!==null).join('\n').trim();
    w.body=[w.body.trimEnd(),outline].filter(Boolean).join('\n\n');w.review=false;keep(w);
    closeRefresh('已放進正文，可以開始改寫');
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
document.addEventListener('change',e=>{
  if(e.target.id!=='draftMode')return;
  const w=current(), mode=Object.keys(DRAFT_MODES).find(k=>DRAFT_MODES[k].name===e.target.value);
  if(w&&mode&&$('draftPrompt'))$('draftPrompt').value=draftPrompt(w,mode);
});
for(const type of ['keyup','click','blur','select'])document.addEventListener(type,e=>{
  if(e.target.id==='body')trayCaret=e.target.selectionStart;
},true);
window.addEventListener('hashchange',()=>{trayCaret=null;trayQuery='';});
