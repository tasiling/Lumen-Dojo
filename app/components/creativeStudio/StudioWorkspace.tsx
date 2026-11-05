'use client';
import { makeTask, bindResponse, taskContext, taskStatus, taskKey } from '@/lib/dojo/creativeStudio/tasks';
import SourcePicker from '../weaving/SourcePicker';
import type { SelectionRequest } from '@/lib/dojo/weavingWorkflow/sources';
import RecoveredPublishing from './RecoveredPublishing';
import { randomID, copyText, copyAfterPreparing, sha256Text } from '@/lib/dojo/weavingWorkflow/clientIdentity';
import Link from 'next/link';
import LegacyGraphicsPanel from './LegacyGraphicsPanel';
import { replySource } from '@/lib/dojo/creativeStudio/reply';
import CollaborationPanel from './CollaborationPanel';
import InstructionTransfer from './InstructionTransfer';
import BReplyIntake from './BReplyIntake';
import ResearchCandidates from './ResearchCandidates';
import WritingTargets from './WritingTargets';
import WritingEntryGuide from './WritingEntryGuide';
import { cBase, instructionsForSource, recordRound, replyText } from '@/lib/dojo/creativeStudio/collaboration';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import CreativeIcon from '../creative/CreativeIcon';
import LeaveProvider from '../weaving/LeaveDialog';
import ConflictRecovery from '../weaving/ConflictRecovery';
import { useWeavingDraft } from '../weaving/useWeavingDraft';
import { get, mutate } from '../weaving/client';
import { studioForWork, blankStudio, adoptDirection, startD, studioPromptSource, type StudioData } from '@/lib/dojo/creativeStudio/model';
import type { WeavingWork, WeavingShuttle } from '@/lib/dojo/weavingShuttle';
import type { CompletionVersion } from '@/lib/dojo/weavingWorkflow/completions';
import './studio.css';
import '@/app/weaving/workflow.css';
type Bundle = {
    work: WeavingWork;
    completions: CompletionVersion[];
    previewDigest: string;
};
type Edit = {
    id: string;
    revision: number;
    title: string;
    shuttleId: string;
    studio: StudioData;
};
const editor = (w: WeavingWork): Edit => ({ id: w.id, revision: w.revision, title: w.title, shuttleId: w.shuttleId, studio: studioForWork(w) });
function Field({ label, value, onChange, rows = 6 }: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    rows?: number;
}) { return <label>{label}<textarea rows={rows} value={value} onChange={e => onChange(e.target.value)}/></label>; }
export function Editor({ initial, realm = 'weaving', startInWriting = false }: {
    realm?: 'weaving' | 'liaojie';
    startInWriting?: boolean;
    initial: Bundle;
}) {
    const [confirmStale,setConfirmStale]=useState(false);
    const [copyFeedback,setCopyFeedback]=useState({message:'',failed:false}),[checkText,setCheckText]=useState(''),[checkFeedback,setCheckFeedback]=useState({message:'',failed:false});
    const [replyTaskChoices,setReplyTaskChoices]=useState<Record<string,string>>({});
    const [bundle, setBundle] = useState(initial), [step, setStep] = useState(startInWriting ? 2 : 0), [error, setError] = useState(''), [notice, setNotice] = useState(''), [topics, setTopics] = useState<WeavingShuttle[]>([]), [versionId, setVersionId] = useState(''), [correction, setCorrection] = useState(''), [correctionNote, setCorrectionNote] = useState(''), [busy, setBusy] = useState(false), [confirmHandoff, setConfirmHandoff] = useState(false), [newPublication, setNewPublication] = useState(false), [fixedExport, setFixedExport] = useState(''), [reviewed, setReviewed] = useState(''), [related, setRelated] = useState<WeavingWork[]>([]), [promptText, setPromptText] = useState('');
    const router = useRouter();
    const draft = useWeavingDraft(editor(initial.work), async (ticket) => {
        const r = await mutate<{
            work: WeavingWork;
        }>('/api/dojo/creative-studio', 'POST', { action: 'save', id: ticket.entityId, expectedRevision: ticket.revision, title: ticket.value.title, shuttleId: ticket.value.shuttleId, studio: ticket.value.studio });
        const b = await get<Bundle>('/api/dojo/creative-studio?id=' + r.work.id);
        setBundle(b);
        return editor(b.work);
    });
    const value = draft.value, s = value.studio, c = bundle.completions.find(x => x.id === versionId);
    const source = s.source, cb = cBase(s.collaboration);
    const legacyData = s.legacy?.data as Record<string, unknown> | undefined;
    const graphicChoices = [...(Array.isArray(legacyData?.pages) && legacyData.pages.length ? [{ id: 'draft', title: '舊版目前圖文草稿' }] : []), ...(Array.isArray(legacyData?.versions) ? legacyData.versions.flatMap((v: Record<string, unknown>) => Array.isArray(v.pages) && v.pages.length ? [{ id: String(v.id), title: String(v.title || v.id) }] : []) : [])];
    useEffect(() => {
        get<{
            topics: WeavingShuttle[];
        }>('/api/dojo/creative-studio').then(r => setTopics(r.topics)).catch(e => setError(String(e)));
    }, []);
    useEffect(() => {
        get<{
            works: WeavingWork[];
        }>('/api/dojo/creative-studio?includeArchived=1').then(r => setRelated(r.works)).catch(e => setError(String(e)));
    }, []);
    function editStudio(p: Partial<StudioData>) { setConfirmStale(false); draft.edit({ ...draft.current().value, studio: { ...draft.current().value.studio, ...p } }); setReviewed(''); setNotice(''); setPromptText(''); setCopyFeedback({message:'',failed:false});setCheckText('');setCheckFeedback({message:'',failed:false}); }
    function editSource(p: Partial<StudioData['source']>) { editStudio({ source: { ...source, ...p }, checks: { ...s.checks, facts: false, privacy: false } }); }
    async function save() {
        setError('');
        const ok = await draft.save();
        if (ok)
            setNotice('已保存，可以重新開啟接續。');
        return ok;
    }
    async function preview() {
        if (await save()) {
            const b = await get<Bundle>('/api/dojo/creative-studio?id=' + value.id);
            setBundle(b);
            setReviewed(b.previewDigest);
            setStep(3);
        }
    }
    async function complete() {
        setBusy(true);
        setError('');
        try {
            if (draft.dirty || reviewed !== bundle.previewDigest)
                throw Error('請先保存並預覽目前正文');
            const done = await mutate<{
                work: WeavingWork;
                completion: CompletionVersion;
            }>('/api/dojo/creative-studio', 'POST', { action: 'complete', id: value.id, expectedRevision: draft.current().baseline.revision, previewDigest: reviewed });
            const b = await get<Bundle>('/api/dojo/creative-studio?id=' + value.id);
            setBundle(b);
            draft.reset(editor(b.work));
            setVersionId(done.completion.id);
            setNotice('這份完稿已固定，可帶到 D 或準備發布。');
        }
        catch (e) {
            setError(String(e));
        }
        finally {
            setBusy(false);
        }
    }
    async function handoff() {
        setBusy(true);
        setError('');
        try {
            if (!c || !confirmHandoff)
                throw Error('請選定完稿並確認公開用途');
            if (draft.dirty)
                throw Error('請先保存目前輸入，再交接固定版本');
            const r = await mutate<{
                project: {
                    id: string;
                };
            }>('/api/dojo/creative-studio', 'POST', { action: 'handoff', returnRealm:realm,id: value.id, completionId: c.id, publicationConfirmed: confirmHandoff, createNewVersion: newPublication });
            router.push('/liaojie/workbench?id=' + r.project.id);
        }
        catch (e) {
            setError(String(e));
        }
        finally {
            setBusy(false);
        }
    }
    async function transition(transition: string) {
        if (draft.dirty && !await save())
            return;
        setBusy(true);
        try {
            const r = await mutate<{
                work: WeavingWork;
            }>('/api/dojo/creative-studio', 'POST', { action: 'transition', transition, id: value.id, expectedRevision: draft.current().baseline.revision });
            setBundle({ ...bundle, work: r.work });
            draft.reset(editor(r.work));
            setNotice('作品狀態已更新');
        }
        catch (e) {
            setError(String(e));
        }
        finally {
            setBusy(false);
        }
    }
    async function routeCandidate(candidateId: string, choice: string) {
        if (!await save())
            return;
        setBusy(true);
        setError('');
        try {
            const topic = topics.find(t => t.id === draft.current().value.shuttleId), mode = choice.startsWith('merge:') ? 'merge' : choice;
            const r = await mutate<{
                work: WeavingWork;
                topic: WeavingShuttle;
            }>('/api/dojo/creative-studio', 'POST', { action: 'route-candidate', id: value.id, candidateId, mode, topicId: topic?.id || '', expectedTopicRevision: topic?.revision, directionId: mode === 'merge' ? choice.slice(6) : '', completionId: versionId, expectedRevision: draft.current().baseline.revision });
            setTopics(rows => [...rows.filter(t => t.id !== r.topic.id), r.topic]);
            const b = await get<Bundle>('/api/dojo/creative-studio?id=' + value.id);
            setBundle(b);
            draft.reset(editor(b.work));
            setNotice('候選已接入方向；原回覆與舊理解保留。');
        }
        catch (e) {
            setError(String(e));
        }
        finally {
            setBusy(false);
        }
    }
    async function adoptResearch(taskId:string,keepStructure:boolean){
        if(!await save())throw Error('請先成功保存整合回覆');setBusy(true);
        try{const current=draft.current().value;await mutate('/api/dojo/creative-studio','POST',{action:'adopt-research',id:current.id,expectedRevision:draft.current().baseline.revision,taskId,replyDigest:sha256Text(JSON.stringify(current.studio.researchWork.integrationReply)),confirm:true,keepStructure});const b=await get<Bundle>('/api/dojo/creative-studio?id='+current.id);setBundle(b);draft.reset(editor(b.work));setNotice('已採用研究整合稿，舊正文與當輪來源保留。');}finally{setBusy(false);}
    }
    async function adopt(moduleName: 'B' | 'C') {
        if (!await save())
            return;
        setBusy(true);
        setError('');
        try {
            const r = await mutate<{
                work: WeavingWork;
            }>('/api/dojo/creative-studio', 'POST', { action: 'adopt', id: value.id, expectedRevision: draft.current().baseline.revision, moduleName, confirmStale });
            const b = await get<Bundle>('/api/dojo/creative-studio?id=' + r.work.id);
            setBundle(b);
            draft.reset(editor(b.work));
            setNotice('已採用候選主文；改寫前正文與本輪回覆已保存。');
        }
        catch (e) {
            setError(String(e));
        }
        finally {
            setBusy(false);
        }
    }
    async function derive() {
        if (!await save())
            return;
        setBusy(true);
        try {
            const r = await mutate<{
                work: WeavingWork;
            }>('/api/dojo/creative-studio', 'POST', { action: 'derive', id: value.id, expectedRevision: draft.current().baseline.revision, confirmStale });
            router.push('/' + realm + '/works/' + r.work.id);
        }
        catch (e) {
            setError(String(e));
        }
        finally {
            setBusy(false);
        }
    }
    function currentContext() {
        if (s.module === 'C' && !cb.text.trim())
            throw Error('請先帶入這輪要使用的主文版本');
        if (s.module === 'C' && cb.versionId && !['draft', 'manual'].includes(cb.versionId)) {
            const fixed = bundle.completions.find(v => v.id === cb.versionId);
            const context = studioPromptSource(s, 'D', fixed, fixedExport);
            return { ...context, text: cb.text || context.text };
        }
        return studioPromptSource(s, s.module, c, fixedExport);
    }
    function instructionsForContext() {
        if (s.module === 'D' || s.module === 'C' && cb.versionId && !['draft', 'manual'].includes(cb.versionId)) {
            const fixed = s.module === 'D' ? c : bundle.completions.find(v => v.id === cb.versionId), base = fixed?.studioSnapshot ? studioForWork({ studio: fixed.studioSnapshot }) : blankStudio();
            return instructionsForSource(s, base);
        }
        return instructionsForSource(s);
    }
    async function round() {
        try {
            const r = recordRound(s, currentContext(), instructionsForContext());
            editStudio({ collaboration: { ...s.collaboration, rounds: [...s.collaboration.rounds, r] } });
            await save();
        }
        catch (e) {
            setError(String(e));
        }
    }
    async function review() {
        try {
            const r = { ...recordRound(s, currentContext(), instructionsForContext()), mode: 'review', reply: s.collaboration.reviewReply };
            editStudio({ collaboration: { ...s.collaboration, rounds: [...s.collaboration.rounds, r] } });
            await save();
        }
        catch (e) {
            setError(String(e));
        }
    }
    function downloadText(text: string, name: string) { const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' })), a = document.createElement('a'); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url); }
    async function importReply(file: File | undefined) {
        if (!file)
            return;
        const moduleName = s.module, mode = s.collaboration.cMode, sequence = draft.current().editSequence;
        try {
            if (file.size > 240000)
                throw Error('回覆檔案過大，請拆分');
            const text = await file.text(), now = draft.current().value.studio;
            if (now.module !== moduleName || now.collaboration.cMode !== mode || draft.current().editSequence !== sequence)
                throw Error('模組已切換，請回原模組重新匯入');
            if (moduleName === 'C' && mode === 'expand')
                editStudio({ collaboration: { ...now.collaboration, cExpandedResponse: text, responseTasks:bindResponse(now) } });
            else
                editStudio({ [moduleName.toLowerCase()]: text, collaboration:{...now.collaboration,responseTasks:bindResponse(now)} });
            setNotice('已帶入完整回覆，請檢查後保存本輪。');
        }
        catch (e) {
            setError(String(e));
        }
    }
    async function copyReady(text: string, checking = false) {
        const feedback=checking?setCheckFeedback:setCopyFeedback;
        try { await copyText(text); feedback({message:'已複製完整指令，請到 ChatGPT 貼上。',failed:false});setNotice(checking?'已複製檢查指令；請將檢查結果貼回並另存一輪。':'已複製本次選摘與模組指令，請將結果貼回下方欄位。'); }
        catch { feedback({message:'這個頁面未能寫入剪貼簿。指令已保留，請按「全選指令」後手動複製，或下載指令檔。',failed:true});setNotice('指令已保留，請在指令區全選複製。'); }
    }
    async function checkReply() {
        try {
            const context=currentContext(),text='請檢查以下協作回覆：核對分欄、原意、引用出處與是否虛構；新建議保持候選。不要直接改寫已採用主稿。\n'+instructionsForContext()+'\n來源 '+context.versionId+'：\n'+context.text+'\n完整回覆：\n'+replyText(s);
            setCheckText(text); await copyReady(text,true);
        } catch(e) {setCheckFeedback({message:String(e),failed:true});setError(String(e));}
    }
    async function prompt() {
        setError('');
        if(promptText){await copyReady(promptText);return;}
        try {
            const moduleName=s.module,context=currentContext(),sequence=draft.current().editSequence,instructionsText=instructionsForContext();
            const instructions={A:'從選摘探索可保留的方向。不要把推測寫成作者經歷；可提問，保留未定理解。',B:'整理成作者語氣的完整主文。研究另列，不把研究整包塞入正文；來源與假設分清楚。',C:'僅執行本次選定的轉製或擴寫任務。不得補造動作、停頓與經歷。',D:'從這份已確認的作品延伸方向，標明來源作品與版本，不要求先發表。'};
            if(moduleName==='D'&&!c)throw Error('D 請先選本件完稿版本');
            setBusy(true);
            const copied=await copyAfterPreparing(async()=>{
                const voiceSettings=await get<{voice:{confirmed:boolean;proposal:string}}>('/api/dojo/creative-voice');
                if(sequence!==draft.current().editSequence)throw Error('設定已變更，請重新產生指令');
                const generated=(voiceSettings.voice.confirmed?'本人已確認語氣偏好：'+voiceSettings.voice.proposal+'\n\n':'')+instructionsText+'\n'+instructions[moduleName]+'\n\n作品：'+(moduleName==='D'?c?.title:value.title)+'\n來源版本：'+context.versionId+'\n本次文字：\n'+context.text+'\n\n這個來源版本的理解：'+(context.understanding||'未記錄；只依本次文字探索，不引用目前草稿的其他理解。')+'\n請將主文、研究與例子類型分開。';
                const ticket={...makeTask(s,context,instructionsText,currentTask.answers),prompt:generated};
                editStudio({collaboration:{...s.collaboration,tasks:[...s.collaboration.tasks,ticket]}});
                if(!await save())throw Error('協作任務尚未保存，請先重試保存再複製');
                if(draft.current().value.studio?.collaboration.tasks.findLast(t=>t.key===ticket.key)?.id!==ticket.id)throw Error('協作設定已變更，請重新產生指令');
                setPromptText(generated);return generated;
            });
            setCopyFeedback(copied?{message:'已複製完整指令，請到 ChatGPT 貼上。',failed:false}:{message:'指令已保存，但這個頁面未能寫入剪貼簿。請按「重新複製完整指令」，或按「全選指令」後手動複製。',failed:true});
            setNotice(copied?'已複製本次選摘與模組指令，請將結果貼回下方欄位。':'指令已保存，可在指令區重試複製或全選。');
        } catch(e) {setCopyFeedback({message:String(e),failed:true});setError(String(e));}
        finally {setBusy(false);}
    }
    function backup() {
        if (draft.dirty) {
            setError('請先保存目前輸入再下載備份');
            return;
        }
        const a = document.createElement('a'), url = URL.createObjectURL(new Blob([JSON.stringify({ work: bundle.work, completionVersions: bundle.completions }, null, 2)], { type: 'application/json' }));
        a.href = url;
        a.download = 'weaving-work-' + value.id + '.json';
        a.click();
        URL.revokeObjectURL(url);
    }
    const steps = [['document', '讀取素材'], ['compass', '釐清想法'], ['pen', '編寫作品'], ['eye', '預覽定稿'], ['handoff', '準備發布']] as const;
    const checks = <div className="studio-checks"><h3>這次的共通收尾</h3>{([['facts', '已核對原意、經驗與假設'], ['privacy', '已核對人物與私人細節'], ['citations', '已核對引用及素材使用'], ['voice', '這份文字符合我要表達的語氣']] as const).map(([key, label]) => <label key={key}><input type="checkbox" checked={s.checks[key]} onChange={e => editStudio({ checks: { ...s.checks, [key]: e.target.checked } })}/>{label}</label>)}</div>;
    const taskFixed=s.module==='D'?c:s.module==='C'&&!['','draft','manual'].includes(cb.versionId)?bundle.completions.find(v=>v.id===cb.versionId):undefined;
    const currentTask=taskContext(s,taskFixed?.studioSnapshot,taskFixed?.id);
    const selectedReplyTask=replyTaskChoices[taskKey(s)]??s.collaboration.tasks.findLast(t=>t.key===taskKey(s))?.id??'';
    function responseBinding(){return bindResponse(s,replyTaskChoices[taskKey(s)]??s.collaboration.tasks.findLast(t=>t.key===taskKey(s))?.id??'');}
    const provenance=taskStatus(s,currentTask,currentTask.settings);
    async function joinSource(request:SelectionRequest){if(!await save())return;setBusy(true);try{await mutate('/api/dojo/creative-studio','POST',{action:'select-sources',id:value.id,expectedRevision:draft.current().baseline.revision,selectionRequests:[request]});const b=await get<Bundle>('/api/dojo/creative-studio?id='+value.id);setBundle(b);draft.reset(editor(b.work));setNotice('選摘已加入本件作品。原來源保留，請重新核對本次對外用途。');}catch(e){setError(String(e));}finally{setBusy(false);}}
    const sourcePicker=<details><summary>選行光剪藏、閱讀或野採素材加入本件作品</summary><SourcePicker exploration pickerId={'studio-'+value.id} onSelect={request=>void joinSource(request)}/><details><summary>已帶入的來源與版本</summary>{bundle.work.textWorkflow?.sourceSelections.map((r,i)=><p key={i}>{r.sourceType} · {r.sourceId} · {r.sourceVersion}<br/>{r.locator}<br/>{r.selectedText}</p>)}</details></details>;
    async function recoveredHandoff(platformDraftId:string){if(!await save())return;setBusy(true);try{const r=await mutate<{project:{id:string}}>('/api/dojo/creative-studio','POST',{action:'handoff-platform',returnRealm:realm,id:value.id,expectedRevision:draft.current().baseline.revision,platformDraftId,publicationConfirmed:true});router.push('/liaojie/workbench?id='+r.project.id);}catch(e){setError(String(e));}finally{setBusy(false);}}
    const chooseVersion = <label>本件完稿版本<select value={versionId} onChange={e => { setVersionId(e.target.value); setFixedExport(''); }}><option value="">請明確選擇</option>{bundle.completions.map((v, i) => <option key={v.id} value={v.id}>{v.title} · {v.createdAt} · {bundle.completions.length - i}</option>)}</select></label>;
    return <section className="screen studio studio-workspace"><div className="studio-work-header"><Link href={"/" + realm + "/works"}>作品／探索草稿</Link><Link href={"/" + realm}>返回{realm === 'liaojie' ? '聊解室' : '織光堂'}</Link><span>{draft.dirty ? '尚未保存' : '已保存'} · r{draft.current().baseline.revision}</span></div><label>作品名稱<input value={value.title} onChange={e => { draft.edit({ ...value, title: e.target.value }); setReviewed('');setPromptText('');setCopyFeedback({message:'',failed:false}); }}/></label>
 <nav className="studio-steps" aria-label="製作五步">{steps.map(([name, label], i) => <button key={name} className={step === i ? 'active' : ''} aria-current={step === i ? 'step' : undefined} onClick={() => setStep(i)}><CreativeIcon name={name}/><span>{label}</span></button>)}</nav>
 {error && <p role="alert" className="form-error">{error}</p>}{draft.state.error && <p role="alert" className="form-error">{draft.state.error}</p>}{notice && <p role="status">{notice}</p>}<ConflictRecovery draft={draft} loadLatest={async () => { const b = await get<Bundle>('/api/dojo/creative-studio?id=' + value.id); setBundle(b); return editor(b.work); }} render={v => <div><b>{v.title}</b><p className="studio-manuscript">{v.studio.body}</p></div>}/>
 <section className="ritual-card"><p>狀態：{bundle.work.status === 'archived' ? '已封存' : ['completed', 'sent_to_liaojie'].includes(bundle.work.status) ? '已完稿' : '進行中'}</p>{['completed', 'sent_to_liaojie'].includes(bundle.work.status) && <button onClick={() => void transition('revise')}>開始修訂（保留上次完稿）</button>}{bundle.work.status === 'archived' ? <button onClick={() => void transition('restore')}>恢復作品</button> : <button onClick={() => void transition('archive')}>封存作品</button>}{related.filter(w => w.id === bundle.work.derivedFromWorkId || w.derivedFromWorkId === value.id).map(w => <Link className="studio-entry" key={w.id} href={'/' + realm + '/works/' + w.id}>{w.id === bundle.work.derivedFromWorkId ? '來源作品：' : '相關衍生稿：'}{w.title}</Link>)}{bundle.work.derivedFromWorkId && related.find(w => w.id === bundle.work.derivedFromWorkId)?.draftText !== s.collaboration.cSource && <p>來源已有不同內容；本稿保留原參照，請核對是否需要重新轉製。</p>}</section>
 <fieldset disabled={busy || draft.busy}>
 <details className="studio-writing-help"><summary>靈感給 A，草稿給 B｜起點說明與切換</summary><WritingEntryGuide realm={realm} disabled={busy || draft.busy} onChoose={moduleName => { editStudio({ module: moduleName }); setStep(2); }}/></details>
 {step === 0 && <section className="ritual-card"><h1>保留原稿，選這次想用的內容</h1>{sourcePicker}<p>原稿和校訂分開保存，不會因為選素材就建立織光杼。</p><label>來源名稱<input value={source.title} onChange={e => editSource({ title: e.target.value })}/></label>{bundle.work.studio?.source.raw ? <details><summary>查看已保存原稿</summary><p className="studio-manuscript">{source.raw}</p></details> : <Field label="原始逐字稿／想法" value={source.raw} onChange={v => editSource({ raw: v, selected: source.selected === source.raw ? v : (source.selected || v) })}/>}
 <Field label="追加校訂文字" value={correction} onChange={setCorrection}/><label>這次修正什麼<input value={correctionNote} onChange={e => setCorrectionNote(e.target.value)}/></label><button disabled={!correction.trim()} onClick={() => { const id = randomID(); editSource({ corrections: [...source.corrections, { id, text: correction, note: correctionNote, createdAt: new Date().toISOString() }], selected: correction, selectedVersion: id }); setCorrection(''); }}>保存為新的校訂版本</button><details><summary>原稿與校訂歷史（{source.corrections.length}）</summary><p className="studio-manuscript">原稿：{source.raw}</p>{source.corrections.map(r => <div key={r.id}><b>{r.note || '校訂'}</b><p className="studio-manuscript">{r.text}</p><button onClick={() => editSource({ selected: r.text, selectedVersion: r.id })}>選用此版文字</button></div>)}</details><Field label="本次選摘（可縮小使用範圍）" value={source.selected} onChange={v => editSource({ selected: v })}/><label>讀取範圍<select value={source.read} onChange={e => editSource({ read: e.target.value as typeof source.read, ...(e.target.value === 'private' ? { allowAI: false, allowPublic: false } : {}) })}><option value="selected">僅本次選摘</option><option value="allowed">指定來源可主動取材</option><option value="private">只限本人查看</option></select></label><label className="studio-check"><input type="checkbox" checked={source.allowAI} onChange={e => editSource({ allowAI: e.target.checked })}/>本次選摘可交給外部 AI／製作工具</label><label className="studio-check"><input type="checkbox" checked={source.allowPublic} onChange={e => editSource({ allowPublic: e.target.checked })}/>本次選摘經核對可用於公開作品</label><div className="studio-link-grid"><Link href="/forage">回野採取材</Link><Link href={'/'+realm+'/sources'}>正式來源許可設定</Link><Link href="/weaving/proposals">點點的提案</Link></div></section>}
 {step === 1 && <section className="ritual-card"><h1>先探索，方向可以慢慢累積</h1><Field label="目前想談什麼／A 探索文字" value={s.collaboration.aIntent} onChange={v => editStudio({ collaboration: { ...s.collaboration, aIntent: v } })}/><p>可保存為未歸屬探索，也可選擇既有織光杼。建議先做一兩條不代表其他方向要刪掉。</p><label>織光杼（可稍後）<select value={value.shuttleId} onChange={e => draft.edit({ ...value, shuttleId: e.target.value, studio: { ...s, direction: null } })}><option value="">尚未歸屬</option>{topics.map(t => <option value={t.id} key={t.id}>{t.title}</option>)}</select></label><label>採用哪條方向與理解版本<select value={s.direction ? s.direction.directionId + ':' + s.direction.versionId : ''} onChange={e => { const t = topics.find(t => t.id === value.shuttleId), [id, version] = e.target.value.split(':'); const d = t?.studioDirections?.find(d => d.id === id); editStudio({ direction: d ? adoptDirection(d, version) : null }); }}><option value="">暫不採用方向</option>{topics.find(t => t.id === value.shuttleId)?.studioDirections?.flatMap(d => d.versions.map((v, i) => <option key={d.id + v.id} value={d.id + ':' + v.id}>{d.title} · V{i + 1} · {v.statement.slice(0, 36)}</option>))}</select></label>{s.direction && <p className="studio-manuscript">本件採用：{s.direction.statement}<br />理解版本 {s.direction.versionId}；方向更新不會改寫本件。</p>}<Link href={'/'+realm+'/topics'}>管理織光杼、累積或新增方向</Link></section>}
 {step === 2 && <section className="ritual-card"><h1>知識鑽石・文字協作</h1>{s.direction && topics.find(t => t.id === value.shuttleId)?.studioDirections?.find(d => d.id === s.direction?.directionId)?.versions.at(-1)?.id !== s.direction?.versionId && <p>方向已有新的理解版本，本件仍保留原採用版本；需要改變立場時請回釐清想法選擇。</p>}<nav className="studio-modules" aria-label="文字模組">{(['A', 'B', 'C', 'D'] as const).map(m => <button aria-pressed={s.module === m} key={m} onClick={() => editStudio({ module: m })}>{m}<small>{{ A: '探索方向', B: '整理主文', C: '擴寫／限動', D: '成品延伸' }[m]}</small></button>)}</nav>{(s.module === 'A' || s.module === 'B') && <div className="studio-entry-input">{sourcePicker}<Field label={s.module === 'A' ? '交給 A 的靈感／素材' : '交給 B 的草稿／素材'} value={source.selected} onChange={text => editSource({ selected: text, ...(!bundle.work.studio?.source.raw ? { raw: text } : {}) })}/><p>{s.module === 'A' ? '可直接貼零散想法，不需要先有完整文章。' : '可直接貼已有草稿，或沿用讀取素材中選好的內容；目前正文也會一起帶入指令。'}</p><label className="studio-check"><input type="checkbox" checked={source.allowAI} disabled={source.read === 'private'} onChange={e => editSource({ allowAI: e.target.checked })}/>本次選摘可交給外部 AI／製作工具</label>{source.read === 'private' && <p>這份來源只限本人查看；需要外部協作時，請先回「讀取素材」核對讀取範圍。</p>}</div>}{provenance.stale&&<section className="studio-stale" role="status"><b>這份回覆的來源或任務設定已過期</b><p>上游已改版；舊回覆與當時設定保留。請產生新一輪指令，或核對後明確沿用舊候選。</p><label className="studio-check"><input type="checkbox" checked={confirmStale} onChange={e=>setConfirmStale(e.target.checked)}/>我已核對差異，這次明確沿用舊候選（保留原來源紀錄）</label></section>}{provenance.origin&&<details><summary>這份回覆的當輪來源與設定</summary><p>本人意思：{provenance.origin.answers||'當輪未確認'}</p><p className="studio-manuscript">{provenance.origin.sourceText}</p><pre className="studio-manuscript">{provenance.origin.settings}</pre></details>}{provenance.untracked&&<p>此回覆尚無已保存的指令快照；將保留來源未核對的標記，不冒認為目前設定產生的新 AI 結果。</p>}<WritingTargets s={s} edit={editStudio}/><CollaborationPanel promptControls={<InstructionTransfer title="完整協作指令" label={'複製 '+s.module+' 協作指令'} text={promptText} pending={busy||draft.busy} message={copyFeedback.message} failed={copyFeedback.failed} onCopy={()=>void prompt()} onRepeat={()=>void copyReady(promptText)}/>} sourceVersion={s.module === 'D' ? versionId : replySource(s).versionId} sourceText={s.module === 'D' ? c?.text || '' : replySource(s).text} directions={topics.find(t => t.id === value.shuttleId)?.studioDirections || []} s={s} edit={editStudio} check={() => void checkReply()} round={() => void round()} routeCandidate={(id, mode) => void routeCandidate(id, mode)} review={() => void review()}/>{(checkText||checkFeedback.message)&&<InstructionTransfer title="AI 檢查指令" label="重新複製 AI 檢查指令" text={checkText} message={checkFeedback.message} failed={checkFeedback.failed} onCopy={()=>void checkReply()} onRepeat={()=>void copyReady(checkText,true)}/>}<label>接下來貼回的結果對應哪輪指令<select value={selectedReplyTask} onChange={e=>setReplyTaskChoices({...replyTaskChoices,[taskKey(s)]:e.target.value})}><option value="">未核對／手動回覆</option>{s.collaboration.tasks.filter(t=>t.key===taskKey(s)).map((t,i)=><option key={t.id} value={t.id}>第 {i+1} 輪 · {t.createdAt} · {t.answers.slice(0,30)||'本人意思尚未確認'}</option>)}</select></label><p>這個選擇只用於接下來貼上的結果；產生新指令不會改掛舊回覆。</p><label>匯入本模組回覆檔<input type="file" accept=".txt,.md,text/plain" onChange={e => void importReply(e.target.files?.[0])}/></label><button onClick={() => downloadText(replyText(s), 'reply-' + s.module + '.txt')}>下載目前完整回覆</button>
 {s.module === 'A' && <><Field label="A 素材探索／討論回覆" value={s.a} onChange={v => editStudio({ a: v, collaboration:{...s.collaboration,responseTasks:responseBinding()} })}/><p>方向可分別累積到既有理解，或另開一條，不自動把每個題材製作成全部形式。</p><Link href={'/'+realm+'/topics'}>整理與判斷方向歸屬</Link></>}
 {s.module === 'B' && <><BReplyIntake s={s} edit={editStudio} paste={v=>editStudio({b:v,collaboration:{...s.collaboration,responseTasks:responseBinding()}})} adopt={()=>adopt('B')}/><ResearchCandidates s={s} title={value.title} edit={editStudio} save={save} adopt={adoptResearch}/></>}
 {s.module === 'C' && <>{cb.versionId === 'draft' && cb.text !== s.body && <p>目前正文與本輪底稿不同。已保留原底稿，需要更新時請重新帶入。</p>}{chooseVersion}<button onClick={() => editStudio({ collaboration: { ...s.collaboration, ...(s.collaboration.cMode === 'expand' ? { cExpandedSource: c?.text || s.body, cExpandedVersionId: c?.id || 'draft' } : { cSource: c?.text || s.body, cVersionId: c?.id || 'draft' }) } })}>帶入{c ? '所選完稿版本' : '目前正文'}</button>{c && <label><input type="checkbox" checked={fixedExport === c.id} onChange={e => setFixedExport(e.target.checked ? c.id : '')}/>允許本次所選完稿交給外部 AI</label>}<Field label={s.collaboration.cMode === 'expand' ? 'C 擴寫完整回覆' : 'C 限動完整回覆'} value={s.collaboration.cMode === 'expand' ? s.collaboration.cExpandedResponse : s.c} onChange={v => s.collaboration.cMode === 'expand' ? editStudio({ collaboration: { ...s.collaboration, cExpandedResponse: v, responseTasks:responseBinding() } }) : editStudio({ c: v, collaboration:{...s.collaboration,responseTasks:responseBinding()} })}/>{s.collaboration.cMode === 'expand' ? <button disabled={!s.collaboration.cExpandedManuscript.trim()} onClick={() => void adopt('C')}>採用擴寫，更新原稿</button> : <button disabled={!s.collaboration.cManuscript.trim()} onClick={() => void derive()}>採用文案，建立獨立限動草稿</button>}</>}
 {s.module === 'D' && <>{chooseVersion}<label className="studio-check"><input type="checkbox" checked={!!c && fixedExport === c.id} disabled={!c} onChange={e => setFixedExport(e.target.checked && c ? c.id : '')}/>這次允許所選完稿文字交給外部 AI（僅此版本）</label>{c ? <details open><summary>分析來源全文 · {c.id}</summary><p className="studio-manuscript">{c.text}</p></details> : <p>本件尚未選定完稿。一般「保存」不會建立完稿；請到預覽定稿，確認一份固定版本。</p>}<button onClick={() => setStep(3)}>前往預覽定稿</button><Field label="D 成品延伸文字" value={s.d} onChange={v => editStudio({ d: v, collaboration:{...s.collaboration,responseTasks:responseBinding()} })}/><button disabled={!c} onClick={() => {
                    if (c)
                        editStudio({ analyses: [...s.analyses, startD(value.id, c, s.d)] });
                }}>依所選版本另存一輪 D 分析</button>{s.analyses.map(a => <details key={a.id}><summary>D 分析 · {a.completionId}</summary><p className="studio-manuscript">{a.text}</p><p className="studio-manuscript">來源固定全文：{a.sourceText}</p></details>)}</>}
 <details><summary>例子與經驗的種類</summary>{s.examples.map((x, i) => ({ x, i })).filter(({ x }) => (!x.module || x.module === s.module) && (!x.mode || s.module !== 'C' || x.mode === s.collaboration.cMode)).map(({ x, i }) => <div key={i}><label>種類<select value={x.kind} onChange={e => editStudio({ examples: s.examples.map((x, j) => j === i ? { ...x, kind: e.target.value as typeof x.kind } : x) })}><option value="experience">本人真實經驗</option><option value="external">外部案例</option><option value="hypothetical">假設例子</option><option value="metaphor">比喻</option></select></label><Field label="例子來源（經驗與外部案例採用前需核對）" value={x.source || ''} onChange={v => editStudio({ examples: s.examples.map((x, j) => j === i ? { ...x, source: v } : x) })}/><Field label="例子文字" value={x.text} onChange={v => editStudio({ examples: s.examples.map((x, j) => j === i ? { ...x, text: v } : x) })}/><label><input type="checkbox" checked={x.adopted} onChange={e => editStudio({ examples: s.examples.map((x, j) => j === i ? { ...x, adopted: e.target.checked } : x) })}/>本次選用此例（仍保留原種類）</label></div>)}<button onClick={() => editStudio({ examples: [...s.examples, { kind: 'hypothetical', text: '', adopted: false, module: s.module, mode: s.module === 'C' ? s.collaboration.cMode : '' }] })}>新增一個例子</button></details>
 <Field label="目前可編寫的作品正文" value={s.body} rows={14} onChange={v => {
                if (['completed', 'sent_to_liaojie', 'archived'].includes(bundle.work.status)) {
                    setError('請先開始修訂');
                    return;
                }
                editStudio({ body: v, checks: { facts: false, privacy: false, citations: false, voice: false } });
            }}/>{checks}</section>}
 {step === 3 && <section className="ritual-card"><h1>預覽與確認完稿</h1><article className="studio-manuscript"><h2>{value.title}</h2>{s.body || '目前正文仍是空白；請先編寫。'}</article>{checks}<button onClick={() => void preview()}>保存並預覽這份正文</button><button className="primary" disabled={draft.dirty || reviewed !== bundle.previewDigest || !s.body.trim()} onClick={() => void complete()}>確認這份完稿版本</button>{chooseVersion}{c && <><details><summary>固定全文 · {c.createdAt}</summary><p className="studio-manuscript">{c.text}</p></details><button onClick={() => { editStudio({ module: 'D' }); setStep(2); }}>帶所選版本到 D 延伸</button><div className="studio-link-grid">{[['illustrated', '圖文'], ['short-video', '短影音'], ['podcast', 'Podcast'], ['comic', '短漫'], ['long-video', '長影片']].map(([path, label]) => <Link key={path} href={'/' + (path === 'illustrated' ? realm : 'weaving') + '/' + path + '?completionId=' + encodeURIComponent(c.id)}>製作{label}</Link>)}</div></>}</section>}
 {step === 4 && <section className="ritual-card"><h1>交給聊解室運用</h1><p>交接固定版本；聊解室的配文與發布回應，和原正文分開保存。</p>{chooseVersion}{c && <p className="studio-manuscript">{c.text}</p>}<label className="studio-check"><input type="checkbox" checked={confirmHandoff} onChange={e => setConfirmHandoff(e.target.checked)}/>已核對這份完稿可用於對外發布</label><label className="studio-check"><input type="checkbox" checked={newPublication} onChange={e => setNewPublication(e.target.checked)}/>若原作已有企劃，這次明確另建新的發布版本</label><button className="primary" disabled={!c || !confirmHandoff} onClick={() => void handoff()}>交接所選版本，進入聊解室</button><Link href="/liaojie">前往聊解室首頁</Link></section>}
 <RecoveredPublishing s={s} edit={editStudio} completions={bundle.completions} handoff={id=>void recoveredHandoff(id)}/><LegacyGraphicsPanel realm={realm} id={value.id} choices={graphicChoices} completions={bundle.completions} dirty={draft.dirty}/><details className="ritual-card"><summary>歷史、備份與原工具</summary><button onClick={backup}>下載本件作品與固定版本備份</button>{s.history.map(h => <details key={h.id}><summary>{h.note} · {h.createdAt}</summary><p className="studio-manuscript">{h.text}</p></details>)}{s.legacy && <p>此作品保留完整舊版資料，包含來源、校訂、方向、模組、圖文及舊固定版本；尚未轉接的項目可由備份回原工具查看。</p>}<div className="studio-link-grid"><Link href={'/'+realm+'/tools/diamond'}>原版知識鑽石與裝置備份</Link><Link href={'/'+realm+'/tools/carousel'}>原版輪播</Link><Link href={'/'+realm+'/tools/magazine'}>原版雜誌對話</Link></div></details>
 </fieldset><div className="studio-save"><button disabled={draft.busy || busy} onClick={() => void save()}>{draft.busy ? '保存中…' : '保存'}</button><button className="primary" disabled={draft.busy || busy} onClick={() => void preview()}>保存，預覽作品<CreativeIcon name="chevron"/></button></div></section>;
}
export default function StudioWorkspace({ id, realm = 'weaving', startInWriting = false }: {
    realm?: 'weaving' | 'liaojie';
    startInWriting?: boolean;
    id: string;
}) {
    const [b, setB] = useState<Bundle | null>(null), [error, setError] = useState('');
    useEffect(() => {
        let live = true;
        get<Bundle>('/api/dojo/creative-studio?id=' + encodeURIComponent(id)).then(b => {
            if (live)
                setB(b);
        }).catch(e => {
            if (live)
                setError(String(e));
        });
        return () => { live = false; };
    }, [id]);
    return <LeaveProvider>{error ? <p role="alert">{error}</p> : b ? <Editor key={id} initial={b} realm={realm} startInWriting={startInWriting}/> : <p>正在讀取作品與版本…</p>}</LeaveProvider>;
}
