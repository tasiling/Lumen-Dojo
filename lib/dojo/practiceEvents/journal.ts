import { canCompleteSegment, type EnglishJournalPractice } from "../englishJournal";
import { DOJO_TIME_ZONE, taipeiTodayISO } from "../formal";
import type { CompletionEvent, TargetBinding } from "./model";
import type { LearningEntity } from "../learningFoundation/model";
import { LearningError } from "../learningFoundation/model";
export function journalCompletions(previous: EnglishJournalPractice, candidate: EnglishJournalPractice, sourcePageId: string, graph: LearningEntity[], now = new Date(), binding: TargetBinding | null = null) {
  const valid = candidate.segments.filter(s => s.completedAt && !previous.segments.find(p => p.id === s.id)?.completedAt && s.status !== "skipped" && s.sourceText.trim() && canCompleteSegment(s));
  if(!valid.length) return [];
  const english = graph.find(e => e.kind === "item" && e.legacyKey === "english");
  if(!english) throw new LearningError("英文學習項目尚未銜接：請在學習管理明確初始化或確認既有項目；本操作未建立完成事件", 409);
  const practicedOn = taipeiTodayISO(now);
  return valid.map(s => ({ sourceId: `${sourcePageId}:${s.id}`, sourceRevision: String(previous.revision + 1), occurredAt: s.completedAt!, practicedOn, timeZone: DOJO_TIME_ZONE, sourceDate: candidate.date, learningItemIds: [english.id], binding,
    evidence: { status: "completed", title: `日記自譯・${candidate.date}・${s.label}`, practicedOn, recordedOn: practicedOn, learningItemIds: [english.id], primaryLearningItemId: english.id, learningStageId: null, learningTopicId: null, practiceKind: "journal-self-translation", whatIDid: s.finalVersion.trim() || s.aiRevision.trim(), myUnderstanding: s.contextNotes, questions: "", difficulties: "", discoveries: "", worthKeeping: s.phrases, selectedExcerpt: s.draft, sourceSnapshot: s.sourceText, sourceRefs: [{ type: "manual", id: `${sourcePageId}:${s.id}`, label: `原始日記 ${candidate.date}`, status: "available" }], tags: [] } as CompletionEvent["evidence"] }));
}
