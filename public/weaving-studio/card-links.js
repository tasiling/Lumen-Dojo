'use strict';

function cardShuttleLinks(cardId) {
  return state.shuttles.map(shuttle=>({
    shuttle, uses:(shuttle.cardUses||[]).filter(use=>cardsInUse(use).includes(cardId))
  })).filter(link=>link.uses.length);
}
function cardLinkBasis(use) {
  const basis=use?.basis;
  if(!basis)return '';
  return (basis.method==='GPT 建議'?'GPT 建議':'比對線索')+' · '+basis.detail;
}

// Save against the server revision, including pending local choices.
async function saveShuttleLinks(sid,change){
  try{
    await flush();
    if (!hasUnsaved()) {
      const fresh=await request(api);
      if(!hasUnsaved()){baseRecords=fresh.records;restoreRecords(baseRecords);}
    }
    const shuttle=findS(sid);
    if(!shuttle){toast('找不到這把織光杼，請重新選擇。');return false;}
    const next=change(shuttle.cardUses||[],shuttle,state);
    if(!next)return false;
    shuttle.cardUses=next;save();await flush();return true;
  }catch(e){showSaveError(e);return false;}
}

let cardLinkEditor=null;
function cardLinkFields(cardId,sid) {
  const shuttle=findS(sid);
  if(!shuttle){cardLinkEditor=null;return '';}
  const direct=shuttle.cardUses?.find(u=>u.cardId===cardId);
  const viaPair=shuttle.cardUses?.some(u=>u.readingId&&cardsInUse(u).includes(cardId));
  cardLinkEditor={cardId,sid,original:direct?(direct.note||''):null};
  return (viaPair?'<p>這張卡也透過已保存的並讀整理連到這把杼。</p>':'')+
    (direct?.basis?more('連結當時的比對線索','<p>'+esc(direct.basis.method+' · '+direct.basis.detail)+'</p>'+
      (direct.basis.quote?'<blockquote>'+esc(direct.basis.quote)+'</blockquote>':'')):'')+
    field('這張卡和這把杼有什麼關係？（選填）','cardLinkNote',direct?.note||'',true,
      'placeholder="可以留下一個理由，或記下還想追問什麼。"')+
    '<div class="actions">'+btn(direct?'保存連結說明':'保存連結','saveCardLink',[cardId,sid],'primary')+
    (direct?btn('解除這個連結','askUnlinkCard',[sid,'card',cardId],'link'):'')+'</div>'+
    (direct?more('用這張卡整理經線',btn('帶入經線整理稿','reviseCardUse',[sid,'',cardId],'light')):'');
}

function openCardLink(cardId,sid='',fid='') {
  const card=sourceCards.get(cardId);
  if(!card)return;
  const title='<p class="link-subject">'+esc(card.title)+'</p>';
  if(!state.shuttles.length){
    modal('連到已有的織光杼',title+'<p>目前還沒有織光杼。可以從這張卡留下想繼續探討的題目。</p>'+
      btn('從這張卡立新杼','stageSingleCard',[cardId,fid,''],'primary'));return;
  }
  const fixed=findS(sid);
  const target=fixed?.id||(state.shuttles.length===1?state.shuttles[0].id:'');
  const choices=[['','選擇織光杼'],...state.shuttles.map(s=>{
    const uses=s.cardUses||[];
    const status=uses.some(u=>u.cardId===cardId)?' · 已直接連結':
      uses.some(u=>u.readingId&&cardsInUse(u).includes(cardId))?' · 已透過並讀連結':'';
    return [s.id,s.title+status];
  })];
  const where=fixed?'<p>織光杼 · '+esc(fixed.title)+'</p>':
    shuttleSelect('cardLinkTarget','要連到哪一把織光杼？',choices,target,'data-card="'+esc(cardId)+'"');
  const existing=fixed?.cardUses?.some(u=>u.cardId===cardId);
  modal(existing?'編輯卡片連結':'連到已有的織光杼',title+where+
    '<div id="cardLinkFields">'+cardLinkFields(cardId,target)+'</div>');
}

function pickShuttleCards(sid) {
  const s=findS(sid);
  if(!s)return;
  const uses=s.cardUses||[];
  const options=[...sourceCards.values()].map(c=>{
    const direct=uses.find(u=>u.cardId===c.id), pair=uses.some(u=>u.readingId&&cardsInUse(u).includes(c.id));
    const status=direct?'已直接連結':pair?'已透過並讀連結，可另存這張卡的用法':'';
    const noteId='link-note-'+c.id;
    return '<div class="link-choice" data-link-option="'+esc(c.id)+'"><label class="link-choice-label">'+
      '<input type="checkbox" name="linkCard" value="'+esc(c.id)+'"'+(direct?' checked disabled':'')+'>'+
      '<span><b>'+esc(c.title)+'</b><small>'+esc(c.type+' · '+c.source+' '+c.location+' · '+c.author)+'</small>'+
      (status?'<small class="link-status">'+esc(status)+'</small>':'')+'</span></label>'+
      (direct?'':'<div class="link-choice-detail"><blockquote>'+esc(c.quote)+'</blockquote>'+
        '<label>與本杼的關係（選填）<input id="'+esc(noteId)+'"></label></div>')+'</div>';
  }).join('');
  const kinds=[['','全部'],...['觀點','洞察','手法觀察','訪談重點','野採採集','待追問'].map(type=>[type,type])];
  modal('連結既有卡片','<p class="link-subject">'+esc(s.title)+'</p><div class="card-link-picker">'+
    '<div class="card-filters">'+field('搜尋卡片或來源','linkQuery','',false,'type="search" placeholder="原話、書名或想法"')+
    shuttleSelect('linkKind','類型',kinds,'')+'</div>'+
    '<div class="link-options" role="group" aria-label="選擇要連結的卡片">'+options+
    '<p id="noLinkResults" hidden>沒有符合的卡片。可以換一個詞或選擇全部類型。</p></div>'+
    '<div class="link-picker-foot"><span id="linkCount" role="status">已選 0 張</span>'+
    '<button type="button" class="primary" id="saveLinkSelection" disabled'+act('saveShuttleCards',sid)+'>連結選取的卡片</button></div></div>');
}

function filterLinkOptions() {
  const matches=new Set(matchingSourceCards(val('linkQuery'),val('linkKind')).map(c=>c.id));
  for(const option of $('dialog').querySelectorAll('[data-link-option]'))option.hidden=!matches.has(option.dataset.linkOption);
  $('noLinkResults').hidden=matches.size>0;
}

function checkedLinkCards() {
  return [...$('dialog').querySelectorAll('input[name="linkCard"]:checked')].filter(el=>!el.disabled&&sourceCards.has(el.value));
}

document.addEventListener('input',e=>{if(e.target.id==='linkQuery')filterLinkOptions();});
document.addEventListener('change',e=>{
  const el=e.target;
  if(el.id==='linkKind')filterLinkOptions();
  if(el.id==='cardLinkTarget')$('cardLinkFields').innerHTML=cardLinkFields(el.dataset.card,el.value);
  if(el.name==='linkCard'){
    const count=checkedLinkCards().length;
    $('linkCount').textContent='已選 '+count+' 張';
    $('saveLinkSelection').disabled=!count;
  }
});

Object.assign(handlers,{
  linkCard:openCardLink,pickShuttleCards,
  saveCardLink:async(cardId,sid)=>{
    const edit=cardLinkEditor,card=sourceCards.get(cardId),s=findS(sid);
    if(!card||!s||edit?.cardId!==cardId||edit.sid!==sid)return;
    const note=val('cardLinkNote');
    if(await saveShuttleLinks(sid,uses=>{
      const direct=uses.find(u=>u.cardId===cardId);
      const current=direct?(direct.note||''):null;
      if(current!==edit.original&&current!==note){toast('這個連結已有變更，請重新開啟核對。');return null;}
      return direct?uses.map(u=>u===direct?{...direct,note}:u):[...uses,{cardId,entryId:cardId,note}];
    }))closeRefresh(edit.original===null?'已連到「'+s.title+'」':'已保存連結說明');
  },
  saveShuttleCards:async sid=>{
    const selected=checkedLinkCards().map(el=>({cardId:el.value,entryId:el.value,note:val('link-note-'+el.value)}));
    if(!selected.length)return;
    let added=0;
    if(await saveShuttleLinks(sid,uses=>{
      const fresh=selected.filter(card=>!uses.some(u=>u.cardId===card.cardId));
      added=fresh.length;return [...uses,...fresh];
    }))closeRefresh(added?'已連結 '+added+' 張卡片':'所選卡片都已連結');
  },
  askUnlinkCard:(sid,kind,id)=>{
    const s=findS(sid),r=kind==='reading'?getReading(id):null,card=kind==='card'?sourceCards.get(id):null;
    if(!s||(!r&&!card))return;
    const title=r?readingTitle(r):card.title;
    const note=r?'兩張原卡和並讀紀錄都會保留。':'原卡、經線版本與作品中已採用的內容都會保留。';
    modal('解除連結？','<p>解除「'+esc(title)+'」與「'+esc(s.title)+'」的'+(r?'並讀':'直接')+'連結。</p><p>'+note+'</p>'+
      '<div class="actions">'+btn('取消','close')+btn('確認解除連結','unlinkShuttleCard',[sid,kind,id],'light')+'</div>');
  },
  unlinkShuttleCard:async(sid,kind,id)=>{
    if(!['reading','card'].includes(kind))return;
    const key=kind==='reading'?'readingId':'cardId';
    if(await saveShuttleLinks(sid,uses=>uses.filter(u=>u[key]!==id)))closeRefresh('已解除這個連結');
  }
});
