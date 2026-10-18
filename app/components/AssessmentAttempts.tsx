'use client';
import {useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import Link from './PracticeRouteLink';
import type {Definition} from '@/lib/dojo/assessments/model';
import type {AttemptSummary} from '@/lib/dojo/assessments/progress';
export default function AssessmentAttempts({definitions,attempts,disabled}:{definitions:Definition[],attempts:AttemptSummary[],disabled:boolean}){
 const router=useRouter(),lock=useRef(false),requests=useRef(new Map<string,string>());const [busy,setBusy]=useState(false),[error,setError]=useState('');
 async function create(d:Definition,revisitOf?:string){if(lock.current||disabled)return;lock.current=true;setBusy(true);setError('');const key=`${d.capabilityId}:${d.definitionVersion}:${revisitOf??''}`;if(!requests.current.has(key))requests.current.set(key,crypto.randomUUID());try{const r=await fetch('/api/dojo/assessments',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'attempt',requestId:requests.current.get(key),capabilityId:d.capabilityId,definitionVersion:d.definitionVersion,...(revisitOf?{revisitOf}:{})})});const j=await r.json();if(!r.ok)throw Error(j.error??'建立尚未確認');router.push('/practice/assessments/'+j.attempt.id);}catch(e){setError(e instanceof Error?e.message:'建立尚未確認')}finally{lock.current=false;setBusy(false)}}
 return <section><h2>作答與驗收歷程</h2>{error&&<p role='alert'>{error}</p>}{definitions.map(d=><div key={d.id}><button disabled={disabled||busy} onClick={()=>void create(d)}>開始「{d.name}」的新嘗試</button></div>)}{attempts.map(a=>{const d=definitions.find(d=>d.capabilityId===a.capabilityId);return <article key={a.id}><Link href={'/practice/assessments/'+a.id}>{a.capabilityName} · v{a.definitionVersion} · {a.confirmedAt?'已確認':a.status==='draft'?'草稿':a.status==='submitted'?'已提交':'已評估'}</Link>{a.confirmedAt&&d&&<button disabled={disabled||busy} onClick={()=>void create(d,a.id)}>以目前規準回訪</button>}</article>})}{!attempts.length&&<p>尚無作答；每次挑戰都保留為獨立嘗試。</p>}</section>;
}
