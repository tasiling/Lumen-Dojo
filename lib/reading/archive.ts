import { validateReturn, type DiscussionRound, type ReadingDiscussion } from "./discussion";
import type { ReadingBook, ReadingNote } from "./types";

export type ReadingArchive = { id: string; title: string; lines: string[] };

export function discussionFromArchive(archive: ReadingArchive, book: ReadingBook, notes: ReadingNote[]): ReadingDiscussion | null {
  const { lines } = archive;
  const idsAt = lines.indexOf("原討論識別");
  if (idsAt < 0) return null;
  const ids = lines.slice(idsAt + 1).join("\n");
  const uuid = "[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}";
  const field = (label: string) => ids.match(new RegExp("^" + label + "\\s+(" + uuid + ")(?=\\s|$)", "im"))?.[1]?.toLowerCase();
  const threadId = field("討論 ID"), roundId = field("討論包 ID");
  const excerpt = lines[0]?.match(/^選段「([\s\S]*)」\s*｜/)?.[1];
  const matches = notes.filter(note => note.kind === "excerpt" && note.text === excerpt);
  if (!threadId || !roundId || matches.length !== 1 || !ids.includes("心知閱讀討論/v1")) return null;

  const summaryAt = lines.indexOf("討論小結與待查問題");
  const candidatesAt = lines.findIndex(line => line.startsWith("候選成果"));
  const turnsAt = lines.indexOf("逐字問答");
  if (summaryAt < 0 || candidatesAt <= summaryAt || turnsAt <= candidatesAt || idsAt <= turnsAt) return null;
  const turns: { 角色: string; 內容: string }[] = [];
  for (const line of lines.slice(turnsAt + 1, idsAt)) {
    const turn = line.match(/^T(\d+)\s*·\s*(我|GPT)$/);
    if (turn) {
      if (Number(turn[1]) !== turns.length + 1) return null;
      turns.push({ 角色: turn[2], 內容: "" });
    } else if (turns.length) {
      const last = turns[turns.length - 1];
      last.內容 = [last.內容, line].filter(Boolean).join("\n\n");
    }
  }
  const candidates: { 類型: string; 內容: string; 依據: string; 依據原句: string; 行動: string }[] = [];
  let section: "內容" | "依據原句" | "行動" = "內容";
  for (const line of lines.slice(candidatesAt + 1, turnsAt)) {
    const heading = line.match(/^(\d+)[．.]\s*(觀點|洞察卡)\s*·\s*(T\d+|S2?|N2?)(?:（[^）]+）)?$/);
    if (heading) {
      if (Number(heading[1]) !== candidates.length + 1) return null;
      candidates.push({ 類型: heading[2], 內容: "", 依據: heading[3], 依據原句: "", 行動: "" });
      section = "內容";
    } else if (candidates.length) {
      const item = candidates[candidates.length - 1];
      const marker = line.match(/^(依據原句|行動)\s+([\s\S]*)$/);
      if (marker) section = marker[1] as "依據原句" | "行動";
      item[section] = [item[section], marker ? marker[2] : line].filter(Boolean).join("\n\n");
    }
  }
  const [note] = matches;
  const round: DiscussionRound = {
    id: roundId, archiveId: archive.id, starter: turns[0]?.角色 === "我" ? "me" : "gpt", question: "", createdAt: "",
    source: {
      bookId: book.id, bookTitle: book.title, readCount: book.readCount, noteId: note.id,
      label: archive.title.split("｜")[0], excerpt: note.text, reflection: note.metadata.reflection || "",
      readingQuestion: book.question, locator: [note.metadata.source, note.metadata.chapter, note.metadata.location].filter(Boolean).join(" · "),
    },
  };
  const thread: ReadingDiscussion = { id: threadId, scope: note.metadata.reflection ? "both" : "excerpt", rounds: [round] };
  try {
    round.result = validateReturn(JSON.stringify({
      格式: "心知閱讀討論/v1", 討論ID: threadId, 討論包ID: roundId, 選段ID: note.id, 狀態: "完成",
      問答: turns, 下次從這裡: lines.slice(summaryAt + 1, candidatesAt).join("\n\n"), 候選: candidates,
    }), thread, round);
  } catch { return null; }
  return thread;
}

// A retained or skipped candidate lives in the notebook; the source archive remains immutable.
export function mergeArchivedDiscussions(saved: ReadingDiscussion[], archived: ReadingDiscussion[]): ReadingDiscussion[] {
  const merged = [...saved];
  for (const source of archived) {
    const index = merged.findIndex(thread => thread.id === source.id);
    if (index < 0) { merged.push(source); continue; }
    const existing = merged[index];
    const current = existing.rounds.map(round => {
      const original = source.rounds.find(stored => stored.id === round.id);
      return original?.archiveId && !round.archiveId ? { ...round, archiveId: original.archiveId } : round;
    });
    const missing = source.rounds.filter(round => !current.some(stored => stored.id === round.id));
    merged[index] = { ...existing, rounds: [...missing, ...current] };
  }
  return merged;
}
