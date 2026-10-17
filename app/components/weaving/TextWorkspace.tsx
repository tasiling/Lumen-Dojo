'use client';
import { useEffect, useRef,useState } from 'react';
import type { WeavingShuttle, WeavingWork } from '@/lib/dojo/weavingShuttle';
import { workflowFromLegacy, type TextWorkflow, type WorkflowSelection } from '@/lib/dojo/weavingWorkflow/model';
import { convertWorkflow,TEXT_TEMPLATES } from '@/lib/dojo/weavingWorkflow/templates';
import { serializeWorkflow, workflowPrompt } from '@/lib/dojo/weavingWorkflow/serialize';
import type { SelectionRequest } from '@/lib/dojo/weavingWorkflow/sources';
import type { CompletionVersion } from '@/lib/dojo/weavingWorkflow/completions';
import { WEAVING_TEXT_TOOLS } from '@/lib/dojo/weavingTools';
import { useWeavingDraft } from './useWeavingDraft';
import { get, mutate } from './client';
import SourcePicker from './SourcePicker';
import WorkflowNavigation from './WorkflowNavigation';
import TextBlockEditor from './TextBlockEditor';
import CompletionPreview from './CompletionPreview';
import CompletionHistory from './CompletionHistory';
import ConflictRecovery from './ConflictRecovery';
import {beginSave} from '@/lib/dojo/weavingWorkflow/draft';
import { useLeave } from './LeaveDialog';
type ManualSelection = {
    text: string;
    contentKind: "quote" | "understanding" | "experience" | "insight";
    locator: string;
};
type Buffer = WeavingWork & {
    manualSelections: ManualSelection[];
    selectionRequests: SelectionRequest[];
    selectedPreviews: string[];
    pasteCandidate: string;
};
const buffer = (work: WeavingWork): Buffer => ({ ...work, manualSelections: [], selectionRequests: [], selectedPreviews: [], pasteCandidate: '' });
const SOURCE_LABEL = { quote: '原文摘錄', understanding: '個人理解', experience: '自身經驗', insight: '洞察' };
export default function TextWorkspace({ work, shuttle, onSaved,onConverted }: {
    work: WeavingWork;
    shuttle: WeavingShuttle;
    onSaved: (work: WeavingWork) => void;
    onConverted:(work:WeavingWork,shuttle:WeavingShuttle)=>void;
}) {
    const conversionDialog=useRef<HTMLDialogElement>(null);const[conversion,setConversion]=useState<TextWorkflow|null>(null),[conversionTitle,setConversionTitle]=useState('');
    const leave = useLeave(), [error, setError] = useState(''), [notice, setNotice] = useState(''), [pastePreview, setPastePreview] = useState<string | null>(null), [preview, setPreview] = useState<{
        work: WeavingWork;
        digest: string;
        sequence: number;
    } | null>(null), [versions, setVersions] = useState<CompletionVersion[]>([]), [completionId, setCompletionId] = useState<string | null>(work.currentCompletionVersionId), [newPublication, setNewPublication] = useState(false), [acting, setActing] = useState(false);
    const draft = useWeavingDraft(buffer(work), async (ticket) => {
        const v = ticket.value;
        if (v.pasteCandidate.trim())
            throw new Error('貼回候選尚未套用；請先預覽並確認套用，或清空候選後保存');
        const w = v.textWorkflow ?? workflowFromLegacy(v);
        const p = await mutate<{
            work: WeavingWork;
        }>('/api/dojo/weaving-works', 'PATCH', { id: v.id, expectedRevision: ticket.revision, work: { title: v.title, nextAction: v.nextAction, outputUrl: v.outputUrl, formatSubtype: w.templateKey === 'legacy' ? v.formatSubtype : w.templateKey, textWorkflow: w, status: 'drafting' }, ...(v.selectionRequests.length ? { selectionRequests: v.selectionRequests } : {}), ...(v.manualSelections.length ? { manualSelections: v.manualSelections } : {}) });
        onSaved(p.work);
        return buffer(p.work);
    });
    const value = draft.value, w = value.textWorkflow ?? workflowFromLegacy(value), core = shuttle.coreVersions.find(c => c.id === value.coreVersionId)?.statement ?? '';
    function edit(patch: Partial<Buffer>) { draft.edit({ ...value, ...patch }); setPreview(null); setNotice(''); }
    function workflow(patch: Partial<TextWorkflow>) { edit({ textWorkflow: { ...w, ...patch } }); }
    async function loadVersions() { try {
        const r = await get<{
            completions: CompletionVersion[];
        }>('/api/dojo/weaving-works?id=' + encodeURIComponent(work.id));
        setVersions(r.completions ?? []);
    }
    catch (e) {
        setError(e instanceof Error ? e.message : String(e));
    } }
    useEffect(() => { const t = setTimeout(() => void loadVersions(), 0); return () => clearTimeout(t); }, [work.id]); // eslint-disable-line react-hooks/exhaustive-deps
    async function previewSaved() { setActing(true); setError(''); try {
        if (draft.dirty && !await draft.save())
            return;
        const snapshot = draft.current();
        const r = await get<{
            work: WeavingWork;
            previewDigest: string;
        }>('/api/dojo/weaving-works?id=' + encodeURIComponent(work.id));
        if (r.work.revision !== snapshot.baseline.revision || draft.current().editSequence !== snapshot.editSequence)
            throw new Error('保存期間有新輸入，請再保存後預覽。');
        setPreview({ work: r.work, digest: r.previewDigest, sequence: snapshot.editSequence });
    }
    catch (e) {
        setError(e instanceof Error ? e.message : String(e));
    }
    finally {
        setActing(false);
    } }
    async function complete() { if (!preview || draft.dirty || preview.sequence !== draft.state.editSequence) {
        setError('目前文字已變更，請重新保存並預覽。');
        return;
    } setActing(true); setError(''); const ticket=beginSave(draft.current());try {
        const r = await mutate<{
            work: WeavingWork;
            completion: CompletionVersion;
        }>('/api/dojo/weaving-works', 'POST', { action: 'complete', workId: work.id, expectedRevision: preview.work.revision, previewDigest: preview.digest });
        draft.applyServer(ticket,buffer(r.work));
        onSaved(r.work);
        setCompletionId(r.completion.id);
        setPreview(null);
        setNotice('已保存固定成品版本，後續編輯不會改動這個版本。');
        await loadVersions();
    }
    catch (e) {
        setError(e instanceof Error ? e.message : String(e));
    }
    finally {
        setActing(false);
    } }
    async function handoff() { if (draft.dirty) {
        setError('目前還有未保存的修改。請先處理，再交接固定版本。');
        return;
    } setActing(true); setError(''); try {
        const r = await mutate<{
            project: {
                id: string;
            };
        }>('/api/dojo/liaojie-projects', 'POST', { weavingWorkId: work.id, weavingShuttleId: shuttle.id, ...(completionId ? { completionVersionId: completionId } : {}), createNewVersion: newPublication });
        leave.requestLeave(() => { location.href = `/liaojie/workbench?id=${r.project.id}`; });
    }
    catch (e) {
        setError(e instanceof Error ? e.message : String(e));
    }
    finally {
        setActing(false);
    } }
    function template(key:string){
      if(key===w.templateKey)return;
      try{const candidate=convertWorkflow(w,key);setConversion(candidate);setConversionTitle(`${value.title}（${TEXT_TEMPLATES[key].label}）`.slice(0,200));setError('');conversionDialog.current?.showModal();}catch(e){setError(e instanceof Error?e.message:String(e));}
    }
    async function confirmConversion(){if(!conversion)return;setActing(true);setError('');try{
      if(draft.dirty&&!await draft.save())return;
      const snapshot=draft.current();
      const r=await mutate<{work:WeavingWork;shuttle:WeavingShuttle}>('/api/dojo/weaving-works','POST',{shuttleId:shuttle.id,title:conversionTitle,format:'text',templateKey:conversion.templateKey,derivedFromWorkId:work.id,expectedSourceRevision:snapshot.baseline.revision});
      conversionDialog.current?.close();onConverted(r.work,r.shuttle);
    }catch(e){setError(e instanceof Error?e.message:String(e));}finally{setActing(false);}}
    async function copy() { try {
        await navigator.clipboard.writeText(workflowPrompt(w, w.currentStep, core, w.audience || shuttle.audience));
        setNotice('已複製此步驟指令，僅包含明確选摘與目前作品。');
    }
    catch {
        setError('複製失敗，請檢查瀏覽器剪貼簿權限。');
    } }
    const tool = WEAVING_TEXT_TOOLS[w.templateKey];
    return <><dialog ref={conversionDialog} className="wf-leave" aria-labelledby="conversion-title" onCancel={e=>{if(acting)e.preventDefault();}}><h2 id="conversion-title">模板轉換預覽</h2><p>保留原稿的文字、段落與備註，另建立一件模板工作版本。</p>{conversion&&<><label htmlFor="conversion-name">新工作版本名稱</label><input id="conversion-name" value={conversionTitle} disabled={acting} onChange={e=>setConversionTitle(e.target.value)}/><p>{TEXT_TEMPLATES[conversion.templateKey]?.label}</p><div className="full-text-preview">{serializeWorkflow(conversion)}</div><p>保留 {w.blocks.length} 個原稿段落，增加新模板的空白段落。</p></>}{error&&<p role="alert">{error}</p>}{draft.state.error&&<p role="alert">{draft.state.error}</p>}<div className="wf-actions"><button disabled={acting} onClick={()=>{conversionDialog.current?.close();setConversion(null);}}>取消轉換</button><button className="primary" disabled={acting||!conversionTitle.trim()} onClick={()=>void confirmConversion()}>確認另建模板版本</button></div></dialog>
 <WorkflowNavigation step={w.currentStep} onChange={step => workflow({ currentStep: step })}/>
 <div className="wf-save-state" role="status">{draft.busy ? '正在保存…' : draft.dirty ? '有未保存的修改' : draft.state.status === 'saved' ? '已保存' : '已讀取目前保存版本'} · r{draft.state.baseline.revision}{draft.state.error && <p role="alert">{draft.state.error}。輸入仍保留；版本衝突時請先複製文字，再重新讀取比較。</p>}</div>
 <ConflictRecovery draft={draft} loadLatest={async()=>buffer((await get<{work:WeavingWork}>('/api/dojo/weaving-works?id='+encodeURIComponent(work.id))).work)} render={v=><><h4>{v.title}</h4><div className="full-text-preview">{serializeWorkflow(v.textWorkflow??workflowFromLegacy(v))}</div><p>受眾：{v.textWorkflow?.audience}</p><p>構思：{v.textWorkflow?.outline}</p><p>下一步：{v.nextAction}</p><p>成品連結：{v.outputUrl}</p><details><summary>來源選摘與畫面備註</summary>{v.textWorkflow?.sourceSelections.map((source,i)=><p key={i}>{SOURCE_LABEL[source.contentKind]} · {source.locator}<br/>{source.selectedText}</p>)}{v.textWorkflow?.blocks.filter(b=>b.mediaNote).map(b=><p key={b.id}>{b.role}：{b.mediaNote}</p>)}</details></>}/>{error && <p className="form-error" role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
 <section className="ritual-card"><span className="eyebrow">正在續作</span><h2>{value.title}</h2><label htmlFor="work-title">作品名稱</label><input id="work-title" className="field" value={value.title} onChange={e => edit({ title: e.target.value })}/>
 {w.currentStep === 'sources' && <><h3>保留這件作品使用的素材</h3><p className="wf-note">只加入要引用的部分；自己的經驗與理解會與原文分別標示。</p>{w.sourceSelections.map((s: WorkflowSelection, i) => <div className="wf-selection" key={`${s.digest}-${i}`}><b>{SOURCE_LABEL[s.contentKind]} · {s.locator || '人工素材'}</b><p>{s.selectedText}</p><button onClick={() => workflow({ sourceSelections: w.sourceSelections.filter((_, index) => i !== index) })}>移除這段選摘</button></div>)}{value.selectedPreviews.map((p, i) => <div className="wf-selection" key={i}><b>待保存選摘</b><p>{p}</p><button onClick={() => edit({ selectionRequests: value.selectionRequests.filter((_, n) => i !== n), selectedPreviews: value.selectedPreviews.filter((_, n) => i !== n) })}>取消加入</button></div>)}{value.manualSelections.map((p, i) => <div className="wf-selection" key={`manual-${i}`}><b>{SOURCE_LABEL[p.contentKind]} · 待保存</b><p>{p.text}</p><button onClick={() => edit({ manualSelections: value.manualSelections.filter((_, n) => n !== i) })}>取消加入</button></div>)}<SourcePicker pickerId={work.id} onManual={p => edit({ manualSelections: [...value.manualSelections, p] })} bookId={new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search).get('book') ?? undefined} onSelect={(req, p) => edit({ selectionRequests: [...value.selectionRequests, req], selectedPreviews: [...value.selectedPreviews, p] })}/></>}
 {w.currentStep === 'concept' && <><h3>先決定這次要說什麼</h3><p>這件作品的核心觀點：{core}</p><label htmlFor="work-audience">想讓誰理解？</label><input id="work-audience" value={w.audience} onChange={e => workflow({ audience: e.target.value })}/><label htmlFor="work-outline">構思／段落方向</label><textarea id="work-outline" rows={6} value={w.outline} onChange={e => workflow({ outline: e.target.value })}/><h3>文字形式</h3>{w.templateKey==='plurk'&&<><label htmlFor="plurk-output-kind">交付種類</label><select id="plurk-output-kind" value={w.outputKind} onChange={e=>workflow({outputKind:e.target.value as TextWorkflow['outputKind']})}><option value="post">單篇短貼文</option><option value="thread">有順序的串文</option></select></>}<div className="wf-templates">{Object.entries(TEXT_TEMPLATES).map(([key, t]) => <button key={key} aria-pressed={w.templateKey === key} onClick={() => template(key)}><b>{t.label}</b><p>{t.note}</p></button>)}</div></>}
 {w.currentStep === 'production' && <><h3>{TEXT_TEMPLATES[w.templateKey]?.label ?? '保留舊稿／自由文字'}</h3><p className="wf-note">{TEXT_TEMPLATES[w.templateKey]?.note}</p><TextBlockEditor blocks={w.blocks} onChange={blocks => workflow({ blocks })}/><label htmlFor="paste-candidate">外部工具结果貼回（候選）</label><textarea id="paste-candidate" rows={6} value={value.pasteCandidate} onChange={e => { edit({ pasteCandidate: e.target.value }); setPastePreview(null); }}/><button disabled={!value.pasteCandidate.trim()} onClick={() => setPastePreview(value.pasteCandidate)}>預覽貼回候選</button>{pastePreview !== null && <div><div className="full-text-preview">{pastePreview}</div><button disabled={pastePreview !== value.pasteCandidate} onClick={() => { edit({ textWorkflow: { ...w, blocks: [{ id: crypto.randomUUID(), role: '確認貼回的文字', text: pastePreview, mediaNote: '' }] }, pasteCandidate: '' }); setPastePreview(null); }}>確認套用貼回文字</button></div>}</>}
 {w.currentStep === 'review' && <><h3>確認交付內容</h3><div className="full-text-preview">{serializeWorkflow(w)}</div><label htmlFor="output-url">成品連結（選填）</label><input id="output-url" type="url" value={value.outputUrl} onChange={e => edit({ outputUrl: e.target.value })}/><button disabled={acting || draft.busy} onClick={() => void previewSaved()}>保存並預覽目前版本</button><p className="wf-note">變更文字、来源或連結後，需再次預覽。</p></>}
 {w.currentStep === 'handoff' && <><h3>手動交接已確認的成品</h3><p>選擇下方固定版本，再把內容送往聊解室。</p><label htmlFor="handoff-version">交接版本</label><select id="handoff-version" value={completionId ?? ''} onChange={e => setCompletionId(e.target.value || null)}><option value="">舊版完成快照（若有）</option>{versions.map(v => <option key={v.id} value={v.id}>{v.title} · {new Date(v.createdAt).toLocaleString('zh-TW')}</option>)}</select><label><input type="checkbox" style={{ width: 'auto' }} checked={newPublication} onChange={e => setNewPublication(e.target.checked)}/> 這件作品已有企劃時，確認為不同成品建立新的發布版本</label><button className="primary" disabled={acting || draft.dirty || (!completionId && !['completed', 'sent_to_liaojie'].includes(value.status))} onClick={() => void handoff()}>手動送往聊解室</button></>}
 <label htmlFor="next-action">這件作品的下一步</label><input id="next-action" value={value.nextAction} onChange={e => edit({ nextAction: e.target.value })}/><div className="wf-actions"><button className="primary" disabled={draft.busy || acting} onClick={() => void draft.save()}>保存進度</button><button onClick={() => void copy()}>複製此步驟製作指令</button>{tool?.href && <a href={tool.href} target="_blank" rel="noreferrer">開啟 {tool.label} ↗</a>}</div>
 </section>
 {preview && <CompletionPreview work={preview.work} onConfirm={() => void complete()} disabled={acting || draft.dirty || preview.sequence !== draft.state.editSequence}/>}
 {(w.currentStep === 'review' || w.currentStep === 'handoff') && <CompletionHistory versions={versions} legacy={work.finalSnapshot} onSelect={id => { setCompletionId(id); workflow({ currentStep: 'handoff' }); }}/>}
 </>;
}
