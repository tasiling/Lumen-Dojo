import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [service, store, ui, dispatch, route] = await Promise.all([
  read("lib/dojo/unitArrangementService.ts"),
  read("lib/dojo/unitArrangementStore.ts"),
  read("app/components/UnitArrangementDialog.tsx"),
  read("lib/dojo/englishImageDispatch.ts"),
  read("app/api/dojo/english-images/unit-arrangement/route.ts"),
]);

assert.match(service, /supportsUnitArrangement/);
assert.match(service, /supportsEnsureUnit/);
assert.match(service, /ensureGroupUnit/);
assert.match(service, /unitMode: "existing"/);
assert.match(service, /snapshot\.expressions/);
assert.match(service, /calculateSourceContentFingerprint\(entry\) !== source\.contentFingerprint/);
assert.match(service, /updateEnglishImageEntry\(entry\.id, \(current\)/);
assert.match(service, /retryFailedOnly/);
assert.match(service, /execution\.status === "succeeded"/);
assert.match(store, /groupUnitIds: Record<string, string>/);
assert.match(store, /dispatchId: string/);
assert.match(store, /requestFingerprint: string/);
assert.match(ui, /加入或移除本次素材/);
assert.match(ui, /使用者暫不派送/);
assert.match(ui, /只重試失敗／結果未知項目/);
assert.match(ui, /繼續尚未完成的編排/);
assert.match(ui, /來源分類與專案類型不同/);
assert.match(dispatch, /sourceRecordIds/);
assert.match(route, /crossTypeConfirmed: body\.crossTypeConfirmed === true/);

console.log("unit arrangement contract checks passed");
