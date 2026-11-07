'use client';
import { useState } from 'react';
import type { LooseDirection } from '@/lib/dojo/creativeStudio/looseDirections';
import type { WeavingShuttle } from '@/lib/dojo/weavingShuttle';
import { mutate } from '../weaving/client';
import { beginIntent,confirmIntent } from '@/lib/dojo/weavingWorkflow/clientIdentity';
export default function UnassignedDirections({rows,topics,onSaved}:{rows:LooseDirection[];topics:WeavingShuttle[];onSaved:()=>void}) {
    return <section className="ritual-card"><h2>未歸屬方向（{rows.length}）</h2><p>可以先保存理解與討論，之後再歸屬主題。</p>{rows.map(row=><Loose key={row.id+row.revision} row={row} topics={topics} onSaved={onSaved}/>)}{!rows.length&&<p>目前沒有未歸屬方向。</p>}</section>;
}
function Loose({row,topics,onSaved}:{row:LooseDirection;topics:WeavingShuttle[];onSaved:()=>void}){
    const [direction,setDirection]=useState(row.direction),[statement,setStatement]=useState(''),[topicId,setTopicId]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
    async function save(){setBusy(true);setError('');try{const intent=beginIntent('loose-direction:'+row.id,{direction,statement,topicId}),next=statement.trim()?{...direction,versions:[...direction.versions,{id:'understanding-'+intent.id,statement,note:'本人追加的理解',createdAt:intent.createdAt}]}:direction;await mutate('/api/dojo/creative-studio','POST',{action:'loose-direction',id:row.id,expectedRevision:row.revision,direction:next,topicId,expectedTopicRevision:topics.find(t=>t.id===topicId)?.revision});confirmIntent('loose-direction:'+row.id,intent.id);onSaved();}catch(e){setError(String(e));}finally{setBusy(false);}}
    return <details><summary>{direction.title} · {direction.versions.length} 版</summary><label>方向名稱<input value={direction.title} onChange={e=>setDirection({...direction,title:e.target.value})}/></label><label>主問題<input value={direction.question||''} onChange={e=>setDirection({...direction,question:e.target.value})}/></label><label>切入角度<input value={direction.angle||''} onChange={e=>setDirection({...direction,angle:e.target.value})}/></label>{direction.versions.map(v=><p className="studio-manuscript" key={v.id}>{v.statement}<br/>{v.note}</p>)}<label>追加理解（另存新版本）<textarea value={statement} onChange={e=>setStatement(e.target.value)}/></label><details><summary>來源、討論與原方向補充資料</summary><pre className="studio-manuscript">{JSON.stringify(direction.details||{},null,2)}</pre></details><label>這次歸屬（可保持未歸屬）<select value={topicId} onChange={e=>setTopicId(e.target.value)}><option value="">保持未歸屬</option>{topics.map(t=><option key={t.id} value={t.id}>{t.title}</option>)}</select></label>{error&&<p role="alert">{error}</p>}<button disabled={busy} onClick={()=>void save()}>{topicId?'保存並歸屬此主題':'保存未歸屬方向'}</button></details>;
}
