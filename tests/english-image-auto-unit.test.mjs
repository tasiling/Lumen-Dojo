import assert from "node:assert/strict";
import { test } from "node:test";
import {
  autoUnitLineReport, autoUnitStatusLabel, fallbackUnitTitle, resolveAutoUnitTarget, selectableProjects,
} from "../lib/dojo/englishImageAutoUnitPlan.ts";

const entry = (overrides = {}) => ({
  id: "e1", route: "game", title: "Dragon Quest V", sourceLabel: "Dragon Quest V", capturedAt: "2026-11-24T08:00:00.000Z",
  contextRoomLinks: [], contextRoomStatus: "idle", contextRoomExport: null, contextRoomAuto: null,
  gameLearning: { kind: "interface", screens: [{ index: 1, kind: "interface", title: "裝備", unit: "equip a shield", labels: [] }] },
  ...overrides,
});
const unit = (id, label, status = "active") => ({ id, label, learningGoal: "", status });
const projects = [
  { id: "p-dq", type: "game_journey", title: "Dragon Quest V", units: [unit("u-shop", "商店與裝備介面"), unit("u-old", "舊單元", "archived")] },
  { id: "p-work", type: "custom", title: "按摩工作英文", units: [unit("u-work", "提醒客人")] },
];
const decide = (value) => ({ project: "existing", projectId: "", projectTitle: "", unit: "new", unitId: "", unitTitle: "", reason: "", ...value });
const resolve = (params) => resolveAutoUnitTarget({ entry: entry(), projects, supportsExistingUnit: true, sourceName: "Dragon Quest V", decision: null, ...params });

test("an exact title match reuses the project and the model may merge into an active unit", () => {
  const target = resolve({ decision: decide({ projectId: "p-dq", unit: "existing", unitId: "u-shop", reason: "同樣是裝備介面。" }) });
  assert.deepEqual([target.projectMode, target.materialId, target.unitMode, target.unitId, target.eventTitle], ["existing", "p-dq", "existing", "u-shop", "商店與裝備介面"]);
  assert.match(target.reason, /同樣是裝備介面/);
});

test("the model cannot merge into an archived unit, a unit of another project, or an unknown id", () => {
  for (const unitId of ["u-old", "u-work", "made-up"]) {
    const target = resolve({ decision: decide({ projectId: "p-dq", unit: "existing", unitId, unitTitle: "" }) });
    assert.equal(target.unitMode, "create");
    assert.equal(target.unitId, "");
    assert.equal(target.eventTitle, "equip a shield");
  }
});

test("the model cannot place a source into a project of another kind", () => {
  const target = resolve({ sourceName: "Zelda", entry: entry({ sourceLabel: "Zelda" }), decision: decide({ projectId: "p-work", unit: "existing", unitId: "u-work" }) });
  assert.deepEqual([target.projectMode, target.materialTitle, target.unitMode, target.crossTypeConfirmed], ["create", "Zelda", "create", false]);
  assert.deepEqual(selectableProjects(entry(), projects).map(project => project.id), ["p-dq"]);
});

test("without the model, a known source still gets a unit and an unknown one asks", () => {
  const known = resolve({ sourceName: "Zelda", entry: entry({ sourceLabel: "Zelda" }) });
  assert.deepEqual([known.projectMode, known.materialTitle, known.unitMode, known.decidedBy], ["create", "Zelda", "create", "rule"]);
  assert.equal(resolve({ sourceName: "", entry: entry({ sourceLabel: "" }) }), "ask");
  assert.equal(resolve({ sourceName: "", entry: entry({ sourceLabel: "" }), decision: decide({ project: "ask" }) }), "ask");
});

test("a model-proposed project name that already exists reuses it instead of duplicating", () => {
  const target = resolve({ sourceName: "", entry: entry({ sourceLabel: "" }), decision: decide({ project: "new", projectTitle: "dragon quest v", unitTitle: "向村長接下任務" }) });
  assert.deepEqual([target.projectMode, target.materialId, target.eventTitle, target.decidedBy], ["existing", "p-dq", "向村長接下任務", "ai"]);
});

test("the owner's pick outranks everything and may cross project kinds", () => {
  const target = resolve({ choice: { projectId: "p-work" }, decision: decide({ projectId: "p-dq", unit: "existing", unitId: "u-shop" }) });
  assert.deepEqual([target.materialId, target.unitMode, target.crossTypeConfirmed, target.decidedBy], ["p-work", "create", true, "owner"]);
  const named = resolve({ sourceName: "", entry: entry({ sourceLabel: "" }), choice: { projectTitle: "Stardew Valley" } });
  assert.deepEqual([named.projectMode, named.materialTitle], ["create", "Stardew Valley"]);
});

test("a source that already lives in a unit is updated in place", () => {
  const withHome = entry({ contextRoomLinks: [{ status: "synced", projectId: "p-dq", unitId: "u-shop" }] });
  const target = resolve({ entry: withHome, decision: decide({ project: "new", projectTitle: "Other" }) });
  assert.deepEqual([target.materialId, target.unitMode, target.unitId, target.decidedBy], ["p-dq", "existing", "u-shop", "rule"]);
  const older = resolve({ entry: withHome, supportsExistingUnit: false });
  assert.equal(older.unitMode, "create");
});

test("fallback unit names stay meaningful", () => {
  assert.equal(fallbackUnitTitle(entry()), "equip a shield");
  assert.equal(fallbackUnitTitle(entry({ route: "daily", gameLearning: null, title: "英文日常", sourceLabel: "英文日常" }), "watch out for"), "「watch out for」等表達");
  assert.equal(fallbackUnitTitle(entry({ route: "daily", gameLearning: null, title: "", sourceLabel: "" })), "2026-11-24 的素材");
});

test("LINE reports say plainly whether a unit exists", () => {
  const built = { status: "built", projectTitle: "Dragon Quest V", unitTitle: "商店與裝備介面", projectReused: true, unitReused: false, expressionCount: 4, reason: "新主題。", error: "", decidedBy: "ai", at: "x" };
  const report = autoUnitLineReport(built);
  assert.match(report, /^✅ 已在語境修習室建立新的學習單元/);
  assert.match(report, /學習專案：Dragon Quest V（既有專案）/);
  assert.match(report, /學習單元：商店與裝備介面（新建立）/);
  assert.match(report, /收進表達：4 個/);
  assert.match(autoUnitLineReport({ ...built, unitReused: true }), /^✅ 已併入語境修習室的既有學習單元/);
  assert.match(autoUnitLineReport({ ...built, status: "failed", error: "接收失敗（503）" }), /尚未建立[\s\S]*接收失敗（503）[\s\S]*再試一次/);
  assert.match(autoUnitLineReport({ ...built, status: "needs-source" }), /尚未建立[\s\S]*輸入專案名稱/);
  assert.equal(autoUnitLineReport(null), "");
  assert.equal(autoUnitStatusLabel(entry()), "尚未建立學習單元");
  assert.equal(autoUnitStatusLabel(entry({ contextRoomAuto: built })), "已建立學習單元「商店與裝備介面」");
});
