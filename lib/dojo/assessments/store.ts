import "server-only";
import { notion, withNotionRateLimit } from "@/lib/notion/client";
import { DATA_SOURCES } from "@/lib/notion/schema";
import { createKnowledgeEntry, updateKnowledgeEntry } from "@/lib/notion/mutations";
import { mapKnowledge } from "@/lib/notion/queries";
import { parseJson } from "../formal";
import { LearningError, uuidPattern } from "../learningFoundation/model";
import { withLearningWriteLock } from "../learningFoundation/fileLock";
import { createPracticeOnce } from "../learningFoundation/practiceWrite";
import { learningFoundation, learningOwner } from "../learningFoundation/store";
import { sourceIdentity } from "../practiceEvents/service";
import { assessmentService } from "./service";
import { verifyOwnedEvidence } from "./evidence";
import type { AssessmentRepository, Attempt, Definition } from "./model";
export const DEFINITION_PREFIX = "行光能力規準-";
export const ATTEMPT_PREFIX = "行光能力嘗試-";
export const PROOF_PREFIX = "行光能力證明-";
function guid(id: string) { if (typeof id !== "string" || !uuidPattern.test(id)) throw new LearningError("驗收 ID 不正確"); return id; }
type Stored = { id: string; value: Definition | Attempt };
async function rows(prefix: string): Promise<Stored[]> {
  const result: Stored[] = [], cursors = new Set<string>(), ids = new Set<string>(); let cursor: string | undefined;
  do {
    const page = await withNotionRateLimit(() => notion().dataSources.query({ data_source_id: DATA_SOURCES.DB14_知識庫, filter: { property: "標題", title: { starts_with: prefix } }, page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) }));
    if (page.has_more && (!page.next_cursor || cursors.has(page.next_cursor))) throw new LearningError("驗收分頁結果不完整，請稍後重試", 503);
    for (const p of page.results) {
      const row = mapKnowledge(p), value = parseJson(row.內容) as Definition | Attempt | null;
      if (!value || !uuidPattern.test(value.id) || value.owner !== learningOwner || !row.標題.startsWith(prefix) ||
          (prefix === DEFINITION_PREFIX ? value.recordType !== "assessment-definition/v1" : value.recordType !== "assessment-attempt/v1")) throw new LearningError("驗收資料 owner 或格式不符", 403);
      if (ids.has(value.id)) throw new LearningError("驗收 ID 重複，請核對", 409); ids.add(value.id); result.push({ id: row.id, value });
    }
    if (!page.has_more) break;
    cursors.add(page.next_cursor!); cursor = page.next_cursor!;
  } while (cursor);
  return result;
}
async function attemptRow(id: string) {
  guid(id);
  const page = await withNotionRateLimit(() => notion().dataSources.query({ data_source_id: DATA_SOURCES.DB14_知識庫, filter: { property: "標題", title: { equals: ATTEMPT_PREFIX + id } }, page_size: 2 }));
  if (page.has_more || page.results.length > 1) throw new LearningError("嘗試 ID 重複，請核對", 409);
  if (!page.results.length) return null;
  const row = mapKnowledge(page.results[0]), a = parseJson(row.內容) as Attempt | null;
  if (!a || a.owner !== learningOwner || a.recordType !== "assessment-attempt/v1" || a.id !== id || !Number.isSafeInteger(a.revision) || a.revision < 1 || a.definitionSnapshot?.owner !== learningOwner || a.definitionSnapshot.capabilityId !== a.capabilityId || a.definitionSnapshot.definitionVersion !== a.definitionVersion) throw new LearningError("嘗試資料 owner 或版本不符", 403);
  return { id: row.id, value: a };
}
export const assessmentRepository: AssessmentRepository = {
  owner: learningOwner, exclusive: withLearningWriteLock,
  graph: async () => (await learningFoundation.snapshot()).entities,
  definitions: async () => {
    const values = (await rows(DEFINITION_PREFIX)).map(r => r.value as Definition), versions = new Set<string>();
    for (const d of values) { const key = `${d.capabilityId}:${d.definitionVersion}`; if (versions.has(key)) throw new LearningError("能力規準版本重複", 409); versions.add(key); }
    return values;
  },
  attempts: async () => (await rows(ATTEMPT_PREFIX)).map(r => r.value as Attempt),
  getAttempt: async id => (await attemptRow(id))?.value ?? null,
  verifyEvidence: verifyOwnedEvidence,
  async createDefinition(d) {
    const versionSlot = sourceIdentity(learningOwner, "assessment", "definition-version", `${d.capabilityId}:${d.definitionVersion}`);
    await createPracticeOnce(versionSlot, () => createPracticeOnce(sourceIdentity(learningOwner, "assessment", "definition-request", d.id), () => createKnowledgeEntry({ 標題: `${DEFINITION_PREFIX}${d.capabilityId}:v${d.definitionVersion}:${d.id}`, 內容: JSON.stringify(d) }, { retryCreate: false })));
  },
  async createAttempt(a) { await createPracticeOnce(sourceIdentity(learningOwner, "assessment", "attempt-request", a.id), () => createKnowledgeEntry({ 標題: ATTEMPT_PREFIX + a.id, 內容: JSON.stringify(a) }, { retryCreate: false })); },
  async updateAttempt(a) {
    const current = await attemptRow(a.id); if (!current || current.value.revision !== a.revision - 1) throw new LearningError("嘗試版本已變更，未覆寫", 409);
    await createPracticeOnce(sourceIdentity(learningOwner, "assessment", "attempt-revision", `${a.id}:${a.revision}`), () => updateKnowledgeEntry(current.id, { 內容: JSON.stringify(a) }));
  },
};
export const assessments = assessmentService(assessmentRepository);
