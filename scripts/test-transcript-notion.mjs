// A finished transcript is written into the capture's Notion record as clip.transcript; the queue keeps progress and timestamps.
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { join } from "node:path";
import * as next from "next/server.js";
import { fixture } from "./weaving-fixture.mjs";

const replies = [];
const background = [];
const f = await fixture({
  "next/server": { ...next, after: fn => background.push(fn) },
  "@/lib/dojo/lineClipping": () => ({
    ...f.load("lib/dojo/lineClipping.ts"),
    replyLineMessage: async (_token, text, quickReply) => replies.push({ text, quickReply }),
    pushLineMessage: async () => true,
  }),
});
Object.assign(process.env, { LINE_CHANNEL_SECRET: "formal-line-fixture", LINE_ALLOWED_USER_ID: "owner", NEXT_PUBLIC_APP_URL: "https://dojo.example" });
const quiet = console.error;

try {
  const line = f.load("app/api/integrations/line/webhook/route.ts");
  const own = f.load("app/api/dojo/douyin/route.ts");
  const worker = f.load("app/api/integrations/douyin/worker/[action]/route.ts");
  const captures = f.load("app/api/dojo/captures/route.ts");
  const store = f.load("lib/dojo/captureStore.ts");
  const { douyinQueue, DouyinQueue } = f.load("lib/dojo/douyin/queue.mjs");
  const sync = f.load("lib/dojo/douyin/transcriptSync.ts");
  const { transcriptReadingText, clipTranscript } = f.load("lib/dojo/douyin/transcriptText.ts");
  const settled = () => sync.syncPendingTranscripts();
  const transcriptOf = async id => (await store.getCaptureEntry(id)).capture.clip.transcript;
  const status = async id => (await own.GET(f.req("GET", "/api/dojo/douyin" + (id ? "?captureId=" + id : "")))).json();
  const endpoint = (action, data, token) => worker.POST(new next.NextRequest(
    "https://dojo.example/api/integrations/douyin/worker/" + action,
    { method: "POST", headers: { "content-type": "application/json", ...(token ? { authorization: "Bearer " + token } : {}) }, body: JSON.stringify(data) },
  ), { params: Promise.resolve({ action }) });
  let events = 0;
  async function send(text) {
    const event = { type: "message", webhookEventId: "evt-" + ++events, source: { type: "user", userId: "owner" },
      replyToken: "reply-" + events, message: { id: String(events), type: "text", text } };
    const bytes = JSON.stringify({ events: [event] });
    const signature = createHmac("sha256", "formal-line-fixture").update(bytes).digest("base64");
    assert.equal((await line.POST(new next.NextRequest("https://dojo.example/api/integrations/line/webhook", {
      method: "POST", headers: { "content-type": "application/json", "x-line-signature": signature }, body: bytes }))).status, 200);
    await background.shift()();
    return new URL(replies.at(-1).quickReply.items.find(i => i.action.label === "查看這筆素材").action.uri).searchParams.get("captureId");
  }

  // Paragraphs follow the timestamps: a new one after a 3-second pause, 40 seconds, or 240 characters.
  const segments = [
    { start: 0, end: 4, text: "先把陶土置中。" }, { start: 4, end: 8, text: "手要穩。" },
    { start: 12, end: 16, text: "接著慢慢拉高。" }, { start: 16, end: 20, text: "不要急。" },
    { start: 60, end: 64, text: "最後修整杯口。" },
  ];
  const text = segments.map(s => s.text).join("");
  const paragraphs = "先把陶土置中。手要穩。\n\n接著慢慢拉高。不要急。\n\n最後修整杯口。";
  assert.equal(transcriptReadingText({ text, segments }), paragraphs);
  assert.equal(transcriptReadingText({ text: "已有\n換行", segments }), "已有\n換行");

  // 抖音 share → Mac finishes → the capture's Notion record holds the transcript.
  const videoId = "7699761834606386323";
  const id = await send("https://www.douyin.com/video/" + videoId);
  const script = await (await own.POST(f.req("POST", "/api/dojo/douyin", { action: "install" }))).text();
  const ticket = JSON.parse(Buffer.from(script.match(/^BUNDLE = '([^']+)'/m)[1], "base64").toString()).ticket;
  const token = (await (await endpoint("pair", { ticket })).json()).token;
  let job = (await (await endpoint("claim", { ready: true }, token)).json()).job;
  const update = (action, data) => endpoint("update", { id: job.id, lease: job.lease, action, ...data }, token);
  await update("identify", { videoId, title: "陶藝示範" });
  assert.equal((await status(id)).job.synced, false);
  assert.equal(await transcriptOf(id), undefined);

  // Notion is down when the Mac reports: the report still succeeds, and the capture shows as not yet synced.
  const writeNotion = f.mutations.updateKnowledgeEntry;
  f.mutations.updateKnowledgeEntry = async () => { throw new Error("Notion 503"); };
  console.error = () => undefined;
  const before = Date.now();
  assert.equal((await update("finish", { videoId, text, segments })).status, 200);
  await settled();
  console.error = quiet;
  let shown = await status(id);
  assert.deepEqual([shown.job.status, shown.job.synced, shown.unsynced], ["done", false, 1]);
  assert.equal(await transcriptOf(id), undefined);
  await settled();
  assert.equal(await transcriptOf(id), undefined, "a failed write waits before the automatic retry");

  // The owner's "立即寫回 Notion" writes it once Notion is back.
  f.mutations.updateKnowledgeEntry = writeNotion;
  const pressed = await (await own.POST(f.req("POST", "/api/dojo/douyin", { action: "syncTranscripts", captureId: id }))).json();
  assert.deepEqual([pressed.synced, pressed.failed, pressed.remaining, pressed.job.synced], [1, 0, 0, true]);
  const stored = await transcriptOf(id);
  assert.equal(stored.text, paragraphs);
  assert.equal(stored.truncated, false);
  assert.ok(Date.parse(stored.finishedAt) >= before && Date.parse(stored.finishedAt) <= Date.now());
  assert.equal(stored.finishedAt, pressed.job.finishedAt);
  assert.equal((await status(id)).job.segments.length, 5, "timestamps stay in the queue");
  assert.equal("segments" in stored, false);
  // Syncing again changes nothing in Notion.
  const writes = f.writes();
  await own.POST(f.req("POST", "/api/dojo/douyin", { action: "syncTranscripts" }));
  assert.equal(f.writes(), writes);

  // A second capture of the same video gets the transcript in its own record.
  const second = (await (await captures.POST(f.req("POST", "/api/dojo/captures", { title: "同一支影片", sourceUrl: "https://www.douyin.com/video/" + videoId }))).json()).capture.id;
  shown = await (await own.POST(f.req("POST", "/api/dojo/douyin", { action: "retry", captureId: second }))).json();
  assert.deepEqual([shown.job.status, shown.job.synced, shown.unsynced], ["done", false, 1]);
  await status(second);
  await settled();
  assert.equal((await transcriptOf(second)).text, paragraphs);
  assert.equal((await status(second)).job.synced, true);
  // Sharing the link again in LINE reuses the capture and leaves nothing pending.
  assert.equal(await send("https://www.douyin.com/video/" + videoId), id);
  assert.equal((await status()).unsynced, 0);

  // A transcript that finishes again (retry after replacement) is written again, to every merged capture.
  const queue = douyinQueue();
  queue.run("UPDATE job SET status='failed' WHERE id=?", id);
  await own.POST(f.req("POST", "/api/dojo/douyin", { action: "retry", captureId: id }));
  job = (await (await endpoint("claim", { ready: true }, token)).json()).job;
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal((await update("finish", { videoId, text: "新的逐字稿。", segments: [{ start: 0, end: 2, text: "新的逐字稿。" }] })).status, 200);
  await settled();
  assert.deepEqual([(await transcriptOf(id)).text, (await transcriptOf(second)).text], ["新的逐字稿。", "新的逐字稿。"]);
  assert.notEqual((await transcriptOf(id)).finishedAt, stored.finishedAt);

  // The capture's other fields survive, and a capture edit keeps the transcript.
  const edited = await store.updateCaptureEntry(id, () => ({ note: "我的筆記" }));
  assert.equal(edited.clip.transcript.text, "新的逐字稿。");

  // Long transcripts: cut at a paragraph so the whole record fits Notion's 200,000 characters, and marked.
  const { capture } = await store.getCaptureEntry(id);
  const long = Array.from({ length: 3000 }, (_, i) => `第 ${i} 段。` + "字".repeat(60)).join("\n\n");
  const fitted = sync.transcriptForCapture(capture, { text: long, segments: [], finishedAt: stored.finishedAt });
  assert.equal(fitted.truncated, true);
  assert.ok(fitted.text.length <= 100000 && fitted.text.length > 90000);
  assert.ok(long.startsWith(fitted.text) && long[fitted.text.length] === "\n", "cut between paragraphs");
  const { captureContent } = f.load("lib/dojo/formal.ts");
  const crowded = { ...capture, excerpt: "摘".repeat(12000), clip: { ...capture.clip, threadsPost: { text: "文".repeat(12000), canonicalUrl: "", partial: false } } };
  const squeezed = sync.transcriptForCapture(crowded, { text: "行\n".repeat(60000), segments: [], finishedAt: stored.finishedAt });
  assert.ok(JSON.stringify(captureContent({ ...crowded, clip: { ...crowded.clip, transcript: squeezed } })).length <= 190000);
  assert.equal(squeezed.truncated, true);
  assert.deepEqual(clipTranscript("短", 10), { text: "短", truncated: false });

  // Backfill: transcripts finished before these columns existed are pending, and are written by the same sweep.
  const { DatabaseSync } = await import("node:sqlite");
  const legacyFile = join(f.dir, "legacy.sqlite");
  const legacy = new DatabaseSync(legacyFile);
  legacy.exec(`CREATE TABLE job(id TEXT PRIMARY KEY, url TEXT NOT NULL, share TEXT NOT NULL, title TEXT NOT NULL,
    video TEXT, status TEXT NOT NULL DEFAULT 'queued', phase TEXT NOT NULL DEFAULT '', error TEXT NOT NULL DEFAULT '',
    text TEXT NOT NULL DEFAULT '', segments TEXT NOT NULL DEFAULT '[]', attempt INTEGER NOT NULL DEFAULT 1, lease TEXT,
    expires INTEGER, created INTEGER NOT NULL, target TEXT REFERENCES job(id));
    CREATE TABLE machine(singleton INTEGER PRIMARY KEY CHECK(singleton=1), ticket TEXT, ticket_expires INTEGER,
    token TEXT, seen INTEGER NOT NULL DEFAULT 0, ready INTEGER NOT NULL DEFAULT 0);
    INSERT INTO machine(singleton) VALUES(1);
    INSERT INTO job(id,url,share,title,video,status,text,created) VALUES('done1','u1','','舊作品','1','done','舊逐字稿',1700000000000);
    INSERT INTO job(id,url,share,title,video,status,created,target) VALUES('alias1','u2','','',NULL,'queued',1700000001000,'done1');
    INSERT INTO job(id,url,share,title,video,status,created) VALUES('waiting','u3','','',NULL,'queued',1700000002000);`);
  legacy.close();
  const clock = { now: 1_800_000_000_000 };
  const migrated = new DouyinQueue(legacyFile, () => clock.now);
  assert.equal(migrated.unsynced(), 2);
  assert.equal(migrated.view("done1").finishedAt, new Date(1700000000000).toISOString(), "an old job reports when it was queued");
  assert.deepEqual(migrated.pendingSync(5), ["done1", "alias1"]);
  // A failed write waits 5 minutes, then doubles; the owner's button skips the wait.
  migrated.syncFailed("done1");
  migrated.markSynced("alias1", migrated.view("alias1").finishedAt);
  assert.deepEqual(migrated.pendingSync(5), []);
  clock.now += 9 * 60_000;
  assert.deepEqual(migrated.pendingSync(5), []);
  assert.deepEqual(migrated.pendingSync(5, true), ["done1"]);
  clock.now += 10 * 60_000 + 1;
  assert.deepEqual(migrated.pendingSync(5), ["done1"]);
  migrated.markSynced("done1", new Date(1).toISOString());
  assert.equal(migrated.unsynced(), 1, "a stale write does not mark a newer transcript as synced");
  migrated.db.close();

  console.log("PASS transcript written to Notion with paragraphs, failure and retry, merged captures, re-finish, size limit, and backfill");
} finally {
  console.error = quiet;
  await f.close();
}
