'use strict';

const sourceCards = new Map();

const cardReadings = () => state.cardReadings ||= {};
const getReading = id => typeof id==='string' && Object.hasOwn(cardReadings(),id) ? cardReadings()[id] : undefined;
const cardIndexPath = (fid='',anchor='') => 'cards'+(fid||anchor?'/'+(fid||'-'):'')+(anchor?'/'+anchor:'');
const readingPath = (route,id,fid='') => route+'/'+id+(fid?'/'+fid:'');
const activeCardForge = fid => {
  const f=Object.hasOwn(shuttleForges(),fid) && shuttleForges()[fid];
  return f && !f.done ? f : null;
};
const readingTitle = r => r.cardIds.map(id=>sourceCards.get(id)?.title||'來源卡片目前無法取用').join(' ／ ');
const readingsByDate = () => Object.values(cardReadings()).sort((a,b)=>b.updated-a.updated);

function updateReading(r, changes) {
  const entries=cardReadings(), old=entries[r.id];
  entries[r.id]={...r,...changes,updated:Date.now()};
  save();
  if(storageOK) return entries[r.id];
  if(old) entries[r.id]=old;
  else delete entries[r.id];
  return null;
}

function cardSource(card) {
  return more('查看來源與上下文',(card.idea!==card.quote?'<h4>卡片內容</h4><p>'+esc(card.idea)+'</p>':'')+
    '<h4>'+esc(card.type==='訪談重點'?'出處':'原討論')+'</h4><p class="card-original">'+esc(card.context)+'</p>'+
    '<a href="'+esc(card.url)+'" target="_blank" rel="noopener noreferrer">開啟完整來源紀錄</a>');
}
function cardPaper(card,showTitle=true) {
  const label=card.quoteLabel || (card.type==='訪談重點'?'訪談確認摘要':card.author.startsWith('GPT')?'GPT 原句':'我的原話');
  return '<article class="source-paper"><div class="card-meta">'+esc(card.type)+'<span>'+esc(card.author)+'</span></div>'+
    (showTitle?'<h3>'+esc(card.title)+'</h3>':'')+'<blockquote>'+esc(card.quote)+'</blockquote>'+
    '<p class="card-caption">'+esc(label)+' · '+esc(card.source)+' '+esc(card.location)+'</p>'+cardSource(card)+'</article>';
}
function readingList(items,fid='') {
  return items.map(r=>row(readingTitle(r),r.saved ? r.saved.reason||r.saved.question : r.reason||r.question||'並讀草稿',
    'layers','go',[readingPath(r.saved||r.shelf?'reading':'compare',r.id,fid)])).join('');
}
function recentReadings(fid='') {
  const all=readingsByDate();
  if(!all.length) return '';
  const active=all.filter(r=>!r.shelf),saved=active.filter(r=>r.saved),drafts=active.filter(r=>!r.saved);
  const archive=all.filter(r=>r.shelf==='已封存'), deleted=all.filter(r=>r.shelf==='最近刪除');
  return panel('接續卡片整理',(saved.length?readingList(saved.slice(0,3),fid):'')+
    (saved.length>3?more('較早保存的整理',readingList(saved.slice(3),fid)):'')+
    (drafts.length?more('尚在並讀的草稿（'+drafts.length+'）',readingList(drafts,fid)):'')+
    (archive.length?more('已封存（'+archive.length+'）',readingList(archive,fid)):'')+
    (deleted.length?more('最近刪除（'+deleted.length+'）',readingList(deleted,fid)):''));
}

function cardForgeEntry(f) {
  const fid=f?.id||'', m=f&&shuttleMatches()[f.match];
  const [parent,parentName]=f?sfReturning(f):['home','織光堂'];
  return page('打造織光杼',m?'為這次'+TYPES[m.type].action+'選一個起點':'',panel('想從哪裡開始？',
    row('從觀點或洞察開始','選一張卡，看看它能接上哪個想法。','book','go',[cardIndexPath(fid)])+
    row('與 GPT 討論織光杼','帶上想法或來源，先釐清題目','chat','openForgeDiscussion',[fid])+
    row('我已有想探討的題目','先留下題目，經線可以日後再整理。','pen',f?.touched?'freshCardTopic':'cardTopic',[fid]))+
    (f?.touched?panel('接續題目草稿',row(f.title||f.note||'未命名草稿','回到上次的整理','pen','cardTopic',[fid])):'')+
    recentReadings(fid),parent,parentName);
}

function matchingSourceCards(query='',type='') {
  const needle=query.trim().toLocaleLowerCase();
  return [...sourceCards.values()].filter(c=>(!type||c.type===type) &&
    (!needle || [c.title,c.idea,c.quote,c.source,c.type,c.author,c.location].join(' ').toLocaleLowerCase().includes(needle)));
}
function cardListRows(fid,anchor,query='',type='') {
  const cards=matchingSourceCards(query,type).filter(c=>c.id!==anchor);
  return cards.map(c=>{
    const linked=cardShuttleLinks(c.id).length;
    return row(c.title,c.type+' · '+(c.author.startsWith('GPT')?c.author+' · ':'')+c.source+' '+c.location+
      (linked?' · 已連結 '+linked+' 把織光杼':''),'book',
    anchor?'pairCards':'go',anchor?[anchor,c.id,fid]:[readingPath('card',c.id,fid)]);}).join('')||
    '<p>找不到符合的卡片。可以換一個詞或選擇全部類型。</p>';
}
function materialReadingEntry(fid) {
  const cards=[...sourceCards.values()];
  const reading=cards.find(c=>/magic shop/i.test(c.source)&&/不得不做|照護自己/.test(c.idea+' '+c.quote));
  const interview=cards.find(c=>c.type==='訪談重點'&&/全零回歸/.test(c.source+' '+c.location+' '+c.title));
  if(reading&&interview)return panel('從實際材料試讀',
    row('「不得不做」與「先照護自己」',reading.source+' 與 '+interview.title,'layers','pairCards',[reading.id,interview.id,fid]));
  const first=cards.find(c=>c.type==='觀點'||c.type==='洞察')||cards[0];
  return panel('從實際材料試讀',first?row(first.title,first.source+' '+first.location,'book','go',[readingPath('card',first.id,fid)]):'<p>目前沒有可取用的卡片。</p>');
}
function cardIndexPage(fid,anchorId) {
  const anchor=sourceCards.get(anchorId);
  if(anchorId&&!anchor) return missing();
  const parent=anchor?readingPath('card',anchor.id,fid):fid?'forge/'+fid:'home';
  return page(anchor?'選另一張卡':'觀點與洞察',anchor?'和「'+anchor.title+'」一起讀':'',
    (anchor?'':'<div class="rel-index-action">'+btn('替織光杼找相關卡片','chooseRelatedShuttle',[fid],'light')+'</div>'+
      recentReadings(fid)+materialReadingEntry(fid))+
    panel(anchor?'可以接哪一張？':'從一張卡開始','<div class="card-filters">'+
      field('找卡片或來源','cardQuery','',false,'type="search" placeholder="輸入原話、書名或想法"')+
      shuttleSelect('cardKind','類型',[['','全部'],...['觀點','洞察','訪談重點','待追問'].map(t=>[t,t])],'')+
      '</div><div id="sourceCardList">'+cardListRows(fid,anchorId)+'</div>'),parent,anchor?'回到第一張卡':fid?'打造織光杼':'織光堂');
}
function cardDetail(id,fid) {
  const card=sourceCards.get(id);
  if(!card) return missing();
  const records=readingsByDate().filter(r=>r.saved&&!r.shelf&&r.cardIds.includes(id));
  const f=activeCardForge(fid),currentTarget=findS(f?.target);
  const links=cardShuttleLinks(id);
  const forgeAction=currentTarget?btn('帶入這次經線整理','stageSingleCard',[id,fid,currentTarget.id],'link'):
    btn(f?.touched?'帶入這次立杼草稿':'從這張卡立新杼','stageSingleCard',[id,fid,''],'link');
  const works=worksUsingCard(id);
  return page(card.title,card.source+' '+card.location,panel('這張卡的來處',cardPaper(card,false)+
    '<div class="actions card-source-actions">'+btn('連到已有的織光杼','linkCard',[id,currentTarget?.id||'',fid],'primary')+
    btn('和另一張卡並讀','go',[cardIndexPath(fid,id)])+forgeAction+'</div>')+
    panel('已連結的織光杼',links.map(({shuttle,uses})=>{
      const direct=uses.find(u=>u.cardId===id), readings=uses.filter(u=>u.readingId);
      const details=uses.map(u=>u.readingId?'經由並讀 · '+(cardUseText(u)||readingTitle(getReading(u.readingId))):
        (u.note||cardLinkBasis(u)||'直接連結')).join(' ／ ');
      const pairActions=readings.length>1?more('查看 '+readings.length+' 段並讀整理',readings.map(u=>
        row(readingTitle(getReading(u.readingId)),cardUseText(u),'book','go',[readingPath('reading',u.readingId,fid)])).join('')):
        readings.map(u=>btn('查看並讀整理','go',[readingPath('reading',u.readingId,fid)],'link')).join('');
      return '<div class="linked-shuttle">'+row(shuttle.title,details,'layers','go',['shuttle/'+shuttle.id])+
        (direct?btn('編輯連結','linkCard',[id,shuttle.id,fid],'link'):'')+
        pairActions+'</div>';
    }).join('')||'<p>這張卡還沒有連到織光杼。</p>')+
    panel('從這張卡走出去',records.length?readingList(records,fid):'<p>第一次和另一張卡並讀後，保存的連結會出現在這裡。</p>')+
    (works?panel('採用這張卡的作品',works):''),cardIndexPath(fid),'觀點與洞察');
}

function startCardPair(a,b,fid='') {
  if(a===b||!sourceCards.has(a)||!sourceCards.has(b)) return;
  const found=readingsByDate().find(r=>!r.shelf&&r.cardIds.includes(a)&&r.cardIds.includes(b));
  const r=found||updateReading({id:uid(),cardIds:[a,b],reason:'',question:'',saved:null},{});
  if(r) go(readingPath(r.saved?'reading':'compare',r.id,fid));
}
function pairPage(r,fid,editing) {
  if(!r) return missing();
  if(r.shelf)return page(r.shelf,'卡片整理',panel(readingTitle(r),
    '<p class="reading-reason">'+esc(r.saved?.reason||r.reason||'')+'</p><p>'+esc(r.saved?.question||r.question||'')+'</p>'+
    '<div class="actions">'+btn('還原整理','moveReading',[r.id,'',fid],'primary')+
    (r.shelf==='已封存'?btn('刪除整理','askDeleteReading',[r.id,fid]):'')+'</div>'),cardIndexPath(fid),'觀點與洞察');
  if(!editing&&!r.saved) return pairPage(r,fid,true);
  const cards=r.cardIds.map(id=>sourceCards.get(id));
  if(cards.some(c=>!c))return page('卡片並讀','來源卡片目前無法取用。',tip(r.saved?.reason||r.reason||r.question||''),'cards','觀點與洞察');
  const sameSource=cards[0].sourceKey===cards[1].sourceKey;
  const label=sameSource?(cards[0].source==='《Magic Shop》'?'兩張卡來自同一則發言':'兩張卡出自同一份訪談'):'';
  const pair='<div class="reading-pair">'+cards.map(c=>cardPaper(c)).join('')+'</div>';
  if(editing) {
    const tools=btn(r.round?.candidate?'核對 GPT 的建議':r.round?'繼續與 GPT 並讀':'請 GPT 協助並讀','pairGPT',[r.id],'light');
    return page('並讀兩張卡',label,pair+panel('你看見什麼關係？',
      '<p class="pair-instruction">留下連結理由或一個待釐清的問題，就能保存。</p>'+
      field('為什麼把這兩張卡放在一起？','pairReason',r.reason,true,'data-pair-field="reason"')+
      field('還想釐清什麼？','pairQuestion',r.question,true,'data-pair-field="question"')+
      '<div class="actions">'+btn('保存這段整理','saveReading',[r.id,fid],'primary')+tools+'</div>')+readingManage(r,fid),
      r.saved?readingPath('reading',r.id,fid):cardIndexPath(fid),r.saved?'已保存的整理':'觀點與洞察');
  }
  const f=activeCardForge(fid), target=f&&findS(f.target);
  const action=target?'接回「'+target.title+'」':'從這段整理立杼';
  const matching=f&&shuttleMatches()[f.match];
  const associations=state.shuttles.filter(s=>s.cardUses?.some(x=>x.readingId===r.id));
  const connected=associations.map(s=>row(s.title,s.cardUses.find(u=>u.readingId===r.id).note||'從這一杼查看起點卡',
    'layers','go',['shuttle/'+s.id])).join('');
  const sources=cards.map(c=>row(c.title,c.source+' '+c.location,'book','go',[readingPath('card',c.id,fid)])).join('');
  return page('已保存的整理',label,panel('這兩張為什麼放在一起',
    (r.saved.reason?'<p class="reading-reason">'+esc(r.saved.reason)+'</p>':'')+
    (r.saved.question?'<p class="reading-open"><b>待釐清</b> '+esc(r.saved.question)+'</p>':'')+
    (r.saved.evidence?.length?more('當時核對的兩段引文',r.saved.evidence.map(e=>
      '<div class="reading-evidence"><b>'+esc(sourceCards.get(e.cardId)?.title)+'</b><blockquote>'+esc(e.quote)+'</blockquote></div>').join('')):'')+
    btn('修改這段整理','go',[readingPath('compare',r.id,fid)],'tiny'))+
    panel('連到的兩張卡',sources)+panel('用這段整理探討題目',connected+
      '<div class="actions">'+btn(action,'useReading',[r.id,fid,target?.id||''],'primary')+
      (!target&&state.shuttles.length?btn('接到已有的杼','selectReadingShuttle',[r.id,fid]):'')+'</div>')+
    (matching?btn('回到這次的'+TYPES[matching.type].name+'創作','go',['match/'+matching.id],'link'):'')+readingManage(r,fid),
    cardIndexPath(fid),'觀點與洞察');
}
function readingManage(r,fid) {
  return more('管理這段整理','<div class="actions">'+btn('封存整理','moveReading',[r.id,'已封存',fid])+
    btn('刪除整理','askDeleteReading',[r.id,fid])+'</div>');
}

function renderCardRoute(name,params) {
  if(name==='related')return relatedReviewPage(params[0],params[1],params[2]);
  if(name==='cards')return cardIndexPage(params[0]==='-'?'':params[0]||'',params[1]||'');
  if(name==='card')return cardDetail(params[0],params[1]||'');
  if(name==='reading'||name==='compare')return pairPage(getReading(params[0]),params[1]||'',name==='compare');
  return null;
}
function filterCardList() {
  const host=$('sourceCardList');
  if(route==='cards'&&host)host.innerHTML=cardListRows(args[0]==='-'?'':args[0]||'',args[1]||'',val('cardQuery'),val('cardKind'));
}
document.addEventListener('input',e=>{
  if(e.target.id==='cardQuery')filterCardList();
  const prop=e.target.dataset.pairField;
  if(route==='compare'&&['reason','question'].includes(prop)) {
    const r=getReading(args[0]);
    if(r)updateReading(r,{[prop]:e.target.value});
  }
});
document.addEventListener('change',e=>{if(e.target.id==='cardKind')filterCardList();});
Object.assign(handlers,{
  cardTopic:fid=>{
    const f=activeCardForge(fid)||getMatchesForge('');
    f.cardMode='topic';save();go('forge/'+f.id);
  },
  freshCardTopic:fid=>{
    const old=activeCardForge(fid);
    const f=getMatchesForge(old?.match||'','',{cardMode:'topic'});go('forge/'+f.id);
  },
  askDeleteReading:(id,fid)=>{const r=getReading(id);if(r)modal('刪除這段整理？',
    '<p>將「'+esc(readingTitle(r))+'」移至最近刪除。你可以從卡片整理中還原。</p>'+
    btn('取消','close')+' '+btn('確認刪除','moveReading',[id,'最近刪除',fid],'primary'));},
  moveReading:(id,shelf,fid)=>{
    const r=getReading(id);
    if(!r||!['','已封存','最近刪除'].includes(shelf))return;
    if(updateReading(r,{shelf})){
      go(shelf?cardIndexPath(fid):readingPath(r.saved?'reading':'compare',id,fid));
      toast(shelf||'已還原整理');
    }
  },
  pairCards:startCardPair,
  saveReading:(id,fid)=>{
    const r=getReading(id);
    if(!r)return;
    const reason=val('pairReason'),question=val('pairQuestion');
    if(!reason&&!question){toast('請留下一句連結理由，或記下哪裡還想不通');$('pairReason')?.focus();return;}
    if(updateReading(r,{reason,question,saved:{reason,question,time:Date.now(),evidence:r.reviewedEvidence||[]}})){
      go(readingPath('reading',id,fid));toast('已保存這段整理');
    }
  }
});
