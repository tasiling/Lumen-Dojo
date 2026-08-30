import {
  WEAVING_OUTPUT_TYPES,
  WEAVING_PROJECT_TITLE_PREFIX,
  type WeavingOutputType,
  type WeavingProductionStatus,
} from "./formal";
import type { InsightCardWithBook } from "@/lib/reading/types";

export type ReadingWeavingProject = {
  version: 1;
  recordType: "reading-weaving-project";
  id: string;
  title: string;
  outputType: WeavingOutputType;
  status: WeavingProductionStatus;
  insightCardIds: string[];
  productionNote: string;
  outputUrl: string;
  createdAt: string;
  updatedAt: string;
};

export type ReadingWeavingProjectWithCards = ReadingWeavingProject & {
  cards: InsightCardWithBook[];
};

const STATUSES: WeavingProductionStatus[] = ["ready", "outline", "draft", "revision", "completed"];

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function weavingProjectRecordTitle(nonce: string): string {
  return `${WEAVING_PROJECT_TITLE_PREFIX}${nonce}`;
}

export function normalizeReadingWeavingProject(
  value: unknown,
  options: { id: string; touch?: boolean }
): ReadingWeavingProject | null {
  const source = value && typeof value === "object" ? value as Partial<ReadingWeavingProject> : {};
  const outputType = typeof source.outputType === "string" && source.outputType in WEAVING_OUTPUT_TYPES
    ? source.outputType as WeavingOutputType
    : null;
  const insightCardIds = Array.isArray(source.insightCardIds)
    ? [...new Set(source.insightCardIds.filter((id): id is string => typeof id === "string" && Boolean(id.trim())).map((id) => id.trim()))].slice(0, 12)
    : [];
  if (!outputType || insightCardIds.length === 0) return null;
  const now = new Date().toISOString();
  const createdAt = text(source.createdAt, 40) || now;
  return {
    version: 1,
    recordType: "reading-weaving-project",
    id: options.id,
    title: text(source.title, 200) || "未命名閱讀企劃",
    outputType,
    status: STATUSES.includes(source.status as WeavingProductionStatus) ? source.status as WeavingProductionStatus : "ready",
    insightCardIds,
    productionNote: text(source.productionNote, 10000),
    outputUrl: text(source.outputUrl, 2000),
    createdAt,
    updatedAt: options.touch ? now : (text(source.updatedAt, 40) || createdAt),
  };
}

export function readingWeavingProjectContent(project: ReadingWeavingProject): Omit<ReadingWeavingProject, "id"> {
  const { id: _id, ...content } = project;
  void _id;
  return content;
}
