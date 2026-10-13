import { LearningError } from "../learningFoundation/model";
import type { BingoCell, DailyRecord, WeeklyBoard } from "../formal";
import type { CompletionEvent, CompletionLedger, ProjectionState } from "./model";
export function addOutput(record: DailyRecord, event: CompletionEvent): DailyRecord {
  return { ...record, englishRhythm: { ...record.englishRhythm, touches: [...new Set([...record.englishRhythm.touches, "output" as const])], updatedAt: event.occurredAt } };
}
export type ProjectedCell = BingoCell & { completionSources?: CompletionLedger };
export function projectWeekly(board: WeeklyBoard | null, event: CompletionEvent): { board: WeeklyBoard | null; state: ProjectionState } {
  if (!event.binding || !board || board.archivedAt || board.weekStart !== event.binding.weekStart) return { board, state: "unlinked" };
  const matches = board.cells.filter(c => c.taskInstanceId === event.binding!.taskInstanceId);
  if (matches.length !== 1 || event.binding.taskInstanceId.startsWith("legacy:")) return { board, state: "unlinked" };
  const cell = matches[0] as ProjectedCell;
  if (!cell.text.trim() || cell.completion.unit !== event.unit || !["single", "count"].includes(cell.completion.mode)) return { board, state: "unmatched" };
  const ledger = cell.completionSources ?? { manualProgress: cell.completion.progress, events: [] };
  if (ledger.events.some(e => e.id === event.id)) return { board, state: "applied" };
  const nextLedger = { ...ledger, events: [...ledger.events, { id: event.id, quantity: event.quantity, unit: event.unit }] };
  const automatic = cell.completion.mode === "single" ? cell.completion.target : nextLedger.events.reduce((sum, e) => sum + e.quantity, 0);
  const progress = Math.min(cell.completion.target, Math.max(ledger.manualProgress, automatic));
  const next: ProjectedCell = { ...cell, completionSources: nextLedger, completion: { ...cell.completion, progress }, completed: progress >= cell.completion.target, completedAt: progress >= cell.completion.target ? cell.completedAt ?? event.occurredAt : null };
  return { board: { ...board, cells: board.cells.map(c => c === cell ? next : c) }, state: "applied" };
}

// Called only for an already saved, verified VF event. Source date stays original.
export function addVocabulary(record: DailyRecord, fact: { id: string; practicedOn: string | null; occurredAt: string | null; standardRound: boolean }): DailyRecord {
  if (!fact.practicedOn || fact.practicedOn !== record.date) throw new LearningError("來源日期未知或不符，不投影每日詞彙",409);
  const ledger = record.practiceEventVocabulary ?? { manualRounds: record.englishRhythm.vocabForgeRounds, events: [] };
  if (ledger.events.some(e => e.id === fact.id)) return record;
  const next = { ...ledger, events: [...ledger.events, { id: fact.id, standardRound: fact.standardRound }] };
  const automatic = next.events.filter(e => e.standardRound).length;
  return { ...record, practiceEventVocabulary: next, englishRhythm: { ...record.englishRhythm, touches: [...new Set([...record.englishRhythm.touches, "vocabulary" as const])], vocabForgeRounds: Math.min(5, Math.max(next.manualRounds, automatic)), updatedAt: fact.occurredAt ?? record.englishRhythm.updatedAt } };
}
