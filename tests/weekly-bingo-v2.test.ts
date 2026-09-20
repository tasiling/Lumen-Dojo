import assert from "node:assert/strict";
import {
  completedBingoLineIds,
  emptyBingoCell,
  emptyWeeklyBoard,
  normalizeWeeklyBoard,
  type BingoCell,
} from "../lib/dojo/formal";
import { defaultWeeklyTemplateLibrary, normalizeWeeklyTemplateLibrary, templateToCell } from "../lib/dojo/weeklyTemplates";

const week = "2026-09-14";
const board = emptyWeeklyBoard(week);
assert.equal(board.cells.length, 25, "T01: board has 25 positions without requiring 24 tasks");
assert.equal(board.cells.filter((cell) => cell.text).length, 1, "T01: empty weekly board is valid");
assert.equal(board.cells[12].completed, true, "T03: center FREE is complete");
assert.equal(board.cells[0].text, "", "T02: blank position remains available");

const library = defaultWeeklyTemplateLibrary();
for (const mode of ["single", "count", "specified", "free"] as const) {
  assert.ok(library.templates.some((item) => item.completionMode === mode), `T04: ${mode} completion rule exists`);
}
const vocab = library.templates.find((item) => item.id === "english-vocabforge-science")!;
const countCell = templateToCell(vocab, 0, week);
countCell.completion.progress = 2;
let normalized = normalizeWeeklyBoard({ ...board, version: 3, cells: [countCell] }, week);
assert.equal(normalized.cells[0].completion.progress, 2, "T05: cumulative progress is preserved");
normalized.cells[0].completion.target = 3;
normalized = normalizeWeeklyBoard(normalized, week);
assert.equal(normalized.cells[0].completion.progress, 2, "T06: editing target preserves progress");

const oldId = normalized.cells[0].taskInstanceId;
const replacement = templateToCell(library.templates[1], 0, week);
assert.notEqual(replacement.taskInstanceId, oldId, "T07: replacement receives a new task ID");
assert.equal(replacement.completion.progress, 0, "T07: replacement does not inherit progress");
const moved = { ...replacement, index: 8 };
assert.equal(moved.taskInstanceId, replacement.taskInstanceId, "T08: moving preserves task ID");
assert.equal(moved.completion.progress, replacement.completion.progress, "T08: moving preserves progress");

assert.ok(library.templates.some((item) => item.source === "routine"), "T10: routine templates exist");
assert.ok(library.templates.some((item) => item.source === "project"), "T11: project templates exist");
const customLibrary = normalizeWeeklyTemplateLibrary({ ...library, templates: [...library.templates, { ...vocab, id: "mine", name: "我的任務", builtIn: false }] });
assert.ok(customLibrary.templates.some((item) => item.id === "mine"), "T12: custom template persists");
const instance = templateToCell(vocab, 1, week);
instance.text = "本週自訂名稱";
assert.equal(vocab.name, "VocabForge科學複習", "T13: editing instance does not mutate template");
const freeTemplate = library.templates.find((item) => item.completionMode === "free")!;
assert.equal(templateToCell(freeTemplate, 2, week).completion.requiresEvidence, true, "T04: free result requires an outcome before completion");
assert.equal(library.bundles.find((item) => item.id === "english-6-plus-2")?.templateIds.length, 8, "T14: English 6+2 bundle exists");
assert.ok(library.templates.some((item) => item.id === "english-weekly-revisit"), "T15: cross-week revisit exists");
assert.ok(library.templates.some((item) => item.id === "english-biweekly-revisit"), "T15: cross-biweekly revisit exists");
const archived = normalizeWeeklyTemplateLibrary({ ...library, templates: library.templates.map((item) => item.id === vocab.id ? { ...item, status: "archived" } : item) });
assert.equal(archived.templates.find((item) => item.id === vocab.id)?.status, "archived", "T16: archived template stays archived");

const legacy = normalizeWeeklyBoard({ version: 1, cells: [{ ...emptyBingoCell(0, week), text: "舊任務", completed: true, completion: undefined }] }, week);
assert.equal(legacy.cells[0].text, "舊任務", "T17: legacy task is readable");
assert.equal(legacy.cells[0].completed, true, "T17: legacy completion is retained");

function completedBoard(indexes: number[]): ReturnType<typeof emptyWeeklyBoard> {
  const next = emptyWeeklyBoard(week);
  next.cells = next.cells.map((cell): BingoCell => indexes.includes(cell.index) ? { ...cell, text: cell.index === 12 ? cell.text : `任務${cell.index}`, category: cell.index % 2 ? "important" : "hobby", completion: { ...cell.completion, progress: 1 }, completed: true } : cell);
  return next;
}
assert.deepEqual(completedBingoLineIds(completedBoard([0, 1, 2, 3, 4])), ["line-0"], "T18: horizontal line");
assert.deepEqual(completedBingoLineIds(completedBoard([0, 5, 10, 15, 20])), ["line-5"], "T19: vertical line");
assert.deepEqual(completedBingoLineIds(completedBoard([0, 6, 12, 18, 24])), ["line-10"], "T20/T21: diagonal cross-color line");
const multi = completedBingoLineIds(completedBoard([0, 1, 2, 3, 4, 5, 10, 15, 20]));
assert.deepEqual(multi, ["line-0", "line-5"], "T22: multiple lines");

const linked = templateToCell(vocab, 3, week);
linked.assignedDate = "2026-09-16"; linked.assignedCategory = "important"; linked.completion.progress = 1;
const reloaded = normalizeWeeklyBoard(JSON.parse(JSON.stringify({ ...board, version: 3, cells: [linked] })), week);
assert.equal(reloaded.cells[3].assignedDate, "2026-09-16", "T24: daily assignment link survives normalization");
assert.equal(reloaded.cells[3].taskInstanceId, linked.taskInstanceId, "T25: reload preserves task instance and data");

console.log("weekly-bingo-v2: model assertions passed");
