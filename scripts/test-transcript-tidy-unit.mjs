// 逐字稿校正：簡轉繁與機器檢查的純邏輯。
import assert from "node:assert/strict";
import { loader } from "./weaving-test-harness.mjs";

const load = loader();
const t = load("lib/dojo/douyin/tidyText.ts");
const { toTraditional } = load("lib/dojo/douyin/tidy.ts");

// 簡轉繁只換字、不換詞，字數不變；一對多的字依詞挑對。
for (const [simplified, traditional] of [
  ["这个视频里，他说头发长了，后来干脆去理发。", "這個視頻裡，他說頭髮長了，後來乾脆去理髮。"],
  ["我们要了解软件和信息的区别", "我們要了解軟件和信息的區別"],
  ["面条和表面，皇后在后面，干净的干部", "麵條和表面，皇后在後面，乾淨的幹部"],
]) {
  assert.equal(toTraditional(simplified), traditional);
  assert.equal([...toTraditional(simplified)].length, [...simplified].length);
}
assert.equal(toTraditional("已經是繁體的句子。"), "已經是繁體的句子。");

// 比較時不算標點、空白、換行與〔？〕。
assert.equal(t.tidyWords("你好，世界！\n〔？〕 再見。"), "你好世界再見");
assert.equal(t.paragraphChange("今天天氣很好我們去公園", "今天天氣很好，我們去公園。"), 0);
assert.equal(t.paragraphChange("他在在家裡", "他再在家裡"), 0.2);

// 單段檢查：同音錯字可以；改寫、刪句、加句都退回。
const base = "那個就是說我們今天要講的是陶藝然後拉胚的時候手要穩不然就會歪掉";
assert.equal(t.tidyParagraphProblem(base, "那個，就是說，我們今天要講的是陶藝。然後拉坯的時候手要穩，不然就會歪掉。"), "");
assert.match(t.tidyParagraphProblem(base, "今天主題是陶藝，拉坯時手要穩，否則會歪。"), /視為改寫/);
assert.match(t.tidyParagraphProblem(base, "那個就是說我們今天要講的是陶藝。"), /視為改寫/);
assert.match(t.tidyParagraphProblem(base + "因為土很軟", base + "因為土很軟。這是我學了十年才懂的道理。"), /改寫|原稿沒有的句子/);
assert.match(t.tidyParagraphProblem(base, undefined), /沒有收到/);
const long = "我們先把土放在轉盤中間然後雙手沾水慢慢往下壓讓土置中這個步驟大概要做三到五分鐘不要急著拉高";
assert.equal(t.addedSentences(long, long.slice(0, 20) + "。" + long.slice(20) + "。").length, 0);
assert.deepEqual(t.addedSentences(long, long + "。陶藝家都說這是最重要的基本功。"), ["陶藝家都說這是最重要的基本功。"]);

// 整體檢查：個別段落退回；全文字數差超過 3% 時全部退回。
const paragraphs = ["第一段的內容是這樣講的而且還很長", "第二段我們繼續說下去不要停", "第三段就是最後的結尾了謝謝大家"];
let checked = t.checkTidy(paragraphs, ["第一段的內容是這樣講的，而且還很長。", "完全不一樣的一段話。", "第三段就是最後的結尾了，謝謝大家。"]);
assert.deepEqual(checked.reverted, [2]);
assert.equal(checked.paragraphs[1], paragraphs[1]);
assert.equal(checked.paragraphs[0], "第一段的內容是這樣講的，而且還很長。");
checked = t.checkTidy(["一二三四五六七八九十一二三四五六七八九十"], ["一二三四五六七八九十一二三四五六七八九"]);
assert.deepEqual(checked.reverted, [1], "a 5% shorter text is reverted");
checked = t.checkTidy(paragraphs, ["第一段的內容是這樣講的，\n\n而且還很長。", paragraphs[1], paragraphs[2]]);
assert.equal(checked.paragraphs[0], "第一段的內容是這樣講的，\n而且還很長。", "a break the model adds stays inside its paragraph");

// 段落邊界：校正版與原稿的第 n 段對應同一段。
const joined = t.joinTidyParagraphs(checked.paragraphs);
assert.equal(t.tidyParagraphs(joined).length, 3);

// 改動比對：合併相鄰的字，只算處數。
assert.deepEqual(t.tidyHunks("他在在家裡等我", "他再在家裡，等我。"), [{ before: "在", after: "再" }, { before: "", after: "，" }, { before: "", after: "。" }]);
assert.deepEqual(t.tidyHunks("一樣", "一樣"), []);
assert.equal(t.countTidyChanges(["他在在家裡", "沒變"], ["他再在家裡。", "沒變"]), 2);
assert.deepEqual(t.tidyComparison("甲段落\n\n乙段落", "甲段落。\n\n乙段落").map(item => item.n), [1]);

// 分批：每批約 2400 字，帶前一批最後兩句當上下文。
const many = Array.from({ length: 30 }, (_, i) => `第${i}段。` + "字".repeat(200) + "。最後一句。");
const batches = t.tidyBatches(many);
assert.ok(batches.length > 1);
assert.equal(batches.reduce((sum, b) => sum + b.paragraphs.length, 0), 30);
assert.equal(batches[0].context, "");
assert.match(batches[1].context, /最後一句。$/);
assert.ok([...batches[1].context].length <= 80);
assert.deepEqual(batches.map(b => b.start), batches.map((_, i) => batches.slice(0, i).reduce((sum, b) => sum + b.paragraphs.length, 0)));

console.log("PASS transcript tidy: char-only 簡轉繁, comparisons, per-paragraph and whole-text checks, hunks, batches");

// 貼回校正版：整份比對，不靠段落編號。只修錯字、標點、重新分段 → 直接可用；加了開場白、刪句或改寫 → 列出來給本人決定。
const rawTalk = "那個就是說我們今天要講的是陶藝然後拉胚的時候手要穩不然就會歪掉我們先把土放在轉盤中間然後雙手沾水慢慢往下壓讓土置中這個步驟大概要做三到五分鐘不要急著拉高因為土很軟你一急它就會偏掉偏掉之後就很難救回來";
const fixed = "那個，就是說，我們今天要講的是陶藝。\n\n然後拉坯的時候手要穩，不然就會歪掉。我們先把土放在轉盤中間，然後雙手沾水，慢慢往下壓，讓土置中。\n\n這個步驟大概要做三到五分鐘，不要急著拉高，因為土很軟，你一急它就會偏掉。偏掉之後就很難救回來。";
let manual = t.checkManualTidy(rawTalk, fixed);
assert.equal(manual.ok, true);
assert.deepEqual([manual.added, manual.missing], [[], []]);
manual = t.checkManualTidy(rawTalk, "以下是我幫你完整校正後的逐字稿內容：\n\n" + fixed);
assert.equal(manual.ok, false);
assert.deepEqual(manual.added, ["以下是我幫你完整校正後的逐字稿內容："]);
manual = t.checkManualTidy(rawTalk, fixed.split("\n\n").slice(0, 2).join("\n\n"));
assert.equal(manual.ok, false);
assert.ok(manual.missing.length > 0 && manual.drift > 0.03);
manual = t.checkManualTidy(rawTalk, "今天的主題是陶藝，重點在於拉坯時雙手必須保持穩定。首先將陶土置於轉盤中央並沾水下壓，整個過程約需三至五分鐘。");
assert.equal(manual.ok, false);
assert.equal(t.cleanPastedTidy("```text\n第一段。\n\n\n第二段。\n```"), "第一段。\n\n第二段。");
assert.equal(t.cleanPastedTidy("  只有一段  "), "只有一段");
