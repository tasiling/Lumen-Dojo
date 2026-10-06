import assert from "node:assert/strict";
import test from "node:test";
import {
  parseUnitArrangementResult,
  UNIT_ARRANGEMENT_MARKER,
  UNIT_ARRANGEMENT_V1,
} from "../lib/dojo/unitArrangement";

const expected = {
  packId: "pack-1",
  snapshotHash: "a".repeat(64),
  projectId: "project-1",
  sourceRecordIds: ["source-a", "source-b", "source-c"],
  existingUnitIds: ["unit-1"],
};

function result() {
  return {
    format: UNIT_ARRANGEMENT_V1,
    packId: expected.packId,
    snapshotHash: expected.snapshotHash,
    projectId: expected.projectId,
    groups: [
      { groupRef: "old", action: "reuse_unit", unitId: "unit-1", unitName: "", learningGoal: "", sourceRecordIds: ["source-a"], reason: "same chapter" },
      { groupRef: "new", action: "create_unit", unitId: "", unitName: "Chapter 2", learningGoal: "Read chapter 2", sourceRecordIds: ["source-b"], reason: "new chapter" },
    ],
    pending: [{ sourceRecordId: "source-c", reason: "insufficient range" }],
  };
}

test("parses marker plus strict ASCII JSON", () => {
  const parsed = parseUnitArrangementResult(`${UNIT_ARRANGEMENT_MARKER}\n${JSON.stringify(result())}`, expected);
  assert.equal(parsed.groups.length, 2);
  assert.equal(parsed.pending.length, 1);
});
test("normalizes delimiter smart quotes without corrupting typographic quotes in content", () => {
  const raw = JSON.stringify(result())
    .replace(/"([^"\\]*(?:\\.[^"\\]*)*)"(?=\s*:)/g, "“$1”")
    .replace(/:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/g, ": “$1”")
    .replace("same chapter", "同屬 “Chapter 1” 的內容");
  const parsed = parseUnitArrangementResult(raw, expected);
  assert.equal(parsed.groups[0].reason, "同屬 “Chapter 1” 的內容");
});

test("rejects malformed JSON, unknown fields and unselected sources", () => {
  assert.throws(() => parseUnitArrangementResult("{broken", expected), /不是有效 JSON/);
  const unknown = result() as ReturnType<typeof result> & { owner?: string };
  unknown.owner = "someone";
  assert.throws(() => parseUnitArrangementResult(JSON.stringify(unknown), expected), /不支援欄位/);
  const outside = result();
  outside.groups[0].sourceRecordIds = ["not-selected"];
  assert.throws(() => parseUnitArrangementResult(JSON.stringify(outside), expected), /未選取/);
});

test("requires every selected source to be grouped or explicitly pending", () => {
  const missing = result();
  missing.pending = [];
  assert.throws(() => parseUnitArrangementResult(JSON.stringify(missing), expected), /未被安排/);
});
