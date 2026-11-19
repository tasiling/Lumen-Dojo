import type { ReadingBook } from "./types";

export const shelfGroups = ["category", "subject", "progress"] as const;
export type ShelfGroup = (typeof shelfGroups)[number];
export type ShelfSelection = Record<ShelfGroup, string[]>;
export type ShelfView = ShelfSelection & { q: string; sort: "added" | "name" };
export const emptySelection: ShelfSelection = { category: [], subject: [], progress: [] };
export const defaultShelf: ShelfView = { ...emptySelection, q: "", sort: "added" };
const collator = new Intl.Collator("zh-Hant-TW", { numeric: true, sensitivity: "base" });

export function readShelfView(params: URLSearchParams): ShelfView {
  const values = (key: ShelfGroup) => [...new Set(params.getAll(key))];
  return {
    q: params.get("q") ?? "", sort: params.get("sort") === "name" ? "name" : "added",
    category: values("category"), subject: values("subject"), progress: values("progress"),
  };
}

export function writeShelfView(view: ShelfView, params = new URLSearchParams()) {
  if (view.q) params.set("q", view.q); else params.delete("q");
  if (view.sort === "name") params.set("sort", "name"); else params.delete("sort");
  for (const group of shelfGroups) {
    params.delete(group);
    for (const value of view[group]) params.append(group, value);
  }
  return params;
}

export function shelfContext(params: URLSearchParams) {
  const context = writeShelfView(readShelfView(params));
  const parent = params.get("returnTo");
  if (parent?.startsWith("/practice/learning?")) context.set("returnTo", parent);
  return context;
}

export function shelfValue(book: ReadingBook, group: ShelfGroup): string {
  if (group === "category") return book.category || "未分類";
  if (group === "subject") return book.subject || "未設定學科";
  if (book.finished) return "已讀完";
  if (book.status === "放棄") return "已放下";
  return book.status === "待讀" ? "待讀" : "閱讀中";
}

export function displayFacet(value: string) {
  return value === "新時代 New age" ? "新時代" : value;
}

const normalize = (text: string) => text.normalize("NFKC").toLowerCase().replace(/[\p{P}\p{S}\s]/gu, "");

export function matchBooks(books: ReadingBook[], view: ShelfView) {
  const words = view.q.trim().split(/\s+/u).map(normalize).filter(Boolean);
  return books.filter(book => {
    const fields = [book.title, book.author, book.subtitle || ""].map(normalize);
    return words.every(word => fields.some(field => field.includes(word))) &&
      shelfGroups.every(group => !view[group].length || view[group].includes(shelfValue(book, group)));
  }).sort((a, b) => (view.sort === "name" ? 0 : b.createdAt.localeCompare(a.createdAt)) ||
    collator.compare(a.title, b.title) || b.readCount - a.readCount || a.id.localeCompare(b.id));
}

export function facetOptions(books: ReadingBook[], group: ShelfGroup, selected: string[]) {
  const counts = new Map<string, number>(selected.map(value => [value, 0]));
  for (const book of books) {
    const value = shelfValue(book, group);
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  if (group === "progress") for (const value of ["閱讀中", "待讀", "已讀完", "已放下"]) {
    if (!counts.has(value)) counts.set(value, 0);
  }
  const missing = (v: string) => v === "未分類" || v === "未設定學科";
  return [...counts].sort(([a, n], [b, m]) => Number(missing(a)) - Number(missing(b)) || m - n || collator.compare(a, b));
}

export function toggleFacet(selection: ShelfSelection, group: ShelfGroup, value: string): ShelfSelection {
  const values = selection[group];
  return { ...selection, [group]: values.includes(value) ? values.filter(v => v !== value) : [...values, value] };
}
