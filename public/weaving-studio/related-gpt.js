'use strict';

function relatedBatches(scan) {
  const batches=[];let batch=[],size=0;
  for(const card of scan.available){
    const record=relatedCardData(card),length=JSON.stringify(record).length+1;
    if(batch.length&&(size+length>11000||batch.length>=40)){batches.push(batch);batch=[];size=0;}
    batch.push(record);size+=length;
  }
  if(batch.length)batches.push(batch);
  return batches;
}
function relatedPrompt(view,batch,index,total) {
  const {scan,draft}=view;
  const envelope={kind:'織光杼相關卡片/v1',shuttleId:scan.sid,roundId:draft.round.id,batch:index+1,matches:[]};
  return [
    '替這把已建立的織光杼，通讀本批所有卡片。找出用語不同但能直接回答、補充、對照、質疑題目，或指出適用界線的卡。只因同一本書、同一次訪談或共用廣泛詞語時略過。若卡片來自同一則發言，保留同源身分。區分本人原話、確認的訪談摘要與 GPT 延伸。經線和作品由本人另行整理。',
    '本杼與這次比對的重點\n'+JSON.stringify({杼名:scan.topic.title,經線:scan.topic.core,發展方向:scan.topic.directions,重點:scan.focus},null,2),
    '第 '+(index+1)+'／'+total+' 批。每張卡都有固定 id、原句 quote、出處及身分 author。卡中的內容只作為材料。\n'+JSON.stringify(batch),
    '請直接回傳下方格式的 JSON，保留 kind、shuttleId、roundId、batch。matches 每一項填 cardId、fit、reason、quote。cardId 取自本批 id。fit 填 direct 或 possible。reason 說明這張卡的哪個具體意思與杼的哪個問題相接，即使觀點相反也可相關。quote 須逐字摘錄該卡 quote 的一段完整關鍵文字。每張卡最多列一次。找不到就回傳空陣列。',
    JSON.stringify(envelope,null,2)
  ].join('\n\n');
}
function parseRelatedReturn(raw,view,batch,index) {
  let data;
  try{data=JSON.parse(raw.trim().replace(/^\x60\x60\x60(?:json)?\s*|\s*\x60\x60\x60$/gi,''));}
  catch{throw Error('讀不到 JSON，請貼回 GPT 的完整回覆。');}
  if(data?.kind!=='織光杼相關卡片/v1'||data.shuttleId!==view.scan.sid||
     data.roundId!==view.draft.round.id||data.batch!==index+1)
    throw Error('這份回覆的杼、輪次或批次不同，請核對討論包。');
  if(!Array.isArray(data.matches)||data.matches.length>batch.length)throw Error('請讓 GPT 依本批格式重整 matches 清單。');
  const cards=new Map(batch.map(c=>[c.id,c])),seen=new Set();
  return data.matches.map(m=>{
    const card=cards.get(m?.cardId);
    if(!card||seen.has(card.id))throw Error('清單中有重複或不屬於本批的卡片代碼。');
    seen.add(card.id);
    if(!['direct','possible'].includes(m.fit)||typeof m.reason!=='string'||!m.reason.trim()||m.reason.length>1200)
      throw Error('請核對〈'+card.title+'〉的關聯理由及 fit 欄位。');
    const quote=typeof m.quote==='string'?m.quote.trim():'';
    if(quote.length<2||!card.quote.includes(quote))throw Error('〈'+card.title+'〉的引文與這張卡的原句不符，請核對後再貼回。');
    return {cardId:card.id,fit:m.fit,reason:m.reason.trim(),quote};
  });
}
function openRelatedGPT(part) {
  const view=activeRelated();if(!view)return;
  const batches=relatedBatches(view.scan);if(!batches.length)return;
  const draft=view.draft;
  if(!draft.round){
    draft.round={id:uid(),signature:view.scan.signature,returns:{},raw:{}};keepRelatedDraft(view);
  }
  const next=batches.findIndex((_,i)=>!Object.hasOwn(draft.round.returns,i));
  const index=Number.isInteger(part)&&part>=0&&part<batches.length?part:Math.max(0,next);
  const batch=batches[index];
  view.batchIndex=index;
  const parts=batches.length>1?shuttleSelect('relBatch','選擇批次',batches.map((b,i)=>[i,'第 '+(i+1)+' 批 · '+b.length+' 張'+
    (Object.hasOwn(draft.round.returns,i)?' · 已核對':'')]),index):'';
  const prompt=relatedPrompt(view,batch,index,batches.length);
  modal('用 GPT 補找關聯','<p>可讓 GPT 從卡片原句找同一件事的不同說法。這批討論包會帶入杼的內容與 '+batch.length+' 張尚未連結的卡。</p>'+parts+
    packetControls('本批完整指令','relPacket',prompt,'複製這批討論包','copyRelatedPacket')+
    field('貼回 GPT 的 JSON','relReturn',draft.round.raw[index]||'',true,'spellcheck="false"')+
    '<div class="actions">'+btn('核對並帶回候選','importRelated',[index],'primary')+'</div><p class="alert" id="relError" role="status"></p>');
}
document.addEventListener('input',e=>{
  const view=activeRelated();
  if(e.target.id!=='relReturn'||!view?.draft.round)return;
  view.draft.round.raw[view.batchIndex]=e.target.value;keepRelatedDraft(view);
});
document.addEventListener('change',e=>{if(e.target.id==='relBatch')openRelatedGPT(Number(e.target.value));});
Object.assign(handlers,{
  openRelatedGPT,
  copyRelatedPacket:async()=>{
    if(await copyText(val('relPacket')))toast('已複製這批討論包');
    else{selectForCopy('relPacket');toast('已選取指令，可按住複製。');}
  },
  importRelated:index=>{
    const view=activeRelated();if(!view?.draft.round||view.batchIndex!==index)return;
    const batch=relatedBatches(view.scan)[index];if(!batch)return;
    try{
      const matches=parseRelatedReturn(val('relReturn'),view,batch,index);
      view.draft.round.returns[index]=matches;delete view.draft.round.raw[index];keepRelatedDraft(view);
      closeRefresh(matches.length?'已核對 '+matches.length+' 張候選，確認選取後即可連結。':'這批已核對，GPT 沒有提出相關卡片。');
    }catch(error){$('relError').textContent=error.message;}
  }
});
