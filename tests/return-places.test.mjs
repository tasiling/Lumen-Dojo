import assert from "node:assert/strict";
import test from "node:test";
import { unfilledId, wrongPlace } from "../lib/dojo/returnPlaces.ts";
import { parseDaoReturn } from "../lib/dojo/daoQuestions.ts";
import { parseAwarenessReturn } from "../lib/dojo/emotionAwareness.ts";

test("每一處都認得別處的格式，自己的格式不提示", () => {
  assert.match(wrongPlace("===野採討論/v2===\n討論包ID：x", "reading"), /野採淬鍊.*開始淬鍊/);
  assert.equal(wrongPlace("===野採討論/v2===", "refine"), "");
  assert.match(wrongPlace('{"格式":"心知閱讀討論/v1"}', "refine"), /閱讀書頁/);
  assert.match(wrongPlace("===心情覺察/v1===", "dao"), /心・情覺察/);
  assert.match(wrongPlace("===道藏理解/v1===", "awareness"), /道藏/);
  assert.match(wrongPlace('{"kind":"織光杼討論回傳"}', "reading"), /織光堂/);
  assert.equal(wrongPlace("隨便一段文字", "reading"), "");
});

test("GPT 沒拿到討論包時寫的識別碼視為沒有填", () => {
  for (const value of ["", "  ", "〔未取得原始ID，待補〕", "請換成網站給的編號", "（無）", "無", "---"]) assert.equal(unfilledId(value), true, value);
  for (const value of ["YC-20261125-AB12", "5f1c2d3e-0000-4000-8000-000000000000"]) assert.equal(unfilledId(value), false, value);
});

test("道藏：問題編號待補時當成沒有填，候選用 K1 編號也讀得到", () => {
  const out = parseDaoReturn(["===道藏理解/v1===", "問題編號：〔待補〕", "===我說過的話===", "T2｜我說的話", "===候選理解===", "#K1｜用到 T2｜我說的話", "〔回傳核對備註〕", "- 這是備註", "===結束==="].join("\n"));
  assert.equal(out.id, "");
  assert.deepEqual(out.candidates.map((c) => c.n), [1]);
  assert.equal(out.gpt.length, 0);
});

test("心・情覺察：本人理解用 K1 編號也讀得到，〔備註〕不混進區塊", () => {
  const out = parseAwarenessReturn(["===心情覺察/v1===", "討論包ID：〔待補〕", "===逐字問答===", "T1｜我", "今天很累", "===本人理解===", "#K1｜觀點｜T1", "原話：今天很累", "===未回答===", "- 為什麼累？", "〔回傳核對備註〕", "- 備註", "===結束==="].join("\n"));
  assert.deepEqual(out.understandings.map((u) => [u.n, u.turn, u.words]), [[1, 1, "今天很累"]]);
  assert.deepEqual(out.unanswered, ["為什麼累？"]);
});
