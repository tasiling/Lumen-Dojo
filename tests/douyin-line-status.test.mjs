import assert from "node:assert/strict";
import test from "node:test";
import { douyinFinishedMessage, douyinStatusLine } from "../lib/dojo/douyin/lineStatus.ts";

const job = (status, phase = "", error = "") => ({ status, phase, title: "青銅器展", error });

test("排隊中的回覆說明 Mac 的狀態", () => {
  assert.equal(douyinStatusLine(job("queued"), "unpaired"), "等待 Mac 轉錄：Mac 尚未配對，配對後才會開始。完成或失敗時會再通知你。");
  assert.match(douyinStatusLine(job("queued"), "offline"), /Mac 目前離線，開機連線後會自動開始/);
  assert.match(douyinStatusLine(job("queued"), "waiting"), /BiliNote 尚未就緒/);
  assert.match(douyinStatusLine(job("queued"), "ready"), /已排入佇列/);
});

test("轉錄中、完成與失敗各有固定說法", () => {
  assert.equal(douyinStatusLine(job("running", "transcribe"), "ready"), "Mac 正在轉錄：辨識語音。完成或失敗時會再通知你。");
  assert.equal(douyinStatusLine(job("running", "unknown"), "ready"), "Mac 正在轉錄。完成或失敗時會再通知你。");
  assert.equal(douyinStatusLine(job("done"), "offline"), "已有逐字稿");
  assert.equal(douyinStatusLine(job("failed", "download"), "ready"), "轉錄未完成，可在素材內重試");
  assert.equal(douyinStatusLine(null, "ready"), "尚未排入轉錄");
});

test("只有結束的轉錄會產生通知", () => {
  assert.equal(douyinFinishedMessage(null), null);
  assert.equal(douyinFinishedMessage(job("queued")), null);
  assert.equal(douyinFinishedMessage(job("running", "audio")), null);
  assert.equal(douyinFinishedMessage(job("done")), "轉錄完成｜抖音\n「青銅器展」\n逐字稿已可在這筆素材查看。");
  assert.equal(douyinFinishedMessage(job("failed", "download", "播放來源回傳 HTTP 403。")),
    "轉錄未完成｜抖音\n「青銅器展」\n停在：取得影片\n原因：播放來源回傳 HTTP 403。\n可在素材內重試。");
  assert.equal(douyinFinishedMessage(job("failed")), "轉錄未完成｜抖音\n「青銅器展」\n可在素材內重試。");
});
