import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import * as next from "next/server.js";
import { fixture } from "./weaving-fixture.mjs";

const background = [], replies = [], entries = new Map();
let batch = null, failSave = false, failAnalysis = false, lock = Promise.resolve(), sequence = 0;
Object.assign(process.env, { LINE_CHANNEL_SECRET: "fixture", LINE_ALLOWED_USER_ID: "owner", LINE_CHANNEL_ACCESS_TOKEN: "fixture-token" });
const originalFetch = global.fetch;
const f = await fixture({
  "next/server": { ...next, after: fn => background.push(fn) },
  "@/lib/dojo/wealthBank": { bankImageRoute: async () => ({ route: "ordinary" }) },
  "@/lib/dojo/captureStore": { listCaptureEntries: async () => [] },
  "@/lib/dojo/lineImageBatch": {
    readLineImageBatch: async () => batch && batch.expiresAt > Date.now() ? structuredClone(batch) : null,
    setLineImageBatch: async (_user, value) => {
      if (failSave) { failSave = false; throw Error("fixture lost batch pointer write"); }
      batch = structuredClone(value);
    },
    withLineImageBatchLock: (_user, work) => {
      const task = lock.then(work); lock = task.catch(() => {}); return task;
    },
  },
  "@/lib/dojo/englishImageAutoUnit": { autoBuildContextUnit: async () => { throw Error("fixture has no context room"); } },
  "@/lib/dojo/englishImageAnalysis": {
    analyzeEnglishImage: async id => {
      if (failAnalysis) throw Error("fixture analysis timed out");
      return { ...entries.get(id), analysisStatus: "needs-review" };
    },
  },
  "@/lib/dojo/englishImageStore": {
    routeEnglishImage: async (entry, route) => {
      Object.assign(entry, { route, lineBatchState: "closed" }); return entry;
    },
    listEnglishImageEntries: async () => [...entries.values()].filter(e => !e.mergedIntoId).reverse(),
    getEnglishImageEntry: async id => ({ entry: entries.get(id) }),
    createEnglishImageEntry: async p => {
      const id = "image-" + p.sourceMessageId;
      const entry = { ...p, id, title: id, route: "pending", capturedAt: new Date().toISOString(), externalMessageId: p.sourceMessageId,
        attachments: [{ sourceMessageId: p.sourceMessageId, blockId: "block-" + p.sourceMessageId }] };
      entries.set(id, entry); return entry;
    },
    appendEnglishImageAttachment: async p => {
      const entry = entries.get(p.entry.id);
      entry.attachments.push({ sourceMessageId: p.sourceMessageId, blockId: "block-" + p.sourceMessageId });
      return entry;
    },
    updateEnglishImageEntry: async (id, update) => {
      const entry = entries.get(id); Object.assign(entry, await update(entry)); return entry;
    },
  },
  "@/lib/dojo/lineClipping": () => ({ ...f.load("lib/dojo/lineClipping.ts"),
    fetchLineImage: async () => ({ bytes: new ArrayBuffer(2), mimeType: "image/jpeg" }),
    replyLineMessage: async (token, text, quickReply, imageEvent) => {
      if (token === "broken") { const error = Error("expired"); error.name = "LineReplyDeliveryError"; throw error; }
      replies.push({ token, text, quickReply, imageEvent });
    },
  }),
});
const event = data => ({ webhookEventId: "event-" + ++sequence, source: { type: "user", userId: "owner" }, replyToken: "ok", ...data });
const postback = data => event({ type: "postback", postback: { data } });
const photo = (id, imageSet) => event({ type: "message", message: { type: "image", id, imageSet } });
const recent = () => event({ type: "message", message: { type: "text", text: "最近一筆", id: "text-" + sequence } });
async function send(...events) {
  const body = JSON.stringify({ events });
  const signature = createHmac("sha256", "fixture").update(body).digest("base64");
  const res = await f.load("app/api/integrations/line/webhook/route.ts").POST(new next.NextRequest("https://dojo.example/line", {
    method: "POST", headers: { "x-line-signature": signature }, body,
  }));
  assert.equal(res.status, 200); await background.shift()();
}
try {
  await send(postback("action=imageBatchStart"));
  const cancel = replies.at(-1).quickReply.items.find(item => item.action.label === "停止收圖").action.data;
  const before = replies.length;
  for (const index of [10, 2, 5, 4, 3, 6, 7, 8, 9, 1]) {
    await send(photo("native-" + index, { id: "album", index, total: 10 }));
  }
  assert.equal(replies.length, before + 1);
  assert.match(replies.at(-1).text, /共有 10 張/);
  const group = batch.entryId;
  await send(recent()); assert.match(replies.at(-1).text, /10 張圖片/);
  await send(postback("action=imageBatchStart"));
  const fresh = batch.sessionId;
  await send(postback(cancel), postback("action=imageBatchFinish&entryId=" + group));
  assert.equal(batch.sessionId, fresh);
  failSave = true;
  await send(photo("orphan"));
  assert.match(replies.at(-1).text, /最近一筆/);
  assert.equal(batch.entryId, "");
  await send(photo("orphan"));
  assert.equal(batch.entryId, "image-orphan");
  await send(photo("second")); assert.equal(entries.get(batch.entryId).attachments.length, 2);
  const target = batch.entryId;
  entries.get(target).lineBatchState = "closed";
  await send(photo("separate")); assert.equal(batch, null); assert.equal(entries.get(target).attachments.length, 2);
  await send({ ...photo("broken"), replyToken: "broken" }, photo("survives"));
  assert.ok(entries.has("image-survives"));
  await send(postback("action=imageBatchFinish&entryId=" + group));
  const saved = entries.get(group); entries.delete(group); entries.set(group, saved);
  await send(recent());
  assert.match(replies.at(-1).text, /10 張圖片/);
  assert.ok(replies.at(-1).quickReply.items.some(item => item.action.data?.includes("imageRoute")));

  const classify = postback("action=imageRoute&entryId=" + group + "&route=game");
  await send(classify);
  assert.match(replies.at(-1).text, /需要確認/);
  assert.equal(replies.at(-1).imageEvent.webhookEventId, classify.webhookEventId);
  failAnalysis = true;
  await send(postback("action=imageRoute&entryId=" + group + "&route=game"));
  assert.match(replies.at(-1).text, /10 張原圖已保存/);
  assert.ok(replies.at(-1).quickReply.items.some(item => item.action.label === "重新分析"));

  const line = f.load("lib/dojo/lineClipping.ts");
  const calls = [];
  global.fetch = async (url, opts) => {
    calls.push({ url, opts });
    return url.endsWith("/reply") ? new Response('{"message":"Invalid reply token"}', { status: 400 })
      : new Response(null, { status: 409, headers: { "x-line-accepted-request-id": "accepted" } });
  };
  const expired = photo("push-once");
  await line.replyLineMessage("expired", "收到", undefined, expired);
  assert.equal(calls.length, 2); assert.match(calls[1].url, /push$/);
  assert.match(calls[1].opts.headers["X-Line-Retry-Key"], /^[0-9a-f-]{36}$/);
  await assert.rejects(() => line.replyLineMessage("expired", "收到", undefined, { ...expired, deliveryContext: { isRedelivery: true } }));
  assert.equal(calls.length, 3);
  global.fetch = async () => { throw Error("timeout"); };
  await assert.rejects(() => line.replyLineMessage("expired", "收到", undefined, expired), { name: "LineReplyDeliveryError" });
  console.log("passed LINE image webhook grouping, partial recovery, delivery isolation and scoped push");
} finally {
  global.fetch = originalFetch;
  await f.close();
}
