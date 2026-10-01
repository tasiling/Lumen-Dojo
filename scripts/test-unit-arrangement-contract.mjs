import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [service, store, ui, dispatch, route, imageStore, lease] = await Promise.all([
  read("lib/dojo/unitArrangementService.ts"),
  read("lib/dojo/unitArrangementStore.ts"),
  read("app/components/UnitArrangementDialog.tsx"),
  read("lib/dojo/englishImageDispatch.ts"),
  read("app/api/dojo/english-images/unit-arrangement/route.ts"),
  read("lib/dojo/englishImageStore.ts"),
  read("lib/dojo/integrationMutationLease.ts"),
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
assert.match(service, /coordinate\("acquire"/);
assert.match(service, /coordinate\("claim"/);
assert.match(service, /coordinate\("authorize"/);
assert.match(service, /coordinate\("complete"/);
assert.match(service, /coordinate\("cancel"/);
assert.match(service, /binding\.revision === snapshot\.revision/);
assert.match(service, /binding\.contentFingerprint === snapshot\.contentFingerprint/);
assert.match(service, /binding\.pendingResult !== true/);
assert.doesNotMatch(service, /if \(record\.groupUnitIds\[group\.groupRef\]\) return/);
assert.match(store, /groupUnitIds: Record<string, string>/);
assert.match(store, /approvalFingerprint: string/);
assert.match(store, /coordinationVersion: number/);
assert.match(store, /dispatchId: string/);
assert.match(store, /requestFingerprint: string/);
assert.match(ui, /加入或移除本次素材/);
assert.match(ui, /使用者暫不派送/);
assert.match(ui, /只重試失敗／結果未知項目/);
assert.match(ui, /繼續尚未完成的編排/);
assert.match(ui, /來源分類與專案類型不同/);
assert.match(dispatch, /sourceRecordIds/);
assert.match(dispatch, /supportsArrangementCoordinator/);
assert.match(dispatch, /supportsMutationLease/);
assert.match(dispatch, /updateEnglishImageEntry\(entry\.id/);
assert.match(route, /crossTypeConfirmed: body\.crossTypeConfirmed === true/);
assert.match(route, /refreshUnitArrangement/);
assert.match(imageStore, /withIntegrationMutationLease/);
assert.match(imageStore, /entry\.updatedAt !== current\.entry\.updatedAt/);
assert.match(lease, /mutation-leases/);
assert.match(lease, /action: "renew"/);
assert.match(lease, /assertCurrent/);
assert.match(imageStore, /guard\.assertCurrent\(\)/);

console.log("unit arrangement contract checks passed");
