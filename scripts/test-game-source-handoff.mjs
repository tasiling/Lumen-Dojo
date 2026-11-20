import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
function load(name) {
  const file = new URL("../lib/dojo/" + name + ".ts", import.meta.url);
  const code = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const exports = {};
  runInNewContext(code, { exports, require, Date }, { filename: file.pathname });
  return exports;
}
const { normalizeEnglishImageEntry, englishImageContent } = load("englishImage");
const { sourceContent, calculateSourceContentFingerprint } = load("sourceHandoffV2");

const attachments = ["block-a", "block-b"].map((blockId, index) => ({
  id: blockId, blockId, sourceMessageId: "line" + index, mimeType: "image/png", filename: "screen.png",
}));
const screens = [{ title: "職務資格", label: "Requirements", kind: "interface" }, { title: "角色對白", label: "Good luck!", kind: "story" }]
  .map(({ title, label, kind }, index) => ({ index: index + 1, kind, title, labels: [{ text: label, meaning: "畫面原文" }],
    operation: "閱讀選項", restriction: "圖中未說明", consequence: "圖中未說明", evidence: label, unit: "原圖閱讀" }));
const seed = { route: "game", title: "一組遊戲截圖", attachments, gameLearningMode: "auto", gameLearning: { kind: "mixed", screens } };
const normalize = value => normalizeEnglishImageEntry(value, { id: "source-1" });

test("a reload and v2 import bind each page of the lesson to its original attachment", () => {
  const entry = normalize(seed);
  const persisted = JSON.parse(JSON.stringify(englishImageContent(entry)));
  const reread = normalize(persisted);
  const payload = sourceContent(reread);
  assert.deepEqual(Array.from(reread.gameLearningSourceIds), ["block-a", "block-b"]);
  assert.equal(payload.content.gameLearning.kind, "mixed");
  for (const [offset, screen] of payload.content.gameLearning.screens.entries()) {
    assert.equal(screen.index, payload.source.attachments[offset].position);
    assert.equal(payload.source.attachments[offset].notionBlockId, attachments[offset].blockId);
    assert.equal(screen.evidence, screens[offset].evidence);
    assert.equal(screen.labels[0].text, screens[offset].labels[0].text);
  }
  const edited = structuredClone(persisted);
  edited.gameLearning.screens[0].restriction = "需要先達到等級門檻（原圖標示）";
  assert.notEqual(calculateSourceContentFingerprint(reread), calculateSourceContentFingerprint(normalize(edited)));
});

test("a changed order, a missing page or a duplicate index cannot dispatch misbound evidence", () => {
  const persisted = englishImageContent(normalize(seed));
  const reversed = normalize({ ...persisted, attachments: [...attachments].reverse() });
  assert.equal(reversed.gameLearning, undefined);
  assert.throws(() => sourceContent(reversed), /逐圖教材/);
  for (const invalid of [[screens[0]], [screens[0], screens[0]]]) {
    const broken = normalize({ ...persisted, gameLearning: { kind: "interface", screens: invalid } });
    assert.equal(broken.gameLearning, undefined);
    assert.throws(() => sourceContent(broken), /逐圖教材/);
  }
});

test("historical game records, and other screenshot types, retain their prior handoff format", () => {
  const legacy = normalize({ route: "game", attachments, englishRecord: "They talked." });
  assert.equal(legacy.gameLearningMode, undefined);
  assert.equal(sourceContent(legacy).content.englishRecord, "They talked.");
  assert.equal("gameLearning" in sourceContent(legacy).content, false);
  const daily = normalize({ ...seed, route: "daily" });
  assert.equal("gameLearning" in sourceContent(daily).content, false);
});
