import type { ReadingBook } from "@/lib/reading/types";
const key = "xinzhi.openedBooks.v1";
export function openedAt(): Record<string,number> {
  try { return JSON.parse(localStorage.getItem(key) || "{}") || {}; } catch { return {}; }
}
export function markOpened(id:string) {
  try { localStorage.setItem(key, JSON.stringify({...openedAt(), [id]:Date.now()})); } catch {}
}
// Keep the matching Traditional Chinese edition available when the signed library thumbnail expires.
const editionCovers: Record<string, string> = {
  "你的心，是最強大的魔法": "magic",
  "最高學以致用法": "output",
  "八成是你想太多": "overthinking",
  "大腦抗拒不了的情節（三版）": "wired",
  "高效人生工作法圖解": "productivity",
  "精準顯化六步驟": "mind-magic",
  "理解的本質": "understanding",
  "成為「頭腦好的人」的高效學習法": "max-learning",
  "防彈筆記法": "bulletproof",
  "祈求成真的秘密": "prayer",
  "顯化成真的關鍵": "promise",
  "你該管理的是能量，而不是時間": "energy",
  "允許自己變有錢": "money",
  "現象在一念之間改變「量子力學式」平行世界的法則": "parallel",
  "靈性療癒的祕密覺察震動療法": "heal",
  "誦經與量子力學": "chant",
  "與成功有約（30週年全新增訂版）": "covey",
  "財富的心靈法則": "wealth",
  "意念使用手冊": "intent",
};

export function coverFor(book: ReadingBook) {
  const title = shelfTitle(book).replace(/^《(.+)》$/, "$1").trim();
  const edition = editionCovers[title];
  return edition ? "/reading-covers/" + edition + "-hd.webp" : book.coverUrl || "";
}

export function shelfTitle(book: ReadingBook) {
  return book.title.includes("是最強大的魔法") ? book.title.replace(/^Magic Shop\s*/i, "") : book.title;
}

export function shelfAuthor(book: ReadingBook) {
  return book.author || (book.title.includes("是最強大的魔法") ? "詹姆斯・多堤" : "");
}
