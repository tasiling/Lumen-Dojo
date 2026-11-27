import "server-only";
import { createKnowledgeEntry } from "@/lib/notion/mutations";
import { archiveJsonRecordById, listJsonRecords, updateJsonRecordById } from "../notionStore";
import { learningOwner } from "../learningFoundation/store";
import { withLearningWriteLock } from "../learningFoundation/fileLock";
import { createPracticeOnce } from "../learningFoundation/practiceWrite";
import { muscleService } from "./service";

// 肌肉卡、型態卡、答題紀錄與道藏連結都存在 DB14，與學習底座共用擁有者與寫入鎖。
export const muscleCards = muscleService({
  owner: learningOwner,
  list: (prefix) => listJsonRecords(prefix),
  create: async (title, value, identity) => {
    await createPracticeOnce(identity, () =>
      createKnowledgeEntry({ 標題: title, 內容: JSON.stringify(value) }, { retryCreate: false }),
    );
  },
  update: (id, prefix, title, value) => updateJsonRecordById(id, prefix, title, value),
  archive: async (id, prefix) => {
    await archiveJsonRecordById(id, prefix);
  },
  exclusive: withLearningWriteLock,
});
