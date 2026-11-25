import assert from "node:assert/strict";
import test from "node:test";
import { insightMark, insightSettled, insightSourceText, insightUsable } from "../lib/reading/insightUse.ts";

const reading = (status, extra = {}) => ({ insight: "練習後的洞察", action: "觀察自己的感受", result: "", status, refine: null, ...extra });
const refine = { cardType: "觀點", titleOrigin: "原話", words: "焦慮不是燃料，是警報。", quote: "C1-P2｜很多人把焦慮當成燃料", discussion: "YC-20261123-AB12 #1", captureIds: ["c1"] };

test("every card can be used in a work except a reading card the owner gave up on", () => {
  for (const status of ["待行動", "觀察中", "行動中", "已驗證", "不成立"]) assert.equal(insightUsable(reading(status)), true, status);
  assert.equal(insightUsable(reading("放棄")), false);
  // A 野採淬鍊 card has no status of its own; status never blocks it.
  assert.equal(insightUsable(reading("放棄", { refine })), true);
});

test("unverified reading cards and 野採淬鍊 cards are marked clearly", () => {
  assert.equal(insightMark(reading("已驗證")), "閱讀洞察・已驗證");
  assert.equal(insightMark(reading("不成立")), "閱讀洞察・不成立");
  assert.equal(insightMark(reading("觀察中")), "閱讀洞察・觀察中・尚未驗證");
  assert.equal(insightMark(reading("行動中")), "閱讀洞察・行動中・尚未驗證");
  assert.equal(insightMark(reading("觀察中", { refine })), "野採淬鍊・觀點・本人原話");
  assert.equal(insightMark(reading("觀察中", { refine: { ...refine, cardType: "" } })), "野採淬鍊・洞察・本人原話");
  assert.equal(insightSettled(reading("觀察中")), false);
});

test("reading cards keep the text works already selected; 野採淬鍊 cards give the owner's words and the line they answer", () => {
  assert.equal(insightSourceText(reading("已驗證")), "練習後的洞察\n行動：觀察自己的感受");
  assert.equal(insightSourceText(reading("已驗證", { result: "我注意到了變化" })), "練習後的洞察\n行動：觀察自己的感受\n結果：我注意到了變化");
  assert.equal(insightSourceText(reading("觀察中", { refine })), "焦慮不是燃料，是警報。\n依據的原文：C1-P2｜很多人把焦慮當成燃料");
  assert.equal(insightSourceText(reading("觀察中", { refine: { ...refine, words: "", quote: "" } })), "練習後的洞察");
});
