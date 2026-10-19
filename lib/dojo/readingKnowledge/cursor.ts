import 'server-only';
import { randomUUID, createHmac, timingSafeEqual } from 'node:crypto';
import { LearningError } from '../learningFoundation/model';
const sessions = new Map<string, {
    owner: string;
    query: string;
    expires: number;
    state: unknown;
}>();
function signature(text: string): string { const secret = process.env.ACCESS_KEY; if (!secret)
    throw new LearningError('伺服器未設定存取金鑰', 503); return createHmac('sha256', secret).update(`reading-knowledge:${text}`).digest('hex'); }
export function encodeCursor<T>(state: T, owner: string, query: string): string {
    const now = Date.now();
    for (const [id, s] of sessions)
        if (s.expires <= now)
            sessions.delete(id);
    while (sessions.size >= 128)
        sessions.delete(sessions.keys().next().value!);
    const id = randomUUID();
    sessions.set(id, { owner, query, expires: now + 15 * 60 * 1000, state: structuredClone(state) });
    return `${id}.${signature(id)}`;
}
export function decodeCursor<T>(token: string, owner: string, query: string): T {
    if (token.length > 200)
        throw new LearningError('搜尋游標不正確');
    const [id, sig] = token.split('.');
    const expected = signature(id ?? '');
    if (!sig || sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected)))
        throw new LearningError('搜尋游標不正確');
    const s = sessions.get(id);
    if (!s || s.expires <= Date.now())
        throw new LearningError('搜尋已過期，請重新搜尋', 409);
    if (s.owner !== owner || s.query !== query)
        throw new LearningError('搜尋條件已變更，請重新搜尋', 409);
    return structuredClone(s.state) as T;
}
