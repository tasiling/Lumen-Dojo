import { randomUUID } from "node:crypto";
import { LearningError, type LearningEntity } from "../learningFoundation/model";
import { recordInput, type LearningRecord, type RecordFilter } from "./model";
export type Row<T> = { id: string; value: T };
export type RecordRepository = {
  owner: string; graph(): Promise<LearningEntity[]>;
  page(cursor?: string, limit?: number): Promise<{ rows: Row<LearningRecord>[]; cursor: string | null }>;
  get(id: string): Promise<Row<LearningRecord> | null>;
  create(value: LearningRecord): Promise<void>; update(rowId: string, value: LearningRecord): Promise<void>;
  exclusive<T>(fn: () => Promise<T>): Promise<T>;
};
export function recordService(repo: RecordRepository) {
  function assert(value: LearningRecord) {
    if (!value || value.owner !== repo.owner || value.recordType !== "learning-record/v1") throw new LearningError("紀錄無法存取或格式衝突", 403);
    return value;
  }
  async function get(id: string) {
    const row = await repo.get(id);
    if (!row) throw new LearningError("找不到紀錄", 404);
    assert(row.value); return row;
  }
  return {
    async read(id: string) { return (await get(id)).value; },
    async list(filter: RecordFilter = {}) {
      const limit = Math.max(1, Math.min(100, filter.limit ?? 20));
      const page = await repo.page(filter.cursor, limit);
      const records = page.rows.map(r => assert(r.value)).filter(r =>
        (!filter.learningItemId || r.learningItemIds.includes(filter.learningItemId)) &&
        (!filter.stageId || r.learningStageId === filter.stageId) && (!filter.topicId || r.learningTopicId === filter.topicId) && (!filter.status || r.status === filter.status));
      // Empty filtered pages still carry the real upstream cursor. No 160-row cap.
      return { records, cursor: page.cursor };
    },
    async create(input: Record<string, unknown>) {
      return repo.exclusive(async () => {
        const now = new Date().toISOString();
        const record: LearningRecord = { ...recordInput(input, await repo.graph()), id: randomUUID(), owner: repo.owner, recordType: "learning-record/v1", createdAt: now, updatedAt: now, revision: 1 };
        await repo.create(record); return record;
      });
    },
    async edit(id: string, revision: number, input: Record<string, unknown>) {
      return repo.exclusive(async () => {
        const row = await get(id);
        if (revision !== row.value.revision) throw new LearningError("紀錄已更新，請重新讀取後編輯", 409);
        const record = { ...row.value, ...recordInput(input, await repo.graph(), row.value), revision: revision + 1, updatedAt: new Date().toISOString() };
        await repo.update(row.id, record); return record;
      });
    },
  };
}
