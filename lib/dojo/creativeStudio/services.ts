import 'server-only';
import { listJsonRecords } from '../notionStore';
import { CALENDAR_TITLE_PREFIX, calendarRecordTitle, normalizeCalendarItem } from '../formal';
import { createStep, updateStep, readRecord, expectRevision, operationId, WEAVING_OWNER, type Body } from '../weavingWorkflow/store';
import { runWeavingOperation } from '../weavingWorkflow/operations';
import { WeavingError } from '../weavingWorkflow/model';
import { blankStudio, raw } from './model';
import { createStudioWork,studioWorks } from './store';
import { blankService, normalizeService, SERVICE_PREFIX, localTime, type Service } from './serviceModel';
export async function listServices() { return (await listJsonRecords(SERVICE_PREFIX)).map(r => normalizeService(r.value, r.id)); }
export async function readService(id: string) { return normalizeService(JSON.parse((await readRecord(id, SERVICE_PREFIX)).內容), id); }
export async function createService(body: Body) { const title = raw(body.title, 200); if (!title.trim())
    throw new WeavingError('請填活動名稱'); const r = await runWeavingOperation(WEAVING_OWNER, operationId(body), 'create_work', body, [createStep(SERVICE_PREFIX, 'service', () => blankService(title))]); return readService(r.result.service.id); }
export async function saveService(body: Body) { const id = raw(body.id, 300), input = normalizeService(body.service, id); const r = await runWeavingOperation(WEAVING_OWNER, operationId(body), 'patch', body, [updateStep(id, SERVICE_PREFIX, 'service', (row, r) => { const old = normalizeService(JSON.parse(row.內容), id); expectRevision(old, body.expectedRevision); return { ...input, calendarIds: old.calendarIds, revision: old.revision + 1, createdAt: old.createdAt, updatedAt: r.createdAt }; })]); return readService(r.result.service.id); }
export async function syncServiceCalendar(body: Body) {
    const id = raw(body.id, 300), old = await readService(id);
    const labels = { deadline: '報名截止', ritual: '本人儀式／製作', delivery: '服務交付' };
    const result = await runWeavingOperation(WEAVING_OWNER, operationId(body), 'patch', body, r => { const context = r.context as {
        service: Service;
    }, s = context.service; const keys = (['deadline', 'ritual', 'delivery'] as const).filter(k => s[k] || s.calendarIds[k]); const steps = keys.map(key => { const local = localTime(s[key] || s.ritual || s.delivery || s.deadline, s.zone), date = local.split('T')[0], cancelled = s.status === 'cancelled' || !s[key], value = normalizeCalendarItem({ title: (cancelled ? '【已取消】' : '') + s.title + '：' + labels[key], date, startTime: local.split('T')[1], space: 'liaojie', kind: '服務安排', note: '服務 ' + id + ' · ' + key + '\n原時區 ' + s.zone + '\n' + (cancelled ? '取消／移除此節點' : '非同步安排；不要求參加者同步上線') }, { id: s.calendarIds[key] || 'pending' }); if (!value)
        throw new WeavingError('請先填一個有效的活動時間'); if (s.calendarIds[key])
        return updateStep(s.calendarIds[key]!, CALENDAR_TITLE_PREFIX, key, () => value, () => calendarRecordTitle(date, 'service-' + id + '-' + key)); return createStep(CALENDAR_TITLE_PREFIX + date + '-', key, () => value); }); return [{ key: 'validated', async findConfirmed() { expectRevision(await readService(id), body.expectedRevision); return { id, revision: Number(body.expectedRevision) }; }, async execute() { return { id }; } }, ...steps, updateStep(id, SERVICE_PREFIX, 'service', (row, receipt) => { const current = normalizeService(JSON.parse(row.內容), id); expectRevision(current, body.expectedRevision); return { ...current, calendarIds: { ...current.calendarIds, ...Object.fromEntries(keys.map(k => [k, receipt.result[k].id])) }, revision: current.revision + 1, updatedAt: receipt.createdAt }; })]; }, { service: old });
    return readService(result.result.service.id);
}
export async function serviceWork(body: Body) { const service = await readService(raw(body.id, 300));
    const existing=(await studioWorks()).find(w=>w.studio?.originKey==='service:'+service.id+':collective');if(existing)return existing; const studio = blankStudio(); studio.originKey = 'service:' + service.id + ':collective'; studio.serviceId = service.id; studio.source.title = '活動需求（不含個人問題及解讀）'; studio.source.raw = service.title + '\n' + service.brief; studio.source.selected = studio.source.raw; return createStudioWork({ operationId: operationId(body), title: service.title + '・集體內容', studio }); }
export function privateDelivery(service: Service, personId: string) { const p = service.participants.find(p => p.id === personId); if (!p || !p.reviewed || !p.reading.trim())
    throw new WeavingError('請核對收件者並完成個別解讀', 409); return `${service.title}\n給：${p.name}\n\n集體訊息\n${service.collective}\n\n你的訊息／解讀\n${p.reading}\n`; }
