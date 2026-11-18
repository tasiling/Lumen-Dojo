import type { ReadingBook, ReadingNote } from "./types";
export type ManualReadingCard = {
  id: string;
  type: "觀點" | "洞察卡";
  text: string;
  action: string;
  bookId: string;
  bookTitle: string;
  readCount: number;
  noteId: string;
  locator: string;
  quote: string;
  quoteLabel: string;
  createdAt: string;
  cardId?: string;
  share: boolean;
};
export function makeManualCard(
  book: ReadingBook,
  note: ReadingNote,
  input: Record<string, unknown>,
  id: string,
): ManualReadingCard {
  const type = input.type,
    text = typeof input.text === "string" ? input.text.trim() : "",
    action = type === "洞察卡" && typeof input.actionText === "string" ? input.actionText.trim() : "";
  if ((type !== "觀點" && type !== "洞察卡") || !text || text.length > 6000)
    throw Error("請選擇卡片類型並用自己的話留下理解。");
  if (type === "洞察卡" && (!action || action.length > 6000)) throw Error("請寫下一件想觀察或執行的事。");
  if (!note.text.trim()) throw Error("這個選段還沒有可以引用的原句。");
  return {
    id,
    type,
    text,
    action,
    bookId: book.id,
    bookTitle: book.title,
    readCount: book.readCount,
    noteId: note.id,
    locator: [note.metadata.chapter, note.metadata.location].filter(Boolean).join(" · "),
    quote: note.text,
    quoteLabel: note.kind === "excerpt" ? "作者原文" : "原筆記",
    createdAt: new Date().toISOString(),
    share: input.share === true,
  };
}
export function manualCardText(card: ManualReadingCard) {
  return [
    card.type === "觀點" ? "【我的觀點】" : "【洞察卡】",
    card.text,
    card.action && "待觀察／執行　" + card.action,
    [card.bookTitle, "第 " + card.readCount + " 讀", card.locator].filter(Boolean).join(" · "),
    card.quoteLabel + "　" + card.quote,
  ]
    .filter(Boolean)
    .join("\n");
}
