'use strict';

/* 道藏 ⇄ 織光杼。
   從道藏「開成織光杼」會打開 #dao/<問題編號>：用問題當杼名、現在的理解當經線、連結的來源當卡片，建好就打開那把杼。
   杼頁面的「存回道藏」把經線存成某個長期問題的一次新理解，杼上的卡片一起連成來源。 */

const DAO_API='/api/dojo/dao-questions';
const daoPending=new Set();

async function daoRequest(url,init) {
  const response=await fetch(url,{credentials:'same-origin',cache:'no-store',...init});
  const body=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(body.error||'目前無法連到道藏。');
  return body;
}
const daoPost=body=>daoRequest(DAO_API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});

async function openFromDao(qid) {
  if(daoPending.has(qid))return;
  daoPending.add(qid);
  try{
    const {question:q}=await daoRequest(DAO_API+'?id='+encodeURIComponent(qid));
    // A question opens one 杼; coming back to the same link opens the one already made.
    const existing=state.shuttles.find(s=>s.fromDao===q.id)||q.shuttles.map(l=>findS(l.id)).find(Boolean);
    if(existing){location.replace('#shuttle/'+existing.id);return;}
    const v=q.versions[q.versions.length-1];
    const s={id:uid(),title:q.title,core:v?v.text:'',dirs:[],notes:[],fromDao:q.id,
      coreVersions:v?[{n:1,text:v.text,from:'道藏長期問題「'+q.title+'」的第 '+v.n+' 次理解',time:Date.now()}]:[],
      cardUses:q.sources.map(id=>({cardId:id,entryId:id,note:'',supportsCore:false}))};
    state.shuttles.unshift(s);save();
    if(!storageOK){state.shuttles=state.shuttles.filter(x=>x!==s);throw new Error('織光杼沒有保存成功，請重試。');}
    await daoPost({action:'shuttle',id:q.id,shuttleId:s.id,title:s.title}).catch(()=>toast('織光杼已建立，但道藏那邊的連結沒有記上，可稍後再開一次。'));
    location.replace('#shuttle/'+s.id);
    toast('已從道藏開成織光杼');
  }catch(error){
    $('main').innerHTML=page('從道藏開成織光杼','','<p>'+esc(error.message||'沒有建立成功。')+'</p><div class="actions"><a class="primary" href="/dao/question?id='+encodeURIComponent(qid)+'">回到道藏</a></div>');
  }finally{daoPending.delete(qid);}
}

const flowWithoutDao=renderShuttleFlow;
renderShuttleFlow=function(name,params){
  if(name==='dao'&&params[0]){void openFromDao(params[0]);return page('從道藏開成織光杼','','<p>正在建立織光杼…</p>');}
  return flowWithoutDao(name,params);
};

/* ---------- 杼頁面：存回道藏 ---------- */
function daoStorePanel(s) {
  const note=s.daoStored?'<p class="statusline">上次存回：'+esc(s.daoStored.title)+'（'+new Date(s.daoStored.at).toLocaleDateString('zh-TW')+'）</p>':'';
  return panel('存回道藏','<p>經線是你目前怎麼理解這個題目。存回道藏後，它會成為一個長期問題的一次新理解，杼上的卡片一起連成來源。</p>'+note+
    '<div class="actions">'+btn('存回道藏','daoStoreOpen',[s.id],s.core?'light':'')+(s.fromDao?'<a class="tiny" href="/dao/question?id='+encodeURIComponent(s.fromDao)+'">回到來源問題</a>':'')+'</div>');
}
const shuttleWithoutDao=shuttle;
shuttle=function(s){
  const html=shuttleWithoutDao(s);
  if(!s)return html;
  const at=html.indexOf('<section class="panel"><div class="sectionhead"><h2>方向與理解版本');
  return at<0?html+daoStorePanel(s):html.slice(0,at)+daoStorePanel(s)+html.slice(at);
};

Object.assign(handlers,{
  daoStoreOpen:async sid=>{
    const s=findS(sid);
    if(!s)return;
    if(!s.core){toast('這把杼還沒有經線，先寫下核心理解');return;}
    modal('存回道藏','<p>正在讀取道藏的長期問題…</p>');
    try{
      const {questions}=await daoRequest(DAO_API);
      const pre=s.fromDao||questions.find(q=>q.shuttles.some(l=>l.id===s.id))?.id||'';
      modal('存回道藏','<div class="entry"><b>這把杼的經線</b><p>'+esc(s.core)+'</p></div>'+
        pick('存到哪一個長期問題','daoStoreTo',['新增一個長期問題：'+s.title,...questions.map(q=>q.title)],pre?questions.find(q=>q.id===pre)?.title:'新增一個長期問題：'+s.title)+
        '<p>杼上的 '+shuttleCardIds(s).length+' 張卡片會一起連成來源。</p><div class="actions">'+btn('存回道藏','daoStoreSave',[sid],'primary')+'</div>');
      $('dialog').dataset.daoQuestions=JSON.stringify(questions.map(q=>({id:q.id,title:q.title})));
    }catch(error){modal('存回道藏','<p>'+esc(error.message)+'</p>');}
  },
  daoStoreSave:async sid=>{
    const s=findS(sid);
    if(!s)return;
    const list=JSON.parse($('dialog').dataset.daoQuestions||'[]'), chosen=val('daoStoreTo'), to=list.find(q=>q.title===chosen);
    try{
      const {question}=await daoPost({action:'store',id:to?to.id:'',shuttleId:s.id,title:s.title,core:s.core,cardIds:shuttleCardIds(s)});
      s.daoStored={id:question.id,title:question.title,at:Date.now()};if(!s.fromDao)s.fromDao=question.id;save();
      closeRefresh('已存回道藏「'+question.title+'」');
    }catch(error){toast(error.message||'沒有存回成功，請重試');}
  }
});
