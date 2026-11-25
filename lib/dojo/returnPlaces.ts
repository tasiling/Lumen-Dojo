/**
 * 和 GPT 討論後貼回的紀錄，每一處都有自己的格式。這裡認得每一種格式，貼錯地方時告訴本人該去哪裡貼；
 * 也判斷識別碼是否其實沒有填（GPT 沒拿到討論包時會寫「待補」之類的字）。純函式，前後端共用。
 */

export type ReturnPlace = "refine" | "reading" | "awareness" | "dao" | "studio";

const PLACES: { place: ReturnPlace; test: RegExp; name: string; where: string }[] = [
  { place: "refine", test: /===\s*野採討論/, name: "野採淬鍊的紀錄", where: "野採素材的「開始淬鍊」頁面" },
  { place: "reading", test: /心知閱讀討論\/v/, name: "閱讀討論的回傳卡", where: "那本書的閱讀書頁「GPT 討論」" },
  { place: "awareness", test: /===\s*心情覺察/, name: "心・情覺察的紀錄", where: "修習所「心・情覺察」的那一則紀錄" },
  { place: "dao", test: /===\s*道藏理解/, name: "道藏的討論結果", where: "道藏那個長期問題的「接著和 GPT 想」" },
  { place: "studio", test: /織光杼討論回傳|===\s*織光(?:起稿|杼)/, name: "織光堂的回覆", where: "織光堂裡的那一把杼" },
];

/** A message when `raw` belongs to another place; "" when it is this place's own format or unrecognized. */
export function wrongPlace(raw: string, here: ReturnPlace): string {
  const text = String(raw ?? "");
  const found = PLACES.find((item) => item.test.test(text));
  if (!found || found.place === here) return "";
  return `這是${found.name}，不是這裡的格式。請到${found.where}貼回。`;
}

/**
 * True when an identifier was left unfilled: empty, or words such as 〔未取得原始ID，待補〕 or 請換成網站給的編號
 * that GPT writes when it never received a discussion package.
 */
export function unfilledId(value: unknown): boolean {
  const text = typeof value === "string" ? value.trim() : "";
  return !text || /[〔〕（）()]|待補|未取得|請換成|不明|無$|^-+$/.test(text) || !/^[\w-]+$/.test(text);
}
