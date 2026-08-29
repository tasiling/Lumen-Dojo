import {
  GUANGFA,
  GUANGXING,
  SPACES,
  SPACE_TO_SOURCE_TYPE,
  type DojoEntry,
  type GuangfaKey,
  type GuangxingKey,
  type Privacy,
  type SpaceKey,
  type TraceLevel,
  type TraceStatus,
} from "./constants";

export const DAILY_TITLE_PREFIX = "行光今日-";
export const BINGO_TITLE_PREFIX = "行光週盤-";
export const CALENDAR_TITLE_PREFIX = "行光行程-";
export const ENTRY_TITLE_PREFIX = "行光紀錄-";
export const CAPTURE_TITLE_PREFIX = "行光捕捉-";
export const LEARNING_TITLE_PREFIX = "行光修習-";
export const FORMAL_STATE_TITLE_PREFIXES = [
  DAILY_TITLE_PREFIX,
  BINGO_TITLE_PREFIX,
  CALENDAR_TITLE_PREFIX,
  ENTRY_TITLE_PREFIX,
  CAPTURE_TITLE_PREFIX,
  LEARNING_TITLE_PREFIX,
] as const;

export const TAIPEI_TIME_ZONE = "Asia/Taipei";

export type DailyTaskCategory = "important" | "hobby" | "health";

export const DAILY_TASK_CATEGORIES: Record<
  DailyTaskCategory,
  { label: string; prompt: string }
> = {
  important: { label: "一件重要的事", prompt: "今天最值得完成的是什麼？" },
  hobby: { label: "一件喜歡的事", prompt: "留一點時間給真心喜歡的事。" },
  health: { label: "一件照顧自己的事", prompt: "身體今天需要什麼？" },
};

export type DailyTaskOrigin = {
  type: "bingo";
  weekStart: string;
  cellIndex: number;
};

export type DailyTask = {
  category: DailyTaskCategory;
  text: string;
  completed: boolean;
  completedAt: string | null;
  result: string;
  origin: DailyTaskOrigin | null;
};

export type DayLog = {
  id: string;
  time: string;
  text: string;
  createdAt: string;
};

export type EveningDepth = "light" | "medium" | "deep";
export type ClosingDisposition = "carry" | "journal" | "pause";

export type DailyRecord = {
  version: 1;
  date: string;
  morning: {
    intention: string;
    state: "低" | "穩" | "亮" | null;
    gratitude: string;
    affirmation: string;
    futureJournal: string;
    startedAt: string | null;
  };
  tasks: Record<DailyTaskCategory, DailyTask>;
  daytime: {
    logs: DayLog[];
    note: string;
  };
  evening: {
    depth: EveningDepth | null;
    highlight: string;
    block: string;
    insight: string;
    nextAction: string;
    disposition: ClosingDisposition | null;
    carryNote: string;
    carryToDate: string | null;
    carryResolvedAt: string | null;
    closedAt: string | null;
  };
  updatedAt: string;
};

export type BingoCell = {
  index: number;
  text: string;
  completed: boolean;
  completedAt: string | null;
  assignedDate: string | null;
  assignedCategory: DailyTaskCategory | null;
};

export type WeeklyBoard = {
  version: 1;
  weekStart: string;
  title: string;
  cells: BingoCell[];
  reflection: {
    brightSpot: string;
    adjustment: string;
    nextFocus: string;
  };
  archivedAt: string | null;
  updatedAt: string;
};

export type PersonalCalendarItem = {
  version: 1;
  id: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  space: SpaceKey;
  kind: string;
  note: string;
  createdAt: string;
  updatedAt: string;
};

// 擷取只保留原始材料；後續由野採加上分類、知識關聯與去向。原文永遠不會被
// 摘要覆蓋。舊版曾把捕捉直接送進織光堂，normalizeCaptureEntry 會在讀取時以
// 非破壞方式轉成新版資料，不需要批次覆寫 DB-14。
export const CAPTURE_CATEGORIES = {
  tarot: "塔羅／靈性",
  psychology: "心理學／神經科學",
  english: "英文學習",
  massage: "按摩知識",
  yijing: "易經",
  ziwei: "紫微斗數",
  qimen: "奇門遁甲",
  social: "社群素材",
  learning: "學習心得",
  business: "商業／教練",
  reading: "書籍／文章",
  other: "其他",
} as const;

export type CaptureCategoryKey = keyof typeof CAPTURE_CATEGORIES;

export const CAPTURE_CONTENT_TYPES = {
  atomic: ["原子概念", "一個可以獨立理解、重複使用的知識點"],
  inspiration: ["靈感", "尚未成形，但值得保留的創作火花"],
  method: ["方法論", "可以重複使用的思考框架或做事方式"],
  material: ["素材", "引用、案例、圖片或日後可以使用的資料"],
  insight: ["洞見", "經過思考後得到的結論、觀察或新連接"],
  affirmation: ["肯定句", "用來支持信念與自我認同的句子"],
  invocation: ["祈請詞", "作為儀式、定錨或引導使用的文字"],
} as const;

export type CaptureContentType = keyof typeof CAPTURE_CONTENT_TYPES;
export type CaptureStatus = "pending" | "adopted" | "faded";
export type CaptureProcessingDepth = "raw" | "light" | "deep";
export type CaptureDestination = "practice" | "weaving" | "dao";
export type LearningTrackKey = "english" | "massage" | "yijing" | "ziwei" | "qimen";
export type KnowledgeRelation = "supports" | "extends" | "contradicts" | "example" | "question";

export const KNOWLEDGE_RELATIONS: Record<KnowledgeRelation, string> = {
  supports: "支持",
  extends: "延伸",
  contradicts: "矛盾",
  example: "案例",
  question: "待解問題",
};

export type CaptureKnowledgeLink = {
  id: string;
  label: string;
  relation: KnowledgeRelation;
};

export const WEAVING_OUTPUT_TYPES = {
  article: "文章",
  carousel: "IG 圖文卡",
  shortVideo: "短影音",
  longVideo: "長影片",
  script: "講稿／腳本",
  lesson: "教學內容／練習單",
} as const;

export type WeavingOutputType = keyof typeof WEAVING_OUTPUT_TYPES;
export type WeavingProductionStatus = "ready" | "outline" | "draft" | "revision" | "completed";

export type CaptureWeavingState = {
  outputType: WeavingOutputType | null;
  projectTitle: string;
  status: WeavingProductionStatus;
  productionNote: string;
  outputUrl: string;
};

export type CaptureEntry = {
  version: 2;
  recordType: "capture-entry";
  id: string;
  title: string;
  category: CaptureCategoryKey | null;
  excerpt: string;
  note: string;
  sourceUrl: string;
  status: CaptureStatus;
  processingDepth: CaptureProcessingDepth;
  contentType: CaptureContentType | null;
  forageSummary: string;
  forageReason: string;
  knowledgeLinks: CaptureKnowledgeLink[];
  learningTracks: LearningTrackKey[];
  destinations: CaptureDestination[];
  pinned: boolean;
  capturedAt: string;
  fadedAt: string | null;
  sentToPracticeAt: string | null;
  sentToWeavingAt: string | null;
  weaving: CaptureWeavingState;
  updatedAt: string;
};

export type FormalCaptureContent = Omit<CaptureEntry, "id">;

export type FormalEntryContent = Omit<DojoEntry, "id"> & {
  version: 1;
  recordType: "dojo-entry";
  createdAt: string;
  updatedAt: string;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function isDate(value: unknown): value is string {
  return typeof value === "string" && DATE_RE.test(value);
}

export function taipeiTodayISO(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TAIPEI_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function dateTitleKey(dateISO: string): string {
  return dateISO.replace(/-/g, "");
}

export function dailyRecordTitle(dateISO: string): string {
  return `${DAILY_TITLE_PREFIX}${dateTitleKey(dateISO)}`;
}

export function bingoRecordTitle(weekStart: string): string {
  return `${BINGO_TITLE_PREFIX}${dateTitleKey(weekStart)}`;
}

export function calendarRecordTitle(dateISO: string, nonce: string): string {
  return `${CALENDAR_TITLE_PREFIX}${dateTitleKey(dateISO)}-${nonce}`;
}

export function entryRecordTitle(nonce: string): string {
  return `${ENTRY_TITLE_PREFIX}${nonce}`;
}

export function captureRecordTitle(nonce: string): string {
  return `${CAPTURE_TITLE_PREFIX}${nonce}`;
}

export function monthTitleKey(prefix: string, yearMonth: string): string {
  return `${prefix}${yearMonth.replace(/-/g, "")}`;
}

export function mondayOf(dateISO: string): string {
  const date = new Date(`${dateISO}T12:00:00+08:00`);
  const weekday = date.getUTCDay();
  const distance = weekday === 0 ? 6 : weekday - 1;
  date.setUTCDate(date.getUTCDate() - distance);
  return date.toISOString().slice(0, 10);
}

export function addCalendarDays(dateISO: string, days: number): string {
  const date = new Date(`${dateISO}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function emptyTask(category: DailyTaskCategory): DailyTask {
  return {
    category,
    text: "",
    completed: false,
    completedAt: null,
    result: "",
    origin: null,
  };
}

export function emptyDailyRecord(date = taipeiTodayISO()): DailyRecord {
  return {
    version: 1,
    date,
    morning: {
      intention: "",
      state: null,
      gratitude: "",
      affirmation: "",
      futureJournal: "",
      startedAt: null,
    },
    tasks: {
      important: emptyTask("important"),
      hobby: emptyTask("hobby"),
      health: emptyTask("health"),
    },
    daytime: { logs: [], note: "" },
    evening: {
      depth: null,
      highlight: "",
      block: "",
      insight: "",
      nextAction: "",
      disposition: null,
      carryNote: "",
      carryToDate: null,
      carryResolvedAt: null,
      closedAt: null,
    },
    updatedAt: new Date().toISOString(),
  };
}

function normalizeOrigin(value: unknown): DailyTaskOrigin | null {
  if (!value || typeof value !== "object") return null;
  const origin = value as Partial<DailyTaskOrigin>;
  if (
    origin.type !== "bingo" ||
    !isDate(origin.weekStart) ||
    typeof origin.cellIndex !== "number" ||
    origin.cellIndex < 0 ||
    origin.cellIndex > 24
  ) {
    return null;
  }
  return { type: "bingo", weekStart: origin.weekStart, cellIndex: origin.cellIndex };
}

function normalizeTask(value: unknown, category: DailyTaskCategory): DailyTask {
  const task = value && typeof value === "object" ? (value as Partial<DailyTask>) : {};
  return {
    category,
    text: stringValue(task.text).slice(0, 300),
    completed: Boolean(task.completed),
    completedAt: nullableString(task.completedAt),
    result: stringValue(task.result).slice(0, 1000),
    origin: normalizeOrigin(task.origin),
  };
}

export function normalizeDailyRecord(value: unknown, expectedDate: string): DailyRecord {
  const source = value && typeof value === "object" ? (value as Partial<DailyRecord>) : {};
  const base = emptyDailyRecord(expectedDate);
  const morning = source.morning && typeof source.morning === "object" ? source.morning : base.morning;
  const daytime = source.daytime && typeof source.daytime === "object" ? source.daytime : base.daytime;
  const evening = source.evening && typeof source.evening === "object" ? source.evening : base.evening;
  const tasks = source.tasks && typeof source.tasks === "object" ? source.tasks : base.tasks;
  const state = morning.state === "低" || morning.state === "穩" || morning.state === "亮" ? morning.state : null;
  const depth = evening.depth === "light" || evening.depth === "medium" || evening.depth === "deep" ? evening.depth : null;
  const disposition =
    evening.disposition === "carry" || evening.disposition === "journal" || evening.disposition === "pause"
      ? evening.disposition
      : null;

  const logs = Array.isArray(daytime.logs)
    ? daytime.logs
        .map((item) => {
          const log = item && typeof item === "object" ? (item as Partial<DayLog>) : {};
          const text = stringValue(log.text).trim().slice(0, 1000);
          if (!text) return null;
          return {
            id: stringValue(log.id, crypto.randomUUID()),
            time: TIME_RE.test(stringValue(log.time)) ? stringValue(log.time) : "",
            text,
            createdAt: stringValue(log.createdAt, new Date().toISOString()),
          } satisfies DayLog;
        })
        .filter((item): item is DayLog => item !== null)
        .slice(0, 100)
    : [];

  return {
    version: 1,
    date: expectedDate,
    morning: {
      intention: stringValue(morning.intention).slice(0, 1000),
      state,
      gratitude: stringValue(morning.gratitude).slice(0, 3000),
      affirmation: stringValue(morning.affirmation).slice(0, 2000),
      futureJournal: stringValue(morning.futureJournal).slice(0, 5000),
      startedAt: nullableString(morning.startedAt),
    },
    tasks: {
      important: normalizeTask(tasks.important, "important"),
      hobby: normalizeTask(tasks.hobby, "hobby"),
      health: normalizeTask(tasks.health, "health"),
    },
    daytime: { logs, note: stringValue(daytime.note).slice(0, 10000) },
    evening: {
      depth,
      highlight: stringValue(evening.highlight).slice(0, 3000),
      block: stringValue(evening.block).slice(0, 3000),
      insight: stringValue(evening.insight).slice(0, 3000),
      nextAction: stringValue(evening.nextAction).slice(0, 1000),
      disposition,
      carryNote: stringValue(evening.carryNote).slice(0, 2000),
      carryToDate: isDate(evening.carryToDate) ? evening.carryToDate : null,
      carryResolvedAt: nullableString(evening.carryResolvedAt),
      closedAt: nullableString(evening.closedAt),
    },
    updatedAt: new Date().toISOString(),
  };
}

export function emptyWeeklyBoard(weekStart: string): WeeklyBoard {
  return {
    version: 1,
    weekStart,
    title: "本週行光盤",
    cells: Array.from({ length: 25 }, (_, index) => ({
      index,
      text: index === 12 ? "自在格" : "",
      completed: index === 12,
      completedAt: index === 12 ? weekStart : null,
      assignedDate: null,
      assignedCategory: null,
    })),
    reflection: { brightSpot: "", adjustment: "", nextFocus: "" },
    archivedAt: null,
    updatedAt: new Date().toISOString(),
  };
}

export function normalizeWeeklyBoard(value: unknown, expectedWeekStart: string): WeeklyBoard {
  const source = value && typeof value === "object" ? (value as Partial<WeeklyBoard>) : {};
  const base = emptyWeeklyBoard(expectedWeekStart);
  const incoming = Array.isArray(source.cells) ? source.cells : [];
  const byIndex = new Map<number, Partial<BingoCell>>();
  for (const cell of incoming) {
    if (cell && typeof cell === "object" && typeof cell.index === "number") byIndex.set(cell.index, cell);
  }
  const cells = base.cells.map((fallback) => {
    if (fallback.index === 12) return fallback;
    const cell = byIndex.get(fallback.index) ?? {};
    const category =
      cell.assignedCategory === "important" || cell.assignedCategory === "hobby" || cell.assignedCategory === "health"
        ? cell.assignedCategory
        : null;
    return {
      index: fallback.index,
      text: stringValue(cell.text).slice(0, 300),
      completed: Boolean(cell.completed),
      completedAt: nullableString(cell.completedAt),
      assignedDate: isDate(cell.assignedDate) ? cell.assignedDate : null,
      assignedCategory: category,
    };
  });
  const reflection = source.reflection && typeof source.reflection === "object" ? source.reflection : base.reflection;
  return {
    version: 1,
    weekStart: expectedWeekStart,
    title: stringValue(source.title, base.title).slice(0, 200),
    cells,
    reflection: {
      brightSpot: stringValue(reflection.brightSpot).slice(0, 3000),
      adjustment: stringValue(reflection.adjustment).slice(0, 3000),
      nextFocus: stringValue(reflection.nextFocus).slice(0, 3000),
    },
    archivedAt: nullableString(source.archivedAt),
    updatedAt: new Date().toISOString(),
  };
}

const BINGO_LINES = [
  [0, 1, 2, 3, 4],
  [5, 6, 7, 8, 9],
  [10, 11, 12, 13, 14],
  [15, 16, 17, 18, 19],
  [20, 21, 22, 23, 24],
  [0, 5, 10, 15, 20],
  [1, 6, 11, 16, 21],
  [2, 7, 12, 17, 22],
  [3, 8, 13, 18, 23],
  [4, 9, 14, 19, 24],
  [0, 6, 12, 18, 24],
  [4, 8, 12, 16, 20],
] as const;

export function completedBingoLines(board: WeeklyBoard): number {
  const done = new Set(board.cells.filter((cell) => cell.completed).map((cell) => cell.index));
  return BINGO_LINES.filter((line) => line.every((index) => done.has(index))).length;
}

function isSpace(value: unknown): value is SpaceKey {
  return typeof value === "string" && value in SPACES;
}

export function normalizeCalendarItem(
  value: unknown,
  params: { id: string; createdAt?: string }
): PersonalCalendarItem | null {
  const source = value && typeof value === "object" ? (value as Partial<PersonalCalendarItem>) : {};
  const title = stringValue(source.title).trim().slice(0, 300);
  if (!title || !isDate(source.date)) return null;
  const space = isSpace(source.space) ? source.space : "practice";
  const now = new Date().toISOString();
  return {
    version: 1,
    id: params.id,
    title,
    date: source.date,
    startTime: TIME_RE.test(stringValue(source.startTime)) ? stringValue(source.startTime) : "",
    endTime: TIME_RE.test(stringValue(source.endTime)) ? stringValue(source.endTime) : "",
    space,
    kind: stringValue(source.kind, "行程").slice(0, 100),
    note: stringValue(source.note).slice(0, 3000),
    createdAt: params.createdAt ?? stringValue(source.createdAt, now),
    updatedAt: now,
  };
}

function validChoice<T extends string>(value: unknown, choices: readonly T[], fallback: T): T {
  return typeof value === "string" && choices.includes(value as T) ? (value as T) : fallback;
}

function isoDateTime(value: unknown, fallback: string): string {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) return fallback;
  return new Date(value).toISOString();
}

export function isValidCaptureSourceUrl(value: unknown): boolean {
  if (typeof value !== "string" || !value.trim()) return true;
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function normalizedCaptureSourceUrl(value: unknown): string {
  if (!isValidCaptureSourceUrl(value) || typeof value !== "string" || !value.trim()) return "";
  return new URL(value.trim()).toString().slice(0, 2000);
}

export function normalizeCaptureEntry(
  value: unknown,
  params: { id: string; capturedAt?: string; touch?: boolean }
): CaptureEntry | null {
  const source = value && typeof value === "object" ? (value as Partial<CaptureEntry>) : {};
  const title = stringValue(source.title).trim().slice(0, 300);
  if (!title) return null;

  const now = new Date().toISOString();
  const category =
    typeof source.category === "string" && source.category in CAPTURE_CATEGORIES
      ? (source.category as CaptureCategoryKey)
      : null;
  const contentType =
    typeof source.contentType === "string" && source.contentType in CAPTURE_CONTENT_TYPES
      ? (source.contentType as CaptureContentType)
      : null;
  const legacyStatus = (source as { status?: string }).status;
  const isLegacy = (source as { version?: number }).version !== 2;
  const legacyWeavingNote = stringValue((source as { weavingNote?: unknown }).weavingNote).trim();
  const legacyPrepared = isLegacy && (legacyStatus === "woven" || Boolean(contentType) || Boolean(legacyWeavingNote));
  const capturedAt = params.capturedAt ?? isoDateTime(source.capturedAt, now);
  const legacyWovenAt = (source as { wovenAt?: unknown }).wovenAt;
  const sentToWeavingAt = source.sentToWeavingAt
    ? isoDateTime(source.sentToWeavingAt, now)
    : legacyWovenAt
      ? isoDateTime(legacyWovenAt, now)
      : legacyPrepared
        ? isoDateTime(source.updatedAt, capturedAt)
      : null;
  const processingDepth: CaptureProcessingDepth =
    source.processingDepth === "light" || source.processingDepth === "deep"
      ? source.processingDepth
      : legacyPrepared
        ? (contentType || legacyWeavingNote ? "deep" : "light")
        : "raw";
  const destinations = Array.isArray(source.destinations)
    ? source.destinations.filter((item): item is CaptureDestination =>
        item === "practice" || item === "weaving" || item === "dao")
    : [];
  if (legacyPrepared && !destinations.includes("weaving")) destinations.push("weaving");
  const learningTracks = Array.isArray(source.learningTracks)
    ? source.learningTracks.filter((item): item is LearningTrackKey =>
        item === "english" || item === "massage" || item === "yijing" || item === "ziwei" || item === "qimen")
    : [];
  const knowledgeLinks = Array.isArray(source.knowledgeLinks)
    ? source.knowledgeLinks.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const link = item as Partial<CaptureKnowledgeLink>;
        const label = stringValue(link.label).trim().slice(0, 120);
        const relation: KnowledgeRelation =
          link.relation === "supports" || link.relation === "contradicts" || link.relation === "example" || link.relation === "question"
            ? link.relation
            : "extends";
        return label ? [{ id: stringValue(link.id, crypto.randomUUID()), label, relation }] : [];
      }).slice(0, 30)
    : [];
  const sourceWeaving: Partial<CaptureWeavingState> = source.weaving && typeof source.weaving === "object" ? source.weaving : {};
  const outputType = typeof sourceWeaving.outputType === "string" && sourceWeaving.outputType in WEAVING_OUTPUT_TYPES
    ? sourceWeaving.outputType as WeavingOutputType
    : null;
  const productionStatus: WeavingProductionStatus =
    sourceWeaving.status === "outline" || sourceWeaving.status === "draft" || sourceWeaving.status === "revision" || sourceWeaving.status === "completed"
      ? sourceWeaving.status
      : "ready";
  const sourceStatus: CaptureStatus = legacyPrepared
    ? "adopted"
    : source.status === "adopted" || source.status === "faded" ? source.status : "pending";
  const lastActivityAt = isoDateTime(source.updatedAt, capturedAt);
  const inactiveDays = Math.floor((new Date(now).getTime() - new Date(lastActivityAt).getTime()) / 86_400_000);
  const shouldFade = sourceStatus === "pending" && processingDepth === "raw" && destinations.length === 0 && !source.pinned && inactiveDays >= 30;
  const status: CaptureStatus = shouldFade ? "faded" : sourceStatus;
  const fadedAt = status === "faded"
    ? (source.fadedAt ? isoDateTime(source.fadedAt, now) : new Date(new Date(lastActivityAt).getTime() + 30 * 86_400_000).toISOString())
    : null;

  return {
    version: 2,
    recordType: "capture-entry",
    id: params.id,
    title,
    category,
    excerpt: stringValue(source.excerpt).trim().slice(0, 12000),
    note: stringValue(source.note).trim().slice(0, 3000),
    sourceUrl: normalizedCaptureSourceUrl(source.sourceUrl),
    status,
    processingDepth,
    contentType,
    forageSummary: stringValue(source.forageSummary, legacyWeavingNote).trim().slice(0, 5000),
    forageReason: stringValue(source.forageReason).trim().slice(0, 3000),
    knowledgeLinks,
    learningTracks,
    destinations,
    pinned: Boolean(source.pinned),
    capturedAt,
    fadedAt,
    sentToPracticeAt: source.sentToPracticeAt ? isoDateTime(source.sentToPracticeAt, now) : null,
    sentToWeavingAt,
    weaving: {
      outputType,
      projectTitle: stringValue(sourceWeaving.projectTitle).trim().slice(0, 300),
      status: productionStatus,
      productionNote: stringValue(sourceWeaving.productionNote).trim().slice(0, 8000),
      outputUrl: normalizedCaptureSourceUrl(sourceWeaving.outputUrl),
    },
    updatedAt: params.touch ? now : isoDateTime(source.updatedAt, now),
  };
}

export function captureContent(entry: CaptureEntry): FormalCaptureContent {
  return {
    version: 2,
    recordType: "capture-entry",
    title: entry.title,
    category: entry.category,
    excerpt: entry.excerpt,
    note: entry.note,
    sourceUrl: entry.sourceUrl,
    status: entry.status,
    processingDepth: entry.processingDepth,
    contentType: entry.contentType,
    forageSummary: entry.forageSummary,
    forageReason: entry.forageReason,
    knowledgeLinks: entry.knowledgeLinks,
    learningTracks: entry.learningTracks,
    destinations: entry.destinations,
    pinned: entry.pinned,
    capturedAt: entry.capturedAt,
    fadedAt: entry.fadedAt,
    sentToPracticeAt: entry.sentToPracticeAt,
    sentToWeavingAt: entry.sentToWeavingAt,
    weaving: entry.weaving,
    updatedAt: entry.updatedAt,
  };
}

export function normalizeFormalEntry(
  value: unknown,
  params: { id: string; createdAt?: string }
): DojoEntry | null {
  const source = value && typeof value === "object" ? (value as Partial<FormalEntryContent>) : {};
  const title = stringValue(source.title).trim().slice(0, 300);
  if (!title) return null;
  const space = isSpace(source.space) ? source.space : "practice";
  const privacy = validChoice<Privacy>(source.privacy, ["私人", "限閱", "公開"], "私人");
  const guangxing =
    typeof source.guangxing === "string" && source.guangxing in GUANGXING
      ? (source.guangxing as GuangxingKey)
      : null;
  const guangfa =
    typeof source.guangfa === "string" && source.guangfa in GUANGFA ? (source.guangfa as GuangfaKey) : null;
  const traceLevel = validChoice<TraceLevel>(source.traceLevel, ["daily", "accumulated", "permanent"], "daily");
  const traceStatus = validChoice<TraceStatus>(source.traceStatus, ["一般", "收納", "隱藏"], "一般");
  const createdAt = params.createdAt ?? stringValue(source.createdAt, new Date().toISOString());
  return {
    id: params.id,
    title,
    space,
    kind: stringValue(source.kind, "紀錄").slice(0, 100),
    privacy,
    note: stringValue(source.note).trim().slice(0, 5000) || undefined,
    date: isDate(source.date) ? source.date : createdAt.slice(0, 10),
    guangxing,
    guangfa,
    freq: typeof source.freq === "number" ? Math.max(0, Math.min(1000, source.freq)) : undefined,
    intensity: typeof source.intensity === "number" ? Math.max(1, Math.min(10, source.intensity)) : undefined,
    sourceType: SPACE_TO_SOURCE_TYPE[space],
    traceLevel,
    traceStatus,
    viewCount: typeof source.viewCount === "number" ? Math.max(0, Math.floor(source.viewCount)) : 0,
    traceId: stringValue(source.traceId) || undefined,
    createdAt,
    updatedAt: new Date().toISOString(),
  };
}

export function entryContent(entry: DojoEntry): FormalEntryContent {
  const now = new Date().toISOString();
  return {
    version: 1,
    recordType: "dojo-entry",
    title: entry.title,
    space: entry.space,
    kind: entry.kind,
    privacy: entry.privacy,
    note: entry.note,
    date: entry.date,
    guangxing: entry.guangxing,
    guangfa: entry.guangfa,
    freq: entry.freq,
    intensity: entry.intensity,
    sourceType: entry.sourceType,
    traceLevel: entry.traceLevel,
    traceStatus: entry.traceStatus,
    viewCount: entry.viewCount,
    traceId: entry.traceId,
    createdAt: entry.createdAt ?? now,
    updatedAt: now,
  };
}

export function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
