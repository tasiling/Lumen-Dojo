import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import * as next from "next/server.js";
import { fixture } from "./weaving-fixture.mjs";

const replies = [];
const pushes = [];
const background = [];
const f = await fixture({
  "next/server": { ...next, after: fn => background.push(fn) },
  "@/lib/dojo/lineClipping": () => ({
    ...f.load("lib/dojo/lineClipping.ts"),
    replyLineMessage: async (_token, text, quickReply) => replies.push({ text, quickReply }),
    pushLineMessage: async (text, quickReply) => { pushes.push({ text, quickReply }); return true; },
  }),
});
Object.assign(process.env, {
  LINE_CHANNEL_SECRET: "formal-line-fixture",
  LINE_ALLOWED_USER_ID: "owner",
  NEXT_PUBLIC_APP_URL: "https://dojo.example",
});

try {
  const line = f.load("app/api/integrations/line/webhook/route.ts");
  const own = f.load("app/api/dojo/douyin/route.ts");
  const worker = f.load("app/api/integrations/douyin/worker/[action]/route.ts");
  const captureRoute = f.load("app/api/dojo/captures/route.ts");
  const captureStore = f.load("lib/dojo/captureStore.ts");
  const { douyinQueue, DouyinQueue } = f.load("lib/dojo/douyin/queue.mjs");
  const { InputError, readShare } = f.load("lib/dojo/douyin/share.mjs");
  const base = "/api/dojo/douyin";
  const videoId = "7699761834606386323";
  const short = "https://v.douyin.com/TestPublicVideo/";
  const raw = "8.71 复制打开抖音，看看【示範作者的作品】 青銅器展 " + short + " 8am F@X";
  const durable = douyinQueue();
  const endpoint = (action, data, token) => worker.POST(new next.NextRequest(
    "https://dojo.example/api/integrations/douyin/worker/" + action,
    {
      method: "POST", headers: { "content-type": "application/json", ...(token ? { authorization: "Bearer " + token } : {}) },
      body: JSON.stringify(data),
    }
  ), { params: Promise.resolve({ action }) });
  async function send(message, number) {
    const event = { type: "message", webhookEventId: "evt-" + number, source: { type: "user", userId: "owner" },
      replyToken: "reply-" + number, message: { id: String(number), type: "text", text: message } };
    const bytes = JSON.stringify({ events: [event] });
    const signature = createHmac("sha256", "formal-line-fixture").update(bytes).digest("base64");
    const req = new next.NextRequest("https://dojo.example/api/integrations/line/webhook", {
      method: "POST", headers: { "content-type": "application/json", "x-line-signature": signature }, body: bytes,
    });
    assert.equal((await line.POST(req)).status, 200);
    await background.shift()();
    return replies.at(-1);
  }

  assert.equal((await own.GET(f.req("GET", base, null, false))).status, 401);
  assert.equal((await endpoint("claim", { ready: true })).status, 401);
  const first = await send(raw, 1);
  assert.match(first.text, /等待 Mac 轉錄：Mac 尚未配對/);
  const href = new URL(first.quickReply.items.find(item => item.action.label === "查看這筆素材").action.uri);
  assert.equal(href.origin, "https://dojo.example");
  const id = href.searchParams.get("captureId");
  assert.equal(f.records.size, 1);
  assert.equal((await captureStore.getCaptureEntry(id)).capture.forageReason, "");
  let shown = await (await own.GET(f.req("GET", base + "?captureId=" + id))).json();
  assert.equal(shown.connection, "unpaired");
  assert.equal(shown.job.share, raw);
  assert.equal(shown.job.status, "queued");
  assert.equal(new DouyinQueue(durable.db.location()).view(id).status, "queued");

  const download = await own.POST(f.req("POST", base, { action: "install" }));
  assert.equal(download.status, 200);
  assert.match(download.headers.get("content-disposition"), /YeCai-Connect-Mac-Production\.command/);
  const script = await download.text();
  const bundle = JSON.parse(Buffer.from(script.match(/^BUNDLE = '([^']+)'/m)[1], "base64").toString());
  const token = (await (await endpoint("pair", { ticket: bundle.ticket })).json()).token;
  assert.match(token, /^[\w-]{43}$/);
  assert.equal((await endpoint("pair", { ticket: bundle.ticket })).status, 403);
  assert.equal((await (await endpoint("claim", { ready: false }, token)).json()).job, null);
  assert.equal((await (await own.GET(f.req("GET", base))).json()).connection, "waiting");

  const job = (await (await endpoint("claim", { ready: true }, token)).json()).job;
  assert.equal(job.id, id);
  assert.equal(job.url, short);
  const update = (action, data) => endpoint("update", { id, lease: job.lease, action, ...data }, token);
  assert.equal((await update("identify", { videoId, title: "青銅器展" })).status, 200);
  assert.equal((await update("finish", { videoId: "11000000000" })).status, 422);
  assert.equal((await update("fail", { phase: "download", message: "播放來源回傳 HTTP 403。" })).status, 200);
  assert.equal(pushes.length, 1);
  assert.match(pushes[0].text, /^轉錄未完成｜抖音\n「青銅器展」\n停在：取得影片\n原因：播放來源回傳 HTTP 403。/);
  shown = await (await own.GET(f.req("GET", base + "?captureId=" + id))).json();
  assert.equal(shown.job.status, "failed");
  assert.match(shown.job.error, /403/);

  const retry = await own.POST(f.req("POST", base, { action: "retry", captureId: id }));
  assert.equal((await retry.json()).job.status, "queued");
  assert.equal((await update("heartbeat", { phase: "transcribe" })).status, 409);
  const nextJob = (await (await endpoint("claim", { ready: true }, token)).json()).job;
  assert.equal(nextJob.id, id);
  assert.equal(nextJob.attempt, 2);
  const text = "這一段是青銅器展的逐字稿。";
  assert.equal((await endpoint("update", { id, lease: nextJob.lease, action: "finish", videoId, text,
    segments: [{ start: 0, end: 5.4, text }] }, token)).status, 200);
  assert.equal(pushes.length, 2);
  assert.match(pushes[1].text, /^轉錄完成｜抖音\n「青銅器展」/);
  assert.equal(new URL(pushes[1].quickReply.items.find(i => i.action.label === "查看這筆素材").action.uri).searchParams.get("captureId"), id);
  const again = await send("https://www.douyin.com/video/" + videoId + "\n筆記：這段可做展覽參考。", 2);
  assert.match(again.text, /已有逐字稿/);
  assert.equal(new URL(again.quickReply.items.find(i => i.action.label === "查看這筆素材").action.uri).searchParams.get("captureId"), id);
  assert.equal(f.records.size, 1);
  const { capture } = await captureStore.getCaptureEntry(id);
  assert.equal(capture.forageReason, "這段可做展覽參考。");
  assert.equal(capture.note, "");
  await send("https://www.douyin.com/video/" + videoId + "\n筆記：這段可做展覽參考。", 2);
  assert.equal((await captureStore.getCaptureEntry(id)).capture.forageReason, "這段可做展覽參考。");
  shown = await (await own.GET(f.req("GET", base + "?captureId=" + id))).json();
  assert.deepEqual([shown.job.text, shown.job.segments[0].end, shown.job.share], [text, 5.4, raw]);

  const clock = { now: 1000 };
  const isolated = new DouyinQueue(":memory:", () => clock.now);
  const session = isolated.pair(isolated.issue());
  isolated.enqueue("a", readShare(short));
  const stale = isolated.claim(session, true);
  clock.now += 120001;
  assert.equal(isolated.view("a").status, "queued");
  const fresh = isolated.claim(session, true);
  assert.notEqual(fresh.lease, stale.lease);
  assert.throws(() => isolated.update(session, { id: "a", lease: stale.lease, action: "heartbeat", phase: "audio" }), InputError);

  assert.equal((await captureRoute.DELETE(f.req("DELETE", "/api/dojo/captures?id=" + id))).status, 200);
  assert.equal((await (await own.GET(f.req("GET", base + "?captureId=" + id))).json()).job, null);
  const recollected = await send(raw, 3);
  assert.notEqual(new URL(recollected.quickReply.items.find(i => i.action.label === "查看這筆素材").action.uri).searchParams.get("captureId"), id);
  console.log("PASS signed LINE share, original Notion card, durable Mac queue, leases, transcript, dedup, and deletion");
} finally {
  await f.close();
}
