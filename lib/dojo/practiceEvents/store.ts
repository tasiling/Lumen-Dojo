import "server-only";
import { createPracticeOnce } from "../learningFoundation/practiceWrite";
import { learningWriteOutcome } from "../learningFoundation/writeOutcome";
import { learningOwner } from "../learningFoundation/store";
import { LearningError } from "../learningFoundation/model";
import { readJsonRecord, upsertJsonRecord, updateJsonRecordById } from "../notionStore";
import { createKnowledgeEntry } from "@/lib/notion/mutations";
import { dailyRecordTitle, bingoRecordTitle, emptyDailyRecord, normalizeDailyRecord, normalizeWeeklyBoard } from "../formal";
import { learningRecords } from "../learningRecords/store";
import { EVENT_PREFIX, RECORD_PREFIX } from "../learningRecords/model";
import { eventBody, eventService, sourceIdentity } from "./service";
import type { CompletionEvent } from "./model";
const title = (id: string) => `${EVENT_PREFIX}${id}`;
export const practiceEvents = eventService({
  owner: learningOwner,
  async get(id) { const row = await readJsonRecord(title(id)); return row ? row.value as CompletionEvent : null; },
  async create(e) { await createPracticeOnce(e.id, () => createKnowledgeEntry({ 標題: title(e.id), 內容: JSON.stringify(e) }, { retryCreate: false })); },
  async update(e) { const row = await readJsonRecord(title(e.id)); if(!row) throw new LearningError("已保存事件尚未可讀，請核對，不重建", 409); await updateJsonRecordById(row.id, EVENT_PREFIX, title(e.id), e); },
  async body(e) {
    try {
      const existing=await learningRecords.read(e.learningRecordId);
      if(e.sourceSystem === "context-room") {
        if(existing.originEventId !== e.id || existing.owner !== e.owner) throw new LearningError("來源正文身分衝突",409);
        const stored=await readJsonRecord(`${RECORD_PREFIX}${existing.practicedOn ?? "unknown"}:${existing.id}`);
        if(!stored) throw new LearningError("來源正文結果需核對",409);
        const sourceRefs=existing.sourceRefs.map(ref=> ref.type === "context" && ref.id === e.sourceId ? { ...ref, url:e.sourceMetadata.sourceLocation ?? undefined, status:e.sourceAvailability === "deleted" ? "missing" as const : e.sourceAvailability } : ref);
        await updateJsonRecordById(stored.id,RECORD_PREFIX,`${RECORD_PREFIX}${existing.practicedOn ?? "unknown"}:${existing.id}`,{...existing,sourceRefs,sourceRevision:e.sourceRevision,sourceCompletionStatus:e.completionStatus,sourceAvailability:e.sourceAvailability,dateSemantics:e.dateSemantics,revision:existing.revision+1,updatedAt:new Date().toISOString()});
      }
      return;
    } catch(error) { if(!(error instanceof LearningError) || error.status !== 404) throw error; }
    const r = eventBody(e);
    await createPracticeOnce(sourceIdentity(learningOwner, "dojo", "event-body", e.id), () => createKnowledgeEntry({ 標題: `${RECORD_PREFIX}${r.practicedOn ?? "unknown"}:${r.id}`, 內容: JSON.stringify(r) }, { retryCreate: false }));
  },
  async daily(date) { const row = await readJsonRecord(dailyRecordTitle(date)); return row ? normalizeDailyRecord(row.value, date) : emptyDailyRecord(date); },
  async saveDaily(date, value) { await upsertJsonRecord(dailyRecordTitle(date), { ...value, practiceEventOutput: true }, { projection: true }); },
  async weekly(week) { const row = await readJsonRecord(bingoRecordTitle(week)); return row ? normalizeWeeklyBoard(row.value, week) : null; },
  async saveWeekly(week, value) { await upsertJsonRecord(bingoRecordTitle(week), value, { projection: true }); },
  assertKnownOutcome() { if(learningWriteOutcome.getStore()?.unresolved) throw new LearningError("投影寫入結果不明，停止後續寫入", 503); },
});
