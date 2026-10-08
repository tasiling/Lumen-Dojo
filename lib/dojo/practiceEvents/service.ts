import { createHash, randomUUID } from "node:crypto";
import { LearningError } from "../learningFoundation/model";
import type { DailyRecord, WeeklyBoard } from "../formal";
import type { CompletionEvent, JournalEvent, ContextEvent, TargetBinding } from "./model";
import type { LearningRecord } from "../learningRecords/model";
import { validDate } from "../learningRecords/model";
import type { SourceResult } from "../externalResults/model";
import { addOutput, projectWeekly } from "./projection";
export function sourceIdentity(owner: string, system: string, type: string, id: string) { return createHash("sha256").update(JSON.stringify([owner, system, type, id])).digest("hex"); }
export type EventRepository = {
  owner: string; get(id: string): Promise<CompletionEvent | null>; create(e: CompletionEvent): Promise<void>; update(e: CompletionEvent): Promise<void>;
  body(e: CompletionEvent): Promise<void>; daily(date: string): Promise<DailyRecord>; saveDaily(date: string, value: DailyRecord): Promise<void>;
  weekly(week: string): Promise<WeeklyBoard | null>; saveWeekly(week: string, value: WeeklyBoard): Promise<void>;
  assertKnownOutcome(): void;
};
export type ContextCompletionInput = Pick<SourceResult, "sourceId"|"sourceRevision"|"updatedAt"|"practicedOn"|"occurredAt"|"timeZone"|"dateSemantics"|"completionStatus"|"sourceAvailability"|"sourceLocation"|"activityMode"|"currentContext"|"originalContext">;
export function isEffectiveCompletion(e:CompletionEvent) { return e.sourceSystem === "dojo" ? !["withdrawn","unverified"].includes(e.sourceStatus) : e.completionStatus === "completed"; }
export function eventService(repo: EventRepository) {
  function validateContext(i:ContextCompletionInput) {
    if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(i.sourceId) || !i.sourceRevision || !Number.isFinite(Date.parse(i.updatedAt)) || (i.practicedOn !== null && !validDate(i.practicedOn)) || (i.occurredAt !== null && !Number.isFinite(Date.parse(i.occurredAt))) || !["completed","withdrawn","unverified"].includes(i.completionStatus) || !["available","archived","deleted"].includes(i.sourceAvailability)) throw new LearningError("來源事件不正確",422);
    if(i.completionStatus === "completed" && !["topic_speaking","dialogue","writing_review","micro_practice","quick_retell"].includes(i.activityMode)) throw new LearningError("來源模式不支援",422);
    if(i.sourceLocation !== null && i.sourceLocation !== `https://lumen-context-room-production-4a2c.up.railway.app/practice-results/${i.sourceId}`) throw new LearningError("來源位置不正確",422);
  }
  function status(i:ContextCompletionInput):CompletionEvent["sourceStatus"] { return i.completionStatus !== "completed" ? i.completionStatus : i.sourceAvailability === "deleted" ? "missing" : i.sourceAvailability === "archived" ? "archived" : "available"; }
  async function contextUpdate(i:ContextCompletionInput) {
    validateContext(i);
    const existing = await repo.get(sourceIdentity(repo.owner,"context-room","practice-session",i.sourceId)); if(!existing) return null;
    owner(existing); if(existing.sourceSystem !== "context-room") throw new LearningError("來源事件衝突",409);
    const normalized=(s:string)=>{ const [main,f=""]=s.slice(0,-1).split("."); return main+"."+f.padEnd(6,"0"); };
    const a=normalized(i.updatedAt), b=normalized(existing.sourceUpdatedAt);
    if(a<b) return existing;
    if(existing.practicedOn !== i.practicedOn || existing.occurredAt !== i.occurredAt) throw new LearningError("來源日期衝突",409);
    if(a===b) { if(existing.sourceRevision !== i.sourceRevision || existing.completionStatus !== i.completionStatus || existing.sourceAvailability !== i.sourceAvailability) throw new LearningError("來源版本衝突",409); return existing; }
    if(i.sourceRevision === existing.sourceRevision && (existing.completionStatus !== i.completionStatus || existing.sourceAvailability !== i.sourceAvailability)) throw new LearningError("來源版本衝突",409);
    const next:ContextEvent={...existing,sourceRevision:i.sourceRevision,sourceUpdatedAt:i.updatedAt,completionStatus:i.completionStatus,sourceAvailability:i.sourceAvailability,sourceStatus:status(i),sourceMetadata:{sourceLocation:i.sourceLocation,activityMode:i.activityMode,title:existing.sourceMetadata.title},projections:{...existing.projections,record:"pending"},projectionStatus:"pending",projectionRevision:existing.projectionRevision+1};
    await repo.update(next); return next;
  }
  function owner(e: CompletionEvent) { if (e.owner !== repo.owner || e.eventVersion !== 1 || e.id !== sourceIdentity(repo.owner, e.sourceSystem, e.sourceType, e.sourceId)) throw new LearningError("事件無權存取或版本不符", 403); return e; }
  return {
    updateContext: contextUpdate,
    async read(id:string) {const e=await repo.get(id);return e ? owner(e):null;},
    async acceptContext(i:ContextCompletionInput):Promise<CompletionEvent> {
      validateContext(i); const existing=await contextUpdate(i); if(existing) return existing;
      if(i.completionStatus !== "completed") throw new LearningError("來源尚未有效完成",409);
      const id=sourceIdentity(repo.owner,"context-room","practice-session",i.sourceId), now=new Date().toISOString();
      const title=`語境修習・${i.currentContext.projectName ?? "來源專案"}・${i.currentContext.unitName ?? i.activityMode}`;
      const e:ContextEvent={id,owner:repo.owner,eventVersion:1,eventType:"practice.completed",sourceSystem:"context-room",sourceType:"practice-session",sourceId:i.sourceId,sourceRevision:i.sourceRevision,sourceUpdatedAt:i.updatedAt,sourceMetadata:{sourceLocation:i.sourceLocation,activityMode:i.activityMode,title},occurredAt:i.occurredAt,practicedOn:i.practicedOn,timeZone:i.timeZone,sourceDate:i.practicedOn,dateSemantics:i.dateSemantics,completionStatus:i.completionStatus,sourceAvailability:i.sourceAvailability,sourceStatus:status(i),learningItemIds:[],learningRecordId:randomUUID(),completionKind:"context-room-session",quantity:1,unit:"次",createdAt:now,binding:null,evidence:{status:"completed",title,practicedOn:i.practicedOn,recordedOn:now.slice(0,10),learningItemIds:[],primaryLearningItemId:null,learningStageId:null,learningTopicId:null,practiceKind:"context-room-session",whatIDid:`完成語境修習：${i.activityMode}`,myUnderstanding:"",questions:"",difficulties:"",discoveries:"",worthKeeping:"",selectedExcerpt:"",sourceSnapshot:"",tags:[],sourceRefs:[{type:"context",id:i.sourceId,label:title,...(i.sourceLocation ? {url:i.sourceLocation}:{}),status:i.sourceAvailability === "deleted" ? "missing" : i.sourceAvailability}],originEventId:id,sourceRevision:i.sourceRevision,dateSemantics:i.dateSemantics,sourceCompletionStatus:i.completionStatus,sourceAvailability:i.sourceAvailability},projections:{record:"pending",output:"unlinked",weekly:"unlinked"},projectionStatus:"pending",projectionRevision:1,syncedAt:null,error:null};
      await repo.create(e); return e;
    },
    // Caller holds the same R2-1 lock throughout event + source + projection.
    async accept(input: { sourceId: string; sourceRevision: string; occurredAt: string; practicedOn: string; timeZone: string; sourceDate: string; learningItemIds: string[]; binding?: TargetBinding | null; evidence: NonNullable<CompletionEvent["evidence"]> }):Promise<JournalEvent> {
      const id = sourceIdentity(repo.owner, "dojo", "english-journal-segment", input.sourceId);
      const existing = await repo.get(id); if (existing) { owner(existing); if(existing.sourceSystem !== "dojo") throw new LearningError("來源事件衝突",409); return existing; }
      const e: JournalEvent = { ...input, id, owner: repo.owner, eventVersion: 1, eventType: "practice.completed", sourceSystem: "dojo", sourceType: "english-journal-segment", learningRecordId: randomUUID(), completionKind: "journal-self-translation", quantity: 1, unit: "段", sourceStatus: "available", binding: input.binding ?? null, createdAt: new Date().toISOString(), projections: { record: "pending", output: "pending", weekly: "pending" }, projectionStatus: "pending", projectionRevision: 1, syncedAt: null, error: null };
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
      if (!isEffectiveCompletion(event) && event.sourceSystem === "dojo") return event;
      for (const step of ["record", "output", "weekly"] as const) {
        if (["applied", "unlinked", "unmatched"].includes(event.projections[step])) continue;
        try {
          let state: CompletionEvent["projectionStatus"] = "applied";
          if (step === "record") await repo.body(event);
          if (step === "output" && event.sourceSystem === "dojo") await repo.saveDaily(event.practicedOn, addOutput(await repo.daily(event.practicedOn), event));
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
