import type { StudioData } from './model';
import { cBase, instructionsForSource, replyText } from './collaboration';
import { randomID, sha256Text } from '../weavingWorkflow/clientIdentity';
export type TaskTicket = { id: string; key: string; sourceText: string; sourceVersion: string; answers: string; settings: string; signature: string; createdAt: string; prompt?:string };
export const taskKey = (s: StudioData) => s.module === 'C' ? 'C-' + s.collaboration.cMode : s.module;
export function taskContext(s: StudioData, fixed?: StudioData, fixedId = '') {
    const cb = cBase(s.collaboration);
    const text = s.module === 'C' ? cb.text : s.module === 'D' ? fixed?.body || '' : s.module === 'B' ? [s.source.selected, s.body ? '目前主稿：\n' + s.body : ''].filter(Boolean).join('\n\n') : s.collaboration.aMode === 'draft' ? s.body || s.source.selected : s.source.selected;
    return { text, versionId: s.module === 'C' ? cb.versionId : s.module === 'D' ? fixedId : s.source.selectedVersion, settings: instructionsForSource(s, fixed), answers: (fixed || s).collaboration.aAnswers };
}
export function taskSignature(s: StudioData, source: { text: string; versionId: string }, settings: string) {
    return sha256Text(JSON.stringify([taskKey(s), source.text, source.versionId, settings]));
}
export function makeTask(s: StudioData, source: { text: string; versionId: string }, settings: string, answers = s.collaboration.aAnswers): TaskTicket {
    return { id: randomID(), key: taskKey(s), sourceText: source.text, sourceVersion: source.versionId, settings, answers, signature: taskSignature(s, source, settings), createdAt: new Date().toISOString() };
}
export function responseOrigin(s: StudioData) {
    const f = s.collaboration, key = taskKey(s), binding = f.responseTasks[key];
    if (binding) return f.tasks.find(t => t.id === binding);
    const old = f.rounds.findLast(r => r.module === s.module && r.mode !== 'review' && (s.module !== 'C' || r.mode === f.cMode) && r.reply === replyText(s));
    return old ? { id: old.taskId || '', key, sourceText: old.sourceText, sourceVersion: old.sourceVersion, settings: old.settings, answers: old.answers, signature: old.taskSignature || '', createdAt: old.createdAt } : undefined;
}
export function taskStatus(s: StudioData, source: { text: string; versionId: string }, settings: string) {
    const origin = responseOrigin(s);
    const stale = !!origin && (origin.signature ? origin.signature !== taskSignature(s, source, settings) : origin.answers !== s.collaboration.aAnswers || origin.sourceText !== source.text || origin.sourceVersion !== source.versionId || origin.settings !== settings);
    return { origin, stale, untracked: !origin };
}
export function bindResponse(s: StudioData,chosenId?:string) {
    const key = taskKey(s);if(chosenId===''){const next={...s.collaboration.responseTasks};delete next[key];return next;}const task = chosenId?s.collaboration.tasks.find(t=>t.key===key&&t.id===chosenId):s.collaboration.tasks.findLast(t => t.key === key);
    return task ? { ...s.collaboration.responseTasks, [key]: task.id } : s.collaboration.responseTasks;
}
