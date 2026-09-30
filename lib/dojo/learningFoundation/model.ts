import type { LearningTrackKey } from "../formal";
import { LEARNING_TRACKS } from "../learning";

export const FOUNDATION_PREFIX = "行光修習底座-";
export const STATUS_LABELS = {
  active: "進行中",
  paused: "暫時擱置",
  completed: "已完成",
  archived: "封存",
} as const;
export type LearningStatus = keyof typeof STATUS_LABELS;
export type EntityKind = "item" | "stage" | "topic";
export type LearningEntity = {
  schema: 1;
  id: string;
  owner: string;
  kind: EntityKind;
  itemId: string | null;
  stageId: string | null;
  legacyKey: LearningTrackKey | null;
  seedKey: string | null;
  name: string;
  description: string;
  vision: string;
  goal: string;
  expectedOutcome: string;
  order: number;
  status: LearningStatus;
  focused: boolean;
  revision: number;
  createdAt: string;
  updatedAt: string;
};
export type FoundationSnapshot = {
  entities: LearningEntity[];
  missing: Seed[];
};
export type Seed = {
  key: string;
  name: string;
  vision: string;
  description: string;
  legacyKey: LearningTrackKey | null;
};
const legacyKeys = Object.keys(LEARNING_TRACKS) as LearningTrackKey[];
export const SEEDS: Seed[] = [
  ...legacyKeys.map((key) => ({
    key,
    name: LEARNING_TRACKS[key].title,
    vision: LEARNING_TRACKS[key].defaultGoal,
    description: "",
    legacyKey: key,
  })),
  {
    key: "tarot",
    name: "塔羅",
    description: "已有解牌能力；著重英文閱讀、闡述與實戰，依需要選擇語言。",
    vision: "深化既有解牌能力與英文閱讀、闡述及實戰。",
    legacyKey: null,
  },
  {
    key: "lenormand",
    name: "雷諾曼",
    description: "已有解牌能力；著重英文閱讀、闡述與實戰，依需要選擇語言。",
    vision: "深化既有解牌能力與英文閱讀、闡述及實戰。",
    legacyKey: null,
  },
  {
    key: "psychology",
    name: "心理學",
    description: "保留自學探索、課程先修與入學備考；升學路線尚未決定。",
    vision: "約 2030 年按摩課程畢業後，考慮返回台灣就讀心理諮商相關研究所。",
    legacyKey: null,
  },
  {
    key: "chinese-medicine",
    name: "中醫",
    description: "保留自學探索、課程先修與入學備考；升學路線尚未決定。",
    vision: "約 2030 年按摩課程畢業後，考慮返回台灣就讀學士後中醫。",
    legacyKey: null,
  },
];
export class LearningError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function missingSeeds(entities: LearningEntity[]): Seed[] {
  return SEEDS.filter(
    (seed) =>
      !entities.some(
        (e) =>
          e.kind === "item" &&
          (e.seedKey === seed.key ||
            (e.legacyKey === seed.legacyKey && seed.legacyKey !== null)),
      ),
  );
}
export function assertGraph(entities: LearningEntity[], owner: string): void {
  const ids = new Set<string>();
  const seeds = new Set<string>();
  const keys = new Set<string>();
  for (const e of entities) {
    if (
      !e ||
      e.schema !== 1 ||
      !uuidPattern.test(e.id) ||
      e.owner !== owner ||
      ids.has(e.id) ||
      !["item", "stage", "topic"].includes(e.kind) ||
      !Object.hasOwn(STATUS_LABELS, e.status) ||
      !Number.isInteger(e.revision) ||
      e.revision < 1 ||
      !Number.isFinite(e.order) ||
      typeof e.focused !== "boolean" ||
      !e.name?.trim() ||
      !e.createdAt ||
      !e.updatedAt ||
      [e.name, e.description, e.vision, e.goal, e.expectedOutcome].some(
        (v) => typeof v !== "string",
      )
    )
      throw new LearningError(
        "學習資料缺失、重複或擁有者不符，請人工確認",
        409,
      );
    ids.add(e.id);
    if (e.kind === "item") {
      if (e.itemId || e.stageId) throw new LearningError("項目關聯不符", 409);
      if (e.seedKey) {
        if (seeds.has(e.seedKey))
          throw new LearningError("初始化識別重複", 409);
        seeds.add(e.seedKey);
      }
      if (e.legacyKey) {
        if (!legacyKeys.includes(e.legacyKey) || keys.has(e.legacyKey))
          throw new LearningError("舊項目對照重複或無法解析", 409);
        keys.add(e.legacyKey);
      }
    } else if (e.seedKey || e.legacyKey || e.focused)
      throw new LearningError("階段／主題欄位不符", 409);
  }
  for (const e of entities) {
    if (
      e.kind !== "item" &&
      !entities.some((p) => p.kind === "item" && p.id === e.itemId)
    )
      throw new LearningError("找不到所属學習項目，請確認歷史關聯", 409);
    if (e.kind === "stage" && e.stageId)
      throw new LearningError("階段不能隸屬其他階段", 409);
    if (
      e.kind === "topic" &&
      e.stageId &&
      !entities.some(
        (p) =>
          p.kind === "stage" && p.id === e.stageId && p.itemId === e.itemId,
      )
    )
      throw new LearningError("主題的階段關聯不符", 409);
  }
}
export type EntityInput = Partial<
  Pick<
    LearningEntity,
    | "name"
    | "description"
    | "vision"
    | "goal"
    | "expectedOutcome"
    | "order"
    | "status"
    | "focused"
    | "stageId"
  >
>;
export function applyEdit(
  entity: LearningEntity,
  input: EntityInput,
  entities: LearningEntity[],
  now: string,
): LearningEntity {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new LearningError("編輯內容格式不正確");
  const next = { ...entity };
  for (const key of [
    "name",
    "description",
    "vision",
    "goal",
    "expectedOutcome",
  ] as const) {
    if (input[key] !== undefined) {
      if (
        typeof input[key] !== "string" ||
        input[key].length > (key === "name" ? 300 : 2000)
      )
        throw new LearningError("名稱或文字格式不正確／過長");
      next[key] = input[key].trim();
    }
  }
  if (!next.name) throw new LearningError("名稱為必填；項目可以沒有階段或主題");
  if (input.order !== undefined) {
    if (!Number.isInteger(input.order) || Math.abs(input.order) > 100000)
      throw new LearningError("排序需為整數");
    next.order = input.order;
  }
  if (input.status !== undefined) {
    if (!Object.hasOwn(STATUS_LABELS, input.status))
      throw new LearningError("狀態不正確");
    next.status = input.status;
  }
  if (input.focused !== undefined) {
    if (entity.kind !== "item" || typeof input.focused !== "boolean")
      throw new LearningError("只有項目可設定本期專注");
    next.focused = input.focused;
  }
  if (input.stageId !== undefined) {
    if (
      entity.kind !== "topic" ||
      (input.stageId !== null &&
        !entities.some(
          (s) =>
            s.kind === "stage" &&
            s.id === input.stageId &&
            s.itemId === entity.itemId &&
            (s.status !== "archived" || input.stageId === entity.stageId),
        ))
    )
      throw new LearningError("只能移至同一項目內的階段，或尚未指定階段");
    next.stageId = input.stageId;
  }
  return { ...next, revision: entity.revision + 1, updatedAt: now };
}
