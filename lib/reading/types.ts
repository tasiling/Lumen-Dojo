export const READING_SUBJECTS = [
  "塔羅／靈性",
  "心理學／神經科學",
  "商業／行銷",
  "按摩／身體",
  "易經",
  "紫微",
  "奇門遁甲",
  "英文",
  "其他",
] as const;

export const BOOK_REASONS = ["經典", "林迪效應", "跨領域取心智模型", "當下需求"] as const;
export const BOOK_STATUSES = ["待讀", "閱讀中", "已萃取", "已製作成內容", "放棄"] as const;
export const INSIGHT_ACTION_TYPES = ["觀察型", "執行型"] as const;
export const INSIGHT_STATUSES = ["待行動", "觀察中", "行動中", "已驗證", "不成立", "放棄"] as const;
export const PROGRAM_APPLICATIONS = ["未定", "短影音", "感悟集", "已使用"] as const;
export const INSIGHT_TOPICS = [
  "顯化",
  "能量療癒",
  "學習方法",
  "創作與內容",
  "身體與照顧",
  "商業與經營",
  "關係與溝通",
] as const;

export type ReadingSubject = (typeof READING_SUBJECTS)[number];
export type BookReason = (typeof BOOK_REASONS)[number];
export type BookStatus = (typeof BOOK_STATUSES)[number];
export type InsightActionType = (typeof INSIGHT_ACTION_TYPES)[number];
export type InsightStatus = (typeof INSIGHT_STATUSES)[number];
export type ProgramApplication = (typeof PROGRAM_APPLICATIONS)[number];
export type InsightTopic = (typeof INSIGHT_TOPICS)[number];

export type ReadingBook = {
  id: string;
  title: string;
  author: string;
  readCount: number;
  subject: ReadingSubject | null;
  reason: BookReason | null;
  question: string;
  status: BookStatus;
  startedAt: string | null;
  extractedAt: string | null;
  insightCardIds: string[];
  createdAt: string;
};

export type ReadingNote = {
  id: string;
  text: string;
  editable: boolean;
};

export type InsightCard = {
  id: string;
  insight: string;
  sourceBookId: string | null;
  actionType: InsightActionType;
  action: string;
  status: InsightStatus;
  nextVisitAt: string | null;
  result: string;
  programApplication: ProgramApplication;
  topics: InsightTopic[];
  extractedAt: string | null;
  postponementCount: number;
  createdAt: string;
};

export type InsightCardWithBook = InsightCard & {
  sourceBookTitle: string;
};

export const ACTIVE_INSIGHT_STATUSES: InsightStatus[] = ["待行動", "觀察中", "行動中"];
export const TERMINAL_INSIGHT_STATUSES: InsightStatus[] = ["已驗證", "不成立", "放棄"];

export function isBookStatus(value: unknown): value is BookStatus {
  return typeof value === "string" && (BOOK_STATUSES as readonly string[]).includes(value);
}

export function isReadingSubject(value: unknown): value is ReadingSubject {
  return typeof value === "string" && (READING_SUBJECTS as readonly string[]).includes(value);
}

export function isBookReason(value: unknown): value is BookReason {
  return typeof value === "string" && (BOOK_REASONS as readonly string[]).includes(value);
}

export function isInsightActionType(value: unknown): value is InsightActionType {
  return typeof value === "string" && (INSIGHT_ACTION_TYPES as readonly string[]).includes(value);
}

export function isInsightStatus(value: unknown): value is InsightStatus {
  return typeof value === "string" && (INSIGHT_STATUSES as readonly string[]).includes(value);
}

export function isProgramApplication(value: unknown): value is ProgramApplication {
  return typeof value === "string" && (PROGRAM_APPLICATIONS as readonly string[]).includes(value);
}

export function isInsightTopic(value: unknown): value is InsightTopic {
  return typeof value === "string" && (INSIGHT_TOPICS as readonly string[]).includes(value);
}

export function addDaysISO(dateISO: string, days: number): string {
  const date = new Date(`${dateISO}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function oneMonthBeforeISO(dateISO: string): string {
  const date = new Date(`${dateISO}T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() - 1);
  return date.toISOString().slice(0, 10);
}

export function isStuckInsight(card: InsightCard, todayISO: string): boolean {
  if (!ACTIVE_INSIGHT_STATUSES.includes(card.status)) return false;
  return card.postponementCount >= 3 || Boolean(card.extractedAt && card.extractedAt < oneMonthBeforeISO(todayISO));
}

export function appendResult(previous: string, addition: string, dateISO: string): string {
  const trimmed = addition.trim();
  if (!trimmed) return previous;
  const line = `${dateISO}｜${trimmed}`;
  return previous.trim() ? `${previous.trim()}\n${line}` : line;
}
