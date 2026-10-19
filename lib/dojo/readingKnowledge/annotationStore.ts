import 'server-only';
import { createHash } from 'node:crypto';
import { createKnowledgeEntry } from '@/lib/notion/mutations';
import { listJsonRecords, updateJsonRecordById } from '../notionStore';
import { learningFoundation, learningOwner } from '../learningFoundation/store';
import { LearningError } from '../learningFoundation/model';
import { annotationService, ANNOTATION_PREFIX, type Annotation } from './annotations';
import { resolve } from './adapters';
import { contentKey } from './model';
import { runAnnotationOperation } from './annotationOperations';
function validAnnotation(value: unknown): value is Annotation { if (!value || typeof value !== 'object')
    return false; const a = value as Annotation; try {
    return a.schema === 1 && a.owner === learningOwner && Boolean(contentKey(a.ref)) && Array.isArray(a.topics) && Array.isArray(a.learningItemIds) && Number.isInteger(a.revision) && a.revision > 0 && typeof a.inheritBookSubjects === 'boolean';
}
catch {
    return false;
} }
export async function listAnnotations(): Promise<Annotation[]> { const rows = await listJsonRecords(ANNOTATION_PREFIX); return rows.flatMap(r => validAnnotation(r.value) ? [r.value] : []); }
export async function listSubjects() { return (await learningFoundation.snapshot()).entities.filter(e => e.kind === 'item').map(e => ({ id: e.id, name: e.name, status: e.status })); }
function title(a: Annotation) { return ANNOTATION_PREFIX + createHash('sha256').update(`${a.owner}:${contentKey(a.ref)}`).digest('hex'); }
export const annotationStore = annotationService({ owner: learningOwner, list: listAnnotations, resolve, subjects: listSubjects, run: (id, input, prepare) => runAnnotationOperation(learningOwner, id, input, prepare), create: async (a) => { await createKnowledgeEntry({ 標題: title(a), 內容: JSON.stringify(a) }, { retryCreate: false }); }, update: async (a) => { const rows = (await listJsonRecords(ANNOTATION_PREFIX)).filter(r => validAnnotation(r.value) && contentKey(r.value.ref) === contentKey(a.ref)); if (rows.length !== 1)
        throw new LearningError('分類資料已變更，請重新讀取', 409); await updateJsonRecordById(rows[0].id, ANNOTATION_PREFIX, rows[0].title, a); } });
