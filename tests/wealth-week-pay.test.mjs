import { test } from "node:test";
import assert from "node:assert/strict";
import { aud, mondayOf, parseWeekPayCommand, weekPayNeighbours, weekPayReply } from "../lib/dojo/wealthWeekPay.ts";

const today = "2026-11-28"; // Saturday

test("指令：本週、上週與指定日期；年份省略時不會指到未來", () => {
  for (const text of ["週薪", "薪水", " 本週薪水 ", "預計薪水"]) assert.equal(parseWeekPayCommand(text, today), today);
  assert.equal(parseWeekPayCommand("上週薪水", today), "2026-11-21");
  assert.equal(parseWeekPayCommand("上週週薪", today), "2026-11-21");
  assert.equal(parseWeekPayCommand("週薪 11/17", today), "2026-11-17");
  assert.equal(parseWeekPayCommand("薪水2026/11/3", today), "2026-11-03");
  assert.equal(parseWeekPayCommand("週薪 12/29", "2027-01-04"), "2026-12-29");
  assert.equal(parseWeekPayCommand("週薪 2/30", today), "invalid");
  for (const text of ["上週", "我的薪水好少", "11/18:255，4", "https://example.com"]) assert.equal(parseWeekPayCommand(text, today), null);
});

test("週一到週日；金額以分計算並加上千分位", () => {
  assert.equal(mondayOf("2026-11-28"), "2026-11-23");
  assert.equal(mondayOf("2026-11-23"), "2026-11-23");
  assert.equal(mondayOf("2026-11-29"), "2026-11-23");
  assert.equal(aud("123456"), "AUD 1,234.56");
  assert.equal(aud("5"), "AUD 0.05");
});

const week = (extra = {}) => ({
  week_start: "2026-11-16", week_end: "2026-11-22", pay_day: "2026-11-23", days: 2, gross_minor: "35500", card_count: 4,
  card_fee_minor: "1000", estimated_pay_minor: "17250", received_minor: "0",
  daily: [{ work_date: "2026-11-17", amount_minor: "25500", card_payment_count: 4 }, { work_date: "2026-11-20", amount_minor: "10000", card_payment_count: 0 }],
  ...extra,
});

test("已結束的一週：逐日列出、手續費、預估週薪與已實收，入帳日已過", () => {
  const text = weekPayReply(week({ received_minor: "17250" }), today);
  assert.match(text, /^週薪預估｜11\/16（一）–11\/22（日）\n入帳日 11\/23（一），已過/);
  assert.match(text, /・11\/17（二） AUD 255\.00，刷卡 4 筆\n・11\/20（五） AUD 100\.00，刷卡 0 筆/);
  assert.match(text, /已記 2 天，業績合計 AUD 355\.00\n刷卡手續費 AUD 10\.00（4 筆）\n預估週薪 AUD 172\.50\n已實收 AUD 172\.50/);
  assert.doesNotMatch(text, /還沒結束/);
  assert.doesNotMatch(text, /\n\n\n/);
});

test("進行中的一週會提醒還沒結束；缺刷卡筆數時不估算；沒有紀錄時教記法", () => {
  const open = weekPayReply(week({ week_start: "2026-11-23", week_end: "2026-11-29", pay_day: "2026-11-30" }), today);
  assert.match(open, /預計 11\/30（一） 入帳/);
  assert.match(open, /還沒結束/);
  const unknown = weekPayReply(week({ estimated_pay_minor: null, daily: [{ work_date: "2026-11-17", amount_minor: "25500", card_payment_count: null }], days: 1 }), today);
  assert.match(unknown, /刷卡筆數未記/);
  assert.match(unknown, /暫時無法估算/);
  assert.doesNotMatch(unknown, /預估週薪 AUD/);
  const empty = weekPayReply(week({ days: 0, daily: [], gross_minor: "0", estimated_pay_minor: "0" }), today);
  assert.match(empty, /還沒有業績紀錄/);
  assert.match(empty, /11\/18:255，4/);
});

test("快速按鈕：上一週一定有；下一週不超過本週；看本週時不再顯示「本週」", () => {
  assert.deepEqual(weekPayNeighbours("2026-11-23", today).map((w) => w.label), ["上一週"]);
  assert.deepEqual(weekPayNeighbours("2026-11-16", today), [{ label: "上一週", date: "2026-11-09" }, { label: "下一週", date: "2026-11-23" }, { label: "本週", date: today }]);
});
