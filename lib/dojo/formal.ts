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
export const FORMAL_STATE_TITLE_PREFIXES = [
  DAILY_TITLE_PREFIX,
  BINGO_TITLE_PREFIX,
  CALENDAR_TITLE_PREFIX,
  ENTRY_TITLE_PREFIX,
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
    morning: { intention: "", state: null, startedAt: null },
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
