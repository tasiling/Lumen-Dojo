import { createHash, randomUUID } from "node:crypto";
import { LearningError } from "../learningFoundation/model";
import type { DailyRecord, WeeklyBoard } from "../formal";
import type { CompletionEvent, TargetBinding } from "./model";
import type { LearningRecord } from "../learningRecords/model";
import { addOutput, projectWeekly } from "./projection";
export function sourceIdentity(owner: string, system: string, type: string, id: string) { return createHash("sha256").update(JSON.stringify([owner, system, type, id])).digest("hex"); }
export type EventRepository = {
  owner: string; get(id: string): Promise<CompletionEvent | null>; create(e: CompletionEvent): Promise<void>; update(e: CompletionEvent): Promise<void>;
  body(e: CompletionEvent): Promise<void>; daily(date: string): Promise<DailyRecord>; saveDaily(date: string, value: DailyRecord): Promise<void>;
  weekly(week: string): Promise<WeeklyBoard | null>; saveWeekly(week: string, value: WeeklyBoard): Promise<void>;
  assertKnownOutcome(): void;
};
export function eventService(repo: EventRepository) {
  function owner(e: CompletionEvent) { if (e.owner !== repo.owner || e.eventVersion !== 1) throw new LearningError("事件無權存取或版本不符", 403); return e; }
  return {
    // Caller holds the same R2-1 lock throughout event + source + projection.
    async accept(input: { sourceId: string; sourceRevision: string; occurredAt: string; practicedOn: string; timeZone: string; sourceDate: string; learningItemIds: string[]; binding?: TargetBinding | null; evidence: NonNullable<CompletionEvent["evidence"]> }) {
      const id = sourceIdentity(repo.owner, "dojo", "english-journal-segment", input.sourceId);
      const existing = await repo.get(id); if (existing) return owner(existing);
      const e: CompletionEvent = { ...input, id, owner: repo.owner, eventVersion: 1, eventType: "practice.completed", sourceSystem: "dojo", sourceType: "english-journal-segment", learningRecordId: randomUUID(), completionKind: "journal-self-translation", quantity: 1, unit: "段", sourceStatus: "available", binding: input.binding ?? null, createdAt: new Date().toISOString(), projections: { record: "pending", output: "pending", weekly: "pending" }, projectionStatus: "pending", projectionRevision: 1, syncedAt: null, error: null };
      await repo.create(e); return e;
    },
    async sourceArchived(sourceId: string) {
      const id = sourceIdentity(repo.owner, "dojo", "english-journal-segment", sourceId);
      const existing = await repo.get(id); if(!existing) return;
      const event = owner(existing);
      await repo.update({ ...event, sourceStatus: "archived", projectionRevision: event.projectionRevision + 1 });
    },
    async retry(id: string) {
      const found = await repo.get(id); if (!found) throw new LearningError("事件不存在", 404); let event = owner(found);
      if (event.sourceStatus === "withdrawn") return event;
      for (const step of ["record", "output", "weekly"] as const) {
        if (["applied", "unlinked", "unmatched"].includes(event.projections[step])) continue;
        try {
          let state: CompletionEvent["projectionStatus"] = "applied";
          if (step === "record") await repo.body(event);
          if (step === "output") await repo.saveDaily(event.practicedOn, addOutput(await repo.daily(event.practicedOn), event));
          if (step === "weekly") {
            const result = projectWeekly(event.binding ? await repo.weekly(event.binding.weekStart) : null, event);
            state = result.state;
            if (state === "applied" && result.board) await repo.saveWeekly(event.binding!.weekStart, result.board);
          }
          event = { ...event, ...(step === "record" ? { evidence: null } : {}), projections: { ...event.projections, [step]: state }, projectionRevision: event.projectionRevision + 1, syncedAt: new Date().toISOString(), error: null };
        } catch (error) {
          repo.assertKnownOutcome(); // Never swallow an ambiguous SDK mutation.
          event = { ...event, projections: { ...event.projections, [step]: "needs_retry" }, projectionRevision: event.projectionRevision + 1, error: error instanceof Error ? error.message : String(error) };
        }
        event.projectionStatus = Object.values(event.projections).includes("needs_retry") ? "needs_retry" : Object.values(event.projections).includes("pending") ? "pending" : "applied";
        await repo.update(event);
        if (event.projections[step] === "needs_retry") break;
      }
      return event;
    },
  };
}
export function eventBody(event: CompletionEvent): LearningRecord { if(!event.evidence) throw new LearningError("正文已投影，請讀取 learningRecordId；不得重建",409); return { ...event.evidence, id: event.learningRecordId, owner: event.owner, recordType: "learning-record/v1", revision: 1, createdAt: event.createdAt, updatedAt: event.createdAt }; }
