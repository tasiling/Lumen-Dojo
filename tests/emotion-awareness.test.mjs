import assert from "node:assert/strict";
import test from "node:test";
import {
  AWARENESS_FORMAT, AWARENESS_METHOD_KEYS, AWARENESS_METHODS, awarenessCarry, awarenessMatches, awarenessRescuePrompt, awarenessSummary,
  awarenessVersions, buildAwarenessPackage, checkAwarenessReturn, confirmAwareness, fitAwarenessRecord, newAwarenessId, newAwarenessRecord,
  normalizeAwarenessRecord, parseAwarenessReturn, withAwarenessReturn,
} from "../lib/dojo/emotionAwareness.ts";

const now = "2026-11-25T00:00:00.000Z";
const fresh = (extra = {}) => newAwarenessRecord({ id: "XJ-20261125-AB12", writing: "今天開會被打斷，我整個下午都很悶。\n我覺得自己一定是說得不好。", method: "auto", date: "2026-11-25", now, ...extra });
const returned = (state = "完成") => [
  "```", `===${AWARENESS_FORMAT}===`, "討論包ID：XJ-20261125-AB12", "採用方式：看看這個想法是怎麼來的", `狀態：${state}`,
  "===逐字問答===", "T1｜GPT", "被打斷的那一刻，你腦中閃過哪一句話？", "T2｜我", "我想的是，我一定是說得不好，大家才不想聽。", "其實那天只有一個人打斷我。",
  "T3｜GPT", "有沒有不完全符合這句話的經驗？", "T4｜我", "上週的提案大家是聽完的。",
  "===本人理解===", "#1｜T2", "原話：我一定是說得不好，大家才不想聽", "整理版：被打斷時，我會直接認定是自己說得不好。",
  "#2｜T4", "原話：上週的提案其實很成功", "整理版：我也有被完整聽完的經驗。",
  "===客觀事實===", "- T2｜那天只有一個人打斷我", "- 會議有八個人參加",
  "===GPT假設===", "- 你可能把單一事件推論成整體評價（尚未由本人確認）",
  "===未回答===", state === "暫停" ? "- 打斷你的人平常也會這樣對別人嗎？" : "無",
  "===結束===", "```",
].join("\n");
const afterReturn = (state) => {
  const parsed = parseAwarenessReturn(returned(state));
  return withAwarenessReturn(fresh(), parsed, checkAwarenessReturn(parsed, "XJ-20261125-AB12"), now);
};

test("the package carries the writing, the rules and every method when GPT is asked to recommend", () => {
  const pack = buildAwarenessPackage(fresh());
  assert.match(pack, /討論包ID：XJ-20261125-AB12/);
  assert.match(pack, /W-P1｜今天開會被打斷/);
  assert.match(pack, /W-P2｜我覺得自己一定是說得不好/);
  for (const key of AWARENESS_METHOD_KEYS) assert.ok(pack.includes(AWARENESS_METHODS[key].name), key);
  assert.equal(AWARENESS_METHOD_KEYS.length, 7);
  assert.match(pack, /一次只問一個關鍵問題/);
  assert.match(pack, /不對我或我提到的任何人做心理診斷/);
  assert.match(pack, /停止這個練習/);
  assert.match(pack, new RegExp(`===${AWARENESS_FORMAT}===`));
  assert.throws(() => buildAwarenessPackage(fresh({ writing: "  " })));
});

test("a chosen method leaves the others out, and a continuation carries what was settled and what is open", () => {
  const pack = buildAwarenessPackage(fresh({ method: "kindness" }), { understandings: ["我也有被聽完的經驗"], unanswered: ["他平常也會這樣嗎？"] });
  assert.match(pack, /覺察方式：用對朋友的方式對自己/);
  assert.ok(!pack.includes(AWARENESS_METHODS.chain.name));
  assert.match(pack, /我說過：我也有被聽完的經驗/);
  assert.match(pack, /上一次還沒回答的問題[\s\S]*他平常也會這樣嗎/);
  assert.match(AWARENESS_METHODS.chain.guide, /不統計次數/);
});

test("a return is parsed into turns, the owner's understandings, facts and GPT's assumptions", () => {
  const parsed = parseAwarenessReturn(returned());
  assert.equal(parsed.id, "XJ-20261125-AB12");
  assert.equal(parsed.state, "完成");
  assert.equal(parsed.turns.length, 4);
  assert.match(parsed.turns[1].text, /其實那天只有一個人打斷我/);
  assert.deepEqual(parsed.understandings.map((item) => [item.n, item.turn]), [[1, 2], [2, 4]]);
  assert.deepEqual(parsed.facts, [{ turn: 2, text: "那天只有一個人打斷我" }, { turn: 0, text: "會議有八個人參加" }]);
  assert.equal(parsed.assumptions.length, 1);
  assert.deepEqual(parsed.unanswered, []);
  assert.deepEqual(parseAwarenessReturn(returned("暫停")).unanswered, ["打斷你的人平常也會這樣對別人嗎？"]);
});

test("words GPT changed fail the verbatim check, and a wrong id or missing section is not accepted", () => {
  const checks = checkAwarenessReturn(parseAwarenessReturn(returned()), "XJ-20261125-AB12");
  assert.equal(checks.idOk, true);
  assert.deepEqual(checks.missing, []);
  assert.deepEqual(checks.words.map((item) => item.ok), [true, false]);
  assert.deepEqual(checks.looseFacts, [1]);
  assert.match(awarenessRescuePrompt(checks), /#2/);
  assert.equal(checkAwarenessReturn(parseAwarenessReturn(returned()), "XJ-20261125-ZZZZ").idOk, false);
  const broken = checkAwarenessReturn(parseAwarenessReturn(returned().replace("===GPT假設===", "")), "XJ-20261125-AB12");
  assert.deepEqual(broken.missing, ["GPT假設"]);
  assert.match(awarenessRescuePrompt(broken), /GPT假設/);
  assert.deepEqual(checkAwarenessReturn(parseAwarenessReturn("隨便貼的文字"), "XJ-20261125-AB12").missing.slice(0, 1), ["開頭的格式標記"]);
});

test("nothing is formal until the owner confirms, and GPT's assumption never enters as is", () => {
  const record = afterReturn();
  assert.equal(record.status, "returned");
  assert.equal(record.confirmed, null);
  assert.equal(typeof confirmAwareness(fresh(), { understandings: [], facts: [], rewrites: [] }, now), "string");
  assert.match(confirmAwareness(record, { understandings: [{ n: 2, from: "原話" }], facts: [], rewrites: [] }, now), /沒有通過逐字核對/);
  assert.match(confirmAwareness(record, { understandings: [], facts: [], rewrites: [{ index: 0, text: record.assumptions[0] }] }, now), /不能原封不動/);
  assert.match(confirmAwareness(record, { understandings: [], facts: [], rewrites: [] }, now), /至少採用/);
  const saved = confirmAwareness(record, {
    understandings: [{ n: 1, from: "原話" }, { n: 2, from: "改寫", text: "上週的提案大家有聽完。" }],
    facts: [0], rewrites: [{ index: 0, text: "我可能把一次被打斷看得太重。" }],
  }, now);
  assert.equal(saved.status, "confirmed");
  assert.deepEqual(saved.confirmed.understandings.map((item) => item.from), ["原話", "改寫", "改寫自GPT假設"]);
  assert.deepEqual(saved.confirmed.facts, ["那天只有一個人打斷我"]);
  assert.deepEqual(saved.assumptions, record.assumptions);
  assert.ok(!awarenessSummary(saved).opening.includes("推論"));
  assert.ok(!JSON.stringify(awarenessSummary(saved)).includes("單一事件"));
});

test("a paused round hands its open questions to the next one", () => {
  const paused = afterReturn("暫停");
  assert.equal(paused.paused, true);
  assert.deepEqual(awarenessCarry(paused).unanswered, ["打斷你的人平常也會這樣對別人嗎？"]);
  assert.deepEqual(awarenessCarry(paused).understandings.length, 2);
});

test("records survive a save and load, and unknown shapes are refused", () => {
  const saved = confirmAwareness(afterReturn(), { understandings: [{ n: 1, from: "整理版" }], facts: [], rewrites: [] }, now);
  assert.deepEqual(normalizeAwarenessRecord(JSON.parse(JSON.stringify(saved))), saved);
  assert.equal(normalizeAwarenessRecord({ recordType: "dojo-entry", id: "XJ-20261125-AB12", createdAt: now }), null);
  assert.equal(normalizeAwarenessRecord({ recordType: "emotion-awareness", id: "bad", createdAt: now }), null);
  assert.match(newAwarenessId(new Date(now), () => 0.5), /^XJ-20261125-[0-9A-Z]{4}$/);
});

test("a long talk drops GPT's turns before it is refused", () => {
  const record = afterReturn();
  const long = { ...record, turns: record.turns.map((turn) => turn.who === "GPT" ? { ...turn, text: "問".repeat(3000) } : turn) };
  const fitted = fitAwarenessRecord(long, 4000);
  assert.equal(fitted.gptTurnsOmitted, true);
  assert.ok(fitted.turns.filter((turn) => turn.who === "我").every((turn) => turn.text));
  assert.equal(fitAwarenessRecord(long, 200), null);
  assert.equal(fitAwarenessRecord(record).gptTurnsOmitted, false);
});

test("review filters by date, keyword and archive, and follows the chain of versions", () => {
  const record = afterReturn();
  assert.equal(awarenessMatches(record, { q: "開會 打斷" }), true);
  assert.equal(awarenessMatches(record, { q: "旅行" }), false);
  assert.equal(awarenessMatches(record, { q: "單一事件" }), false);
  assert.equal(awarenessMatches(record, { from: "2026-11-26" }), false);
  assert.equal(awarenessMatches(record, { to: "2026-11-25", from: "2026-11-01" }), true);
  assert.equal(awarenessMatches({ ...record, archived: true }, {}), false);
  assert.equal(awarenessMatches({ ...record, archived: true }, { archived: true }), true);
  const item = (id, previousId = "") => ({ ...awarenessSummary(record), id, previousId });
  const all = [item("XJ-20261125-0003", "XJ-20261125-0002"), item("XJ-20261125-0001"), item("XJ-20261125-0002", "XJ-20261125-0001"), item("XJ-20261125-0009")];
  assert.deepEqual(awarenessVersions("XJ-20261125-0002", all).map((entry) => entry.id), ["XJ-20261125-0001", "XJ-20261125-0002", "XJ-20261125-0003"]);
  assert.deepEqual(awarenessVersions("XJ-20261125-0009", all).map((entry) => entry.id), ["XJ-20261125-0009"]);
});
