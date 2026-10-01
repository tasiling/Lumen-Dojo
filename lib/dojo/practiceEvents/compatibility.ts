import { LearningError } from "../learningFoundation/model";
import type { CompletionLedger } from "./model";
// Server-owned projection metadata cannot be replaced by old forms/normalizers.
export function preserveProjection(title: string, incoming: unknown, previous: unknown, projection = false): unknown {
  if (!incoming || typeof incoming !== "object") return incoming;
  const next = { ...incoming } as Record<string, unknown>;
  const old = (previous && typeof previous === "object" ? previous : {}) as Record<string, unknown>;
  if (title.startsWith("行光今日-") && old.practiceEventOutput === true) {
    const rhythm = next.englishRhythm as { touches?: string[] };
    next.practiceEventOutput = true;
    next.englishRhythm = { ...rhythm, touches: [...new Set([...(rhythm?.touches ?? []), "output"])] };
  } else if (!projection) delete next.practiceEventOutput;
  if (title.startsWith("行光週盤-") && Array.isArray(next.cells)) {
    const oldCells = Array.isArray(old.cells) ? old.cells as Record<string, unknown>[] : [];
    next.cells = (next.cells as Record<string, unknown>[]).map(cell => {
      if(projection) return cell;
      const prior = oldCells.find(c => c.taskInstanceId && c.taskInstanceId === cell.taskInstanceId);
      const ledger = prior?.completionSources as CompletionLedger | undefined;
      if (!ledger) { const clean = { ...cell }; delete clean.completionSources; return clean; }
      const completion = cell.completion as { mode: string; target: number; progress: number };
      const before = prior!.completion as { progress: number };
      const manual = completion.progress === before.progress ? ledger.manualProgress : completion.progress;
      const automatic = completion.mode === "single" && ledger.events.length ? completion.target : ledger.events.reduce((s, e) => s + e.quantity, 0);
      const progress = Math.min(completion.target, Math.max(manual, automatic));
      return { ...cell, completionSources: { ...ledger, manualProgress: manual }, completion: { ...completion, progress }, completed: progress >= completion.target, completedAt: progress >= completion.target ? cell.completedAt ?? prior!.completedAt : null };
    });
  }
  if(title.startsWith("行光英文自譯-") && !projection) {
    if (previous && Number(next.revision ?? 0) !== Number(old.revision ?? 0)) throw new LearningError("英文練習版本已變更，請重新讀取",409);
    next.revision = Number(old.revision ?? 0) + 1;
    if(Array.isArray(next.segments) && Array.isArray(old.segments)) next.segments = (next.segments as Record<string, unknown>[]).map(segment => {
      const prior = (old.segments as Record<string, unknown>[]).find(s => s.id === segment.id);
      return prior?.completedAt ? { ...segment, completedAt: prior.completedAt } : segment;
    });
  }
  return next;
}
