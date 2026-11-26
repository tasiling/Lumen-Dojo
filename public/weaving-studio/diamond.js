'use strict';

// The validated prompts stay in diamond-original.js. This layer binds an individual
// run to its selected draft or fixed version and handles the user's return from GPT.
const diamondNames = {
  A: '診斷草稿與確認意圖', B: '研究與整理主文', C: '轉譯確定稿',
  'C-expand': '長文節奏擴寫', 'C-auto': '限動金句濃縮', 'C-five': '限動五框比較',
  D: '從成品建立知識脈絡'
};
function diamondSelect(label,id,choices,value) {
  return '<label class="field">'+esc(label)+'<select id="'+id+'">'+Object.entries(choices).map(([k,v])=>
    '<option value="'+esc(k)+'"'+(String(k)===String(value)?' selected':'')+'>'+esc(v)+'</option>').join('')+'</select></label>';
}
function diamondText(data) {
  if(data.type==='text'||data.type==='audio') return data.body||'';
  const kind={comic:'格',page:'頁',film:data.mode==='分章長片'?'章':'鏡'}[data.type]||'段';
  return (data.units||[]).map((u,i)=>{
    let parts=[u.heading,u.speaker,u.body];
    if(data.type==='comic'&&u.bRound) parts=[u.body&&[u.speaker,u.body].filter(Boolean).join('：')];
    if(data.type==='film'&&u.bRound) parts=[u.caption&&'字幕：'+u.caption,u.spoken&&'口播：'+u.spoken];
    const text=parts.filter(Boolean).join(' ／ ');
    return text?'第 '+(i+1)+' '+kind+'｜'+text:'';
  }).filter(Boolean).join('\n');
}
function diamondHistory(w,mod,n) {
  const runs=(w.diamondRuns||[]).filter(r=>
    (r.mode===mod||(mod==='C'&&r.mode.startsWith('C-')))&&(!n||Number(n)===r.n)
  ).slice().reverse();
  if(!runs.length)return '';
  return more('已保存的協作紀錄（'+runs.length+'）', runs.map(r=>row(diamondNames[r.mode],
    (r.n?'定稿 V'+r.n:'草稿快照')+' · '+(r.stage||'指令已備妥'),'history','diamondRun',[w.id,r.id])).join(''));
}
function diamondMessage(message){
  const box=$('diamondMessage');
  if(box){box.textContent=message;box.scrollIntoView({block:'nearest'});}
  else toast(message);
}
const diamondLive='<p id="diamondMessage" role="status" aria-live="polite" class="note"></p>';
/* A 階段留下的痕跡：最近一輪 A 的草稿、GPT 的診斷與本人確認的意圖。B 與重新開啟 A 時接著用。 */
function diamondLatestA(w) {
  const runs=(w?.diamondRuns||[]).filter(r=>r.mode==='A'&&!r.n);
  return runs.filter(r=>r.locked&&r.answer).at(-1)||runs.at(-1)||null;
}
function diamondADate(r){return r.time?new Date(r.time).toLocaleDateString('zh-TW'):'';}
function diamondATrace(w,a) {
  if(!a)return '';
  return '<section class="diamond-trace"><h3>A 階段留下的</h3>'+
    (a.answer?'<p><b>本人確認的意圖</b></p><p class="fixed-preview">'+esc(a.answer)+'</p>':tip('A 這輪還沒有確認意圖。'))+
    (a.source?more('A 分析的草稿',field('A 分析的草稿','diaASource',a.source,true,'readonly')):'')+
    (a.raw?more('GPT 在 A 的診斷',field('A 的診斷全文','diaARaw',a.raw,true,'readonly'))+
      '<label class="checkline"><input id="diaWithA" type="checkbox" checked>把 A 的診斷與我的回答附在這輪指令後面</label>':'')+
    '</section>';
}
function openDiamond(w,mod,n) {
  if(!w||!diamondNames[mod])return;
  let body='';
  const fixed=mod==='D'||mod.startsWith('C');
  if(mod.startsWith('C')&&w.type!=='text'){toast('C 請選擇已確認的文字版本');return;}
  if(mod==='B'&&w.type!=='text'){openMediaB(w);return;}
  const v=fixed?(n?version(w,n):w.versions.at(-1)):null;
  if(fixed&&!v){
    modal(mod+'｜'+diamondNames[mod],tip('先確認一個可獨立採用的定稿版本，再從該版開啟協作。')+
      btn('到預覽與定稿','diaReview',[w.id],'primary'));return;
  }
  if(v){
    const versionChoices=Object.fromEntries(w.versions.map(item=>[item.n,'V'+item.n+' · '+(item.data.title||nameW(w))]));
    body+=diamondSelect('本輪採用的固定版本','diamondVersion',versionChoices,v.n);
  }
  if(mod.startsWith('C')){
    body+=diamondSelect('要怎麼運用這份主文？','diamondMode',{
      'C-expand':'長文節奏擴寫','C-auto':'IG 限動金句濃縮','C-five':'IG 限動五框比較'
    },mod==='C'?'C-expand':mod);
    if(mod==='C'||mod==='C-expand')body+='<div class="inline-fields">'+
      diamondSelect('主文使用的框架','diaFramework',diamondOriginalChoices.frameworks,'diamond')+
      diamondSelect('擴寫強度','diaLevel',diamondOriginalChoices.cLevels,'standard')+'</div>';
    body+=more('本次選定的正文',field('固定正文','diaFixed',v.data.body,true,'readonly'));
  } else if(mod==='D') {
    if(w.type==='text')body+=more('本次選定的正文',field('固定正文','diaFixed',v.data.body,true,'readonly'));
    else body+=field('本版的頁文、字幕或逐字稿（附頁、格或時間位置）','diaTranscript',
      w.diamondTranscripts?.[v.n]||diamondText(v.data),true)+
      '<label class="checkline"><input id="diaVerified" type="checkbox">我已對照這份成品，確認以上文字與位置</label>'+
      tip('請保留定位。僅分析你核對過的文字，聲音或畫面可加本人描述。');
    body+=field('要比對的其他系統或專案（選填）','diaSystems','',true);
  } else {
    const a=diamondLatestA(w);
    if(mod==='B')body+=diamondATrace(w,a);
    if(mod==='B'||mod==='A')body+=workMaterialPicker(w);
    // 正文還是空的時候，接著用 A 上一輪分析的草稿，不讓寫過的內容消失。
    const fromA=w.type==='text'&&!w.body?.trim()&&a?.source?a.source:'';
    body+=field(w.type==='text'?'這次分析的草稿':'這次要診斷的敘事、口白或作者草稿','diaScratch',
      w.type==='text'?(w.body||fromA):(w.diamondNarrative||''),true)+
      (fromA?tip('正文還是空的，這裡先帶入 A 階段'+(diamondADate(a)?'（'+diamondADate(a)+'）':'')+'分析的草稿。'):'');
    if(mod==='B'){
      const intent=w.intent||a?.answer||'';
      body+=field('本件作品的創作意圖','diaIntent',intent,true)+
        '<label class="checkline"><input id="diaIntentOK" type="checkbox"'+(intent?' checked':'')+'>我確認這是本件作品的意圖</label>'+
        '<div class="inline-fields">'+diamondSelect('調整幅度','diaBmode',diamondOriginalChoices.bModes,'standard')+
        diamondSelect('主文框架','diaFramework',{auto:'依確認的意圖選框架',...diamondOriginalChoices.frameworks},'auto')+'</div>'+
        field('指定理論（選填）','diaTheory','',true);
    }
  }
  if(mod==='D')body+=diamondWorkPool(w);
  body+=diamondLive+btn('產生本輪 GPT 指令','diaGenerate',[w.id,mod,v?.n||0],'primary')+diamondHistory(w,mod==='C'||mod.startsWith('C-')?'C':mod,v?.n);
  modal(mod.charAt(0)+'｜'+diamondNames[mod],'<p class="sub">'+esc(v?.data.title||nameW(w))+'</p>'+body);
  for(const id of ['diamondMode','diamondVersion']){
    const picker=$(id);
    if(picker)picker.onchange=()=>openDiamond(w,$('diamondMode')?.value||mod,Number($('diamondVersion')?.value||0));
  }
}
function diaGenerate(id,requested,n){
  const w=findW(id);if(!w)return;
  const mode=val('diamondMode')||requested,v=n?version(w,n):null;
  const source=v?(w.type==='text'?v.data.body:val('diaTranscript')):val('diaScratch');
  if(!source.trim()){diamondMessage('請先帶入這一輪要處理的內容。');return;}
  if(mode==='B'&&(!val('diaIntent')||!$('diaIntentOK')?.checked)){diamondMessage('請先確認本件的創作意圖。');return;}
  if(mode==='D'&&w.type!=='text'&&!$('diaVerified')?.checked){diamondMessage('請對照成品後勾選，確認文字與位置。');return;}
  const input={scratch:source,body:source,intent:val('diaIntent')||w.intent||'',theory:val('diaTheory'),
    framework:val('diaFramework')||'auto',bMode:val('diaBmode')||'standard',
    cLevel:val('diaLevel')||'standard',cFramework:val('diaFramework')||'diamond',systems:val('diaSystems')};
  let prompt=diamondOriginalPrompt(mode,input);
  if(!prompt){diamondMessage('請核對本輪的輸入。');return;}
  const a=mode==='B'&&$('diaWithA')?.checked?diamondLatestA(w):null;
  if(a?.raw)prompt+='\n\n【A 階段的診斷與本人回答（供參考；主文仍以本人確認的意圖與原話為準）】\n'+a.raw+(a.answer?'\n\n本人看過診斷後的回答：'+a.answer:'');
  if(mode==='B')w.intent=input.intent;
  if(mode==='A'&&w.type!=='text')w.diamondNarrative=source;
  if(mode==='D'&&w.type!=='text'){w.diamondTranscripts ||= {};w.diamondTranscripts[n]=source;}
  const run={id:uid(),mode,n:n||0,workId:id,title:v?.data.title||nameW(w),shuttleId:w.shuttle,
    source,baseBody:w.body,intent:input.intent,prompt,stage:'指令已備妥',raw:'',time:Date.now(),...(a?{fromA:a.id}:{})};
  w.diamondRuns ||= [];w.diamondRuns.push(run);keep(w);diamondRun(id,run.id);
}
function diamondFind(id,rid){const w=findW(id);return [w,w?.diamondRuns?.find(r=>r.id===rid)];}
function diamondRun(id,rid){
  const [w,r]=diamondFind(id,rid);if(!r)return;
  const invite=btn('複製 GPT 指令','diaCopy',[id,rid],'primary')+more('檢視與手動複製指令',field('本輪完整指令','diaPrompt',r.prompt,true,'readonly'));
  let body='<p class="sub">'+esc(r.title)+' · '+(r.n?'定稿 V'+r.n:'草稿快照')+' · '+esc(r.stage)+'</p>'+
    more('本輪來源',field('帶出的材料','diaSource',r.source,true,'readonly'))+invite+
    field('貼回 GPT 的完整回覆','diaRaw',r.pendingRaw??r.raw,true,r.locked?'readonly':'')+
    (r.locked?'':'<div class="actions">'+btn('核對回覆','diaCheck',[id,rid])+btn('填入試用範例','diaDemo',[id,rid],'tiny')+'</div>');
  if(r.checked)body+=diaResult(w,r);
  modal(r.mode.charAt(0)+'｜'+diamondNames[r.mode],body+diamondLive);
  if(!r.locked)$('diaRaw').oninput=e=>{r.pendingRaw=e.target.value;save();};
}
function diaResult(w,r){
  if(r.locked&&r.mode==='A')return '<h3>本人已確認的意圖</h3><p class="fixed-preview">'+esc(r.answer)+'</p>';
  if(r.locked&&(r.mode==='B'||r.mode==='C-expand'))return '<h3>本輪採用的工作稿</h3><p class="fixed-preview">'+esc(r.candidate)+'</p>';
  if(r.mode==='A')return '<div class="entry"><h3>本人確認的意圖</h3>'+
    field('看過診斷與問題後，我的回答','diaAnswer',r.answer||'',true)+
    btn('保存為本件創作意圖','diaAdoptA',[w.id,r.id],'primary')+'</div>';
  if(r.mode==='D'){
    const candidates=(r.nodes||[]).map((o,i)=>{
      const valid=!!o.source&&r.source.includes(o.source);
      return '<label class="checkline"><input type="checkbox" name="diaNode" value="'+i+'" '+(!valid?'disabled':'')+
        '><span><b>'+esc(o.title)+'</b><small>'+esc(o.axis)+' · '+esc(o.detail)+'</small><small>來源「'+esc(o.source||'缺原句')+'」'+
        (!valid?' · 與本版原句不符':'')+'</small></span></label>';
    }).join('');
    return '<div class="entry"><h3>第一層 · 四軸候選</h3>'+candidates+
      '<h3>第二層 · 跨主題連接</h3><p class="fixed-preview">'+esc(r.connections)+'</p>'+
      '<h3>第三層 · 後續發展</h3><p class="fixed-preview">'+esc(r.futures)+'</p>'+
      btn('將勾選節點存入待寫池','diaAdoptNodes',[w.id,r.id],'primary')+'</div>'+diamondWorkPool(w);
  }
  if(r.mode==='B')return '<div class="entry"><h3>比對後採用</h3>'+
    field('研究與依據（獨立保存）','diaResearch',r.research||'',true)+
    field('要採用的主文（可自行從完整回覆擷取）','diaCandidate',r.candidate||'',true)+
    btn('核對候選與目前正文','diaCompare',[w.id,r.id],'primary')+'</div>';
  if(r.mode==='C-expand')return '<div class="entry">'+field('擴寫後的候選全文','diaCandidate',r.candidate||'',true)+
    btn('核對候選與目前正文','diaCompare',[w.id,r.id],'primary')+'</div>';
  const stories=r.stories||[];
  return '<div class="entry"><h3>選擇限動版本</h3>'+stories.map((s,i)=>row(s.framework||'限動稿',
    s.pages.length+' 頁 · '+s.pages[0].slice(0,38),'image','diaStory',[w.id,r.id,i])).join('')+
    (!stories.length?tip('可在下方直接貼入選定的一至兩頁。'):'')+
    btn('自行擷取頁文','diaStory',[w.id,r.id,-1],'tiny')+'</div>';
}
function diaStories(raw){
  const starts=[...raw.matchAll(/^[ \t#*_]*[【\[]\s*(?:選用)?框架\s*[:：]\s*([^】\]\n]+)[】\]][^\n]*/gm)];
  const packs=starts.length?starts.map((m,i)=>({framework:m[1].trim(),text:raw.slice(m.index+m[0].length,starts[i+1]?.index||raw.length)})):[{framework:'限動稿',text:raw}];
  return packs.map(p=>({...p,pages:p.text.split(/^[ \t#*_]*[【\[]?限動第\s*[12一二]\s*頁[】\]]?[：:\s*_]*$/gm).map(s=>s.trim()).filter(Boolean)}))
    .filter(p=>p.pages.length>0&&p.pages.length<=2);
}
function diaSliceLayers(raw){
  const lines=raw.split('\n');
  function at(regex,start){return lines.findIndex((l,i)=>i>=start&&regex.test(l.trim().replace(/^[\s#*_【［\[]+/,'')));}
  const layer2=at(/^(第二層|跨主題(?:連接|連結))/,0),layer3=at(/^(第三層|優先順序建議)/,layer2+1);
  if(layer2<0||layer3<=layer2)return null;
  return {first:lines.slice(0,layer2).join('\n'),connections:lines.slice(layer2+1,layer3).join('\n').trim(),futures:lines.slice(layer3+1).join('\n').trim()};
}
function diaCheck(id,rid){
  const [w,r]=diamondFind(id,rid);if(!r)return;
  if(r.locked)return;const raw=val('diaRaw');if(!raw){diamondMessage('請貼入 GPT 回覆，或用範例試走。');return;}
  if(raw!==r.raw||!r.checked){
    r.raw=raw;r.checked=false;
    if(r.mode==='D'){
      const layers=diaSliceLayers(raw);
      if(!layers||!layers.connections||!['想更深入這個主題','想探索其他方向','準備好行動了'].every(x=>layers.futures.includes(x))){
        keep(w);diamondMessage('請保留第二層跨主題連接、第三層以及三個讀者方向的標題。');return;
      }
      const nodes=diamondParseD(layers.first);
      if(!nodes.length){keep(w);diamondMessage('請核對第一層的軸線、篇名、說明與原句。');return;}
      r.nodes=nodes.map(o=>({...o,source:String(o.source||'').replace(/^[「『“"]|[」』”"]$/g,'').trim()}));
      r.connections=layers.connections;r.futures=layers.futures;
    } else if(r.mode==='B'){
      const match=/^.*?(?:第三部分[：:\s、—\-]*主文調整版|【主文調整版】|^#{1,4}\s*主文調整版)[^\n]*\n([\s\S]*)/m.exec(raw);
      r.candidate=match?.[1]?.trim()||'';
      r.research=(raw.split(/^[^\n]*(?:角色二|第二角色)[：:\s\S]*?主文調整師[^\n]*$/m)[0]||'').trim();
      if(r.research===raw)r.research='';
    } else if(r.mode==='C-expand')r.candidate=raw;
    else if(r.mode.startsWith('C-'))r.stories=diaStories(raw);
  }
  delete r.pendingRaw;r.checked=true;r.stage='已保存候選';keep(w);diamondRun(id,rid);
}
function diaDemoText(r) {
  const quote=r.source.split('\n').find(t=>t.trim())?.trim().slice(0,80)||r.title;
  if(r.mode==='A')return '角色一｜結構診斷\n原稿提到「'+quote+'」。可以先確認讀者最需要理解的是這件事的原因、感受，或下一步。\n改良方向：從一個具體場景切入，保留作者自己的結論。\n\n角色二｜請本人回答\n讀者讀完最想解開哪個問題？這次最重要的是說明機制、建立信任、提出觀點、讓人共鳴，或讓一個主張更清楚？';
  if(r.mode==='B')return '角色一：資料研究員\n示例保留待查欄位：補入可核對的研究前，先使用本人的原話。\n\n角色二：主文調整師\n第一部分：以本人確認的意圖為中心。\n第二部分：保留原句，再接續這次想對讀者說的話。\n第三部分：主文調整版\n'+r.source+'\n\n'+r.intent;
  if(r.mode==='C-expand')return r.source+'\n\n'+quote;
  if(r.mode==='C-auto'||r.mode==='C-five'){
    const frameworks=r.mode==='C-auto'?['BAB']:['AIDA','PAS','BAB','FAB','QUEST'];
    const lines=r.source.split(/\n+|(?<=[。！？])/).map(t=>t.trim()).filter(Boolean);
    return frameworks.map((f,i)=>'【框架：'+f+'】\n【限動第1頁】\n'+(lines[i%lines.length]||quote)).join('\n\n');
  }
  return '第一層：候選節點清單\n垂直深挖\n這句話背後的判斷\n回到原句，追問哪一個細節最能幫讀者理解作者的選擇。\n來源：「'+quote+'」\n\n水平平移\n換個情境還成立嗎\n把同一句話放進另一個日常場景，觀察哪些條件會跟著改變。\n來源：「'+quote+'」\n\n反面驗證\n何時需要另一種選擇\n檢查原句在哪種條件下需要調整。\n來源：「'+quote+'」\n\n跨系統嫁接\n這裡先留空。\n\n第二層：跨主題連接\n「換個情境還成立嗎」與「何時需要另一種選擇」都在檢查原句適用的條件。\n\n第三層：優先順序建議\n想更深入這個主題\n這句話背後的判斷\n當同一句話帶來截然不同的選擇，究竟是哪一個細節改變了判斷的條件？\n\n想探索其他方向\n換個情境還成立嗎\n把相同想法帶進另一個日常場景時，哪些條件仍然適用，哪些條件需要重新釐清？\n\n準備好行動了\n這裡目前還沒有明顯對應的篇名';
}
function diaCompare(id,rid){
  const [w,r]=diamondFind(id,rid);if(!r?.checked)return;
  if(!val('diaCandidate')){diamondMessage('請先擷取要採用的主文。');return;}
  r.candidate=val('diaCandidate');if(r.mode==='B')r.research=val('diaResearch');
  keep(w);
  modal('核對並採用到文字工作稿',
    more('目前工作稿','<div class="fixed-preview">'+esc(w.body||'尚未填寫')+'</div>')+
    (r.baseBody!==w.body?tip('工作稿在這輪協作開始後已有修改，請比對內容後再決定。'):'')+
    '<h3>候選稿</h3><div class="fixed-preview">'+esc(r.candidate)+'</div><div class="actions">'+
    btn('回到候選','diamondRun',[id,rid])+btn('採用為目前工作稿','diaAdoptText',[id,rid],'primary')+'</div>');
}
function diaAdoptText(id,rid) {
  const [w,r]=diamondFind(id,rid);if(!r?.checked||!r.candidate)return;
  if(r.mode==='B'&&r.research){
    const row={q:'文字 B｜本輪候選研究',s:r.research,use:'待查與本人判斷',runId:r.id};
    const old=w.research.find(x=>x.runId===r.id);
    if(old)Object.assign(old,row);else w.research.push(row);
  }
  w.body=r.candidate;w.review=false;r.locked=true;r.stage='已採用到工作稿';keep(w);closeRefresh('已採用文字工作稿');
}
function diaStory(id,rid,i){
  const [w,r]=diamondFind(id,rid);if(!w||!r?.checked)return;
  const p=r.stories?.[i], made=(r.creations||[]).find(c=>c.i===i&&findW(c.work));
  if(made){go('edit/'+made.work);return;}
  const sh=Object.fromEntries(state.shuttles.map(s=>[s.id,s.title]));
  modal('將選定限動帶入圖文工作區', '<p>'+esc(r.title)+' · V'+r.n+' · '+esc(p?.framework||'自行擷取')+'</p>'+
    field('第 1 頁上版文字','diaPage1',p?.pages[0]||'',true)+field('第 2 頁（選填）','diaPage2',p?.pages[1]||'',true)+
    diamondSelect('確認新圖文所屬織光杼','diaNewShuttle',{'':'請選擇',...sh},w.shuttle||'')+
    diamondLive+btn('採用頁文並建立圖文作品','diaStorySave',[id,rid,i],'primary'));
}
function diaStorySave(id,rid,i){
  const [w,r]=diamondFind(id,rid);const s=findS(val('diaNewShuttle'));
  if(!r?.checked||!s||!val('diaPage1')){diamondMessage('請選定織光杼並填好第 1 頁。');return;}
  const existing=(r.creations||[]).find(x=>x.i===i&&findW(x.work));
  if(existing){go('edit/'+existing.work);return;}
  const child=newWork('page','自由圖卡',{id:w.id,n:r.n,title:r.title});
  child.title=r.title+'｜限動';child.units=[val('diaPage1'),val('diaPage2')].filter(Boolean).map(text=>({...unit(),body:text}));
  child.project=w.project||'';child.intent=r.intent||'';child.shuttle=s.id;
  if(typeof stampShuttleMatch==='function')stampShuttleMatch(child,s);
  r.creations ||= [];r.creations.push({i,work:child.id});r.locked=true;r.stage='已建立限動圖文';keep(child);keep(w);go('edit/'+child.id);
}
function diamondWorkPool(w){
  const collection=w.diamondPool||[];
  if(!collection.length)return '';
  return more('這件作品的待寫節點（'+collection.length+'）',collection.map(o=>{
    const linked=findS(o.shuttleId);
    const action=linked?btn('前往'+linked.title,'go',['shuttle/'+linked.id],'tiny'):
      findS(w.shuttle)?btn('將這個節點歸入目前所屬杼','diaPoolMatch',[w.id,o.id],'tiny'):'';
    return '<div class="entry"><b>'+esc(o.title)+'</b><p>'+esc(o.axis)+' · V'+o.n+'</p>'+action+'</div>';
  }).join(''));
}
function diamondNodesForShuttle(s) {
  const nodes=state.works.flatMap(w=>(w.diamondPool||[]).filter(o=>o.shuttleId===s.id));
  if(!nodes.length)return '';
  return panel('從成品留下的待寫節點',nodes.map(o=>'<div class="entry"><b>'+esc(o.title)+'</b>'+
    '<p>'+esc(o.detail)+'</p><small>'+esc(o.axis)+' · '+esc(o.workTitle)+' V'+o.n+'</small>'+
    '<div class="actions">'+btn('查看來源與脈絡','diamondRun',[o.workId,o.runId],'tiny')+
    (o.direction?'<span class="badge">已成為方向</span>':btn('發展為本杼方向','diaDir',[s.id,o.workId,o.id],'tiny'))+
    btn('以此打造新杼','diaForge',[o.workId,o.id],'tiny')+'</div></div>').join(''));
}
function diaAdoptNodes(id,rid){
  const [w,r]=diamondFind(id,rid);if(!r?.checked)return;
  const selected=Array.from(document.querySelectorAll('[name=diaNode]:checked'),el=>r.nodes[Number(el.value)])
    .filter(o=>o?.source&&r.source.includes(o.source));
  if(!selected.length){diamondMessage('請勾選至少一個已核對來源的節點。');return;}
  w.diamondPool ||= [];let added=0;
  for(const o of selected){
    if(w.diamondPool.some(old=>old.n===r.n&&old.axis===o.axis&&old.title===o.title&&old.source===o.source))continue;
    w.diamondPool.push({...o,id:uid(),n:r.n,workId:w.id,shuttleId:r.shuttleId||w.shuttle,workTitle:r.title,runId:r.id});added++;
  }
  r.locked=true;r.stage='已存入待寫池';keep(w);diamondRun(id,rid);
  diamondMessage(added?'已保存 '+added+' 個節點，可從所屬織光杼查看。':'勾選的節點已在待寫池。');
}
Object.assign(handlers,{
  diamondOpen:(id,mod,n)=>openDiamond(findW(id),mod,n),diaGenerate,diamondRun,diaCheck,diaCompare,diaAdoptText,
  diaStory,diaStorySave,diaAdoptNodes,
  diaReview:id=>{wk=id;tab='預覽與定稿';go('edit/'+id);},
  diaCopy:async(id,rid)=>{
    const [,r]=diamondFind(id,rid);if(!r)return;
    if(await copyText(r.prompt)){diamondMessage('已複製，貼到 GPT 後將回覆帶回這一輪。');return;}
    const area=$('diaPrompt');area.closest('details').open=true;area.focus();area.select();diamondMessage('請長按已選取的完整指令複製。');
  },
  diaDemo:(id,rid)=>{const [,r]=diamondFind(id,rid);if(!r)return;
    const raw=$('diaRaw');
    if(raw.value.trim()&&raw.value.trim()!==diaDemoText(r)){
      diamondMessage('目前已有回覆。請先清空回覆欄，再填入示例。');return;
    }
    raw.value=diaDemoText(r);raw.dispatchEvent(new Event('input',{bubbles:true}));
    diamondMessage('已填入本機格式示例。點「核對回覆」查看。');
  },
  diaAdoptA:(id,rid)=>{const [w,r]=diamondFind(id,rid);if(!r?.checked)return;
    const answer=val('diaAnswer');if(!answer){diamondMessage('請先用自己的話回答本輪問題。');return;}
    r.answer=answer;r.locked=true;r.stage='本人已確認意圖';w.intent=answer;keep(w);closeRefresh('已保存本件意圖，B 可以直接帶入');
  },
  diaDir:(sid,id,nid)=>{const w=findW(id),s=findS(sid),o=w?.diamondPool?.find(x=>x.id===nid);
    if(!s||!o||o.shuttleId!==s.id||o.direction)return;
    const d={id:uid(),name:o.title,vs:[],source:{workId:id,n:o.n,nodeId:nid,quote:o.source}};
    s.dirs.push(d);o.direction=d.id;save();closeRefresh('已新增方向，保留來源作品與版本');
  },
  diaPoolMatch:(id,nid)=>{const w=findW(id),o=w?.diamondPool?.find(x=>x.id===nid);if(!o||o.shuttleId||!findS(w.shuttle))return;
    o.shuttleId=w.shuttle;keep(w);diamondRun(id,o.runId);diamondMessage('已將所選節點歸入本件作品目前的織光杼。');
  },
  diaForge:(id,nid)=>{const o=findW(id)?.diamondPool?.find(x=>x.id===nid);if(o)
    beginForgeFromNode({title:o.title,body:o.detail,workId:id,version:o.n,shuttleId:o.shuttleId,nodeId:o.id});
  }
});
