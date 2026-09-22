import { englishImageRouteLabel, type EnglishImageEntry } from "./englishImage";
import { englishImageStage } from "./englishImageInboxView";
import { CAPTURE_CATEGORIES, type CaptureEntry } from "./formal";

export type ForageRecentItem = {
  kind: "english" | "capture";
  id: string;
  title: string;
  sourceLabel: string;
  summary: string;
  capturedAt: string;
  href: string;
};

export type ForageOverview = {
  english: { pending: number; classification: number; dispatch: number; errors: number };
  captures: { pending: number; adopted: number; faded: number };
  recent: ForageRecentItem[];
};

function excerpt(values: string[], fallback: string): string {
  const value = values.find((item) => item.trim())?.replace(/\s+/g, " ").trim() ?? fallback;
  return value.length > 120 ? `${value.slice(0, 117)}…` : value;
}

export function buildForageOverview(
  englishEntries: EnglishImageEntry[],
  captureEntries: CaptureEntry[],
  recentLimit = 3
): ForageOverview {
  const pendingEnglish = englishEntries.filter((entry) => entry.status === "inbox" && !entry.mergedIntoId);
  const recentEnglish: ForageRecentItem[] = englishEntries.filter((entry) => !entry.mergedIntoId).map((entry) => ({
    kind: "english", id: entry.id, title: entry.title, sourceLabel: englishImageRouteLabel(entry.route),
    summary: excerpt([entry.chineseExplanation, entry.englishRecord, entry.contextNote, entry.sourceLabel], `${entry.attachments.length} 張英文圖片`),
    capturedAt: entry.capturedAt,
    href: `/forage/english?englishImageId=${encodeURIComponent(entry.id)}`,
  }));
  const recentCaptures: ForageRecentItem[] = captureEntries.map((entry) => ({
    kind: "capture", id: entry.id, title: entry.title,
    sourceLabel: entry.category ? CAPTURE_CATEGORIES[entry.category] : entry.clip.origin === "line" ? "LINE 剪藏" : "未分類",
    summary: excerpt([entry.forageSummary, entry.excerpt, entry.note], "尚未補充摘要"),
    capturedAt: entry.capturedAt,
    href: `/forage/captures?captureId=${encodeURIComponent(entry.id)}`,
  }));

  return {
    english: {
      pending: pendingEnglish.length,
      classification: pendingEnglish.filter((entry) => englishImageStage(entry) === "classification").length,
      dispatch: pendingEnglish.filter((entry) => englishImageStage(entry) === "dispatch").length,
      errors: pendingEnglish.filter((entry) => englishImageStage(entry) === "error").length,
    },
    captures: {
      pending: captureEntries.filter((entry) => entry.status === "pending").length,
      adopted: captureEntries.filter((entry) => entry.status === "adopted").length,
      faded: captureEntries.filter((entry) => entry.status === "faded").length,
    },
    recent: [...recentEnglish, ...recentCaptures].sort((left, right) => right.capturedAt.localeCompare(left.capturedAt)).slice(0, Math.max(0, recentLimit)),
  };
}
