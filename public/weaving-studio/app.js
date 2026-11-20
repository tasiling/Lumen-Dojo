'use strict';
const $=id=>document.getElementById(id);
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icon=n=>'<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="'+(PATHS[n]||PATHS.book)+'"/></svg>';
const act=(name,...args)=>' data-act="'+esc(name)+'" data-args="'+esc(JSON.stringify(args))+'"';
const btn=(label,name,args=[],cl='')=>'<button type="button" class="'+cl+'"'+act(name,...args)+'>'+esc(label)+'</button>';
const choiceButton=(label,action,args,selected)=>'<button type="button" class="'+(selected?'on':'')+'" aria-pressed="'+String(selected)+'"'+act(action,...args)+'>'+esc(label)+'</button>';
const row=(name,desc,ic,action,args)=>'<button type="button" class="row"'+act(action,...args)+'><span class="sig">'+icon(ic)+'</span><span class="txt"><b>'+esc(name)+'</b><small>'+esc(desc)+'</small></span><span class="go" aria-hidden="true">›</span></button>';
const options=(values,sel)=>values.map(v=>'<option'+(sel===v?' selected':'')+'>'+esc(v)+'</option>').join('');
const field=(name,id,value='',area=false,bind='')=>'<label class="field">'+esc(name)+(area?'<textarea id="'+id+'" '+bind+'>'+esc(value)+'</textarea>':'<input id="'+id+'" value="'+esc(value)+'" '+bind+'>')+'</label>';
const pick=(label,id,items,val,bind='')=>'<label class="field">'+esc(label)+'<select id="'+id+'" '+bind+'>'+options(items,val)+'</select></label>';
const val=id=>$(id)?.value.trim()||'';
const panel=(head,body,action='')=>'<section class="panel"><div class="sectionhead"><h2>'+esc(head)+'</h2>'+action+'</div>'+body+'</section>';
const more=(label,body)=>'<details><summary>'+esc(label)+'</summary>'+body+'</details>';
const icbutton=(ico,txt,action,...args)=>'<button type="button"'+act(action,...args)+'>'+icon(ico)+esc(txt)+'</button>';
const sectionhead=(name,desc='',action='')=>'<div class="sectionhead"><div><h2>'+esc(name)+'</h2>'+(desc?'<small>'+esc(desc)+'</small>':'')+'</div>'+action+'</div>';
const back=(to='home',label='織光堂')=>btn('‹　'+label,'go',[to],'back');
const page=(title,desc,body,parent='home',label='織光堂')=>contextBack(parent,label)+'<header class="pagehead"><h1>'+esc(title)+'</h1>'+(desc?'<p>'+esc(desc)+'</p>':'')+'</header>'+body;
const tip=t=>'<p class="note">'+esc(t)+'</p>';
function packetControls(label,id,value,copyLabel,action,params=[]){
  return '<div class="packet-actions">'+btn(copyLabel,action,params,'light')+
    more('查看完整指令',field(label,id,value,true,'readonly'))+'</div>';
}
function selectForCopy(id){
  const box=$(id);if(!box)return;
  for(let node=box.parentElement;node;node=node.parentElement)if(node.tagName==='DETAILS')node.open=true;
  box.focus();box.select();
}
let state, storageOK=true;
let drafts={},tab='製作',wk=null,filter='全部',progressFilter='全部',topicFilter='全部',seriesFilter='全部',toastTimer,rec=null,activePlay=null,route='',args=[],lastRealm='home';
const findW=id=>state.works.find(w=>w.id===id)||state.workShelf?.find(w=>w.id===id)||drafts[id];
const findS=id=>state.shuttles.find(s=>s.id===id);
const nameW=w=>w.title.trim()||'未命名'+TYPES[w.type].name;
const current=()=>findW(args[0]);
function toast(message) {
  const dialog = $('dialog');
  const notice = $('notice');
  const active = dialog.open ? dialog.querySelector('.dialog-notice') : null;
  const output = active || notice;
  clearTimeout(toastTimer);
  notice.textContent = '';
  output.textContent = message;
  toastTimer = setTimeout(() => { output.textContent = ''; }, 3600);
}
function save(){scheduleSave();}
function keep(w){if(w.shelf)return;if(!state.works.some(x=>x.id===w.id)){state.works.unshift(w);delete drafts[w.id]}w.updated=Date.now();save();}
function stopRec(){if(rec?.state==='recording')rec.stop()}
let nextVisit=null;
const returnLabels={works:'我的作品',shuttle:'原本的織光杼',card:'原卡',reading:'這段卡片整理',compare:'並讀兩張卡'};
function contextBack(fallback,label){
  const record=window.history?.state;
  if(record?.studioPath===location.hash.slice(1)&&record.returnLabel)
    return btn('‹　'+record.returnLabel,'studioBack',[],'back');
  return back(fallback,label);
}
function go(to){
  const name=to.split('/')[0];
  if(name==='sanko'||name==='service'){void openNative(name==='sanko'?'/liaojie/sanko':'/liaojie/services');return;}
  const realm=['liao','publish','release'].includes(name)?'liao':'home';
  if(realm!==document.body.dataset.home){void openNative((realm==='liao'?'/liaojie/studio':'/weaving/studio')+'#'+to);return;}
  $('dialog').close();stopRec();
  const here=location.hash.slice(1)||document.body.dataset.home;
  if(here===to){render();return;}
  const history=window.history;
  if(history?.replaceState){
    history.replaceState({...history.state,studioPath:here,position:window.scrollY,workTab:route==='edit'?tab:null},'');
    const target=to.split('/')[0];
    const parent=route==='edit'?'作品'+(tab==='歸杼與來源'?'的歸杼與來源':''):returnLabels[route];
    nextVisit={studioPath:to,returnLabel:['edit','card','shuttle'].includes(target)&&parent?parent:null};
  }
  location.hash=to;
}
function modal(title,html){const d=$('dialog');d.innerHTML='<div class="sectionhead"><h2 id="dialog-title">'+esc(title)+'</h2>'+btn('關閉','close',[],'tiny')+'</div>'+html+'<div class="dialog-notice" role="status" aria-live="polite"></div>';if(!d.open)d.showModal();d.scrollTop=0}
function newWork(t,mode,source){if(!TYPES[t])return;const w=work(t);w.mode=mode||w.mode;if(w.mode.includes('Reels'))w.frame='直式';if(source)w.source=source;drafts[w.id]=w;wk=w.id;tab='製作';return w;}
function version(w,n){return w?.versions.find(x=>x.n===Number(n))}
function stateOf(w){if(w.nativeStatus)return w.nativeStatus;const latest=w.versions.at(-1),now=fieldsnap(w);if(latest){for(const key of ['duration','use'])if(!(key in latest.data)&&!now[key])delete now[key]}if(latest&&JSON.stringify(latest.data)===JSON.stringify(now))return '已定稿';if(w.review)return '待確認';if(w.body.trim()||w.media||w.units.some(u=>u.heading||u.body||u.image))return '製作中';return '準備中'}
function next(w){if(stateOf(w)==='已定稿')return '查看定稿 V'+w.versions.at(-1).n;
 if(w.units.some(u=>u.bRound)&&!w.media){return {page:'逐頁腳本已採用，接續編排',comic:'分格腳本已採用，接續繪製',film:'分鏡腳本已採用，接續製作',audio:'聲音腳本已採用，接續錄音'}[w.type]||'繼續編寫'}if(w.type==='page')return '繼續編排第 '+(w.cursor+1)+' 頁';if(w.type==='comic')return '繼續分鏡第 '+(w.cursor+1)+' 格';if(w.type==='film')return w.media?'試播成片':'繼續'+(w.mode==='分章長片'?'章節':'分鏡');if(w.type==='audio')return w.media?'繼續試聽':'繼續節目稿與錄音';return '繼續編寫正文'}
function workRow(w){if(w.nativeURL)return nativeRow(w.title,TYPES[w.type].name+' · '+w.nativeStatus,TYPES[w.type].icon,w.nativeURL);if(w.shelf)return row(nameW(w),TYPES[w.type].name+' · '+w.shelf,TYPES[w.type].icon,'go',['edit/'+w.id]);return row(nameW(w),TYPES[w.type].name+' · '+stateOf(w)+'　'+next(w),TYPES[w.type].icon,'continueWork',[w.id])}
function theme(){const blue=['liao','publish','release','sanko','service'].includes(route);document.body.classList.toggle('blue',blue);lastRealm=blue?'liao':'home';const name=blue?'聊解室':'織光堂';$('top').innerHTML='<header class="topbar"><div class="brand">'+icon('sun')+'<span>行光道場<small>Lumen Dojo</small></span></div><div class="topact">'+icbutton('clock','計時','timer')+icbutton('compass','場域','realms')+'</div></header>';$('bottom').innerHTML='<nav class="globalnav" aria-label="全站導覽"><div>'+[['sun','今天'],['calendar','行事曆'],['plus','新增'],['week','週盤'],['history','回看']].map(x=>icbutton(x[0],x[1],'global',x[1])).join('')+'</div></nav>';document.title=name+'｜行光道場'}
function hero(name,desc){return '<section class="hero"><div class="ey">行光道場　／　'+(name==='聊解室'?'服務場域':'創作場域')+'</div><h1>'+name+'</h1><p>'+desc+'</p></section>'}
function formatBtn(k){const t=TYPES[k];return '<button class="format" style="--tone:'+t.tone+';--wash:'+t.wash+'"'+act('new',k)+'><span class="symbol">'+icon(t.icon)+'</span><b>'+t.action+'</b><small>'+t.hint+'</small><span class="go">›</span></button>'}
function home(){const recent=listedWorks().sort((a,b)=>b.updated-a.updated).filter(w=>stateOf(w)!=='已定稿').slice(0,2);return hero('織光堂','今天，想用什麼形式創作？')+panel('開始創作','<div class="formgrid">'+Object.keys(TYPES).map(formatBtn).join('')+'</div><div class="forge-home">'+row('打造織光杼','從已有的觀點、洞察或想追的題目開始。','layers','forgeShuttle',[])+'</div>')+panel('繼續上次',recent.map(workRow).join('')||'<p>選一種形式，留下你的第一份稿。</p>',btn('我的作品 ›','go',['works'],'link'))+'<div class="navpair">'+row('織光杼','繼續發展一個題目','layers','go',['shuttles'])+row('前往聊解室','占卜企劃、發布與交付','chat','go',['liao'])+'</div>'+productionTools('home');}

function works(){
  const shelf=['已封存','最近刪除'].includes(progressFilter);
  const pool=shelf?(state.workShelf||[]).filter(w=>w.shelf===progressFilter):listedWorks();
  const items=pool.filter(w=>(seriesFilter==='全部'||w.project===seriesFilter)&&(filter==='全部'||w.type===filter)&&
    (shelf||progressFilter==='全部'||stateOf(w)===progressFilter||(progressFilter==='已定稿'&&w.versions.length))&&
    (topicFilter==='全部'||(topicFilter==='無'?!w.shuttle:w.shuttle===topicFilter))).sort((a,b)=>b.updated-a.updated);
  const formats=[['全部','全部'],...Object.keys(TYPES).map(k=>[k,TYPES[k].name])];
  const activeExtra=Number(topicFilter!=='全部')+Number(seriesFilter!=='全部');
  const extraOpen=activeExtra||$('workExtra')?.open;
  const projects=[...new Set([...state.works,...(state.workShelf||[])].map(w=>w.project).filter(Boolean))];
  const picker='<div class="chips" role="group" aria-label="作品形式">'+formats.map(([k,n])=>choiceButton(n,'filter',[k],filter===k)).join('')+'</div>'+
    '<div class="work-filters">'+pick('進度','progressFilter',['全部','準備中','製作中','待確認','已定稿','已封存','最近刪除'],progressFilter)+
    '<details id="workExtra"'+(extraOpen?' open':'')+'><summary>杼與企劃'+(activeExtra?'（'+activeExtra+'）':'篩選')+'</summary>'+
    shuttleSelect('topicFilter','所屬織光杼',[['全部','全部'],['無','尚未歸杼'],...state.shuttles.map(sh=>[sh.id,sh.title])],topicFilter)+
    pick('企劃或題材','seriesFilter',['全部',...projects],seriesFilter)+'</details></div>';
  const filtered=activeExtra||filter!=='全部'||progressFilter!=='全部';
  const heading='<div class="sectionhead results-head"><h2>'+esc(shelf?progressFilter:'作品')+' <span>'+items.length+' 件</span></h2>'+
    (filtered?btn('清除篩選','clearFilter',[],'link'):'')+'</div>';
  return page('我的作品','', '<section class="panel works-panel">'+picker+heading+collectionNote('catalog')+collectionNote('media')+
    (items.map(workRow).join('')||'<p>目前沒有符合條件的作品。</p>')+'</section>');
}
const bind=k=>'data-w="'+k+'"';const ubind=k=>'data-u="'+k+'"';
function previewUnit(w, u) {
  const layouts = { '封面':'cover', '對話':'dialogue', '雜誌':'magazine' };
  const tones = { '墨藍':'dark', '青綠':'green' };
  const medium = w.type === 'comic' ? 'comic' : w.type === 'film' ? (w.frame === '直式' ? 'vertical' : 'video') : '';
  const classes = ['preview-card', layouts[u.layout], tones[u.tone], medium].filter(Boolean).join(' ');
  const picture = u.image ? '<img data-blob="'+esc(u.image)+'" alt="本頁圖片">' : '';
  if (u.bRound && ['comic','film'].includes(w.type)) {
    const printed = w.type === 'film' ? u.caption : u.body;
    const description = [u.heading, w.type === 'film' ? u.body : u.expression].filter(Boolean).join('　');
    const role = w.type === 'comic' && printed && u.speaker ? '<small>'+esc(u.speaker)+'</small>' : '';
    return '<div class="'+classes+' storyboard">'+picture+
      (!picture ? '<div class="scene-description"><small>分鏡示意</small><p>'+esc(description)+'</p></div>' : '')+
      (printed ? '<em>'+role+esc(printed)+'</em>' : '')+'</div>';
  }
  const heading = u.heading || ({page:'第一句想說的話',comic:'場景與動作',film:'鏡頭畫面'}[w.type] || '');
  return '<div class="'+classes+'">'+picture+'<b>'+esc(heading)+'</b><em>'+esc([u.speaker,u.body].filter(Boolean).join('　'))+'</em></div>';
}
function mediaPlayer(w){if(!w.media)return '';const tag=w.type==='audio'?'audio':'video';return '<'+tag+' controls playsinline preload="metadata" data-blob="'+esc(w.media)+'" aria-label="試播'+esc(nameW(w))+'"></'+tag+'><small>'+esc(w.mediaName||'媒體檔案')+'</small>'}
function modeSelect(w){return '<div class="chips modes modes-'+w.type+'" role="group" aria-label="起稿方式">'+TYPES[w.type].modes.map(m=>choiceButton(m,'mode',[m],w.mode===m)).join('')+'</div>'}
function editor(w){
  if(!w)return missing();
  if(w.shelf)return page(nameW(w),w.shelf,workManage(w),'works','我的作品');
  if(wk!==w.id){wk=w.id;tab='製作'}
  const actual=state.works.some(x=>x.id===w.id), sh=findS(w.shuttle);
  const path=contextBack('home','織光堂');
  const header='<header class="pagehead work-heading"><div class="work-meta"><span>'+esc(TYPES[w.type].name)+'</span><span id="workStatus">'+
    (actual?stateOf(w):'新作')+'</span></div><h1 id="editorTitle">'+esc(w.title||TYPES[w.type].action)+'</h1>'+
    (sh?'<button class="shuttle-context"'+act('go','shuttle/'+sh.id)+'>'+icon('layers')+esc(sh.title)+'</button>':'')+'</header>';
  const tabs='<nav class="tabs work-tabs" aria-label="作品頁面">'+['製作','預覽與定稿','歸杼與來源'].map(t=>choiceButton(t,'tab',[t],tab===t)).join('')+'</nav>';
  if(tab==='歸杼與來源')return path+header+tabs+linkWork(w);
  if(tab==='預覽與定稿')return path+header+tabs+review(w);
  if(!sh)return path+header+tabs+legacyShuttleGate(w)+workManage(w);
  const sheet='<section class="panel work-sheet"><h2>製作'+esc(TYPES[w.type].name)+'</h2>'+modeSelect(w)+
    field('作品名稱','workTitle',w.title,false,bind('title'))+editBody(w)+(w.type==='text'?'':mediaBNotes(w))+
    '<footer class="editor-footer"><div class="actions">'+btn('保存草稿','keep',[],'primary')+btn('預覽作品','tab',['預覽與定稿'])+
    '</div><p class="statusline" id="saved">'+(actual?(hasUnsaved()?'正在儲存到行光道場…':'已儲存到行光道場'):'開始編寫後自動儲存')+'</p>'+workManage(w)+'</footer></section>';
  return path+header+tabs+'<div class="studio-layout">'+studioCollaboration(w)+sheet+'</div>';
}
function filmSettings(w){
  const controls='<div class="inline-fields">'+pick('畫幅','frame',['橫式','直式','方形'],w.frame,bind('frame'))+
    '<label class="checkline"><input type="checkbox" id="loop" data-w="loop" '+(w.loop?'checked':'')+'>循環播放</label></div>';
  return more('影片設定 · 畫幅、循環與片長',controls+
    field('預計片長（例如 30 秒或 12 分鐘）','duration',w.duration,false,bind('duration'))+
    field('預計用途（選填）','use',w.use,false,bind('use')));
}
function editBody(w){if(w.type==='text')return field('正文','body',w.body,true,bind('body'))+more('研究、改稿與候選',field('本篇想查的原句或問題','rq')+field('來源、使用界線或待查處','rs', '',true)+pick('這份研究的用途','ruse',['暫留背景','候選入文','尚待查證'],'暫留背景')+btn('保存研究判斷','research')+(w.research||[]).map(r=>'<div class="entry"><b>'+esc(r.q)+'</b><p>'+esc(r.use)+' · '+esc(r.s)+'</p></div>').join('')+field('帶回候選文字，和正文分開保存','candidate',w.candidate,true,bind('candidate'))+btn('比較候選與正文','compare'));
 if(w.type==='audio')return (w.mode==='Podcast 單集'?field('節目或系列名稱（選填）','episode',w.episode,false,bind('episode')):'')+field(w.mode==='Podcast 單集'?'本集段落與口播稿':'開場口白或剪輯筆記','body',w.body,true,bind('body'))+avControls(w);
 const i=w.cursor,u=w.units[i],n=w.type==='page'?'頁':w.type==='comic'?'格':w.mode==='分章長片'?'章':'鏡';return '<div class="sectionhead"><h3>'+({page:'頁面編排',comic:'分鏡與對白',film:w.mode==='分章長片'?'章節與逐段口播':'鏡頭與動作'}[w.type])+(w.units.length===1?'<small class="first-unit">第 1 '+n+'</small>':'')+'</h3>'+btn('新增一'+n,'addUnit',[],'tiny')+'</div>'+(w.units.length>1?'<div class="scrollrow" role="group" aria-label="選擇編輯的'+n+'">'+w.units.map((x,j)=>choiceButton((j+1)+(x.ok?' ✓':''),'unit',[j],i===j)).join('')+'</div>':'')+'<div class="editor-grid"><div>'+field(w.type==='page'?'頁面標題':w.type==='comic'?'場景與動作':w.mode==='分章長片'?'章節名稱':'起始畫面','heading',u.heading,false,ubind('heading'))+(w.type==='film'?pick('這一'+n+'的製作手法','technique',['未指定','Motion','實拍','對談','混合'],u.technique||(w.mode==='Motion 小動畫'?'Motion':'未指定'),ubind('technique'))+field('配音、音軌或環境聲（選填）','sound',u.sound,false,ubind('sound')):'')+(w.type==='comic'||u.layout==='對話'?field('角色／說話者','speaker',u.speaker,false,ubind('speaker')):'')+field(w.type==='page'?'頁面文字':w.type==='comic'?'對白或旁白':u.bRound?'動作與結束狀態':'動作、口播與字幕','unitBody',u.body,true,ubind('body'))+(w.type==='page'?'<div class="inline-fields">'+pick('這一頁的版型','layout',['引句','對話','雜誌','封面'],u.layout,ubind('layout'))+pick('用色','tone',['粉紫','墨藍','青綠'],u.tone,ubind('tone'))+'</div>':'')+'<label class="field">加入本'+n+'圖片<input type="file" accept="image/*" id="unitImage"></label><div class="actions">'+btn(u.ok?'已確認此'+n+' ✓':'確認此'+n,'unitOK',[],'tiny')+(i>0?btn('往前移','moveUnit',[-1],'tiny'):'')+(i<w.units.length-1?btn('往後移','moveUnit',[1],'tiny'):'')+'</div></div><div><small>第 '+(i+1)+'／'+w.units.length+' '+n+'預覽</small><div id="livePreview">'+previewUnit(w,u)+'</div></div></div>'+(w.type==='film'?filmSettings(w)+btn('播放分鏡示意','storyPlay')+avControls(w):'');}
function avControls(w){return '<div class="entry" id="mediaCheck" tabindex="-1"><h3>'+ (w.type==='audio'?'錄音與試聽':'成片回收與試播')+'</h3>'+mediaPlayer(w)+'<label class="field">帶入'+(w.type==='audio'?'音檔':'成片')+'<input type="file" id="uploadMedia" accept="'+(w.type==='audio'?'audio/*':'video/*')+'"></label><div class="actions">'+(w.type==='audio'?btn(rec?.state==='recording'?'停止並保存錄音':'開始錄音','record',[],'tiny'):'')+(w.media?btn(w.listened?'已核對檔案 ✓':'試播後確認檔案','listen',[],'tiny'):'')+'</div></div>'}
function displaySnap(data){if(data.type==='text')return '<div class="fixed-preview">'+esc(data.body||'尚未編寫正文')+'</div>';if(data.type==='audio')return mediaPlayer(data)+'<div class="fixed-preview">'+esc(data.body||'尚無段落筆記')+'</div>';return (data.type==='film'?mediaPlayer(data):'')+'<div class="snap-pages">'+data.units.map((u,i)=>'<div><small>'+((i+1)+'／'+data.units.length)+'</small>'+previewUnit(data,u)+'</div>').join('')+'</div>'}
function review(w){
  const latest=w.versions.at(-1),fixed=latest&&stateOf(w)==='已定稿',ready=actionable(w),matched=!!findS(w.shuttle);
  let control;
  if(fixed){
    control='<p class="review-state">目前工作稿與定稿 V'+latest.n+' 相同</p>'+btn('查看定稿 V'+latest.n,'seeVer',[w.id,latest.n],'light');
  }else if(!matched){
    control=btn('為這件作品匹配織光杼','sfExisting',[w.id],'primary');
  }else if(ready){
    control='<div class="actions">'+btn('確認這一版已定稿','finalize',[],'primary')+
      (w.review?'<span class="review-state">待確認</span>':btn('標記待確認','toReview'))+'</div>';
  }else{
    const reason=reviewGap(w);
    control='<div class="review-next"><span>'+esc(reason.message)+'</span>'+btn(reason.action,'reviewResume',[w.id],'light')+'</div>'+
      (w.body.trim()||w.media||w.units.some(u=>u.heading||u.body||u.image)?(w.review?'<span class="review-state">待確認</span>':btn('標記待確認','toReview',[],'link')):'');
  }
  const revisions=w.versions.slice().reverse().map(v=>'<article class="fixed-version"><div class="sectionhead"><h3>定稿 V'+v.n+'</h3>'+
    btn('查看固定版','seeVer',[w.id,v.n],'link')+'</div><p>'+esc(v.data.title||nameW(w))+'</p><div class="actions handoff">'+
    btn('交給聊解室安排發布','send',[w.id,v.n],v===latest?'primary':'light')+
    (['film','audio','page','comic'].includes(w.type)?btn('管理本版輸出'+(v.outputs?.length?'（'+v.outputs.length+'）':''),'outputs',[w.id,v.n]):'')+'</div>'+
    '<h4>從這一版繼續創作</h4><div class="version-tools">'+versionTools(w,v)+btn('另做改編','derive',[w.id,v.n],'tiny')+'</div></article>').join('');
  return panel('目前工作稿',control+(fixed?more('查看工作稿內容',displaySnap(w)):'<div class="work-preview">'+displaySnap(w)+'</div>'))+
    panel('已定稿版本',revisions||'<p>確認定稿後，這裡會保留可以交付的版本。</p>');
}
function reviewGap(w){
  if(w.type==='text')return {message:'寫下正文後，就可以確認定稿。',action:'回到正文',field:'body'};
  if(w.type==='audio'||w.type==='film'){
    const audio=w.type==='audio',file=audio?'音檔':'成片',play=audio?'試聽':'試播';
    return w.media?{message:'已帶入'+file+'，還需要'+play+'並確認檔案。',action:'回到'+play,field:'mediaCheck'}:
      {message:'需要一份可'+play+'的'+file+'。',action:'回製作區帶入'+file,field:'uploadMedia'};
  }
  const unit=w.type==='page'?'頁':'格';
  const missing=u=>!u.ok||!(u.heading.trim()||u.body.trim()||u.image);
  const count=w.units.filter(missing).length, cursor=w.units.findIndex(missing);
  return {message:'還有 '+count+' '+unit+'待確認',action:'回到第 '+(cursor+1)+' '+unit,field:'heading',cursor};
}
function showWorkTab(name){
  tab=name;
  const history=window.history;
  if(history?.replaceState)history.replaceState({...history.state,studioPath:location.hash.slice(1),workTab:name,position:0},'');
  render();window.scrollTo(0,0);
  document.querySelector('.work-tabs button[aria-pressed="true"]')?.focus({preventScroll:true});
}
function derivativePanel(w){
 const linked=state.works.filter(x=>x.source?.id===w.id);
 return linked.length?panel('從這件作品延伸',linked.map(x=>row(nameW(x),'源自 V'+x.source.n+' · '+TYPES[x.type].name+' · '+stateOf(x),TYPES[x.type].icon,'go',['edit/'+x.id])).join('')):'';
}
function linkWork(w){const s=findS(w.shuttle);const d=s?.dirs.find(d=>d.id===w.direction);const source=w.source;return panel('作品來源',source?'<p>'+esc(source.title)+(source.n?' · V'+source.n:'')+'</p>'+(findW(source.id)?btn('查看來源版本','seeVer',[source.id,source.n]):''):'<p>這件作品從所選形式開始。</p>')+panel('企劃或題材',field('這件作品的企劃或題材（選填）','project',w.project||'',false,bind('project')))+panel('所屬織光杼','<p>'+esc(s?s.title:w.shuttle?'關聯待核對':'尚未歸杼')+(d?' ／ '+esc(d.name)+(w.understanding?' · 理解 V'+w.understanding.n:''):'')+'</p>'+(w.coreSnapshot?.n?tip('採用經線 V'+w.coreSnapshot.n+' · '+w.coreSnapshot.text):'')+(d&&w.understanding?tip(w.understanding.text):'')+btn('整理歸屬與理解版本','linkPick',[w.id])+ (s?' '+btn('留下回杼心得','reflect',[w.id]):''))+workCardsPanel(w)+derivativePanel(w);}
function missing(){return page('找不到這筆紀錄','請回首頁選形式開始，或接續已有草稿。',btn('回織光堂','go',['home']))}
function shuttles(){
  const items=state.shuttles.map(s=>{
    const cards=shuttleCardIds(s).length,works=listedWorks().filter(w=>w.shuttle===s.id).length;
    const detail=[cards&&cards+' 張已連結卡片',s.dirs.length&&s.dirs.length+' 個方向',works&&works+' 件直接歸入的作品'].filter(Boolean);
    return row(s.title,detail.join(' · ')||'可連結第一張卡片','layers','go',['shuttle/'+s.id]);
  }).join('');
  return page('織光杼','留下想持續發展的題目。',panel('我的織光杼',collectionNote('catalog')+(items||(catalogs.catalog==='ready'?'<p>可先留下一個題目。</p>':'')),
    btn('打造織光杼','addShuttle',[],'light'))+shuttleForgeResume()+recentReadings()+btn('打開觀點與洞察','go',['cards'],'link'));
}
function shuttle(s){
  if(!s)return missing();
  const directions=s.dirs.map(d=>{
    const latest=d.vs.at(-1);
    const history=d.vs.length>1?more('查看先前 '+(d.vs.length-1)+' 版理解',
      d.vs.slice(0,-1).map((v,i)=>'<p><b>V'+(i+1)+'</b>　'+esc(v)+'</p>').join('')):'';
    return '<article class="shuttle-direction"><h3>'+esc(d.name)+'</h3>'+
      (latest?'<p><b>V'+d.vs.length+'</b>　'+esc(latest)+'</p>':'')+history+
      btn('追加理解版本','newUnderstanding',[s.id,d.id],'tiny')+'</article>';
  }).join('');
  const core='<p class="core-text">'+esc(s.core||'經線可以留白。')+'</p>'+
    '<div class="actions">'+btn('修改核心理解','core',[s.id],'tiny')+
    btn('和 GPT 討論這一杼','sfDiscussExisting',[s.id],'light')+'</div>'+shuttleDiscussionPanel(s);
  const notes=s.notes.map(n=>'<div class="entry"><b>'+esc(n.title)+'</b><p>'+esc(n.text)+'</p></div>').join('');
  return page(s.title,'織光杼',panel('織光經線｜目前的核心理解',core)+shuttleCardsPanel(s)+
    panel('方向與理解版本',directions||'<p>尚未留下方向。</p>',btn('保留新方向','direction',[s.id],'light'))+
    panel('創作成品',shuttleWorkRows(s))+diamondNodesForShuttle(s)+
    panel('回杼心得',notes||'<p>可從作品的「歸杼與來源」留下心得。</p>'),'shuttles','織光杼');
}
function liao(){return hero('聊解室','把作品帶到讀者身邊，也接住每一次相遇。')+panel('今天要做什麼？',row('發布作品','選用定稿，準備各平台版本','send','go',['publish'])+row('日上三更','安排晨光、日光與第三更','sun','go',['sanko'])+row('活動與私人交付','核對個人問題、解讀與交付','person','go',['service']))+panel('最近的發布工作',state.pubs.slice(0,3).map(pubRow).join('')||'<p>從「發布作品」選一份固定版開始。</p>')+productionTools('liao')+btn('返回織光堂','go',['home'],'light')}
function pubRow(r){return row(r.channel+'｜'+r.title,'來源 V'+r.n+' · '+r.status,'send','go',['release/'+r.id])}
function publish(){const pending=state.inbox.map(v=>({w:findW(v.id),n:v.n})).filter(v=>version(v.w,v.n));const all=state.works.flatMap(w=>w.versions.map(v=>({w,n:v.n})));function choices(arr){return arr.map(x=>row((version(x.w,x.n)?.data.title||nameW(x.w))+' · V'+x.n,'選擇本次的發布目的地',TYPES[x.w.type].icon,'channel',[x.w.id,x.n])).join('')}
return page('發布作品','每個目的地使用指定的定稿版本。',panel('待安排的交接',choices(pending)||'<p>可從織光堂交接，或在下方選一份定稿。</p>')+panel('平台稿與實發紀錄',state.pubs.map(pubRow).join('')||'<p>尚無平台稿。</p>')+nativeRow('既有作品的發布交接','查看既有工作臺的定稿與交接','send','/liaojie/workbench')+more('從所有定稿選取',choices(all)||'<p>可先回織光堂確認作品定稿。</p>'),'liao','聊解室')}
function release(r){if(!r)return missing();const w=findW(r.work),v=version(w,r.n);return page(r.channel+'發布稿',r.title+' · 固定版 V'+r.n,panel('來源與目的地','<span class="badge">'+esc(r.status)+'</span> '+(r.output?'<p>採用輸出 · '+esc(r.output.name)+'</p>':'')+btn('查看來源 V'+r.n,'seeVer',[r.work,r.n],'link')+(w?.type==='film'&&r.channel.includes('Reels')?tip('本次交接的是固定成片。Reels 在這裡記錄實際刊登位置。'):'')+(v?more('本次採用的成品',displaySnap(v.data)):''))+panel(r.channel==='噗浪'?'主噗與樓層':'平台配文',(r.channel==='噗浪'?r.parts.map((v,i)=>'<div class="entry">'+field(i?'第 '+i+' 樓':'主噗','floor'+i,v,true,'data-floor="'+i+'"')+btn(r.copied[i]?'已複製 · 再複製':'複製這一樓','copyFloor',[i],'tiny')+'</div>').join('')+btn('新增一樓','addFloor')+btn('依空行分樓','splitFloor'):field('配文或節目說明','caption',r.caption,true,'data-r="caption"'))+'<div class="inline-fields">'+field('安排日期','schedule',r.schedule,false,'type="date" data-r="schedule"')+field('實際發布日期','released',r.released,false,'type="date" data-r="released"')+'</div>'+field('發布連結（選填）','permalink',r.link,false,'type="url" data-r="link"')+field('交流回看','response',r.response,true,'data-r="response"')+'<div class="actions">'+btn('保存平台稿','saveRelease')+btn('標記已安排','scheduled')+btn('確認已發表（模擬）','published',[],'primary')+'</div>'),'publish','發布作品')}
function render(){if(!ready)return;const parts=(location.hash.slice(1)||document.body.dataset.home).split('/');route=parts.shift();args=parts;theme();
  if(['sanko','service'].includes(route)){void openNative(route==='sanko'?'/liaojie/sanko':'/liaojie/services');return;}
  if(['card','cards','related','reading','compare'].includes(route)&&catalogs.cards!=='ready'){
    $('main').innerHTML=page('觀點與洞察','',collectionNote('cards'));return;
  }
  if(((['related','shuttle'].includes(route)&&!findS(args[0])) || (route==='edit'&&current()?.shuttle&&!findS(current().shuttle)) || (route==='forge'&&shuttleForges()[args[0]]?.target&&!findS(shuttleForges()[args[0]].target)))&&catalogs.catalog!=='ready'){
    $('main').innerHTML=page('織光杼','',collectionNote('catalog'));return;
  }
  let body;switch(route){case 'home':body=home();break;case 'works':body=works();break;case 'edit':body=editor(current());break;case 'shuttles':body=shuttles();break;case 'shuttle':body=shuttle(findS(args[0]));break;case 'liao':body=liao();break;case 'publish':body=publish();break;case 'release':body=release(state.pubs.find(p=>p.id===args[0]));break;default:body=renderShuttleFlow(route,args)||missing()}
$('main').innerHTML=body;hydrate();if(errorMessage)showSave(errorMessage,true);}

window.addEventListener('hashchange',()=>{
  if(activePlay)clearInterval(activePlay);stopRec();
  const history=window.history, path=location.hash.slice(1)||document.body.dataset.home;
  const fresh=nextVisit?.studioPath===path;
  if(fresh&&history)history.replaceState(nextVisit,'');
  nextVisit=null;
  const visit=history?.state;
  if(!fresh&&visit?.studioPath===path&&path.startsWith('edit/')&&visit.workTab){
    wk=path.split('/')[1];tab=visit.workTab;
  }
  render();window.scrollTo(0,(!fresh&&visit?.studioPath===path&&visit.position)||0);
});
function updatePreview(){const w=current();if($('livePreview')){$('livePreview').innerHTML=previewUnit(w,w.units[w.cursor]);hydrate()}if($('editorTitle'))$('editorTitle').textContent=w.title||TYPES[w.type].action;if($('workStatus'))$('workStatus').textContent=stateOf(w);if($('saved'))$('saved').textContent=errorMessage||(hasUnsaved()?'正在儲存到行光道場…':'已儲存到行光道場')}
async function putBlob(blob){
  const image=blob.type.startsWith('image/'), endpoint=image?'/api/dojo/illustrated/assets':api+'/media';
  const result=await request(endpoint,{method:'POST',headers:{'Content-Type':blob.type},body:blob});
  return (image?'image:':'media:')+result.id;
}
async function blobURL(id){
  if(id.startsWith('image:'))return '/api/dojo/illustrated/assets?id='+encodeURIComponent(id.slice(6));
  if(id.startsWith('media:'))return api+'/media?id='+encodeURIComponent(id.slice(6));
  return '';
}
function hydrate(){document.querySelectorAll('[data-blob]').forEach(async el=>{try{const u=await blobURL(el.dataset.blob);if(u&&el.isConnected&&el.getAttribute('src')!==u)el.src=u}catch{el.setAttribute('aria-label','檔案暫時無法讀取')}})}
function changeForm(e){const el=e.target;if(el.type==='file')return;if(['progressFilter','topicFilter','seriesFilter'].includes(el.id)){if(e.type==='change'){if(el.id==='seriesFilter')seriesFilter=el.value;else if(el.id==='topicFilter')topicFilter=el.value;else progressFilter=el.value;render()}return}
if(el.dataset.w||el.dataset.u){const w=current();if(!w)return;const key=el.dataset.w||el.dataset.u;const target=el.dataset.w?w:w.units[w.cursor];const v=el.type==='checkbox'?el.checked:el.value;if(target[key]===v)return;target[key]=v;if(el.dataset.u)target.ok=false;w.review=false;keep(w);if(['layout','frame','tone'].includes(key))render();else updatePreview();return}
const d=el.dataset;if(d.r||d.floor!==undefined){const r=state.pubs.find(p=>p.id===args[0]);if(d.r)r[d.r]=el.value;else{r.parts[Number(d.floor)]=el.value;r.copied[Number(d.floor)]=false}save()}
}
document.addEventListener('input',changeForm);document.addEventListener('change',async e=>{const el=e.target;changeForm(e);if(!['unitImage','uploadMedia'].includes(el.id)||!el.files?.[0])return;const file=el.files[0],w=current(),u=w.units[w.cursor];try{const id=await putBlob(file);if(el.id==='unitImage'){u.image=id;u.ok=false}else{w.media=id;w.mediaName=file.name;w.listened=false}w.review=false;keep(w);render();toast('檔案已帶入這份稿件')}catch(e){toast(e.message||'檔案未能上傳，請再試一次。')}});
function readDate(){const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')}
function actionable(w){if(w.type==='text')return !!w.body.trim();if(['film','audio'].includes(w.type))return !!(w.media&&w.listened);return w.units.every(x=>(x.heading.trim()||x.body.trim()||x.image)&&x.ok)}
function invalidate(w){w.review=false;keep(w);render()}
function contents(v){return v.data.body||v.data.units.map(u=>[u.heading,u.body].filter(Boolean).join('\n')).filter(Boolean).join('\n\n')}
function entryDialog(label,button,action,params=[],initial='',hint=''){modal(label,(hint?'<p>'+esc(hint)+'</p>':'')+field(label,'dialogValue',initial,true)+btn(button,action,params,'primary'))}
function closeRefresh(msg){$('dialog').close();render();if(msg)toast(msg)}
function assignment(w,sh=w.shuttle,di=w.direction,n=w.understanding?.n){const s=findS(sh),d=s?.dirs.find(x=>x.id===di);const sel=(id,label,choices,selected)=>'<label class="field">'+label+'<select id="'+id+'">'+choices.map(([v,t])=>'<option value="'+esc(v)+'" '+(String(v)===String(selected)?'selected':'')+'>'+esc(t)+'</option>').join('')+'</select></label>';modal('整理歸屬',sel('assignedSh','所屬織光杼',[['','尚未歸杼'],...state.shuttles.map(s=>[s.id,s.title])],sh)+(s?sel('assignedDir','方向',[['','暫不採用方向'],...s.dirs.map(d=>[d.id,d.name])],di):'')+(d?sel('assignedV','採用的理解版本',d.vs.map((v,i)=>[i+1,'V'+(i+1)+' · '+v]),n||d.vs.length):'')+btn('保存歸屬','assign',[w.id],'primary'))}
document.addEventListener('change',e=>{if(e.target.id==='assignedSh')assignment(current(),e.target.value,'',null);if(e.target.id==='assignedDir')assignment(current(),val('assignedSh'),e.target.value,null)});
let recordPending=false;
async function startRecording(w){if(rec?.state==='recording'){rec.stop();return}if(recordPending)return;if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){toast('此瀏覽器無法直接錄音，可直接帶入音檔。');return}recordPending=true;let stream;try{stream=await navigator.mediaDevices.getUserMedia({audio:true});if(current()!==w){stream.getTracks().forEach(t=>t.stop());return}const device=new MediaRecorder(stream),parts=[];rec=device;device.ondataavailable=e=>{if(e.data.size)parts.push(e.data)};device.onstop=async()=>{stream.getTracks().forEach(t=>t.stop());try{w.media=await putBlob(new Blob(parts,{type:device.mimeType}));w.mediaName='本次試錄';w.listened=false;keep(w);render();toast('錄音已保存，可試聽')}catch{toast('錄音未能保存，請帶入檔案')}rec=null};device.start();render();toast('錄音中，完成後請按停止')}catch{stream?.getTracks().forEach(t=>t.stop());toast('未能開啟麥克風，可帶入音檔或用示例')}finally{recordPending=false}}
async function copyText(text){try{await navigator.clipboard.writeText(text);return true}catch{const t=document.createElement('textarea');t.value=text;document.body.append(t);t.select();let ok=false;try{ok=document.execCommand('copy')}catch{}t.remove();return ok}}
function outputs(id,n) {
 const w=findW(id),v=version(w,n);
 if(!v)return;
 modal('管理 V'+n+' 的輸出',(v.outputs||[]).map(o=>'<div class="entry"><b>'+esc(o.name)+'</b><p>'+esc(o.note)+'</p></div>').join('')+tip('同一剪輯可保存數個畫幅、字幕或尺寸的輸出紀錄。需要重新剪輯和獨立審片，可從定稿另做改編。')+field('輸出名稱（例如 直式中文字幕）','outputName')+field('畫幅、字幕或檔案名稱','outputNote')+btn('保存本版輸出紀錄','saveOutput',[id,n],'primary'));
}
function outputPicker(v){return v.outputs?.length?'<label class="field">這次使用的輸出<select id="pubOutput"><option value="">定稿原版</option>'+v.outputs.map(o=>'<option value="'+esc(o.id)+'">'+esc(o.name)+'</option>').join('')+'</select></label>':'';}
function platformModal(w,n){modal('選擇發布目的地','<p>'+esc(version(w,n)?.data.title||nameW(w))+' · V'+n+'</p>'+outputPicker(version(w,n))+CHANNELS.map(ch=>'<label class="checkline"><input type="checkbox" name="channel" value="'+esc(ch)+'">'+esc(ch)+'</label>').join('')+btn('建立或開啟平台稿','makePubs',[w.id,n],'primary'))}
function storyPlay(w){let i=0;const frames=w.units.filter(u=>u.heading||u.body||u.image);if(!frames.length){toast('先留下一個鏡頭的畫面或動作');return}const draw=()=>{if(!$('dialog').open){clearInterval(activePlay);return}const box=$('playFrame');if(!box)return;box.innerHTML=previewUnit(w,frames[i]);box.firstChild.classList.add('play');$('frameCount').textContent='鏡頭 '+(i+1)+'／'+frames.length;hydrate()};modal('分鏡試播','<div id="playFrame"></div><p id="frameCount"></p><div class="actions">'+btn('暫停／播放','togglePlay',[w.id])+'</div><small>此處以分鏡示意順序與節奏。成片另行匯入核對。</small>');draw();if(activePlay)clearInterval(activePlay);const step=()=>{if(i===frames.length-1&&!w.loop){clearInterval(activePlay);activePlay=null;return}i=(i+1)%frames.length;draw()};activePlay=setInterval(step,1500)}
$('dialog').addEventListener('close',()=>{clearInterval(activePlay);activePlay=null});
const handlers={
 filter:k=>{filter=k;render()},clearFilter:()=>{filter=progressFilter=topicFilter=seriesFilter='全部';render()},tab:showWorkTab,
 studioBack:()=>window.history.back(),
 reviewResume:id=>{
   const w=findW(id);if(!w)return;const gap=reviewGap(w);
   if(gap.cursor>=0){w.cursor=gap.cursor;save();}
   wk=id;showWorkTab('製作');
   const field=$(gap.field);field?.focus({preventScroll:true});field?.scrollIntoView({block:'center'});
 },
 go:to=>go(to),close:()=>$('dialog').close(),new:t=>{const w=newWork(t);go('edit/'+w.id)},
 keep:()=>{const w=current();keep(w);updatePreview();toast('草稿已保存')},mode:m=>{const w=current();if(w.mode===m)return;w.mode=m;if(m.includes('Reels'))w.frame='直式';if(m==='四格漫畫')while(w.units.length<4)w.units.push(unit());invalidate(w)},
 addUnit:()=>{const w=current();w.units.push(unit());w.cursor=w.units.length-1;invalidate(w)},unit:i=>{const w=current();w.cursor=i;if(state.works.includes(w))save();render()},unitOK:()=>{const w=current(),u=w.units[w.cursor];if(!u.heading.trim()&&!u.body.trim()&&!u.image){toast('先留下內容再確認');return}u.ok=!u.ok;invalidate(w)},moveUnit:n=>{const w=current(),i=w.cursor,j=i+n;if(j<0||j>=w.units.length)return;[w.units[i],w.units[j]]=[w.units[j],w.units[i]];w.cursor=j;invalidate(w)},
 record:()=>startRecording(current()),listen:()=>{const w=current();w.listened=true;keep(w);render();toast('已記下本版核對')},storyPlay:()=>storyPlay(current()),togglePlay:()=>{if(activePlay){clearInterval(activePlay);activePlay=null;$('playFrame')?.firstChild?.classList.remove('play')}else storyPlay(current())},
 research:()=>{const w=current(),q=val('rq'),s=val('rs');if(!q||!s){toast('請填原句或問題，並留下來源或待查處');return}w.research.push({q,s,use:val('ruse')});keep(w);render();toast('已保存研究判斷，正文照原稿')},compare:()=>{const w=current();if(!w.candidate.trim()){toast('先貼入候選文字');return}modal('比較候選與正文','<h3>目前正文</h3><pre>'+esc(w.body)+'</pre><h3>候選文字</h3><pre>'+esc(w.candidate)+'</pre>'+btn('採用候選為目前工作稿','adoptCandidate',[],'primary'))},adoptCandidate:()=>{const w=current();w.body=w.candidate;w.review=false;keep(w);closeRefresh('已採用到此件工作稿')},
 toReview:()=>{const w=current();if(!w.body.trim()&&!w.media&&!w.units.some(u=>u.heading||u.body||u.image)){toast('先準備可確認的內容');return}w.review=true;keep(w);render()},finalize:()=>{const w=current();if(w.versions.length&&stateOf(w)==='已定稿'){toast('目前內容已經定稿');return}if(!actionable(w)){toast(w.type==='text'?'先寫下正文':['audio','film'].includes(w.type)?'請帶入媒體並試聽／試播，再確認檔案':'請在製作頁逐頁或逐格確認內容');return}modal('固定目前這一版','<p>將保存現在的內容與來源。之後可繼續修訂，這個版本可獨立交付。</p>'+btn('確認定稿 V'+(w.versions.length+1),'confirmVersion',[],'primary'))},confirmVersion:()=>{const w=current();if(!w.title.trim())w.title='未命名'+TYPES[w.type].name;const v=snapshot(w);w.versions.push(v);w.review=false;keep(w);closeRefresh('已定稿 V'+v.n)},
 seeVer:(id,n)=>{const w=findW(id),v=version(w,n);if(v){modal((v.data.title||nameW(w))+' · V'+n,displaySnap(v.data));hydrate()}},
 send:(id,n)=>{const w=findW(id);if(!version(w,n))return;if(!state.inbox.some(i=>i.id===id&&i.n===n))state.inbox.push({id,n});save();go('publish');toast('聊解室已收到指定的 V'+n)},
 derive:(id,n)=>{const w=findW(id);if(!version(w,n))return;modal('從固定版另做一件','<p>來源 '+esc(version(w,n)?.data.title||nameW(w))+' · V'+n+'</p><div class="chips">'+Object.keys(TYPES).map(k=>btn(TYPES[k].action,'doDerive',[id,n,k])).join('')+'</div>')},
 doDerive:(id,n,k)=>{const base=findW(id),v=version(base,n),w=newWork(k,null,{id,n,title:v.data.title});w.title=(v.data.title||nameW(base))+'｜'+TYPES[k].name;const text=contents(v);if(k==='text'||k==='audio')w.body=text;else{w.units=(text.split(/\n\s*\n/).filter(Boolean).slice(0,30).map(x=>({...unit(),heading:x.split('\n')[0],body:x.split('\n').slice(1).join('\n')})));if(!w.units.length)w.units=[unit()]}if(v.data.mode==='Podcast 單集'&&k==='film'){w.episode=v.data.episode||v.data.title;w.mode='分章長片';w.title=(v.data.title||nameW(base))+'｜影像版'}keep(w);go('edit/'+w.id);toast('已建立衍生作品並連回固定版本')},
 addShuttle:()=>entryDialog('織光杼名稱','建立織光杼','createShuttle'),createShuttle:()=>{const t=val('dialogValue');if(!t){toast('請輸入杼名');return}const s={id:uid(),title:t,core:'',dirs:[],notes:[]};state.shuttles.unshift(s);save();go('shuttle/'+s.id)},
 core:id=>entryDialog('目前核心理解','保存','saveCore',[id],findS(id).core),saveCore:id=>{findS(id).core=val('dialogValue');save();closeRefresh('已保存核心理解')},
 direction:id=>modal('保留新方向',field('要從哪個問題切入？','dirName')+field('目前理解（可稍後追加）','dirV','',true)+btn('保存此方向','saveDir',[id],'primary')),saveDir:id=>{const t=val('dirName');if(!t){toast('請填方向');return}const first=val('dirV');findS(id).dirs.push({id:uid(),name:t,vs:first?[first]:[]});save();closeRefresh('已保留方向')},newUnderstanding:(id,d)=>entryDialog('新的理解','追加此版理解','saveUnderstanding',[id,d]),saveUnderstanding:(id,d)=>{if(!val('dialogValue')){toast('請填目前理解');return}findS(id).dirs.find(x=>x.id===d).vs.push(val('dialogValue'));save();closeRefresh('已追加理解，舊作品仍指向採用時的版本')},
 linkPick:id=>assignment(findW(id)),assign:id=>{const w=findW(id),s=findS(val('assignedSh')),d=s?.dirs.find(x=>x.id===val('assignedDir')),n=Number(val('assignedV'));if(d&&!d.vs[n-1]){toast('此方向尚無理解版本，可先只歸杼或回該方向追加理解');return}const old={shuttle:w.shuttle,direction:w.direction,understanding:w.understanding,updated:w.updated};const wasDraft=!state.works.includes(w);w.shuttle=s?.id||'';w.direction=d?.id||'';w.understanding=d?{n,text:d.vs[n-1]}:null;keep(w);if(!storageOK){Object.assign(w,old);if(wasDraft){state.works=state.works.filter(x=>x.id!==w.id);drafts[w.id]=w}toast('未能保存，保留原先歸屬。請稍後重試');return}closeRefresh('已保存作品歸屬')},
 reflect:id=>entryDialog('作品帶回的心得','回到原杼保存','reflectSave',[id]),reflectSave:id=>{const w=findW(id),s=findS(w.shuttle);if(!val('dialogValue')){toast('請填心得');return}s.notes.push({title:nameW(w),work:id,text:val('dialogValue')});save();go('shuttle/'+s.id)},
 outputs,saveOutput:(id,n)=>{const v=version(findW(id),n),name=val('outputName'),note=val('outputNote');if(!name){toast('請填輸出名稱');return}v.outputs=v.outputs||[];if(v.outputs.some(o=>o.name===name)){toast('這個輸出名稱已存在');return}v.outputs.push({id:uid(),name,note});save();outputs(id,n);toast('已加入這個固定版的輸出紀錄')},
 channel:(id,n)=>platformModal(findW(id),n),makePubs:(id,n)=>{const w=findW(id),v=version(w,n),channels=[...document.querySelectorAll('[name=channel]:checked')].map(x=>x.value);if(!channels.length){toast('請選擇至少一個目的地');return}let first;const selected=(v.outputs||[]).find(o=>o.id===val('pubOutput'))||null;for(const ch of channels){let r=state.pubs.find(r=>r.work===id&&r.n===n&&r.channel===ch);if(!r){let base=contents(v);r={id:uid(),work:id,n,channel:ch,title:v.data.title||nameW(w),caption:base,parts:base.split(/\n\s*\n/).filter(Boolean),copied:[],status:'準備中',schedule:'',released:'',link:'',response:''};if(!r.parts.length)r.parts=[''];state.pubs.unshift(r)}if(selected&&r.status==='準備中')r.output={id:selected.id,name:selected.name};if(!first)first=r}state.inbox=state.inbox.filter(i=>!(i.id===id&&i.n===n));save();go(channels.length===1?'release/'+first.id:'publish');toast('已準備 '+channels.length+' 個目的地的工作稿')},
 saveRelease:()=>{save();toast('平台稿已保存')},scheduled:()=>{const r=state.pubs.find(p=>p.id===args[0]);if(!r.schedule){toast('請先填安排日期');return}r.status='已安排';save();render()},published:()=>{const r=state.pubs.find(p=>p.id===args[0]);r.status='已發表';if(!r.released)r.released=readDate();save();render();toast('已保存模擬發布紀錄')},
 addFloor:()=>{const r=state.pubs.find(p=>p.id===args[0]);r.parts.push('');save();render()},splitFloor:()=>{const r=state.pubs.find(p=>p.id===args[0]);r.parts=r.parts.join('\n\n').split(/\n\s*\n/).filter(Boolean);if(!r.parts.length)r.parts=[''];r.copied=[];save();render()},copyFloor:async i=>{const r=state.pubs.find(p=>p.id===args[0]);if(await copyText(r.parts[i])){r.copied[i]=true;save();render();toast('已複製，實際發布可稍後確認')}else modal('請長按複製',field('本樓文字','manualCopy',r.parts[i],true))},
};
document.addEventListener('click',async e=>{const el=e.target.closest('[data-act]');if(!el)return;const fn=handlers[el.dataset.act];if(fn)try{await fn(...JSON.parse(el.dataset.args||'[]'))}catch(err){console.error(err);toast('操作未完成，請重試。')}});
