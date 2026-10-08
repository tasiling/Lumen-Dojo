import type { LearningEntity } from "../learningFoundation/model";
import { LearningError } from "../learningFoundation/model";
export const RECORD_PREFIX = "行光學習正文-";
export const EVENT_PREFIX = "行光完成事件-";
export type SourceRef = { type: "capture" | "english-image" | "reading-book" | "reading-note" | "context" | "url" | "manual"; id: string; label: string; url?: string; status: "available" | "archived" | "missing" | "unverified" };
export type LearningRecord = {
  id: string; owner: string; recordType: "learning-record/v1"; status: "draft" | "completed" | "archived";
  title: string; practicedOn: string | null; recordedOn: string; createdAt: string; updatedAt: string; revision: number;
  learningItemIds: string[]; primaryLearningItemId: string | null; learningStageId: string | null; learningTopicId: string | null;
  practiceKind: string; whatIDid: string; myUnderstanding: string; questions: string; difficulties: string; discoveries: string; worthKeeping: string;
  sourceCompletionStatus?: "completed"|"withdrawn"|"unverified"; sourceAvailability?: "available"|"archived"|"deleted";
  originEventId?: string; sourceRevision?: string; dateSemantics?: string;
  sourceRefs: SourceRef[]; selectedExcerpt: string; sourceSnapshot: string; tags: string[];
};
export type RecordFilter = { learningItemId?: string; stageId?: string; topicId?: string; status?: string; cursor?: string; limit?: number };
export const textFields = ["title", "practiceKind", "whatIDid", "myUnderstanding", "questions", "difficulties", "discoveries", "worthKeeping", "selectedExcerpt", "sourceSnapshot"] as const;
export function validDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T12:00:00Z`)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
}
export function recordInput(input: Record<string, unknown>, graph: LearningEntity[], previous?: LearningRecord): Omit<LearningRecord, "id" | "owner" | "recordType" | "createdAt" | "updatedAt" | "revision"> {
  const merged = { ...previous, ...input };
  const external = !!previous?.originEventId;
  if (external && merged.practicedOn !== previous.practicedOn) throw new LearningError("來源日期不可由筆記編輯改寫", 409);
  if ((!(external && merged.practicedOn === null) && !validDate(merged.practicedOn)) || !validDate(merged.recordedOn ?? merged.practicedOn)) throw new LearningError("日期不正確");
  const ids = merged.learningItemIds;
  if (!Array.isArray(ids) || (!external && !ids.length) || ids.length > 20 || ids.some(id => typeof id !== "string")) throw new LearningError("請選擇學科");
  const learningItemIds = [...new Set(ids)] as string[];
  for (const id of learningItemIds) {
    const item = graph.find(e => e.id === id && e.kind === "item");
    if ((!item || item.status === "archived") && !previous?.learningItemIds.includes(id)) throw new LearningError("學科不存在或無權關聯", 403);
  }
  const primary = typeof merged.primaryLearningItemId === "string" && merged.primaryLearningItemId ? merged.primaryLearningItemId : learningItemIds[0] ?? null;
  if (!(external && !learningItemIds.length && primary === null) && (!primary || !learningItemIds.includes(primary))) throw new LearningError("主要學科必須在關聯中");
  const stage = typeof merged.learningStageId === "string" && merged.learningStageId ? merged.learningStageId : null;
  const topic = typeof merged.learningTopicId === "string" && merged.learningTopicId ? merged.learningTopicId : null;
  for (const [id, kind, old] of [[stage, "stage", previous?.learningStageId], [topic, "topic", previous?.learningTopicId]] as const) {
    if (id && id !== old && !graph.some(e => e.id === id && e.kind === kind && e.itemId === primary && e.status !== "archived")) throw new LearningError("階段／主題不存在或不屬於主要學科", 403);
  }
  const fields = Object.fromEntries(textFields.map(key => {
    const value = merged[key] ?? "";
    if (typeof value !== "string" || value.length > 20000) throw new LearningError("文字欄位格式不正確或過長");
    return [key, value];
  })) as Pick<LearningRecord, typeof textFields[number]>;
  if (!fields.whatIDid.trim()) throw new LearningError("請留下這次實際學習內容");
  const status = merged.status ?? "draft";
  if (!["draft", "completed", "archived"].includes(String(status))) throw new LearningError("紀錄狀態不正確");
  const sourceRefs = merged.sourceRefs ?? [];
  if (!Array.isArray(sourceRefs) || sourceRefs.length > 30) throw new LearningError("來源格式不正確");
  // References are historical pointers, never evidence of caller ownership. Internal
  // IDs remain unverified until a source-specific, owner-validating adapter resolves them.
  const refs = sourceRefs.map((r: SourceRef) => {
    if (!r || !["capture", "english-image", "reading-book", "reading-note", "context", "url", "manual"].includes(r.type) || typeof r.id !== "string" || !r.id || r.id.length > 500 || typeof r.label !== "string" || r.label.length > 1000) throw new LearningError("來源格式不正確");
    if (r.url && !/^https?:\/\//.test(r.url)) throw new LearningError("来源 URL 不正確");
    const old = previous?.sourceRefs.find(s => s.type === r.type && s.id === r.id);
    return { type: r.type, id: r.id, label: r.label, ...(r.url ? { url: r.url } : {}), status: old?.status ?? "unverified" } as SourceRef;
  });
  if (external) {
    const authoritative = previous.sourceRefs.filter(r => r.type === "context");
    for (const ref of authoritative) {
      const at = refs.findIndex(r => r.type === ref.type && r.id === ref.id);
      if (at >= 0) refs[at] = ref; else refs.push(ref);
    }
  }
  const tags = merged.tags ?? [];
  if (!Array.isArray(tags) || tags.length > 30 || tags.some(t => typeof t !== "string" || t.length > 100)) throw new LearningError("標籤格式不正確");
  return { ...fields, status: status as LearningRecord["status"], practicedOn: merged.practicedOn as string | null, recordedOn: (merged.recordedOn ?? merged.practicedOn) as string, learningItemIds, primaryLearningItemId: primary, learningStageId: stage, learningTopicId: topic, sourceRefs: refs, tags };
}
