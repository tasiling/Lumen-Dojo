import "server-only";

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

export async function upsertJsonRecord(title: string, value: unknown) {
  const content = JSON.stringify(value);
  const existing = await findKnowledgeEntryByTitle(title);
  if (existing) {
    await updateKnowledgeEntry(existing.id, { 內容: content });
    return { id: existing.id, created: false };
  }
  const created = await createKnowledgeEntry({ 標題: title, 內容: content });
  return { id: created.id, created: true };
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
