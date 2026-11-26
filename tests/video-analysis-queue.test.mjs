import assert from "node:assert/strict";
import test from "node:test";
import { loader } from "../scripts/weaving-test-harness.mjs";

const { DouyinQueue } = loader()("lib/dojo/douyin/queue.mjs");
const capture = "11111111-1111-4111-8111-111111111111";
const alias = "22222222-2222-4222-8222-222222222222";

function setup() {
  const clock = { now: 1_000_000 };
  const queue = new DouyinQueue(":memory:", () => clock.now);
  const ticket = queue.issue();
  const token = queue.pair(ticket);
  return { queue, token, clock };
}

test("analysis needs a video the Mac already transcribed", () => {
  const { queue } = setup();
  assert.throws(() => queue.requestAnalysis(capture), /還沒有 Mac 轉錄過的影片/);
  queue.enqueue(capture, { url: "https://www.douyin.com/video/7300000000000000000", raw: "", title: "動畫", videoId: "7300000000000000000" });
  assert.throws(() => queue.requestAnalysis(capture), /還沒有/);
});

test("a requested analysis is handed to the Mac, even when transcription is not ready, and reports back", () => {
  const { queue, token, clock } = setup();
  queue.enqueue(capture, { url: "https://www.douyin.com/video/7300000000000000000", raw: "", title: "動畫", videoId: "7300000000000000000" });
  queue.run("UPDATE job SET status='done' WHERE id=?", capture);
  queue.enqueue(alias, { url: "https://v.douyin.com/abc/", raw: "", title: "同一支", videoId: "7300000000000000000" }, capture);
  assert.equal(queue.requestAnalysis(alias).status, "queued");
  assert.equal(queue.requestAnalysis(alias).status, "queued", "asking twice does not queue twice");
  // A worker without analysis support never receives it.
  assert.equal(queue.claim(token, true, { files: true }), null);
  const job = queue.claim(token, false, { analysis: true });
  assert.deepEqual([job.id, job.kind, job.source, job.video], [alias, "analysis", "douyin", "7300000000000000000"]);
  assert.equal(queue.macAnalyses(), true);
  assert.equal(queue.analysisView(alias).phase, "fetch");
  assert.throws(() => queue.updateAnalysis(token, { id: alias, lease: "wrong", action: "heartbeat", phase: "frames" }), /重新分派/);
  queue.updateAnalysis(token, { id: alias, lease: job.lease, action: "heartbeat", phase: "frames" });
  queue.updateAnalysis(token, { id: alias, lease: job.lease, action: "frames" });
  assert.equal(queue.analysisView(alias).status, "reading");
  queue.settleAnalysis(alias);
  assert.equal(queue.analysisView(alias).status, "done");
  // Asking again starts a new attempt.
  assert.equal(queue.requestAnalysis(alias).status, "queued");
  const again = queue.claim(token, true, { files: true, analysis: true });
  assert.equal(again.attempt, 2);
  clock.now += 10 * 60_000;
  assert.equal(queue.analysisView(alias).status, "queued", "an abandoned lease is handed out again");
  const third = queue.claim(token, true, { analysis: true });
  queue.updateAnalysis(token, { id: alias, lease: third.lease, action: "fail", message: "下載失敗" });
  assert.deepEqual(queue.analysisView(alias), { status: "failed", phase: "fetch", error: "下載失敗" });
});

test("transcription keeps priority over analysis", () => {
  const { queue, token } = setup();
  queue.enqueue(capture, { url: "https://www.douyin.com/video/7300000000000000000", raw: "", title: "動畫", videoId: "7300000000000000000" });
  queue.run("UPDATE job SET status='done' WHERE id=?", capture);
  queue.requestAnalysis(capture);
  queue.enqueue(alias, { url: "https://www.douyin.com/video/7300000000000000001", raw: "", title: "新的", videoId: "7300000000000000001" });
  assert.equal(queue.claim(token, true, { analysis: true }).kind, "douyin");
  assert.equal(queue.claim(token, true, { analysis: true }).kind, "analysis");
});
