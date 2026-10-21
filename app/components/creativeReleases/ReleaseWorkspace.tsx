'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import CreativeIcon from '../creative/CreativeIcon';
import {useLeave} from '../weaving/LeaveDialog';
import {get,mutate} from '../weaving/client';
import ReleaseEditor,{RELEASE_STATUSES} from './ReleaseEditor';
import {RELEASE_FORMATS,RELEASE_PLATFORMS,sourceKey,type CreativeRelease,type ReleaseSource,type ReleasePlatform} from '@/lib/dojo/creativeReleases/model';
import './release.css';
type Catalog={releases:CreativeRelease[];sources:ReleaseSource[];missing:string[]};
export default function ReleaseWorkspace({publicationId}:{publicationId:string}){
 const[data,setData]=useState<Catalog>({releases:[],sources:[],missing:[]}),[selected,setSelected]=useState(''),[source,setSource]=useState(''),[platform,setPlatform]=useState(''),[error,setError]=useState(''),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
 const gate=useRef(false),generation=useRef(0),leave=useLeave();
 const load=useCallback(async()=>{const n=++generation.current;setLoading(true);setError('');try{const result=await get<Catalog>(`/api/dojo/creative-releases?publicationId=${encodeURIComponent(publicationId)}`);if(n===generation.current)setData(result);}catch(e){if(n===generation.current)setError(e instanceof Error?e.message:String(e));}finally{if(n===generation.current)setLoading(false);}},[publicationId]);
 useEffect(()=>{const token=generation,timer=setTimeout(()=>void load(),0);return()=>{clearTimeout(timer);token.current++;};},[load]);
 const chosen=data.sources.find(s=>sourceKey(s)===source),active=data.releases.find(r=>r.id===selected);
 async function create(){if(gate.current||!chosen||!platform)return;gate.current=true;setBusy(true);setError('');try{const{release}=await mutate<{release:CreativeRelease}>('/api/dojo/creative-releases','POST',{publicationId,sourceKind:chosen.kind,sourceId:chosen.id,platform});setData(d=>({...d,releases:[release,...d.releases.filter(r=>r.id!==release.id)]}));setSelected(release.id);}catch(e){setError(e instanceof Error?e.message:String(e));}finally{gate.current=false;setBusy(false);}}
 return <section className="ritual-card release-workspace" aria-label="作品發布紀錄"><div className="creative-section-heading"><CreativeIcon name="handoff"/><div><span className="eyebrow">成品之後 · 交流之前</span><h2>作品發布紀錄</h2></div></div><p>選一份固定成品與一個平台。由你到平台發布，再回來記下連結與交流；這裡不會替你發文。</p><Link href="/liaojie/releases">回看所有發布紀錄</Link>
 {loading&&<p role="status">正在讀取成品與紀錄…</p>}{error&&<p role="alert">{error}</p>}{!loading&&<button disabled={busy} onClick={()=>void load()}>重新讀取成品與紀錄</button>}{data.missing.map((v,i)=><p className="wf-note" key={i}>部分來源暫時不可用：{v}</p>)}
 <div className="release-create"><label>紀錄的固定成品<select aria-label="紀錄的固定成品" value={source} disabled={busy} onChange={e=>{setSource(e.target.value);setPlatform('');}}><option value="">選擇這次要紀錄的版本</option>{data.sources.map((s,i)=><option key={sourceKey(s)} value={sourceKey(s)}>{i+1}．{RELEASE_FORMATS[s.format]} · {s.title||'未命名作品'}{s.platform?` · ${RELEASE_PLATFORMS[s.platform]}`:''}{s.versionNumber?` · 第${s.versionNumber}版`:''} · {s.versionId.slice(0,8)}</option>)}</select></label>
 <label>紀錄的平台<select aria-label="紀錄的平台" value={platform} disabled={busy} onChange={e=>setPlatform(e.target.value)}><option value="">只選這次要發布的平台</option>{Object.entries(RELEASE_PLATFORMS).map(([k,label])=><option key={k} value={k} disabled={!!chosen?.platform&&chosen.platform!==k}>{label}</option>)}</select></label><button className="primary" disabled={busy||!chosen||!platform} onClick={()=>leave.requestLeave(()=>void create())}>{busy?'建立中…':'建立這個版本的平台紀錄'}</button></div>
 {!loading&&!data.releases.length&&<div className="weaving-empty"><CreativeIcon name="inbox"/><b>還沒有發布紀錄</b><p>成品不會自動轉製或建立所有平台的紀錄。</p></div>}
 <div className="release-record-list" aria-label="這件作品的紀錄">{data.releases.map(r=><button key={r.id} aria-pressed={selected===r.id} disabled={busy} onClick={()=>leave.requestLeave(()=>setSelected(r.id))}>{RELEASE_PLATFORMS[r.platform as ReleasePlatform]} · {RELEASE_FORMATS[r.source.format]} · {r.source.title||'未命名作品'}<small>{RELEASE_STATUSES[r.status]} · 版次 {r.source.versionId.slice(0,8)}</small></button>)}</div>
 {active&&<ReleaseEditor key={active.id} release={active} onUpdated={r=>setData(d=>({...d,releases:d.releases.map(old=>old.id===r.id?r:old)}))}/>}
 </section>;
}
