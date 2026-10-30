import { object, raw } from './model';
export const SERVICE_PREFIX = '行光聊解服務-v1-';
export type Participant = {
    id: string;
    name: string;
    question: string;
    reading: string;
    zone: string;
    reviewed: boolean;
    delivered: boolean;
};
export type Service = {
    schema: 1;
    id: string;
    revision: number;
    title: string;
    kind: 'new_moon' | 'full_moon' | 'cards' | 'seasonal' | 'appointment';
    brief: string;
    capacity: number | null;
    price: number | null;
    status: 'active' | 'cancelled';
    zone: string;
    deadline: string;
    ritual: string;
    delivery: string;
    collective: string;
    participants: Participant[];
    calendarIds: Partial<Record<'deadline' | 'ritual' | 'delivery', string>>;
    createdAt: string;
    updatedAt: string;
};
export function blankService(title: string): Omit<Service, 'id'> { return { schema: 1, revision: 1, title, kind: 'new_moon', brief: '', capacity: null, price: null, status: 'active', zone: 'Australia/Melbourne', deadline: '', ritual: '', delivery: '', collective: '', participants: [], calendarIds: {}, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }; }
export function normalizeService(v: unknown, id: string): Service { const s = object(v); if (s.schema !== 1 || !['new_moon', 'full_moon', 'cards', 'seasonal', 'appointment'].includes(String(s.kind)) || !['active', 'cancelled'].includes(String(s.status)))
    throw Error('服務格式不正確'); const zone = raw(s.zone, 100); new Intl.DateTimeFormat('en', { timeZone: zone }); function time(v: unknown) { const t = raw(v, 60); if (t && !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(t) || t && !Number.isFinite(Date.parse(t)))
    throw Error('活動時間須包含時區'); return t ? new Date(t).toISOString() : ''; } const capacity = s.capacity === null ? null : Number(s.capacity), price = s.price === null ? null : Number(s.price); if (capacity !== null && (!Number.isInteger(capacity) || capacity < 1) || price !== null && (!Number.isFinite(price) || price < 0))
    throw Error('名額或價格不正確'); if (!Array.isArray(s.participants))
    throw Error('參加者格式不正確'); const ids = new Set<string>(); const participants = s.participants.map(x => { const p = object(x), id = raw(p.id, 120); if (!id || ids.has(id))
    throw Error('參加者識別重複'); ids.add(id); const name = raw(p.name, 200), zone = raw(p.zone, 100); if (!name.trim())
    throw Error('請填稱呼，問題可以空白'); if (zone)
    new Intl.DateTimeFormat('en', { timeZone: zone }); if (typeof p.reviewed !== 'boolean' || typeof p.delivered !== 'boolean')
    throw Error('交付確認不正確'); return { id, name, question: raw(p.question, 8000), reading: raw(p.reading), zone, reviewed: p.reviewed, delivered: p.delivered }; }); if (participants.length && (capacity === null || participants.length > capacity))
    throw Error('請先設定名額，參加人數不可超出名額'); const links = object(s.calendarIds), calendarIds: Service['calendarIds'] = {}; for (const k of ['deadline', 'ritual', 'delivery'] as const)
    if (links[k])
        calendarIds[k] = raw(links[k], 300); return { schema: 1, id, revision: Number(s.revision), title: raw(s.title, 200), kind: s.kind as Service['kind'], brief: raw(s.brief, 8000), capacity, price, status: s.status as Service['status'], zone, deadline: time(s.deadline), ritual: time(s.ritual), delivery: time(s.delivery), collective: raw(s.collective), participants, calendarIds, createdAt: raw(s.createdAt, 60), updatedAt: raw(s.updatedAt, 60) }; }
export function localTime(iso: string, zone: string) { if (!iso)
    return ''; const p = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso)); const get = (k: string) => p.find(x => x.type === k)?.value; return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`; }
export function localToISO(local: string, zone: string) { if (!local)
    return ''; if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local))
    throw Error('請填完整日期與時間'); const naive = Date.parse(local + 'Z'), matches = []; for (let offset = -14 * 60; offset <= 14 * 60; offset += 15) {
    const iso = new Date(naive - offset * 60000).toISOString();
    if (localTime(iso, zone) === local)
        matches.push(iso);
} if (matches.length !== 1)
    throw Error('這個當地時間不存在或重複（夏令時間切換），請選擇另一個明確時間'); return matches[0]; }
