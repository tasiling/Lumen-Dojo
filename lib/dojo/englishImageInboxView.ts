import type { EnglishImageEntry, EnglishImageRoute } from "./englishImage";

export type EnglishImageStage = "all" | "classification" | "analysis" | "dispatch" | "error";
export type EnglishImageSort = "captured-desc" | "captured-asc" | "updated-desc";

export function englishImageStage(entry: EnglishImageEntry): Exclude<EnglishImageStage, "all"> {
  if (entry.analysisStatus === "failed" || entry.analysisStatus === "needs-review" || entry.vocabForgeSyncStates.some((item) => item.status === "failed")) return "error";
  if (entry.route === "pending") return "classification";
  if (entry.analysisStatus === "idle" || entry.analysisStatus === "processing") return "analysis";
  return "dispatch";
}

export function englishImageStageLabel(entry: EnglishImageEntry): string {
  const stage = englishImageStage(entry);
  if (stage === "classification") return "待分類";
  if (stage === "analysis") return entry.analysisStatus === "processing" ? "AI 分析中" : "待分析";
  if (stage === "error") return entry.analysisStatus === "needs-review" ? "需要確認" : "處理異常";
  if (entry.contextRoomStatus === "synced" && entry.vocabForgeExports.length > 0) return "已派送・可完成";
  return "待挑選／派送";
}

export function searchEnglishImage(entry: EnglishImageEntry, query: string): boolean {
  const normalized = query.normalize("NFKC").trim().toLocaleLowerCase();
  if (!normalized) return true;
  return [entry.title, entry.sourceLabel, entry.contextNote, entry.englishRecord]
    .some((value) => value.normalize("NFKC").toLocaleLowerCase().includes(normalized));
}

export function filterAndSortEnglishImages(
  entries: EnglishImageEntry[],
  filters: {
    status: "inbox" | "organized" | "all";
    route: "all" | Exclude<EnglishImageRoute, "pending">;
    stage: EnglishImageStage;
    query: string;
    sort: EnglishImageSort;
  }
): EnglishImageEntry[] {
  return entries.filter((entry) => (
    (filters.status === "all" || entry.status === filters.status) &&
    (filters.route === "all" || entry.route === filters.route) &&
    (filters.stage === "all" || englishImageStage(entry) === filters.stage) &&
    searchEnglishImage(entry, filters.query)
  )).sort((left, right) => {
    if (filters.sort === "captured-asc") return left.capturedAt.localeCompare(right.capturedAt);
    if (filters.sort === "updated-desc") return right.updatedAt.localeCompare(left.updatedAt);
    return right.capturedAt.localeCompare(left.capturedAt);
  });
}
