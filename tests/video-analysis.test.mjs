import { test } from "node:test";
import assert from "node:assert/strict";
import {
  shotRanges, rhythmFacts, timelineText, analysisFromResult, normalizeVideoAnalysis, analysisForOriginal, techniqueCard,
} from "../lib/dojo/videoAnalysis.ts";

const modelResult = {
  shots: [
    { index: 2, picture: "藍色圓球彈起", camera: "推近", motion: "圓球壓扁後彈起", transition: "縮放轉場", text: "" },
    { index: 1, picture: "紅色方塊出現在中央", camera: "固定", motion: "方塊從小放大", transition: "直切", text: "開始囉" },
    { index: 3, picture: "綠色背景與標題", camera: "拉遠", motion: "標題逐字出現", transition: "滑入", text: "完" },
  ],
  rhythm: "前段快切，\n最後停留。",
  techniques: [
    { name: "壓扁再彈起", how: "先壓扁一格再放大，動作更有彈性。", shots: [2, 2, 9], basis: "visible" },
    { name: "", how: "沒有名字的會被略過", shots: [], basis: "visible" },
    { name: "標題逐字出現", how: "每字間隔約兩格。", shots: [3], basis: "inferred" },
  ],
  uncertain: "第二鏡頭動作太快，中間畫面看不清。",
};

test("鏡頭範圍只依量出的切點，切點去重、排序，貼近頭尾的雜訊會略過", () => {
  assert.deepEqual(shotRanges(6, [3, 1.5, 1.5, 0.01, 5.99]), [
    { index: 1, start: 0, end: 1.5 }, { index: 2, start: 1.5, end: 3 }, { index: 3, start: 3, end: 6 },
  ]);
  assert.deepEqual(shotRanges(4, []), [{ index: 1, start: 0, end: 4 }]);
  assert.match(timelineText(4, []), /無切點/);
  const facts = rhythmFacts(6, [0.5, 1, 1.5, 3]);
  assert.equal(facts.shotCount, 5);
  assert.equal(facts.shortest, 0.5);
  assert.equal(facts.longest, 3);
  assert.deepEqual(facts.fastest, { start: 0, end: 3, count: 4 });
});

test("AI 的描述接在量出的鏡頭上；缺任何一個鏡頭就整份不收", () => {
  const result = analysisFromResult(modelResult, 6, [1.5, 3]);
  assert.deepEqual(result.shots.map((shot) => [shot.index, shot.start, shot.end, shot.picture]), [
    [1, 0, 1.5, "紅色方塊出現在中央"], [2, 1.5, 3, "藍色圓球彈起"], [3, 3, 6, "綠色背景與標題"],
  ]);
  assert.equal(result.techniques.length, 2);
  assert.deepEqual(result.techniques[0].shots, [2], "重複與不存在的鏡頭編號會被拿掉");
  assert.equal(result.techniques[1].basis, "inferred");
  assert.throws(() => analysisFromResult({ ...modelResult, shots: modelResult.shots.slice(0, 2) }, 6, [1.5, 3]), /鏡頭 3/);
});

function ready(extra = {}) {
  return normalizeVideoAnalysis({
    state: "ready", requestedAt: "2026-11-26T01:00:00Z", duration: 6, cuts: [1.5, 3], ...analysisFromResult(modelResult, 6, [1.5, 3]),
    readAt: "2026-11-26T01:02:00Z", model: "gpt-test", estimatedCostUsd: 0.03, error: "", ...extra,
  });
}

test("只有核對過的分析才會併入淬鍊用的原文", () => {
  assert.equal(analysisForOriginal(ready({ confirmed: false })), "");
  assert.equal(normalizeVideoAnalysis({ state: "reading", confirmed: true }).confirmed, false, "還沒讀完的分析不能算核對");
  const text = analysisForOriginal(ready({ confirmed: true }));
  const lines = text.split("\n");
  assert.equal(lines.length, 4);
  assert.equal(lines[0], "鏡頭 1（0:00.0–0:01.5）｜畫面：紅色方塊出現在中央｜鏡頭：固定｜動作：方塊從小放大｜轉場：直切｜字幕：開始囉");
  assert.equal(lines[3], "節奏：前段快切， 最後停留。");
});

test("手法觀察卡必須有自己的話；標題沿用手法名稱時標為整理版，改過就標為改寫", () => {
  const analysis = ready({ confirmed: true });
  assert.match(techniqueCard(analysis, 0, { title: "", words: "  " }, "cap-1"), /自己的話/);
  assert.match(techniqueCard(analysis, 7, { title: "", words: "想學" }, "cap-1"), /找不到/);
  const card = techniqueCard(analysis, 0, { title: "", words: "我想學會讓角色落地有彈性" }, "cap-1");
  assert.equal(card.title, "壓扁再彈起");
  assert.equal(card.titleOrigin, "整理版");
  assert.equal(card.cardType, "手法觀察");
  assert.equal(card.words, "我想學會讓角色落地有彈性");
  assert.equal(card.discussion, "影片分析 cap-1 #1");
  assert.deepEqual(card.captureIds, ["cap-1"]);
  assert.match(card.quote, /^AI 畫面分析（畫面可見）：壓扁再彈起/);
  assert.match(card.quote, /鏡頭 2（0:01.5–0:03.0）藍色圓球彈起/);
  const renamed = techniqueCard(analysis, 1, { title: "逐字標題", words: "片尾可以用" }, "cap-1");
  assert.equal(renamed.titleOrigin, "改寫");
  assert.match(renamed.quote, /依前後畫面推測/);
});

test("讀回來的資料會保留已存卡片的編號，壞掉的欄位會被清掉", () => {
  const analysis = ready();
  analysis.techniques[0].cardId = "card-9";
  const again = normalizeVideoAnalysis(JSON.parse(JSON.stringify({ ...analysis, estimatedCostUsd: -1, cuts: [1.5, "x"] })));
  assert.equal(again.techniques[0].cardId, "card-9");
  assert.equal(again.estimatedCostUsd, 0);
  assert.deepEqual(again.cuts, [1.5]);
  assert.equal(normalizeVideoAnalysis(null), undefined);
});
