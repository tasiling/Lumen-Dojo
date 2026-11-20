'use strict';

// B shapes a confirmed intent into the editable production units of each medium.
const mediaBForms = {
  page: {name:'逐頁圖文稿', unit:'頁', target:'圖文編排',
    fields:{goal:'本頁要傳達什麼',heading:'上版標題',body:'上版內文',visual:'圖片與版面指示',transition:'接到下一頁的方式'},
    rule:'每頁清楚交代讀者要取得什麼。以可直接上版的標題與正文搭配圖片任務，保留每頁之間的連續性。製作備註與讀者看見的文字要分開。單張圖卡可只有一頁。'},
  comic: {name:'漫畫分格腳本',unit:'格',target:'漫畫分鏡',
    fields:{heading:'可畫出的場景與動作',speaker:'角色／說話者',body:'對白或旁白',expression:'表情與肢體',visual:'構圖與視線',transition:'與前後格的轉折'},
    rule:'每格給畫者一個可實現的瞬間。交代場景、角色動作、表情、構圖與視線，將對白或旁白獨立成欄，無字格留白。保留前後格之間的事件轉折。指定四格時寫四格。'},
  film: {name:'影片分鏡腳本',unit:'鏡',target:'影片分鏡',
    fields:{heading:'起始畫面',body:'動作與結束狀態',spoken:'口播／配音',caption:'字幕',sound:'環境聲與音軌',duration:'建議時長',transition:'轉場／接回首鏡'},
    rule:'每鏡交代起始狀態、畫面中哪個元素如何動、停在哪裡、持續多久及如何接下一鏡。字幕、配音及音軌各留一欄，留白表示無聲或無字幕。循環影片要寫首尾接點，以及暫停時能讀清的畫面。'},
  audio: {name:'分段聲音腳本',unit:'段',target:'錄音工作區',
    fields:{heading:'段落名稱',goal:'本段目的',spoken:'實際口播',question:'主持人主問',followup:'可選追問',transition:'轉場',sound:'聲音、停頓與錄音提示'},
    rule:'依選定的錄製方式安排段落。獨白提供可直接錄的口播，與停頓、聲音提示分欄。訪談提供段落目的、主持人主問、可選追問及轉場，來賓回答留給實際錄製。'}
};


function mediaBSpec(w) {
  const base=mediaBForms[w.type];
  if(w.type==='film'&&w.mode==='分章長片')return {...base,name:'長片章節腳本',unit:'章',target:'長片章節',fields:{...base.fields,heading:'章節名稱',body:'章內鏡頭與動作'},rule:base.rule+' 先排章節與敘事任務，在每章 body 依先後列出具體鏡頭和動作；全片長度可彈性規劃。'};
  if(w.type==='film'&&w.mode==='Motion 小動畫')return {...base,name:'Motion 分鏡腳本'};
  return base;
}
function mediaBCurrentSource(w) {
  const printed=(w.units||[]).map(u=>[u.heading,u.body].filter(Boolean).join('｜')).filter(Boolean).join('\n');
  return [w.body,printed].filter(Boolean).join('\n\n');
}
function mediaBContext(w) {
  return JSON.stringify([w.title,w.mode,w.frame,w.loop,w.shuttle,w.direction,w.understanding,w.media,w.duration,w.use,w.episode,w.source,w.versions.length,w.body,w.units]);
}
const mediaBTrim = value=>typeof value==='string'?value.trim():'';
const mediaBRounds = w=>w.mediaBRounds||[];
const mediaBRun = (w,id)=>mediaBRounds(w).find(r=>r.id===id);
function mediaBInput(w) {
  if(!w.bMediaInput)w.bMediaInput={source:mediaBCurrentSource(w),intent:mediaBTrim(w.intent),research:'',audioMode:w.mode==='Podcast 單集'?'訪談':'獨白／引導'};
  return w.bMediaInput;
}
function openMediaB(w) {
  if(!w||!mediaBForms[w.type])return;
  const spec=mediaBSpec(w), data=mediaBInput(w), history=mediaBRounds(w).slice().reverse();
  let html=workMaterialPicker(w)+pick('本件起稿方式','mbMode',TYPES[w.type].modes,w.mode,'data-mb-mode="1"')+field('這次要製作的想法、訪談回答或底稿','mbSource',data.source,true,'data-mb-input="source"')+
    field('我確認的本件創作意圖','mbIntent',data.intent||mediaBTrim(w.intent),true,'data-mb-input="intent"');
  if(mediaBCurrentSource(w)&&data.source!==mediaBCurrentSource(w))html+=btn('帶入目前工作稿','mbUseCurrent',[w.id],'tiny');
  if(w.intent&&data.intent!==w.intent)html+=btn('帶入最近確認的作品意圖','mbUseIntent',[w.id],'tiny');
  if(w.type==='audio')html+=pick('錄製方式','mbAudioMode',['獨白／引導','訪談'],data.audioMode,'data-mb-input="audioMode"');
  html+=more('指定理論或研究用途（選填）',field('希望採用的理論、已知來源或查證界線','mbTheory',data.research,true,'data-mb-input="research"'))+
    '<div class="actions">'+btn('確認意圖並準備指令','mbStart',[w.id],'primary')+'</div>';
  if(history.length)html+=more('本件協作紀錄（'+history.length+'）',history.map(r=>row(r.meta.form+' · 第 '+r.index+' 輪',r.adopted?'已採用':r.candidate?'候選待核對':'等待回填','book','mbResume',[w.id,r.id])).join(''));
  modal('B｜'+spec.name,html);
}
function mediaBStart(w) {
  const data={source:val('mbSource'),intent:val('mbIntent'),research:val('mbTheory'),audioMode:val('mbAudioMode')};
  if(!data.source||!data.intent){toast('請填本輪想法與你確認的意圖');return}
  const spec=mediaBSpec(w), index=mediaBRounds(w).length+1,id=uid();
  const {source,intent}=data;
  w.bMediaInput=data;w.intent=intent;
  const r={id,index,source,intent,research:data.research,audioMode:data.audioMode,
    type:w.type,mode:w.mode,loop:w.loop,frame:w.frame,duration:w.duration,use:w.use,context:mediaBContext(w),spec:structuredClone(spec),
    meta:{work_id:w.id,round_id:id,source_version:'稿件快照 '+index,form:spec.name},raw:'',candidate:null};
  if(!w.mediaBRounds)w.mediaBRounds=[];
  w.mediaBRounds.push(r);
  keep(w);mediaBDialog(w,r);
}
function mediaBSchema(r) {
  const unitShape=Object.fromEntries(Object.entries(r.spec.fields).map(([k,v])=>[k,v]));
  return {...r.meta,research:[{name:'理論或研究名稱',mechanism:'一句話機制',relevance:'與本件意圖的關聯',placement:'適合放在哪個製作單位，或僅作背景',source:'可追查來源；未知註記待查'}],units:[unitShape]};
}
function mediaBPrompt(r) {
  return [
    '以繁體中文，依序擔任資料研究員、'+r.spec.name+'撰稿者。原話、創作提案及仍待查核的資料須可區分。',
    '第一步依已確認意圖找 3–5 個能解釋主線機制的理論候選，分別列名稱、機制、與主線關係、建議使用位置和可查來源。若資料不足，清楚註明待查。本人指定理論時優先使用，否則選 1–2 個並在用途交代理由。做背景研究時讓理論留在 research。請勿虛構引文或來源。',
    '第二步根據原始想法、已確認的意圖及合適的理論，產出能交給製作工具的腳本。保留作者觀點和語氣。新構想的畫面或人物動作是創作提案，不當成本人曾發生的事；依視聽形式決定節奏和單位數量。',
    r.spec.rule,
    '本輪形式：'+r.mode+'。'+(r.type==='film'?'畫幅：'+r.frame+'；循環：'+(r.loop?'是':'否')+'；預計片長：'+(r.duration||'未指定')+'；用途：'+(r.use||'未指定'):'')+(r.type==='audio'?' 錄製方式：'+r.audioMode:''),
    '原始想法：\n'+r.source,'本人確認的意圖：\n'+r.intent,'既有理論與用途：\n'+(r.research||'由研究員提出候選'),
    '請只回傳一個 JSON 物件。原樣保留 work_id、round_id、source_version、form。每個製作單位使用下列欄位，不適用的欄位填空字串。research 可誠實回傳空陣列並留待補充。格式：',
    JSON.stringify(mediaBSchema(r),null,2)
  ].join('\n\n');
}
function mediaBParse(r,raw) {
  let obj;try{obj=JSON.parse(raw.trim().replace(/^```(?:json)?\s*|\s*```$/gi,''))}catch{throw Error('無法辨識 JSON，請貼上本輪完整回覆。')}
  if(!obj||Object.entries(r.meta).some(([k,v])=>obj[k]!==v))throw Error('作品、形式、輪次或來源版本不同，請帶回本輪回覆。');
  if(!Array.isArray(obj.units)||!obj.units.length||obj.units.length>120||!Array.isArray(obj.research)||obj.research.length>30)throw Error('請核對 units 與 research 清單。每一輪可核對 1 至 120 個製作單位。');
  const keys=Object.keys(r.spec.fields);
  function strings(item,names){
    if(!item||names.some(k=>typeof item[k]!=='string'))throw Error('回覆缺少對應形式的欄位，請依本輪回傳格式補齊。');
    return Object.fromEntries(names.map(k=>[k,item[k].trim()]));
  }
  const units=obj.units.map(item=>{const u=strings(item,keys);if(!Object.values(u).some(Boolean))throw Error('製作單位缺少內容，請先補上腳本。');return u});
  const research=obj.research.map(item=>strings(item,['name','mechanism','relevance','placement','source']));
  return {units,research,selected:units.map(()=>true),studyUse:research.map(()=>'僅留在本輪')};
}
function mediaBReview(w,r) {
  const c=r.candidate;
  const studies=c.research.map((s,i)=>'<div class="entry"><b>'+esc(s.name)+'</b><p>'+esc(s.mechanism)+'</p><p>'+esc(s.relevance)+'<br>'+esc(s.placement)+'</p><small>'+esc(s.source)+'</small>'+
    pick('研究用途','mbStudy'+i,['僅留在本輪','作者背景','候選入稿','待查證'],c.studyUse[i],'data-mb-study="'+i+'"')+'</div>').join('');
  const units=c.units.map((u,i)=>'<details class="entry" '+(i===0?'open':'')+'><summary>第 '+(i+1)+' '+r.spec.unit+'　'+esc((u.heading||u.goal||'腳本').slice(0,34))+'</summary>'+
    '<label class="checkline"><input type="checkbox" data-mb-select="'+i+'" '+(c.selected[i]?'checked':'')+'>採用這一'+r.spec.unit+'</label>'+
    Object.entries(r.spec.fields).map(([k,label])=>field(label,'mbCandidate'+i+k,u[k],true,'data-mb-unit="'+i+'" data-mb-key="'+k+'"')).join('')+'</details>').join('');
  const changed=r.context!==mediaBContext(w);
  return '<h3>核對候選腳本</h3>'+units+more('研究候選（'+c.research.length+'）',studies||tip('本輪沒有研究候選。'))+
    (changed?tip('工作稿於本輪之後有更新。這批候選仍可追加，原有內容會保留。'):'')+
    '<div class="actions">'+btn('採用勾選項目到'+r.spec.target,'mbAdopt',[w.id,r.id,false],'primary')+
    (!changed&&mediaBHasContent(w)?btn('改為取代現有腳本…','mbReplace',[w.id,r.id]):'')+'</div>';
}
function mediaBDialog(w,r) {
  if(r.adopted){
    modal(r.spec.name+' · 已採用',tip('已採用 '+r.adopted.count+' '+r.spec.unit+'，可回製作區編輯。')+
      more('採用時的意圖與腳本','<p>'+esc(r.intent)+'</p><pre>'+esc(JSON.stringify(r.candidate?.units.filter((_,i)=>r.candidate.selected[i]),null,2))+'</pre>')+
      btn('回製作區','mbExit',[w.id],'primary'));return;
  }
  const prompt=mediaBPrompt(r);
  const exported=packetControls('本輪協作指令','mbPrompt',prompt,'複製協作指令','mbCopy');
  let html='<div data-mb-work="'+esc(w.id)+'" data-mb-round="'+esc(r.id)+'">'+tip(r.mode+' · '+r.meta.source_version+' · '+r.intent);
  if(!r.candidate)html+=exported+field('貼回 GPT 的完整回覆','mbReturn',r.raw,true,'data-mb-raw="1"')+btn('檢查並預覽候選','mbImport',[w.id,r.id],'primary');
  else html+=mediaBReview(w,r)+more('查看本輪指令與原始回覆',exported+'<pre>'+esc(r.raw)+'</pre>');
  modal('B｜'+r.spec.name,html+'</div>');
}
function mediaBHasContent(w) {
  return !!(w.body?.trim()||w.units.some(u=>Object.entries(u).some(([k,v])=>!['layout','tone','ok'].includes(k)&&typeof v==='string'&&v.trim())));
}
function mediaBConvert(r,u,i) {
  const x={...unit(),...u,bRound:r.id,bIndex:i};
  if(r.type==='page')x.layout=i===0?'封面':'引句';
  if(r.type==='film'&&r.mode==='Motion 小動畫')x.technique='Motion';
  return x;
}
function mediaBAudioText(u) {
  return [u.heading,u.spoken,u.question&&'主問　'+u.question,u.followup&&'追問　'+u.followup].filter(Boolean).join('\n');
}
function mediaBApply(w,r,replace) {
  if(!r||r.adopted||!r.candidate)return;
  if(replace&&r.context!==mediaBContext(w)){mediaBDialog(w,r);toast('工作稿已有修改，請重新核對或使用追加');return}
  if(r.mode!==w.mode||r.type!==w.type){toast('作品起稿方式已變更，可切回「'+r.mode+'」採用這一輪');return}
  const c=r.candidate, chosen=c.units.map((v,i)=>({v,i})).filter(({i})=>c.selected[i]);
  if(!chosen.length){toast('請至少勾選一個製作單位');return}
  if(chosen.some(({v})=>!v.heading?.trim()&&!v.body?.trim()&&!v.spoken?.trim()&&!v.question?.trim()&&!v.visual?.trim())){toast('請補齊所選單位的畫面、文字或腳本');return}
  const added=chosen.map(({v,i})=>mediaBConvert(r,v,i));
  const occupied=mediaBHasContent(w), loneBlank=w.units.length===1&&!w.units[0].bRound&&!Object.entries(w.units[0]).some(([k,v])=>!['tone','layout','ok'].includes(k)&&typeof v==='string'&&v.trim());
  const existing=replace||!occupied||loneBlank?[]:w.units.slice();
  r.before={body:w.body,units:structuredClone(w.units),cursor:w.cursor};
  w.units=existing.concat(added);w.cursor=existing.length;
  if(w.type==='audio'){const script=added.map(mediaBAudioText).join('\n\n');w.body=[replace?'':w.body,script].filter(Boolean).join('\n\n')}
  c.research.forEach((x,i)=>{
    if(c.studyUse[i]!=='僅留在本輪')w.research.push({q:x.name,use:c.studyUse[i],s:[x.mechanism,x.relevance,x.placement,x.source].filter(Boolean).join('\n'),bRound:r.id});
  });
  r.adopted={count:added.length,replace:!!replace,time:Date.now()};
  w.review=false;w.listened=false;tab='製作';keep(w);closeRefresh('已帶入 '+added.length+' '+r.spec.unit+'腳本');
}
function mediaBNotes(w) {
  if(!w||!mediaBForms[w.type])return '';
  const studies=(w.research||[]).filter(x=>x.bRound);
  const studyHTML=studies.length?more('本件保留的研究（'+studies.length+'）',studies.map(x=>'<div class="entry"><b>'+esc(x.q)+'</b><p>'+esc(x.use)+'</p><pre>'+esc(x.s)+'</pre></div>').join('')):'';
  if(w.type==='audio'){
    const rows=w.units.map((u,i)=>!u.bRound?'':more('第 '+(i+1)+' 段製作提示 · '+(u.heading||'錄音'),['goal','transition','sound'].map(k=>field(mediaBForms.audio.fields[k],'mbAudio'+i+k,u[k],true,'data-mb-audio="'+i+'" data-mb-key="'+k+'"')).join(''))).join('');
    return rows+studyHTML;
  }
  const u=w.units[w.cursor];if(!u?.bRound)return studyHTML;
  const base=mediaBSpec(w), byType={page:['goal','visual','transition'],comic:['expression','visual','transition'],film:['spoken','caption','duration','transition']};
  const inputs=byType[w.type].map(k=>field(base.fields[k],'mbProduction'+k,u[k],true,ubind(k))).join('');
  return more('這一'+base.unit+'的 B 製作指示',inputs)+studyHTML;
}

Object.assign(handlers,{
  mbUseCurrent:id=>{const w=findW(id),source=mediaBCurrentSource(w);mediaBInput(w).source=source;$('mbSource').value=source;keep(w);toast('已帶入目前工作稿')},
  mbUseIntent:id=>{const w=findW(id);mediaBInput(w).intent=w.intent;$('mbIntent').value=w.intent;keep(w);toast('已帶入最近確認的作品意圖')},
  mbStart:id=>mediaBStart(findW(id)),
  mbResume:(id,rid)=>{const w=findW(id);mediaBDialog(w,mediaBRun(w,rid))},
  mbCopy:async()=>{if(await copyText($('mbPrompt').value))toast('已複製本輪協作指令');else{selectForCopy('mbPrompt');toast('請長按複製選取的指令')}},
  mbImport:(id,rid)=>{const w=findW(id),r=mediaBRun(w,rid);try{r.raw=val('mbReturn');r.candidate=mediaBParse(r,r.raw);keep(w);mediaBDialog(w,r)}catch(e){toast(e.message)}},
  mbAdopt:(id,rid,replace)=>{const w=findW(id);mediaBApply(w,mediaBRun(w,rid),replace)},
  mbReplace:(id,rid)=>{const w=findW(id),r=mediaBRun(w,rid);modal('取代現有腳本？',tip('工作稿的頁、格、鏡或段落將換成勾選腳本。固定版本各自保存。')+'<div class="actions">'+btn('返回核對','mbResume',[id,rid])+btn('確認取代並採用','mbAdopt',[id,rid,true],'primary')+'</div>')},
  mbExit:id=>{tab='製作';closeRefresh()}
});
function mediaBEdit(e) {
  const el=e.target,d=el.dataset||{},w=current();
  if(!w)return;
  if(d.mbMode&&e.type==='change'){
    if(!TYPES[w.type].modes.includes(el.value))return;
    const data=mediaBInput(w);data.source=val('mbSource');data.intent=val('mbIntent');data.research=val('mbTheory');
    const previous=w.mode;w.mode=el.value;
    if(w.type==='audio'&&w.mode!==previous)data.audioMode=w.mode==='Podcast 單集'?'訪談':'獨白／引導';
    if(w.mode.includes('Reels'))w.frame='直式';
    w.review=false;keep(w);render();openMediaB(w);return;
  }
  if(d.mbInput){mediaBInput(w)[d.mbInput]=el.value;keep(w);return}
  if(d.mbAudio!==undefined){const u=w.units[Number(d.mbAudio)];if(u&&['goal','sound','transition'].includes(d.mbKey)){u[d.mbKey]=el.value;w.review=false;keep(w)}return}
  const holder=el.closest?.('[data-mb-round]');if(!holder)return;
  const r=mediaBRun(w,holder.dataset.mbRound);if(!r||r.adopted||holder.dataset.mbWork!==w.id)return;
  if(d.mbRaw)r.raw=el.value;
  else if(d.mbUnit!==undefined&&Object.hasOwn(r.spec.fields,d.mbKey))r.candidate.units[Number(d.mbUnit)][d.mbKey]=el.value;
  else if(d.mbSelect!==undefined)r.candidate.selected[Number(d.mbSelect)]=el.checked;
  else if(d.mbStudy!==undefined)r.candidate.studyUse[Number(d.mbStudy)]=el.value;
  else return;
  keep(w);
}
document.addEventListener('input',mediaBEdit);
document.addEventListener('change',mediaBEdit);
