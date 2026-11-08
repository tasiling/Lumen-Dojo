'use client';
import {beginIntent,confirmIntent} from '@/lib/dojo/weavingWorkflow/clientIdentity';
import Link from 'next/link';
import UnassignedDirections from './UnassignedDirections';
import type { LooseDirection } from '@/lib/dojo/creativeStudio/looseDirections';
import { useEffect, useState } from 'react';
import { get, mutate } from '../weaving/client';
import { newDirection, type StudioDirection } from '@/lib/dojo/creativeStudio/model';
import type { WeavingShuttle } from '@/lib/dojo/weavingShuttle';
import './studio.css';
export default function StudioTopics({realm='weaving'}:{realm?:'weaving'|'liaojie'}) { const [loose,setLoose]=useState<LooseDirection[]>([]); const [topics, setTopics] = useState<WeavingShuttle[]>([]), [id, setId] = useState(''), [title, setTitle] = useState(''), [name, setName] = useState(''), [statement, setStatement] = useState(''), [target, setTarget] = useState(''), [note, setNote] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false); const current = topics.find(t => t.id === id); useEffect(() => { get<{
    topics: WeavingShuttle[]; looseDirections: LooseDirection[];
}>('/api/dojo/creative-studio').then(r => {setTopics(r.topics);setLoose(r.looseDirections||[]);}).catch(e => setError(String(e))); }, []); async function refresh(){const r=await get<{topics:WeavingShuttle[];looseDirections:LooseDirection[]}>('/api/dojo/creative-studio');setTopics(r.topics);setLoose(r.looseDirections||[]);} async function create() {const intent=beginIntent('studio-topic-create',{title}); setBusy(true); setError(''); try {
    const r = await mutate<{
        topic: WeavingShuttle;
    }>('/api/dojo/creative-studio', 'POST', { action: 'topic', title, requestNonce: intent.id });
    confirmIntent('studio-topic-create',intent.id);setTopics([...topics, r.topic]);
    setId(r.topic.id);
    setTitle('');
}
catch (e) {
    setError(String(e));
}
finally {
    setBusy(false);
} } async function save() { if (!current)
    return; setBusy(true); setError(''); try {
    let directions: StudioDirection[] = current.studioDirections || [];
    const intent=beginIntent('studio-direction:'+current.id,{target,name,statement,note}),now=intent.createdAt,vid='understanding-'+intent.id;
    if (target) {
        directions = directions.map(d => d.id === target ? { ...d, versions: [...d.versions, { id: vid, statement, note, createdAt: now }] } : d);
    }
    else
        directions = [...directions, newDirection('direction-'+intent.id, name, statement, vid, now)];
    const r = await mutate<{
        topic: WeavingShuttle;
    }>('/api/dojo/creative-studio', 'POST', { action: 'directions', id: current.id, expectedRevision: current.revision, directions });
    confirmIntent('studio-direction:'+current.id,intent.id);setTopics(topics.map(t => t.id === id ? r.topic : t));
    setStatement('');
    setName('');
    setNote('');
}
catch (e) {
    setError(String(e));
}
finally {
    setBusy(false);
} } return <section className="screen studio"><h1>織光杼與方向</h1><p>主題是持續累積的容器；方向各自保留理解版本。作品採用當時的版本，後續更新不會重寫舊稿。</p>{error && <p role="alert">{error}</p>}<UnassignedDirections rows={loose} topics={topics} onSaved={()=>void refresh()}/><fieldset disabled={busy}><section className="ritual-card"><label>建立主題名稱<input value={title} onChange={e => setTitle(e.target.value)}/></label><button disabled={!title.trim()} onClick={() => void create()}>建立織光杼</button><label>選擇織光杼<select value={id} onChange={e => { setId(e.target.value); setTarget(''); }}><option value="">請選主題</option>{topics.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}</select></label></section>{current && <><section className="ritual-card"><h2>{current.title}</h2><label>這次是累積，還是另開方向？<select value={target} onChange={e => setTarget(e.target.value)}><option value="">新增獨立方向</option>{current.studioDirections?.map(d => <option value={d.id} key={d.id}>累積：{d.title}</option>)}</select></label>{!target && <label>新方向名稱<input value={name} onChange={e => setName(e.target.value)}/></label>}<label>目前的理解<textarea value={statement} onChange={e => setStatement(e.target.value)} rows={6}/></label><label>這次增加或改變什麼<textarea value={note} onChange={e => setNote(e.target.value)} rows={3}/></label><button disabled={!statement.trim() || !target && !name.trim()} onClick={() => void save()}>{target ? '保存為新的理解版本' : '保留為新方向'}</button></section><section className="ritual-card"><h2>所有方向（{current.studioDirections?.length || 0}）</h2>{current.studioDirections?.map(d => <details key={d.id}><summary>{d.title} · {d.versions.length} 版</summary><DirectionMetadata key={current.id+d.id+current.revision} topic={current} direction={d} onSaved={t=>setTopics(old=>old.map(x=>x.id===t.id?t:x))}/>{d.versions.map((v, i) => <div key={v.id}><b>V{i + 1}</b><p className="studio-manuscript">{v.statement}</p><small>{v.note} · {v.id}</small></div>)}</details>)}{!current.studioDirections?.length && <p>還沒有新方向。原正式版的核心理解與作品仍留在原 ID。</p>}</section></>}</fieldset><Link href={'/'+realm+'/works'}>回作品管理，選擇要製作的方向版本</Link></section>; }

function DirectionMetadata({topic,direction,onSaved}:{topic:WeavingShuttle;direction:StudioDirection;onSaved:(t:WeavingShuttle)=>void}){
 const [value,setValue]=useState(direction),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function save(){setBusy(true);setError('');try{const r=await mutate<{topic:WeavingShuttle}>('/api/dojo/creative-studio','POST',{action:'directions',id:topic.id,expectedRevision:topic.revision,directions:topic.studioDirections?.map(d=>d.id===value.id?value:d)});onSaved(r.topic);}catch(e){setError(String(e));}finally{setBusy(false);}}
 return <div><label>已歸屬方向名稱<input value={value.title} onChange={e=>setValue({...value,title:e.target.value})}/></label><label>已歸屬方向主問題<input value={value.question||''} onChange={e=>setValue({...value,question:e.target.value})}/></label><label>已歸屬方向切入角度<input value={value.angle||''} onChange={e=>setValue({...value,angle:e.target.value})}/></label><button disabled={busy||JSON.stringify(value)===JSON.stringify(direction)} onClick={()=>void save()}>保存方向介紹</button>{error&&<p role="alert">{error}</p>}{direction.details&&<details><summary>方向的原始來源與討論</summary><pre className="studio-manuscript">{JSON.stringify(direction.details,null,2)}</pre></details>}</div>;
}
