// Media files on the Mac: the Mac offers a file by hash, the owner picks a capture in LINE or on the capture
// page, the Mac transcribes it and only the transcript is stored. No media reaches this site.
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import * as next from "next/server.js";
import { fixture } from "./weaving-fixture.mjs";

const pushes = [];
const replies = [];
const background = [];
let lineUp = true;
const f = await fixture({
  "next/server": { ...next, after: fn => background.push(fn) },
  "@/lib/dojo/lineClipping": () => ({
    ...f.load("lib/dojo/lineClipping.ts"),
    replyLineMessage: async (_token, text, quickReply) => replies.push({ text, quickReply }),
    pushLineMessage: async (text, quickReply) => {
      if (!lineUp) throw new Error("LINE 推播失敗（500）");
      pushes.push({ text, quickReply });
      return true;
    },
  }),
});
Object.assign(process.env, { LINE_CHANNEL_SECRET: "formal-line-fixture", LINE_ALLOWED_USER_ID: "owner", NEXT_PUBLIC_APP_URL: "https://dojo.example" });
const settle = () => new Promise(resolve => setTimeout(resolve, 20));

try {
  const line = f.load("app/api/integrations/line/webhook/route.ts");
  const own = f.load("app/api/dojo/douyin/route.ts");
  const worker = f.load("app/api/integrations/douyin/worker/[action]/route.ts");
  const captures = f.load("app/api/dojo/captures/route.ts");
  const proxy = f.load("proxy.ts").default;
  const { douyinStatusLine } = f.load("lib/dojo/douyin/lineStatus.ts");
  const { douyinQueue, DouyinQueue } = f.load("lib/dojo/douyin/queue.mjs");

  const endpoint = (action, data, token) => worker.POST(new next.NextRequest(
    "https://dojo.example/api/integrations/douyin/worker/" + action,
    { method: "POST", headers: { "content-type": "application/json", ...(token ? { authorization: "Bearer " + token } : {}) }, body: JSON.stringify(data) },
  ), { params: Promise.resolve({ action }) });
  let events = 0;
  async function postback(data) {
    const event = { type: "postback", webhookEventId: "evt-" + ++events, source: { type: "user", userId: "owner" }, replyToken: "reply-" + events, postback: { data } };
    const bytes = JSON.stringify({ events: [event] });
    const signature = createHmac("sha256", "formal-line-fixture").update(bytes).digest("base64");
    assert.equal((await line.POST(new next.NextRequest("https://dojo.example/api/integrations/line/webhook", {
      method: "POST", headers: { "content-type": "application/json", "x-line-signature": signature }, body: bytes,
    }))).status, 200);
    await background.shift()();
    return replies.at(-1);
  }
  const status = async id => (await own.GET(f.req("GET", "/api/dojo/douyin" + (id ? "?captureId=" + id : "")))).json();
  const item = (message, label) => message.quickReply.items.find(i => i.action.label === label)?.action;

  // The Mac's offer route is reached with its bearer token; the removed upload and file routes stay closed.
  const passes = path => proxy(new next.NextRequest("https://dojo.example" + path, { method: "POST" })).headers.get("x-middleware-next") === "1";
  assert.ok(passes("/api/integrations/douyin/worker/offer"));
  assert.ok(!passes("/api/integrations/douyin/worker/file"));
  assert.ok(!existsSync("app/api/dojo/douyin/upload"), "no media upload endpoint");

  const older = (await (await captures.POST(f.req("POST", "/api/dojo/captures", { title: "較早的素材", sourceUrl: "https://example.com/a" }))).json()).capture.id;
  await settle();
  const threads = (await (await captures.POST(f.req("POST", "/api/dojo/captures", {
    title: "Threads 上的陶藝示範", sourceUrl: "https://www.threads.com/@potter/post/ABC123", clip: { platform: "Threads" },
  }))).json()).capture.id;
  assert.equal((await own.POST(f.req("POST", "/api/dojo/douyin", { action: "retry", captureId: threads }))).status, 422);

  const script = await (await own.POST(f.req("POST", "/api/dojo/douyin", { action: "install" }))).text();
  const bundle = JSON.parse(Buffer.from(script.match(/^BUNDLE = '([^']+)'/m)[1], "base64").toString());
  assert.match(bundle.files["worker.py"], /行光轉錄/);
  const token = (await (await endpoint("pair", { ticket: bundle.ticket })).json()).token;
  const queue = douyinQueue();

  // Offer: validated, authenticated, and asked about in LINE exactly once.
  const fileA = "a".repeat(64), fileB = "b".repeat(64), fileC = "c".repeat(64);
  const offer = (file, name = "IG 陶藝.MOV", size = 52_428_800) => endpoint("offer", { file, name, size }, token);
  assert.equal((await endpoint("offer", { file: fileA, name: "x.mov", size: 1 })).status, 401);
  assert.equal((await endpoint("offer", { file: "not-a-hash", name: "x.mov", size: 1 }, token)).status, 400);
  assert.equal((await offer(fileA, "", 1)).status, 400);
  assert.deepEqual(await (await offer(fileA)).json(), { state: "waiting" });
  await settle();
  assert.equal(pushes.length, 1);
  assert.match(pushes[0].text, /^Mac 收到新檔案｜待轉錄\n「IG 陶藝\.MOV」\n要把逐字稿掛到哪一筆素材？\n最近一筆：「Threads 上的陶藝示範」/);
  const attach = new URLSearchParams(item(pushes[0], "掛到最近一筆").data);
  assert.deepEqual([attach.get("action"), attach.get("file"), attach.get("captureId")], ["fileAttach", fileA, threads]);
  assert.equal(new URLSearchParams(item(pushes[0], "另外新增一筆").data).get("action"), "fileNew");
  await offer(fileA);
  await settle();
  assert.equal(pushes.length, 1, "the Mac repeats its offer every loop; the owner is asked once");
  let shown = await status(threads);
  assert.deepEqual(shown.offers, [{ file: fileA, name: "IG 陶藝.MOV", size: 52_428_800 }]);
  assert.equal(shown.job, null);

  // A question LINE could not deliver is not marked as asked.
  lineUp = false;
  await offer(fileB, "podcast.m4a", 1000);
  await settle();
  lineUp = true;
  assert.equal(queue.get("SELECT asked FROM offer WHERE hash=?", fileB).asked, 0);
  assert.equal(queue.get("SELECT asked FROM offer WHERE hash=?", fileA).asked, 1);

  // "掛到最近一筆": the file is queued for that capture; the answer cannot be used twice.
  let reply = await postback(item(pushes[0], "掛到最近一筆").data);
  assert.match(reply.text, /^已排入轉錄｜Threads\n「Threads 上的陶藝示範」\n檔案：IG 陶藝\.MOV\n等待 Mac 轉錄：/);
  assert.equal(new URL(item(reply, "查看這筆素材").uri).searchParams.get("captureId"), threads);
  assert.match((await postback(item(pushes[0], "掛到最近一筆").data)).text, /已經指定過/);
  assert.match((await postback(item(pushes[0], "另外新增一筆").data)).text, /已經指定過/);
  assert.equal(f.records.size, 2, "a repeated answer never creates an empty capture");
  shown = await status(threads);
  assert.deepEqual([shown.job.kind, shown.job.source, shown.job.status, shown.job.title], ["file", "Threads", "queued", "Threads 上的陶藝示範"]);
  assert.deepEqual(shown.offers.map(o => o.file), [fileB]);
  assert.deepEqual(await (await offer(fileA)).json(), { state: "assigned", captureId: threads });

  // A worker installed before file transcription existed is never handed a file job.
  assert.equal((await (await endpoint("claim", { ready: true }, token)).json()).job, null);
  assert.deepEqual(queue.mac(), { files: false, inbox: "" });
  assert.match(douyinStatusLine(queue.view(threads), queue.connection(), queue.mac().files), /連線程式是舊版/);

  let job = (await (await endpoint("claim", { ready: true, files: true, inbox: "ok" }, token)).json()).job;
  assert.deepEqual([job.id, job.kind, job.video], [threads, "file", "file:" + fileA]);
  assert.deepEqual((await status()).mac, { files: true, inbox: "ok" });
  assert.equal(queue.view(threads).phase, "audio");
  const update = (action, data, id = threads) => endpoint("update", { id, lease: job.lease, action, ...data }, token);
  assert.equal((await update("identify", { videoId: "7699761834606386323", title: "x" })).status, 422);
  assert.equal((await update("fail", { phase: "audio", message: "FFmpeg 無法解開其中的音軌。" })).status, 200);
  assert.equal(pushes.at(-1).text, "轉錄未完成｜Threads\n「Threads 上的陶藝示範」\n停在：讀取音軌\n原因：FFmpeg 無法解開其中的音軌。\n原檔仍在 Mac 的 iCloud 資料夾，可在素材內重試。");
  assert.deepEqual(await (await offer(fileA)).json(), { state: "assigned", captureId: threads }, "a failed file stays in the inbox");

  // Retry from the capture page, then finish: only the transcript is stored and the Mac is told to archive.
  assert.equal((await (await own.POST(f.req("POST", "/api/dojo/douyin", { action: "retry", captureId: threads }))).json()).job.status, "queued");
  job = (await (await endpoint("claim", { ready: true, files: true, inbox: "ok" }, token)).json()).job;
  assert.equal(job.attempt, 2);
  const text = "先把陶土置中，再慢慢拉高。";
  assert.equal((await update("finish", { videoId: "file:" + fileB, text, segments: [{ start: 0, end: 3, text }] })).status, 422);
  assert.equal((await update("finish", { videoId: job.video, text, segments: [{ start: 0, end: 3, text }] })).status, 200);
  assert.match(pushes.at(-1).text, /^轉錄完成｜Threads\n「Threads 上的陶藝示範」/);
  assert.deepEqual(await (await offer(fileA)).json(), { state: "done", captureId: threads });
  // The transcript of a file is written to the capture's Notion record like any other.
  await f.load("lib/dojo/douyin/transcriptSync.ts").syncPendingTranscripts();
  assert.equal((await f.load("lib/dojo/captureStore.ts").getCaptureEntry(threads)).capture.clip.transcript.text, text);
  assert.equal((await status(threads)).job.text, text);

  // "另外新增一筆": a capture named after the file is created and queued.
  await offer(fileC, "散步錄音.m4a", 2048);
  await settle();
  reply = await postback(item(pushes.at(-1), "另外新增一筆").data);
  assert.match(reply.text, /^已新增素材並排入轉錄｜影片檔\n「散步錄音」\n檔案：散步錄音\.m4a/);
  const created = new URL(item(reply, "查看這筆素材").uri).searchParams.get("captureId");
  assert.equal(f.records.size, 3);
  assert.deepEqual([queue.view(created).kind, queue.view(created).source, queue.view(created).title], ["file", "影片檔", "散步錄音"]);

  // From the capture page: attach a waiting file to any capture; a busy capture refuses, a finished one is replaced.
  assert.equal((await own.POST(f.req("POST", "/api/dojo/douyin", { action: "attach", captureId: created, file: fileB }))).status, 409);
  assert.equal((await own.POST(f.req("POST", "/api/dojo/douyin", { action: "attach", captureId: older, file: "d".repeat(64) }))).status, 410);
  assert.equal((await own.POST(f.req("POST", "/api/dojo/douyin", { action: "attach", captureId: older, file: fileB }, false))).status, 401);
  shown = await (await own.POST(f.req("POST", "/api/dojo/douyin", { action: "attach", captureId: threads, file: fileB }))).json();
  assert.deepEqual([shown.job.status, shown.job.text, shown.job.kind], ["queued", "", "file"]);
  assert.deepEqual(shown.offers, []);
  // The replaced file is no longer tied to a capture, so the Mac's next offer asks about it again.
  assert.deepEqual(await (await offer(fileA)).json(), { state: "waiting" });

  // An offer the Mac stops repeating (file moved or deleted) disappears from the capture page.
  const clock = { now: 1_000_000 };
  const isolated = new DouyinQueue(":memory:", () => clock.now);
  const session = isolated.pair(isolated.issue());
  assert.deepEqual(isolated.offer(session, { file: fileA, name: "a.mov", size: 5 }), { state: "waiting", ask: true });
  assert.equal(isolated.offer(session, { file: fileA, name: "a.mov", size: 5 }).ask, false);
  clock.now += 10 * 60_000 + 1;
  assert.deepEqual(isolated.offers(), []);
  assert.equal(isolated.offer(session, { file: fileA, name: "a.mov", size: 5 }).ask, true, "an undelivered question is retried after ten minutes");
  isolated.asked(fileA);
  clock.now += 10 * 60_000 + 1;
  assert.equal(isolated.offer(session, { file: fileA, name: "a.mov", size: 5 }).ask, false);
  isolated.claim(session, true, { files: true, inbox: "unreadable" });
  assert.equal(isolated.mac().inbox, "unreadable");

  // Deleting a capture removes its job; nothing was ever stored on the volume besides the queue database.
  assert.equal((await captures.DELETE(f.req("DELETE", "/api/dojo/captures?id=" + threads))).status, 200);
  assert.equal(queue.view(threads), null);
  assert.deepEqual(readdirSync(join(f.dir, "yecai-douyin")).filter(name => !name.startsWith("work.sqlite")), []);

  // Existing production rows (written before these columns) keep working as 抖音 jobs.
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
    INSERT INTO job(id,url,share,title,video,status,created) VALUES('old','https://v.douyin.com/abc/','','舊作品',NULL,'queued',1);`);
  legacy.close();
  const migrated = new DouyinQueue(legacyFile);
  assert.deepEqual([migrated.view("old").kind, migrated.view("old").source, migrated.mac().files], ["douyin", "抖音", false]);
  const paired = migrated.pair(migrated.issue());
  assert.deepEqual((({ url, kind }) => [url, kind])(migrated.claim(paired, true)), ["https://v.douyin.com/abc/", "douyin"]);
  migrated.db.close();

  console.log("PASS Mac file offers, LINE question and answers, capture-page attach, old-worker gating, notices, retry, archive signal, and migration");
} finally {
  await f.close();
}
