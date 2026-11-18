import "server-only";
import { mkdir, open, readFile, readdir, rename, unlink } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { withLearningWriteLock } from "@/lib/dojo/learningFoundation/fileLock";
import { LearningError, uuidPattern } from "@/lib/dojo/learningFoundation/model";
import { createPracticeOnce } from "@/lib/dojo/learningFoundation/practiceWrite";
import { sourceIdentity } from "@/lib/dojo/practiceEvents/service";
import { listReadingBooks, listReadingNotes } from "@/lib/notion/queries";
import { createInsightCard } from "@/lib/notion/mutations";
import { taipeiTodayISO } from "@/lib/dojo/formal";
import { readingNoteContent } from "./content";
import {
  approvedResult, DISCUSSION_SCOPES, discussionCitation, evidenceFor, returnIdentity, validateReturn,
  type DiscussionRound, type DiscussionScope, type DiscussionShortcut, type DiscussionSummary, type ReadingDiscussion,
} from "./discussion";

type Notebook = { version: 1; bookId: string; discussions: ReadingDiscussion[] };

function id(value: unknown) {
  if (typeof value !== "string" || !uuidPattern.test(value)) throw new LearningError("閱讀識別不正確。");
  return value.toLowerCase();
}

function directory() {
  const root = process.env.LEARNING_WRITE_LOCK_DIR;
  if (!root || !isAbsolute(root)) throw new LearningError("閱讀討論的持久儲存尚未就緒。", 503);
  return join(root, "reading-discussions");
}

async function read<T>(file: string): Promise<T | null> {
  try { return JSON.parse(await readFile(join(directory(), file), "utf8")) as T; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function write(file: string, value: unknown) {
  const dir = directory();
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const temporary = join(dir, "." + crypto.randomUUID() + ".tmp");
  try {
    const handle = await open(temporary, "wx", 0o600);
    try { await handle.writeFile(JSON.stringify(value)); await handle.sync(); }
    finally { await handle.close(); }
    await rename(temporary, join(dir, file));
    const parent = await open(dir, "r");
    try { await parent.sync(); } finally { await parent.close(); }
  } finally {
    await unlink(temporary).catch(() => {});
  }
}

async function notebook(bookId: string): Promise<Notebook> {
  const book = await read<Notebook>(id(bookId) + ".json");
  if (!book) return { version: 1, bookId, discussions: [] };
  if (book.version !== 1 || book.bookId !== bookId || !Array.isArray(book.discussions))
    throw new LearningError("閱讀討論紀錄的識別不符。", 409);
  return book;
}

async function storedBookIds() {
  try {
    return (await readdir(directory(), { withFileTypes: true }))
      .filter(entry => entry.isFile() && entry.name.endsWith(".json") && uuidPattern.test(entry.name.slice(0, -5)))
      .map(entry => entry.name.slice(0, -5));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

const resumePointer = () => read<DiscussionShortcut>("resume.json");
const saveNotebook = (book: Notebook) => write(book.bookId + ".json", book);
const roundRef = (book: Notebook, thread: ReadingDiscussion, round: DiscussionRound): DiscussionShortcut => ({
  bookId: book.bookId, discussionId: thread.id, roundId: round.id,
});
const pointsAt = (a: DiscussionShortcut | null, b: DiscussionShortcut) =>
  a?.bookId === b.bookId && a.discussionId === b.discussionId && a.roundId === b.roundId;

async function locateReturn(raw: string, preferredBook: string) {
  let identity: ReturnType<typeof returnIdentity>;
  try { identity = returnIdentity(raw); }
  catch (error) { throw new LearningError((error as Error).message); }
  id(identity.discussionId);
  id(identity.roundId);
  id(identity.noteId);
  const origin = await notebook(preferredBook);
  const others = origin.discussions.some(item => item.id === identity.discussionId) ? [] : await storedBookIds();
  for (const bookId of [preferredBook, ...others.filter(value => value !== preferredBook)]) {
    const book = bookId === preferredBook ? origin : await notebook(bookId);
    const discussion = book.discussions.find(item => item.id === identity.discussionId);
    const round = discussion?.rounds.find(item => item.id === identity.roundId && item.source.noteId === identity.noteId);
    if (discussion && round) return { book, discussion, round };
  }
  throw new LearningError("找不到回傳卡原本的正式討論包，請在原對話核對識別。", 404);
}

export async function discussionSummary(): Promise<DiscussionSummary> {
  const pointer = await resumePointer();
  const summary: DiscussionSummary = { resume: null, pending: [] };
  for (const bookId of await storedBookIds()) {
    const book = await notebook(bookId);
    for (const discussion of book.discussions) {
      const latest = discussion.rounds.at(-1);
      for (const round of discussion.rounds) {
        const ref = roundRef(book, discussion, round);
        const label = { bookTitle: round.source.bookTitle, noteLabel: round.source.label };
        const count = round.result?.candidates.filter(candidate => candidate.state === "pending").length ?? 0;
        if (count) summary.pending.push({ ...ref, ...label, count });
        if (latest === round && pointsAt(pointer, ref) && round.result?.status !== "完成") {
          const previous = discussion.rounds.at(-2)?.result;
          const next = round.result?.next || round.question || (previous?.status === "暫存" ? previous.next : "");
          summary.resume = { ...ref, ...label, next };
        }
      }
    }
  }
  return summary;
}

export async function listBookDiscussions(bookId: string) {
  const book = await notebook(id(bookId));
  const pointer = await resumePointer();
  const latest = book.discussions.find(thread => thread.id === pointer?.discussionId)?.rounds.at(-1);
  const pinnedRoundId = pointer?.bookId === book.bookId && latest?.id === pointer.roundId && latest?.result?.status !== "完成" ? pointer.roundId : null;
  return { discussions: book.discussions, pinnedRoundId };
}

export async function updateDiscussion(body: Record<string, unknown>) {
  const bookId = id(body.bookId);
  if (body.action === "prepare") {
    const noteId = id(body.noteId);
    const scope = body.scope as DiscussionScope;
    const starter = body.starter === "me" ? "me" : "gpt";
    const question = typeof body.question === "string" ? body.question.trim() : "";
    if (!Object.hasOwn(DISCUSSION_SCOPES, scope) || question.length > 4000 || (starter === "me" && !question))
      throw new LearningError("請核對帶入內容與這輪想提的問題。");
    const sourceBook = (await listReadingBooks()).find(book => book.id.toLowerCase() === bookId);
    if (!sourceBook) throw new LearningError("找不到這輪閱讀。", 404);
    const note = (await listReadingNotes(bookId)).find(item => item.id.toLowerCase() === noteId);
    if (!note) throw new LearningError("請先保存選段，再開始討論。", 404);
    const excerpt = note.kind === "excerpt" ? note.text : "";
    const reflection = note.kind === "excerpt" ? note.metadata.reflection ?? "" : readingNoteContent(note);
    if ((scope !== "reflection" && !excerpt) || (scope !== "excerpt" && !reflection))
      throw new LearningError("選段裡沒有這次選取的原文或想法。");
    return withLearningWriteLock(async () => {
      const book = await notebook(bookId);
      let discussion = book.discussions.find(item => item.scope === scope && item.rounds[0]?.source.noteId === noteId);
      const last = discussion?.rounds.at(-1);
      if (discussion && last && !last.result) return { discussion, roundId: last.id };
      if (!discussion) {
        discussion = { id: crypto.randomUUID(), scope, rounds: [] };
        book.discussions.push(discussion);
      }
      const excerptLabel = note.text.trim().replace(/\s+/g, " ").slice(0, 38);
      const round: DiscussionRound = {
        id: crypto.randomUUID(),
        starter,
        question,
        createdAt: new Date().toISOString(),
        source: {
          bookId, noteId, bookTitle: sourceBook.title, readCount: sourceBook.readCount,
          label: excerptLabel || "閱讀筆記",
          locator: [note.metadata.source, note.metadata.chapter, note.metadata.location].filter(Boolean).join(" · "),
          readingQuestion: sourceBook.question,
          excerpt: scope === "reflection" ? "" : excerpt,
          reflection: scope === "excerpt" ? "" : reflection,
        },
      };
      const pinned = last && pointsAt(await resumePointer(), roundRef(book, discussion, last));
      discussion.rounds.push(round);
      await saveNotebook(book);
      if (pinned && last?.result?.status === "暫存") await write("resume.json", roundRef(book, discussion, round));
      return { discussion, roundId: round.id, ...(pinned ? { pinnedRoundId: round.id } : {}) };
    });
  }

  if (body.action === "preview" || body.action === "save") {
    const raw = typeof body.raw === "string" ? body.raw : "";
    const parse = async () => {
      const target = await locateReturn(raw, bookId);
      try { return { ...target, parsed: validateReturn(raw, target.discussion, target.round) }; }
      catch (error) { throw new LearningError((error as Error).message); }
    };
    if (body.action === "preview") {
      const { book, discussion, round, parsed } = await parse();
      return { ref: roundRef(book, discussion, round), source: round.source, parsed: round.result ?? parsed, saved: !!round.result };
    }
    return withLearningWriteLock(async () => {
      const { book, discussion, round, parsed } = await parse();
      const ref = roundRef(book, discussion, round);
      if (!round.result) {
        if (discussion.rounds.at(-1) !== round) throw new LearningError("討論輪次已更新，請重新開啟原紀錄。", 409);
        round.result = parsed;
        round.savedAt = new Date().toISOString();
        if (parsed.status === "暫存") await write("resume.json", ref);
        await saveNotebook(book);
      }
      // Completion invalidates the exact resume pointer even if this is a retry.
      const pointer = await resumePointer();
      return { ref, discussion, roundId: round.id, ...(pointsAt(pointer, ref) ? { pinnedRoundId: round.result.status === "完成" ? null : round.id } : {}) };
    });
  }

  const action = body.action;
  if (!(action === "pin" || action === "hide" || action === "confirm" || action === "skip" || action === "restore"))
    throw new LearningError("不支援這項閱讀操作。");
  const discussionId = id(body.discussionId);
  const roundId = id(body.roundId);
  return withLearningWriteLock(async () => {
    const book = await notebook(bookId);
    const discussion = book.discussions.find(item => item.id === discussionId);
    const round = discussion?.rounds.find(item => item.id === roundId);
    if (!discussion || !round) throw new LearningError("找不到這輪討論。", 404);
    const ref = roundRef(book, discussion, round);
    if (action === "pin") {
      if (discussion.rounds.at(-1) !== round || round.result?.status === "完成")
        throw new LearningError("這輪已完成，可從原閱讀筆記回看。", 409);
      await write("resume.json", ref);
      return { pinnedRoundId: round.id };
    }
    if (action === "hide") {
      if (pointsAt(await resumePointer(), ref)) await write("resume.json", null);
      return { pinnedRoundId: null };
    }
    const candidate = round.result?.candidates.find(item => item.id === body.candidateId);
    if (!candidate) throw new LearningError("找不到這筆候選成果。", 404);
    if (candidate.state === "confirmed") return { discussion, roundId };
    if (action === "confirm") {
      if (candidate.state !== "pending") throw new LearningError("請先將成果放回待挑選。", 409);
      let approved;
      try { approved = approvedResult(body.result, round); }
      catch (error) { throw new LearningError((error as Error).message); }
      if (approved.type === "洞察卡") {
        const visit = body.nextVisitAt;
        if (visit != null && (typeof visit !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(visit)
          || !Number.isFinite(Date.parse(visit)) || new Date(visit).toISOString().slice(0, 10) !== visit))
          throw new LearningError("請選擇有效的回訪日期。");
        const evidence = evidenceFor(round)[approved.anchor];
        const marker = sourceIdentity("dojo", "reading-discussion", round.id, candidate.id);
        const card = await createPracticeOnce(marker, () => createInsightCard({
          bookId, insight: approved.text, actionType: "觀察型", action: approved.action,
          todayISO: taipeiTodayISO(), nextVisitISO: (visit as string | null | undefined) ?? null,
          sourceNoteId: round.source.noteId,
          sourceText: [
            discussionCitation(round, discussion.rounds.indexOf(round) + 1),
            "依據　" + evidence.label,
            approved.quote,
          ].join("\n"),
        }));
        candidate.cardId = card.id;
      }
      Object.assign(candidate, approved, { state: "confirmed" });
      delete candidate.evidenceError;
    } else {
      candidate.state = action === "skip" ? "skipped" : "pending";
    }
    await saveNotebook(book);
    return { discussion, roundId };
  });
}
