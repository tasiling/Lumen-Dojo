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
  const item=(fromShuttle?workMaterials(current()):target==='workCards'?selectedWorkMaterials(current()):availableMaterials)[i];
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

function workMaterialPicker(w){
  return materialPicker('workCards',selectedWorkMaterials(w),'這件作品已選用的卡片')+
    materialPicker('shuttle',workMaterials(w),'沿用這一杼討論過的片段')+
    materialPicker('catalog',availableMaterials,'從已有素材挑選');
}
