'use strict';

/* 織光杼 × 閱讀系統的 Skill。
   建杼的基本流程：釐清題目用「讀書搭子」，整理經線用「拆書計畫」。
   杼頁面隨時可叫出的工具：卡片之間的關係（書籍深度蒸餾）、長出創作方向（書籍百維拆解術）、
   心智圖（mindmap）、沉澱成外腦（把好書變成 AI 外腦）。
   不論哪一個，只有本人說出的話能進經線；GPT 的判斷都是候選，由本人勾選才採用。 */

/* ---------- 建杼的基本流程：兩個討論目標換上 Skill 的問法 ----------
   問法依這次帶入的卡片而定：沒有卡、一張卡、兩張以上的問法不同；
   卡片是本人原話時，「看懂」的對象是本人當時在意什麼，而不是作者想說什麼。
   同一份內容同時顯示在討論頁（這輪的讀法）與討論包裡，讓本人看得見這輪會怎麼被問。 */
function forgeCardIds(f) {
  return [...new Set((f?.cardDrafts||[]).flatMap(cardsInUse))].filter(id=>sourceCards.has(id));
}
function forgeReadingContext(f) {
  const cards=forgeCardIds(f).map(id=>sourceCards.get(id));
  const own=cards.filter(ownWordsCard).length;
  return {count:cards.length,own,others:cards.length-own};
}
const BUDDY_NOT_YET='先求看懂，再談同不同意：在我說出「我在意的是哪一點」之前，不評論、不下結論，也不替我判斷哪張卡比較對。';
const OWN_WORDS_LINE='標示「我的原話」或「我的發言」的卡是我自己說過的話，不是作者的文字。對這些卡，「看懂」的對象是我當時在說什麼、在意什麼：用我的原話追問，不要替我詮釋動機或下心理判斷。';
const BOOK_LINE='書摘或別人說法的卡，先看懂作者在談什麼、他是怎麼說的，再問這和我有什麼關係。';
function forgeMethod(task,ctx) {
  const adapt=(steps,lines)=>{
    if(ctx.own){steps.push('你自己說過的話：看懂的是你當時在意什麼，不替你詮釋動機');lines.push(OWN_WORDS_LINE);}
    if(ctx.others){steps.push('書摘或別人的說法：先看懂作者在談什麼、怎麼說');lines.push(BOOK_LINE);}
  };
  if(task==='釐清想持續探討的題目'){
    const skill='讀書搭子（Adler《如何閱讀一本書》）';
    let summary,steps,lines;
    if(!ctx.count){
      summary='這次沒有帶入卡片，讀的是你寫下的想法：先看懂你在談什麼，再定出想反覆追問的題目。';
      steps=['先問你在談什麼、為什麼在意','在你說出在意的那一點之前，不評論也不下結論','用你說過的話定出題目'];
      lines=['依序圍繞三件事提問：我在談什麼、我為什麼在意、這和我接下來想做的事有什麼關係。',BUDDY_NOT_YET,
        '題目要用我說過的話來定，不要自己造題。','收尾時寫出題目的定稿，以及我說過「在意的那一點」的原話。'];
    }else if(ctx.count===1){
      summary='這次只帶了一張卡：先看懂這張卡在回答什麼問題，再用你的話定出題目。接上第二張卡之後，才會並列比較。';
      steps=['先找出這張卡在回答什麼問題','在你說出在意的那一點之前，不評論也不下結論','用你說過的話定出這把杼的題目'];
      lines=['這次只有一張卡。先和我一起找出這張卡在回答什麼問題：引用卡片原文並附上出處與由來，提出一到兩種可能的問法，讓我選用或改寫。',
        BUDDY_NOT_YET,'題目要用我說過的話來定，不要自己造題。','收尾時寫出題目的定稿，以及我說過「在意的那一點」的原話。'];
    }else{
      summary='這次帶了 '+ctx.count+' 張卡：先定出一個每張卡都在回答的共同問題，再逐張看各自怎麼回答，並列比較、不混成一個說法。';
      steps=['先定出每張卡都在回答的共同問題','逐張看各自怎麼回答，不同來源並列','在你說出在意的那一點之前，不評論也不下結論'];
      lines=['先和我一起定出一個「共同問題」：這把杼想反覆回來追問、而且每張卡都在回答的那一題。',
        '定出共同問題後，逐張說出它各自怎麼回答，引用卡片原文並附上出處與由來；不同來源要並列，不要混成一個說法。',
        '卡片之間若標了我判斷的關係（相近、相反、不同切角），照我的判斷理解，不要改判；相反或不同切角的卡，正好用來看共同問題的不同答案。',
        BUDDY_NOT_YET,'收尾時寫出共同問題的定稿，以及我說過「在意的那一點」的原話。'];
    }
    adapt(steps,lines);
    return {skill,summary,steps,lines};
  }
  if(task==='整理我的經線'){
    const from=ctx.count?'卡片':'我寫下的想法';
    const steps=['表面論點：'+from+'說了什麼','背後機制：為什麼會這樣','更深一層：這對你意味著什麼','最後一題只有你的經驗能回答'];
    const lines=['依序往下三層問：表面論點（'+from+'說了什麼）、背後機制（為什麼會這樣）、更深一層（這對我意味著什麼）。每一層先引用一句'+(ctx.count?'卡片原文並附出處':'我寫下的原話')+'，再提問。',
      '每一題要有摩擦力：拿我的說法和'+(ctx.count?'卡片':'我先前的說法')+'之間的落差來追問，不要只請我補充。',
      '最後一題必須是只有用我自己的經驗才能回答的問題。',
      '只有我用自己的話說出理解，並給出理由、例子、區別或適用界線其中一項，才可以提出候選經線；候選經線只能用我說過的話組成。'];
    adapt(steps,lines);
    return {skill:'拆書計畫（三層暗門）',summary:'從表面論點往下問到背後機制，最後一題只有你的經驗能回答。',steps,lines};
  }
  return null;
}
function forgeMethodHtml(f) {
  const m=f&&forgeMethod(f.task,forgeReadingContext(f));
  if(!m)return '<div class="forge-method"><h3>這輪的讀法</h3><p>這個目標沒有指定讀法，依收尾條件自然討論。</p></div>';
  return '<div class="forge-method"><h3>這輪的讀法：'+esc(m.skill)+'</h3><p>'+esc(m.summary)+'</p><ul>'+
    m.steps.map(t=>'<li>'+esc(t)+'</li>').join('')+'</ul>'+more('查看會放進討論包的問法','<ul>'+m.lines.map(t=>'<li>'+esc(t)+'</li>').join('')+'</ul>')+'</div>';
}
/* 帶入的卡片在討論包裡的連結說明：並讀的關係與理由、本人寫下想用它談什麼。 */
function forgeUseNotes(f) {
  return (f?.cardDrafts||[]).map(use=>{
    const titles=cardsInUse(use).map(id=>sourceCards.get(id)?.title).filter(Boolean);
    if(!titles.length)return '';
    const saved=getReading(use.readingId)?.saved;
    const parts=[saved?.relation&&'我判斷的關係：'+saved.relation,saved?.reason&&'連結理由：'+saved.reason,
      saved?.question&&'待釐清：'+saved.question,use.note&&'我想用它來談：'+use.note].filter(Boolean);
    return parts.length?titles.join(' × ')+'｜'+parts.join('｜'):'';
  }).filter(Boolean);
}
const baseSfPrompt=sfPrompt;
sfPrompt=function(r){
  const text=baseSfPrompt(r), f=shuttleForges()[r.forgeId], ids=forgeCardIds(f);
  const m=forgeMethod(r.task,forgeReadingContext(f));
  const add=[];
  if(m)add.push('【本輪使用的方法：'+m.skill+'】',...m.lines.map(l=>'- '+l));
  if(ids.length){
    add.push('','【這次帶入的卡片】引用時一律寫出編號、出處與由來，照記載抄寫，不得省略或改寫。');
    ids.forEach((id,i)=>{add.push('');add.push(...cardRecordLines(id,i,findS(f.target)));});
    const notes=forgeUseNotes(f);
    if(notes.length)add.push('','【我替這些卡留下的連結】',...notes);
  }
  if(!add.length)return text;
  const at=text.indexOf('討論過程自然對話。');
  return at<0?text+'\n\n'+add.join('\n'):text.slice(0,at)+add.join('\n')+'\n\n'+text.slice(at);
};
const baseGoals={...sfDiscussionGoals};
sfDiscussionGoals['釐清想持續探討的題目']=baseGoals['釐清想持續探討的題目']+' 方法：讀書搭子。';
sfDiscussionGoals['整理我的經線']=baseGoals['整理我的經線']+' 方法：拆書計畫。';

/* ---------- 討論頁：這把杼帶入的卡片放最上面，其他卡片依和這些卡的關聯排序 ---------- */
function forgeCardMeta(c) {
  return [c.type,ownWordsCard(c)?'本人原話':c.author.startsWith('GPT')?c.author:'',[c.source,c.location].filter(Boolean).join(' ')].filter(Boolean).join(' · ');
}
function forgeStagedCards(f) {
  const uses=(f.cardDrafts||[]).map((use,i)=>({use,i,cards:cardsInUse(use).map(id=>sourceCards.get(id)).filter(Boolean)})).filter(x=>x.cards.length);
  if(!uses.length)return (f.cardDrafts||[]).length&&catalogs.cards!=='ready'?collectionNote('cards'):
    '<section class="forge-cards"><h3>還沒有帶入卡片</h3><p>可以只用你寫下的想法討論，也可以從下面挑卡帶進這把杼。</p></section>';
  const n=forgeCardIds(f).length;
  return '<section class="forge-cards"><h3>這把杼帶入的卡片（'+n+' 張）</h3><ul>'+uses.map(({use,i,cards})=>{
    const saved=getReading(use.readingId)?.saved;
    return '<li><b>'+esc(cards.map(c=>c.title).join(' × '))+'</b>'+
      (cards.length===1?'<small>'+esc(forgeCardMeta(cards[0]))+'</small>':'<small>並讀'+(saved?.relation?' · '+esc(saved.relation):'')+(saved?.reason?' · '+esc(saved.reason):'')+'</small>')+
      (cards.length===1?btn('找可以並讀的卡','go',[cardIndexPath(f.id,cards[0].id)],'link'):'')+btn('移出','dropCardUse',[f.id,i],'link')+'</li>';
  }).join('')+'</ul><p>這些卡一律放進討論包，GPT 引用時會附上出處與由來。</p>'+
    '<div class="actions">'+btn('去挑卡或並讀','go',[cardIndexPath(f.id)],'tiny')+'</div></section>';
}
function forgePickRow(f,c,evidence) {
  return '<div class="entry forge-pick"><b>'+esc(c.title)+'</b><small>'+esc(forgeCardMeta(c))+'</small>'+
    (evidence?'<p class="pair-why"><span class="pair-method">用字相近</span>'+esc(evidence.detail)+'</p>':'')+
    '<div class="actions">'+btn('帶進這把杼','forgeAddCard',[f.id,c.id],'tiny')+'</div></div>';
}
function forgeCardPicker(f) {
  if(catalogs.cards!=='ready')return collectionNote('cards');
  const staged=new Set(forgeCardIds(f)), pool=[...sourceCards.values()].filter(c=>!staged.has(c.id));
  if(!pool.length)return '';
  const bases=[...staged].map(id=>sourceCards.get(id)).map(c=>['帶入的〈'+c.title+'〉',[c.title,c.idea,c.quote].join(' ')]);
  bases.push(['杼名',f.title],['我的想法',f.note]);
  const near=cardAffinity(bases,pool);
  const related=pool.filter(c=>near.has(c.id)).sort((a,b)=>near.get(b.id).score-near.get(a.id).score);
  const rest=pool.filter(c=>!near.has(c.id));
  const hasBase=staged.size||f.title?.trim()||f.note?.trim();
  if(!hasBase)return more('從已有卡片挑選（'+pool.length+' 張）',rest.map(c=>forgePickRow(f,c)).join(''));
  const gptHint=staged.size?'意思相近但說法不同、立場相反或不同切角的卡，用字比對找不到，可以按上面卡片的「找可以並讀的卡」，請 GPT 依三類找。':'';
  return more('從其他卡片挑選',
    (related.length?'<p>和這把杼用字相近的 '+related.length+' 張排在前面。'+gptHint+'</p>'+related.map(c=>forgePickRow(f,c,near.get(c.id))).join(''):
      '<p>目前沒有和這把杼用字相近的卡。'+gptHint+'</p>')+
    (rest.length?more('其他卡片（看不出關聯，'+rest.length+' 張）',rest.map(c=>forgePickRow(f,c)).join('')):''));
}
function forgeMaterialsHtml(f) {
  return f?forgeStagedCards(f)+forgeCardPicker(f):'';
}
handlers.forgeAddCard=(fid,id)=>{
  const f=shuttleForges()[fid];
  if(!f||f.done||!sourceCards.has(id))return;
  const before=structuredClone(f);
  f.cardDrafts||=[];
  if(f.cardDrafts.some(u=>cardsInUse(u).includes(id))){toast('這張卡已經在這把杼裡');return;}
  f.cardDrafts.push({cardId:id,entryId:id,note:'',supportsCore:false});
  f.touched=true;save();
  if(!storageOK){shuttleForges()[fid]=before;toast('未能帶入，請重試');return;}
  render();
  const host=$('forgeMaterials');
  host?.closest('details')?.setAttribute('open','');
  host?.scrollIntoView({block:'start'});
  toast('已帶進這把杼');
};

/* ---------- 杼頁面的四個工具 ---------- */
const ANGLE_PURPOSES={
  method:{name:'提取可行動的方法',hint:'把這把杼變成能重複使用的做法'},
  critique:{name:'找出論點的漏洞',hint:'看見盲區、前提與不成立的條件'},
  compare:{name:'對照不同來源',hint:'找出卡片之間的共振與衝突'},
  material:{name:'找創作素材',hint:'拆出能延伸成作品的切入點'},
  understand:{name:'把題目讀透',hint:'只是想更深地理解'}
};
const ANGLES=[
  ['negative','負空間','這些卡片都沒說到、刻意避開的是什麼'],
  ['adversary','對抗','最強的反方會怎麼說'],
  ['stress','應力測試','在什麼條件下這個理解就不成立'],
  ['archaeology','考古','這個說法是從哪裡來、為什麼會被這樣講'],
  ['transfer','遷移','換到另一個領域或另一種人身上還成立嗎'],
  ['time','時間','十年前、十年後，這件事會怎麼變'],
  ['multi','多方','不同處境的人會怎麼用這個理解'],
  ['translate','翻譯','換成一個比喻或白話來說'],
  ['generate','生成','由此可以推出什麼新的做法'],
  ['emergence','湧現','把幾張卡合起來，出現了什麼單看看不到的東西'],
  ['anatomy','骨架','把理解拆成幾個關鍵零件與它們的關係'],
  ['blackbox','黑箱','哪一步是「就這樣發生了」卻沒說明的']
];
const SUGGESTED_ANGLES={method:['anatomy','generate','stress'],critique:['negative','adversary','stress'],compare:['emergence','multi','archaeology'],material:['translate','negative','transfer'],understand:['anatomy','archaeology','time']};

const shuttleToolState={};
const stTool=sid=>shuttleToolState[sid]||={purpose:'material',angles:[...SUGGESTED_ANGLES.material]};

function shuttleMaterial(s) {
  const ids=shuttleCardIds(s), L=['【織光杼】'+s.title];
  const core=coreHistory(s).at(-1);
  L.push('目前的核心理解（經線）：'+(s.core||'（尚未寫下）'));
  if(core)L.push('經線的由來：第 '+core.n+' 版，'+(core.from||'未註明'));
  if(s.dirs.length){L.push('','【方向】');s.dirs.forEach((d,i)=>L.push('D'+(i+1)+'｜'+d.name+(d.vs.length?'｜目前理解：'+d.vs.at(-1):'')));}
  L.push('','【這一杼的卡片】引用時一律寫出編號、出處與由來，照記載抄寫，不得省略或改寫。');
  if(!ids.length)L.push('（這一杼還沒有連結卡片）');
  ids.forEach((id,i)=>{L.push('');L.push(...cardRecordLines(id,i,s));});
  if(s.relations?.length){L.push('','【已確認的卡片關係】');s.relations.forEach(r=>L.push(r.a+'×'+r.b+'｜'+r.kind+'｜'+r.why));}
  return {text:L.join('\n'),ids};
}
const COMMON_RULES=['只能使用上面的經線、方向、卡片與我的回答，不增加新的觀點或例子；需要外部資料時標示「待查證」。',
  '引用我的話必須逐字；你自己的判斷與推論要標示「尚未由本人確認」。',
  '標示為「GPT 延伸」的卡片不是我的話。'];

const SHUTTLE_TOOLS={
  relations:{name:'卡片之間的關係',skill:'書籍深度蒸餾',hint:'逐對判定卡片是互補、分歧還是證據不足，附兩邊出處。',
    need:s=>shuttleCardIds(s).length>=2?'':'這一杼至少要有兩張卡片才能判定關係。',
    settings:()=>'',
    prompt:(s,m)=>[m.text,'','【任務：卡片之間的關係（方法：書籍深度蒸餾）】',
      '- 逐對檢視卡片，只判定三種關係：互補、分歧、證據不足。看不出關係的組合不要列。',
      '- 每一個判定都要引用兩邊的原文並寫出各自的出處，說明判定的理由；不要把兩邊合成一個結論。',
      '- 判定「分歧」時，寫出分歧落在哪一點，不要替我決定誰對。',
      '- 判定是你的候選，由我確認後才保存。',
      ...COMMON_RULES.map(r=>'- '+r),'',
      '【回傳格式】整段放在一個程式碼區塊裡，標記行照抄，一個判定一行。',
      '===織光杼卡片關係/v1===','K1×K2｜互補｜理由（引用兩邊原文與出處）','===待我判斷===','- （你無法判定、需要我回答的地方）','===結束==='].join('\n'),
    parse:raw=>section(raw,'織光杼卡片關係/v1').map(l=>l.match(/^\s*(K\d+)\s*[×xX*]\s*(K\d+)\s*[｜|]\s*(互補|分歧|證據不足)\s*[｜|]\s*(.+)$/)).filter(Boolean).map(m=>({a:m[1],b:m[2],kind:m[3],why:m[4].trim()})),
    row:x=>'<b>'+esc(x.a+' × '+x.b)+'</b>　<span class="rel-kind" data-kind="'+esc(x.kind)+'">'+esc(x.kind)+'</span><p>'+esc(x.why)+'</p>',
    apply:(s,picked,m)=>{
      s.relations||=[];
      for(const x of picked){
        const ia=m.ids[Number(x.a.slice(1))-1], ib=m.ids[Number(x.b.slice(1))-1];
        const ca=sourceCards.get(ia), cb=sourceCards.get(ib);
        s.relations=s.relations.filter(r=>!(r.cardA===ia&&r.cardB===ib));
        s.relations.push({...x,cardA:ia,cardB:ib,a:ca?.title||x.a,b:cb?.title||x.b,at:Date.now()});
      }
      return '已保存 '+picked.length+' 個卡片關係';
    }},
  angles:{name:'長出創作方向',skill:'書籍百維拆解術',hint:'先選目的，再挑兩三個角度，每個角度長出一條候選方向。',
    need:s=>s.core||shuttleCardIds(s).length?'':'這一杼還沒有經線，也沒有卡片，先寫一點核心理解或連結卡片。',
    settings:(s)=>{const t=stTool(s.id);
      return '<fieldset class="angle-purpose"><legend>這次拆解的目的</legend>'+Object.entries(ANGLE_PURPOSES).map(([k,p])=>
        '<label class="check"><input type="radio" name="anglePurpose" value="'+k+'"'+(t.purpose===k?' checked':'')+'><span><b>'+esc(p.name)+'</b><small>'+esc(p.hint)+'</small></span></label>').join('')+'</fieldset>'+
        '<fieldset class="angle-pick"><legend>角度（建議兩到三個）</legend>'+ANGLES.map(([k,n,h])=>
        '<label class="check"><input type="checkbox" name="anglePick" value="'+k+'"'+(t.angles.includes(k)?' checked':'')+'><span><b>'+esc(n)+'</b><small>'+esc(h)+'</small></span></label>').join('')+'</fieldset>';},
    prompt:(s,m)=>{const t=stTool(s.id), picks=ANGLES.filter(([k])=>t.angles.includes(k));
      return [m.text,'','【任務：長出創作方向（方法：書籍百維拆解術）】','本次目的：'+ANGLE_PURPOSES[t.purpose].name+'——'+ANGLE_PURPOSES[t.purpose].hint,
        '使用的角度：',...picks.map(([,n,h])=>'- '+n+'：'+h),
        '- 每個角度提出一到兩條方向。方向要寫成一個「我還想追問的問題」，不是結論，也不是作品標題。',
        '- 每條方向寫出它從哪個角度來、依據哪幾張卡（K 編號）或我的哪一句話。',
        '- 不要和已有的方向（D 編號）重複；接近的話，說明差別在哪裡。',
        ...COMMON_RULES.map(r=>'- '+r),'',
        '【回傳格式】整段放在一個程式碼區塊裡，標記行照抄，一條方向一行。',
        '===織光杼方向候選/v1===','要追問的問題｜角度｜依據（K 編號或我的話）','===結束==='].join('\n');},
    parse:raw=>section(raw,'織光杼方向候選/v1').map(l=>l.split(/[｜|]/).map(x=>x.trim())).filter(p=>p[0]&&!/^要追問的問題$/.test(p[0])).map(p=>({q:p[0].replace(/^[-・•]\s*/,''),angle:p[1]||'',basis:p.slice(2).join('｜')})),
    row:x=>'<b>'+esc(x.q)+'</b><p>'+esc([x.angle&&'角度：'+x.angle,x.basis&&'依據：'+x.basis].filter(Boolean).join('　'))+'</p>',
    apply:(s,picked)=>{for(const x of picked)if(!s.dirs.some(d=>d.name===x.q))s.dirs.push({id:uid(),name:x.q,vs:[],from:'百維拆解 · '+x.angle+(x.basis?' · 依據 '+x.basis:'')});return '已保留 '+picked.length+' 條新方向';}},
  brain:{name:'沉澱成外腦',skill:'把好書變成 AI 外腦',hint:'經線穩定後，把這把杼整理成可重複使用的思考框架。',
    need:s=>s.core?'':'這一杼還沒有經線。外腦要從你自己的核心理解長出來，先寫下經線。',
    settings:()=>'',
    prompt:(s,m)=>[m.text,'','【任務：沉澱成外腦（方法：把好書變成 AI 外腦）】',
      '- 把這把杼整理成一份可以重複使用的思考框架，之後我用這把杼創作時會帶上它。',
      '- 框架的主張只能來自我的經線、方向與卡片；每一條都標明依據（經線、D 編號或 K 編號）。',
      '- 你自己歸納出的結構，標示「GPT 歸納，尚未由本人確認」。',
      '- 不要寫成文章，只寫框架。',
      ...COMMON_RULES.map(r=>'- '+r),'',
      '【回傳格式】整段放在一個程式碼區塊裡，標記行照抄。',
      '===織光杼外腦/v1===','## 一句話（我的經線）','## 核心框架（概念與它們的關係，附依據）','## 什麼時候用（可以觸發這把杼的題目或情境）',
      '## 創作時自問的問題','## 邊界（不適用、或還沒驗證的地方）','===結束==='].join('\n'),
    parse:raw=>{const body=section(raw,'織光杼外腦/v1').join('\n').trim();return body?[{text:body}]:[];},
    row:x=>'<pre class="brain-text">'+esc(x.text)+'</pre>',
    apply:(s,picked)=>{s.brain={text:picked[0].text,at:Date.now()};return '已保存這一杼的外腦，之後起稿會帶上它';}}
};

function section(raw,format){
  const lines=String(raw||'').replace(/\r/g,'').split('\n').filter(l=>!/^\s*```/.test(l));
  let on=false;const out=[];
  for(const l of lines){
    const m=l.match(/^\s*=+\s*(.+?)\s*=+\s*$/);
    if(m){on=m[1].replace(/\s+/g,'')===format.replace(/\s+/g,'');continue;}
    if(on&&l.trim())out.push(l);
  }
  return out;
}

/* ---------- 心智圖：直接從杼的資料畫出來，不需要 GPT ---------- */
function shuttleMindmap(s) {
  const ids=shuttleCardIds(s), L=['# '+s.title,'','## 經線','- '+(s.core||'（尚未寫下）')];
  if(s.dirs.length){L.push('','## 方向');s.dirs.forEach(d=>{L.push('### '+d.name);if(d.vs.length)L.push('- '+d.vs.at(-1));});}
  if(ids.length){
    L.push('','## 卡片');
    const byType={};ids.forEach(id=>{const c=sourceCards.get(id);(byType[c.type]||=[]).push(c);});
    for(const [type,cards] of Object.entries(byType)){L.push('### '+type);cards.forEach(c=>L.push('- '+(c.idea||c.title)+'（'+[c.source,c.location].filter(Boolean).join(' · ')+'）'));}
  }
  if(s.relations?.length){L.push('','## 卡片之間');s.relations.forEach(r=>L.push('- '+r.a+' × '+r.b+'：'+r.kind));}
  if(s.brain?.text)L.push('','## 外腦','- 已沉澱（'+new Date(s.brain.at).toLocaleDateString('zh-TW')+'）');
  return L.join('\n');
}
function mindmapTree(md) {
  // A collapsible outline of the same Markdown, so the map can be read on a phone without rendering tools.
  const rows=md.split('\n').filter(Boolean), root={children:[]}, stack=[{depth:0,node:root}];
  for(const line of rows){
    const h=line.match(/^(#+)\s+(.*)$/), b=line.match(/^-\s+(.*)$/);
    const depth=h?h[1].length:(stack.at(-1).depth+1), text=h?h[2]:b?b[1]:line;
    const node={text,children:[]};
    while(stack.length>1&&stack.at(-1).depth>=depth)stack.pop();
    stack.at(-1).node.children.push(node);
    if(h)stack.push({depth,node});
  }
  const draw=n=>n.children.length?'<details open><summary>'+esc(n.text)+'</summary><ul>'+n.children.map(c=>'<li>'+draw(c)+'</li>').join('')+'</ul></details>':esc(n.text);
  return '<div class="mindmap-tree">'+root.children.map(draw).join('')+'</div>';
}
function mindmapDialog(s) {
  const md=shuttleMindmap(s);
  modal('這一杼的心智圖',
    '<p>由這把杼的經線、方向、卡片與卡片關係直接畫出，資料更新後重新打開就會跟著更新。</p>'+mindmapTree(md)+
    '<div class="actions">'+btn('複製心智圖（Markmap 格式）','shuttleMindmapCopy',[s.id],'primary')+btn('複製給心智圖 Skill 的指令','shuttleMindmapSkill',[s.id])+'</div>'+
    more('查看 Markmap 原文','<pre class="brain-text">'+esc(md)+'</pre>'));
}

/* ---------- 工具視窗：設定 → 指令 → 貼回 → 勾選採用 ---------- */
let toolParsed=[];
function shuttleToolDialog(s,key) {
  const t=SHUTTLE_TOOLS[key], blocked=t.need(s);
  if(blocked){modal(t.name,'<p>'+esc(blocked)+'</p>');return;}
  const m=shuttleMaterial(s);
  toolParsed=[];
  modal(t.name+'｜'+t.skill,
    '<p>'+esc(t.hint)+'</p>'+t.settings(s)+
    '<div class="actions">'+btn('複製給 GPT 的指令','shuttleToolCopy',[s.id,key],'primary')+'</div>'+
    more('查看指令全文','<textarea id="shuttleToolPrompt" readonly rows="10">'+esc(t.prompt(s,m))+'</textarea>')+
    field('貼回 GPT 的結果','shuttleToolReturn','',true)+
    '<div class="actions">'+btn('檢查並列出候選','shuttleToolCheck',[s.id,key],'light')+'</div><div id="shuttleToolPicks"></div>');
}
function shuttleToolsPanel(s) {
  const ids=shuttleCardIds(s);
  const tools=[['relations','卡片之間的關係'],['angles','長出創作方向'],['mindmap','心智圖'],['brain','沉澱成外腦']];
  const skillOf={relations:'書籍深度蒸餾',angles:'書籍百維拆解術',mindmap:'心智圖',brain:'把好書變成 AI 外腦'};
  const done={relations:s.relations?.length?'已保存 '+s.relations.length+' 個':'',angles:s.dirs.length?'目前 '+s.dirs.length+' 條方向':'',mindmap:ids.length?ids.length+' 張卡片':'',brain:s.brain?'已沉澱':''};
  const rel=s.relations?.length?more('已確認的卡片關係（'+s.relations.length+'）',s.relations.map(r=>'<div class="entry"><b>'+esc(r.a)+' × '+esc(r.b)+'</b>　<span class="rel-kind" data-kind="'+esc(r.kind)+'">'+esc(r.kind)+'</span><p>'+esc(r.why)+'</p>'+
    btn('移除','shuttleRelationDrop',[s.id,s.relations.indexOf(r)],'tiny')+'</div>').join('')):'';
  const brain=s.brain?more('這一杼的外腦（'+new Date(s.brain.at).toLocaleDateString('zh-TW')+'）','<pre class="brain-text">'+esc(s.brain.text)+'</pre>'+
    '<div class="actions">'+btn('複製成 Skill 格式','shuttleBrainCopy',[s.id],'tiny')+btn('移除外腦','shuttleBrainDrop',[s.id],'tiny')+'</div>'):'';
  return panel('這一杼的工具','<p>需要時再用，不必每次走完。每個工具都只把候選交給你勾選。</p><div class="shuttle-tools">'+tools.map(([k,n])=>
    '<button type="button" class="shuttle-tool"'+act('shuttleTool',s.id,k)+'><b>'+esc(n)+'</b><small>'+esc(skillOf[k])+(done[k]?' · '+esc(done[k]):'')+'</small></button>').join('')+'</div>'+rel+brain);
}
function brainAsSkill(s) {
  const slug='shuttle-'+String(s.id).slice(0,8);
  return ['---','name: '+slug,'description: 「'+s.title+'」這把織光杼的思考框架。創作與這個題目相關的作品時使用；主張出自本人的經線與卡片。','---','','# '+s.title,'',s.brain.text].join('\n');
}

/* ---------- 接到織光杼頁面與起稿 ---------- */
const baseShuttlePage=shuttle;
shuttle=function(s){
  const html=baseShuttlePage(s);
  if(!s)return html;
  const at=html.indexOf('<section class="panel"><div class="sectionhead"><h2>方向與理解版本');
  return at<0?html+shuttleToolsPanel(s):html.slice(0,at)+shuttleToolsPanel(s)+html.slice(at);
};
const draftWithoutBrain=draftPrompt;
draftPrompt=function(w,mode){
  const text=draftWithoutBrain(w,mode), s=findS(w.shuttle);
  const extra=[];
  if(s?.brain?.text)extra.push('【這一杼的外腦】寫作時用這份框架檢查骨架是否偏離這把杼。框架裡標示「GPT 歸納」的部分不是我的話。',s.brain.text);
  if(s?.relations?.length)extra.push('【已確認的卡片關係】',...s.relations.map(r=>r.a+' × '+r.b+'｜'+r.kind+'｜'+r.why));
  if(!extra.length)return text;
  const at=text.indexOf('【正文目前的內容】');
  return text.slice(0,at)+extra.join('\n')+'\n\n'+text.slice(at);
};

Object.assign(handlers,{
  shuttleTool:(sid,key)=>{const s=findS(sid);if(!s)return;if(key==='mindmap')mindmapDialog(s);else shuttleToolDialog(s,key);},
  shuttleToolCopy:async(sid,key)=>{
    const s=findS(sid);if(!s)return;
    const text=SHUTTLE_TOOLS[key].prompt(s,shuttleMaterial(s));
    if($('shuttleToolPrompt'))$('shuttleToolPrompt').value=text;
    if(await copyText(text))toast('已複製，貼到 GPT 後把結果貼回來');else{const el=$('shuttleToolPrompt');el.closest('details').open=true;el.select();toast('請長按複製選取的指令');}
  },
  shuttleToolCheck:(sid,key)=>{
    const s=findS(sid), t=SHUTTLE_TOOLS[key], raw=val('shuttleToolReturn');
    if(!s)return;
    if(!raw){toast('先貼入 GPT 的結果');return;}
    if(studioWrongPlace(raw)){$('shuttleToolPicks').innerHTML='<p class="statusline">'+esc(studioWrongPlace(raw))+'</p>';return;}
    toolParsed=t.parse(raw);
    const box=$('shuttleToolPicks');
    if(!toolParsed.length){box.innerHTML='<p class="statusline">找不到可以採用的內容。請確認 GPT 有照回傳格式輸出，標記行也要照抄。</p>';return;}
    box.innerHTML='<h3>勾選要採用的</h3>'+toolParsed.map((x,i)=>'<label class="check tool-pick-row"><input type="checkbox" name="shuttleToolPick" value="'+i+'"'+(key==='brain'?' checked':'')+'><span>'+t.row(x)+'</span></label>').join('')+
      '<div class="actions">'+btn('採用勾選的項目','shuttleToolApply',[sid,key],'primary')+'</div>';
  },
  shuttleToolApply:(sid,key)=>{
    const s=findS(sid);if(!s)return;
    const picked=[...document.querySelectorAll('input[name="shuttleToolPick"]:checked')].map(n=>toolParsed[Number(n.value)]).filter(Boolean);
    if(!picked.length){toast('請先勾選要採用的項目');return;}
    const before=structuredClone({relations:s.relations,dirs:s.dirs,brain:s.brain});
    const msg=SHUTTLE_TOOLS[key].apply(s,picked,shuttleMaterial(s));
    save();
    if(!storageOK){Object.assign(s,before);return;}
    closeRefresh(msg);
  },
  shuttleRelationDrop:(sid,i)=>{const s=findS(sid);if(!s?.relations?.[i])return;s.relations.splice(i,1);save();render();toast('已移除這個關係');},
  shuttleBrainDrop:(sid)=>{const s=findS(sid);if(!s)return;delete s.brain;save();render();toast('已移除外腦');},
  shuttleBrainCopy:async(sid)=>{const s=findS(sid);if(!s?.brain)return;if(await copyText(brainAsSkill(s)))toast('已複製，可存成你自己的 Skill');else toast('請長按手動複製');},
  shuttleMindmapCopy:async(sid)=>{const s=findS(sid);if(s&&await copyText(shuttleMindmap(s)))toast('已複製 Markmap 格式');},
  shuttleMindmapSkill:async(sid)=>{
    const s=findS(sid);if(!s)return;
    const text='/mindmap-zh --lang zh-Hant --render\n請把下面這份大綱畫成可互動的心智圖，保持原有層級與文字，不要增刪內容，使用繁體中文。\n\n'+shuttleMindmap(s);
    if(await copyText(text))toast('已複製給心智圖 Skill 的指令');
  }
});
document.addEventListener('change',e=>{
  const s=route==='shuttle'&&findS(args[0]);
  if(!s)return;
  const t=stTool(s.id);
  if(e.target.name==='anglePurpose'){t.purpose=e.target.value;t.angles=[...SUGGESTED_ANGLES[t.purpose]];
    document.querySelectorAll('input[name="anglePick"]').forEach(n=>{n.checked=t.angles.includes(n.value);});}
  else if(e.target.name==='anglePick'){t.angles=[...document.querySelectorAll('input[name="anglePick"]:checked')].map(n=>n.value);}
  else return;
  if($('shuttleToolPrompt'))$('shuttleToolPrompt').value=SHUTTLE_TOOLS.angles.prompt(s,shuttleMaterial(s));
});
