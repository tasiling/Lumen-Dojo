import "server-only";
import { getReadingBook, listReadingBooks, listReadingNotes } from "@/lib/notion/queries";
import { notion, withNotionRateLimit } from "@/lib/notion/client";
import type { ReadingDiscussion } from "./discussion";
import type { ReadingBook, ReadingNote } from "./types";
import { discussionFromArchive, type ReadingArchive } from "./archive";

type ChildPage = { id: string; title: string };

async function readArchive(child: ChildPage): Promise<ReadingArchive> {
  const lines: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await withNotionRateLimit(() => notion().blocks.children.list({
      block_id: child.id, start_cursor: cursor, page_size: 100,
    }));
    for (const block of page.results) {
      if (!("type" in block)) continue;
      const data = (block as unknown as Record<string, { rich_text?: { plain_text: string }[] }>)[block.type];
      const text = data.rich_text?.map(item => item.plain_text).join("");
      if (text) lines.push(text);
    }
    cursor = page.next_cursor || undefined;
  } while (cursor);
  return { ...child, lines };
}

export async function bookArchives(bookId: string, loaded?: { book: ReadingBook; notes: ReadingNote[]; children: ChildPage[] }) {
  const children = loaded?.children ?? [];
  const notes = loaded?.notes ?? await listReadingNotes(bookId, children);
  if (!children.length) return { archives: [], recovered: [] };
  const [book, archives] = await Promise.all([loaded?.book ?? getReadingBook(bookId), Promise.all(children.map(readArchive))]);
  const recovered = archives.flatMap(archive => discussionFromArchive(archive, book, notes) ?? []);
  return { archives, recovered };
}

// Search archive page titles first. Opening the queue should never scan every book's notes.
async function findArchivedBooks() {
  const parents = new Set<string>();
  let cursor: string | undefined;
  do {
    const result = await withNotionRateLimit(() => notion().search({
      query: "已完成的閱讀討論", filter: { property: "object", value: "page" }, start_cursor: cursor, page_size: 100,
    }));
    for (const page of result.results) {
      if (page.object === "page" && "parent" in page && page.parent.type === "page_id") parents.add(page.parent.page_id);
    }
    cursor = result.next_cursor || undefined;
  } while (cursor);
  const entries = new Map<string, ReadingDiscussion[]>();
  if (!parents.size) return entries;
  const books = (await listReadingBooks()).filter(book => parents.has(book.id));
  for (const book of books) {
    const children: ChildPage[] = [];
    const notes = await listReadingNotes(book.id, children);
    const { recovered } = await bookArchives(book.id, { book, children, notes });
    if (recovered.length) entries.set(book.id, recovered);
  }
  return entries;
}

let index: { expires: number; value: Promise<Map<string, ReadingDiscussion[]>> } | undefined;
export function archivedDiscussionIndex() {
  if (!index || index.expires <= Date.now()) {
    const value = findArchivedBooks().catch(error => { if (index?.value === value) index = undefined; throw error; });
    index = { expires: Date.now() + 60_000, value };
  }
  return index.value;
}
