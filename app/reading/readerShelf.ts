import type { ReadingBook } from "@/lib/reading/types";
const key = "xinzhi.openedBooks.v1";
export function openedAt(): Record<string,number> {
  try { return JSON.parse(localStorage.getItem(key) || "{}") || {}; } catch { return {}; }
}
export function markOpened(id:string) {
  try { localStorage.setItem(key, JSON.stringify({...openedAt(), [id]:Date.now()})); } catch {}
}
export function coverFor(book:ReadingBook) {
  if (book.title.includes("最高學以致用法")) return "/reading-covers/output.webp";
  if (book.title.includes("是最強大的魔法")) return "/reading-covers/magic.webp";
  return book.coverUrl || "";
}

export function shelfTitle(book: ReadingBook) {
  return book.title.includes("是最強大的魔法") ? book.title.replace(/^Magic Shop\s*/i, "") : book.title;
}

export function shelfAuthor(book: ReadingBook) {
  return book.author || (book.title.includes("是最強大的魔法") ? "詹姆斯・多堤" : "");
}
