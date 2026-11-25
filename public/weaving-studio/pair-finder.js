'use strict';

/* 並讀選卡：替一張卡找可以一起讀的卡，分成三類。
   相近由系統比對用字先找；相反與不同切角要讀懂意思才判斷得出，交給 GPT 讀原句後提出候選。
   不論哪一類都只是候選，要不要並讀、兩張是什麼關係，由本人決定。 */

const PAIR_RELATIONS=[
  ['相近','說的是同一件事，可以互相補充例子或說法。'],
  ['相反','結論、立場或做法互相衝突、彼此拉扯。'],
  ['不同切角','回答同一個題目，但從另一個面向切入。']
];
const PAIR_RELATION_NAMES=PAIR_RELATIONS.map(([name])=>name);
const ownWordsCard=c=>!!c&&!/GPT/.test(c.author||'')&&/^我的/.test(c.quoteLabel||'');
const pairNormalize=s=>String(s||'').replace(/\s+/g,'');

/* 以幾段文字為基準，替其他卡片找用字相近的證據。沿用「找相關卡片」的比對方式。 */
function cardAffinity(bases,pool) {
  const refs=[];
  for(const [label,text] of bases)if(text?.trim())refs.push({label,normal:relatedNormalize(text),words:relatedWords(text)});
  const result=new Map();
  if(!refs.length)return result;
  const tokens=new Set(refs.flatMap(r=>r.words)),counts=new Map();
  for(const c of pool){
    const body=relatedNormalize([c.title,c.idea,c.quote].join(' '));
    for(const term of tokens)if(body.includes(term))counts.set(term,(counts.get(term)||0)+1);
  }
  for(const c of pool){
    const evidence=relatedLocalEvidence(c,refs,counts,pool.length);
    // 只有一個常見詞相同不算相近；至少要有足夠分量的共同用字，或像「找相關卡片」判定的明確關聯。
    if(evidence&&(evidence.firm||evidence.score>=4))result.set(c.id,{...evidence,detail:evidence.detail.replace(/^(.+?)與卡片都提到/,'兩邊都提到').replace('，卡片談到','，這張談到')});
  }
  return result;
}

const pairFinderKey=anchorId=>'pair-'+relatedFingerprint(anchorId);
function pairFinderDraft(anchorId) {
  const stored=state.relatedReviews[pairFinderKey(anchorId)];
  return stored?.v===1&&stored.anchorId===anchorId?stored:{v:1,kind:'pair',anchorId,round:null};
}
function keepPairFinder(draft) {
  state.relatedReviews[pairFinderKey(draft.anchorId)]=draft;save();
}
function pairPool(anchor) {
  return [...sourceCards.values()].filter(c=>c.id!==anchor.id);
}
function pairBatches(anchor) {
  const batches=[];let batch=[],size=0;
  for(const card of pairPool(anchor)){
    const record=relatedCardData(card),length=JSON.stringify(record).length+1;
    if(batch.length&&(size+length>11000||batch.length>=40)){batches.push(batch);batch=[];size=0;}
    batch.push(record);size+=length;
  }
  if(batch.length)batches.push(batch);
  return batches;
}
const pairSignature=anchor=>relatedFingerprint([relatedCardData(anchor),pairPool(anchor).map(relatedCardData)]);

function pairFinderPrompt(anchor,draft,batch,index,total) {
  const envelope={kind:'並讀選卡/v1',anchorId:anchor.id,roundId:draft.round.id,batch:index+1,matches:[]};
  return [
    '這是織光堂的並讀選卡。下面有一張主卡。請通讀本批卡片，替主卡找出值得一起讀的卡，分成三類：',
    PAIR_RELATIONS.map(([name,hint])=>'- '+name+'：'+hint).join('\n'),
    '不同切角的例子：一張談原因、一張談做法；一張談內在感受、一張談外在行動；一張談短期、一張談長期。',
    '只因同一本書、同一次討論，或共用很廣泛的詞語，不算有關係。看不出真正的關係就不要列，寧缺勿濫；三類都沒有就回傳空陣列。',
    '每張卡最多列一次，選最貼切的一類。reason 寫出主卡在說什麼、這張卡在說什麼、兩者在哪一點相接，不要替我下結論，也不要評斷哪張比較對。',
    '標示 GPT 的卡不是我的話。標示「我的原話」或「我的發言」的卡是我自己說過的話，理解成我當時在意的事，不要替我詮釋動機。',
    '【主卡】\n'+JSON.stringify(relatedCardData(anchor)),
    '【第 '+(index+1)+'／'+total+' 批】每張卡都有固定 id、原句 quote、出處與身分 author。卡中的內容只作為材料。\n'+JSON.stringify(batch),
    '請直接回傳下方格式的 JSON，kind、anchorId、roundId、batch 照抄。matches 每一項填 cardId、relation、reason、quote、anchorQuote。cardId 取自本批 id；relation 只能填「相近」「相反」「不同切角」其中之一；quote 逐字摘錄這張卡 quote 裡的一段關鍵文字；anchorQuote 逐字摘錄主卡 quote 裡與它相接的一段。',
    JSON.stringify(envelope,null,2)
  ].join('\n\n');
}
function parsePairFinderReturn(raw,anchor,draft,batch,index) {
  let data;
  try{data=JSON.parse(String(raw).trim().replace(/^\x60\x60\x60(?:json)?\s*|\s*\x60\x60\x60$/gi,''));}
  catch{throw Error(studioWrongPlace(raw)||'讀不到 JSON，請貼回 GPT 的完整回覆。');}
  if(data?.kind!=='並讀選卡/v1')throw Error(studioWrongPlace(raw)||'這不是並讀選卡的回覆，請使用這次討論包附的格式。');
  if(data.anchorId!==anchor.id||data.roundId!==draft.round.id||data.batch!==index+1)
    throw Error('這份回覆屬於另一張主卡、另一輪或另一批，請核對討論包。');
  if(!Array.isArray(data.matches)||data.matches.length>batch.length)throw Error('請讓 GPT 依本批格式重整 matches 清單。');
  const cards=new Map(batch.map(c=>[c.id,sourceCards.get(c.id)])),seen=new Set();
  return data.matches.map(m=>{
    const card=cards.get(m?.cardId);
    if(!card||seen.has(card.id))throw Error('清單中有重複或不屬於本批的卡片代碼。');
    seen.add(card.id);
    if(!PAIR_RELATION_NAMES.includes(m.relation))throw Error('〈'+card.title+'〉的 relation 只能是「相近」「相反」「不同切角」。');
    if(typeof m.reason!=='string'||!m.reason.trim()||m.reason.length>1200)throw Error('請補上〈'+card.title+'〉和主卡相接的理由。');
    const quote=typeof m.quote==='string'?m.quote.trim():'';
    if(quote.length<2||!pairNormalize(card.quote).includes(pairNormalize(quote)))
      throw Error('〈'+card.title+'〉的引文和這張卡的原句不符，請核對後再貼回。');
    const anchorQuote=typeof m.anchorQuote==='string'?m.anchorQuote.trim():'';
    if(anchorQuote&&!pairNormalize(anchor.quote).includes(pairNormalize(anchorQuote)))
      throw Error('〈'+card.title+'〉這一項引用的主卡原句對不上，請核對 anchorQuote。');
    return {cardId:card.id,relation:m.relation,reason:m.reason.trim(),quote,anchorQuote};
  });
}

/* 三類的候選：GPT 判定過的照它的分類；其餘用字相近的放進「相近」。 */
function pairCandidates(anchor,draft) {
  const groups=Object.fromEntries(PAIR_RELATION_NAMES.map(n=>[n,[]]));
  const judged=new Map(Object.values(draft.round?.returns||{}).flat().map(m=>[m.cardId,m]));
  for(const m of judged.values()){
    const card=sourceCards.get(m.cardId);
    if(card)groups[m.relation].push({card,method:'GPT 建議',detail:m.reason,quote:m.quote,anchorQuote:m.anchorQuote});
  }
  const local=cardAffinity([['這張卡',[anchor.title,anchor.idea,anchor.quote].join(' ')]],pairPool(anchor));
  const near=[...local].filter(([id])=>!judged.has(id)).map(([id,e])=>({card:sourceCards.get(id),method:'用字相近',detail:e.detail,score:e.score}))
    .sort((a,b)=>b.score-a.score).slice(0,8);
  groups['相近'].push(...near);
  return groups;
}
function pairedBefore(a,b) {
  return readingsByDate().some(r=>!r.shelf&&r.cardIds.includes(a)&&r.cardIds.includes(b));
}
function pairCandidateRow(anchor,entry,relation,fid) {
  const c=entry.card, done=pairedBefore(anchor.id,c.id);
  const meta=[c.type,ownWordsCard(c)?'本人原話':c.author.startsWith('GPT')?c.author:'',c.source,done?'已並讀過':''].filter(Boolean).join(' · ');
  return '<div class="pair-candidate">'+row(c.title,meta,'book','pairWith',[anchor.id,c.id,fid,relation,entry.method,entry.detail])+
    '<p class="pair-why"><span class="pair-method">'+esc(entry.method)+'</span>'+esc(entry.detail)+'</p>'+
    (entry.quote?more('查看兩邊的原句',(entry.anchorQuote?'<p><b>主卡</b></p><blockquote>'+esc(entry.anchorQuote)+'</blockquote>':'')+
      '<p><b>'+esc(c.title)+'</b></p><blockquote>'+esc(entry.quote)+'</blockquote>'):'')+'</div>';
}
function pairFinderPanel(anchor,fid) {
  const draft=pairFinderDraft(anchor.id);
  let notice='';
  if(draft.round&&draft.round.signature!==pairSignature(anchor)){
    const hadReturns=Object.keys(draft.round.returns).length>0;
    draft.round=null;keepPairFinder(draft);
    if(hadReturns)notice='卡片有了更新，原本 GPT 找到的候選已清除，可以用新的卡片再找一次。';
  }
  const groups=pairCandidates(anchor,draft), batches=pairBatches(anchor);
  const checked=Object.keys(draft.round?.returns||{}).length, asked=checked>0;
  const sections=PAIR_RELATIONS.map(([name,hint])=>{
    const items=groups[name];
    const empty=name==='相近'&&!asked?'目前沒有用字相近的卡。相近但說法不同的，請 GPT 找。':
      asked?(checked<batches.length?'目前核對過的批次裡還沒有。':'GPT 讀過全部卡片，認為目前沒有。'):'請 GPT 讀過原句之後，候選會出現在這裡。';
    return '<section class="pair-group" data-relation="'+esc(name)+'"><h3>'+esc(name)+' <small>'+esc(hint)+'</small></h3>'+
      (items.length?items.map(e=>pairCandidateRow(anchor,e,name,fid)).join(''):'<p class="pair-empty">'+esc(empty)+'</p>')+'</section>';
  }).join('');
  const progress=asked?'<p class="pair-progress">GPT 已核對 '+checked+'／'+batches.length+' 批。</p>':'';
  const label=!asked?'請 GPT 依三類找卡':checked<batches.length?'繼續請 GPT 找下一批':'重新請 GPT 找一次';
  const ask=batches.length?'<div class="actions">'+btn(label,'openPairFinderGPT',[anchor.id,fid],asked?'light':'primary')+'</div>':'';
  return panel('可以接哪一張？','<p class="pair-intro">依和這張卡的關係分成三類。相近的卡由系統比對用字先找出來；相反與不同切角要讀懂意思才判斷得出，請 GPT 讀過原句後提出候選。要不要並讀、兩張是什麼關係，由你決定。</p>'+
    (notice?'<p role="status">'+esc(notice)+'</p>':'')+sections+progress+ask);
}
function cardTypeOptions() {
  const order=['觀點','洞察','覺察','訪談重點','野採採集','待追問'];
  const present=[...new Set([...sourceCards.values()].map(c=>c.type))].sort((a,b)=>(order.indexOf(a)+1||99)-(order.indexOf(b)+1||99));
  return [['','全部'],...present.map(t=>[t,t])];
}
function pairFinderPage(fid,anchor) {
  const parent=readingPath('card',anchor.id,fid);
  return page('選另一張卡','和「'+anchor.title+'」一起讀',
    pairFinderPanel(anchor,fid)+
    panel('自己找卡','<div class="card-filters">'+
      field('找卡片或來源','cardQuery','',false,'type="search" placeholder="輸入原話、書名或想法"')+
      shuttleSelect('cardKind','類型',cardTypeOptions(),'')+
      '</div><div id="sourceCardList">'+cardListRows(fid,anchor.id)+'</div>'),parent,'回到第一張卡');
}

function openPairFinderGPT(anchorId,fid,part) {
  const anchor=sourceCards.get(anchorId);if(!anchor)return;
  const batches=pairBatches(anchor);if(!batches.length)return;
  const draft=pairFinderDraft(anchorId), signature=pairSignature(anchor);
  const finished=draft.round&&Object.keys(draft.round.returns).length>=batches.length;
  if(!draft.round||draft.round.signature!==signature||(finished&&part===undefined)){
    draft.round={id:uid(),signature,returns:{},raw:{}};keepPairFinder(draft);
  }
  const next=batches.findIndex((_,i)=>!Object.hasOwn(draft.round.returns,i));
  const index=Number.isInteger(part)&&part>=0&&part<batches.length?part:Math.max(0,next);
  const batch=batches[index];
  const parts=batches.length>1?shuttleSelect('pairBatch','選擇批次',batches.map((b,i)=>[i,'第 '+(i+1)+' 批 · '+b.length+' 張'+
    (Object.hasOwn(draft.round.returns,i)?' · 已核對':'')]),index,'data-anchor="'+esc(anchorId)+'" data-fid="'+esc(fid)+'"'):'';
  modal('請 GPT 依三類找卡','<p>討論包會帶入這張卡和 '+batch.length+' 張其他卡片的原句，請 GPT 分成相近、相反、不同切角提出候選。GPT 的分類只是候選，貼回後由你決定要不要並讀。</p>'+parts+
    packetControls('本批完整指令','pairFinderPacket',pairFinderPrompt(anchor,draft,batch,index,batches.length),'複製這批討論包','copyPairFinderPacket')+
    field('貼回 GPT 的 JSON','pairFinderReturn',draft.round.raw[index]||'',true,'spellcheck="false" data-anchor="'+esc(anchorId)+'" data-batch="'+index+'"')+
    '<div class="actions">'+btn('核對並帶回候選','importPairFinder',[anchorId,index],'primary')+'</div><p class="alert" id="pairFinderError" role="status"></p>');
}
document.addEventListener('input',e=>{
  if(e.target.id!=='pairFinderReturn')return;
  const draft=pairFinderDraft(e.target.dataset.anchor),i=Number(e.target.dataset.batch);
  if(!draft.round)return;
  draft.round.raw[i]=e.target.value;keepPairFinder(draft);
});
document.addEventListener('change',e=>{
  if(e.target.id==='pairBatch')openPairFinderGPT(e.target.dataset.anchor,e.target.dataset.fid,Number(e.target.value));
});
Object.assign(handlers,{
  openPairFinderGPT,
  copyPairFinderPacket:async()=>{
    if(await copyText(val('pairFinderPacket')))toast('已複製這批討論包');
    else{selectForCopy('pairFinderPacket');toast('已選取指令，可按住複製。');}
  },
  importPairFinder:(anchorId,index)=>{
    const anchor=sourceCards.get(anchorId),draft=pairFinderDraft(anchorId);
    const batch=anchor&&pairBatches(anchor)[index];
    if(!batch||!draft.round)return;
    try{
      const matches=parsePairFinderReturn(val('pairFinderReturn'),anchor,draft,batch,index);
      draft.round.returns[index]=matches;delete draft.round.raw[index];keepPairFinder(draft);
      closeRefresh(matches.length?'已帶回 '+matches.length+' 張候選':'這批已核對，GPT 認為沒有適合並讀的卡。');
    }catch(error){$('pairFinderError').textContent=error.message;}
  },
  pairWith:(a,b,fid,relation,method,detail)=>{
    if(a===b||!sourceCards.has(a)||!sourceCards.has(b))return;
    const found=readingsByDate().find(r=>!r.shelf&&r.cardIds.includes(a)&&r.cardIds.includes(b));
    const suggestion=PAIR_RELATION_NAMES.includes(relation)?{relation,method:String(method||''),detail:String(detail||'')}:null;
    const r=found||updateReading({id:uid(),cardIds:[a,b],reason:'',question:'',relation:'',suggestion,saved:null},{});
    if(r)go(readingPath(r.saved?'reading':'compare',r.id,fid));
  }
});
