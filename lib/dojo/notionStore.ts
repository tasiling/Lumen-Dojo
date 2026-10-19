import "server-only";
import { withLearningWriteLock } from "./learningFoundation/fileLock";
import { learningWriteOutcome } from "./learningFoundation/writeOutcome";
import { createPracticeOnce } from "./learningFoundation/practiceWrite";
import { sourceIdentity } from "./practiceEvents/service";
import { preserveProjection } from "./practiceEvents/compatibility";

import {
  findKnowledgeEntryByTitle,
  getKnowledgeEntry,
  listKnowledgeEntriesByPrefix,
} from "@/lib/notion/queries";
import {
  archiveKnowledgeEntry,
  createKnowledgeEntry,
  updateKnowledgeEntry,
} from "@/lib/notion/mutations";
import { parseJson } from "./formal";

export async function readJsonRecord(title: string) {
  const row = await findKnowledgeEntryByTitle(title);
  return row ? { id: row.id, title: row.標題, value: parseJson(row.內容) } : null;
}

export async function listJsonRecords(prefix: string) {
  const rows = await listKnowledgeEntriesByPrefix(prefix);
  return rows.map((row) => ({ id: row.id, title: row.標題, value: parseJson(row.內容) }));
}

export async function upsertJsonRecord(title: string, value: unknown, options?: { projection?: boolean; manualCompletion?: boolean }) {
  const guarded = ["行光今日-", "行光週盤-", "行光英文自譯-"].some(prefix => title.startsWith(prefix));
  async function save() {
    const existing = await findKnowledgeEntryByTitle(title);
    let merged = guarded ? preserveProjection(title, value, existing ? parseJson(existing.內容) : null, options?.projection, options?.manualCompletion) : value;
    if(title.startsWith('行光週盤-')&&existing&&!options?.manualCompletion){
      const before=parseJson(existing.內容) as {weekStart?:string;archivedAt?:string;cells?:{index:number;taskInstanceId?:string;disposition?:string}[]};
      if(before.archivedAt)merged=before;
      else if(before.weekStart&&Array.isArray(before.cells)&&merged&&typeof merged==='object'){
        const links=await listKnowledgeEntriesByPrefix(`行光續排-${before.weekStart}-`);
        const blocked=new Set(links.map(row=>(parseJson(row.內容) as {taskInstanceId?:string})?.taskInstanceId));
        const protectedCells=before.cells.filter(cell=>cell.taskInstanceId&&(blocked.has(cell.taskInstanceId)||cell.disposition));
        const next=merged as {cells:NonNullable<typeof before.cells>};
        for(const cell of protectedCells){next.cells=next.cells.map(value=>value.index===cell.index?cell:value)}
      }
    }
    const content = JSON.stringify(merged);
    if (existing) {
      await updateKnowledgeEntry(existing.id, { 內容: content });
      return { id: existing.id, created: false, value: merged };
    }
    const create = () => createKnowledgeEntry({ 標題: title, 內容: content }, { retryCreate: !guarded });
    const created = guarded ? await createPracticeOnce(sourceIdentity("dojo", "json", "title", title), create) : await create();
    return { id: created.id, created: true, value: merged };
  }
  return guarded && !learningWriteOutcome.getStore() ? withLearningWriteLock(save) : save();
}

export async function updateJsonRecordById(
  id: string,
  expectedPrefix: string,
  title: string,
  value: unknown
) {
  const existing = await getKnowledgeEntry(id);
  if (!existing.標題.startsWith(expectedPrefix)) throw new Error("紀錄類型不符");
  await updateKnowledgeEntry(id, { 標題: title, 內容: JSON.stringify(value) });
}

export async function archiveJsonRecordById(id: string, expectedPrefix: string) {
  const existing = await getKnowledgeEntry(id);
  if (!existing.標題.startsWith(expectedPrefix)) throw new Error("紀錄類型不符");
  await archiveKnowledgeEntry(id);
  return existing;
}
