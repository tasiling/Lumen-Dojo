'use client';
import {randomID,copyText} from '@/lib/dojo/weavingWorkflow/clientIdentity';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import CreativeIcon from '../creative/CreativeIcon';
import LeaveProvider from '../weaving/LeaveDialog';
import ConflictRecovery from '../weaving/ConflictRecovery';
import { useWeavingDraft } from '../weaving/useWeavingDraft';
import { get, mutate } from '../weaving/client';
import { studioForWork, adoptDirection, startD, studioPromptSource, type StudioData } from '@/lib/dojo/creativeStudio/model';
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
export function Editor({ initial }: {
    initial: Bundle;
}) {
    const [bundle, setBundle] = useState(initial), [step, setStep] = useState(0), [error, setError] = useState(''), [notice, setNotice] = useState(''), [topics, setTopics] = useState<WeavingShuttle[]>([]), [versionId, setVersionId] = useState(''), [correction, setCorrection] = useState(''), [correctionNote, setCorrectionNote] = useState(''), [busy, setBusy] = useState(false), [confirmHandoff, setConfirmHandoff] = useState(false), [newPublication, setNewPublication] = useState(false), [fixedExport,setFixedExport]=useState(''),[reviewed, setReviewed] = useState('');
    const router = useRouter();
    const draft = useWeavingDraft(editor(initial.work), async (ticket) => { const r = await mutate<{
        work: WeavingWork;
    }>('/api/dojo/creative-studio', 'POST', { action: 'save', id: ticket.entityId, expectedRevision: ticket.revision, title: ticket.value.title, shuttleId: ticket.value.shuttleId, studio: ticket.value.studio }); const b = await get<Bundle>('/api/dojo/creative-studio?id=' + r.work.id); setBundle(b); return editor(b.work); });
    const value = draft.value, s = value.studio, c = bundle.completions.find(x => x.id === versionId);
    const source = s.source;
    useEffect(() => { get<{
        topics: WeavingShuttle[];
    }>('/api/dojo/creative-studio').then(r => setTopics(r.topics)).catch(e => setError(String(e))); }, []);
    function editStudio(p: Partial<StudioData>) { draft.edit({ ...draft.current().value, studio: { ...draft.current().value.studio, ...p } }); setReviewed(''); setNotice(''); }
    function editSource(p: Partial<StudioData['source']>) { editStudio({ source: { ...source, ...p }, checks: { ...s.checks, facts: false, privacy: false } }); }
    async function save() { setError(''); const ok = await draft.save(); if (ok)
        setNotice('已保存，可以重新開啟接續。'); return ok; }
    async function preview() { if (await save()) {
        const b = await get<Bundle>('/api/dojo/creative-studio?id=' + value.id);
        setBundle(b);
        setReviewed(b.previewDigest);
        setStep(3);
    } }
    async function complete() { setBusy(true); setError(''); try {
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
    } }
    async function handoff() { setBusy(true); setError(''); try {
        if (!c || !confirmHandoff)
            throw Error('請選定完稿並確認公開用途');
        if (draft.dirty)
            throw Error('請先保存目前輸入，再交接固定版本');
        const r = await mutate<{
            project: {
                id: string;
            };
        }>('/api/dojo/creative-studio', 'POST', { action: 'handoff', id: value.id, completionId: c.id, publicationConfirmed: confirmHandoff, createNewVersion: newPublication });
        router.push('/liaojie/workbench?id=' + r.project.id);
    }
    catch (e) {
        setError(String(e));
    }
    finally {
        setBusy(false);
    } }
    async function prompt() { setError(''); try {
        const moduleName=s.module,context=studioPromptSource(s,moduleName,c,fixedExport);
        const instructions = { A: '從選摘探索可保留的方向。不要把推測寫成作者經歷；可提問，保留未定理解。', B: '整理成作者語氣的完整主文。研究另列，不把研究整包塞入正文；來源與假設分清楚。', C: '忠實依照選定正文擴寫，或整理為一至兩頁限動文字。不得補造動作、停頓與經歷。', D: '從這份已確認的作品延伸方向，標明來源作品與版本，不要求先發表。' };
        if (moduleName === 'D' && !c)
            throw Error('D 請先選本件完稿版本');
        const voiceSettings=await get<{voice:{confirmed:boolean;proposal:string}}>('/api/dojo/creative-voice');
            await copyText((voiceSettings.voice.confirmed?'本人已確認語氣偏好：'+voiceSettings.voice.proposal+'\n\n':'')+instructions[moduleName] + '\n\n作品：' + (moduleName === 'D' ? c?.title : value.title) + '\n來源版本：' + context.versionId + '\n本次文字：\n' + context.text + '\n\n這個來源版本的理解：' + (context.understanding || '未記錄；只依本次文字探索，不引用目前草稿的其他理解。') + '\n請將主文、研究與例子類型分開。');
        setNotice('已複製本次選摘與模組指令，請將結果貼回下方欄位。');
    }
    catch (e) {
        setError(String(e));
    } }
    function backup() { const a = document.createElement('a'), url = URL.createObjectURL(new Blob([JSON.stringify({ work: bundle.work, completionVersions: bundle.completions }, null, 2)], { type: 'application/json' })); a.href = url; a.download = 'weaving-work-' + value.id + '.json'; a.click(); URL.revokeObjectURL(url); }
    const steps = [['document', '讀取素材'], ['compass', '釐清想法'], ['pen', '編寫作品'], ['eye', '預覽定稿'], ['handoff', '準備發布']] as const;
    const checks = <div className="studio-checks"><h3>這次的共通收尾</h3>{([['facts', '已核對原意、經驗與假設'], ['privacy', '已核對人物與私人細節'], ['citations', '已核對引用及素材使用'], ['voice', '這份文字符合我要表達的語氣']] as const).map(([key, label]) => <label key={key}><input type="checkbox" checked={s.checks[key]} onChange={e => editStudio({ checks: { ...s.checks, [key]: e.target.checked } })}/>{label}</label>)}</div>;
    const chooseVersion = <label>本件完稿版本<select value={versionId} onChange={e => {setVersionId(e.target.value);setFixedExport('');}}><option value="">請明確選擇</option>{bundle.completions.map((v, i) => <option key={v.id} value={v.id}>{v.title} · {v.createdAt} · {bundle.completions.length - i}</option>)}</select></label>;
    return <section className="screen studio studio-workspace"><div className="studio-work-header"><Link href="/weaving/works">作品／探索草稿</Link><span>{draft.dirty ? '尚未保存' : '已保存'} · r{draft.current().baseline.revision}</span></div><label>作品名稱<input value={value.title} onChange={e => { draft.edit({ ...value, title: e.target.value }); setReviewed(''); }}/></label>
 <nav className="studio-steps" aria-label="製作五步">{steps.map(([name, label], i) => <button key={name} className={step === i ? 'active' : ''} aria-current={step === i ? 'step' : undefined} onClick={() => setStep(i)}><CreativeIcon name={name}/><span>{label}</span></button>)}</nav>
 {error && <p role="alert" className="form-error">{error}</p>}{draft.state.error && <p role="alert" className="form-error">{draft.state.error}</p>}{notice && <p role="status">{notice}</p>}<ConflictRecovery draft={draft} loadLatest={async () => { const b = await get<Bundle>('/api/dojo/creative-studio?id=' + value.id); setBundle(b); return editor(b.work); }} render={v => <div><b>{v.title}</b><p className="studio-manuscript">{v.studio.body}</p></div>}/>
 <fieldset disabled={busy || draft.busy}>
 {step === 0 && <section className="ritual-card"><h1>保留原稿，選這次想用的內容</h1><p>原稿和校訂分開保存，不會因為選素材就建立織光杼。</p><label>來源名稱<input value={source.title} onChange={e => editSource({ title: e.target.value })}/></label>{bundle.work.studio?.source.raw ? <details><summary>查看已保存原稿</summary><p className="studio-manuscript">{source.raw}</p></details> : <Field label="原始逐字稿／想法" value={source.raw} onChange={v => editSource({ raw: v, selected: source.selected || v })}/>}
 <Field label="追加校訂文字" value={correction} onChange={setCorrection}/><label>這次修正什麼<input value={correctionNote} onChange={e => setCorrectionNote(e.target.value)}/></label><button disabled={!correction.trim()} onClick={() => { const id = randomID(); editSource({ corrections: [...source.corrections, { id, text: correction, note: correctionNote, createdAt: new Date().toISOString() }], selected: correction, selectedVersion: id }); setCorrection(''); }}>保存為新的校訂版本</button><details><summary>原稿與校訂歷史（{source.corrections.length}）</summary><p className="studio-manuscript">原稿：{source.raw}</p>{source.corrections.map(r => <div key={r.id}><b>{r.note || '校訂'}</b><p className="studio-manuscript">{r.text}</p><button onClick={() => editSource({ selected: r.text, selectedVersion: r.id })}>選用此版文字</button></div>)}</details><Field label="本次選摘（可縮小使用範圍）" value={source.selected} onChange={v => editSource({ selected: v })}/><label>讀取範圍<select value={source.read} onChange={e => editSource({ read: e.target.value as typeof source.read, ...(e.target.value === 'private' ? { allowAI: false, allowPublic: false } : {}) })}><option value="selected">僅本次選摘</option><option value="allowed">指定來源可主動取材</option><option value="private">只限本人查看</option></select></label><label className="studio-check"><input type="checkbox" checked={source.allowAI} onChange={e => editSource({ allowAI: e.target.checked })}/>本次選摘可交給外部 AI／製作工具</label><label className="studio-check"><input type="checkbox" checked={source.allowPublic} onChange={e => editSource({ allowPublic: e.target.checked })}/>本次選摘經核對可用於公開作品</label><div className="studio-link-grid"><Link href="/forage">回野採取材</Link><Link href="/weaving/sources">正式來源許可設定</Link><Link href="/weaving/proposals">點點的提案</Link></div></section>}
 {step === 1 && <section className="ritual-card"><h1>先探索，方向可以慢慢累積</h1><Field label="目前想談什麼／A 探索文字" value={s.a} onChange={v => editStudio({ a: v })}/><p>可保存為未歸屬探索，也可選擇既有織光杼。建議先做一兩條不代表其他方向要刪掉。</p><label>織光杼（可稍後）<select value={value.shuttleId} onChange={e => draft.edit({ ...value, shuttleId: e.target.value, studio: { ...s, direction: null } })}><option value="">尚未歸屬</option>{topics.map(t => <option value={t.id} key={t.id}>{t.title}</option>)}</select></label><label>採用哪條方向與理解版本<select value={s.direction ? s.direction.directionId + ':' + s.direction.versionId : ''} onChange={e => { const t = topics.find(t => t.id === value.shuttleId), [id, version] = e.target.value.split(':'); const d = t?.studioDirections?.find(d => d.id === id); editStudio({ direction: d ? adoptDirection(d, version) : null }); }}><option value="">暫不採用方向</option>{topics.find(t => t.id === value.shuttleId)?.studioDirections?.flatMap(d => d.versions.map((v, i) => <option key={d.id + v.id} value={d.id + ':' + v.id}>{d.title} · V{i + 1} · {v.statement.slice(0, 36)}</option>))}</select></label>{s.direction && <p className="studio-manuscript">本件採用：{s.direction.statement}<br />理解版本 {s.direction.versionId}；方向更新不會改寫本件。</p>}<Link href="/weaving/topics">管理織光杼、累積或新增方向</Link></section>}
 {step === 2 && <section className="ritual-card"><h1>知識鑽石・文字協作</h1><nav className="studio-modules" aria-label="文字模組">{(['A', 'B', 'C', 'D'] as const).map(m => <button aria-pressed={s.module === m} key={m} onClick={() => editStudio({ module: m })}>{m}<small>{{ A: '探索方向', B: '整理主文', C: '擴寫／限動', D: '成品延伸' }[m]}</small></button>)}</nav><button onClick={() => void prompt()}>複製 {s.module} 協作指令</button>
 {s.module === 'A' && <><Field label="A 素材探索／討論回覆" value={s.a} onChange={v => editStudio({ a: v })}/><p>方向可分別累積到既有理解，或另開一條，不自動把每個題材製作成全部形式。</p><Link href="/weaving/topics">整理與判斷方向歸屬</Link></>}
 {s.module === 'B' && <><Field label="B 整理後主文（貼回 AI 文字或自行編寫）" value={s.b} onChange={v => editStudio({ b: v })}/><button disabled={!s.b.trim()} onClick={() => editStudio({ body: s.b, checks: { facts: false, privacy: false, citations: false, voice: false } })}>採用 B 為可編寫稿</button><Field label="研究與參考（獨立保存）" value={s.research} onChange={v => editStudio({ research: v })}/><label>研究用途<select value={s.researchUse} onChange={e => editStudio({ researchUse: e.target.value as StudioData['researchUse'] })}><option value="background">只作背景</option><option value="body">本人選取後放入正文</option><option value="none">這次不用</option></select></label><p>研究不會整包自動變成正文。需要引用時，由本人在下方正文選取整理。</p></>}
 {s.module === 'C' && <><details><summary>本次參考的正文</summary><p className="studio-manuscript">{s.body || '尚未寫正文，可先完成 B 或直接試寫。'}</p></details><Field label="C 擴寫／一至兩頁限動文字" value={s.c} onChange={v => editStudio({ c: v })}/><button disabled={!s.c.trim()} onClick={() => editStudio({ body: s.c, checks: { facts: false, privacy: false, citations: false, voice: false } })}>採用 C 為可編寫稿</button><p>保留原意、立場與真實經驗；圖文排版在定稿後選擇製作。</p></>}
 {s.module === 'D' && <>{chooseVersion}<label className="studio-check"><input type="checkbox" checked={!!c&&fixedExport===c.id} disabled={!c} onChange={e=>setFixedExport(e.target.checked&&c?c.id:'')}/>這次允許所選完稿文字交給外部 AI（僅此版本）</label>{c ? <details open><summary>分析來源全文 · {c.id}</summary><p className="studio-manuscript">{c.text}</p></details> : <p>本件尚未選定完稿。一般「保存」不會建立完稿；請到預覽定稿，確認一份固定版本。</p>}<button onClick={() => setStep(3)}>前往預覽定稿</button><Field label="D 成品延伸文字" value={s.d} onChange={v => editStudio({ d: v })}/><button disabled={!c} onClick={() => { if (c)
            editStudio({ analyses: [...s.analyses, startD(value.id, c, s.d)] }); }}>依所選版本另存一輪 D 分析</button>{s.analyses.map(a => <details key={a.id}><summary>D 分析 · {a.completionId}</summary><p className="studio-manuscript">{a.text}</p><p className="studio-manuscript">來源固定全文：{a.sourceText}</p></details>)}</>}
 <details><summary>例子與經驗的種類</summary>{s.examples.map((x, i) => <div key={i}><label>種類<select value={x.kind} onChange={e => editStudio({ examples: s.examples.map((x, j) => j === i ? { ...x, kind: e.target.value as typeof x.kind } : x) })}><option value="experience">本人真實經驗</option><option value="external">外部案例</option><option value="hypothetical">假設例子</option><option value="metaphor">比喻</option></select></label><Field label="例子文字" value={x.text} onChange={v => editStudio({ examples: s.examples.map((x, j) => j === i ? { ...x, text: v } : x) })}/><label><input type="checkbox" checked={x.adopted} onChange={e => editStudio({ examples: s.examples.map((x, j) => j === i ? { ...x, adopted: e.target.checked } : x) })}/>本次選用此例（仍保留原種類）</label></div>)}<button onClick={() => editStudio({ examples: [...s.examples, { kind: 'hypothetical', text: '', adopted: false }] })}>新增一個例子</button></details>
 <Field label="目前可編寫的作品正文" value={s.body} rows={14} onChange={v => editStudio({ body: v, checks: { facts: false, privacy: false, citations: false, voice: false } })}/>{checks}</section>}
 {step === 3 && <section className="ritual-card"><h1>預覽與確認完稿</h1><article className="studio-manuscript"><h2>{value.title}</h2>{s.body || '目前正文仍是空白；請先編寫。'}</article>{checks}<button onClick={() => void preview()}>保存並預覽這份正文</button><button className="primary" disabled={draft.dirty || reviewed !== bundle.previewDigest || !s.body.trim()} onClick={() => void complete()}>確認這份完稿版本</button>{chooseVersion}{c && <><details><summary>固定全文 · {c.createdAt}</summary><p className="studio-manuscript">{c.text}</p></details><button onClick={() => { editStudio({ module: 'D' }); setStep(2); }}>帶所選版本到 D 延伸</button><div className="studio-link-grid">{[['illustrated', '圖文'], ['short-video', '短影音'], ['podcast', 'Podcast'], ['comic', '短漫'], ['long-video', '長影片']].map(([path, label]) => <Link key={path} href={'/weaving/' + path + '?completionId=' + encodeURIComponent(c.id)}>製作{label}</Link>)}</div></>}</section>}
 {step === 4 && <section className="ritual-card"><h1>交給聊解室運用</h1><p>交接固定版本；聊解室的配文與發布回應，和原正文分開保存。</p>{chooseVersion}{c && <p className="studio-manuscript">{c.text}</p>}<label className="studio-check"><input type="checkbox" checked={confirmHandoff} onChange={e => setConfirmHandoff(e.target.checked)}/>已核對這份完稿可用於對外發布</label><label className="studio-check"><input type="checkbox" checked={newPublication} onChange={e => setNewPublication(e.target.checked)}/>若原作已有企劃，這次明確另建新的發布版本</label><button className="primary" disabled={!c || !confirmHandoff} onClick={() => void handoff()}>交接所選版本，進入聊解室</button><Link href="/liaojie">前往聊解室首頁</Link></section>}
 <details className="ritual-card"><summary>歷史、備份與原工具</summary><button onClick={backup}>下載本件作品與固定版本備份</button>{s.history.map(h => <details key={h.id}><summary>{h.note} · {h.createdAt}</summary><p className="studio-manuscript">{h.text}</p></details>)}{s.legacy && <p>此作品保留完整舊版資料，包含來源、校訂、方向、模組、圖文及舊固定版本；尚未轉接的項目可由備份回原工具查看。</p>}<div className="studio-link-grid"><Link href="/liaojie/tools/diamond">原版知識鑽石與裝置備份</Link><Link href="/liaojie/tools/carousel">原版輪播</Link><Link href="/liaojie/tools/magazine">原版雜誌對話</Link></div></details>
 </fieldset><div className="studio-save"><button disabled={draft.busy || busy} onClick={() => void save()}>{draft.busy ? '保存中…' : '保存'}</button><button className="primary" disabled={draft.busy || busy} onClick={() => void preview()}>保存，預覽作品<CreativeIcon name="chevron"/></button></div></section>;
}
export default function StudioWorkspace({ id }: {
    id: string;
}) { const [b, setB] = useState<Bundle | null>(null), [error, setError] = useState(''); useEffect(() => { let live = true; get<Bundle>('/api/dojo/creative-studio?id=' + encodeURIComponent(id)).then(b => { if (live)
    setB(b); }).catch(e => { if (live)
    setError(String(e)); }); return () => { live = false; }; }, [id]); return <LeaveProvider>{error ? <p role="alert">{error}</p> : b ? <Editor key={id} initial={b}/> : <p>正在讀取作品與版本…</p>}</LeaveProvider>; }
