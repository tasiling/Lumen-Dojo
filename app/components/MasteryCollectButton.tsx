'use client';
import {useRef,useState} from 'react';
import Link from './PracticeRouteLink';
export default function MasteryCollectButton({attemptId}:{attemptId:string}){
 const [cardId,setCardId]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');const lock=useRef(false);
 async function collect(){if(lock.current)return;lock.current=true;setBusy(true);setError('');try{const r=await fetch('/api/dojo/mastery',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({attemptId}),cache:'no-store'}),j=await r.json();if(!r.ok)throw Error(j.error??'學成卡尚未確認');setCardId(j.card.id);}catch(e){setError(e instanceof Error?e.message:'結果尚未確認，請重新讀取後再操作');}finally{lock.current=false;setBusy(false);}}
 return <section><h3>收藏學成卡</h3><p>明確收藏本次已確認的能力；來源仍需核對，同能力重送不重發卡，較低階不會降階。</p>{error&&<p role='alert'>{error}</p>}{cardId?<p role='status'>已保存學成歷程。<Link href={'/dao/mastery?card='+encodeURIComponent(cardId)}>打開道藏學成卡</Link></p>:<button disabled={busy} onClick={()=>void collect()}>收藏本次已確認成果</button>}</section>;
}
