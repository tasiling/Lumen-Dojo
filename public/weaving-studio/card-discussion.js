'use strict';

function pairReturnShape(r) {
  return {kind:'卡片並讀',readingId:r.id,roundId:r.round.id,
    evidence:r.cardIds.map(cardId=>({cardId,quote:''})),reason:'',openQuestion:''};
}
function pairPrompt(r) {
  const cards=r.cardIds.map(id=>sourceCards.get(id));
  const excerpts=cards.map(c=>[c.id+'｜'+c.type+'｜'+c.title,c.source+' '+c.location+'｜'+c.author,
    '本卡可引用的原句或已確認摘要',c.quote].join('\n'));
  return [
    '這是織光堂的卡片並讀。這一輪只用下面兩張已有的卡，釐清其中哪兩句值得放在一起，以及理由。',
    '可以指出沿用、差異、適用情境、例外或仍有衝突。請指出各卡一句支持這個讀法的實際文字。兩卡出自同一次發言時明說同源。區分本人原話、訪談確認摘要、GPT 延伸及尚未回答的問題。',
    ...excerpts,
    r.round.reason&&'我寫下的連結理由\n'+r.round.reason,
    r.round.question&&'我還沒釐清的地方\n'+r.round.question,
    '若依據已足夠，直接提出一個候選讀法並收尾。缺少會改變判斷的一點時，一次問一件。也可以留下未決問題。停在這兩張卡的關係，立杼、經線與作品由本人另外決定。',
    '我要求帶回織光堂時，回傳以下 JSON。保留識別及兩張卡的代碼，evidence 的 quote 各填該卡中一段連續的原句或確認摘要。把候選連結寫在 reason，把尚待本人回答的問題寫在 openQuestion。兩者可擇一。',
    JSON.stringify(pairReturnShape(r),null,2)
  ].filter(Boolean).join('\n\n');
}
function pairRoundValue(raw,r) {
  const x=JSON.parse(raw.trim().replace(/^\x60\x60\x60(?:json)?\s*|\s*\x60\x60\x60$/gi,''));
  if(x?.kind!=='卡片並讀'||x.readingId!==r.id||x.roundId!==r.round.id)
    throw Error('這份回覆屬於另一組卡或另一輪討論。請使用本輪討論包。');
  const plain=(v,n)=>typeof v==='string'&&v.length<=n;
  if(!plain(x.reason,4000)||!plain(x.openQuestion,1600)||(!x.reason.trim()&&!x.openQuestion.trim()))
    throw Error('請保留 reason 與 openQuestion 欄位，並至少留下一個連結理由或待追問。');
  if(!Array.isArray(x.evidence)||x.evidence.length!==2) throw Error('請附上兩張卡各自的原句。');
  const normalize=s=>s.replace(/\s+/g,'');
  const evidence=r.cardIds.map(id=>{
    const matches=x.evidence.filter(v=>v?.cardId===id);
    const quote=matches[0]?.quote, card=sourceCards.get(id);
    if(matches.length!==1||!plain(quote,2500)||!quote.trim()||!normalize(card.quote).includes(normalize(quote)))
      throw Error('請核對「'+card.title+'」的卡片代碼與引用文字。引文須出自這張卡。');
    return {cardId:id,quote:quote.trim()};
  });
  return {evidence,reason:x.reason.trim(),openQuestion:x.openQuestion.trim()};
}
function openPairDiscussion(id) {
  let r=getReading(id);
  if(!r)return;
  if(!r.round)r=updateReading(r,{round:{id:uid(),raw:'',reason:r.reason,question:r.question}});
  if(!r)return;
  if(r.round.candidate){reviewPairDiscussion(r);return;}
  modal('和 GPT 並讀',
    packetControls('複製到 GPT 的討論包','pairPacket',pairPrompt(r),'複製討論包','copyPairPacket')+
    field('貼回本輪 JSON 回覆','pairReturn',r.round.raw,true,'data-pair-return="'+esc(id)+'"')+
    '<div class="actions">'+btn('核對兩處引文','checkPairReturn',[id],'primary')+
    '</div><p class="alert" role="status" id="pairError"></p>');
}
function reviewPairDiscussion(r) {
  const c=r.round.candidate;
  const quotes=c.evidence.map(e=>{
    const card=sourceCards.get(e.cardId);
    return '<div class="reading-evidence"><b>'+esc(card.source+' · '+card.author)+'</b><blockquote>'+esc(e.quote)+'</blockquote></div>';
  }).join('');
  modal('核對 GPT 的讀法',quotes+
    field('候選連結理由（可改寫）','pairCandidateReason',c.reason,true)+
    field('候選追問（可改寫）','pairCandidateQuestion',c.openQuestion,true)+
    '<div class="actions">'+btn('帶回我的整理稿','takePairReturn',[r.id],'primary')+btn('略過這個讀法','skipPairReturn',[r.id])+'</div>');
}
document.addEventListener('input',e=>{
  const id=e.target.dataset.pairReturn;
  if(!id)return;
  const r=getReading(id);
  if(r?.round)updateReading(r,{round:{...r.round,raw:e.target.value}});
});
Object.assign(handlers,{
  pairGPT:openPairDiscussion,
  copyPairPacket:async()=>{
    if(await copyText(val('pairPacket')))toast('已複製並讀討論包');
    else{selectForCopy('pairPacket');toast('請長按已選取的文字複製');}
  },
  checkPairReturn:id=>{
    const r=getReading(id);
    if(!r?.round)return;
    const raw=val('pairReturn');
    try {
      const candidate=pairRoundValue(raw,r);
      const updated=updateReading(r,{round:{...r.round,raw,candidate}});
      if(updated)reviewPairDiscussion(updated);
    } catch(e){$('pairError').textContent=e instanceof SyntaxError?'格式無法辨識，請貼回完整 JSON。':e.message;}
  },
  takePairReturn:id=>{
    const r=getReading(id);
    if(!r?.round?.candidate)return;
    const reason=val('pairCandidateReason'),question=val('pairCandidateQuestion');
    if(!reason&&!question){toast('請留下一項內容，或略過這個讀法');return;}
    if(updateReading(r,{reason,question,round:null,reviewedEvidence:r.round.candidate.evidence})){
      closeRefresh('已帶回整理稿，可再修改後保存');
    }
  },
  skipPairReturn:id=>{
    const r=getReading(id);
    if(r?.round&&updateReading(r,{round:null}))closeRefresh('已略過這個讀法');
  }
});
