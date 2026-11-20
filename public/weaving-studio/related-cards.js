'use strict';

const relatedDrafts=new Map();
let currentRelatedReview=null;
function relatedDraft(sid) {
  if(relatedDrafts.has(sid))return relatedDrafts.get(sid);
  const stored=state.relatedReviews[sid];
  const draft=stored?.v===1?stored:{v:1,focus:'',includeInterviews:false,choices:{},round:null};
  relatedDrafts.set(sid,draft);return draft;
}
function keepRelatedDraft(view) {
  state.relatedReviews[view.scan.sid]=view.draft; save();
}
function relatedEntries(scan,draft) {
  const semantic=new Map(Object.values(draft.round?.returns||{}).flat().map(match=>[match.cardId,match]));
  const entries=[];
  for(const card of scan.available){
    const local=scan.local.get(card.id),gpt=semantic.get(card.id);
    if(!local&&!gpt)continue;
    const showGPT=gpt&&(!local?.firm||gpt.fit==='direct');
    const evidence=showGPT?{method:'GPT 建議',detail:gpt.reason,quote:gpt.quote}:local;
    const firm=(!card.author.startsWith('GPT'))&&!!(local?.firm||gpt?.fit==='direct');
    entries.push({card,evidence,firm,score:local?.score||0,otherReading:gpt&&!showGPT?gpt:null});
  }
  return entries.sort((a,b)=>Number(b.firm)-Number(a.firm)||b.score-a.score||a.card.title.localeCompare(b.card.title,'zh-Hant'));
}
function relatedIsChecked(view,entry) {
  const choices=view.draft.choices;
  return Object.hasOwn(choices,entry.card.id)?choices[entry.card.id]===true:entry.firm;
}
function relatedQuote(entry,sameSourceCount) {
  const {card,evidence,otherReading}=entry;
  const shared=sameSourceCount>1?'<p>這批候選有 '+sameSourceCount+' 張卡出自同一處材料。</p>':'';
  return more('查看引文與出處','<blockquote>'+esc(evidence.quote||card.quote)+'</blockquote>'+
    '<p>'+esc(card.source+' '+card.location+' · '+card.author)+'</p>'+shared+
    (otherReading?'<p>GPT 的另一種讀法 · '+esc(otherReading.reason)+'</p>':''));
}
function relatedGroup(view,group) {
  const firm=group==='firm',entries=view.entries.filter(e=>e.firm===firm);
  if(!entries.length)return '';
  const limit=view.shown[group];
  const rows=entries.slice(0,limit).map(e=>{
    const id=e.card.id;
    const byline=e.card.type+(e.card.author.startsWith('GPT')?' · '+e.card.author:'');
    return '<li><label class="rel-card"><input type="checkbox" name="reviewRelatedCard" value="'+esc(id)+'"'+
      (relatedIsChecked(view,e)?' checked':'')+'><span><small>'+esc(byline)+'</small><b>'+esc(e.card.title)+'</b></span></label>'+
      '<div class="rel-evidence"><p>'+esc(e.evidence.detail)+'</p>'+
      (e.evidence.method==='GPT 建議'?'<small>GPT 建議</small>':'')+
      relatedQuote(e,view.sourceCounts.get(e.card.sourceKey))+'</div></li>';
  }).join('');
  const all=entries.every(e=>relatedIsChecked(view,e));
  return '<section class="rel-group" aria-labelledby="rel-heading-'+group+'"><header><h3 id="rel-heading-'+group+'">'+
    (firm?'建議連結':'可能相關')+' <small>'+entries.length+' 張</small></h3>'+
    '<button type="button" class="link" id="rel-group-'+group+'"'+act('toggleRelatedGroup',group)+' aria-label="'+
    esc((firm?'建議連結':'可能相關')+'，'+(all?'清除這組':'全選這組'))+'">'+(all?'清除這組':'全選這組')+'</button></header>'+
    '<ul>'+rows+'</ul>'+(entries.length>limit?btn('再看 '+Math.min(10,entries.length-limit)+' 張','moreRelated',[group],'link'):'')+'</section>';
}
function relatedReviewPage(sid,origin='',fid='') {
  const s=findS(sid);
  if(!s)return missing();
  const draft=relatedDraft(sid),scan=scanRelatedCards(s,draft.focus,draft.includeInterviews);
  const view={scan,draft,shown:{firm:5,possible:5},sourceCounts:new Map()};
  let updated='';
  const topicKey=relatedFingerprint(scan.topic);
  if(draft.topicKey&&draft.topicKey!==topicKey){
    draft.choices={};draft.round=null;
    updated='杼的內容已有更新，已按目前的題目重新比對。';
  }
  if(draft.topicKey!==topicKey){draft.topicKey=topicKey;if(updated)keepRelatedDraft(view);}
  if(draft.round&&draft.round.signature!==scan.signature){
    draft.round=null;keepRelatedDraft(view);updated='杼或待比對的卡片已有更新，可以用新材料再次請 GPT 補找。';
  }
  view.entries=relatedEntries(scan,draft);
  for(const e of view.entries){
    const source=e.card.sourceKey;if(source)view.sourceCounts.set(source,(view.sourceCounts.get(source)||0)+1);
  }
  currentRelatedReview=view;
  const n=view.entries.filter(e=>relatedIsChecked(view,e)).length;
  const types=draft.includeInterviews?'觀點、洞察與訪談重點':'觀點與洞察';
  const linked=scan.pool.length-scan.available.length;
  const scope='<div class="rel-scope"><p>已比對 '+scan.pool.length+' 張'+types+'，其中 '+linked+' 張已連結。</p>'+
    btn('調整比對範圍','relatedSettings',[],'link')+'</div>'+
    (draft.focus?'<p class="rel-focus">這次的重點 · '+esc(draft.focus)+'</p>':'');
  const bar='<div class="rel-save"><h2>比對結果</h2><button type="button" class="primary" id="rel-apply"'+
    (n?'':' disabled')+act('applyRelated')+'>連結選取的 '+n+' 張</button></div>';
  const none=scan.available.length?'目前沒有找到相關卡片。可以補一句你想找的關聯，或請 GPT 從原句再找一次。':
    (scan.pool.length?'這個範圍內的卡片都已經連到這把杼。':'這個範圍內還沒有卡片。');
  const groups=view.entries.length?'<div id="rel-groups">'+relatedGroup(view,'firm')+relatedGroup(view,'possible')+'</div>':
    '<p class="rel-empty">'+none+'</p>';
  const checkedBatches=Object.keys(draft.round?.returns||{}).length;
  const progress=checkedBatches?'<p>GPT 已核對 '+checkedBatches+'／'+relatedBatches(scan).length+' 批，提出 '+
    Object.values(draft.round.returns).flat().length+' 張候選。</p>':'';
  const helper=scan.available.length?progress+'<div class="rel-help">'+btn('用 GPT 補找關聯','openRelatedGPT',[],'light')+
    btn('手動挑卡','pickShuttleCards',[sid],'link')+'</div>':'';
  const body='<section class="panel rel-review">'+scope+bar+
    (updated?'<p role="status">'+esc(updated)+'</p>':'')+groups+helper+'</section>';
  return origin==='cards'?page('找相關卡片',s.title,body,cardIndexPath(fid),'觀點與洞察'):
    page('找相關卡片',s.title,body,'shuttle/'+sid,'回到這把杼');
}
function activeRelated() {
  return route==='related'&&currentRelatedReview?.scan.sid===args[0]?currentRelatedReview:null;
}
function syncRelatedSelection(view) {
  const n=view.entries.filter(e=>relatedIsChecked(view,e)).length,apply=$('rel-apply');
  apply.textContent='連結選取的 '+n+' 張';apply.disabled=!n;
  for(const g of ['firm','possible']){
    const button=$('rel-group-'+g);if(!button)continue;
    const all=view.entries.filter(e=>e.firm===(g==='firm')).every(e=>relatedIsChecked(view,e));
    button.textContent=all?'清除這組':'全選這組';
    button.setAttribute('aria-label',(g==='firm'?'建議連結':'可能相關')+'，'+button.textContent);
  }
}
function openRelatedSettings() {
  const view=activeRelated();if(!view)return;
  modal('調整比對範圍','<p>從杼名、經線和發展方向找卡，也參考已連結卡片的用詞與保存過的並讀。</p>'+
    field('這次特別想找什麼？（選填）','relFocus',view.draft.focus,false,'maxlength="400" placeholder="例如：我怎麼辨認自己正在硬撐？"')+
    '<label class="rel-scope-check"><input type="checkbox" id="relInterview"'+(view.draft.includeInterviews?' checked':'')+
    '>也比對訪談重點</label>'+btn('重新比對','setRelatedScope',[],'primary'));
}
function chooseRelatedShuttle(fid='') {
  const target=activeCardForge(fid)?.target;
  if(target&&findS(target)){go('related/'+target+'/cards/'+fid);return;}
  if(!state.shuttles.length){modal('先留下一把織光杼','<p>建立想持續探討的題目後，就能整批比對觀點與洞察。</p>'+
    btn('打造織光杼','forgeShuttle',[],'primary'));return;}
  if(state.shuttles.length===1){go('related/'+state.shuttles[0].id+'/cards'+(fid?'/'+fid:''));return;}
  modal('要替哪一把杼找卡片？',state.shuttles.map(s=>
    row(s.title,s.core||'','layers','go',['related/'+s.id+'/cards'+(fid?'/'+fid:'')])).join(''));
}
document.addEventListener('change',e=>{
  if(e.target.name!=='reviewRelatedCard')return;
  const view=activeRelated(),id=e.target.value;
  if(!view?.entries.some(item=>item.card.id===id))return;
  view.draft.choices[id]=e.target.checked;keepRelatedDraft(view);syncRelatedSelection(view);
});
Object.assign(handlers,{
  chooseRelatedShuttle,relatedSettings:openRelatedSettings,
  setRelatedScope:()=>{
    const view=activeRelated();if(!view)return;
    const focus=val('relFocus'),includeInterviews=$('relInterview').checked;
    if(focus!==view.draft.focus||includeInterviews!==view.draft.includeInterviews){
      Object.assign(view.draft,{focus,includeInterviews,choices:{},round:null});keepRelatedDraft(view);
    }
    closeRefresh();
  },
  toggleRelatedGroup:group=>{
    const view=activeRelated();if(!view)return;
    const items=view.entries.filter(e=>e.firm===(group==='firm'));
    const checked=!items.every(e=>relatedIsChecked(view,e));
    for(const e of items)view.draft.choices[e.card.id]=checked;
    for(const input of document.querySelectorAll('input[name="reviewRelatedCard"]')){
      if(Object.hasOwn(view.draft.choices,input.value))input.checked=view.draft.choices[input.value];
    }
    keepRelatedDraft(view);syncRelatedSelection(view);
  },
  moreRelated:group=>{
    const view=activeRelated();if(!view)return;
    const old=view.shown[group];
    view.shown[group]+=10;
    const groups=$('rel-groups');
    groups.innerHTML=relatedGroup(view,'firm')+relatedGroup(view,'possible');
    const first=view.entries.filter(e=>e.firm===(group==='firm'))[old];
    const input=[...groups.querySelectorAll('input[name="reviewRelatedCard"]')].find(el=>el.value===first?.card.id);
    input?.focus({preventScroll:true});
  },
  applyRelated:async()=>{
    const view=activeRelated();if(!view||view.busy)return;
    const selected=view.entries.filter(e=>relatedIsChecked(view,e));if(!selected.length)return;
    const sid=view.scan.sid;
    view.busy=true;let added=0,topicChanged=false;
    try{
      const ok=await saveShuttleLinks(sid,(uses,shuttle,latest)=>{
        if(JSON.stringify(relatedTopic(shuttle))!==JSON.stringify(view.scan.topic)){topicChanged=true;return null;}
        const covered=relatedLinkedIds(shuttle,latest);
        const fresh=selected.filter(e=>!covered.has(e.card.id));
        added=fresh.length;
        return fresh.length?[...uses,...fresh.map(e=>({cardId:e.card.id,entryId:e.card.id,note:'',
          basis:{method:e.evidence.method,detail:e.evidence.detail,...(e.evidence.quote?{quote:e.evidence.quote}:{})}}))]:null;
      });
      if(topicChanged){render();toast('這把杼的內容已更新，請確認新的比對結果。');return;}
      if(!ok){if(added===0&&findS(sid)&&selected.every(e=>relatedLinkedIds(findS(sid)).has(e.card.id))){render();toast('所選卡片都已連結。');}return;}
      for(const e of selected)delete view.draft.choices[e.card.id];
      view.draft.round=null;keepRelatedDraft(view);
      go('shuttle/'+sid);toast('已連結 '+added+' 張卡片');
    }finally{view.busy=false;}
  }
});
