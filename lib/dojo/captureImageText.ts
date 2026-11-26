// 採集圖片的文字（AI 讀圖）：資料格式、讀圖指令、核對與併入原文的規則。
// 只在擁有者按下「讀取圖片文字」時才讀；讀出的文字經擁有者核對確認後，才成為淬鍊原文的一部分。
// 純規則，不讀寫任何資料。

export type CaptureImagePage = {
  /** The attachment this text was read from. */
  attachmentId: string;
  /** Verbatim text in reading order, one line per line on the image. Edited by the owner after reading. */
  text: string;
  /** Spots the model could not read with confidence, for the owner to check. */
  unclear: string;
};

export type CaptureImageText = {
  state: "reading" | "ready" | "failed";
  pages: CaptureImagePage[];
  /** Only confirmed text joins the original used for 淬鍊. Any edit after confirming keeps it confirmed. */
  confirmed: boolean;
  confirmedAt: string | null;
  readAt: string | null;
  model: string;
  estimatedCostUsd: number;
  error: string;
};

export const IMAGE_TEXT_MAX_IMAGES = 20;
const PAGE_MAX = 6000;

export const IMAGE_TEXT_PROMPT = [
  "以下是同一則社群貼文的輪播圖，依張數順序排列。請逐張抄錄圖中的文字。",
  "規則：",
  "- 逐字照抄，不翻譯、不改寫、不摘要、不補字；簡體照簡體、繁體照繁體、英文照英文。",
  "- 依閱讀順序抄錄：先標題，再由上到下、由左到右。圖中每一行文字各占一行。",
  "- 表格一列一行，欄位之間用「｜」分隔。流程圖或步驟卡依編號順序列出，例如「ST.1 題目用收的」。",
  "- 浮水印、帳號名稱、頁碼（例如 01 / 09）、介面按鈕照抄在最後一行，不要混進正文。",
  "- 看不清楚的字用「□」代替，並在 unclear 欄說明是哪裡看不清楚；不要猜。",
  "- 圖中沒有文字時，text 留空字串。",
  "- index 從 1 開始，對應圖片的順序，每張圖都要有一筆。",
].join("\n");

export function imageTextSchema(count: number) {
  return {
    type: "object", additionalProperties: false, required: ["pages"],
    properties: {
      pages: {
        type: "array", minItems: count, maxItems: count,
        items: {
          type: "object", additionalProperties: false, required: ["index", "text", "unclear"],
          properties: { index: { type: "integer" }, text: { type: "string" }, unclear: { type: "string" } },
        },
      },
    },
  } as const;
}

/** Maps the model's pages onto the attachments, in order. Throws when an image is missing. */
export function imagePagesFromResult(result: unknown, attachmentIds: string[]): CaptureImagePage[] {
  const pages = (result && typeof result === "object" && Array.isArray((result as { pages?: unknown }).pages) ? (result as { pages: unknown[] }).pages : []);
  return attachmentIds.map((attachmentId, position) => {
    const row = pages.find((page) => page && typeof page === "object" && (page as { index?: unknown }).index === position + 1) as { text?: unknown; unclear?: unknown } | undefined;
    if (!row) throw new Error(`第 ${position + 1} 張圖沒有讀取結果，請重新讀取。`);
    return {
      attachmentId,
      text: typeof row.text === "string" ? row.text.replace(/\r\n?/g, "\n").trim().slice(0, PAGE_MAX) : "",
      unclear: typeof row.unclear === "string" ? row.unclear.trim().slice(0, 1000) : "",
    };
  });
}

export function normalizeImageText(value: unknown, attachmentIds: string[]): CaptureImageText | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Partial<CaptureImageText>;
  const state = raw.state === "reading" || raw.state === "failed" ? raw.state : "ready";
  const pages = Array.isArray(raw.pages) ? raw.pages.flatMap((page) => {
    if (!page || typeof page !== "object" || typeof page.attachmentId !== "string") return [];
    // Text read from an image that is no longer attached is dropped with it.
    if (!attachmentIds.includes(page.attachmentId)) return [];
    return [{ attachmentId: page.attachmentId, text: typeof page.text === "string" ? page.text.slice(0, PAGE_MAX) : "", unclear: typeof page.unclear === "string" ? page.unclear.slice(0, 1000) : "" }];
  }).slice(0, IMAGE_TEXT_MAX_IMAGES) : [];
  const text = (v: unknown, max: number) => typeof v === "string" ? v.slice(0, max) : "";
  return {
    state, pages,
    confirmed: raw.confirmed === true && pages.some((page) => page.text.trim()),
    confirmedAt: text(raw.confirmedAt, 40) || null,
    readAt: text(raw.readAt, 40) || null,
    model: text(raw.model, 80),
    estimatedCostUsd: Number.isFinite(raw.estimatedCostUsd) ? Math.max(0, Number(raw.estimatedCostUsd)) : 0,
    error: text(raw.error, 1000),
  };
}

/**
 * The confirmed image text as it joins the original: one 〔圖 N〕 heading per image with text,
 * numbered by the image's position among the capture's attachments.
 */
export function imageTextForOriginal(imageText: CaptureImageText | undefined, attachmentIds: string[]): string {
  if (!imageText?.confirmed) return "";
  return attachmentIds.flatMap((id, position) => {
    const page = imageText.pages.find((item) => item.attachmentId === id);
    const text = page?.text.trim();
    return text ? [`〔圖 ${position + 1}〕\n${text}`] : [];
  }).join("\n\n");
}

/** Attachments added after the last reading, so the owner knows to read again. */
export function unreadImages(imageText: CaptureImageText | undefined, attachmentIds: string[]): number {
  const read = new Set((imageText?.pages ?? []).map((page) => page.attachmentId));
  return attachmentIds.filter((id) => !read.has(id)).length;
}
