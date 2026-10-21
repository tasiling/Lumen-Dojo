'use client';
import Link from 'next/link';
import {useEffect,useState} from 'react';
import type {Proposal,Settings} from '@/lib/dojo/creativeProposals/model';
import {FORMATS} from '@/lib/dojo/creativeProposals/model';
import LeaveProvider,{useLeave} from '../weaving/LeaveDialog';
import {get} from '../weaving/client';
import CreativeIcon from '../creative/CreativeIcon';
import ProposalEditor from './ProposalEditor';
import ProposalSettings from './ProposalSettings';
import {useProposalOperation} from './useProposalOperation';
import '@/app/weaving/workflow.css';
import './proposals.css';
type Snapshot={proposals:Proposal[];settings:Settings;backgroundReady:boolean};
const url='/api/dojo/creative-proposals';
function Workspace({initial}:{initial:Snapshot}){
 const [data,setData]=useState(initial),[selected,setSelected]=useState<string|null>(null),[error,setError]=useState(''),[scanNotice,setScanNotice]=useState(''),[recovered,setRecovered]=useState<Record<string,unknown>|null>(null),leave=useLeave();
 async function load(){const next=await get<Snapshot>(url);setData(next);return next;}
 function openWork(workId:string,shuttleId:string){leave.requestLeave(()=>{location.href=`/weaving/${shuttleId}?work=${workId}`;});}
 const op=useProposalOperation(async(input,result)=>{const next=await load();setRecovered(input);if(input.action==='accept'){const accepted=next.proposals.find(p=>p.id===input.id);const workId=typeof result.workId==='string'?result.workId:accepted?.acceptedWorkId,shuttleId=typeof result.shuttleId==='string'?result.shuttleId:accepted?.acceptedShuttleId;if(workId&&shuttleId)openWork(workId,shuttleId);}});
 async function scan(){setError('');setScanNotice('');try{const r=await op.execute({action:'scan'});await load();setScanNotice(r.skipped?'目前沒有符合範圍的允許素材，請先設定取材許可。':`整理完成，新增 ${r.created} 份候選；已提過的來源版本不重複建立。`);}catch(e){setError(e instanceof Error?e.message:String(e));}}
 async function accept(p:Proposal){setError('');try{const r=await op.execute({action:'accept',id:p.id,expectedRevision:p.revision});openWork(String(r.workId),String(r.shuttleId));}catch(e){setError(e instanceof Error?e.message:String(e));}}
 async function skip(p:Proposal){setError('');try{await op.execute({action:'skip',id:p.id,expectedRevision:p.revision});await load();}catch(e){setError(e instanceof Error?e.message:String(e));}}
 const p=data.proposals.find(p=>p.id===selected),pending=data.proposals.filter(p=>p.status==='pending');
 return <section className="proposal-workspace weaving-clarity"><Link href="/weaving">返回織光堂</Link><header className="ritual-card proposal-intro"><CreativeIcon name="compass"/><h1>點點的提案</h1><p>從已允許的生活與閱讀素材，找一個值得發展的問題。</p><ol className="proposal-path"><li><CreativeIcon name="sprout"/>整理候選</li><li><CreativeIcon name="eye"/>核對來源</li><li><CreativeIcon name="pen"/>修改試寫</li><li><CreativeIcon name="document"/>選定開工</li></ol><p>目前採站內規則整理，不外送私人素材。試寫需要你確認觀點與語氣，不代表已完成作品。</p><div className="wf-actions"><button className="primary" disabled={op.blocked} onClick={()=>leave.requestLeave(()=>void scan())}>從允許素材整理候選</button><Link href="/weaving/sources">設定取材與公開許可</Link></div>{scanNotice&&<p role="status">{scanNotice}</p>}</header>
 <section className="proposal-operation" aria-label="提案操作狀態">{op.busy&&<p role="status">正在處理…</p>}{(error||op.error)&&<p role="alert">{error||op.error}</p>}{op.notice&&<p role="status">{op.notice}</p>}{op.pending&&<><p>原操作尚待核對；先確認結果，再編輯或開始新操作。</p><p className="proposal-op-id">操作識別：{op.pending.operationId}</p><div className="wf-actions"><button disabled={op.busy} onClick={()=>void op.inspect()}>核對原操作</button><button disabled={op.busy} onClick={()=>void op.retry()}>重送原操作</button></div></>}</section>
 <ProposalSettings settings={data.settings} backgroundReady={data.backgroundReady} operation={op} recovered={recovered} onSaved={async()=>{await load();}} loadLatest={async()=>(await get<Snapshot>(url)).settings}/>
 <section className="proposal-list" aria-label="候選提案"><h2>待你挑選的題目（{pending.length}）</h2>{!data.proposals.length&&<div className="ritual-card creative-empty"><CreativeIcon name="inbox"/><h3>還沒有候選提案</h3><p>先允許幾份素材取材，再按上方整理候選。你也可以回織光堂，直接指定自己的題目。</p></div>}{data.proposals.map(item=><article key={item.id} className="ritual-card proposal-card"><p className="proposal-state">{item.status==='pending'?'待選定':item.status==='accepted'?'已開工':'已略過'} · {FORMATS[item.format]}</p><h3>{item.title}</h3><p>{item.angle}</p><p className="wf-note">來源：{item.source.label}</p>{item.status==='pending'?<div className="wf-actions"><button aria-pressed={selected===item.id} disabled={op.blocked} onClick={()=>leave.requestLeave(()=>setSelected(item.id))}>查看這份提案</button><button disabled={op.blocked} onClick={()=>leave.requestLeave(()=>void skip(item))}>略過這個版本</button></div>:item.acceptedShuttleId&&<Link href={`/weaving/${item.acceptedShuttleId}?work=${item.acceptedWorkId}`}>繼續這件作品</Link>}</article>)}</section>
 {p?.status==='pending'&&<ProposalEditor key={p.id} proposal={p} operation={op} recovered={recovered} onSaved={async()=>{await load();}} loadLatest={async()=>{const latest=(await get<Snapshot>(url)).proposals.find(item=>item.id===p.id);if(!latest)throw Error('這份提案已不可用');return latest;}} onAccept={()=>accept(p)}/>}</section>;
}
export default function ProposalWorkspace(){const [data,setData]=useState<Snapshot|null>(null),[error,setError]=useState(''),[retry,setRetry]=useState(0);useEffect(()=>{let active=true;get<Snapshot>(url).then(r=>{if(active)setData(r);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[retry]);return <LeaveProvider>{data?<Workspace initial={data}/>:<section className="ritual-card">{error?<><p role="alert">{error}</p><button onClick={()=>{setError('');setRetry(n=>n+1);}}>重新讀取提案</button></>:<p role="status">正在讀取點點的提案…</p>}</section>}</LeaveProvider>;}
