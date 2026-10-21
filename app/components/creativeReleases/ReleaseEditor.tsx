'use client';
import {useWeavingDraft} from '../weaving/useWeavingDraft';
import ConflictRecovery from '../weaving/ConflictRecovery';
import {get,mutate} from '../weaving/client';
import {RELEASE_FORMATS,RELEASE_PLATFORMS,type CreativeRelease,type ReleasePatch,type ReleaseStatus} from '@/lib/dojo/creativeReleases/model';
export const RELEASE_STATUSES:Record<ReleaseStatus,string>={planned:'待發布',published:'已自行發布',withdrawn:'已撤下'};
type Draft=ReleasePatch&Pick<CreativeRelease,'id'|'revision'>;
const toDraft=(r:CreativeRelease):Draft=>({id:r.id,revision:r.revision,status:r.status,scheduledOn:r.scheduledOn,publishedOn:r.publishedOn,publishedUrl:r.publishedUrl,responseNote:r.responseNote,nextStep:r.nextStep});
function Comparison({v}:{v:Draft}){return <dl className="release-facts">{Object.entries({狀態:RELEASE_STATUSES[v.status],預計發布:v.scheduledOn,實際發布:v.publishedOn,連結:v.publishedUrl,交流與回看:v.responseNote,下一步:v.nextStep}).map(([k,value])=><div key={k}><dt>{k}</dt><dd>{value||'未填'}</dd></div>)}</dl>;}
export default function ReleaseEditor({release,onUpdated}:{release:CreativeRelease;onUpdated:(r:CreativeRelease)=>void}){
 const draft=useWeavingDraft(toDraft(release),async ticket=>{const{id:_id,revision:_revision,...patch}=ticket.value;void _id;void _revision;const result=await mutate<{release:CreativeRelease}>('/api/dojo/creative-releases','PATCH',{releaseId:ticket.entityId,expectedRevision:ticket.revision,patch});onUpdated(result.release);return toDraft(result.release);});
 const v=draft.value,edit=(patch:Partial<ReleasePatch>)=>draft.edit({...v,...patch});
 return <section className="release-editor" aria-label="編輯發布紀錄"><h3>{RELEASE_PLATFORMS[release.platform]} · {release.source.title||'未命名作品'}</h3><p>{RELEASE_FORMATS[release.source.format]}／{release.source.kind==='platform-text'?'固定平台文字版本':'固定成品'}</p><details><summary>核對來源版次</summary><p className="release-version">成品 {release.source.id}<br/>版次 {release.source.versionId}</p></details>
 <label>紀錄狀態<select aria-label="紀錄狀態" value={v.status} onChange={e=>edit({status:e.target.value as ReleaseStatus})}>{Object.entries(RELEASE_STATUSES).map(([k,label])=><option key={k} value={k}>{label}</option>)}</select></label>
 <label>預計發布日期<input aria-label="預計發布日期（這筆紀錄）" type="date" value={v.scheduledOn??''} onChange={e=>edit({scheduledOn:e.target.value||null})}/></label>
 <label>實際發布日期<input aria-label="實際發布日期" type="date" value={v.publishedOn??''} onChange={e=>edit({publishedOn:e.target.value||null})}/></label>
 <label>發布作品連結<input aria-label="發布作品連結" type="url" maxLength={2000} placeholder="https://…" value={v.publishedUrl} onChange={e=>edit({publishedUrl:e.target.value})}/></label>
 <label>交流與回看<textarea aria-label="交流與回看" rows={4} maxLength={5000} placeholder="誰產生了共鳴？哪些回覆值得接著聊？" value={v.responseNote} onChange={e=>edit({responseNote:e.target.value})}/></label>
 <label>接下來想做什麼<textarea aria-label="接下來想做什麼" rows={3} maxLength={2000} value={v.nextStep} onChange={e=>edit({nextStep:e.target.value})}/></label>
 <button className="primary" disabled={!draft.dirty||draft.busy} onClick={()=>void draft.save()}>{draft.busy?'保存中…':'保存這筆發布紀錄'}</button><p role="status">{draft.dirty?'有未保存的發布紀錄':'發布紀錄已保存'}</p>{draft.state.error&&<p role="alert">{draft.state.error}</p>}
 <ConflictRecovery draft={draft} loadLatest={async()=>toDraft((await get<{release:CreativeRelease}>(`/api/dojo/creative-releases?id=${encodeURIComponent(release.id)}`)).release)} render={value=><><p>{RELEASE_PLATFORMS[release.platform]}／{release.source.title||'未命名作品'}（來源固定）</p><Comparison v={value}/></>}/>
 </section>;
}
