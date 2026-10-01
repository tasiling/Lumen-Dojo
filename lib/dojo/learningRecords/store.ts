import "server-only";
import { createPracticeOnce } from "../learningFoundation/practiceWrite";
import { sourceIdentity } from "../practiceEvents/service";
import { notion, withNotionRateLimit } from "@/lib/notion/client";
import { DATA_SOURCES } from "@/lib/notion/schema";
import { getKnowledgeEntry, mapKnowledge } from "@/lib/notion/queries";
import { createKnowledgeEntry, updateKnowledgeEntry } from "@/lib/notion/mutations";
import { parseJson } from "../formal";
import { withLearningWriteLock } from "../learningFoundation/fileLock";
import { LearningError } from "../learningFoundation/model";
import { learningFoundation, learningOwner } from "../learningFoundation/store";
import { RECORD_PREFIX, type LearningRecord } from "./model";
import { recordService } from "./service";
const title = (r: LearningRecord) => `${RECORD_PREFIX}${r.practicedOn}:${r.id}`;
export const learningRecords = recordService({
  owner: learningOwner, graph: async () => (await learningFoundation.snapshot()).entities,
  exclusive: withLearningWriteLock,
  async verifySources(refs, previous) {
    const result = [];
    for (const ref of refs) {
      const old = previous?.sourceRefs.find(r => r.type === ref.type && r.id === ref.id);
      if(old) { result.push({ ...ref, status: old.status }); continue; }
      if(ref.type === "capture" || ref.type === "english-image") {
        const row = await getKnowledgeEntry(ref.id);
        const prefix = ref.type === "capture" ? "行光捕捉-" : "行光英文影像-";
        if(!row.標題.startsWith(prefix)) throw new LearningError("素材種類或 owner 不符",403);
        result.push({ ...ref, status: "available" as const });
      } else if(ref.type === "reading-book" || ref.type === "reading-note") {
        const page = await withNotionRateLimit(() => notion().pages.retrieve({ page_id: ref.id }));
        const allowed = ref.type === "reading-book" ? [DATA_SOURCES.DB21_書籍庫] : [DATA_SOURCES.DB21_書籍庫, DATA_SOURCES.DB22_洞察卡片庫];
        if(!("parent" in page) || !("data_source_id" in page.parent) || !allowed.some(id => id.replaceAll("-", "") === page.parent.data_source_id.replaceAll("-", "")) || page.archived) throw new LearningError("閱讀來源不屬於本 owner 或已封存",403);
        result.push({ ...ref, status: "available" as const });
      } else result.push(ref);
    }
    return result;
  },
  async page(cursor, limit = 20) {
    const result = await withNotionRateLimit(() => notion().dataSources.query({ data_source_id: DATA_SOURCES.DB14_知識庫, filter: { property: "標題", title: { starts_with: RECORD_PREFIX } }, sorts: [{ property: "標題", direction: "descending" }], page_size: limit, ...(cursor ? { start_cursor: cursor } : {}) }));
    return { rows: result.results.map(p => { const row = mapKnowledge(p); return { id: row.id, value: parseJson(row.內容) as LearningRecord }; }), cursor: result.has_more ? result.next_cursor : null };
  },
  async get(id) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new LearningError("紀錄 ID 不正確");
    const result = await withNotionRateLimit(() => notion().dataSources.query({ data_source_id: DATA_SOURCES.DB14_知識庫, filter: { and: [{ property: "標題", title: { starts_with: RECORD_PREFIX } }, { property: "標題", title: { ends_with: `:${id}` } }] }, page_size: 2 }));
    if (result.results.length > 1 || result.has_more) throw new LearningError("紀錄 ID 重複，請核對", 409);
    if (!result.results[0]) return null;
    const row = mapKnowledge(result.results[0]); return { id: row.id, value: parseJson(row.內容) as LearningRecord };
  },
  async create(r) { await createPracticeOnce(sourceIdentity(learningOwner, "dojo", "record-create", r.id), () => createKnowledgeEntry({ 標題: title(r), 內容: JSON.stringify(r) }, { retryCreate: false })); },
  async update(id, r) { await updateKnowledgeEntry(id, { 標題: title(r), 內容: JSON.stringify(r) }); },
});
