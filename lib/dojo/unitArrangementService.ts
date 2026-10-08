import "server-only";

import { englishImageContextCandidates, listEnglishImageContextCatalog } from "./englishImageDispatch";
import { getEnglishImageEntry, updateEnglishImageEntry } from "./englishImageStore";
import {
  calculateRequestFingerprint,
  calculateSourceContentFingerprint,
  nextSourceRevision,
  sourceContent,
  SOURCE_HANDOFF_V2,
} from "./sourceHandoffV2";
import {
  arrangementSnapshotHash,
  parseUnitArrangementResult,
  UNIT_ARRANGEMENT_V1,
  unitArrangementPrompt,
  type ArrangementGroup,
  type ArrangementPending,
  type UnitArrangementPack,
} from "./unitArrangement";
import {
  getUnitArrangement,
  saveUnitArrangement,
  type ArrangementExecution,
  type UnitArrangementRecord,
} from "./unitArrangementStore";

const MAX_SOURCES = 20;
const MAX_UNITS = 100;
const FULL_TEXT_LIMIT = 12_000;
const PACK_TEXT_LIMIT = 60_000;
type CoordinatorJob = ArrangementExecution & { status: ArrangementExecution["status"] };
type CoordinatorState = { status: UnitArrangementRecord["status"]; coordinationVersion: number; leaseFence: number; jobs: CoordinatorJob[] };

function contextRoomBaseUrl() {
  return process.env.CONTEXT_ROOM_INTEGRATION_URL?.trim() || process.env.CONTEXT_ROOM_URL?.trim() || "https://lumen-context-room-production-4a2c.up.railway.app";
}

function contextRoomSecret() { return process.env.LUMEN_CONTEXT_ROOM_SYNC_SECRET?.trim() ?? ""; }

async function receiverJson(path: string, init: RequestInit = {}) {
  const secret = contextRoomSecret();
  if (!secret) throw new Error("語境修習室串接尚未完成 Railway 設定");
  const response = await fetch(new URL(path, contextRoomBaseUrl()), {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}`, ...(init.headers || {}) },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const result = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    const error = typeof result.error === "string" ? result.error : `語境修習室操作失敗（${response.status}）`;
    const code = typeof result.code === "string" ? ` [${result.code}]` : "";
    throw new Error(`${error}${code}`);
  }
  return result;
}

async function coordinate(action: string, body: Record<string, unknown>) {
  return receiverJson("/api/integrations/lumen/unit-arrangements", { method: "POST", body: JSON.stringify({ action, ...body }) }) as Promise<CoordinatorState>;
}

function mergeCoordinator(record: UnitArrangementRecord, state: CoordinatorState) {
  const bySource = new Map(state.jobs.map((job) => [job.sourceRecordId, job]));
  return { ...record, status: state.status, coordinationVersion: state.coordinationVersion, executions: record.executions.map((execution) => ({ ...execution, ...(bySource.get(execution.sourceRecordId) || {}) })) };
}
export async function refreshUnitArrangement(id: string) {
  const record = await getUnitArrangement(id);
  if (!record.approvedSnapshotHash) return record;
  const state = await coordinate("get", { arrangementId: id });
  return saveUnitArrangement(mergeCoordinator(record, state));
}

function summaryOf(entry: Awaited<ReturnType<typeof getEnglishImageEntry>>["entry"]) {
  return (entry.englishRecord || entry.chineseExplanation || entry.contextNote || entry.ocrText).trim().slice(0, 2500);
}

export async function createUnitArrangement(params: {
  sourceRecordIds: string[];
  projectId: string;
  intent: string;
  fullTextSourceIds: string[];
  crossTypeConfirmed: boolean;
}) {
  const ids = [...new Set(params.sourceRecordIds.map((id) => id.trim()).filter(Boolean))];
  if (!ids.length || ids.length > MAX_SOURCES) throw new Error(`每次請選取 1–${MAX_SOURCES} 筆英文影像`);
  const entries = await Promise.all(ids.map((id) => getEnglishImageEntry(id).then((row) => row.entry)));
  for (const entry of entries) {
    if (entry.route === "pending") throw new Error(`「${entry.title}」尚未分類，不在本次支援白名單`);
    if (!entry.englishRecord.trim() && !entry.ocrText.trim()) throw new Error(`「${entry.title}」缺少可供編排的英文內容`);
  }
  const catalog = await listEnglishImageContextCatalog(entries[0]);
  if (catalog.capability.mode !== "v2" || !catalog.capability.supportsUnitArrangement || !catalog.capability.supportsEnsureUnit || !catalog.capability.supportsArrangementCoordinator || !catalog.capability.supportsMutationLease)
    throw new Error("語境修習室尚未啟用素材編排能力；原本逐筆派送仍可使用");
  const project = catalog.projects.find((item) => item.id === params.projectId);
  if (!project || project.catalogRole !== "learning_project") throw new Error("請選擇接收端目錄中的正式長期學習專案");
  const expectedTypes = new Set(entries.map((entry) => entry.route === "game" ? "game_journey" : entry.route === "classroom" ? "class_topic" : entry.route === "reading" ? "reading" : "custom"));
  const crossType = [...expectedTypes].some((type) => type !== project.type);
  if (crossType && !params.crossTypeConfirmed) throw new Error("來源分類與目標專案類型不同，請明確確認跨類型派送");
  const fullIds = new Set(params.fullTextSourceIds);
  const unitsComplete = project.units.length <= MAX_UNITS;
  const units = project.units.slice(0, MAX_UNITS);
  const sourceSnapshots = entries.map((entry) => {
    const fingerprint = calculateSourceContentFingerprint(entry);
    const revision = nextSourceRevision(entry, fingerprint);
    const snapshot = sourceContent(entry);
    return {
      recordId: entry.id,
      revision,
      contentFingerprint: fingerprint,
      source: snapshot.source,
      content: snapshot.content,
      expressions: englishImageContextCandidates(entry).slice(0, 5),
      existingLinks: entry.contextRoomLinks,
    };
  });
  const snapshotSeed = {
    project: { id: project.id, updatedAt: project.updatedAt, units: units.map((unit) => ({ id: unit.id, updatedAt: unit.updatedAt, sourceRecordIds: unit.sourceRecordIds })) },
    sources: sourceSnapshots.map((source) => ({ recordId: source.recordId, revision: source.revision, contentFingerprint: source.contentFingerprint })),
  };
  const packId = crypto.randomUUID();
  const snapshotHash = arrangementSnapshotHash(snapshotSeed);
  let remainingText = PACK_TEXT_LIMIT;
  let packTextTruncated = false;
  const includeText = (value: string, max: number) => {
    const source = value.trim();
    const limit = Math.max(0, Math.min(max, remainingText));
    const included = source.slice(0, limit);
    remainingText -= included.length;
    if (included.length < source.length) packTextTruncated = true;
    return included;
  };
  const pack: UnitArrangementPack = {
    format: UNIT_ARRANGEMENT_V1,
    packId,
    snapshotHash,
    project: { id: project.id, title: project.title, type: project.type, goal: project.longTermGoal, description: project.description, catalogRole: project.catalogRole, archived: false, updatedAt: project.updatedAt },
    crossTypeConfirmed: crossType && params.crossTypeConfirmed,
    intent: params.intent.trim().slice(0, 4000),
    permissions: { reuseExistingUnits: true, createUnits: true, createProjects: false, modifyExistingUnits: false, createPathsOrTemplates: false },
    units: units.map((unit) => ({ id: unit.id, name: unit.label, learningGoal: unit.learningGoal, status: unit.status, sourceRecordIds: unit.sourceRecordIds })),
    sources: entries.map((entry) => {
      const full = fullIds.has(entry.id);
      const summary = includeText(summaryOf(entry), 2500);
      const englishRecord = includeText(entry.englishRecord, 4000);
      const chineseUnderstanding = includeText(entry.chineseExplanation, 2500);
      const contextNote = includeText(entry.contextNote, 1500);
      const uncertaintyNote = includeText(entry.analysisReviewReason, 1000);
      const original = full ? includeText(entry.ocrText, FULL_TEXT_LIMIT) : "";
      return {
        recordId: entry.id,
        revision: sourceSnapshots.find((item) => item.recordId === entry.id)!.revision,
        contentFingerprint: sourceSnapshots.find((item) => item.recordId === entry.id)!.contentFingerprint,
        title: entry.title,
        type: entry.route,
        sourceLabel: entry.sourceLabel,
        attachmentCount: entry.attachments.length,
        range: contextNote,
        summary,
        englishRecord,
        chineseUnderstanding,
        contextNote,
        uncertaintyNote,
        englishOriginal: original,
        contentMode: full ? "full" : "summary",
        truncated: (full && original.length < entry.ocrText.trim().length) || packTextTruncated,
        imageProvidedToGpt: false as const,
        existingDestinations: entry.contextRoomLinks.map((link) => ({ projectId: link.projectId, unitId: link.unitId, status: link.status })),
      };
    }),
    capacity: {
      unitsComplete,
      sourcesComplete: true,
      omittedSourceRecordIds: [],
      warning: [!unitsComplete ? `Unit 目錄只提供前 ${MAX_UNITS} 筆，重複檢查範圍不完整。` : "", packTextTruncated ? `文字已達 ${PACK_TEXT_LIMIT.toLocaleString()} 字元上限；截斷處已標示，請縮小批次或減少全文。` : "", "原始圖片未直接提供給 GPT；只能使用 OCR／摘要。", packId ? "正式派送仍使用伺服器保存的完整來源與附件。" : ""].filter(Boolean).join(" "),
    },
  };
  const now = new Date().toISOString();
  const record: UnitArrangementRecord = {
    version: 1, recordType: "unit-arrangement", id: packId, status: "packed", pack, sourceSnapshots,
    prompt: unitArrangementPrompt(pack), rawResult: "", groups: [], pending: [], approvedSnapshotHash: "", approvalFingerprint: "", coordinationVersion: 0,
    groupUnitIds: {}, executions: [], createdAt: now, updatedAt: now, approvedAt: null,
  };
  return saveUnitArrangement(record);
}

export async function previewUnitArrangement(id: string, rawResult: string) {
  const record = await getUnitArrangement(id);
  if (!["packed", "previewed"].includes(record.status)) throw new Error("已核准、執行或取消的編排不能被舊預覽覆蓋");
  const result = parseUnitArrangementResult(rawResult, {
    packId: record.id, snapshotHash: record.pack.snapshotHash, projectId: record.pack.project.id,
    sourceRecordIds: record.pack.sources.map((source) => source.recordId), existingUnitIds: record.pack.units.map((unit) => unit.id),
  });
  return saveUnitArrangement({ ...record, status: "previewed", rawResult, groups: result.groups, pending: result.pending });
}

function validateEditedPlan(record: UnitArrangementRecord, groups: ArrangementGroup[], pending: ArrangementPending[]) {
  const sources = new Set(record.pack.sources.map((source) => source.recordId));
  const units = new Set(record.pack.units.filter((unit) => unit.status === "active").map((unit) => unit.id));
  const seen = new Set<string>();
  for (const group of groups) {
    if (!group.accepted) continue;
    if (!group.sourceRecordIds.length) throw new Error("已接受的分組不能是空的");
    if (group.action === "reuse_unit" && !units.has(group.unitId)) throw new Error("分組引用的既有 Unit 已失效");
    if (group.action === "create_unit" && (!group.unitName.trim() || group.unitId)) throw new Error("新增 Unit 需要名稱且不能指定 UUID");
    for (const id of group.sourceRecordIds) {
      if (!sources.has(id) || seen.has(id)) throw new Error("來源分組超出允許範圍或重複");
      seen.add(id);
    }
  }
  for (const item of pending) {
    if (!sources.has(item.sourceRecordId) || seen.has(item.sourceRecordId)) throw new Error("待確認來源超出允許範圍或重複");
    seen.add(item.sourceRecordId);
  }
  const missing = [...sources].filter((id) => !seen.has(id));
  if (missing.length) throw new Error("取消或移出分組的素材必須回到待確認，不能無聲遺漏");
}

function normalizeEditedPlan(record: UnitArrangementRecord, groupsValue: unknown, pendingValue: unknown) {
  if (!Array.isArray(groupsValue) || !Array.isArray(pendingValue)) throw new Error("編排預覽格式不正確");
  const knownGroupRefs = new Set(record.groups.map((group) => group.groupRef));
  const seenGroupRefs = new Set<string>();
  const groups = groupsValue.map((raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("編排分組格式不正確");
    const item = raw as Record<string, unknown>;
    const unknown = Object.keys(item).filter((key) => !["groupRef", "action", "unitId", "unitName", "learningGoal", "sourceRecordIds", "reason", "accepted"].includes(key));
    if (unknown.length) throw new Error(`編排分組含有不支援欄位：${unknown.join("、")}`);
    const groupRef = typeof item.groupRef === "string" ? item.groupRef.trim().slice(0, 120) : "";
    if (!knownGroupRefs.has(groupRef) || seenGroupRefs.has(groupRef)) throw new Error("不能新增、遺失或重複使用提案 groupRef");
    seenGroupRefs.add(groupRef);
    if (item.action !== "reuse_unit" && item.action !== "create_unit") throw new Error("分組操作不正確");
    if (!Array.isArray(item.sourceRecordIds)) throw new Error("分組來源格式不正確");
    return {
      groupRef,
      action: item.action,
      unitId: typeof item.unitId === "string" ? item.unitId.trim().slice(0, 200) : "",
      unitName: typeof item.unitName === "string" ? item.unitName.trim().slice(0, 300) : "",
      learningGoal: typeof item.learningGoal === "string" ? item.learningGoal.trim().slice(0, 2000) : "",
      sourceRecordIds: item.sourceRecordIds.map((value) => typeof value === "string" ? value.trim().slice(0, 300) : "").filter(Boolean),
      reason: typeof item.reason === "string" ? item.reason.trim().slice(0, 2000) : "",
      accepted: item.accepted === true,
    } satisfies ArrangementGroup;
  });
  if (seenGroupRefs.size !== knownGroupRefs.size) throw new Error("不能在確認時遺失提案分組；取消的分組請保留並取消勾選");
  const pending = pendingValue.map((raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("待確認項目格式不正確");
    const item = raw as Record<string, unknown>;
    const unknown = Object.keys(item).filter((key) => !["sourceRecordId", "reason"].includes(key));
    if (unknown.length) throw new Error(`待確認項目含有不支援欄位：${unknown.join("、")}`);
    return {
      sourceRecordId: typeof item.sourceRecordId === "string" ? item.sourceRecordId.trim().slice(0, 300) : "",
      reason: typeof item.reason === "string" ? item.reason.trim().slice(0, 2000) : "使用者暫不派送",
    } satisfies ArrangementPending;
  });
  return { groups, pending };
}

export async function approveUnitArrangement(id: string, groupsValue: unknown, pendingValue: unknown) {
  const record = await getUnitArrangement(id);
  if (!["previewed", "approved"].includes(record.status)) throw new Error("此編排目前不能核准");
  const { groups, pending } = normalizeEditedPlan(record, groupsValue, pendingValue);
  validateEditedPlan(record, groups, pending);
  const currentEntries = await Promise.all(record.sourceSnapshots.map((source) => getEnglishImageEntry(source.recordId).then((row) => row.entry)));
  const changed = currentEntries.filter((entry) => {
    const source = record.sourceSnapshots.find((item) => item.recordId === entry.id)!;
    return calculateSourceContentFingerprint(entry) !== source.contentFingerprint;
  });
  if (changed.length) throw new Error(`以下素材在生成包後已變更，請重新產生或重新確認：${changed.map((entry) => entry.title).join("、")}`);
  const catalog = await listEnglishImageContextCatalog(currentEntries[0]);
  const project = catalog.projects.find((item) => item.id === record.pack.project.id);
  if (!project || project.catalogRole !== "learning_project") throw new Error("目標 Project 已封存、刪除或不再是正式學習專案");
  if (project.updatedAt !== record.pack.project.updatedAt)
    throw new Error("目標 Project 在生成包後已有更新；請重新產生編排，避免漏掉新增 Unit 或來源關聯");
  const activeUnits = new Set(project.units.filter((unit) => unit.status === "active").map((unit) => unit.id));
  for (const group of groups.filter((item) => item.accepted && item.action === "reuse_unit"))
    if (!activeUnits.has(group.unitId)) throw new Error(`既有 Unit 已移動、封存或刪除：${group.unitName || group.unitId}`);
  const receiverDestinations = new Map<string, string[]>();
  for (const unit of project.units)
    for (const sourceRecordId of unit.sourceRecordIds)
      receiverDestinations.set(sourceRecordId, [...(receiverDestinations.get(sourceRecordId) || []), unit.id]);
  for (const group of groups.filter((item) => item.accepted)) {
    for (const sourceRecordId of group.sourceRecordIds) {
      const destinations = receiverDestinations.get(sourceRecordId) || [];
      if (destinations.length && !(group.action === "reuse_unit" && destinations.includes(group.unitId)))
        throw new Error("部分素材已歸位到其他 Unit；批次編排第一版不會默默重用到第二個目的地，請重新預覽或使用逐筆派送明確確認");
    }
  }
  const approvedSnapshotHash = arrangementSnapshotHash({ groups, pending, sources: record.sourceSnapshots.map((source) => ({ id: source.recordId, fingerprint: source.contentFingerprint })) });
  const approvalFingerprint = arrangementSnapshotHash({ approvedSnapshotHash, groups, pending });
  if (record.status === "approved" && record.approvalFingerprint && record.approvalFingerprint !== approvalFingerprint)
    throw new Error("此編排已有不同核准內容；請建立新的編排意圖");
  const executions = groups.filter((group) => group.accepted).flatMap((group) => group.sourceRecordIds.map((sourceRecordId) => {
    const existing = record.executions.find((item) => item.sourceRecordId === sourceRecordId && item.groupRef === group.groupRef);
    const binding = catalog.sourceBindings.find((item) => item.sourceRecordId === sourceRecordId);
    const snapshot = record.sourceSnapshots.find((item) => item.recordId === sourceRecordId)!;
    const alreadyLinked = group.action === "reuse_unit" && binding?.unitIds.includes(group.unitId) === true && binding.revision === snapshot.revision && binding.contentFingerprint === snapshot.contentFingerprint && binding.pendingResult !== true;
    return existing || { sourceRecordId, groupRef: group.groupRef, unitId: group.unitId, dispatchId: crypto.randomUUID(), requestFingerprint: "", status: alreadyLinked ? "skipped" : "pending", error: "", result: alreadyLinked ? { outcome: "already_linked" } : null, updatedAt: new Date().toISOString() } satisfies ArrangementExecution;
  }));
  const state = await coordinate("approve", { arrangementId: id, projectId: record.pack.project.id, approvedSnapshotHash, approvalFingerprint, jobs: executions });
  return saveUnitArrangement(mergeCoordinator({ ...record, status: "approved", groups, pending, approvedSnapshotHash, approvalFingerprint, executions, approvedAt: record.approvedAt || new Date().toISOString() }, state));
}

async function ensureGroupUnit(record: UnitArrangementRecord, group: ArrangementGroup, executorId: string, leaseFence: number, sourceRecordId: string) {
  const payloadWithoutFingerprint = {
    contractVersion: UNIT_ARRANGEMENT_V1,
    operation: "ensure-unit",
    arrangementId: record.id,
    approvedSnapshotHash: record.approvedSnapshotHash,
    groupRef: group.groupRef,
    projectId: record.pack.project.id,
    unitMode: group.action === "reuse_unit" ? "existing" : "create",
    unitId: group.action === "reuse_unit" ? group.unitId : "",
    unitName: group.unitName,
    learningGoal: group.learningGoal,
    sourceRecordIds: group.sourceRecordIds,
    executorId,
    leaseFence,
    executionSourceRecordId: sourceRecordId,
  };
  const payload = { ...payloadWithoutFingerprint, requestFingerprint: calculateRequestFingerprint(payloadWithoutFingerprint) };
  const result = await receiverJson("/api/integrations/lumen/units/ensure", { method: "POST", body: JSON.stringify(payload) });
  const unitId = typeof result.unitId === "string" ? result.unitId : "";
  if (!unitId) throw new Error("語境修習室沒有回傳新 Unit UUID");
  record.groupUnitIds[group.groupRef] = unitId;
  await saveUnitArrangement(record);
  return unitId;
}

async function dispatchSnapshot(record: UnitArrangementRecord, execution: ArrangementExecution, unitId: string, executorId: string, leaseFence: number) {
  const snapshot = record.sourceSnapshots.find((item) => item.recordId === execution.sourceRecordId);
  if (!snapshot) throw new Error("找不到確認時的來源快照");
  const entryRow = await getEnglishImageEntry(snapshot.recordId);
  const entry = entryRow.entry;
  const project = record.pack.project;
  const requestWithoutFingerprint = {
    contractVersion: SOURCE_HANDOFF_V2,
    dispatchId: execution.dispatchId,
    source: { ...snapshot.source, revision: snapshot.revision, contentFingerprint: snapshot.contentFingerprint },
    target: { projectMode: "existing", projectId: project.id, projectTitle: project.title, projectType: project.type, unitMode: "existing", unitId, unitTitle: "", learningPathId: "", crossTypeConfirmed: record.pack.crossTypeConfirmed },
    content: snapshot.content,
    expressions: snapshot.expressions,
  };
  const requestFingerprint = execution.requestFingerprint || calculateRequestFingerprint(requestWithoutFingerprint);
  const requestBody = { ...requestWithoutFingerprint, requestFingerprint };
  execution.requestFingerprint = requestFingerprint;
  await coordinate("authorize", { arrangementId: record.id, executorId, leaseFence, sourceRecordId: execution.sourceRecordId, unitId, requestFingerprint });
  const now = new Date().toISOString();
  const pendingLink = {
    projectId: project.id, unitId, sourceItemId: "", sourceItemUnitId: "", projectTitle: project.title,
    unitTitle: record.groups.find((group) => group.groupRef === execution.groupRef)?.unitName || record.pack.units.find((item) => item.id === unitId)?.name || "",
    dispatchId: execution.dispatchId, requestFingerprint, sourceRevision: snapshot.revision, contentFingerprint: snapshot.contentFingerprint,
    status: "pending" as const, outcome: "", lastError: "", dispatchedAt: now, syncedAt: null,
    targetProjectMode: "existing" as const, targetUnitMode: "existing" as const,
  };
  await updateEnglishImageEntry(entry.id, (current) => ({
    contextRoomLinks: [...current.contextRoomLinks.filter((link) => link.dispatchId !== execution.dispatchId), pendingLink],
    contextRoomSourceRevision: Math.max(current.contextRoomSourceRevision, snapshot.revision),
    contextRoomContentFingerprint: snapshot.contentFingerprint,
  }));
  let result: Record<string, unknown>;
  try { result = await receiverJson("/api/integrations/lumen/import", { method: "POST", body: JSON.stringify(requestBody) }); }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await updateEnglishImageEntry(entry.id, (current) => ({ contextRoomLinks: current.contextRoomLinks.map((link) => link.dispatchId === execution.dispatchId ? { ...link, status: /timeout|aborted|network|fetch/i.test(message) ? "unknown" as const : "failed" as const, lastError: message } : link) }));
    throw error;
  }
  const receivedProjectId = typeof result.projectId === "string" ? result.projectId : "";
  const receivedUnitId = typeof result.unitId === "string" ? result.unitId : "";
  const sourceItemId = typeof result.sourceItemId === "string" ? result.sourceItemId : "";
  const sourceItemUnitId = typeof result.sourceItemUnitId === "string" ? result.sourceItemUnitId : "";
  if (!receivedProjectId || !receivedUnitId || !sourceItemId || !sourceItemUnitId) throw new Error("語境修習室回傳的接收結果不完整");
  const syncedAt = new Date().toISOString();
  const contextRoomUrl = new URL(contextRoomBaseUrl());
  contextRoomUrl.searchParams.set("materialId", receivedProjectId);
  contextRoomUrl.searchParams.set("batchId", receivedUnitId);
  try {
    await updateEnglishImageEntry(entry.id, (current) => {
      const syncedLink = { ...pendingLink, projectId: receivedProjectId, unitId: receivedUnitId, sourceItemId, sourceItemUnitId, status: "synced" as const, outcome: typeof result.outcome === "string" ? result.outcome : "source_reused", syncedAt };
      const links = [...current.contextRoomLinks.filter((link) => link.dispatchId !== execution.dispatchId && !(link.status === "synced" && link.projectId === receivedProjectId && link.unitId === receivedUnitId)), syncedLink];
      return {
        contextRoomStatus: "synced", contextRoomPreparedAt: syncedAt, contextRoomUrl: contextRoomUrl.toString(), contextRoomLinks: links,
        contextRoomExport: { sourceRecordId: entry.id, materialId: receivedProjectId, batchId: receivedUnitId, materialTitle: project.title, eventTitle: pendingLink.unitTitle, batchPosition: 1, materialReused: true, expressionCount: requestWithoutFingerprint.expressions.length, duplicate: result.duplicateDispatch === true, syncedAt },
      };
    });
  } catch (error) {
    throw new Error(`接收端已成功，但野採結果寫回失敗（結果未知）：${error instanceof Error ? error.message : String(error)}`);
  }
  return result;
}

export async function executeUnitArrangement(id: string, retryFailedOnly = false) {
  let record = await getUnitArrangement(id);
  if (!record.approvedSnapshotHash || !["approved", "partial", "executing", "completed"].includes(record.status)) throw new Error("請先確認編排預覽");
  if (record.status === "completed") return refreshUnitArrangement(id);
  const executorId = crypto.randomUUID();
  let state = await coordinate("acquire", { arrangementId: id, executorId });
  record = await saveUnitArrangement(mergeCoordinator(record, state));
  if (record.status === "cancelled" || record.status === "completed") return record;
  const leaseFence = state.leaseFence;
  for (const seed of record.executions) {
    state = await coordinate("get", { arrangementId: id });
    record = mergeCoordinator(await getUnitArrangement(id), state);
    if (record.status === "cancelled") break;
    const execution = record.executions.find((item) => item.sourceRecordId === seed.sourceRecordId)!;
    if (execution.status === "succeeded" || execution.status === "skipped") continue;
    if (retryFailedOnly && !["failed", "unknown"].includes(execution.status)) continue;
    const group = record.groups.find((item) => item.groupRef === execution.groupRef && item.accepted);
    if (!group) continue;
    try {
      state = await coordinate("claim", { arrangementId: id, executorId, leaseFence, sourceRecordId: execution.sourceRecordId, unitId: execution.unitId });
      record = mergeCoordinator(record, state);
      const unitId = await ensureGroupUnit(record, group, executorId, leaseFence, execution.sourceRecordId);
      execution.unitId = unitId;
      const result = await dispatchSnapshot(record, execution, unitId, executorId, leaseFence);
      state = await coordinate("complete", { arrangementId: id, executorId, leaseFence, sourceRecordId: execution.sourceRecordId, status: "succeeded", result });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/ARRANGEMENT_CANCELLED|編排已取消|STALE_EXECUTION_FENCE/.test(message)) break;
      const status = /timeout|aborted|network|fetch|結果未知/i.test(message) ? "unknown" : "failed";
      try { state = await coordinate("complete", { arrangementId: id, executorId, leaseFence, sourceRecordId: execution.sourceRecordId, status, error: message }); } catch { /* authoritative lease/cancel result wins */ }
    }
    record = await saveUnitArrangement(mergeCoordinator(record, state));
  }
  state = await coordinate("finish", { arrangementId: id, executorId, leaseFence });
  return saveUnitArrangement(mergeCoordinator(await getUnitArrangement(id), state));
}

export async function cancelUnitArrangement(id: string) {
  const record = await getUnitArrangement(id);
  if (record.status === "completed") throw new Error("已完成的編排不能取消");
  const state = await coordinate("cancel", { arrangementId: id, executorId: "cancel-request", leaseFence: 0 });
  return saveUnitArrangement(mergeCoordinator(record, state));
}
