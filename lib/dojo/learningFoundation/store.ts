import "server-only";
import { DATA_SOURCES } from "@/lib/notion/schema";
import { listJsonRecords, updateJsonRecordById } from "../notionStore";
import { createKnowledgeEntry } from "@/lib/notion/mutations";
import { learningRecordTitle } from "../learning";
import type { LearningTrackKey } from "../formal";
import { FOUNDATION_PREFIX, LearningError } from "./model";
import { foundationService } from "./service";
import { withLearningWriteLock } from "./fileLock";
import { createSeedOnce } from "./seedWrite";

// The current app has one access-key owner and one server-configured DB14.
// No caller can select a data source, owner, page ID or legacy mapping.
export const learningOwner = DATA_SOURCES.DB14_知識庫;
export const learningFoundation = foundationService({
  owner: learningOwner,
  list: () => listJsonRecords(FOUNDATION_PREFIX),
  create: async (title, entity) => {
    const create = () =>
      createKnowledgeEntry(
        { 標題: title, 內容: JSON.stringify(entity) },
        { retryCreate: false },
      );
    if (entity.seedKey) await createSeedOnce(entity.seedKey, create);
    else await create();
  },
  update: async (id, title, entity) => {
    await updateJsonRecordById(id, FOUNDATION_PREFIX, title, entity);
  },
  exclusive: withLearningWriteLock,
  legacyVision: async (key) => {
    const rows = await listJsonRecords(
      learningRecordTitle(key as LearningTrackKey),
    );
    const exact = rows.filter(
      (row) => row.title === learningRecordTitle(key as LearningTrackKey),
    );
    if (exact.length > 1)
      throw new LearningError("舊學習項目有同名重複紀錄，請確認", 409);
    if (!exact.length) return null;
    const value = exact[0].value as { goal?: unknown } | null;
    if (!value || typeof value.goal !== "string")
      throw new LearningError("舊學習項目無法讀取，請確認", 409);
    return value.goal;
  },
});
