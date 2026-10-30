'use client';
import {randomID,beginIntent,confirmIntent} from '@/lib/dojo/weavingWorkflow/clientIdentity';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { get, mutate } from '../weaving/client';
import { useWeavingDraft } from '../weaving/useWeavingDraft';
import LeaveProvider, { useLeave } from '../weaving/LeaveDialog';
import ConflictRecovery from '../weaving/ConflictRecovery';
import { localTime, localToISO, type Service, type Participant } from '@/lib/dojo/creativeStudio/serviceModel';
import './studio.css';
import '@/app/weaving/workflow.css';
function EditService({ initial, onSaved }: {
    initial: Service;
    onSaved: (s: Service) => void;
}) {
    const [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false), [personId, setPersonId] = useState(''), router = useRouter();
    const draft = useWeavingDraft(initial, async (ticket) => { const r = await mutate<{
        service: Service;
    }>('/api/dojo/liaojie-services', 'POST', { action: 'save', id: ticket.entityId, expectedRevision: ticket.revision, service: ticket.value }); onSaved(r.service); return r.service; });
    const s = draft.value, p = s.participants.find(p => p.id === personId);
    function edit(patch: Partial<Service>) { draft.edit({ ...s, ...patch }); setNotice(''); }
    function person(patch: Partial<Participant>) { edit({ participants: s.participants.map(x => x.id === personId ? { ...x, ...patch } : x) }); }
    async function action(name: string) { setBusy(true); setError(''); try {
        if (!await draft.save())
            return;
        const current = draft.current().baseline;
        if (name === 'calendar') {
            const r = await mutate<{
                service: Service;
            }>('/api/dojo/liaojie-services', 'POST', { action: 'calendar', id: s.id, expectedRevision: current.revision });
            draft.reset(r.service);
            onSaved(r.service);
            setNotice('三個活動節點已連到行事曆；改期與取消更新原事件。');
        }
        if (name === 'work') {
            const r = await mutate<{
                work: {
                    id: string;
                };
            }>('/api/dojo/liaojie-services', 'POST', { action: 'work', id: s.id });
            router.push('/weaving/works/' + r.work.id);
        }
        if (name === 'delivery') {
            const r = await mutate<{
                text: string;
            }>('/api/dojo/liaojie-services', 'POST', { action: 'delivery', id: s.id, personId });
            const url = URL.createObjectURL(new Blob([r.text], { type: 'text/plain;charset=utf-8' })), a = document.createElement('a');
            a.href = url;
            a.download = 'private-delivery-' + personId + '.txt';
            a.click();
            URL.revokeObjectURL(url);
            setNotice('已下載這位參加者的內容，請由本人確認後交付。');
        }
    }
    catch (e) {
        setError(String(e));
    }
    finally {
        setBusy(false);
    } }
    return <><fieldset disabled={busy || draft.busy}><section className="ritual-card"><h2>活動與安排</h2><label>活動名稱<input value={s.title} onChange={e => edit({ title: e.target.value })}/></label><label>項目<select value={s.kind} onChange={e => edit({ kind: e.target.value as Service['kind'] })}><option value="new_moon">新月聚焦小儀式</option><option value="full_moon">滿月清理釋放小儀式</option><option value="cards">突擊抽牌</option><option value="seasonal">順勢季能書</option><option value="appointment">個別預約安排</option></select></label><label>本次主題與要製作的成品<textarea rows={5} value={s.brief} onChange={e => edit({ brief: e.target.value })}/></label><div className="studio-link-grid"><label>名額<input type="number" min="1" value={s.capacity ?? ''} onChange={e => edit({ capacity: e.target.value ? Number(e.target.value) : null })}/></label><label>價格（新台幣，可留白）<input type="number" min="0" value={s.price ?? ''} onChange={e => edit({ price: e.target.value ? Number(e.target.value) : null })}/></label></div><label>安排時區<select value={s.zone} onChange={e => edit({ zone: e.target.value })}><option value="Australia/Melbourne">Australia/Melbourne · 墨爾本</option><option value="Asia/Taipei">Asia/Taipei · 台北</option><option value="UTC">UTC</option></select></label><p>報名截止、本人儀式／製作、交付分開。小儀式由本人非同步進行。</p>{([['deadline', '報名截止'], ['ritual', s.kind === 'appointment' ? '個別預約時間' : '本人儀式／製作時間'], ['delivery', '交付時間']] as const).map(([k, label]) => <label key={k}>{label}<input type="datetime-local" value={localTime(s[k], s.zone)} onChange={e => { try {
        edit({ [k]: localToISO(e.target.value, s.zone) });
        setError('');
    }
    catch (err) {
        setError(String(err));
    } }}/>{s[k] && <small>墨爾本 {localTime(s[k], 'Australia/Melbourne').replace('T', ' ')} ／ 台北 {localTime(s[k], 'Asia/Taipei').replace('T', ' ')}</small>}</label>)}<label>活動狀態<select value={s.status} onChange={e => edit({ status: e.target.value as Service['status'] })}><option value="active">進行中／準備中</option><option value="cancelled">取消（同步後原行事曆節點標記取消）</option></select></label><div className="studio-actions"><button onClick={() => void action('calendar')}>保存並同步行事曆節點</button><button onClick={() => void action('work')}>製作本次集體內容</button></div></section>
 <section className="ritual-card"><h2>參加者與私人交付</h2><p>目前為本人管理端，人工登記；尚未開放外部自助報名與預約。私人問題與解讀不會帶入集體內容作品。</p><label>參加者<select value={personId} onChange={e => setPersonId(e.target.value)}><option value="">請選參加者</option>{s.participants.map(x => <option value={x.id} key={x.id}>{x.name} · {x.delivered ? '已由本人交付' : '待交付'}</option>)}</select></label><button disabled={!s.capacity || s.participants.length >= s.capacity} onClick={() => { const id = randomID(); edit({ participants: [...s.participants, { id, name: '待填稱呼', question: '', reading: '', zone: '', reviewed: false, delivered: false }] }); setPersonId(id); }}>人工新增參加者（{s.participants.length}/{s.capacity ?? '先設定名額'}）</button><label>本次集體訊息<textarea rows={6} value={s.collective} onChange={e => edit({ collective: e.target.value })}/></label>{p && <div><label>這位參加者的稱呼<input value={p.name} onChange={e => person({ name: e.target.value, reviewed: false })}/></label><label>對方時區（可暫不填）<select value={p.zone} onChange={e => person({ zone: e.target.value })}><option value="">尚未提供</option><option value="Asia/Taipei">台北</option><option value="Australia/Melbourne">墨爾本</option><option value="UTC">UTC</option></select></label><label>想問的問題（選填）<textarea value={p.question} onChange={e => person({ question: e.target.value })}/></label><label>只屬於 {p.name} 的訊息／解讀<textarea rows={10} value={p.reading} onChange={e => person({ reading: e.target.value, reviewed: false })}/></label><label className="studio-check"><input type="checkbox" checked={p.reviewed} onChange={e => person({ reviewed: e.target.checked })}/>已核對這位收件者與內容</label><button disabled={!p.reviewed || !p.reading.trim()} onClick={() => void action('delivery')}>保存並下載這位的私人交付文字</button><label className="studio-check"><input type="checkbox" checked={p.delivered} onChange={e => person({ delivered: e.target.checked })}/>我已實際交付給這位（系統不會代送訊息）</label></div>}</section></fieldset>{error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}{draft.state.error && <p role="alert">{draft.state.error}</p>}<ConflictRecovery draft={draft} loadLatest={async () => { const r = await get<{
        service: Service;
    }>('/api/dojo/liaojie-services?id=' + s.id); return r.service; }} render={v => <p>{v.title} · {v.participants.length} 位<br />{v.collective}</p>}/><div className="studio-save"><button className="primary" disabled={busy || draft.busy} onClick={() => void draft.save()}>保存活動與交付內容</button><span>{draft.dirty ? '尚未保存' : '已保存'} · r{draft.current().baseline.revision}</span></div></>;
}
function ServiceManager() { const leave = useLeave(); const [services, setServices] = useState<Service[]>([]), [selected, setSelected] = useState(''), [title, setTitle] = useState(''), [error, setError] = useState(''); useEffect(() => { get<{
    services: Service[];
}>('/api/dojo/liaojie-services').then(r => setServices(r.services)).catch(e => setError(String(e))); }, []); async function create() { const intent=beginIntent('studio-service-create',{title});try {
    const r = await mutate<{
        service: Service;
    }>('/api/dojo/liaojie-services', 'POST', { action: 'create', title, requestNonce: intent.id });
    confirmIntent('studio-service-create',intent.id);setServices([...services, r.service]);
    setSelected(r.service.id);
    setTitle('');
}
catch (e) {
    setError(String(e));
} } return <section className="screen studio"><h1>聊解室・活動與私人交付</h1>{error && <p role="alert">{error}</p>}<label>新增活動名稱<input value={title} onChange={e => setTitle(e.target.value)}/></label><button disabled={!title.trim()} onClick={() => void create()}>建立活動</button><label>目前活動<select value={selected} onChange={e => { const id = e.target.value; leave.requestLeave(() => setSelected(id)); }}><option value="">請選活動</option>{services.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}</select></label>{services.find(s => s.id === selected) && <EditService key={selected} initial={services.find(s => s.id === selected)!} onSaved={s => setServices(services.map(x => x.id === s.id ? s : x))}/>}<Link href="/liaojie">返回聊解室</Link></section>; }
export default function ServiceWorkspace() { return <LeaveProvider><ServiceManager /></LeaveProvider>; }
