'use strict';

const scriptTools = {
  text:  { name: '研究與主文調整', hint: '從原稿與確認意圖，準備研究依據和主文。' },
  page:  { name: '生成逐頁圖文腳本', hint: '逐頁分開上版文字、圖像和製作備註。' },
  comic: { name: '生成漫畫分格腳本', hint: '按格安排可畫出的動作、對白與轉折。' },
  film:  { name: '生成分鏡與時間腳本', hint: '安排鏡頭、動作、時長、字幕與聲音。' },
  audio: { name: '生成口播稿或訪綱', hint: '按段準備口播、主問、追問及聲音提示。' }
};

function studioAction(w, label, module, detail) {
  const b = module === 'B';
  return '<button class="studio-tool'+(b?' main-tool':'')+'" title="'+esc(detail)+'"'+act('creativeTool', w.id, module)+'>'+
    '<span class="module-letter">'+esc(module.charAt(0))+'</span>'+
    '<span><strong>'+esc(label)+'</strong><small>'+esc(detail)+'</small></span></button>';
}

function studioCollaboration(w) {
  const tool=scriptTools[w.type];
  const actions=[[tool.name,'B',tool.hint],
    [w.type==='text'?'診斷這份草稿':'診斷敘事草稿','A','帶入草稿，找出結構問題與待你確認的分歧。']];
  if(w.type==='text'&&w.versions.length)actions.push(['轉譯確定稿','C','選長文節奏擴寫，或濃縮成限動金句。']);
  const buttons=actions.map(([label,mod,hint])=>studioAction(w,label,mod,hint)).join('');
  const guide='<details class="tool-guide"><summary>工具用法</summary>'+
    actions.map(([label,mod,hint])=>'<p><b>'+esc(mod+' · '+label)+'</b>　'+esc(hint)+'</p>').join('')+'</details>';
  return '<section class="panel collab-panel"><div class="sectionhead"><h2>作品協作</h2></div><div class="studio-tools">'+
    buttons+'</div>'+guide+workCardButton(w)+'</section>';
}

function versionTools(w, v) {
  const action=(label,mod)=>btn(label,'creativeTool',[w.id,mod,v.n],'tiny');
  return (w.type==='text'?action('C · 長文節奏擴寫','C-expand')+action('C · 濃縮限動金句','C-auto'):'')+
    action('D · 建立知識脈絡','D');
}

function shuttleWorkRows(s) {
  const items=listedWorks().filter(w=>w.shuttle===s.id);
  return (items.length?items.map(w=>{
    const v=w.versions.at(-1);
    return '<div class="shuttle-work">'+workRow(w)+(v?'<div>'+btn('從 V'+v.n+' 建立知識脈絡','creativeTool',[w.id,'D',v.n],'tiny')+'</div>':'')+'</div>';
  }).join(''):'<p>用這一杼開始的作品會出現在這裡。</p>')+
    '<div class="actions">'+btn('用這一杼寫文字','startFromShuttle',[s.id,'text'],'primary')+'</div>';
}

// Start a piece straight from a 杼, with the 杼 already matched.
handlers.startFromShuttle=(sid,type)=>{
  if(!findS(sid)||!TYPES[type])return;
  const m={type,kind:'new',id:uid(),signature:JSON.stringify({type,kind:'new',from:sid,at:Date.now()})};
  shuttleMatches()[m.id]=m;
  confirmMatch(m.id,sid);
};

handlers.continueWork = id => {
  const w=findW(id);
  if(!w)return;
  wk=id;
  tab=stateOf(w)==='已定稿'?'預覽與定稿':'製作';
  go('edit/'+id);
};

handlers.creativeTool=(id,module,n)=>{
  const w=findW(id);
  if(!w)return;
  if(module==='B'&&w.type!=='text')openMediaB(w);
  else openDiamond(w,module,n);
};
function workManage(w){
  const buttons=w.shelf?btn('還原作品','moveWork',[w.id,'']):btn('封存作品','moveWork',[w.id,'已封存']);
  return '<div class="work-management" role="group" aria-label="作品管理">'+buttons+
    (w.shelf==='最近刪除'?'':btn('刪除作品','askDeleteWork',[w.id],'delete-work'))+'</div>';
}
handlers.askDeleteWork=id=>{
  const w=findW(id);
  if(w)modal('刪除作品？','<p>「'+esc(nameW(w))+'」將移至「最近刪除」，可在我的作品中還原。</p>'+
    btn('取消','cancelWorkDelete')+' '+btn('確認刪除','moveWork',[id,'最近刪除'],'primary'));
};
handlers.cancelWorkDelete=()=>$('dialog').close();
handlers.moveWork=(id,shelf)=>{
  const w=findW(id);
  if(!w||!['','已封存','最近刪除'].includes(shelf))return;
  const active=state.works,stored=state.workShelf||[],previous=w.shelf;
  state.works=active.filter(item=>item.id!==id);
  state.workShelf=stored.filter(item=>item.id!==id);
  w.shelf=shelf;
  (shelf?state.workShelf:state.works).unshift(w);
  save();
  if(!storageOK){state.works=active;state.workShelf=stored;w.shelf=previous;toast('未能保存這次操作，請重試');return;}
  delete drafts[id];
  filter=topicFilter=seriesFilter='全部';progressFilter=shelf||'全部';
  go('works');toast(shelf||'已還原作品');
};
const studioVisit=window.history?.state;
if(studioVisit?.studioPath===location.hash.slice(1)&&studioVisit?.studioPath?.startsWith('edit/')&&studioVisit.workTab){
  wk=studioVisit.studioPath.split('/')[1];tab=studioVisit.workTab;
}
