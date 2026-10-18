import { LIAOJIE_PROJECT_TITLE_PREFIX } from "./formal";

export const LIAOJIE_PLATFORMS = { plurk: "噗浪", instagram_post: "Instagram 貼文", instagram_story: "Instagram 限時動態", podcast: "Podcast", video: "影片", other: "其他" } as const;
export type LiaojiePlatform = keyof typeof LIAOJIE_PLATFORMS;
export type LiaojieStatus = "received" | "packaging" | "ready" | "scheduled" | "published" | "archived";
export type LiaojiePublicationProject = {
  revision: number; sourceCompletionVersionId: string | null; handoffOperationId: string | null;
  version: 2; recordType: "liaojie-publication-project"; id: string;
  weavingProjectId: string; weavingShuttleId: string; weavingWorkId: string; sourceCoreVersionId: string;
  sourceTitle: string; sourceCoreStatement: string; sourceOutputUrl: string; sourceDraftSnapshot: string;
  brandAngle: string; audience: string; platform: LiaojiePlatform; title: string; coverCopy: string;
  summary: string; callToAction: string; themeGroup: string; scheduledOn: string | null; status: LiaojieStatus;
  publishedUrl: string; responseNote: string; nextStep: string; createdAt: string; updatedAt: string;
};
const STATUSES: LiaojieStatus[] = ["received", "packaging", "ready", "scheduled", "published", "archived"];
function text(value: unknown, max: number) { return typeof value === "string" ? value.trim().slice(0, max) : ""; }
export function liaojieProjectRecordTitle(nonce: string) { return `${LIAOJIE_PROJECT_TITLE_PREFIX}${nonce}`; }
export function normalizeLiaojieProject(value: unknown, options: { id: string; touch?: boolean }): LiaojiePublicationProject | null {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const weavingProjectId = text(source.weavingProjectId, 300);
  const weavingShuttleId = text(source.weavingShuttleId, 300);
  const weavingWorkId = text(source.weavingWorkId, 300);
  if (!weavingProjectId && (!weavingShuttleId || !weavingWorkId)) return null;
  const now = new Date().toISOString(); const createdAt = text(source.createdAt, 50) || now;
  const platform = typeof source.platform === "string" && source.platform in LIAOJIE_PLATFORMS ? source.platform as LiaojiePlatform : "instagram_post";
  return {
    revision: typeof source.revision === "number" && Number.isInteger(source.revision) && source.revision >= 0 ? source.revision : 0,
    sourceCompletionVersionId: text(source.sourceCompletionVersionId, 300) || null, handoffOperationId: text(source.handoffOperationId, 120) || null,
    version: 2, recordType: "liaojie-publication-project", id: options.id,
    weavingProjectId, weavingShuttleId, weavingWorkId, sourceCoreVersionId: text(source.sourceCoreVersionId, 100),
    sourceTitle: text(source.sourceTitle, 200), sourceCoreStatement: text(source.sourceCoreStatement, 3000),
    sourceOutputUrl: text(source.sourceOutputUrl, 2000), sourceDraftSnapshot: text(source.sourceDraftSnapshot, 80000),
    brandAngle: text(source.brandAngle, 3000), audience: text(source.audience, 1000), platform,
    title: text(source.title, 300), coverCopy: text(source.coverCopy, 500), summary: text(source.summary, 5000),
    callToAction: text(source.callToAction, 1000), themeGroup: text(source.themeGroup, 300),
    scheduledOn: text(source.scheduledOn, 50) || null,
    status: STATUSES.includes(source.status as LiaojieStatus) ? source.status as LiaojieStatus : "received",
    publishedUrl: text(source.publishedUrl, 2000), responseNote: text(source.responseNote, 5000),
    nextStep: text(source.nextStep, 1000) || "決定首發平台", createdAt,
    updatedAt: options.touch ? now : (text(source.updatedAt, 50) || createdAt),
  };
}
export function liaojieProjectContent(project: LiaojiePublicationProject): Omit<LiaojiePublicationProject, "id"> {
  const { id: _id, ...content } = project; void _id; return content;
}
