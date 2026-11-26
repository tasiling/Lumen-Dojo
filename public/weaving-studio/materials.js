'use strict';

const availableMaterials=[];

function workMaterials(w) {
  const rounds=Object.values(shuttleForges()).filter(f=>w.shuttle && f.done===w.shuttle).flatMap(f=>f.rounds);
  const choices=rounds.filter(r=>r.source||r.note).map(r=>({
    name:r.sourceName||r.task,source:r.source||'',note:r.note||''
  }));
  return choices.filter((c,i)=>choices.findIndex(o=>o.name===c.name&&o.note===c.note&&o.source===c.source)===i);
}

function materialPicker(target,items,label) {
  if(!items.length)return '';
  return more(label,items.map((m,i)=>'<div class="entry"><b>'+esc(m.name)+'</b>'+
    (m.source?'<p>來源片段 · '+esc(m.source)+'</p>':'')+
    (m.note?'<p>我的想法 · '+esc(m.note)+'</p>':'')+
    (m.url?'<p><a target="_blank" rel="noopener noreferrer" href="'+esc(m.url)+'">查看原始資料</a></p>':'')+
    btn('帶入這個片段','useMaterial',[target,i],'light')+'</div>').join(''));
}

function appendMaterial(id,value) {
  const el=$(id);
  if(!el||!value||el.value.split('\n\n').includes(value))return;
  el.value=[el.value.trimEnd(),value].filter(Boolean).join('\n\n');
  el.dispatchEvent(new Event('input',{bubbles:true}));
}

handlers.useMaterial=(target,i,reading=false)=>{
  const inForge=target==='forge',fromShuttle=target==='shuttle';
  const item=target==='card'?(sourceCards.has(i)?cardMaterial(sourceCards.get(i)):null):
    (fromShuttle?workMaterials(current()):target==='workCards'?selectedWorkMaterials(current()):availableMaterials)[i];
  if(!item)return;
  if(inForge){
    if(!$('sfScope')){
      const f=route==='forge'&&activeCardForge(args[0]);
      if(!f)return;
      f.cardMode='topic';render();
    }
    const scope=$('sfScope');
    if(!scope)return;
    scope.value='加上選定的來源';
    for(const type of ['input','change'])scope.dispatchEvent(new Event(type,{bubbles:true}));
    const name=$('sfSourceName');
    const prior=name.value;
    if(prior && prior!==item.name && !prior.split(' ／ ').includes(item.name)){
      const src=$('sfSource');
      if(!prior.includes(' ／ ')&&src.value)src.value='【'+prior+'】\n'+src.value;
      name.value=prior+' ／ '+item.name;
    }else if(!prior)name.value=item.name;
    name.dispatchEvent(new Event('input',{bubbles:true}));
    appendMaterial('sfSource',name.value===item.name?item.source:'【'+item.name+'】\n'+item.source);
    appendMaterial('sfNote',item.note);
  }else{
    const content=[item.name,item.source,item.note?'我的想法 · '+item.note:''].filter(Boolean).join('\n');
    appendMaterial($('mbSource')?'mbSource':'diaScratch',content);
  }
  toast('已帶入，可繼續編輯');
};

/* 卡片做成可帶入的素材：原句、卡片整理與出處。 */
function cardMaterial(c) {
  return {name:[c.source,c.location,c.title].filter(Boolean).join('｜'),
    source:[c.quoteLabel||c.author,c.quote,c.idea!==c.quote?'卡片整理 · '+c.idea:''].filter(Boolean).join('\n'),note:'',url:c.url};
}
function cardMaterialRow(c,evidence) {
  const m=cardMaterial(c);
  return '<div class="entry"><b>'+esc(c.title)+'</b><small class="material-meta">'+esc([c.type,c.source,c.location].filter(Boolean).join(' · '))+'</small>'+
    (evidence?'<p class="pair-why"><span class="pair-method">用字相近</span>'+esc(evidence.detail)+'</p>':'')+
    more('查看原句','<p>'+esc(m.source)+'</p>'+(m.url?'<p><a target="_blank" rel="noopener noreferrer" href="'+esc(m.url)+'">查看原始資料</a></p>':''))+
    btn('帶入這個片段','useMaterial',['card',c.id],'light')+'</div>';
}
/* 作品可帶入的素材：已選用的卡、這把杼的卡、討論過的片段，最後才是其他卡片；
   其他卡片依和這件作品、這把杼的用字相近程度排序，看不出關聯的收起來。 */
function workMaterialPicker(w){
  const s=findS(w?.shuttle), chosen=(w?.cardIds||[]).filter(id=>sourceCards.has(id));
  const shuttleIds=shuttleCardIds(s).filter(id=>!chosen.includes(id));
  const own=[...chosen,...shuttleIds].map(id=>sourceCards.get(id));
  let html=materialPicker('workCards',selectedWorkMaterials(w),'這件作品已選用的卡片（'+chosen.length+' 張）');
  if(shuttleIds.length)html+=more('這把杼的其他卡片（'+shuttleIds.length+' 張）',shuttleIds.map(id=>cardMaterialRow(sourceCards.get(id))).join(''));
  html+=materialPicker('shuttle',workMaterials(w),'沿用這一杼討論過的片段');
  if(catalogs.cards!=='ready')return html+collectionNote('cards');
  const known=new Set(own.map(c=>c.id)), pool=[...sourceCards.values()].filter(c=>!known.has(c.id));
  if(!pool.length)return html;
  const bases=own.map(c=>['〈'+c.title+'〉',[c.title,c.idea,c.quote].join(' ')]);
  bases.push(['杼名',s?.title],['經線',s?.core],['作品名稱',w?.title],['作品內容',String(w?.body||'').slice(0,2000)]);
  const near=cardAffinity(bases,pool);
  const related=pool.filter(c=>near.has(c.id)).sort((a,b)=>near.get(b.id).score-near.get(a.id).score);
  const rest=pool.filter(c=>!near.has(c.id));
  if(!bases.some(([,t])=>String(t||'').trim()))
    return html+more('從其他卡片挑選（'+pool.length+' 張）',rest.map(c=>cardMaterialRow(c)).join(''));
  return html+more('從其他卡片挑選',
    (related.length?'<p>和這件作品、這把杼用字相近的 '+related.length+' 張排在前面。</p>'+related.map(c=>cardMaterialRow(c,near.get(c.id))).join(''):
      '<p>目前沒有和這件作品、這把杼用字相近的卡。</p>')+
    (rest.length?more('其他卡片（看不出關聯，'+rest.length+' 張）',rest.map(c=>cardMaterialRow(c)).join('')):''));
}
