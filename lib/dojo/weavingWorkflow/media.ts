import { LearningError } from '../learningFoundation/model';

export type MediaKind = 'carousel' | 'story' | 'comic' | 'short_video' | 'long_video';
export type MediaAsset = {
    id: string;
    version: string;
    url: string;
    mimeType: string;
    width: number;
    height: number;
    durationSeconds?: number;
};
/** External file declarations, not a claim that the server fetched or published them. */
export type MediaManifest = { schemaVersion: 1; kind: MediaKind; assets: MediaAsset[] };
const kinds: MediaKind[] = ['carousel', 'story', 'comic', 'short_video', 'long_video'];
function fail(message: string): never { throw new LearningError(message, 400); }
function field(value: unknown, max: number, label: string): string {
    if (typeof value !== 'string' || !value.trim() || value.length > max) fail(`${label}格式不正確`);
    return value;
}
function dimension(value: unknown): number {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1 || value > 32768) fail('媒體尺寸須為有效正整數');
    return value;
}
export function normalizeMediaManifest(input: unknown): MediaManifest | null {
    if (input == null) return null;
    if (typeof input !== 'object' || Array.isArray(input)) fail('媒體資產清單格式不正確');
    const s = input as Record<string, unknown>;
    if (s.schemaVersion !== 1 || !kinds.includes(s.kind as MediaKind) || !Array.isArray(s.assets) || s.assets.length > 100) fail('媒體資產清單版本、種類或數量不正確');
    const kind = s.kind as MediaKind, video = kind === 'short_video' || kind === 'long_video';
    const assets = s.assets.map((item: unknown): MediaAsset => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) fail('媒體資產格式不正確');
        const a = item as Record<string, unknown>;
        const id = field(a.id, 100, '資產 ID'), version = field(a.version, 300, '資產版本'), url = field(a.url, 2000, '資產連結'), mimeType = field(a.mimeType, 100, '媒體 MIME');
        let parsed: URL; try { parsed = new URL(url); } catch { fail('媒體資產連結不正確'); }
        if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) fail('媒體資產連結須使用 HTTP 或 HTTPS，不含登入資料');
        if (!(video ? ['video/mp4', 'video/webm', 'video/quicktime'] : ['image/png', 'image/jpeg', 'image/webp']).includes(mimeType)) fail('媒體資產種類與成品不符');
        const width = dimension(a.width), height = dimension(a.height);
        if (kind === 'carousel' && width * 5 !== height * 4) fail('圖卡資產須為 4:5');
        if (kind === 'story' && width * 16 !== height * 9) fail('限動資產須為 9:16');
        if (video && (typeof a.durationSeconds !== 'number' || !Number.isFinite(a.durationSeconds) || a.durationSeconds <= 0 || a.durationSeconds > 86400)) fail('影片資產須有有效時長');
        return { id, version, url, mimeType, width, height, ...(video ? { durationSeconds: a.durationSeconds as number } : {}) };
    });
    if (new Set(assets.map(a => a.id)).size !== assets.length) fail('媒體資產 ID 重複');
    return { schemaVersion: 1, kind, assets };
}
export function assertMediaFormat(manifest: MediaManifest, format: string): void {
    const expected = manifest.kind === 'comic' ? 'comic' : manifest.kind.endsWith('video') ? 'video' : 'text';
    if (format !== expected) fail('媒體資產清單與作品形式不符');
}
