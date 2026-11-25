import type { ReadingDiscussion } from "./discussion";
import type { InsightCard, ReadingBook, ReadingNote } from "./types";

/** 讀後復盤的心智圖：只排列已經寫下的東西，不產生新的內容。每個節點標明是誰的話。 */
export type MindNodeKind = "book" | "branch" | "author" | "mine" | "question" | "card";
export type MindNode = { text: string; kind: MindNodeKind; tag?: string; children: MindNode[] };

const one = (value: string | undefined | null) => (value ?? "").trim().replace(/\s+/g, " ");
const node = (text: string, kind: MindNodeKind, tag = "", children: MindNode[] = []): MindNode => ({ text, kind, ...(tag ? { tag } : {}), children });

export function readingMindmap(input: { book: ReadingBook; notes: ReadingNote[]; cards: InsightCard[]; discussions: ReadingDiscussion[] }): MindNode {
  const { book, notes, cards, discussions } = input;
  const branches: MindNode[] = [];
  const preview = notes.filter(note => note.kind === "preview").at(-1);
  const before = [
    one(book.question) && node(one(book.question), "question", "讀前問題"),
    one(preview?.metadata.currentUnderstanding) && node(one(preview?.metadata.currentUnderstanding), "mine", "讀前的理解"),
    one(preview?.metadata.verificationFocus) && node(one(preview?.metadata.verificationFocus), "question", "想驗證的"),
  ].filter((value): value is MindNode => Boolean(value));
  if (before.length) branches.push(node("讀前", "branch", "", before));

  // 摘錄依章節分支；每則摘錄底下掛我對它的想法，以及討論後我確認留下的觀點。
  const views = new Map<string, MindNode[]>();
  for (const thread of discussions) for (const round of thread.rounds) for (const candidate of round.result?.candidates ?? []) {
    if (candidate.state !== "confirmed" || candidate.type !== "觀點" || !one(candidate.text)) continue;
    const key = round.source.noteId.toLowerCase();
    views.set(key, [...(views.get(key) ?? []), node(one(candidate.text), "mine", "討論後我的觀點")]);
  }
  const chapters = new Map<string, MindNode[]>();
  const loose: MindNode[] = [];
  for (const note of notes) {
    const own = views.get(note.id.toLowerCase()) ?? [];
    if (note.kind === "excerpt" && one(note.text)) {
      const chapter = one(note.metadata.chapter) || "未標章節";
      const reflection = one(note.metadata.reflection);
      chapters.set(chapter, [...(chapters.get(chapter) ?? []),
        node(one(note.text), "author", [one(note.metadata.location), "作者原文"].filter(Boolean).join(" · "), [...(reflection ? [node(reflection, "mine", "我的想法")] : []), ...own])]);
    } else if (note.kind === "thought" && one(note.text)) {
      loose.push(node(one(note.text), "mine", "零碎想法", own));
    }
  }
  if (chapters.size) branches.push(node("摘錄", "branch", "", [...chapters].map(([chapter, items]) => node(chapter, "branch", "", items))));
  if (loose.length) branches.push(node("零碎想法", "branch", "", loose));

  if (cards.length) branches.push(node("洞察卡", "branch", "", cards.filter(card => one(card.insight)).map(card =>
    node(one(card.insight), "card", card.status, one(card.action) ? [node(one(card.action), "mine", "接下來")] : []))));

  const review = notes.filter(note => note.kind === "review").at(-1);
  const after = [
    one(review?.metadata.changedUnderstanding) && node(one(review?.metadata.changedUnderstanding), "mine", "改變或補充的理解"),
    one(review?.metadata.openQuestion) && node(one(review?.metadata.openQuestion), "question", "仍不同意或待查證"),
    one(review?.metadata.nextStep) && node(one(review?.metadata.nextStep), "mine", "接下來觀察或實作"),
  ].filter((value): value is MindNode => Boolean(value));
  if (after.length) branches.push(node("讀後復盤", "branch", "", after));

  return node(one(book.title) || "這本書", "book", book.readCount > 1 ? "第 " + book.readCount + " 次閱讀" : "", branches);
}

export function mindmapCount(root: MindNode): number {
  return root.children.reduce((sum, child) => sum + (child.kind === "branch" ? mindmapCount(child) : 1 + mindmapCount(child)), 0);
}

/** Markmap 能直接開的 Markdown 大綱。作者原文加上引號，其餘是我寫的。 */
export function mindmapMarkdown(root: MindNode): string {
  const lines = ["# " + root.text];
  const walk = (item: MindNode, depth: number) => {
    const body = item.kind === "author" ? "「" + item.text + "」" : item.text;
    const line = item.kind === "branch" ? body : (item.tag ? item.tag + "：" : "") + body;
    lines.push(depth === 1 ? "## " + line : "  ".repeat(depth - 2) + "- " + line);
    item.children.forEach(child => walk(child, depth + 1));
  };
  root.children.forEach(child => walk(child, 1));
  return lines.join("\n");
}
