'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import LeaveProvider from '../weaving/LeaveDialog';
import {get} from '../weaving/client';
import ReleaseEditor from './ReleaseEditor';
import type {CreativeRelease} from '@/lib/dojo/creativeReleases/model';
import './release.css';
function Record({id}:{id:string}){
 const[release,setRelease]=useState<CreativeRelease|null>(null),[error,setError]=useState(''),[attempt,setAttempt]=useState(0),[loading,setLoading]=useState(true);
 useEffect(()=>{let active=true;get<{release:CreativeRelease}>(`/api/dojo/creative-releases?id=${encodeURIComponent(id)}`).then(r=>{if(active)setRelease(r.release);}).catch(e=>{if(active)setError(e instanceof Error?e.message:String(e));}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[id,attempt]);
 return <section className="screen release-history-screen"><span className="eyebrow">全零聊解室 · 固定版本</span><h1>編輯這筆發布紀錄</h1><p>這筆私人紀錄獨立保存。原企劃封存或移除後，仍能補記交流、連結與撤下狀態。</p><Link href="/liaojie/releases">回看所有發布紀錄</Link>{loading&&<p role="status">正在讀取指定紀錄…</p>}{error&&<><p role="alert">{error}</p><button disabled={loading} onClick={()=>{setError('');setLoading(true);setAttempt(n=>n+1);}}>重新讀取這筆紀錄</button></>}{release&&<section className="ritual-card release-workspace"><ReleaseEditor key={release.id} release={release} onUpdated={setRelease}/><Link href={`/liaojie/workbench?id=${encodeURIComponent(release.publicationId)}`}>回原企劃查看</Link></section>}</section>;
}
export default function ReleaseRecord({id}:{id:string}){return <LeaveProvider><Record key={id} id={id}/></LeaveProvider>;}
