import { normalizeWorkflow, type WorkflowSelection, type TextWorkflow } from "./weavingWorkflow/model";
import { serializeWorkflow } from "./weavingWorkflow/serialize";
import { WEAVING_SHUTTLE_TITLE_PREFIX, WEAVING_WORK_TITLE_PREFIX } from "./formal";
import type { WeavingFormat, WeavingProject, WeavingSourceRef } from "./weavingProjects";

export type ShuttleStatus = "active" | "resting" | "branched" | "archived";
export type WorkStatus = "selecting" | "drafting" | "producing" | "reviewing" | "completed" | "sent_to_liaojie" | "archived";
export type CoreImpact = "unchanged" | "expanded" | "changed" | "branched";
export type ReflectionNextMove = "adapt" | "update_core" | "branch" | "rest";

export type CoreIdeaVersion = {
  id: string;
  number: number;
  statement: string;
  changeNote: string;
  derivedFromWorkId: string | null;
  createdAt: string;
};

export type WeavingReflection = {
  insight: string;
  coreImpact: CoreImpact;
  nextMove: ReflectionNextMove;
  createdAt: string;
};

export type WeavingShuttle = {
  version: 3;
  recordType: "weaving-shuttle";
  revision: number;
  id: string;
  title: string;
  sourceType: string;
  sourceId: string | null;
  sourceRefs: WeavingSourceRef[];
  sourceSnapshot: string;
  sourceSelections: WorkflowSelection[];
  audience: string;
  direction: string;
  status: ShuttleStatus;
  coreVersions: CoreIdeaVersion[];
  currentCoreVersionId: string;
  branchedFromShuttleId: string | null;
  branchedFromWorkId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type WeavingWork = {
  version: 1;
  recordType: "weaving-work";
  revision: number;
  textWorkflow?: TextWorkflow;
  legacyProjectId: string | null;
  completionVersionRefs: string[];
  currentCompletionVersionId: string | null;
  id: string;
  shuttleId: string;
  title: string;
  coreVersionId: string;
  format: WeavingFormat;
  formatSubtype: string;
  status: WorkStatus;
  nextAction: string;
  draftText: string;
  finalSnapshot: string;
  outputUrl: string;
  toolKey: string | null;
  derivedFromWorkId: string | null;
  reflection: WeavingReflection | null;
  completedAt: string | null;
  sentToLiaojieAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type WeavingShuttleBundle = {
  shuttle: WeavingShuttle;
  works: WeavingWork[];
  legacyProjectId: string | null;
};

const SHUTTLE_STATUSES: ShuttleStatus[] = ["active", "resting", "branched", "archived"];
const WORK_STATUSES: WorkStatus[] = ["selecting", "drafting", "producing", "reviewing", "completed", "sent_to_liaojie", "archived"];
const CORE_IMPACTS: CoreImpact[] = ["unchanged", "expanded", "changed", "branched"];
const NEXT_MOVES: ReflectionNextMove[] = ["adapt", "update_core", "branch", "rest"];

function text(value: unknown, max: number): string { return typeof value === "string" ? value.trim().slice(0, max) : ""; }
function nullableText(value: unknown, max: number): string | null { return text(value, max) || null; }
function iso(value: unknown): string { return text(value, 50); }

function normalizeRefs(value: unknown): WeavingSourceRef[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const source = item as Record<string, unknown>;
    const sourceType = text(source.sourceType, 100);
    const sourceId = text(source.sourceId, 300);
    return sourceType && sourceId ? [{ sourceType, sourceId }] : [];
  }).filter((ref, index, rows) => rows.findIndex((row) => row.sourceType === ref.sourceType && row.sourceId === ref.sourceId) === index).slice(0, 30);
}

function normalizeVersions(value: unknown): CoreIdeaVersion[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item, index) => {
    if (!item || typeof item !== "object") return [];
    const source = item as Record<string, unknown>;
    const statement = text(source.statement, 3000);
    if (!statement) return [];
    return [{
      id: text(source.id, 100) || `core-${index + 1}`,
      number: typeof source.number === "number" && source.number > 0 ? Math.floor(source.number) : index + 1,
      statement,
      changeNote: text(source.changeNote, 2000),
      derivedFromWorkId: nullableText(source.derivedFromWorkId, 300),
      createdAt: iso(source.createdAt) || new Date().toISOString(),
    }];
  });
}

export function currentCore(shuttle: WeavingShuttle): CoreIdeaVersion {
  return shuttle.coreVersions.find((version) => version.id === shuttle.currentCoreVersionId)
    ?? shuttle.coreVersions[shuttle.coreVersions.length - 1];
}

export function normalizeWeavingShuttle(value: unknown, options: { id: string; touch?: boolean }): WeavingShuttle | null {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  if (source.recordType !== "weaving-shuttle") return null;
  const now = new Date().toISOString();
  const versions = normalizeVersions(source.coreVersions);
  if (!versions.length) return null;
  const title = text(source.title, 200);
  if (!title) return null;
  const createdAt = iso(source.createdAt) || now;
  const sourceType = text(source.sourceType, 100) || "manual";
  const sourceId = nullableText(source.sourceId, 300);
  const refs = normalizeRefs(source.sourceRefs);
  if (sourceId && !refs.some((ref) => ref.sourceType === sourceType && ref.sourceId === sourceId)) refs.unshift({ sourceType, sourceId });
  const requestedCurrent = text(source.currentCoreVersionId, 100);
  return {
    revision: typeof source.revision === "number" && Number.isInteger(source.revision) && source.revision >= 0 ? source.revision : 0,
    version: 3, recordType: "weaving-shuttle", id: options.id, title,
    sourceSelections: normalizeWorkflow({ schemaVersion: 1, templateKey: 'legacy', currentStep: 'sources', outputKind: 'article', blocks: [], sourceSelections: source.sourceSelections ?? [], audience: '', outline: '' })!.sourceSelections,
    sourceType, sourceId, sourceRefs: refs, sourceSnapshot: text(source.sourceSnapshot, 30000),
    audience: text(source.audience, 1000), direction: text(source.direction, 3000),
    status: SHUTTLE_STATUSES.includes(source.status as ShuttleStatus) ? source.status as ShuttleStatus : "active",
    coreVersions: versions,
    currentCoreVersionId: versions.some((version) => version.id === requestedCurrent) ? requestedCurrent : versions[versions.length - 1].id,
    branchedFromShuttleId: nullableText(source.branchedFromShuttleId, 300),
    branchedFromWorkId: nullableText(source.branchedFromWorkId, 300),
    createdAt, updatedAt: options.touch ? now : (iso(source.updatedAt) || createdAt),
  };
}

function normalizeReflection(value: unknown): WeavingReflection | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  const insight = text(source.insight, 5000);
  if (!insight) return null;
  return {
    insight,
    coreImpact: CORE_IMPACTS.includes(source.coreImpact as CoreImpact) ? source.coreImpact as CoreImpact : "unchanged",
    nextMove: NEXT_MOVES.includes(source.nextMove as ReflectionNextMove) ? source.nextMove as ReflectionNextMove : "rest",
    createdAt: iso(source.createdAt) || new Date().toISOString(),
  };
}

export function normalizeWeavingWork(value: unknown, options: { id: string; touch?: boolean }): WeavingWork | null {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  if (source.recordType !== "weaving-work") return null;
  const shuttleId = text(source.shuttleId, 300);
  const title = text(source.title, 200);
  const coreVersionId = text(source.coreVersionId, 100);
  const format = source.format === "text" || source.format === "comic" || source.format === "video" ? source.format : null;
  if (!shuttleId || !title || !coreVersionId || !format) return null;
  const now = new Date().toISOString();
  const createdAt = iso(source.createdAt) || now;
  const workflow = normalizeWorkflow(source.textWorkflow);
  return {
    revision: typeof source.revision === "number" && Number.isInteger(source.revision) && source.revision >= 0 ? source.revision : 0,
    ...(workflow ? { textWorkflow: workflow } : {}),
    legacyProjectId: nullableText(source.legacyProjectId,300),
    completionVersionRefs: Array.isArray(source.completionVersionRefs) ? [...new Set(source.completionVersionRefs.filter((id): id is string => typeof id === "string"))] : [],
    currentCompletionVersionId: nullableText(source.currentCompletionVersionId, 300),
    version: 1, recordType: "weaving-work", id: options.id, shuttleId, title, coreVersionId, format,
    formatSubtype: text(source.formatSubtype, 100) || (format === "text" ? "unselected" : "planned"),
    status: WORK_STATUSES.includes(source.status as WorkStatus) ? source.status as WorkStatus : "selecting",
    nextAction: text(source.nextAction, 1000) || (format === "text" ? "選擇本次文字形式" : "整理本次作品方向"),
    draftText: workflow ? serializeWorkflow(workflow) : text(source.draftText, 80000), finalSnapshot: text(source.finalSnapshot, 80000),
    outputUrl: text(source.outputUrl, 2000), toolKey: nullableText(source.toolKey, 100),
    derivedFromWorkId: nullableText(source.derivedFromWorkId, 300), reflection: normalizeReflection(source.reflection),
    completedAt: nullableText(source.completedAt, 50), sentToLiaojieAt: nullableText(source.sentToLiaojieAt, 50),
    createdAt, updatedAt: options.touch ? now : (iso(source.updatedAt) || createdAt),
  };
}

export function shuttleRecordTitle(nonce: string): string { return `${WEAVING_SHUTTLE_TITLE_PREFIX}${nonce}`; }
export function workRecordTitle(nonce: string): string { return `${WEAVING_WORK_TITLE_PREFIX}${nonce}`; }
export function shuttleContent(shuttle: WeavingShuttle): Omit<WeavingShuttle, "id"> { const { id: _id, ...content } = shuttle; void _id; return content; }
export function workContent(work: WeavingWork): Omit<WeavingWork, "id"> { const { id: _id, ...content } = work; void _id; return content; }

export function createShuttleDraft(input: {
  id?: string; title: string; sourceType: string; sourceId?: string | null; sourceRefs?: WeavingSourceRef[];
  sourceSnapshot: string; coreStatement: string; audience?: string; direction?: string;
  branchedFromShuttleId?: string | null; branchedFromWorkId?: string | null;
}): WeavingShuttle {
  const now = new Date().toISOString();
  const coreId = crypto.randomUUID();
  return normalizeWeavingShuttle({
    version: 3, recordType: "weaving-shuttle", title: input.title, sourceType: input.sourceType,
    sourceId: input.sourceId ?? null, sourceRefs: input.sourceRefs ?? [], sourceSnapshot: input.sourceSnapshot,
    audience: input.audience ?? "", direction: input.direction ?? "", status: "active",
    coreVersions: [{ id: coreId, number: 1, statement: input.coreStatement, changeNote: "最初建立", derivedFromWorkId: null, createdAt: now }],
    currentCoreVersionId: coreId, branchedFromShuttleId: input.branchedFromShuttleId ?? null,
    branchedFromWorkId: input.branchedFromWorkId ?? null, createdAt: now, updatedAt: now,
  }, { id: input.id ?? "pending" })!;
}

export function createWorkDraft(input: {
  id?: string; shuttleId: string; title: string; coreVersionId: string; format: WeavingFormat;
  formatSubtype?: string; derivedFromWorkId?: string | null; draftText?: string; outputUrl?: string;
}): WeavingWork {
  const now = new Date().toISOString();
  return normalizeWeavingWork({
    version: 1, recordType: "weaving-work", shuttleId: input.shuttleId, title: input.title,
    coreVersionId: input.coreVersionId, format: input.format, formatSubtype: input.formatSubtype ?? "unselected",
    status: "selecting", nextAction: input.format === "text" ? "選擇本次文字形式" : input.format === "comic" ? "整理漫畫的觀點核心" : "整理影片的核心觀點與口播方向",
    draftText: input.draftText ?? "", finalSnapshot: "", outputUrl: input.outputUrl ?? "", toolKey: null,
    derivedFromWorkId: input.derivedFromWorkId ?? null, reflection: null, completedAt: null,
    sentToLiaojieAt: null, createdAt: now, updatedAt: now,
  }, { id: input.id ?? "pending" })!;
}

export function legacyBundle(project: WeavingProject): WeavingShuttleBundle {
  const now = project.createdAt || new Date().toISOString();
  const coreId = `legacy-core-${project.id}`;
  const shuttle = normalizeWeavingShuttle({
    version: 3, recordType: "weaving-shuttle", title: project.title, sourceType: project.sourceType,
    sourceId: project.sourceId, sourceRefs: project.sourceRefs, sourceSnapshot: project.sourceSnapshot,
    audience: project.audience, direction: "", status: project.status === "archived" ? "archived" : "active",
    coreVersions: [{ id: coreId, number: 1, statement: project.coreStatement, changeNote: "由舊版織光案保留", derivedFromWorkId: null, createdAt: now }],
    currentCoreVersionId: coreId, branchedFromShuttleId: null, branchedFromWorkId: null,
    createdAt: now, updatedAt: project.updatedAt,
  }, { id: project.id })!;
  const work = normalizeWeavingWork({
    version: 1, recordType: "weaving-work", shuttleId: project.id, title: project.title,
    coreVersionId: coreId, format: project.format, formatSubtype: project.formatSubtype,
    status: project.status, nextAction: project.nextAction, draftText: project.draftText,
    finalSnapshot: project.status === "completed" || project.status === "sent_to_liaojie" ? project.draftText : "",
    outputUrl: project.outputUrl, toolKey: project.toolKey, derivedFromWorkId: null, reflection: null,
    completedAt: project.status === "completed" || project.status === "sent_to_liaojie" ? project.updatedAt : null,
    sentToLiaojieAt: project.sentToLiaojieAt, createdAt: now, updatedAt: project.updatedAt,
  }, { id: `legacy:${project.id}` })!;
  return { shuttle, works: [work], legacyProjectId: project.id };
}
