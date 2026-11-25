import assert from "node:assert/strict";
import test from "node:test";
import {
  REFINE_FORMAT, buildRefinePackage, checkRefineReturn, parseRefineReturn, refineCandidateAdoptable,
  refineContainsQuote, refineParagraphs, refineRescuePrompt,
} from "../lib/dojo/captureRefine.ts";

const source = (label, text, extra = {}) => ({ label, captureId: "id-" + label, title: "示範 " + label, author: "@demo", kind: "貼文", url: "", text, ...extra });
const round = {
  id: "YC-TEST", topic: "焦慮能不能幫助一個人努力？", angle: "understand",
  sources: [
    source("C1", "很多人把焦慮當成燃料，覺得不緊張就不會動。\n可是燃料燒完之後，留下來的是一台過熱的引擎。"),
    source("C2", "我不同意把焦慮說成一無是處。\n問題不在有沒有壓力，而在壓力結束之後，你有沒有讓自己真的停下來。"),
  ],
};
const header = [`===${REFINE_FORMAT}===`, "討論包ID：YC-TEST", "採集：C1,C2"];
const full = (parts = {}) => [
  ...header,
  "===逐字問答===", ...(parts.turns ?? ["T1｜GPT", "你有過把焦慮當燃料的時候嗎？", "T2｜我", "有。那種緊繃會讓我動起來，可是做完之後我會累到兩三天都不想碰任何東西。"]),
  "===原文引用===", ...(parts.quotes ?? ["C1-P1｜很多人把焦慮當成燃料，覺得不緊張就不會動。"]),
  "===候選===", ...(parts.candidates ?? ["#1｜洞察｜T2", "回應原文：C1-P1", "原話：做完之後我會累到兩三天都不想碰任何東西。", "整理版：焦慮讓我動起來，但事後我會累到兩三天不想碰任何東西。"]),
  "===GPT延伸===", "- 這是我的推論，尚未由本人確認。",
  "===待查證===", "- C1-P2：過熱的說法尚待查證。",
  "===未回答===", "- 不用緊繃的話，用什麼方式開始？",
  "===結束===",
].join("\n");

test("原文依自己的換行分段，連成一行的長文依句號切開", () => {
  assert.deepEqual(refineParagraphs("第一段\n\n第二段\n"), ["第一段", "第二段"]);
  assert.deepEqual(refineParagraphs("短短一行不切。"), ["短短一行不切。"]);
  const long = "這是一段存下來時沒有分段的原文，它的第一句比較長一點，用來確認切分。" + "接著是第二句，同樣寫得夠長，才不會被併回前一句裡面去！" + "第三句是一個問句，用來確認問號也會被當成句子的結尾嗎？" + "最後一句收尾。";
  const parts = refineParagraphs(long);
  assert.equal(parts.length, 4);
  assert.equal(parts.join(""), long);
});

test("討論包帶完整原文、逐段編號與回傳格式", () => {
  const text = buildRefinePackage(round);
  assert.match(text, /討論包ID：YC-TEST\n採集：C1,C2/);
  assert.match(text, /C1-P2｜可是燃料燒完之後，留下來的是一台過熱的引擎。/);
  assert.match(text, /C2-P2｜問題不在有沒有壓力/);
  assert.match(text, /【出題角度：先看懂他】/);
  for (const marker of ["===逐字問答===", "===原文引用===", "===候選===", "===GPT延伸===", "===待查證===", "===未回答===", "===結束==="]) assert.ok(text.includes(marker), marker);
  assert.throws(() => buildRefinePackage({ ...round, sources: [] }), /至少帶入一則/);
  assert.throws(() => buildRefinePackage({ ...round, sources: Array.from({ length: 6 }, (_, i) => source("C" + (i + 1), "x")) }), /最多帶入 5 則/);
});

test("逐字比對忽略空白與外層引號，刪節號兩側都要依序出現", () => {
  assert.ok(refineContainsQuote("很多人把焦慮當成燃料，覺得不緊張就不會動。", "「很多人把焦慮 當成燃料」"));
  assert.ok(refineContainsQuote("很多人把焦慮當成燃料，覺得不緊張就不會動。", "很多人把焦慮……不緊張就不會動"));
  assert.ok(!refineContainsQuote("很多人把焦慮當成燃料，覺得不緊張就不會動。", "不緊張就不會動……很多人"));
  assert.ok(!refineContainsQuote("很多人把焦慮當成燃料。", "很多人把壓力當成燃料"));
  assert.ok(!refineContainsQuote("任何原文", "……"));
});

test("完整且忠實的回傳全部通過，待查證與未回答分開", () => {
  const parsed = parseRefineReturn("```\n" + full() + "\n```");
  assert.deepEqual([parsed.turns.length, parsed.quotes.length, parsed.candidates.length], [2, 1, 1]);
  assert.deepEqual(parsed.toVerify, ["C1-P2：過熱的說法尚待查證。"]);
  assert.deepEqual(parsed.unanswered, ["不用緊繃的話，用什麼方式開始？"]);
  assert.equal(parsed.extensions.length, 1);
  const checks = checkRefineReturn(parsed, round);
  assert.deepEqual([checks.idOk, checks.missing, checks.turnGaps], [true, [], []]);
  assert.ok(checks.quotes.every((item) => item.ok) && checks.words.every((item) => item.ok));
  assert.equal(refineRescuePrompt(checks), "");
  assert.ok(refineCandidateAdoptable(checks, 1));
});

test("被改寫的原文與原話會被抓出來，並指出最接近的段落", () => {
  const parsed = parseRefineReturn(full({
    quotes: ["C2-P2｜壓力本身不是問題，重點是事後有沒有好好休息。"],
    candidates: ["#1｜洞察｜T2", "原話：焦慮雖然能讓我開始行動，但事後的疲憊會讓我好幾天無法工作。", "整理版：同上"],
  }));
  const checks = checkRefineReturn(parsed, round);
  assert.equal(checks.quotes[0].ok, false);
  assert.match(checks.quotes[0].note, /最接近的段落是 C2-P2/);
  assert.match(checks.quotes[0].nearest, /問題不在有沒有壓力/);
  assert.equal(checks.words[0].ok, false);
  assert.match(checks.words[0].note, /可能被改寫過/);
  assert.equal(refineCandidateAdoptable(checks, 1), false);
});

test("編號標錯但文字逐字時仍算相符，並說明實際位置", () => {
  const parsed = parseRefineReturn(full({
    quotes: ["C1-P1｜可是燃料燒完之後，留下來的是一台過熱的引擎。", "C1-P1｜不緊張就不會動。可是燃料燒完之後"],
    turns: ["T1｜GPT", "問", "T2｜我", "第一段回答。", "T3｜GPT", "再問", "T4｜我", "我寧願一開始就不要用緊繃來啟動。"],
    candidates: ["#1｜觀點｜T2", "原話：我寧願一開始就不要用緊繃來啟動。", "整理版：我不用緊繃啟動。", "併用：T2,T4", "#2｜觀點｜T3", "原話：再問", "整理版：再問"],
  }));
  const checks = checkRefineReturn(parsed, round);
  assert.deepEqual(checks.quotes.map((item) => [item.ok, item.note]), [[true, "逐字相符，但段落編號標錯，實際在 C1-P2"], [true, "逐字相符，這一句跨越 C1 的多個段落"]]);
  assert.deepEqual([checks.words[0].ok, checks.words[0].note], [true, "逐字相符，但發言編號標錯，實際在 T4"]);
  assert.deepEqual(parsed.candidates[0].merged, [2, 4]);
  assert.match(checks.words[1].note, /T3 是 GPT 的發言/);
});

test("缺區塊、編號不連續、不屬於這一輪時各自回報，並產生補救指令", () => {
  const broken = ["===野採討論/v2===", "討論包ID: YC-OTHER", "採集: C1", "===逐字問答===", "T1|GPT", "問", "T3|我", "答"].join("\n");
  const checks = checkRefineReturn(parseRefineReturn(broken), round);
  assert.deepEqual(checks.missing, ["原文引用", "候選", "GPT延伸", "待查證", "未回答"]);
  assert.deepEqual(checks.turnGaps, ["第 2 則的編號是 T3"]);
  assert.equal(checks.idOk, false);
  assert.match(checks.idNote, /YC-OTHER/);
  assert.match(refineRescuePrompt(checks), /缺少這些區塊：原文引用、候選、GPT延伸、待查證、未回答。\n逐字問答的編號不連續/);
  const wrongSet = checkRefineReturn(parseRefineReturn(full().replace("採集：C1,C2", "採集：C1")), round);
  assert.match(wrongSet.idNote, /帶入的採集不一致/);
  assert.equal(checkRefineReturn(parseRefineReturn(""), null).idOk, false);
  assert.ok(checkRefineReturn(parseRefineReturn("沒有任何標記的文字"), round).missing[0].startsWith("識別"));
});

test("仍接受第一版把待查與未回答合在一起的回傳", () => {
  const v1 = full().replace(`===${REFINE_FORMAT}===`, "===野採討論/v1===")
    .replace("===待查證===\n- C1-P2：過熱的說法尚待查證。\n===未回答===", "===待查與未回答===\n- C1-P2：過熱的說法尚待查證。");
  const parsed = parseRefineReturn(v1);
  assert.deepEqual([parsed.toVerify.length, parsed.unanswered.length], [0, 2]);
  assert.deepEqual(checkRefineReturn(parsed, round).missing, []);
});

test("GPT 用 K1、E1 編候選時依序編號並保留原標籤；〔備註〕標題之後的行不算進上一個區塊", () => {
  const raw = full({ candidates: ["#K1｜洞察｜T2", "原話：做完之後我會累到兩三天都不想碰任何東西。", "#E1｜觀點｜T2", "原話：那種緊繃會讓我動起來"] })
    .replace("===結束===", "〔回傳核對備註〕\n- 討論包ID 待補。\n===結束===");
  const parsed = parseRefineReturn(raw);
  assert.deepEqual(parsed.candidates.map((c) => [c.n, c.tag]), [[1, "K1"], [2, "E1"]]);
  assert.deepEqual(parsed.unanswered, ["不用緊繃的話，用什麼方式開始？"]);
  const checks = checkRefineReturn(parsed, round);
  assert.deepEqual(checks.words.map((w) => w.ok), [true, true]);
  // 一般的數字編號不受影響
  assert.equal(parseRefineReturn(full()).candidates[0].tag, undefined);
});
