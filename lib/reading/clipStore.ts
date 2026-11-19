import "server-only";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import {colors} from "./highlights";
import { LearningError, uuidPattern } from "@/lib/dojo/learningFoundation/model";
import { withLearningWriteLock } from "@/lib/dojo/learningFoundation/fileLock";
import { createPracticeOnce } from "@/lib/dojo/learningFoundation/practiceWrite";
import { englishImageAttachmentBytes } from "@/lib/dojo/englishImageStore";
import type { EnglishImageEntry } from "@/lib/dojo/englishImage";
import { listReadingBooks, listReadingNotes } from "@/lib/notion/queries";
import { taipeiTodayISO } from "@/lib/dojo/formal";
import { appendReadingNote, createReadingBook } from "@/lib/notion/mutations";
import { serializeStructuredReadingNote } from "./notes";
import { getJson, putJson, jsonIds, readingDirectory, atomicFile } from "./files";
import {
  clipIdPattern,
  readClipDraft,
  type ClipBatch,
  type ClipBatchDetail,
  type ClipListRow,
  type ClipPage,
  type ClipReceipt,
} from "./clips";

const root = () => readingDirectory("reading-clips");
const checked = (id: string, pattern: RegExp) => {
  if (!pattern.test(id)) throw new LearningError("書頁識別不正確。");
  return id.toLowerCase();
};
const pathFor = (type: "pages" | "batches", id: string) =>
  join(root(), type, checked(id, type === "batches" ? uuidPattern : clipIdPattern) + ".json");
const lockFor = (id: string) => join(root(), "locks", checked(id, clipIdPattern));
function locked<T>(id: string, fn: () => Promise<T>) {
  return withLearningWriteLock(fn, lockFor(id));
}
const hash = (data: Buffer | string) => createHash("sha256").update(data).digest("hex");
async function loadPage(id: string) {
  const p = await getJson<ClipPage>(pathFor("pages", id));
  if (!p) throw new LearningError("找不到這張閱讀截圖。", 404);
  return p;
}
async function loadBatch(id: string) {
  const b = await getJson<ClipBatch>(pathFor("batches", id));
  if (!b) throw new LearningError("找不到這批閱讀截圖。", 404);
  return b;
}
async function addPages(id: string, origin: ClipBatch["origin"], pages: ClipPage[]) {
  const file = pathFor("batches", id);
  return locked(id, async () => {
    const batch = (await getJson<ClipBatch>(file)) ?? {
      id,
      origin,
      createdAt: new Date().toISOString(),
      pages: [],
    };
    if (batch.origin !== origin) throw new LearningError("這批截圖的來源不同。", 409);
    for (const page of pages) {
      if (batch.pages.includes(page.id)) continue;
      await locked(page.id, async () => {
        const path = pathFor("pages", page.id);
        if (!(await getJson<ClipPage>(path))) await putJson(path, page);
      });
      batch.pages.push(page.id);
    }
    if (origin === "line") {
      const order = pages.map((p) => p.id);
      batch.pages = [...order, ...batch.pages.filter((id) => !order.includes(id))];
    }
    await putJson(file, batch);
    return batch;
  });
}
export async function receiveLinePages(entry: EnglishImageEntry) {
  const originals = entry.attachments.filter((a) => uuidPattern.test(a.blockId));
  if (!originals.length || originals.length !== entry.attachments.length)
    throw new LearningError("原圖仍在保存，請稍後再選一次。", 409);
  return addPages(
    entry.id,
    "line",
    originals.map((a) => ({
      id: a.blockId.toLowerCase(),
      name: a.filename,
      mime: a.mimeType,
      origin: "line",
      entryId: entry.id,
      createdAt: a.createdAt,
      revision: 0,
    })),
  );
}
export async function receiveWebPage(batchId: string, file: File) {
  checked(batchId, uuidPattern);
  if (!file.size || file.size > 20 * 1024 * 1024)
    throw new LearningError("每張截圖請選用 20 MB 以內的圖片。", 413);
  const bytes = Buffer.from(await file.arrayBuffer());
  const format = await sharp(bytes, { limitInputPixels: 60000000 })
    .metadata()
    .then((m) => m.format)
    .catch(() => undefined);
  const mime =
    format === "jpeg"
      ? "image/jpeg"
      : format === "png"
        ? "image/png"
        : format === "webp"
          ? "image/webp"
          : null;
  if (!mime) throw new LearningError("請選擇 PNG、JPEG 或 WebP 書頁截圖。", 415);
  const id = hash(bytes);
  await atomicFile(join(root(), "originals", id), bytes);
  return addPages(batchId, "web", [
    {
      id,
      origin: "web",
      name: file.name.slice(0, 140) || "閱讀截圖",
      mime,
      createdAt: new Date().toISOString(),
      revision: 0,
    },
  ]);
}
export async function clipOriginal(id: string) {
  const page = await loadPage(id);
  if (page.origin === "web")
    return { bytes: await readFile(join(root(), "originals", page.id)), mimeType: page.mime };
  return englishImageAttachmentBytes({
    id: page.id,
    blockId: page.id,
    filename: page.name,
    mimeType: page.mime,
    sourceMessageId: "",
    createdAt: page.createdAt,
    batchIndex: null,
  });
}
export async function clipBatch(id: string): Promise<ClipBatchDetail> {
  const b = await loadBatch(id);
  return { ...b, pages: await Promise.all(b.pages.map(loadPage)) };
}
export async function listClipBatches(): Promise<ClipListRow[]> {
  const ids = await jsonIds(join(root(), "batches"));
  const rows = await Promise.all(
    ids
      .filter((id) => uuidPattern.test(id))
      .map(async (id) => {
        const b = await clipBatch(id);
        return {
          id: b.id,
          origin: b.origin,
          createdAt: b.createdAt,
          total: b.pages.length,
          pending: b.pages.filter((p) => !p.saved && !Object.values(b.highlightNotes ?? {}).some(r => r.parts.some(k => k.startsWith(p.id + ":")))).length,
        };
      }),
  );
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export async function reviewClip(
  batchId: string,
  pageId: string,
  revision: unknown,
  input: unknown,
  confirm: boolean,
) {
  const batch = await loadBatch(batchId);
  if (!batch.pages.includes(pageId)) throw new LearningError("這張截圖不在這一組。", 404);
  let draft;
  try {
    draft = readClipDraft(input);
  } catch (e) {
    throw new LearningError((e as Error).message);
  }
  const data = draft;
  const receipt = await locked(pageId, async (): Promise<ClipReceipt | null> => {
    const page = await loadPage(pageId),
      file = pathFor("pages", pageId);
    if (page.saved) return page.saved;
    if (page.revision !== revision) throw new LearningError("這頁已在別處更新。請重新讀取後核對。", 409);
    if (page.savingBookId && data.bookId !== page.savingBookId)
      throw new LearningError("這頁已有送出的存檔，請先核對原本那一讀。", 409);
    if (!confirm) {
      if (page.savingBookId) throw new LearningError("這頁的存檔正在核對中。", 409);
      await putJson(file, { ...page, draft: data, revision: page.revision + 1 });
      return null;
    }
    if (!uuidPattern.test(data.bookId) || !data.excerpt)
      throw new LearningError("請選擇書名與讀次，並核對要保存的作者原文。");
    const book = (await listReadingBooks()).find((b) => b.id === data.bookId);
    if (!book) throw new LearningError("書架上找不到這一讀。", 404);
    const prior = (await listReadingNotes(book.id)).find(
      (n) => n.kind === "excerpt" && n.metadata.clipPageId === pageId,
    );
    let noteId = prior?.id;
    if (!noteId) {
      const text = serializeStructuredReadingNote({
        kind: "excerpt",
        text: data.excerpt,
        metadata: {
          source: "行光剪藏・閱讀截圖",
          sourceBookTitle: book.title,
          location: data.location,
          reflection: data.reflection,
          clipPageId: pageId,
          selectionLabel: data.label,
        },
      });
      await putJson(file, { ...page, savingBookId: book.id, draft: data });
      noteId = (
        await createPracticeOnce(
          hash("reading-clip:" + pageId),
          () => appendReadingNote(book.id, text),
          lockFor(pageId),
        )
      ).id;
    }
    const saved = { bookId: book.id, noteId };
    await putJson(file, {
      ...page,
      savingBookId: undefined,
      draft: data,
      saved,
      revision: page.revision + 1,
    });
    return saved;
  });
  if (receipt)
    await locked(batchId, async () => {
      const latest = await loadBatch(batchId);
      await putJson(pathFor("batches", batchId), { ...latest, lastBookId: receipt.bookId });
    });
  return clipBatch(batchId);
}

export async function chooseOrCreateClipBook(title: unknown, readCount: unknown) {
  if (
    typeof title !== "string" ||
    !title.trim() ||
    title.trim().length > 180 ||
    typeof readCount !== "number" ||
    !Number.isInteger(readCount) ||
    readCount < 1 ||
    readCount > 999
  )
    throw new LearningError("請填寫書名與有效的讀次。");
  const normalized = title.trim().replace(/\s+/g, " ").normalize("NFC");
  const key = hash(JSON.stringify(["book", normalized, readCount]));
  return locked(key, async () => {
    const existing = (await listReadingBooks()).filter(
      (b) => b.title.trim().replace(/\s+/g, " ").normalize("NFC") === normalized && b.readCount === readCount,
    );
    if (existing.length > 1) throw new LearningError("書架上有數筆同名且相同讀次的紀錄，請由清單選擇。", 409);
    if (existing.length) return existing[0].id;
    const created = await createPracticeOnce(
      key,
      () => createReadingBook({ title: normalized, readCount, status: "閱讀中", todayISO: taipeiTodayISO() }),
      lockFor(key),
    );
    return created.id;
  });
}

export async function confirmHighlights(batchId:string,bookId:string,input:unknown) {
  if(!uuidPattern.test(bookId)||!Array.isArray(input)||!input.length||input.length>300)
    throw new LearningError("請選擇書籍並核對畫線。");
  return locked(batchId,async()=>{
    const batch=await loadBatch(batchId);
    const book=(await listReadingBooks()).find(b=>b.id===bookId);
    if(!book)throw new LearningError("找不到這一讀。",404);
    const occupied=new Set<string>();
    const selections=input.map(item=>{
      if(!item||!Array.isArray(item.parts)||!item.parts.length||item.parts.length>300||!colors.includes(item.color)||
          typeof item.text!=="string"||!item.text.trim()||item.text.length>40000||
          typeof item.label!=="string"||item.label.length>120||/[\r\n]/.test(item.label))
        throw new LearningError("請核對每段原文、色筆和標題。");
      const parts:string[]=item.parts,ids:string[]=[];
      for(const key of parts){
        if(typeof key!=="string"||key.length>110)throw new LearningError("色筆位置不正確。");
        const [page,...box]=key.split(":");
        if(!batch.pages.includes(page)||box.length!==4||!box.every(v=>/^\d{1,5}$/.test(v))||occupied.has(key))throw new LearningError("選段來源不符或重疊。");
        occupied.add(key);if(!ids.includes(page))ids.push(page);
      }
      const identity=hash(JSON.stringify(["reading-highlight",bookId,parts]));
      return {identity,parts,ids,text:item.text.trim() as string,label:item.label.trim() as string,color:item.color as string};
    });
    const existing=await listReadingNotes(bookId);
    const receipts=batch.highlightNotes??={};
    for(const s of selections){
      if(receipts[s.identity])continue;
      const conflict=Object.values(receipts).some(r=>r.bookId===bookId && r.parts.some(k=>s.parts.includes(k)));
      if(conflict)throw new LearningError("部分畫線已存成其他選段，請回到原筆記核對。",409);
      const prior=existing.find(n=>n.metadata.highlightId===s.identity);
      const text=serializeStructuredReadingNote({kind:"excerpt",text:s.text,metadata:{
        source:"電子書色筆畫線",sourceBookTitle:book.title,highlightColor:s.color,highlightId:s.identity,
        clipSourceIds:s.ids,selectionLabel:s.label||s.text.slice(0,18),location:s.ids.map(id=>"圖 "+(batch.pages.indexOf(id)+1)).join("、"),
      }});
      const noteId=prior?.id??(await createPracticeOnce(s.identity,()=>appendReadingNote(bookId,text),lockFor(batchId))).id;
      receipts[s.identity]={bookId,noteId,parts:s.parts,label:s.label||s.text.slice(0,18)};
      batch.lastBookId=bookId;
      await putJson(pathFor("batches",batchId),batch);
    }
    return clipBatch(batchId);
  });
}
