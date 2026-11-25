import "server-only";

import { LearningError } from "./learningFoundation/model";
import { listJsonRecords, readJsonRecord, updateJsonRecordById } from "./notionStore";
import { createKnowledgeEntry } from "@/lib/notion/mutations";
import { createKnowledgeClaim } from "./knowledgeClaimStore";
import type { KnowledgeSourceRef } from "./knowledgeClaims";
import { studioCards } from "./weavingStudio/catalog";
import {
  DAO_QUESTION_TITLE_PREFIX, daoSourceKind, isDaoQuestionId, latestUnderstanding, newDaoQuestion, newDaoQuestionId,
  normalizeDaoQuestion, withShuttle, withSources, withVersion, withoutSource,
  type DaoQuestion, type DaoSource,
} from "./daoQuestions";

// 道藏的長期問題存在 DB-14，標題前綴「行光道藏問題-」，內容是 JSON。錯誤訊息只帶編號，不帶內容。

const locks = new Map<string, Promise<unknown>>();
async function withLock<T>(id: string, task: () => Promise<T>): Promise<T> {
  const previous = locks.get(id) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(task);
  locks.set(id, current);
  try { return await current; }
  finally { if (locks.get(id) === current) locks.delete(id); }
}

async function readQuestion(id: string) {
  if (!isDaoQuestionId(id)) throw new LearningError("長期問題的編號格式不符。", 400);
  const row = await readJsonRecord(DAO_QUESTION_TITLE_PREFIX + id);
  const question = row && normalizeDaoQuestion(row.value);
  if (!row || !question) throw new LearningError("找不到這個長期問題。", 404);
  return { pageId: row.id, question };
}
async function write(pageId: string, question: DaoQuestion) {
  await updateJsonRecordById(pageId, DAO_QUESTION_TITLE_PREFIX, DAO_QUESTION_TITLE_PREFIX + question.id, question);
  return question;
}
async function update(id: string, change: (q: DaoQuestion, now: string) => DaoQuestion) {
  return withLock(id, async () => {
    const { pageId, question } = await readQuestion(id);
    return write(pageId, change(question, new Date().toISOString()));
  });
}

export async function listDaoQuestions(): Promise<DaoQuestion[]> {
  const rows = await listJsonRecords(DAO_QUESTION_TITLE_PREFIX);
  return rows.map((row) => normalizeDaoQuestion(row.value)).filter((q): q is DaoQuestion => q !== null && !q.archived)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
export async function getDaoQuestion(id: string): Promise<DaoQuestion> {
  return (await readQuestion(id)).question;
}

/** The cards every field already shares with the studio: 覺察, 閱讀, 野採. */
export async function listDaoSources(): Promise<DaoSource[]> {
  const { cards } = await studioCards();
  return cards.map((c) => ({
    id: c.id, title: c.title, type: c.type, idea: c.idea, quote: c.quote, source: c.source, location: c.location,
    author: c.author, quoteLabel: c.quoteLabel, url: c.url, ...(c.basis ? { basis: c.basis } : {}),
  }));
}

export async function createDaoQuestion(input: { title: string; understanding?: string; sources?: string[] }): Promise<DaoQuestion> {
  const title = input.title.trim();
  if (!title) throw new LearningError("請先寫下問題。", 400);
  const question = newDaoQuestion({ id: newDaoQuestionId(), title, understanding: input.understanding, sources: input.sources, now: new Date().toISOString() });
  await createKnowledgeEntry({ 標題: DAO_QUESTION_TITLE_PREFIX + question.id, 內容: JSON.stringify(question) });
  return question;
}

export const addDaoVersion = (id: string, input: { text: string; note?: string; from?: string }) => {
  if (!input.text.trim()) throw new LearningError("請先寫下理解。", 400);
  return update(id, (q, now) => withVersion(q, input, now));
};
export const linkDaoSources = (id: string, ids: string[]) => update(id, (q, now) => withSources(q, ids, now));
export const unlinkDaoSource = (id: string, sourceId: string) => update(id, (q, now) => withoutSource(q, sourceId, now));
export const linkDaoShuttle = (id: string, shuttle: { id: string; title: string }) => update(id, (q, now) => withShuttle(q, shuttle, now));
export const archiveDaoQuestion = (id: string) => update(id, (q, now) => ({ ...q, archived: true, updatedAt: now }));

/** A 織光杼's 經線 comes back as a new understanding of an existing question, or as a new question. */
export async function storeShuttleCore(input: { toId: string; shuttleId: string; title: string; core: string; cardIds: string[] }): Promise<DaoQuestion> {
  if (!input.core.trim()) throw new LearningError("這把杼還沒有經線，沒有可以存回的理解。", 400);
  const from = `從織光杼「${input.title}」的經線存回`;
  if (!input.toId) {
    const created = await createDaoQuestion({ title: input.title, sources: input.cardIds });
    const withCore = await addDaoVersion(created.id, { text: input.core, from });
    return linkDaoShuttle(withCore.id, { id: input.shuttleId, title: input.title });
  }
  return update(input.toId, (q, now) => withShuttle(withSources(withVersion(q, { text: input.core, from }, now), input.cardIds, now), { id: input.shuttleId, title: input.title }, now));
}

function claimSource(s: DaoSource): KnowledgeSourceRef {
  const [prefix, ...rest] = s.id.split(":"), rawId = rest.join(":");
  const sourceType: KnowledgeSourceRef["sourceType"] = prefix === "insight" ? "reading_insight" : prefix === "interview" ? "forage_capture" : "manual";
  return {
    sourceType, sourceId: sourceType === "manual" ? s.id : rawId,
    label: `${daoSourceKind(s)}・${s.idea || s.title}`.slice(0, 300),
    locator: [s.source, s.location].filter(Boolean).join(" · "), url: /^https?:/.test(s.url) ? s.url : "",
    snapshot: [s.idea, s.quote && s.quote !== s.idea ? `${s.quoteLabel || "原文"}：${s.quote}` : "", s.basis ? `回應的原文：${s.basis}` : ""].filter(Boolean).join("\n"),
  };
}

/** 升級成知識：成為知識庫裡的一條候選，正式採用仍在知識庫由本人決定。 */
export async function daoToKnowledge(id: string, input: { statement: string; boundary: string }) {
  const statement = input.statement.trim();
  if (!statement) throw new LearningError("請寫下知識的說法。", 400);
  return withLock(id, async () => {
    const { pageId, question } = await readQuestion(id);
    if (question.knowledge) throw new LearningError("這個問題已經升級成知識。", 409);
    const all = new Map((await listDaoSources()).map((s) => [s.id, s]));
    const sources = question.sources.map((sid) => all.get(sid)).filter((s): s is DaoSource => Boolean(s)).map(claimSource);
    sources.push({ sourceType: "manual", sourceId: DAO_QUESTION_TITLE_PREFIX + question.id, label: `道藏長期問題・${question.title}`.slice(0, 300), locator: "", url: "",
      snapshot: question.versions.map((v) => `第 ${v.n} 次（${v.at.slice(0, 10)}，${v.from}）：${v.text}`).join("\n") });
    const claim = await createKnowledgeClaim({
      title: question.title, statement,
      type: sources.some((s) => s.sourceType !== "manual") ? "understanding" : "experience",
      claimant: "crystal", generatedBy: "human", sources,
      supportingEvidence: `理解更新過 ${question.versions.length} 次；目前：${latestUnderstanding(question)?.text ?? ""}`,
      scope: input.boundary.trim(),
    });
    const next = { ...question, knowledge: { claimId: claim.id, statement }, updatedAt: new Date().toISOString() };
    await write(pageId, next);
    return { question: next, claimId: claim.id };
  });
}
