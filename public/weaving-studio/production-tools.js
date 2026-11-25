'use strict';

/* 製作工具：把文字稿、文字分鏡與創作設定，整理成各個 Skill 原本就認得的格式。
   選項的代號沿用 Skill 自己的名稱，這樣整份製作包貼過去不必再翻譯。 */

const opt=(value,label)=>[value,label||value];
const MOTION_STYLES='swiss-editorial kinetic-brutalist risograph-print editorial-collage art-deco one-line concept-morph minimal-ui dark-keynote glass-material data-motion isometric-infographic whiteboard-explainer flat-vector paper-cut crayon-storybook painterly ink-wash ukiyo-e stained-glass illuminated-manuscript copperplate-engraving shadow-puppet rubber-hose cel-anime-80s comic-pop pixel-game pixel-diorama soft-3d-toy soft-organic tilt-shift-miniature generative-geometry particle-field liquid-shader glitch-digital crt-vhs synthwave-neon hologram-hud terminal-ascii cinematic-title mixed-media-era guochao blueprint'.split(' ');

const TOOLS={
  'baoyu-xhs-images':{
    name:'圖卡輪播｜baoyu-xhs-images',types:['page'],unit:'頁',
    settings:[
      {key:'style',label:'樣式',options:[opt('notion','notion｜簡約筆記'),opt('minimal','minimal｜極簡優雅'),opt('warm','warm｜溫暖'),opt('fresh','fresh｜清新自然'),opt('cute','cute｜可愛'),opt('bold','bold｜強烈衝擊'),opt('pop','pop｜活力'),opt('retro','retro｜復古'),opt('chalkboard','chalkboard｜黑板教學'),opt('study-notes','study-notes｜手寫學習筆記'),opt('sketch-notes','sketch-notes｜手繪筆記'),opt('screen-print','screen-print｜海報網印')]},
      {key:'layout',label:'預設版面',options:[opt('balanced','balanced｜均衡，三到四個要點'),opt('sparse','sparse｜留白多，一到兩個要點'),opt('dense','dense｜密集，五到八個要點'),opt('list','list｜清單'),opt('comparison','comparison｜左右對比'),opt('flow','flow｜流程'),opt('mindmap','mindmap｜放射心智圖'),opt('quadrant','quadrant｜四象限')]},
      {key:'palette',label:'配色',options:[opt('','用樣式內建的配色'),opt('macaron','macaron｜柔和粉彩'),opt('warm','warm｜暖色大地'),opt('neon','neon｜深底霓虹')]},
      {key:'ratio',label:'比例',options:[opt('4:5（1080×1350）','IG 直式 4:5'),opt('3:4（1242×1660）','直式 3:4'),opt('1:1（1242×1242）','方形 1:1')]},
      {key:'text',label:'圖上的文字',options:[opt('文字由出圖工具畫進圖裡，使用繁體中文'),opt('只出圖不放字，文字我另外排版')]},
      {key:'platform',label:'發布平台與觀眾（選填）',text:true}
    ],
    draftRule:['骨架請分成：封面的一句鉤子、鋪陳（為什麼要談這件事）、三到五個核心要點（每個要點之後會是一頁）、收穫、結尾。','每一項只放我說過的話；要點不足三個時寫在「待我補寫」，不要替我湊數。'],
    scriptRule:'這份分鏡之後交給 baoyu-xhs-images 製作圖卡。第一頁是封面：一個鉤子、一到兩個資訊點、大量留白；最後一頁是結尾；中間依鋪陳、核心、收穫安排。每頁的 goal 寫這一頁的核心訊息；heading 寫上版標題；body 每行一個要點，數量依版面密度：sparse 一到兩點、balanced 三到四點、dense 五到八點；visual 寫視覺概念（主體、構圖、氛圍），不寫字體與字級；transition 寫引導滑到下一頁的一句話。',
    pack:xhsPack
  },
  'baoyu-slide-deck':{
    name:'簡報｜baoyu-slide-deck',types:['page'],unit:'頁',
    settings:[
      {key:'style',label:'樣式',options:[opt('watercolor','watercolor｜水彩'),opt('minimal','minimal｜極簡'),opt('notion','notion｜簡約筆記'),opt('sketch-notes','sketch-notes｜手繪筆記'),opt('hand-drawn-edu','hand-drawn-edu｜手繪教學'),opt('chalkboard','chalkboard｜黑板'),opt('bold-editorial','bold-editorial｜雜誌感'),opt('editorial-infographic','editorial-infographic｜資訊圖表'),opt('corporate','corporate｜商務'),opt('vector-illustration','vector-illustration｜向量插畫'),opt('fantasy-animation','fantasy-animation｜奇幻動畫'),opt('dark-atmospheric','dark-atmospheric｜深色氛圍'),opt('vintage','vintage｜復古'),opt('scientific','scientific｜科學'),opt('blueprint','blueprint｜藍圖'),opt('pixel-art','pixel-art｜像素'),opt('intuition-machine','intuition-machine'),opt('custom','custom｜用下面四個維度自訂')]},
      {key:'texture',label:'自訂：質感',options:[opt('organic','organic｜手繪柔和'),opt('clean','clean｜俐落數位'),opt('paper','paper｜紙質復古'),opt('grid','grid｜技術網格'),opt('pixel','pixel｜像素')]},
      {key:'mood',label:'自訂：色調',options:[opt('warm','warm｜暖色親切'),opt('neutral','neutral｜灰階'),opt('cool','cool｜冷靜藍灰'),opt('vibrant','vibrant｜高彩'),opt('professional','professional｜海軍藍與金'),opt('dark','dark｜深色')]},
      {key:'typography',label:'自訂：字體氣質',options:[opt('humanist','humanist｜人文'),opt('geometric','geometric｜幾何'),opt('handwritten','handwritten｜手寫'),opt('editorial','editorial｜編輯'),opt('technical','technical｜技術')]},
      {key:'density',label:'自訂：內容密度',options:[opt('balanced','balanced｜均衡'),opt('minimal','minimal｜極少'),opt('dense','dense｜密集')]},
      {key:'ratio',label:'比例',options:[opt('16:9'),opt('4:3'),opt('4:5')]},
      {key:'audience',label:'觀眾（選填）',text:true}
    ],
    draftRule:['骨架依敘事弧線排：開場的主張、三到六個支撐段、收尾的一句話或行動。','每一段的標題要是一句完整的主張，不是名詞標籤；主張必須出自我說過的話。'],
    scriptRule:'這份分鏡之後交給 baoyu-slide-deck 製作簡報。第一頁是封面，最後一頁是封底，封底要有意義的收尾，不只是謝謝。每頁的 goal 寫這一頁在整個敘事裡完成什麼；heading 要是一句完整的主張，不是標籤；body 每行一個帶具體細節的要點，最多三點；visual 寫具體元素、構圖與氛圍。',
    pack:slidePack
  },
  'motion-showreel':{
    name:'圖形動畫｜motion-showreel',types:['film'],unit:'鏡',
    settings:[
      {key:'format',label:'用途',options:[opt('D 動態排版／金句卡點'),opt('J 口播講解／分章長片'),opt('B 產品宣傳短片'),opt('A 動效作品集'),opt('C UI 動效演示'),opt('E Logo 演繹／片頭'),opt('F 循環動圖'),opt('G 數據爆點'),opt('I 年代回顧')]},
      {key:'style',label:'風格',options:[opt('','先給我三個拉開差距的方向'),...MOTION_STYLES.map(s=>opt(s))]},
      {key:'seconds',label:'片長（秒）',text:true},
      {key:'size',label:'畫面',options:[opt('豎屏 1080×1920'),opt('橫屏 1920×1080'),opt('方形 1080×1080')]},
      {key:'fps',label:'幀率',options:[opt('30fps'),opt('60fps')]},
      {key:'narration',label:'口播',options:[opt('無'),opt('TTS，使用我提供的口播原稿，不改寫'),opt('我自己錄音')]},
      {key:'bgm',label:'配樂',options:[opt('AI 合成'),opt('我提供'),opt('關閉')]},
      {key:'sfx',label:'音效',options:[opt('AI 合成'),opt('我提供'),opt('關閉')]},
      {key:'memory',label:'觀眾要記住的一句話或一個畫面',text:true},
      {key:'brand',label:'品牌色與字體（選填）',text:true}
    ],
    draftRule:['先問我「觀眾看完要記住的一句話或一個畫面」是什麼。','骨架依口播段落排，每一段標出要讓觀眾看懂的一個變化。口播稿由我自己寫，你只排段落與順序。'],
    scriptRule:'這份分鏡之後交給 motion-showreel 製作圖形動畫。每一鏡先寫清楚觀眾要看懂什麼變化、主體的起始與結束狀態、如何接上一鏡，再寫動作；不要把口播逐句變成靜態標題卡。spoken 只放我的原稿，不改寫；caption 是上屏文字，精簡到能在停留時間內讀完；duration 寫秒數。整片只用一套視覺系統。',
    pack:motionPack
  }
};
const toolsFor=w=>Object.entries(TOOLS).filter(([,t])=>t.types.includes(w.type));
const toolOf=w=>TOOLS[productionOf(w).tool]?.types.includes(w.type)?TOOLS[productionOf(w).tool]:null;
function toolOpts(w) {
  const p=productionOf(w), tool=toolOf(w);
  // Each tool keeps its own settings, so switching tools never carries one tool's choice into another.
  p.toolOpts||={};
  const o=p.toolOpts[tool?p.tool:'']||={};
  if(tool)for(const s of tool.settings)if(o[s.key]===undefined)o[s.key]=s.text?'':s.options[0][0];
  return o;
}
const filled=u=>u.heading.trim()||u.body.trim();
const lines=text=>String(text||'').split('\n').map(l=>l.replace(/^\s*[-・•]\s*/,'').trim()).filter(Boolean);
const proposal='（未指定，請依樣式提案，並標示為 AI 提案）';
function packHead(w,skill) {
  const base=w.source&&findW(w.source.id);
  return ['請使用 '+skill+' Skill 製作。下面的大綱、文字與設定都已由本人確認，請直接依此準備，不要重新訪談，也不要增刪或改寫論點。',
    '內容依據：織光堂文字稿「'+(w.source?.title||(base?nameW(base):'未連結'))+'」'+(w.source?' V'+w.source.n:'')+'；畫面中的新構想屬於創作提案，不是本人的經歷。'].join('\n');
}
function packShared(w) {
  const p=productionOf(w);
  return [p.style&&'風格補充：'+p.style,p.cast&&'每一頁都要保持一致的元素：'+p.cast,p.brief&&'其他說明：'+p.brief].filter(Boolean);
}
function xhsPack(w) {
  const o=toolOpts(w), units=w.units.filter(filled), n=units.length, L=[packHead(w,'baoyu-xhs-images'),''];
  L.push('# Xiaohongshu Infographic Series Outline','','---','style: '+o.style,'default_layout: '+o.layout);
  if(o.palette)L.push('palette: '+o.palette);
  L.push('image_count: '+n,'aspect: '+o.ratio,'language: 繁體中文','text: '+o.text);
  if(o.platform)L.push('platform: '+o.platform);
  L.push('---',...packShared(w));
  units.forEach((u,i)=>{
    const pos=i===0?'Cover':i===n-1&&n>1?'Ending':'Content';
    L.push('','## Image '+(i+1)+' of '+n,'','**Position**: '+pos,'**Layout**: '+(pos==='Content'?o.layout:'sparse'));
    L.push('**'+(pos==='Cover'?'Hook':'Core Message')+'**: '+(u.goal?.trim()||u.heading.trim()));
    L.push('','**Text Content**:','- Title: 「'+u.heading.trim()+'」',...lines(u.body).map(l=>'- '+l));
    L.push('','**Visual Concept**:',u.visual?.trim()||proposal);
    if(pos!=='Ending'&&u.transition?.trim())L.push('','**Swipe Hook**: '+u.transition.trim());
    L.push('','---');
  });
  return L.join('\n');
}
function slidePack(w) {
  const o=toolOpts(w), units=w.units.filter(filled), n=units.length, L=[packHead(w,'baoyu-slide-deck'),''];
  L.push('# Slide Deck Outline','','**Topic**: '+(w.title||nameW(w)),'**Style**: '+o.style);
  if(o.style==='custom')L.push('**Dimensions**: '+[o.texture,o.mood,o.typography,o.density].join(' + '));
  L.push('**Audience**: '+(o.audience||'未指定'),'**Language**: 繁體中文','**Aspect**: '+o.ratio,'**Slide Count**: '+n+' slides',...packShared(w),'','---');
  units.forEach((u,i)=>{
    const type=i===0?'Cover':i===n-1&&n>1?'Back Cover':'Content', body=lines(u.body);
    L.push('','## Slide '+(i+1)+' of '+n,'','**Type**: '+type,'','// NARRATIVE GOAL',u.goal?.trim()||'（未填寫，請依前後頁推定並標示為 AI 提案）','','// KEY CONTENT','Headline: '+u.heading.trim());
    if(body.length)L.push('Body:',...body.map(l=>'- '+l));
    L.push('','// VISUAL',u.visual?.trim()||proposal,'','// LAYOUT','依樣式選擇合適的版面');
  });
  return L.join('\n');
}
function motionPack(w) {
  const o=toolOpts(w), units=w.units.filter(filled), L=[packHead(w,'motion-showreel'),'請依 Skill 的流程先確認需求，再出風格幀與預覽；我確認預覽後才導出。',''];
  L.push('<inputs>','主題：'+(w.title||nameW(w)),'觀眾記住的一句話／一個畫面：'+(o.memory||'（尚未填寫，請先問我）'),
    '規格：'+(o.seconds?o.seconds+' 秒':'片長未指定')+' · '+o.size+' · '+o.fps+(w.loop?' · 無縫循環':''),
    '內容依據：用戶的文字稿與下方分鏡；畫面構想為創作提案');
  if(o.brand)L.push('品牌：'+o.brand);
  L.push('BGM：'+o.bgm,'音效：'+o.sfx,'口播：'+o.narration,'</inputs>','','<direction>','format: '+o.format,'style: '+(o.style||'未指定，請給三個拉開差距的方向'),...packShared(w),'整片只用一套視覺系統；同一個元素在每個鏡頭裡的樣子保持一致。','</direction>','','<structure>',
    '| 鏡 | 要解釋的變化／起始畫面 | 動作與結束狀態 | 上屏文字 | 聲音 | 時長 | 銜接方式 |','|---|---|---|---|---|---|---|');
  const cell=v=>String(v||'').replace(/\n+/g,' ／ ').replace(/\|/g,'｜').trim()||'—';
  units.forEach((u,i)=>L.push('| '+[i+1,cell(u.heading),cell(u.body),cell(u.caption),cell(u.sound),cell(u.duration),cell(u.transition)].join(' | ')+' |'));
  L.push('</structure>');
  const spoken=units.map((u,i)=>u.spoken?.trim()?'鏡 '+(i+1)+'：'+u.spoken.trim():'').filter(Boolean);
  if(o.narration!=='無')L.push('','<narration>','口播原稿（來源：用戶；不改寫）',...(spoken.length?spoken:['（分鏡裡還沒有口播稿）']),'</narration>');
  return L.join('\n');
}

function toolSection(w) {
  const choices=toolsFor(w);
  if(!choices.length)return '';
  const p=productionOf(w), tool=toolOf(w), o=toolOpts(w);
  const select=(id,attr,value,options)=>'<select id="'+id+'" '+attr+'>'+options.map(([v,l])=>'<option value="'+esc(v)+'"'+(v===value?' selected':'')+'>'+esc(l)+'</option>').join('')+'</select>';
  let html='<div class="tool-pick"><label class="field">製作工具'+select('productionTool','data-tool-pick="1"',tool?p.tool:'',[['','通用｜逐一複製製作指令'],...choices.map(([k,t])=>[k,t.name])])+'</label>';
  if(!tool)return html+'<p class="statusline">選一個製作工具後，這裡會出現它認得的創作設定，以及可以整份貼過去的製作包。</p></div>';
  const custom=o.style==='custom';
  html+='<div class="tool-settings">'+tool.settings.filter(s=>!/^自訂：/.test(s.label)||custom).map(s=>'<label class="field">'+esc(s.label)+
    (s.text?'<input data-tool-opt="'+s.key+'" value="'+esc(o[s.key])+'">':select('toolOpt'+s.key,'data-tool-opt="'+s.key+'"',o[s.key],s.options))+'</label>').join('')+'</div>';
  const ready=w.units.some(filled), pending=w.units.filter(u=>filled(u)&&!u.ok).length;
  html+=ready?'<h3>整份製作包</h3>'+(pending?'<p class="statusline">還有 '+pending+' '+tool.unit+'的分鏡沒有確認，製作包會照目前的內容產生。</p>':'')+
    '<pre id="toolPack">'+esc(tool.pack(w))+'</pre><div class="actions">'+btn('複製整份製作包','toolPackCopy',[],'primary')+'</div>'+
    '<p class="statusline">貼到裝有這個 Skill 的環境裡使用。做好的成品再放回下方對應的那一'+tool.unit+'。</p>'
    :'<p class="statusline">分鏡還沒有內容，先回上方排好。</p>';
  return html+'</div>';
}

/* ---------- 接到三個步驟上 ---------- */
const baseProductionPanel=productionPanel;
productionPanel=function(w){
  return baseProductionPanel(w).replace('<details><summary>全篇共用的設定',toolSection(w)+'<details><summary>全篇共用的設定');
};
const promptWithCards=mediaBPrompt;
mediaBPrompt=function(r){
  const w=findW(r.meta?.work_id), tool=w&&toolOf(w);
  return promptWithCards(r)+(tool?'\n\n製作工具的要求：'+tool.scriptRule:'');
};
const baseDraftPrompt=draftPrompt;
draftPrompt=function(w,mode){
  const text=baseDraftPrompt(w,mode), tool=TOOLS[w.draftTarget];
  if(!tool)return text;
  const at=text.indexOf('【規則】');
  return text.slice(0,at)+'【這份文字稿之後要做成：'+tool.name+'】\n'+tool.draftRule.map(l=>'- '+l).join('\n')+'\n\n'+text.slice(at);
};
const baseDraftDialog=draftDialog;
draftDialog=function(w,mode='ask'){
  baseDraftDialog(w,mode);
  const anchor=$('draftMode')?.closest('label');
  if(!anchor)return;
  anchor.insertAdjacentHTML('afterend','<label class="field">這份文字稿之後要做成<select id="draftTarget">'+
    [['','還沒決定'],...Object.entries(TOOLS).map(([k,t])=>[k,t.name])].map(([v,l])=>'<option value="'+esc(v)+'"'+(v===(w.draftTarget||'')?' selected':'')+'>'+esc(l)+'</option>').join('')+'</select></label>');
};
function refreshPack() {
  const w=current(), tool=w&&toolOf(w), pre=$('toolPack');
  if(tool&&pre)pre.textContent=tool.pack(w);
}
handlers.toolPackCopy=async()=>{
  const w=current(), tool=w&&toolOf(w);
  if(!tool)return;
  if(await copyText(tool.pack(w)))toast('已複製整份製作包');else toast('請長按上方文字手動複製');
};
document.addEventListener('change',e=>{
  const w=current();
  if(!w)return;
  if(e.target.id==='draftTarget'){
    w.draftTarget=e.target.value;keep(w);
    const mode=Object.keys(DRAFT_MODES).find(k=>DRAFT_MODES[k].name===val('draftMode'))||'ask';
    if($('draftPrompt'))$('draftPrompt').value=draftPrompt(w,mode);
  }else if(e.target.dataset.toolPick){
    productionOf(w).tool=e.target.value;keep(w);render();$('production')?.scrollIntoView({block:'start'});
  }else if(e.target.dataset.toolOpt&&e.target.tagName==='SELECT'){
    toolOpts(w)[e.target.dataset.toolOpt]=e.target.value;keep(w);
    if(e.target.dataset.toolOpt==='style'){render();$('production')?.scrollIntoView({block:'start'});}else refreshPack();
  }
});
let toolTimer;
document.addEventListener('input',e=>{
  const w=current();
  if(!w)return;
  if(e.target.dataset?.toolOpt&&e.target.tagName==='INPUT'){toolOpts(w)[e.target.dataset.toolOpt]=e.target.value;keep(w);}
  else if(!e.target.dataset?.production&&!e.target.dataset?.u)return;
  clearTimeout(toolTimer);toolTimer=setTimeout(refreshPack,500);
});
