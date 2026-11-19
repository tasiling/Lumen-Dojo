export type ClipLayout = "horizontal" | "vertical";
export type ClipDraft = {
  bookId: string;
  location: string;
  excerpt: string;
  reflection: string;
  label: string;
  layout: ClipLayout;
};
export type ClipReceipt = { bookId: string; noteId: string };
export type ClipPage = {
  id: string;
  name: string;
  mime: string;
  origin: "line" | "web";
  entryId?: string;
  createdAt: string;
  revision: number;
  draft?: ClipDraft;
  savingBookId?: string;
  saved?: ClipReceipt;
};
export type ClipBatch = {
  id: string;
  origin: "line" | "web";
  createdAt: string;
  pages: string[];
  lastBookId?: string;
  highlightNotes?: Record<string,ClipReceipt & {parts:string[];label:string}>;
};
export type ClipBatchDetail = Omit<ClipBatch, "pages"> & { pages: ClipPage[] };
export type ClipListRow = {
  id: string;
  origin: "line" | "web";
  createdAt: string;
  total: number;
  pending: number;
};
export const clipIdPattern =
  /^(?:[0-9a-f]{64}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
export function originalHref(id: string) {
  return "/api/dojo/reading/clips/original?id=" + encodeURIComponent(id);
}
export function noteHref(saved: ClipReceipt) {
  return "/reading/books/" + encodeURIComponent(saved.bookId) + "?note=" + encodeURIComponent(saved.noteId);
}
export function readClipDraft(value: unknown): ClipDraft {
  const data = (value && typeof value === "object" ? value : {}) as Partial<ClipDraft>;
  const field = (key: keyof ClipDraft, max: number) => {
    const s = data[key] ?? "";
    if (typeof s !== "string" || s.length > max) throw Error("欄位內容超過可保存的長度。");
    return s.trim();
  };
  return {
    bookId: field("bookId", 60),
    location: field("location", 180).replace(/[\r\n]+/g, " "),
    label: field("label", 120).replace(/[\r\n]+/g, " "),
    excerpt: field("excerpt", 40000),
    reflection: field("reflection", 6000),
    layout: data.layout === "vertical" ? "vertical" : "horizontal",
  };
}
