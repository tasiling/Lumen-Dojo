// 逐字稿校正：轉錄完成 → 簡轉繁與辨識修正 → 機器檢查 → 寫回 Notion（原始辨識不變）→ LINE 通知。模型與 Notion 皆為替身。
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import * as next from "next/server.js";
import { fixture } from "./weaving-fixture.mjs";

const replies = [], pushes = [], background = [];
const f = await fixture({
  "next/server": { ...next, after: fn => background.push(fn) },
  "@/lib/dojo/lineClipping": () => ({
    ...f.load("lib/dojo/lineClipping.ts"),
    replyLineMessage: async (_token, text, quickReply) => replies.push({ text, quickReply }),
    pushLineMessage: async (text, quickReply) => { pushes.push({ text, quickReply }); return true; },
  }),
});
Object.assign(process.env, { LINE_CHANNEL_SECRET: "formal-line-fixture", LINE_ALLOWED_USER_ID: "owner", NEXT_PUBLIC_APP_URL: "https://dojo.example", OPENAI_API_KEY: "test-key" });
delete process.env.OPENAI_TRANSCRIPT_TIDY_MONTHLY_BUDGET_USD;

// The model stand-in: it receives the numbered Traditional paragraphs and returns them corrected by `correct`.
const modelCalls = [];
let correct = paragraphs => paragraphs;
let modelDown = false;
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  if (!String(url).startsWith("https://api.openai.com/")) return realFetch(url, init);
  const body = JSON.parse(init.body);
  const payload = JSON.parse(body.input[0].content[0].text.slice(body.input[0].content[0].text.indexOf("\n\n{") + 2));
  modelCalls.push({ model: body.model, payload, schema: body.text.format.name });
  if (modelDown) return new Response(JSON.stringify({ error: { message: "upstream" } }), { status: 503 });
  const paragraphs = correct(payload.段落);
  return new Response(JSON.stringify({ output_text: JSON.stringify({ paragraphs }), usage: { input_tokens: 2000, output_tokens: 2000 } }), { status: 200 });
};

try {
  const line = f.load("app/api/integrations/line/webhook/route.ts");
  const own = f.load("app/api/dojo/douyin/route.ts");
  const worker = f.load("app/api/integrations/douyin/worker/[action]/route.ts");
  const captures = f.load("app/api/dojo/captures/route.ts");
  const store = f.load("lib/dojo/captureStore.ts");
  const sync = f.load("lib/dojo/douyin/transcriptSync.ts");
  const { douyinQueue } = f.load("lib/dojo/douyin/queue.mjs");
  const { captureOriginal } = f.load("lib/dojo/refineRecord.ts");
  const settle = async () => { await sync.tidyPendingTranscripts(); await sync.syncPendingTranscripts(); };
  const transcriptOf = async id => (await store.getCaptureEntry(id)).capture.clip.transcript;
  const status = async id => (await (await own.GET(f.req("GET", "/api/dojo/douyin?captureId=" + id))).json()).job;
  const endpoint = (action, data, token) => worker.POST(new next.NextRequest("https://dojo.example/api/integrations/douyin/worker/" + action,
    { method: "POST", headers: { "content-type": "application/json", ...(token ? { authorization: "Bearer " + token } : {}) }, body: JSON.stringify(data) }),
    { params: Promise.resolve({ action }) });
  let events = 0;
  async function share(text) {
    const event = { type: "message", webhookEventId: "evt-" + ++events, source: { type: "user", userId: "owner" }, replyToken: "r" + events, message: { id: String(events), type: "text", text } };
    const bytes = JSON.stringify({ events: [event] });
    const signature = createHmac("sha256", "formal-line-fixture").update(bytes).digest("base64");
    assert.equal((await line.POST(new next.NextRequest("https://dojo.example/api/integrations/line/webhook", { method: "POST", headers: { "content-type": "application/json", "x-line-signature": signature }, body: bytes }))).status, 200);
    await background.shift()();
    return new URL(replies.at(-1).quickReply.items.find(i => i.action.label === "查看這筆素材").action.uri).searchParams.get("captureId");
  }
  const script = await (await own.POST(f.req("POST", "/api/dojo/douyin", { action: "install" }))).text();
  const token = (await (await endpoint("pair", { ticket: JSON.parse(Buffer.from(script.match(/^BUNDLE = '([^']+)'/m)[1], "base64").toString()).ticket })).json()).token;
  async function transcribe(videoId, segments) {
    const id = await share("https://www.douyin.com/video/" + videoId);
    const job = (await (await endpoint("claim", { ready: true }, token)).json()).job;
    await endpoint("update", { id: job.id, lease: job.lease, action: "identify", videoId, title: "陶藝示範" + videoId.slice(-2) }, token);
    const text = segments.map(s => s.text).join("");
    assert.equal((await endpoint("update", { id: job.id, lease: job.lease, action: "finish", videoId, text, segments }, token)).status, 200);
    return { id, text };
  }

  // Simplified speech, three paragraphs by timestamps (pauses of 3 seconds or more).
  const segments = [
    { start: 0, end: 4, text: "那个就是说我们今天要讲的是陶艺" }, { start: 4, end: 9, text: "然后拉胚的时候手要稳不然就会歪掉" },
    { start: 13, end: 18, text: "接着我们把土放在转盘中间" }, { start: 18, end: 23, text: "双手沾水慢慢往下压让土置中" },
    { start: 27, end: 32, text: "最后修整杯口就完成了谢谢大家收看这个视频" },
  ];
  correct = paragraphs => paragraphs.map(({ n }) => ({ n, text:
    n === 1 ? "那個，就是說，我們今天要講的是陶藝。然後拉坯的時候手要穩，不然就會歪掉。"
    : n === 2 ? "今天的重點是置中。" // a rewrite: must be reverted
    : "最後修整杯口就完成了。謝謝大家收看這個〔？〕視頻。" }));
  const first = await transcribe("7699761834606386301", segments);

  // The Mac's report returned; nothing is announced until correction settles.
  assert.equal(pushes.length, 0, "no notice before correction");
  let job = await status(first.id);
  assert.equal(job.tidyState, "pending");
  await settle();
  assert.equal(modelCalls.length, 1);
  assert.equal(modelCalls[0].schema, "transcript_tidy");
  assert.equal(modelCalls[0].payload.段落[0].text, "那個就是說我們今天要講的是陶藝然後拉胚的時候手要穩不然就會歪掉", "the model receives Traditional text");
  assert.deepEqual(modelCalls[0].payload.段落.map(p => p.n), [1, 2, 3]);

  // Notion holds the raw recognition unchanged, and the corrected copy beside it.
  const stored = await transcriptOf(first.id);
  assert.equal(stored.text, "那个就是说我们今天要讲的是陶艺然后拉胚的时候手要稳不然就会歪掉\n\n接着我们把土放在转盘中间双手沾水慢慢往下压让土置中\n\n最后修整杯口就完成了谢谢大家收看这个视频");
  assert.deepEqual(Object.keys(stored.tidy).sort(), ["at", "changes", "model", "reverted", "state", "text"]);
  assert.equal(stored.tidy.state, "done");
  assert.equal(stored.tidy.model, "gpt-5.6-luna");
  assert.deepEqual(stored.tidy.reverted, [2]);
  assert.equal(stored.tidy.text, "那個，就是說，我們今天要講的是陶藝。然後拉坯的時候手要穩，不然就會歪掉。\n\n接著我們把土放在轉盤中間雙手沾水慢慢往下壓讓土置中\n\n最後修整杯口就完成了。謝謝大家收看這個〔？〕視頻。");
  assert.ok(stored.tidy.changes >= 5);
  assert.ok(!Number.isNaN(Date.parse(stored.tidy.at)));

  // Then the LINE notice, describing the correction.
  assert.equal(pushes.length, 1);
  assert.match(pushes[0].text, /^轉錄完成｜抖音\n「陶藝示範01」\n已校正：簡轉繁與辨識修正，改了 \d+ 處。\n有 1 段沒有通過檢查，那幾段維持繁體原稿。\n逐字稿已可在這筆素材查看。$/);

  // The page gets the Traditional original to show 「改了哪裡」.
  job = await status(first.id);
  assert.equal(job.tidyBase, "那個就是說我們今天要講的是陶藝然後拉胚的時候手要穩不然就會歪掉\n\n接著我們把土放在轉盤中間雙手沾水慢慢往下壓讓土置中\n\n最後修整杯口就完成了謝謝大家收看這個視頻");

  // 淬鍊 discusses the corrected text and says so.
  const original = captureOriginal((await store.getCaptureEntry(first.id)).capture);
  assert.equal(original.kind, "逐字稿，經校正");
  assert.equal(original.text, stored.tidy.text);

  // A second capture of the same video gets the corrected copy in its own record.
  const alias = (await (await captures.POST(f.req("POST", "/api/dojo/captures", { title: "同一支", sourceUrl: "https://www.douyin.com/video/7699761834606386301" }))).json()).capture.id;
  await own.POST(f.req("POST", "/api/dojo/douyin", { action: "retry", captureId: alias }));
  await settle();
  assert.equal((await transcriptOf(alias)).tidy.text, stored.tidy.text);
  assert.equal(modelCalls.length, 1, "the same video is corrected once");

  // The model fails: the notice still goes out and says the raw recognition is shown; the text is only converted.
  modelDown = true;
  const second = await transcribe("7699761834606386302", segments);
  await settle();
  modelDown = false;
  assert.equal((await transcriptOf(second.id)).tidy.state, "failed");
  assert.equal((await transcriptOf(second.id)).tidy.text, job.tidyBase);
  assert.match(pushes.at(-1).text, /辨識修正沒有完成（模型沒有回應）。\n目前顯示的是原始辨識（已轉為繁體）。可在素材內補做校正。/);
  // 補做校正 from the capture page tries again, with no second LINE notice.
  correct = paragraphs => paragraphs;
  const before = pushes.length;
  assert.equal((await (await own.POST(f.req("POST", "/api/dojo/douyin", { action: "tidy", captureId: second.id }))).json()).job.tidyState, "pending");
  await settle();
  assert.equal((await transcriptOf(second.id)).tidy.state, "done");
  assert.equal(pushes.length, before);

  // Too short for a model call: converted only.
  const short = await transcribe("7699761834606386303", [{ start: 0, end: 2, text: "谢谢大家" }, { start: 5, end: 6, text: "再见" }]);
  const calls = modelCalls.length;
  await settle();
  assert.equal(modelCalls.length, calls);
  assert.deepEqual([(await transcriptOf(short.id)).tidy.state, (await transcriptOf(short.id)).tidy.text], ["skipped", "謝謝大家\n\n再見"]);

  // Over the monthly budget: converted only, and the notice says why.
  process.env.OPENAI_TRANSCRIPT_TIDY_MONTHLY_BUDGET_USD = "0.001";
  const capped = await transcribe("7699761834606386304", segments);
  await settle();
  delete process.env.OPENAI_TRANSCRIPT_TIDY_MONTHLY_BUDGET_USD;
  assert.equal(modelCalls.length, calls);
  assert.equal((await transcriptOf(capped.id)).tidy.state, "skipped");
  assert.match(pushes.at(-1).text, /本月校正額度已用完，只轉成繁體。/);
  const queue = douyinQueue();
  assert.ok(queue.tidySpentThisMonth() > 0, "model calls are counted against the cap");

  // Transcripts finished before this existed are not corrected on their own; the owner asks with 補做校正.
  queue.run("UPDATE job SET tidy_state='none',tidy_text=NULL WHERE id=?", short.id);
  await settle();
  assert.equal((await status(short.id)).tidyState, null);
  assert.equal(queue.pendingTidy(5).length, 0);
  assert.equal((await own.POST(f.req("POST", "/api/dojo/douyin", { action: "tidy", captureId: "00000000-0000-0000-0000-000000000000" }))).status, 409);

  // Long speech: the raw recognition and the corrected copy share the record and still fit Notion's limit.
  const { captureContent } = f.load("lib/dojo/formal.ts");
  const capture = (await store.getCaptureEntry(first.id)).capture;
  const longText = Array.from({ length: 1500 }, (_, i) => `第${i}段` + "说".repeat(70)).join("\n\n");
  const longTidy = Array.from({ length: 1500 }, (_, i) => `第${i}段` + "說".repeat(70) + "。").join("\n\n");
  const fitted = sync.transcriptForCapture(capture, { text: longText, segments: [], finishedAt: stored.finishedAt, tidy: { ...stored.tidy, text: longTidy } });
  assert.equal(fitted.truncated, true);
  assert.ok(JSON.stringify(captureContent({ ...capture, clip: { ...capture.clip, transcript: fitted } })).length <= 190000);
  assert.ok(fitted.text.length > 30000 && fitted.tidy.text.length > 30000, "both versions keep a substantial part");
  assert.ok(longTidy.startsWith(fitted.tidy.text) && longText.startsWith(fitted.text));

  // Removing tidy from the record returns to how it was.
  const { normalizeCaptureEntry } = f.load("lib/dojo/formal.ts");
  const withoutTidy = normalizeCaptureEntry({ title: "x", status: "pending", clip: { origin: "line", transcript: { ...stored, tidy: undefined } } }, { id: "x" });
  assert.equal(withoutTidy.clip.transcript.tidy, undefined);
  assert.equal(captureOriginal(withoutTidy).kind, "逐字稿");

  console.log("PASS transcript tidy: corrected before notice, raw kept, checks revert, Notion copy, aliases, failure, 補做校正, short, budget, no auto run on old transcripts");
} finally {
  globalThis.fetch = realFetch;
  await f.close();
}
