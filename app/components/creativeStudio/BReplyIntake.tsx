'use client';
import {useId, useState} from 'react';
import type {StudioData} from '@/lib/dojo/creativeStudio/model';
import {confirmBReply, previewReply, type ReplyPreview} from '@/lib/dojo/creativeStudio/reply';
import {sha256Text} from '@/lib/dojo/weavingWorkflow/clientIdentity';
export default function BReplyIntake({s,edit,paste,adopt}:{s:StudioData;edit:(p:Partial<StudioData>)=>void;paste:(text:string)=>void;adopt:()=>Promise<void>}) {
    const [parsed,setParsed]=useState<ReplyPreview|null>(null),[candidate,setCandidate]=useState(''),[error,setError]=useState(''),[adopting,setAdopting]=useState(false);
    const [include,setInclude]=useState({research:true,examples:true,candidates:true,platforms:true}),hint=useId(), f=s.collaboration;
    const current=!!f.manuscript.trim()&&(!s.b.trim()||f.manuscriptReplyDigest===sha256Text(s.b));
    function preview(andAdopt=false) {setError('');const p=previewReply(s);setParsed(p);setCandidate(p.sections['候選主文']?.trim()||(current?f.manuscript:''));setAdopting(andAdopt);}
    async function confirm(andAdopt:boolean) {
        try {
            if(!parsed) return;
            if(andAdopt&&!candidate.trim()) throw Error('請先在候選文章預覽中留下要採用的正文。若整份回覆都是文章，可用「以整份回覆作為候選文章」帶入後檢查。');
            const patch=confirmBReply(s,parsed,include,candidate);
            // edit() updates the draft reference synchronously; adopt() saves that exact candidate.
            edit(patch);setParsed(null);setError('');if(andAdopt) await adopt();
        } catch(e) {setError(String(e));}
    }
    return <section className="studio-b-intake" aria-label="B 回覆與候選文章"><h2>貼回 B 回覆，選出要採用的文章</h2><label>B 完整 AI 回覆（含研究與編輯說明）<textarea rows={10} value={s.b} onChange={e=>{paste(e.target.value);setParsed(null);setError('');}}/></label><p id={hint}>{current?'已整理候選主文，可檢查後採用；原回覆和採用前正文會保留。':s.b.trim()?'已貼回完整回覆。按「採用 B 為可編寫稿」先開啟候選預覽；確認後才更新正文。沒有固定標題也可手動選取文章。':'先貼回 AI 結果，或在下方整理候選主文；完整回覆不會自動取代正文。'}{!current&&f.manuscript.trim()?' 上一份候選仍保留；回覆已變更，請重新確認這次要採用的文章。':''}</p><div className="studio-reply-actions"><button disabled={!s.b.trim()} onClick={()=>preview()}>辨識回覆段落，先預覽</button><button className="primary" aria-describedby={hint} disabled={!s.b.trim()&&!f.manuscript.trim()} onClick={()=>current?void adopt():preview(true)}>採用 B 為可編寫稿</button></div>
    {error&&<p role="alert">{error}</p>}{parsed&&<section className="studio-reply-preview" aria-label="B 候選文章預覽"><h3>辨識預覽（確認前不改正文）</h3>{parsed.warnings.map(w=><p key={w}>{w}</p>)}<button onClick={()=>setCandidate(parsed.reply)}>以整份回覆作為候選文章</button><label>候選文章預覽（只保留要採用的文章）<textarea rows={8} value={candidate} onChange={e=>setCandidate(e.target.value)}/></label><p>請先移除研究、編輯說明或多平台稿等附帶內容。完整回覆會原樣保留；只採用此欄確認的文章。</p>{Object.entries(parsed.sections).filter(([k])=>k!=='候選主文').map(([k,v])=><details key={k}><summary>{k}</summary><p className="studio-manuscript">{v}</p></details>)}<p>辨識到 {parsed.research.length} 筆研究、{parsed.examples.length} 個例子、{parsed.platformDrafts.length} 份平台稿。研究用途待本人決定，例子不自動採用，平台稿獨立保存。</p>{(['research','examples','platforms'] as const).filter(k=>(k==='platforms'?parsed.platformDrafts:parsed[k]).length>0).map(k=><label key={k} className="studio-check"><input type="checkbox" checked={include[k]} onChange={e=>setInclude({...include,[k]:e.target.checked})}/>{{research:'加入研究候選，暫不引用',examples:'加入例子候選，暫不採用',platforms:'分別保存辨識到的平台草稿'}[k]}</label>)}<div className="studio-reply-actions"><button onClick={()=>void confirm(false)}>確認分欄，保留完整回覆</button>{adopting&&<button className="primary" onClick={()=>void confirm(true)}>確認候選並採用正文</button>}<button onClick={()=>setParsed(null)}>取消辨識</button></div></section>}
    <label>候選主文（只放文章，採用才更新正文）<textarea rows={8} value={f.manuscript} onChange={e=>edit({collaboration:{...f,manuscript:e.target.value,manuscriptReplyDigest:sha256Text(s.b)}})}/></label><label>編輯說明<textarea rows={3} value={f.editorial} onChange={e=>edit({collaboration:{...f,editorial:e.target.value}})}/></label></section>;
}
