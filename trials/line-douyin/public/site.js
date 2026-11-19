const $ = id => document.getElementById(id);
const states={queued:'等待 Mac 轉錄',running:'Mac 正在處理',done:'已有逐字稿',failed:'轉錄未完成'};
const phases={resolve:'讀取抖音作品',download:'取得影片',audio:'讀取音軌',transcribe:'辨識語音',write:'寫回原卡'};
let current=null, draftNote='', lastSegments='', signed=false, pendingShare=null;
const cardId=()=>new URL(location.href).searchParams.get('captureId');
const visible=(el,on)=>{el.hidden=!on;};
function notify(text=''){ $('notice').textContent=text;visible($('notice'),!!text); }
function display(auth,detail=false){
  signed=auth;visible($('lock'),!auth);visible($('home'),auth&&!detail);visible($('detail'),auth&&detail);
}
async function api(path,data,asFile=false){
  const options=data===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)};
  const res=await fetch(path,{...options,credentials:'same-origin',cache:'no-store'});
  if(res.status===401)display(false);
  if(!res.ok){const d=await res.json().catch(()=>({}));throw Error(d.error||'暫時無法連線，請稍後重試。');}
  return asFile?res.blob():res.json();
}
function workerText(w){
  if(!w.paired)return 'Mac 尚未配對';
  if(!w.online)return '等待 Mac 連線';
  return w.ready?'Mac 可轉錄':'Mac 已連線，等待 BiliNote 啟動';
}
function home(data){
  display(true);
  $('online').textContent=workerText(data.worker);
  $('macStatus').textContent=workerText(data.worker);
  $('lineStatus').textContent=data.line.configured?(data.line.paired?'已連接測試 LINE 帳號':'頻道已設定，請配對你的 LINE'):'待設定測試頻道。你可以先在上方貼網址，Mac 會處理同一種任務。';
  visible($('pairLine'),data.line.configured&&!data.line.paired);
  $('hook').textContent=location.origin+'/api/integrations/line/webhook';
  const parent=$('cards');parent.replaceChildren();
  if(!data.cards.length){const p=document.createElement('p');p.className='muted';p.textContent='尚未收到影片。';parent.append(p);}
  for(const item of data.cards){
    const a=document.createElement('a');a.className='card';a.href='/forage/captures?captureId='+item.id;
    const meta=document.createElement('small');meta.textContent=item.source+' · '+states[item.status];
    const t=document.createElement('strong');t.textContent=item.title;a.append(meta,t);parent.append(a);
  }
}
function stamp(seconds){const s=Math.floor(seconds);return Math.floor(s/60)+':'+String(s%60).padStart(2,'0');}
function renderTimes(){
  if(!$('times').open || !current?.segments?.length || lastSegments===current.id+':'+current.updated)return;
  const fragment=document.createDocumentFragment();
  for(const segment of current.segments){
    const li=document.createElement('li'),t=document.createElement('time'),v=document.createElement('span');
    t.textContent=stamp(segment.start);v.textContent=segment.text;li.append(t,v);fragment.append(li);
  }
  $('parts').replaceChildren(fragment);lastSegments=current.id+':'+current.updated;
}
function detail(item){
  current=item;display(true,true);
  if(item.id!==cardId())history.replaceState(null,'','/forage/captures?captureId='+item.id);
  $('title').textContent=item.title;$('state').textContent=states[item.status];$('state').className='status '+item.status;
  $('sub').textContent=item.status==='queued'?'Mac 可用時會從這筆素材接續。':item.status==='running'?(phases[item.phase]||'處理中')+'…':item.source+' · '+new Date(item.created).toLocaleDateString('zh-TW');
  visible($('problem'),item.status==='failed');
  $('error').textContent=(phases[item.phase]?phases[item.phase]+'時未完成。':'')+item.error;
  visible($('transBlock'),item.status==='done');
  if(item.status==='done'){
    const s=item.text;let cut=s.length;
    if(s.length>620){const boundary=s.slice(330,560).search(/[。！？.!?]\s*|\n/u);cut=boundary>=0?331+boundary:500;}
    $('intro').textContent=s.slice(0,cut);$('remaining').textContent=s.slice(cut);
    visible($('more'),cut<s.length);$('timeLabel').textContent='查看時間戳（'+item.segments.length+' 段）';renderTimes();
  }
  $('raw').textContent=item.share;$('source').href=item.url;$('noteRead').textContent=item.note||'尚未留下筆記。';
}
async function refresh(){
  const id=cardId();
  if(id) detail(await api('/api/captures/'+encodeURIComponent(id)));
  else home(await api('/api/inbox'));
}
const guarded=fn=>async e=>{e.preventDefault();const button=e.submitter||e.currentTarget;
  button.disabled=true;try{notify();await fn(e);}catch(err){notify(err.message);}finally{button.disabled=false;}};
$('login').onsubmit=guarded(async()=>{await api('/api/login',{key:$('key').value});$('key').value='';await refresh();});
$('capture').onsubmit=guarded(async()=>{
  const share=$('share').value,note=$('comment').value, signature=JSON.stringify([share,note]);
  if(!pendingShare||pendingShare.signature!==signature)pendingShare={signature,requestId:crypto.randomUUID()};
  const r=await api('/api/captures',{share,note,requestId:pendingShare.requestId});
  location.assign('/forage/captures?captureId='+r.id);
});
$('retry').onclick=guarded(async()=>{detail(await api('/api/captures/'+current.id+'/retry',{}));});
$('edit').onclick=()=>{draftNote=current.note;$('noteInput').value=draftNote;visible($('noteForm'),true);visible($('edit'),false);$('noteInput').focus();};
$('cancelEdit').onclick=()=>{visible($('noteForm'),false);visible($('edit'),true);};
$('noteForm').onsubmit=guarded(async()=>{
  const r=await api('/api/captures/'+current.id+'/note',{previous:draftNote,note:$('noteInput').value});
  visible($('noteForm'),false);visible($('edit'),true);detail(r);notify('筆記已保存。');
});
$('copy').onclick=guarded(async()=>{
  const s=current.text;
  try{await navigator.clipboard.writeText(s);}
  catch{const v=document.createElement('textarea');v.value=s;document.body.append(v);v.select();const ok=document.execCommand('copy');v.remove();if(!ok)throw Error('請展開全文後，長按文字拷貝。');}
  notify('已複製完整逐字稿。');
});
$('times').ontoggle=renderTimes;
$('connectLink').onclick=()=>{$('connection').open=true;};
$('install').onclick=guarded(async()=>{
  const url=URL.createObjectURL(await api('/api/mac/install',{},true));const a=document.createElement('a');
  a.href=url;a.download='YeCai-Connect-Mac.command';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
  notify('配對檔已送往下載。請在 Mac 執行，配對有效十分鐘。');
});
$('pairLine').onclick=guarded(async()=>{const r=await api('/api/line/pair',{});$('pairCode').textContent='請在十分鐘內傳給測試 LINE 帳號：'+r.command;});
refresh().catch(e=>{if(signed||$('lock').hidden)notify(e.message);});
setInterval(()=>{if(signed&&!document.hidden&&(!cardId()||['running','queued'].includes(current?.status)))refresh().catch(e=>notify(e.message));},8000);
document.addEventListener('visibilitychange',()=>{if(signed&&!document.hidden)refresh().catch(e=>notify(e.message));});
