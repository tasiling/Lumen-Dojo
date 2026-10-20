'use client';
import {useEffect} from 'react';
import type {Proposal} from '@/lib/dojo/creativeProposals/model';
import {FORMATS,type ProposalFormat} from '@/lib/dojo/creativeProposals/model';
import {useWeavingDraft} from '../weaving/useWeavingDraft';
import ConflictRecovery from '../weaving/ConflictRecovery';
import type {ProposalOperation} from './useProposalOperation';
export default function ProposalEditor({proposal,operation,recovered,loadLatest,onSaved,onAccept}:{proposal:Proposal;operation:ProposalOperation;recovered:Record<string,unknown>|null;loadLatest:()=>Promise<Proposal>;onSaved:()=>Promise<void>;onAccept:()=>Promise<void>}){
 const draft=useWeavingDraft(proposal,async t=>{const {title,angle,format,trial}=t.value;const r=await operation.execute({action:'edit',id:proposal.id,expectedRevision:t.revision,patch:{title,angle,format,trial}});await onSaved();return r.proposal as Proposal;});
 useEffect(()=>{if(recovered?.id===proposal.id&&recovered.action==='edit'&&proposal.revision>Number(recovered.expectedRevision))draft.reset(proposal);},[recovered,proposal.revision]); // eslint-disable-line react-hooks/exhaustive-deps
 const disabled=operation.blocked||draft.busy||proposal.status!=='pending';
 return <section className="ritual-card proposal-editor" aria-label="提案編輯"><h2>把候選改成你真正想說的話</h2><p className="proposal-disclosure">來源整理候選／規則試寫，尚未使用外部 AI 代寫。先核對來源與自己的立場。</p><p><a href={proposal.source.href}>查看來源：{proposal.source.label}</a></p><details><summary>這次保留的來源片段</summary><div className="full-text-preview">{proposal.source.text}</div><small>來源種類：{proposal.source.contentKind==='quote'?'原文引用':proposal.source.contentKind==='experience'?'個人經驗':'理解／洞察'}；片段已固定，來源改版時不會悄悄替換。</small></details><p><b>為什麼值得做：</b>{proposal.why}</p>
 <label htmlFor="proposal-title">提案名稱</label><input id="proposal-title" value={draft.value.title} disabled={disabled} onChange={e=>draft.edit({...draft.value,title:e.target.value})}/>
 <label htmlFor="proposal-angle">這份提案的角度</label><textarea id="proposal-angle" rows={4} value={draft.value.angle} disabled={disabled} onChange={e=>draft.edit({...draft.value,angle:e.target.value})}/>
 <label htmlFor="proposal-format">建議製作形式</label><select id="proposal-format" value={draft.value.format} disabled={disabled} onChange={e=>draft.edit({...draft.value,format:e.target.value as ProposalFormat})}>{Object.entries(FORMATS).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select><p className="wf-note">這次選定只開始一件文字草稿。圖文與影音的建議會保留在提案，不代表已製作成品。</p>
 <label htmlFor="proposal-trial">試寫草稿（待本人修改）</label><textarea id="proposal-trial" rows={10} value={draft.value.trial} disabled={disabled} onChange={e=>draft.edit({...draft.value,trial:e.target.value})}/>
 <p role="status">{draft.busy?'正在保存…':draft.dirty?'有未保存的提案修改':'目前提案已保存'}</p>{draft.state.error&&<p role="alert">{draft.state.error}</p>}
 <ConflictRecovery draft={draft} loadLatest={loadLatest} render={p=><><b>{p.title}</b><p>{p.angle}</p><div className="full-text-preview">{p.trial}</div></>}/>
 <div className="wf-actions"><button disabled={disabled||!draft.dirty} onClick={()=>void draft.save()}>保存提案修改</button><button className="primary" disabled={disabled||draft.dirty} onClick={()=>void onAccept()}>選定並開始文字草稿</button></div>{draft.dirty&&<p className="wf-note">先保存修改，再選定開工。</p>}</section>;
}
