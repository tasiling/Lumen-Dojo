'use strict';

// Search the card's contents. Bibliographic labels and an entire discussion's
// transcript describe where a card came from, not what this particular card says.
const relatedStopWords = new Set(('自己 自我 自己的 我們 他們 目前 現在 之前 這個 那個 有的 可能 或許 可以 比較 還是 已經 有沒有 怎麼 如何 什麼 為什麼 到底 是否 因為 所以 以及 或者 應該 有時候 時候 我覺得 覺得 發現 問題 題目 部分 東西 方式 一個 一種 一些 有些 想要 能夠 事情 這件事 這些 那些 對於 關於 透過 有什麼 這樣 那樣 這裡 更加 比如 例如 這份 本人 這張 這次 這段 的確 也是 只是 真的 較為 一起 此刻 一直 之間 這麼 在於 應用 來說 本身 跟著 後來 新增 測試 觀點 洞察 關係 整理 卡片 變成 發生 來看 何時 每次 一次 當時 能否 想到 不是 就是 而已 不會 不能 其實 然後 很多 所有').split(' '));
const relatedWordFamilies = [
  ['逼迫','逼自己','不得不做','我必須','強迫','硬逼','勉強自己','硬撐'],
  ['停一下','停下來','暫停','停一停','緩一緩'],
  ['消耗','耗能','耗費','耗盡'],
  ['緊迫','緊繃','緊張','焦慮'],
  ['創作','製作作品','做作品'],
  ['回饋','回應','反饋']
];
let relatedSegmenter;
try { relatedSegmenter=new Intl.Segmenter('zh-Hant',{granularity:'word'}); } catch { /* Older browsers use adjacent characters below. */ }
const relatedNormalize = value=>String(value||'').normalize('NFKC').toLowerCase();

function relatedWords(value) {
  const text=relatedNormalize(value), words=new Set();
  function add(w){if(w.length>1&&!relatedStopWords.has(w)&&!/^\d+$/.test(w))words.add(w);}
  if(relatedSegmenter){
    let previous='';
    for(const {segment,isWordLike} of relatedSegmenter.segment(text)){
      if(isWordLike)add(segment);
      // Some proper names and specialist compounds split into single characters.
      if(isWordLike&&/^[\u3400-\u9fff]$/.test(segment)&&!/[的了是在和與而或我你他很也就先讓有能怎麼嗎把去來於一]/.test(segment)){
        if(previous)add(previous+segment);
        previous=segment;
      }else previous='';
    }
  }else{
    const clean=text.replace(/[的了是在和與而或我你他很]/g,' ');
    for(const run of clean.match(/[\u3400-\u9fff]+|[a-z0-9]+/g)||[]){
      if(/^[a-z0-9]+$/.test(run))add(run);
      else for(let i=0;i+1<run.length;i++)add(run.slice(i,i+2));
    }
  }
  for(const family of relatedWordFamilies)for(const term of family)if(text.includes(term))add(term);
  return [...words];
}

function relatedFingerprint(value) {
  const str=JSON.stringify(value);let n=2166136261;
  for(let i=0;i<str.length;i++)n=Math.imul(n^str.charCodeAt(i),16777619);
  return (n>>>0).toString(36);
}
function relatedTopic(s) {
  return {title:s.title,core:s.core||'',directions:(s.dirs||[]).map(d=>[d.name,d.vs?.at(-1)||''])};
}
function relatedLinkedIds(s,latest=state) {
  const ids=new Set();
  for(const u of s.cardUses||[]){
    const linked=u.readingId?(latest.cardReadings?.[u.readingId]?.cardIds||[]):[u.cardId];
    for(const id of linked)if(sourceCards.has(id))ids.add(id);
  }
  return ids;
}
function relatedSources(topic,focus) {
  const refs=[];
  function add(label,text){if(text?.trim())refs.push({label,normal:relatedNormalize(text),words:relatedWords(text)});}
  add('這次的重點',focus);add('杼名',topic.title);add('經線',topic.core);
  for(const [name,latest] of topic.directions){add('發展方向',name);add('方向的最新整理',latest);}
  return refs;
}
function relatedCardData(c) {
  return {id:c.id,title:c.title,type:c.type,idea:c.idea,quote:c.quote,author:c.author,
    source:c.source,location:c.location,sourceKey:c.sourceKey};
}
function relatedPairEvidence(covered,latest) {
  const evidence=new Map();
  for(const r of Object.values(latest.cardReadings||{})){
    if(!r.saved||r.shelf||!Array.isArray(r.cardIds))continue;
    const anchor=r.cardIds.find(id=>covered.has(id)),other=r.cardIds.find(id=>id!==anchor&&sourceCards.has(id));
    if(!anchor||!other)continue;
    const reason=r.saved.reason?.trim(),question=r.saved.question?.trim();
    if(!reason&&!question)continue;
    const score=reason?12:4;
    if((evidence.get(other)?.score||0)>=score)continue;
    evidence.set(other,{score,firm:!!reason,method:'已保存的並讀',
      detail:'與已連結的〈'+sourceCards.get(anchor).title+'〉有一段並讀。'+(reason?'連結理由':'待釐清的問題')+'是「'+(reason||question)+'」',readingId:r.id});
  }
  return evidence;
}

function relatedAnchorIndex(s,covered) {
  const index=new Map(),notes=new Map((s.cardUses||[]).filter(u=>u.cardId&&u.note).map(u=>[u.cardId,u.note]));
  for(const id of covered){
    const anchor=sourceCards.get(id);
    if(anchor.author.startsWith('GPT'))continue;
    for(const word of relatedWords(anchor.title+' '+(notes.get(id)||''))){
      if(!index.has(word))index.set(word,[]);
      index.get(word).push(anchor);
    }
  }
  return index;
}

function relatedAnchorEvidence(c,index) {
  if(!index.size)return null;
  const hits=new Map();
  for(const term of relatedWords([c.title,c.idea,c.quote].join(' '))){
    for(const anchor of index.get(term)||[]){
      if(!hits.has(anchor))hits.set(anchor,[]);
      hits.get(anchor).push(term);
    }
  }
  let best=null;
  for(const [anchor,terms] of hits){
    const words=[];
    for(const term of terms.sort((a,b)=>b.length-a.length))if(!words.some(w=>w.includes(term)))words.push(term);
    if(words.length<2&&!(words[0]?.length>=4&&relatedNormalize(c.title).includes(words[0])))continue;
    if(best&&best.score>=words.length)continue;
    best={score:words.length,firm:false,method:'已連結卡片的線索',
      detail:'這張卡提到'+words.slice(0,3).map(w=>'「'+w+'」').join('、')+'，也出現在已連結的〈'+anchor.title+'〉卡名或連結說明裡。'};
  }
  return best;
}

function relatedLocalEvidence(c,refs,wordCounts,total) {
  const title=relatedNormalize(c.title), quote=relatedNormalize(c.quote);
  const body=relatedNormalize([c.title,c.idea,c.quote].join(' '));
  let best=null;
  for(const ref of refs){
    const hits=ref.words.filter(t=>body.includes(t));
    const ordered=hits.map(t=>{
      const rarity=Math.log2((total+1)/((wordCounts.get(t)||0)+1));
      return {t,weight:1+Math.min(2,rarity)+(title.includes(t)?2:quote.includes(t)?0.7:0)+(t.length>=3?0.6:0)};
    }).sort((a,b)=>b.weight-a.weight||b.t.length-a.t.length);
    // An overlapping word and phrase give one signal, not two.
    const distinct=[];
    for(const w of ordered)if(!distinct.some(v=>v.t.includes(w.t)||w.t.includes(v.t)))distinct.push(w);
    let proposal;
    if(distinct.length){
      const words=distinct.slice(0,3),score=words.reduce((sum,w)=>sum+w.weight,0);
      const inTitle=words.some(w=>title.includes(w.t));
      const firm=score>=5.3 || inTitle&&(words[0].weight>=3.55||words.some(w=>w.t===ref.normal.trim()));
      proposal={score,firm,method:'文字比對',detail:ref.label+'與卡片都提到'+words.map(w=>'「'+w.t+'」').join('、')+'。'};
    }else{
      for(const family of relatedWordFamilies){
        const from=family.find(w=>ref.normal.includes(w)),to=family.find(w=>body.includes(w));
        if(from&&to&&from!==to){
          proposal={score:1,firm:false,method:'近義用詞',detail:ref.label+'提到「'+from+'」，卡片談到「'+to+'」。'};break;
        }
      }
    }
    if(proposal&&(!best||proposal.score>best.score))best=proposal;
  }
  return best;
}

function scanRelatedCards(s,focus='',includeInterviews=false,latest=state) {
  const topic=relatedTopic(s),covered=relatedLinkedIds(s,latest),refs=relatedSources(topic,focus);
  const pool=[...sourceCards.values()].filter(c=>['觀點','洞察'].includes(c.type)||(includeInterviews&&c.type==='訪談重點'));
  const tokens=new Set(refs.flatMap(r=>r.words)),counts=new Map(), pairs=relatedPairEvidence(covered,latest);
  for(const c of pool){
    const body=relatedNormalize([c.title,c.idea,c.quote].join(' '));
    for(const term of tokens)if(body.includes(term))counts.set(term,(counts.get(term)||0)+1);
  }
  const available=pool.filter(c=>!covered.has(c.id)),local=new Map();
  const anchors=relatedAnchorIndex(s,covered);
  for(const c of available){
    const pair=pairs.get(c.id),words=relatedLocalEvidence(c,refs,counts,pool.length);
    const evidence=pair?.firm?pair:words?.firm?words:pair||relatedAnchorEvidence(c,anchors)||words;
    if(evidence)local.set(c.id,evidence);
  }
  return {sid:s.id,topic,covered,pool,available,local,focus,includeInterviews,
    signature:relatedFingerprint([topic,focus,includeInterviews,available.map(relatedCardData)])};
}
