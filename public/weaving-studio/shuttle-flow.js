'use strict';

function shuttleMatches() { return state.shuttleMatches ||= {}; }
function shuttleForges() { return state.shuttleForges ||= {}; }

function coreHistory(s) {
  if (Array.isArray(s.coreVersions)) return s.coreVersions;
  return s.core ? [{ n:1, text:s.core, from:'既有經線' }] : [];
}

function stampShuttleMatch(w, s, dir, revision) {
  const v = coreHistory(s).at(-1);
  if(w.cardIds?.length&&w.shuttle!==s.id)w.cardIds=w.cardIds.filter(id=>shuttleCardIds(s).includes(id));
  w.shuttle = s.id;
  w.coreSnapshot = v ? { n:v.n, text:v.text } : { n:0, text:'' };
  w.direction = dir?.id || '';
  w.understanding = dir && revision ? { n:revision, text:dir.vs[revision - 1] } : null;
}

function appendCoreVersion(s, text, origin) {
  if (!text || s.core === text) return;
  const versions = coreHistory(s);
  versions.push({ n:versions.length + 1, text, from:origin, time:Date.now() });
  s.coreVersions = versions;
  s.core = text;
}

function matchBack(m) {
  if (m.workId) return 'edit/' + m.workId;
  if (m.kind === 'derive') return 'edit/' + m.sourceId;
  return 'home';
}

function beginShuttleMatch(request) {
  if (!TYPES[request.type]) return;
  const signature = JSON.stringify(request);
  let m = Object.values(shuttleMatches()).find(x => !x.done && x.signature === signature);
  if (!m) {
    m = { ...request, id:uid(), signature };
    shuttleMatches()[m.id] = m;
    save();
  }
  go('match/' + m.id);
}

function shuttleSelect(id, label, values, chosen, attrs='') {
  return '<label class="field">' + esc(label) + '<select id="' + id + '" ' + attrs + '>' +
    values.map(([v,t]) => '<option value="' + esc(v) + '" ' + (String(v) === String(chosen) ? 'selected' : '') + '>' + esc(t) + '</option>').join('') + '</select></label>';
}

function matchSummary(s, m) {
  const w = findW(m.workId), origin = m.kind === 'derive' ? version(findW(m.sourceId),m.n)?.data : null;
  const why = w?.shuttle === s.id ? '目前所屬杼' : origin?.shuttle === s.id ? '來源版本採用了這一杼' : '';
  return '<article class="match-entry"><div class="sectionhead"><h3>' + esc(s.title) + '</h3>' +
    (why ? '<span class="badge">'+esc(why)+'</span>' : '') + '</div><p>' + esc(s.core || '經線待整理') +
    '</p>' + (s.dirs.length ? '<small>方向 · '+s.dirs.map(x=>esc(x.name)).join(' ／ ')+'</small>' : '') +
    '<div class="actions">'+ btn(m.workId ? '確認匹配這一杼' : '用這一杼'+TYPES[m.type].action,'sfConfirm',[m.id,s.id],why?'primary':'light') +
    (s.dirs.length ? btn('選用方向與版本','sfDirection',[m.id,s.id],'link') : '') + '</div></article>';
}

function matchPage(m) {
  if (!m) return missing();
  if (m.done) return page('已匹配織光杼','這次選擇已保存。',btn('回到作品','go',['edit/'+m.done],'primary'));
  const w=findW(m.workId);
  const src=m.kind==='derive' ? '改編自 '+(version(findW(m.sourceId),m.n)?.data.title||'固定作品')+' · V'+m.n :
    w ? nameW(w) : '已選形式 · '+TYPES[m.type].name;
  return page('匹配織光杼',src,panel('這件作品要從哪一杼開始？',
    collectionNote('catalog')+(state.shuttles.map(s=>matchSummary(s,m)).join('') || (catalogs.catalog==='ready'?'<p>先給想持續探討的題目取個名字，之後就能回來創作。</p>':'')),
    btn('打造織光杼','sfNewForge',[m.id],state.shuttles.length?'match-new':'primary')),
    matchBack(m),m.workId||m.kind==='derive'?'作品':'織光堂');
}

function sfChooseDirection(mid,sid,did,revision) {
  const m=shuttleMatches()[mid], s=findS(sid);
  if (!m||!s) return;
  const w=findW(m.workId);
  if (did===undefined && w?.shuttle===sid) { did=w.direction; revision=w.understanding?.n??0; }
  const dir=s.dirs.find(d=>d.id===did);
  modal('採用的理解版本',
    shuttleSelect('sfDirectionSelect','方向',[['','採用整杼經線'],...s.dirs.map(d=>[d.id,d.name])],did,'data-match="'+esc(mid)+'" data-shuttle="'+esc(sid)+'"')+
    (dir?.vs.length?shuttleSelect('sfVersionSelect','理解版本',[[0,'先選方向'],...dir.vs.map((t,i)=>[i+1,'V'+(i+1)+' · '+t])],revision??dir.vs.length):
      dir?tip('這個方向可以先選用，理解版本日後再補。'):'')+
    btn('確認歸屬與版本','sfConfirmDirection',[mid,sid],'primary'));
}

function matchWork(m) {
  if (m.workId) return findW(m.workId);
  const w=newWork(m.type);
  if (m.kind==='derive') {
    const base=findW(m.sourceId), v=version(base,m.n);
    if (!v) return null;
    w.source={id:base.id,n:v.n,title:v.data.title};
    w.title=(v.data.title||nameW(base))+'｜'+TYPES[m.type].name;
    const text=contents(v);
    if (['audio','text'].includes(w.type)) w.body=text;
    else {
      const chunks=text.split(/\n\s*\n/).filter(Boolean).slice(0,30);
      if(chunks.length) w.units=chunks.map(x=>({...unit(),heading:x.split('\n')[0],body:x.split('\n').slice(1).join('\n')}));
    }
    if(v.data.mode==='Podcast 單集'&&w.type==='film'){
      w.episode=v.data.episode||v.data.title;
      w.mode='分章長片'; w.title=(v.data.title||nameW(base))+'｜影像版';
    }
  }
  return w;
}

function confirmMatch(mid,sid,did='',rev=0) {
  const m=shuttleMatches()[mid], s=findS(sid);
  if (!m||!s) return;
  if (m.done) { go('edit/'+m.done); return; }
  const d=s.dirs.find(x=>x.id===did);
  const n=Number(rev);
  if(did && (!d || !Number.isInteger(n) || n<0 || n>d.vs.length)) {toast('請重新選擇方向的理解版本'); return;}
  const w=matchWork(m);
  if (!w) {toast('這次來源無法讀取，請返回作品重新選擇');return;}
  const previous=structuredClone(w), wasSaved=state.works.includes(w);
  stampShuttleMatch(w,s,d,n);
  m.done=w.id;
  keep(w);
  if (!storageOK) {
    delete m.done;
    for (const key of Object.keys(w)) delete w[key];
    Object.assign(w,previous);
    if (!wasSaved) {state.works=state.works.filter(x=>x!==w);delete drafts[w.id];}
    toast('匹配未能保存，請重試');return;
  }
  wk=w.id;tab='製作';go('edit/'+w.id);
  toast('已匹配「'+s.title+'」');
}

function legacyShuttleGate(w) {
  return panel('匹配織光杼','<p>這件作品是先前保存的草稿。繼續製作時，先確認這次採用的織光杼。</p>'+btn('為這件作品匹配織光杼','sfExisting',[w.id],'primary'));
}

function getMatchesForge(mid, target='', seed) {
  const existing=!seed && Object.values(shuttleForges()).find(f=>!f.done && f.match===mid && f.target===target && !f.origin);
  if (existing) {go('forge/'+existing.id);return existing;}
  const s=findS(target);
  const f={id:uid(),match:mid,target,title:s?.title||'',core:s?.core||'',directions:[],rounds:[],note:'',date:Date.now(),
    task:target?'整理我的經線':'釐清想持續探討的題目',scope:'只帶我的想法',start:'讓 GPT 先問我',source:'',sourceName:'',question:'',touched:false};
  const m=shuttleMatches()[mid];
  if(m?.kind==='derive'){
    const v=version(findW(m.sourceId),m.n);
    if(v)Object.assign(f,{sourceName:v.data.title+' · V'+v.n,source:contents(v),scope:'加上選定的來源'});
  }
  if(seed) Object.assign(f,seed,{touched:true});
  if(s)f.baseCore=s.core;
  shuttleForges()[f.id]=f;save();go('forge/'+f.id);return f;
}

function beginForgeFromNode(node) {
  const existing=Object.values(shuttleForges()).find(f=>f.origin?.nodeId===node.nodeId && f.origin?.workId===node.workId && f.origin?.version===node.version);
  if(existing){go(existing.done?'shuttle/'+existing.done:'forge/'+existing.id);return;}
  const w=findW(node.workId),v=version(w,node.version);
  getMatchesForge('','',{title:node.title||'',note:'',source:node.body||node.title||'',
    sourceName:(v?.data.title||w?.title||'節點')+' · V'+node.version,scope:'加上選定的來源',origin:{...node}});
}
function enterForge(mid='') {
  const f=getMatchesForge(mid);
  f.cardMode='choose';save();go('forge/'+f.id);
}

function sfReturning(f) {
  if(f.match) return ['match/'+f.match,'匹配織光杼'];
  if(f.target) return ['shuttle/'+f.target,'織光杼'];
  return ['shuttles','織光杼'];
}

function shuttleForgeResume() {
  const unfinished=Object.values(shuttleForges()).filter(f=>f.touched&&!f.done && !f.target);
  if (!unfinished.length) return '';
  return panel('尚在打造的織光杼',unfinished.map(f=>row(f.title||f.note||'未命名討論',
    (shuttleMatches()[f.match]?'從「'+TYPES[shuttleMatches()[f.match].type].action+'」開始 · ':'')+
    (f.rounds.length?'討論 '+f.rounds.length+' 輪':'題目草稿'),'layers','go',['forge/'+f.id])).join(''));
}

function sfDirectionLabel(d) {return typeof d==='string'?d:d.name;}

function sfReviewRound(f,r) {
  if(r.applied) return tip(r.applied);
  if(!r.candidate) return '<div class="actions">'+btn('繼續這輪討論','sfReopenRound',[f.id,r.id],'light')+'</div>';
  const c=r.candidate, locked=!!f.target;
  const check=(name,label,text,readonly=false)=>text?'<label class="checkline"><input type="checkbox" name="'+name+'" value="'+esc(text)+'" '+(readonly?'disabled':'')+'>'+esc(label)+' · '+esc(text)+'</label>':'';
  return (c.quotes.length?'<h4>回覆引用的本人原話</h4><p>'+c.quotes.map(esc).join('<br>')+'</p>':'')+
    check('sfPickTitle','採用杼名',c.title,locked)+check('sfPickCore','採用為經線草稿',c.core)+
    c.directions.map(t=>check('sfPickDir','保留為方向',t)).join('')+
    (c.openQuestion?tip('待釐清 · '+c.openQuestion):'')+
    '<div class="actions">'+btn('採用勾選項目','sfApplyRound',[f.id,r.id],'primary')+btn('只存討論紀錄','sfRecordRound',[f.id,r.id])+'</div>';
}

const sfDiscussionGoals = {
  '釐清想持續探討的題目':'當你能指出想反覆回來追問的問題，並說出其中哪一點讓你在意，就可以收尾。這輪可以只留題目，經線留白。',
  '整理我的經線':'當你用自己的話說出目前的理解，並提出一個理由、例子、區別、適用界線或待查之處，就可以收尾。',
  '區分創作方向':'當你說得出各方向各自想回答什麼，以及差別在哪裡，就可以收尾。若你確認現在只想追一個問題，一條方向就夠。',
  '作品完成後的理解':'當你能指到作品裡的一處或一次實際運用，說出它讓你保留、修正或仍想驗證的理解，就可以收尾。也可以說明目前還看不出變化。'
};

function sfDiscussion(f, expanded=false) {
  const history=f.rounds.length ? '<h3>本次打造的討論</h3>'+f.rounds.slice().reverse().map(r=>more(r.task+' · '+(r.applied?'已收錄':r.candidate?'待本人選取':'等待回覆'),
    '<p>本輪問題 · '+esc(r.question||r.task)+'</p><p>帶出的本人想法 · '+esc(r.note||'尚未填寫')+'</p>'+
    (r.source?'<p>來源 · '+esc(r.sourceName)+'<br>'+esc(r.source)+'</p>':'')+
    '<div data-round-review="'+esc(r.id)+'">'+sfReviewRound(f,r)+'</div>')).join(''):'';
  return panel('與 GPT 討論',history+'<details'+(expanded?' open':'')+'><summary>準備新一輪討論</summary>'+
    '<div id="forgeMaterials">'+materialPicker('forge',availableMaterials,'從已有素材挑選')+'</div>'+
    pick('這輪想釐清什麼','sfTask',Object.keys(sfDiscussionGoals),f.task,'data-sf="task"')+
    '<p class="note" aria-live="polite"><strong>這輪談到哪裡就夠了？</strong><br><span id="sfGoal">'+esc(sfDiscussionGoals[f.task]||'')+'</span></p>'+
    field('我目前的想法','sfNote',f.note,true,'data-sf="note"')+
    pick('這次想帶哪一部分？','sfScope',['只帶我的想法','加上選定的來源','加上目前經線與方向',...(f.cardDrafts?.length?['帶上這次的卡片整理']:[])],f.scope,'data-sf="scope"')+
    '<div id="sfSourceBox"'+(f.scope==='加上選定的來源'?'':' hidden')+'>'+
    field('來源（閱讀筆記、野採摘錄或作品）','sfSourceName',f.sourceName,false,'data-sf="sourceName"')+
    field('我選定的片段','sfSource',f.source,true,'data-sf="source"')+'</div>'+
    pick('怎麼開始？','sfStart',['讓 GPT 先問我','從我的問題開始'],f.start,'data-sf="start"')+
    field('我想談的問題（選填）','sfQ',f.question,true,'data-sf="question"')+
    btn('產生討論包','sfGenerate',[f.id],'primary')+'</details>');
}

function forgePage(f) {
  if (!f) return missing();
  if (f.done) return page('已保存織光杼',findS(f.done)?.title||'',
    btn('查看織光杼','go',['shuttle/'+f.done],'primary')+
    (f.match?btn('回到這次創作','go',[shuttleMatches()[f.match]?.done?'edit/'+shuttleMatches()[f.match].done:'match/'+f.match]):''));
  if(!f.target&&!f.origin&&(f.cardMode==='choose'||(f.cardMode!=='topic'&&!f.touched&&!f.title&&!f.note&&!f.question&&!f.rounds.length)))return cardForgeEntry(f);
  const [backTo,backName]=sfReturning(f),m=shuttleMatches()[f.match];
  const label=f.target?'整理織光杼':'打造織光杼';
  const confirm=f.target?(m?'保存並'+TYPES[m.type].action:'確認保存這次整理'):m?'建立織光杼並'+TYPES[m.type].action:'建立織光杼';
  return page(label,m?'用於這次的'+TYPES[m.type].name+'創作':f.target?findS(f.target)?.title:'留下你想持續探討的題目。',
    btn('與 GPT 討論織光杼','go',['discussion/'+f.id],'light')+
    panel(f.target?'目前整理稿':'我想持續探討什麼？',
      field('織光杼名稱','sfTitle',f.title,false,f.target?'readonly':'data-sf="title"')+
      '<details class="optional-core"'+(f.target||f.core||f.cardDrafts?.some(u=>u.supportsCore)?' open':'')+
        '><summary>織光經線（選填）</summary>'+field('我目前對題目的核心理解','sfCore',f.core,true,'data-sf="core"')+'</details>'+
      draftUsesPanel(f)+
      (f.directions.length?'<h3>待保存的方向</h3>'+f.directions.map((d,i)=>'<div class="entry">'+esc(sfDirectionLabel(d))+' '+btn('移除','sfDropDir',[f.id,i],'tiny')+'</div>').join(''):'')+
      more('留下可分開發展的方向',field('這個方向想回答什麼？','sfManualDirection')+btn('加入這次整理','sfAddDirection',[f.id],'tiny'))+
      (f.origin?tip('來源節點 · '+f.sourceName+' ／ '+f.source):'')+
      '<div class="actions">'+btn(confirm,'sfCommitForge',[f.id],'primary')+'</div>')+
    sfDiscussion(f),backTo,backName);
}

function renderShuttleFlow(name, params) {
  if(name==='discussion') {
    const f=shuttleForges()[params[0]];
    if(f&&!f.done)return page('織光杼 GPT 討論',f.title||'',sfDiscussion(f,true),'forge/'+f.id,'立杼草稿');
    const drafts=Object.values(shuttleForges()).filter(x=>!x.done&&x.rounds.length);
    return page('織光杼 GPT 討論','',panel('討論題目',btn('準備新一輪討論','openForgeDiscussion',[],'primary'))+
      (drafts.length?panel('接續討論',drafts.map(x=>row(x.title||x.note||x.task,x.rounds.length+' 輪','chat','go',['discussion/'+x.id])).join('')):''),'home','織光堂');
  }
  if (name==='match') return matchPage(shuttleMatches()[params[0]]);
  if (name==='forge') return params[0]?forgePage(shuttleForges()[params[0]]):cardForgeEntry(null);
  return renderCardRoute(name,params);
}

function shuttleDiscussionPanel(s) {
  if (!s) return '';
  const rounds=Object.values(shuttleForges()).filter(f=>f.done===s.id && f.rounds.length).flatMap(f=>f.rounds);
  const nodes=Object.values(shuttleForges()).filter(f=>f.done===s.id&&f.origin);
  const revs=coreHistory(s);
  return (
    (revs.length?more('查看經線版本（'+revs.length+'）',revs.slice().reverse().map(v=>'<p><b>V'+v.n+'</b>　'+esc(v.text)+'</p>'+coreEvidenceHtml(v)).join('')):'')+
    (rounds.length?more('已保存的討論（'+rounds.length+'）',rounds.map(r=>'<div class="entry"><b>'+esc(r.task)+'</b><p>'+esc(r.question||r.note)+'</p><p>'+esc(r.applied||'保留紀錄')+'</p>'+ (r.candidate?'<p>'+esc([r.candidate.core,...r.candidate.directions,r.candidate.openQuestion].filter(Boolean).join(' ／ '))+'</p>':'')+'</div>').join('')):'')+
    nodes.map(f=>tip('源自 '+f.sourceName+' ／ '+f.source)).join(''));
}

function sfRoundFormat(r) {
  return {kind:'織光杼討論回傳',forgeId:r.forgeId,roundId:r.id,
    authorQuotes:[],shuttleTitle:'',coreCandidate:'',directions:[],openQuestion:''};
}

const sfShuttleRules = [
  '【織光杼的規範】',
  '卡片整理以已有的觀點、洞察與訪談為材料，可只保存卡與卡的連結理由或未決問題。同一份原話拆出的卡仍然同源。本人確認願意長期探討時才立杼，閱讀卡與 GPT 提問的身分要保留。',
  '立杼。本人選擇把一個題目留下，日後願意回來補素材、整理理解或發展方向，才提出候選杼名。本人確認名稱並建立後才成立。一個名字就足夠，經線、方向與作品數都可以是空的。',
  '辨認範圍。一段書摘、經驗或靈感先保留來源。單篇文章、圖卡、漫畫、影片或音檔是各自可編修、定稿的作品。系列名稱、同名檔案、共同來源、發布日期及形式數量都不能用來推定立杼。若只知道今天想做什麼，長期題目可以留待釐清。',
  '核心經線記「我目前怎麼理解整個題目」。方向記「同一題目下，我還想從哪個角度追問」。同一方向可以先沒有作品，也可以發展多件作品；文字、漫畫、音檔等是作品形式。作品緯線指實際用來表達的一件作品。',
  '回到同一方向的同一個問題，補例子、修正或深化理解，就保留為新的理解版本；同杼下換了要回答的問題，可以提出新方向。只有新題值得獨立長期累積，而且本人願意分開發展，才提出分支杼，並保留它與原杼、啟發作品的關係。',
  '立杼、作品歸杼、作品採用某方向的某版理解，分別由本人決定。從五種成品形式開始時先匹配杼；作品可以只歸杼，暫不採用方向。理解更新保留舊版；已定稿作品採用哪一版，看它當時保存的快照。衍生作品另記來源作品與版本。',
  '只用與本輪目標有關的判準。說清候選內容該放在哪裡及理由；已有題目就能收尾，毋須逐項訪問或填滿整張杼。'
];
function sfPrompt(r) {
  return [
    '這是一輪織光杼討論。這輪的目標：'+r.task+'。開始方式：'+r.start+'。',
    ...sfShuttleRules,
    '本輪的收尾條件：'+sfDiscussionGoals[r.task],
    '先看我帶來的想法和整輪已說過的內容。即使選了「讓 GPT 先問我」，若材料已足以達成本輪目標，直接小結。還缺一個會改變本輪結果的關鍵時，一次只問一件。若下一問只會重複、索取相似例子或開新題，停下來。',
    '可用來源理解我在意的事。書摘、你舉的例子或我的簡短附和，單獨都不足以認定為我的理解。只有我用自己的話表達理解並給出理由、例子、區別、界線或待查之處其中一項，才可提出候選經線。只釐清問題就讓經線留白。只回填本輪釐清的內容，其他候選欄位留空。',
    '達到收尾條件時，主動用一兩句話小結已釐清的部分；若有影響本題的未決點，留下一個。問我是否整理回織光堂，等我確認。若我主動要求整理，直接回傳；若我想暫停，立即停止追問，可以只保存討論。',
    '保留我本人語氣；把我的話、引用來源和你的候選分開。資料不足時留空。我的問題：'+(r.question||r.task),
    ...(r.draftTitle?['暫定杼名：'+r.draftTitle]:[]),
    '我的想法：'+(r.note||'尚未填寫'),
    '我這輪選擇的範圍：'+r.scope,
    ...(r.source?['來源：'+r.sourceName,r.source]:[]),
    '討論過程自然對話。我確認要整理回織光堂時，只回傳以下 JSON 結構；kind、forgeId、roundId 請照抄。authorQuotes 是本人說過的原句；directions 是問題字串陣列。我的採用決定會在織光堂另行確認。',
    JSON.stringify(sfRoundFormat(r),null,2)
  ].join('\n\n');
}

function sfOpenRound(f,r) {
  modal('本輪 GPT 討論包',
    more('查看織光杼規範',sfShuttleRules.slice(1).map(line=>'<p>'+esc(line)+'</p>').join(''))+
    packetControls('複製後貼到 GPT','sfPacket',sfPrompt(r),'複製討論包','sfCopyRound')+
    field('貼回本輪結束時的 JSON 回覆','sfRaw',r.raw||'',true,'data-sf-round="'+esc(r.id)+'"')+
    '<div class="actions">'+btn('使用示例回覆','sfDemo',[f.id,r.id],'tiny')+btn('預覽回覆','sfPreview',[f.id,r.id],'primary')+'</div>'+
    '<p class="alert" id="sfImportError" role="status"></p>');
}

function sfGetRound(fid,rid) {
  const f=shuttleForges()[fid],r=f?.rounds.find(x=>x.id===rid);
  return {f,r};
}

function sfDisplayReview(f,r) {
  modal('核對本輪回填','<p>'+esc(r.task)+' · '+esc(r.question||r.note||'本輪討論')+'</p><div data-round-review="'+esc(r.id)+'">'+sfReviewRound(f,r)+'</div>');
}

function sfValidateReturn(text,r) {
  const x=JSON.parse(text.trim().replace(/^```(?:json)?\s*|\s*```$/gi,''));
  if(x?.kind!=='織光杼討論回傳'||x?.forgeId!==r.forgeId||x?.roundId!==r.id) throw Error('這份回覆的討論識別不符，請貼回原本那一輪。');
  const str=(v,limit)=>{if(typeof v!=='string'||v.length>limit)throw Error('回覆欄位格式不符，請使用討論包所附的 JSON 結構。');return v.trim();};
  const list=(v,limit)=>{if(!Array.isArray(v)||v.length>12)throw Error('原話與方向請以文字陣列回傳。');return v.map(x=>str(x,limit)).filter(Boolean)};
  const out={title:str(x.shuttleTitle,160),core:str(x.coreCandidate,6000),directions:list(x.directions,900),quotes:list(x.authorQuotes,1800),openQuestion:str(x.openQuestion,1000)};
  if(![out.title,out.core,...out.directions,...out.quotes,out.openQuestion].some(Boolean)) throw Error('回覆尚無可供核對的討論內容。');
  return out;
}

function sfSaveRecord(f,r,apply) {
  if(!r||r.applied)return;
  const host=document.querySelector('#dialog[open] [data-round-review]')||
    [...document.querySelectorAll('[data-round-review]')].find(el=>el.dataset.roundReview===r.id);
  if (apply) {
    const picked=host?[...host.querySelectorAll('input:checked')]:[];
    if(!picked.length){toast('請選要採用的項目，或只存討論紀錄');return;}
    const labels=[];
    for(const input of picked){
      if(input.name==='sfPickTitle'&&!f.target){f.title=input.value;labels.push('杼名');}
      if(input.name==='sfPickCore'){f.core=input.value;labels.push('經線草稿');}
      if(input.name==='sfPickDir'&&!f.directions.includes(input.value)){f.directions.push(input.value);labels.push('方向');}
    }
    r.applied='已選入整理稿 · '+[...new Set(labels)].join('、');
  }else r.applied='只保存討論紀錄';
  f.touched=true;save();$('dialog').close();render();toast(r.applied);
}

function sfCommit(fid) {
  const f=shuttleForges()[fid];
  if(!f) return;
  if(f.done){
    const m=shuttleMatches()[f.match];
    if(m)confirmMatch(m.id,f.done);else go('shuttle/'+f.done);
    return;
  }
  const title=f.title.trim();
  if(!title){toast('請先填杼名；織光經線可稍後整理');$('sfTitle')?.focus();return;}
  if(!f.core.trim()&&f.cardDrafts?.some(use=>use.supportsCore)){
    const core=$('sfCore');const box=core?.closest('details');if(box)box.open=true;toast('已勾選經線依據，請寫下目前理解或取消勾選');core?.focus();return;
  }
  const target=findS(f.target);
  if(f.target&&!target){toast('找不到原杼，請返回重新選擇');return;}
  if(target && f.baseCore!==undefined && target.core!==f.baseCore && f.core.trim()!==target.core){
    toast('這杼的經線已有更新，請先核對最新版本再保存');
    modal('經線已更新',tip('目前經線 · '+target.core)+tip('你的整理稿 · '+f.core)+btn('保留目前經線','sfKeepLatest',[fid])+' '+btn('以整理稿另存新版','sfUseNew',[fid],'light'));
    return;
  }
  const s=target||{id:uid(),title,core:'',dirs:[],notes:[],coreVersions:[]};
  const previous=structuredClone(s);
  if(!target)state.shuttles.unshift(s);
  appendCoreVersion(s,f.core.trim(),f.rounds.length?'打造織光杼討論':'本人整理');
  commitCardUses(f,s,previous.core);
  for(const value of f.directions){
    const name=sfDirectionLabel(value);
    if(!s.dirs.some(d=>d.name===name)) s.dirs.push({id:uid(),name,vs:[]});
  }
  f.done=s.id;save();
  if(!storageOK){
    delete f.done;
    if(!target)state.shuttles=state.shuttles.filter(x=>x!==s);else state.shuttles[state.shuttles.indexOf(s)]=previous;
    toast('織光杼未能保存，請重試。');return;
  }
  const m=shuttleMatches()[f.match];
  if(m){
    if(m.done){go('edit/'+m.done);return;}
    confirmMatch(m.id,s.id);return;
  }
  go('shuttle/'+s.id);toast(target?'已保存整理結果':'已建立「'+title+'」');
}

document.addEventListener('input',e=>{
  if(route!=='forge'&&route!=='discussion')return;
  const f=shuttleForges()[args[0]],el=e.target;
  if(!f||f.done)return;
  if(el.dataset.sf){f[el.dataset.sf]=el.value;f.touched=true;save();}
  if(el.dataset.sfRound){
    const r=f.rounds.find(x=>x.id===el.dataset.sfRound);
    if(r&&!r.applied){r.raw=el.value;save();}
  }
});
document.addEventListener('change',e=>{
  const el=e.target;
  if(el.id==='sfDirectionSelect')sfChooseDirection(el.dataset.match,el.dataset.shuttle,el.value);
  if(el.id==='sfTask'&&$('sfGoal'))$('sfGoal').textContent=sfDiscussionGoals[el.value]||'';
  if(el.id==='sfScope'&&$('sfSourceBox'))$('sfSourceBox').hidden=el.value!=='加上選定的來源';
});

Object.assign(handlers,{
  new:type=>{beginShuttleMatch({type,kind:'new'});},
  doDerive:(sourceId,n,type)=>{if(version(findW(sourceId),n))beginShuttleMatch({type,kind:'derive',sourceId,n});},
  linkPick:id=>{const w=findW(id);if(w)beginShuttleMatch({type:w.type,workId:id,kind:'existing'});},
  sfExisting:id=>{const w=findW(id);if(w)beginShuttleMatch({type:w.type,workId:id,kind:'existing'});},
  sfConfirm:confirmMatch,sfDirection:sfChooseDirection,
  sfConfirmDirection:(mid,sid)=>confirmMatch(mid,sid,val('sfDirectionSelect'),val('sfVersionSelect')),
  openForgeDiscussion:fid=>{
    let f=shuttleForges()[fid];
    if(!f||f.done)f=getMatchesForge('','',{cardMode:'topic'});
    f.cardMode='topic';save();go('discussion/'+f.id);
  },
  forgeShuttle:()=>enterForge(),addShuttle:()=>enterForge(),sfNewForge:mid=>enterForge(mid),
  forgeFromNode:(title,sourceTitle,origin={})=>beginForgeFromNode({title,body:sourceTitle,version:origin.n,...origin}),
  sfDiscussExisting:sid=>{getMatchesForge('',sid);const f=Object.values(shuttleForges()).find(x=>x.target===sid&&!x.done);if(f&&f.baseCore===undefined){f.baseCore=findS(sid).core;save();}},
  sfDropDir:(id,i)=>{const f=shuttleForges()[id];if(f&&!f.done){f.directions.splice(i,1);save();render();}},
  sfAddDirection:id=>{
    const f=shuttleForges()[id],name=val('sfManualDirection');
    if(!f||f.done)return;
    if(!name){toast('請先寫下這個方向想問的問題');return;}
    if(!f.directions.some(d=>sfDirectionLabel(d)===name)&&!findS(f.target)?.dirs.some(d=>d.name===name)){
      f.directions.push(name);f.touched=true;save();render();toast('已加入待保存的方向');
    }else toast('這個方向已經存在');
  },
  sfCommitForge:sfCommit,
  sfKeepLatest:id=>{const f=shuttleForges()[id],s=findS(f.target);f.baseCore=s.core;f.core=s.core;save();closeRefresh('已保留目前經線，請重新核對');},
  sfUseNew:id=>{const f=shuttleForges()[id];f.baseCore=findS(f.target).core;save();$('dialog').close();sfCommit(id);},
  core:id=>entryDialog('織光經線','保存經線版本','saveCore',[id],findS(id).core),
  saveCore:id=>{const s=findS(id),t=val('dialogValue');if(!t){toast('請填目前的核心理解');return;}const old=s.core,versions=structuredClone(coreHistory(s));appendCoreVersion(s,t,'本人整理');save();if(!storageOK){s.core=old;s.coreVersions=versions;toast('未能保存經線，請重試');return;}closeRefresh('已保存目前經線');},
  sfGenerate:id=>{
    const f=shuttleForges()[id],s=findS(f.target);
    if(!f || f.done)return;
    if(![f.note,f.title,f.question,f.scope==='加上選定的來源'&&f.source,f.scope==='加上目前經線與方向'&&f.core,f.scope==='帶上這次的卡片整理'&&forgeCardSources(f)].some(x=>typeof x==='string'&&x.trim())){
      toast('請留下一句自己的想法、問題或選定的來源');return;
    }
    let source='',sourceName='';
    if(f.scope==='加上選定的來源'){
      if(!f.source.trim()||!f.sourceName.trim()){toast('請填來源名稱與選定的內容');return;}
      source=f.source;sourceName=f.sourceName;
    }
    if(f.scope==='加上目前經線與方向'){
      source=[f.core,...(s?.dirs||[]).map(d=>d.name+(d.vs.length?' · '+d.vs.at(-1):'')),...f.directions.map(sfDirectionLabel)].filter(Boolean).join('\n');
      sourceName='目前整理的織光經線與方向';
    }
    if(f.scope==='帶上這次的卡片整理'){source=forgeCardSources(f);sourceName='這次選定的卡片、連結與待釐清處';}
    const r={id:uid(),forgeId:id,task:f.task,question:f.question,note:f.note,draftTitle:f.title,start:f.start,scope:f.scope,source,sourceName,time:Date.now(),raw:'',applied:''};
    f.rounds.push(r);f.touched=true;save();render();sfOpenRound(f,r);
  },
  sfReopenRound:(fid,rid)=>{const {f,r}=sfGetRound(fid,rid);if(r)sfOpenRound(f,r);},
  sfCopyRound:async()=>{if(await copyText(val('sfPacket')))toast('已複製本輪討論包');else{selectForCopy('sfPacket');toast('請長按選取的討論包複製');}},
  sfDemo:(fid,rid)=>{
    const {r}=sfGetRound(fid,rid);if(!r||r.applied)return;
    const examples={
      '釐清想持續探討的題目':{shuttleTitle:'我怎麼替創作保留時間？'},
      '整理我的經線':{coreCandidate:'示例：把一頁分成幾次完成，讓我比較容易接著畫。'},
      '區分創作方向':{directions:['開始畫第一格時，我需要什麼？','畫到一半中斷後，我怎麼接回來？']},
      '作品完成後的理解':{openQuestion:'輪播的最後一頁，有沒有把我最想留下的話說清楚？'}
    };
    const x={...sfRoundFormat(r),...examples[r.task]};
    r.raw=JSON.stringify(x,null,2);$('sfRaw').value=r.raw;save();
    $('sfImportError').textContent='這是供核對操作的示例回覆。';
  },
  sfPreview:(fid,rid)=>{
    const {f,r}=sfGetRound(fid,rid);if(!r||r.applied)return;
    try {r.raw=val('sfRaw');r.candidate=sfValidateReturn(r.raw,r);save();sfDisplayReview(f,r);}
    catch(err){$('sfImportError').textContent=err instanceof SyntaxError?'格式無法辨識，請貼回完整 JSON。':err.message;}
  },
  sfApplyRound:(fid,rid)=>{const {f,r}=sfGetRound(fid,rid);if(f&&r)sfSaveRecord(f,r,true);},
  sfRecordRound:(fid,rid)=>{const {f,r}=sfGetRound(fid,rid);if(f&&r)sfSaveRecord(f,r,false);}
});

const finalizeAfterMatch=handlers.finalize;
handlers.finalize=()=>{
  const w=current();
  if(w && !findS(w.shuttle)){handlers.sfExisting(w.id);return;}
  return finalizeAfterMatch();
};
