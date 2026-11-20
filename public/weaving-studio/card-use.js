'use strict';

function cardsInUse(use) {
  if(use.readingId)return getReading(use.readingId)?.cardIds||[];
  return sourceCards.has(use.cardId)?[use.cardId]:[];
}
const sameCardUse=(a,b)=>a.readingId&&a.readingId===b.readingId || a.cardId&&a.cardId===b.cardId;
function cardUseText(use) {
  const reading=use.readingId&&getReading(use.readingId);
  return use.note||reading?.saved?.reason||reading?.saved?.question||'';
}
function selectUseTarget(kind,id,fid) {
  const f=activeCardForge(fid);
  const choices=state.shuttles.map(s=>[s.id,s.title]);
  if(!choices.length){stageCardUse(kind,id,fid,'');return;}
  modal('選擇織光杼',shuttleSelect('readingShuttle','已有的長期題目',choices,f?.target||choices[0][0])+
    '<div class="actions">'+btn('接到選定的杼','confirmReadingShuttle',[kind,id,fid],'primary')+
    (kind==='card'?btn('從這張卡立杼','stageSingleCard',[id,fid,'']):'')+'</div>');
}
function stageCardUse(kind,id,fid,sid) {
  const r=kind==='reading'&&getReading(id);
  if(kind==='reading'&&(!r?.saved||r.shelf))return;
  if(kind==='card'&&!sourceCards.has(id)||sid&&!findS(sid))return;
  const original=activeCardForge(fid);
  const ref=kind==='reading'?{readingId:id}:{cardId:id};
  const match=original?.match||'';
  const staged=Object.values(shuttleForges()).find(f=>!f.done&&f.target===sid&&f.match===match&&f.cardDrafts?.some(p=>sameCardUse(p,ref)));
  const f=original&&original.target===sid?original:staged||getMatchesForge(match,sid,sid?undefined:{cardMode:'topic'});
  const before=structuredClone(f);
  f.cardDrafts||=[];
  if(!f.cardDrafts.some(p=>sameCardUse(p,ref))) {
    const prior=findS(sid)?.cardUses?.find(p=>sameCardUse(p,ref));
    f.cardDrafts.push(prior?{...prior,supportsCore:false}:{...ref,entryId:r?r.cardIds[0]:id,note:'',supportsCore:false});
  }
  if(sid&&f.baseCore===undefined)f.baseCore=findS(sid).core;
  if(f.scope==='只帶我的想法')f.scope='帶上這次的卡片整理';
  f.cardMode='topic';f.touched=true;save();
  if(!storageOK){shuttleForges()[f.id]=before;return;}
  go('forge/'+f.id);
}

function draftUsesPanel(f) {
  const refs=f.cardDrafts||[];
  const browse=btn('去挑卡或接續整理','go',[cardIndexPath(f.id)],'tiny');
  if(!refs.length)return '<div class="actions">'+browse+'</div>';
  const entries=refs.map((use,i)=>{
    const cards=cardsInUse(use).map(id=>sourceCards.get(id));
    if(!cards.length)return '';
    const r=use.readingId&&getReading(use.readingId);
    const attrs='data-use-index="'+i+'"';
    const read=use.readingId?readingPath('reading',use.readingId,f.id):readingPath('card',use.cardId,f.id);
    return '<div class="use-draft"><h4>'+esc(cards.map(c=>c.title).join(' ／ '))+'</h4>'+
      (r?.saved?.reason?'<p>'+esc(r.saved.reason)+'</p>':'')+(r?.saved?.question?tip('待釐清 · '+r.saved.question):'')+
      (cards.length>1?shuttleSelect('useEntry'+i,'這把杼從哪張開始讀？',cards.map(c=>[c.id,c.title]),use.entryId,attrs+' data-use-field="entryId"'):'')+
      field('在這把杼裡，我想用它來談什麼？（選填）','useWhy'+i,use.note,false,attrs+' data-use-field="note"')+
      '<label class="checkline"><input type="checkbox" '+attrs+' data-use-field="supportsCore" '+(use.supportsCore?'checked':'')+'>採用為這次經線的依據</label>'+
      '<div class="actions">'+btn('查看原本整理','go',[read],'link')+btn('移出這次整理','dropCardUse',[f.id,i],'link')+'</div></div>';
  }).join('');
  return '<section class="use-drafts"><h3>這次帶進杼的卡片</h3>'+entries+browse+'</section>';
}

function commitCardUses(f,s,previousCore) {
  const evidence=[];
  for(const draft of f.cardDrafts||[]) {
    const ids=cardsInUse(draft);
    if(!ids.includes(draft.entryId))continue;
    const {supportsCore,...use}=draft;
    s.cardUses||=[];
    const i=s.cardUses.findIndex(v=>sameCardUse(v,use));
    if(i<0)s.cardUses.push({...use});
    else s.cardUses[i]={...use};
    if(supportsCore){
      const reading=getReading(use.readingId)?.saved;
      evidence.push({...use,cardIds:[...ids],reason:cardUseText(use),
        readingReason:reading?.reason||'',openQuestion:reading?.question||'',quotes:structuredClone(reading?.evidence||[])});
    }
  }
  if(!evidence.length||!s.core)return;
  const versions=coreHistory(s);
  const latest=versions.at(-1);
  if(!latest)return;
  if(previousCore!==s.core){latest.cardEvidence=evidence;return;}
  // A changed basis for an unchanged sentence is still a new version.
  const prior=latest.cardEvidence||[];
  const combined=prior.filter(p=>!evidence.some(e=>sameCardUse(p,e))).concat(evidence);
  if(evidence.every(e=>prior.some(p=>sameCardUse(e,p)&&JSON.stringify(e)===JSON.stringify(p))))return;
  s.coreVersions=[...versions,{n:versions.length+1,text:s.core,from:'本人補上卡片依據',time:Date.now(),cardEvidence:combined}];
}
function coreEvidenceHtml(v) {
  if(!v.cardEvidence?.length)return '';
  return '<div class="version-evidence"><b>此版採用的卡片</b>'+v.cardEvidence.map(use=>{
    const titles=use.cardIds.map(id=>sourceCards.get(id)?.title||'').filter(Boolean).join(' ／ ');
    const route=use.readingId?readingPath('reading',use.readingId):readingPath('card',use.cardId);
    const detail=[
      use.readingReason&&'<p><b>當時的連結理由</b> '+esc(use.readingReason)+'</p>',
      use.openQuestion&&'<p><b>當時待釐清</b> '+esc(use.openQuestion)+'</p>',
      ...(use.quotes||[]).map(q=>'<blockquote>'+esc(q.quote)+'</blockquote>')
    ].filter(Boolean).join('');
    return row(titles,use.reason||use.openQuestion||'查看原卡','book','go',[route])+(detail?more('經線採用時的整理',detail):'');
  }).join('')+'</div>';
}
function shuttleCardsPanel(s) {
  const uses=s.cardUses||[];
  const rows=shuttleCardIds(s).map(id=>{
    const card=sourceCards.get(id), links=uses.filter(u=>cardsInUse(u).includes(id));
    const direct=links.find(u=>u.cardId===id);
    const pairs=links.filter(u=>u.readingId);
    const parts=[card.type+' · '+card.source, direct?.note||cardLinkBasis(direct),
      ...pairs.map(u=>cardUseText(u)?'經由並讀 · '+cardUseText(u):'經由並讀整理')];
    return '<div class="shuttle-card-use">'+row(card.title,parts.filter(Boolean).join(' ／ '),'book','go',[readingPath('card',id)])+
      (direct?btn('編輯連結','linkCard',[id,s.id,''],'link'):'')+'</div>';
  }).join('');
  const pairs=uses.filter(u=>u.readingId&&getReading(u.readingId)).map(u=>{
    const r=getReading(u.readingId), entry=sourceCards.get(u.entryId);
    const detail=[entry&&'起點卡 · '+entry.title,cardUseText(u),r.shelf].filter(Boolean).join(' ／ ');
    return '<div class="shuttle-card-use">'+row(readingTitle(r),detail,'layers','go',[readingPath('reading',r.id)])+
      btn('調整在本杼的用法','reviseCardUse',[s.id,r.id,''],'link')+
      btn('解除並讀連結','askUnlinkCard',[s.id,'reading',r.id],'link')+'</div>';
  }).join('');
  return panel('已連結的卡片','<div class="actions rel-entry-actions">'+btn('找相關卡片','go',['related/'+s.id],'light')+
    btn('連結既有卡片','pickShuttleCards',[s.id],'link')+'</div>'+
    (rows?'<div role="group" aria-label="從這些卡開始讀">'+rows+'</div>':
    '<p>這把杼還沒有連結卡片。</p>')+
    (pairs?more('查看已連結的並讀整理',pairs):'')+
    btn('從並讀整理選用','cardsForShuttle',[s.id],'link'));
}
function forgeCardSources(f) {
  return (f.cardDrafts||[]).map(use=>{
    const cards=cardsInUse(use).map(id=>sourceCards.get(id));
    const r=getReading(use.readingId);
    return [...cards.map(c=>[c.source+' '+c.location+'｜'+c.author,c.quote].join('\n')),
      r?.saved?.reason&&'已保存的連結理由｜'+r.saved.reason,r?.saved?.question&&'待釐清｜'+r.saved.question,
      use.note&&'我在這把杼想談的事｜'+use.note].filter(Boolean).join('\n');
  }).join('\n\n');
}
function shuttleCardIds(s) {
  return [...new Set((s?.cardUses||[]).flatMap(cardsInUse))].filter(id=>sourceCards.has(id));
}
function workCardsPanel(w) {
  const ids=shuttleCardIds(findS(w.shuttle));
  if(!ids.length&&!w.cardIds?.length)return '';
  const selected=(w.cardIds||[]).map(id=>sourceCards.get(id)).filter(Boolean);
  return panel('這件作品採用的卡片',selected.length?selected.map(c=>row(c.title,c.source+' '+c.location,'book','go',[readingPath('card',c.id)])).join(''):
    '<p>可以只帶入作品這次會用到的部分。</p>',btn('選用卡片','chooseWorkCards',[w.id],'light'));
}
function workCardButton(w) {
  if(!shuttleCardIds(findS(w.shuttle)).length&&!w.cardIds?.length)return '';
  return '<div class="actions">'+btn(w.cardIds?.length?'已選用 '+w.cardIds.length+' 張卡':'選這次作品要用的卡','chooseWorkCards',[w.id],'tiny')+'</div>';
}
function worksUsingCard(id) {
  return [...state.works,...(state.workShelf||[])].map(w=>{
    const fixed=w.versions.filter(v=>v.data.cardIds?.includes(id));
    const currentUse=w.cardIds?.includes(id);
    if(!currentUse&&!fixed.length)return '';
    return (currentUse?row(nameW(w),TYPES[w.type].name+' · '+(w.shelf||'工作稿選用'),'pen','go',['edit/'+w.id]):'')+
      fixed.map(v=>row((v.data.title||nameW(w))+' · V'+v.n,'定稿時選用的卡片','book','seeVer',[w.id,v.n])).join('');
  }).join('');
}
function selectedWorkMaterials(w) {
  return (w?.cardIds||[]).map(id=>sourceCards.get(id)).filter(Boolean).map(c=>({
    name:c.title,source:c.quote+'\n'+c.source+' '+c.location+'｜'+c.author,url:c.url
  }));
}
function workCardPicker(w) {
  const current=shuttleCardIds(findS(w.shuttle));
  const ids=[...new Set([...current,...(w.cardIds||[])])].filter(id=>sourceCards.has(id));
  const list=ids.map(id=>{
    const c=sourceCards.get(id);
    return '<label class="work-card-check"><input type="checkbox" name="workSourceCard" value="'+esc(id)+'" '+
      (w.cardIds?.includes(id)?'checked':'')+'><span><b>'+esc(c.title)+'</b><small>'+esc(c.source+' · '+c.author)+
      (current.includes(id)?'':' · 這件作品先前已選用')+'</small></span></label>';
  }).join('');
  modal('這件作品要用哪些卡？',list+btn('保存本件選用','saveWorkCards',[w.id],'primary'));
}
function draftUseInput(e) {
  const el=e.target;
  if(route!=='forge'||el.dataset.useIndex===undefined)return;
  const f=activeCardForge(args[0]), use=f?.cardDrafts?.[Number(el.dataset.useIndex)];
  const key=el.dataset.useField;
  if(!use||!['entryId','note','supportsCore'].includes(key))return;
  const value=key==='supportsCore'?el.checked:el.value;
  if(key==='entryId'&&!cardsInUse(use).includes(value)||use[key]===value)return;
  use[key]=value;f.touched=true;save();
  if(key==='supportsCore'&&value){const core=$('sfCore')?.closest('details');if(core)core.open=true;}
}
document.addEventListener('input',draftUseInput);
document.addEventListener('change',draftUseInput);
Object.assign(handlers,{
  useReading:(id,fid,sid)=>stageCardUse('reading',id,fid,sid),
  stageSingleCard:(id,fid,sid)=>stageCardUse('card',id,fid,sid),
  singleCardTopic:(id,fid)=>{
    const f=activeCardForge(fid);
    if(f?.target)stageCardUse('card',id,fid,f.target);
    else selectUseTarget('card',id,fid);
  },
  selectReadingShuttle:(id,fid)=>selectUseTarget('reading',id,fid),
  confirmReadingShuttle:(kind,id,fid)=>stageCardUse(kind,id,fid,val('readingShuttle')),
  cardsForShuttle:sid=>{const f=getMatchesForge('',sid);go(cardIndexPath(f.id));},
  reviseCardUse:(sid,rid,cid)=>stageCardUse(rid?'reading':'card',rid||cid,'',sid),
  dropCardUse:(fid,i)=>{
    const f=activeCardForge(fid);
    if(f?.cardDrafts){
      f.cardDrafts.splice(i,1);
      if(!f.cardDrafts.length&&f.scope==='帶上這次的卡片整理')f.scope='只帶我的想法';
      save();render();
    }
  },
  chooseWorkCards:id=>{const w=findW(id);if(w&&!w.shelf)workCardPicker(w);},
  saveWorkCards:id=>{
    const w=findW(id);
    if(!w||w.shelf)return;
    const before=w.cardIds,oldTime=w.updated;
    const allowed=[...new Set([...shuttleCardIds(findS(w.shuttle)),...(before||[])])].filter(id=>sourceCards.has(id));
    const chosen=[...$('dialog').querySelectorAll('input[name="workSourceCard"]:checked')].map(n=>n.value);
    w.cardIds=allowed.filter(id=>chosen.includes(id));keep(w);
    if(!storageOK){w.cardIds=before;w.updated=oldTime;return;}
    closeRefresh('已保存這件作品選用的卡片');
  }
});
