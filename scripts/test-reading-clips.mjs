import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as next from "next/server.js";
import sharp from "sharp";
import { loader } from "./weaving-test-harness.mjs";

const directory = await mkdtemp(join(tmpdir(), "xinzhi-clips-"));
Object.assign(process.env, {
  LEARNING_WRITE_LOCK_DIR: directory,
  ACCESS_KEY: "clip-fixture",
  LINE_CHANNEL_SECRET: "fixture-line",
  LINE_ALLOWED_USER_ID: "reader",
  NEXT_PUBLIC_APP_URL: "https://dojo.example",
});
const now = new Date().toISOString();
const entries = new Map(),
  photos = new Map(),
  books = [],
  notes = new Map(),
  insights = [],
  replies = [],
  background = [];
const photo = await sharp({ create: { width: 8, height: 9, channels: 3, background: "white" } })
  .png()
  .toBuffer();
const core = loader();
const line = core("lib/dojo/lineClipping.ts"),
  { parseStoredReadingNote } = core("lib/reading/notes.ts");
let englishAnalysis = 0;
function attachment(params) {
  const blockId = randomUUID();
  photos.set(blockId, photo);
  return {
    blockId,
    id: blockId,
    sourceMessageId: params.sourceMessageId,
    filename: params.filename,
    mimeType: "image/png",
    createdAt: now,
    batchIndex: params.batchIndex ?? null,
  };
}
const store = {
  listEnglishImageEntries: async (options) =>
    [...entries.values()].filter((e) => !e.readingClip || options?.includeReadingClips),
  getEnglishImageEntry: async (id) => ({ entry: entries.get(id) }),
  createEnglishImageEntry: async (params) => {
    const image = attachment(params),
      id = randomUUID(),
      entry = {
        id,
        route: "pending",
        attachment: image,
        attachments: [image],
        lineImageSetId: params.lineImageSetId,
        capturedAt: now,
        title: "測試",
      };
    entries.set(id, entry);
    return entry;
  },
  appendEnglishImageAttachment: async (params) => {
    const e = params.entry;
    e.attachments.push(attachment(params));
    e.attachments.sort((a, b) => (a.batchIndex ?? 0) - (b.batchIndex ?? 0));
    return e;
  },
  saveEnglishImageEntry: async (entry) => {
    entries.set(entry.id, entry);
    return entry;
  },
  englishImageAttachmentBytes: async (image) => ({ mimeType: "image/png", bytes: photos.get(image.blockId) }),
};
const load = loader({
  "next/server": { ...next, after: (fn) => background.push(fn) },
  "@/lib/dojo/lineClipping": {
    ...line,
    fetchLineImage: async () => ({ mimeType: "image/png", bytes: photo }),
    replyLineMessage: async (_token, text, menu) => replies.push({ text, menu }),
  },
  "@/lib/dojo/wealthBank": { bankImageRoute: async () => ({ route: "ordinary" }) },
  "@/lib/dojo/captureStore": { listCaptureEntries: async () => [] },
  "@/lib/dojo/englishImageStore": store,
  "@/lib/dojo/englishImageAnalysis": {
    analyzeEnglishImage: async () => {
      englishAnalysis++;
    },
  },
  "@/lib/notion/queries": {
    listReadingBooks: async () => books,
    listReadingNotes: async (id) => notes.get(id) || [],
  },
  "@/lib/notion/mutations": {
    createReadingBook: async (data) => {
      const book = { id: randomUUID(), ...data };
      books.push(book);
      return book;
    },
    appendReadingNote: async (id, text) => {
      const note = { id: randomUUID(), ...parseStoredReadingNote(text) };
      notes.set(id, [...(notes.get(id) || []), note]);
      return note;
    },
    createInsightCard: async (data) => {
      const card = { id: randomUUID(), ...data };
      insights.push(card);
      return card;
    },
  },
});
const webhook = load("app/api/integrations/line/webhook/route.ts").POST;
const clips = load("app/api/dojo/reading/clips/route.ts"),
  original = load("app/api/dojo/reading/clips/original/route.ts").GET;
const cards = load("app/api/dojo/reading/manual-cards/route.ts");
const summary = load("lib/reading/discussionStore.ts").discussionSummary;
const root = "http://localhost";
function req(path, data, headers = {}) {
  return new next.NextRequest(root + path, {
    method: data === undefined ? "GET" : "POST",
    headers: {
      cookie: "dsc_access_key=clip-fixture",
      ...(data === undefined ? {} : { "content-type": "application/json" }),
      ...headers,
    },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
}
async function event(data, ok = true) {
  const raw = JSON.stringify({
    events: [{ source: { userId: "reader" }, webhookEventId: randomUUID(), replyToken: "fixture", ...data }],
  });
  const sig = createHmac("sha256", "fixture-line").update(raw).digest("base64");
  const res = await webhook(
    new next.NextRequest(root + "/api/integrations/line/webhook", {
      method: "POST",
      headers: { "x-line-signature": ok ? sig : "bad" },
      body: raw,
    }),
  );
  while (background.length) await background.shift()();
  return res.status;
}
async function success(response) {
  const data = await response.json();
  assert.equal(response.status, 200, JSON.stringify(data));
  return data;
}
const api = "/api/dojo/reading/clips",
  manual = "/api/dojo/reading/manual-cards";
const image = (id, index) => ({
  type: "message",
  message: { type: "image", id, imageSet: { id: "line-set", index, total: 2 } },
});
const post = async (data) => success(await clips.POST(req(api, data)));
try {
  assert.equal(await event(image("one", 1), false), 401);
  assert.equal((await clips.GET(req(api, undefined, { cookie: "" }))).status, 401);
  assert.equal(
    (
      await clips.POST(
        req(api, { action: "book", title: "測試", readCount: 1 }, { origin: "https://another.example" }),
      )
    ).status,
    403,
  );
  await event(image("two", 2));
  await event(image("one", 1));
  assert.equal(entries.size, 1);
  assert.equal(replies.length, 1);
  const actions = replies[0].menu.items.map((i) => i.action);
  const reading = actions.find((a) => a.label === "心知閱讀截圖");
  assert(actions.some((a) => a.label === "英文閱讀內容" && a.data.includes("route=reading")));
  const route = { type: "postback", postback: { data: reading.data } };
  await event(route);
  await event(route);
  await event(image("one", 1));
  assert.equal(englishAnalysis, 0);
  assert.equal(photos.size, 2);
  const link = new URL(replies.at(-1).menu.items[0].action.uri),
    batchId = link.searchParams.get("batch");
  assert.equal(link.pathname, "/reading/clips");
  assert.equal(link.origin, "https://dojo.example");
  const result = await success(await clips.GET(req(api + "?batch=" + batchId)));
  const [first, second] = result.batch.pages;
  assert.equal(result.batch.pages.length, 2);
  assert.match(first.name, /one/);
  assert.match(second.name, /two/);
  const fromPhoto = await original(req(api + "/original?id=" + first.id));
  assert.deepEqual(Buffer.from(await fromPhoto.arrayBuffer()), photo);
  assert.equal(
    (await original(req(api + "/original?id=" + first.id, undefined, { cookie: "" }))).status,
    401,
  );
  const { bookId } = await post({ action: "book", title: "測試書", readCount: 2 });
  assert.equal((await post({ action: "book", title: " 測試書 ", readCount: 2 })).bookId, bookId);
  assert.equal(books.length, 1);
  const draft = {
    bookId,
    excerpt: "閱讀是一種觀察。",
    reflection: "我想先留意生活裡的例子。",
    location: "第 24 頁",
    label: "閱讀與觀察",
    layout: "vertical",
  };
  const edit = { action: "draft", batchId, pageId: first.id, revision: 0, draft };
  await post(edit);
  assert.equal(notes.size, 0);
  assert.equal((await clips.POST(req(api, { ...edit, action: "confirm" }))).status, 409);
  const confirm = { ...edit, revision: 1, action: "confirm" },
    saved = await post(confirm);
  await post(confirm);
  const noteId = saved.batch.pages[0].saved.noteId;
  assert.equal(saved.batch.lastBookId, bookId);
  assert.equal(notes.get(bookId).length, 1);
  const note = notes.get(bookId)[0];
  assert.equal(note.text, draft.excerpt);
  assert.equal(note.metadata.reflection, draft.reflection);
  assert.equal(note.metadata.clipPageId, first.id);
  assert.equal(note.metadata.selectionLabel, draft.label);
  assert.equal((await success(await clips.GET(req(api)))).batches[0].pending, 1);
  const data = {
    bookId,
    noteId,
    id: randomUUID(),
    action: "create",
    type: "觀點",
    text: "我先觀察，再解釋。",
  };
  const viewpoint = (await success(await cards.POST(req(manual, data)))).card;
  assert.equal(viewpoint.quote, draft.excerpt);
  assert.equal(viewpoint.locator, "第 24 頁");
  assert.equal(viewpoint.share, false);
  await success(await cards.POST(req(manual, { ...data, action: "sharing", share: true })));
  const insight = {
    ...data,
    id: randomUUID(),
    type: "洞察卡",
    actionText: "記下一次觀察",
    actionType: "觀察型",
    nextVisitAt: "2026-12-01",
  };
  await success(await cards.POST(req(manual, insight)));
  await success(await cards.POST(req(manual, insight)));
  assert.equal(insights.length, 1);
  assert.equal(insights[0].sourceNoteId, noteId);
  assert.equal(insights[0].nextVisitISO, "2026-12-01");
  assert.equal((await success(await cards.GET(req(manual)))).cards.length, 2);
  assert.deepEqual(await summary(), { resume: null, pending: [] });
  const webId = randomUUID();
  async function upload(buffer, name) {
    const form = new FormData();
    form.set("file", new File([buffer], name));
    form.set("batchId", webId);
    return clips.POST(
      new next.NextRequest(root + api, {
        method: "POST",
        headers: { cookie: "dsc_access_key=clip-fixture" },
        body: form,
      }),
    );
  }
  assert.equal((await upload(Buffer.from("Not an image"), "wrong.jpg")).status, 415);
  await success(await upload(photo, "書頁.png"));
  await success(await upload(photo, "書頁.png"));
  const web = (await success(await clips.GET(req(api + "?batch=" + webId)))).batch;
  assert.equal(web.pages.length, 1);
  assert.deepEqual(
    Buffer.from(await (await original(req(api + "/original?id=" + web.pages[0].id))).arrayBuffer()),
    photo,
  );
  const selections=[
    {parts:[first.id+":1:2:3:4",second.id+":4:5:6:7"],color:"黃色",text:"跨圖原句。",label:"跨圖"},
    {parts:[second.id+":4:12:6:7"],color:"綠色",text:"另一段。",label:""},
  ];
  const payload={action:"highlights",batchId,bookId,selections};
  const response=await post(payload);
  assert.equal(Object.keys(response.batch.highlightNotes).length,2);
  await post(payload);
  const savedHighlights=notes.get(bookId).filter(n=>n.metadata.highlightId);
  assert.equal(savedHighlights.length,2);
  assert.deepEqual(savedHighlights[0].metadata.clipSourceIds,[first.id,second.id]);
  assert.equal(savedHighlights[1].metadata.highlightColor,"綠色");
  assert.equal((await clips.POST(req(api,{...payload,selections:[{...selections[0],parts:[selections[0].parts[0]]}]}))).status,409);
  assert.equal((await clips.POST(req(api,{...payload,selections:[{...selections[0],parts:["fake:1:2:3:4"]}]}))).status,400);
  console.log(
    "PASS signed LINE image set, classification and retries, protected original, drafts and concurrency, canonical note and read, manual cards, deduplicated album upload.",
  );
} finally {
  await rm(directory, { recursive: true, force: true });
}
