'use strict';

/* 每一種成品都走同一條路：文字稿 → 文字分鏡 → 成品製作。
   文字稿是定稿過的文字作品；分鏡沿用各形式原有的頁、格、鏡編輯；成品製作逐一產生可帶去製作工具的指令。 */

const STEP_UNIT={page:'頁',comic:'格',film:'鏡',audio:'段'};
/* 給製作工具的固定說明。製作工具確定後，把對應的說明換進這裡或在作品上改寫。 */
const PRODUCTION_BRIEF={
  page:'請依下列內容製作這一頁圖文的配圖。只畫圖，不要在圖上加任何文字；文字由我另外排版。',
  comic:'請依下列內容畫出這一格漫畫。角色造型必須和「角色或固定元素」一致。對白不要畫進圖裡，我會另外上字。',
  film:'請依下列內容製作這一個鏡頭的畫面素材。字幕與配音不要做進畫面，我會在剪輯時另外加。'
};
const stepUnit=w=>w.type==='film'&&w.mode==='分章長片'?'章':STEP_UNIT[w.type];
const hasStages=w=>!!w&&!w.shelf&&['page','comic','film'].includes(w.type);
const productionOf=w=>w.production||={style:'',cast:'',size:'',brief:''};

function scriptCardBlock(w) {
  if(!draftCardIds(w).length)return '';
  const text=draftPrompt(w,'skeleton'), a=text.indexOf('【我的卡片】'), b=text.indexOf('【正文目前的內容】');
  return text.slice(a,b).trim();
}

/* ---------- 起點：非文字的成品一律先選一份文字稿 ---------- */
function scriptSources() {
  return listedWorks().filter(w=>w.type==='text').sort((a,b)=>b.updated-a.updated);
}
function scriptSourcePicker(type) {
  const texts=scriptSources(), fixed=texts.filter(w=>w.versions.length), open=texts.filter(w=>!w.versions.length&&w.body.trim());
  const name=TYPES[type].name;
  modal('做'+name+'，先選一份文字稿',
    '<p>每一種成品都從文字稿開始，再排文字分鏡，最後製作成品。</p>'+
    (fixed.length?'<h3>已定稿的文字稿</h3>'+fixed.map(w=>{const v=w.versions.at(-1);
      return '<div class="entry"><b>'+esc(v.data.title||nameW(w))+'</b><p>V'+v.n+(findS(w.shuttle)?' · '+esc(findS(w.shuttle).title):'')+'</p>'+
        btn('用這份文字稿做'+name,'startFromScript',[w.id,v.n,type],'primary')+'</div>';}).join(''):'<p>還沒有定稿的文字稿。</p>')+
    (open.length?'<h3>還沒定稿的文字稿</h3>'+open.map(w=>'<div class="entry"><b>'+esc(nameW(w))+'</b><p>定稿後才能拿來排分鏡。</p>'+
      btn('先去定稿','continueWork',[w.id],'light')+'</div>').join(''):'')+
    '<div class="actions">'+btn('先寫一份文字稿','scriptWriteFirst',[])+'</div>');
}

/* ---------- 三個步驟的指示列 ---------- */
function stageBar(w) {
  const base=w.source&&findW(w.source.id), n=stepUnit(w);
  const confirmed=w.units.filter(u=>u.ok).length, made=w.units.filter(u=>u.made).length, total=w.units.length;
  const stage=(label,note,state,action)=>'<button type="button" class="stage is-'+state+'"'+action+'><b>'+esc(label)+'</b><small>'+esc(note)+'</small></button>';
  return '<nav class="stage-bar" aria-label="製作步驟">'+
    stage('文字稿',base?(w.source.title||nameW(base))+' · V'+w.source.n:'這件作品沒有連到文字稿',base?'done':'missing',base?act('go','edit/'+base.id):act('scriptAttach',w.id))+
    stage('文字分鏡','已確認 '+confirmed+'／'+total+' '+n,confirmed===total?'done':'now',act('stageJump','work-sheet'))+
    stage('成品製作','已完成 '+made+'／'+total+' '+n,made===total&&total?'done':confirmed?'now':'wait',act('stageJump','production'))+'</nav>';
}

/* ---------- 第三步：逐一產生製作指令 ---------- */
function unitBrief(w,j) {
  const u=w.units[j], p=productionOf(w), n=stepUnit(w), spec=mediaBSpec(w), L=[];
  L.push(p.brief||PRODUCTION_BRIEF[w.type]);
  L.push('');
  L.push('【'+(w.title||nameW(w))+'｜第 '+(j+1)+'／'+w.units.length+' '+n+'】');
  if(p.size)L.push('尺寸與比例：'+p.size);
  else if(w.type==='film')L.push('畫幅：'+w.frame);
  if(p.style)L.push('風格與畫面語言：'+p.style);
  if(p.cast)L.push('角色或固定元素：'+p.cast);
  L.push('');
  const label={page:['頁面標題','頁面文字'],comic:['場景與動作','對白或旁白'],film:['起始畫面','動作與結束狀態']}[w.type];
  if(u.heading)L.push(label[0]+'：'+u.heading);
  if(u.speaker)L.push('角色／說話者：'+u.speaker);
  if(u.body)L.push(label[1]+'：'+u.body);
  for(const k of ['goal','expression','visual','spoken','caption','sound','duration','transition'])
    if(typeof u[k]==='string'&&u[k].trim())L.push((spec.fields[k]||k)+'：'+u[k].trim());
  if(w.type==='page')L.push('版型：'+u.layout+'；用色：'+u.tone);
  if(w.type==='film'&&u.technique&&u.technique!=='未指定')L.push('製作手法：'+u.technique);
  return L.join('\n');
}
function productionPanel(w) {
  const p=productionOf(w), n=stepUnit(w), any=w.units.some(u=>u.ok);
  const setting=(label,key,hint)=>'<label class="field">'+esc(label)+'<textarea rows="2" data-production="'+key+'" placeholder="'+esc(hint)+'">'+esc(p[key])+'</textarea></label>';
  const cards=w.units.map((u,j)=>{
    const empty=!u.heading.trim()&&!u.body.trim();
    return '<article class="production-unit'+(u.made?' is-made':'')+'"><div class="production-meta"><b>第 '+(j+1)+' '+n+'</b>'+
      '<span class="'+(u.ok?'is-ok':'is-wait')+'">'+(u.ok?'分鏡已確認':'分鏡尚未確認')+'</span>'+(u.image?'<span class="is-ok">已放回圖片</span>':'')+(u.made?'<span class="is-ok">成品完成</span>':'')+'</div>'+
      (empty?'<p>這一'+n+'還沒有內容，先回上方排好分鏡。</p>':
        '<pre id="brief'+j+'">'+esc(unitBrief(w,j))+'</pre><div class="actions">'+btn('複製這一'+n+'的製作指令','briefCopy',[j],'light')+
        btn('到上方放回成品圖','unit',[j],'tiny')+btn(u.made?'改回未完成':'標記成品完成','unitMade',[j],'tiny')+'</div>')+'</article>';
  }).join('');
  return '<section class="panel production-panel" id="production"><div class="sectionhead"><h2>成品製作</h2></div>'+
    '<p>分鏡確認後，把每一'+n+'的製作指令帶去你的製作工具，做好的成品再放回對應的那一'+n+'。</p>'+
    more('全篇共用的設定',setting('風格與畫面語言','style','例如：手繪水彩、低彩度、留白多')+
      setting('角色或固定元素','cast','每一'+n+'都要保持一致的角色造型、物件或場景')+
      setting('尺寸與比例','size','例如：1080×1350、直式 9:16')+
      setting('給製作工具的固定說明','brief',PRODUCTION_BRIEF[w.type]))+
    (any?'':'<p class="statusline">還沒有確認任何一'+n+'的分鏡。指令可以先看，建議分鏡確認後再製作。</p>')+
    '<div class="production-list" id="productionList">'+cards+'</div>'+
    '<div class="actions">'+btn('複製全部製作指令','briefCopyAll',[],'primary')+'</div></section>';
}
function nextFromScript(w) {
  const v=w.versions.at(-1);
  if(!v)return '';
  return '<section class="panel next-forms"><div class="sectionhead"><h2>用這份文字稿做成品</h2></div><p>以 V'+v.n+' 為文字稿，接著排文字分鏡。</p><div class="chips">'+
    ['page','comic','film','audio'].map(k=>btn(TYPES[k].action,'startFromScript',[w.id,v.n,k])).join('')+'</div></section>';
}

/* ---------- 接到原有的編輯畫面 ---------- */
const baseEditor=editor;
editor=function(w){
  const html=baseEditor(w);
  if(!w||w.shelf)return html;
  if(w.type==='text')return tab==='預覽與定稿'?html+nextFromScript(w):html;
  if(!hasStages(w))return html;
  const withBar=html.replace('<nav class="tabs work-tabs"',stageBar(w)+'<nav class="tabs work-tabs"');
  return tab==='製作'&&findS(w.shuttle)?withBar+productionPanel(w):withBar;
};
const basePrompt=mediaBPrompt;
mediaBPrompt=function(r){
  const w=findW(r.meta?.work_id), cards=w?scriptCardBlock(w):'';
  if(!cards)return basePrompt(r);
  return basePrompt(r)+'\n\n'+cards+'\n\n卡片的使用規則：引用卡片內容時必須逐字；每個製作單位如果用到卡片，在製作備註裡寫出卡片編號、出處與由來，照上面的記載抄寫，不得省略或改寫。標示為「GPT 延伸」的卡片不是我的話。';
};

const baseNew=handlers.new;
Object.assign(handlers,{
  new:type=>{if(type==='text'||!TYPES[type])baseNew(type);else scriptSourcePicker(type);},
  scriptWriteFirst:()=>{$('dialog').close();baseNew('text');},
  startFromScript:(sourceId,n,type)=>{
    const base=findW(sourceId);
    if(!version(base,n)||!TYPES[type])return;
    if($('dialog').open)$('dialog').close();
    const sid=base.shuttle;
    if(!findS(sid)){beginShuttleMatch({type,kind:'derive',sourceId,n});return;}
    // The 文字稿 already belongs to a 杼, so the new piece starts on the same one without asking again.
    const m={type,kind:'derive',sourceId,n,id:uid(),signature:JSON.stringify({type,kind:'derive',sourceId,n,at:Date.now()})};
    shuttleMatches()[m.id]=m;
    confirmMatch(m.id,sid,base.direction||'',base.understanding?.n||0);
    const w=findW(m.done);
    if(w&&base.cardIds?.length){w.cardIds=[...base.cardIds];keep(w);}
  },
  scriptAttach:id=>{const w=findW(id);if(w)toast('這件作品是直接開始的，沒有文字稿。之後的新作品會從文字稿出發。');},
  stageJump:target=>{
    const el=target==='production'?$('production'):document.querySelector('.work-sheet');
    if(el)el.scrollIntoView({behavior:'smooth',block:'start'});
    else showWorkTab('製作');
  },
  briefCopy:async j=>{
    const w=current();
    if(!w||!w.units[j])return;
    if(await copyText(unitBrief(w,j)))toast('已複製第 '+(j+1)+' '+stepUnit(w)+'的製作指令');
    else toast('請長按上方文字手動複製');
  },
  briefCopyAll:async()=>{
    const w=current();
    if(!w)return;
    const all=w.units.map((u,j)=>(u.heading.trim()||u.body.trim())?unitBrief(w,j):'').filter(Boolean).join('\n\n────────\n\n');
    if(!all){toast('還沒有可以製作的內容');return;}
    if(await copyText(all))toast('已複製全部製作指令');else toast('請逐一複製');
  },
  unitMade:j=>{
    const w=current(), u=w?.units[j];
    if(!u)return;
    u.made=!u.made;keep(w);render();
    $('production')?.scrollIntoView({block:'nearest'});
  }
});
let productionTimer;
document.addEventListener('input',e=>{
  const key=e.target.dataset?.production, w=current();
  if(!key||!w)return;
  productionOf(w)[key]=e.target.value;keep(w);
  // Briefs follow the shared settings once typing pauses; the fields being typed in are left alone.
  clearTimeout(productionTimer);
  productionTimer=setTimeout(()=>{w.units.forEach((u,j)=>{const pre=$('brief'+j);if(pre)pre.textContent=unitBrief(w,j);});},500);
});
