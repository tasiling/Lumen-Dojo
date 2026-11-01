import 'server-only';
import { listReleases, readRelease } from '../creativeReleases/store';
import { readCompletion } from '../weavingWorkflow/completions';
import { readTextVersion } from '../liaojieText/store';
import { createStep, updateStep, readRecord, expectRevision, operationId, WEAVING_OWNER, type Body } from '../weavingWorkflow/store';
import { listJsonRecords } from '../notionStore';
import { runWeavingOperation } from '../weavingWorkflow/operations';
import { raw } from './model';
const PREFIX = '行光作者語氣-v1-';
export type VoiceSettings = {
    id: string;
    revision: number;
    samples: VoiceSample[];
    proposal: string;
    confirmed: boolean;
};
export type VoiceSample = {
    releaseId: string;
    versionId: string;
    text: string;
    publishedUrl: string;
};
export function voiceCandidate(release: {
    status: string;
    id: string;
    publishedUrl?: string;
    source: {
        kind: string;
        versionId: string;
    };
}, text: string): VoiceSample { if (release.status !== 'published' || !release.publishedUrl)
    throw Error('只可選實際發表的文章'); if (!['text', 'platform-text'].includes(release.source.kind))
    throw Error('這項不是公開文字樣本'); return { releaseId: release.id, versionId: release.source.versionId, text, publishedUrl: release.publishedUrl }; }
export async function voiceCandidates() { const result: VoiceSample[] = []; for (const r of await listReleases()) {
    if (r.status !== 'published' || !['text', 'platform-text'].includes(r.source.kind))
        continue;
    const text = r.source.kind === 'text' ? (await readCompletion(r.source.versionId)).text : (await readTextVersion(r.source.versionId)).blocks.map(b => b.text).join('\n\n');
    result.push(voiceCandidate(r, text));
} return result; }
export async function readVoice(): Promise<VoiceSettings> { const rows = await listJsonRecords(PREFIX); if (rows.length > 1)
    throw Error('語氣設定出現重複，請先核對'); if (!rows.length)
    return { id: '', revision: 0, samples: [], proposal: '', confirmed: false }; const v = rows[0].value as VoiceSettings; if (!Number.isInteger(v.revision) || !Array.isArray(v.samples))
    throw Error('語氣設定格式不正確'); return { ...v, id: rows[0].id }; }
export async function saveVoice(body: Body) { const current = await readVoice(), ids = Array.isArray(body.releaseIds) ? body.releaseIds.map(x => raw(x, 300)) : [], samples: VoiceSample[] = []; for (const id of ids) {
    const r = await readRelease(id);
    if (r.status !== 'published')
        throw Error('只可選實際發表樣本');
    const text = r.source.kind === 'text' ? (await readCompletion(r.source.versionId)).text : r.source.kind === 'platform-text' ? (await readTextVersion(r.source.versionId)).blocks.map(b => b.text).join('\n\n') : '';
    samples.push(voiceCandidate(r, text));
} if (typeof body.confirmed !== 'boolean')
    throw Error('請明確確認語氣偏好'); const value = { revision: current.revision + 1, samples, proposal: raw(body.proposal, 8000), confirmed: body.confirmed }; const steps = current.id ? [updateStep(current.id, PREFIX, 'voice', (row) => { expectRevision(JSON.parse(row.內容), body.expectedRevision); return value; })] : [createStep(PREFIX, 'voice', () => value)]; const result = await runWeavingOperation(WEAVING_OWNER, operationId(body), 'patch', body, steps); return { ...JSON.parse((await readRecord(result.result.voice.id, PREFIX)).內容), id: result.result.voice.id }; }
