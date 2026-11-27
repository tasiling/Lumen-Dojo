// 肌肉卡、姿勢型態卡與答題紀錄的資料格式與檢查。純函式，伺服器與畫面共用。
import { LearningError, uuidPattern } from "../learningFoundation/model";
import { MMT_GRADING, SEED_PATTERNS, muscleByKey, tfhEntry } from "./catalog";

export const CARD_PREFIX = "行光肌肉卡-";
export const PATTERN_PREFIX = "行光姿勢型態-";
export const ANSWER_PREFIX = "行光肌肉答題-";
export const FIELD_MAX = 4000;
export const RAW_MAX = 40000;

export const SECTION_KEYS = ["know", "mmt", "posture", "tfh", "use"] as const;
export type SectionKey = typeof SECTION_KEYS[number];
export type FieldDef = { key: string; label: string };
export const SECTIONS: Record<SectionKey, { label: string; fields: FieldDef[] }> = {
  know: {
    label: "認識",
    fields: [
      { key: "origin", label: "起點" },
      { key: "insertion", label: "止點" },
      { key: "actions", label: "主要動作" },
      { key: "palpation", label: "怎麼摸到" },
      { key: "source", label: "出處（教材與頁碼）" },
    ],
  },
  mmt: {
    label: "徒手肌力測試",
    fields: [
      { key: "position", label: "測試姿勢" },
      { key: "direction", label: "施力方向" },
      { key: "alsoTested", label: "一起測到的肌肉" },
      { key: "compensation", label: "常見代償" },
    ],
  },
  posture: {
    label: "姿勢評估",
    fields: [
      { key: "observation", label: "站姿與坐姿的觀察重點" },
      { key: "confirmTest", label: "用哪個測試確認" },
    ],
  },
  tfh: {
    label: "觸康健檢測",
    fields: [
      { key: "meridian", label: "對應經絡" },
      { key: "position", label: "測試姿勢" },
      { key: "spinalReflex", label: "脊椎反射" },
      { key: "neurolymphatic", label: "神經淋巴點" },
      { key: "neurovascular", label: "神經血管點" },
    ],
  },
  use: {
    label: "運用",
    fields: [
      { key: "roles", label: "日常與運動中的角色" },
      { key: "complaints", label: "客人常見主訴" },
      { key: "englishScript", label: "對客人的英文解說句" },
    ],
  },
};
export const TEST_TABS: SectionKey[] = ["mmt", "posture", "tfh"];
export const TFH_NOT_LISTED = "這條肌肉不在觸康健十四肌之內，沒有觸康健檢測的欄位。";

export type Tendency = "tight" | "weak" | "";
export const TENDENCY_LABELS: Record<Tendency, string> = { tight: "偏緊", weak: "偏弱", "": "尚未填偏緊或偏弱" };
export type PatternMembership = { patternId: string; tendency: Tendency };
export type SectionContent = { fields: Record<string, string>; patterns?: PatternMembership[] };
export type StoredSection = SectionContent & { revision: number; updatedAt: string };
export type MuscleCardRecord = {
  schema: 1;
  recordType: "muscle-card";
  owner: string;
  key: string;
  sections: Partial<Record<SectionKey, StoredSection>>;
  createdAt: string;
  updatedAt: string;
};
export type PatternFieldKey = "description" | "observation" | "source";
export const PATTERN_FIELDS: { key: PatternFieldKey; label: string }[] = [
  { key: "description", label: "說明" },
  { key: "observation", label: "觀察重點" },
  { key: "source", label: "出處" },
];
export type PatternRecord = {
  schema: 1;
  recordType: "posture-pattern";
  owner: string;
  id: string;
  name: string;
  description: string;
  observation: string;
  source: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
};
/** 畫面用的型態卡：第一批種子在保存前也看得到，revision 0 表示尚未建立紀錄。 */
export type PatternCard = Omit<PatternRecord, "schema" | "recordType" | "owner"> & { seeded: boolean };
export type AnswerRecord = {
  schema: 1;
  recordType: "muscle-answer";
  owner: string;
  id: string;
  cardKey: string;
  section: SectionKey;
  practicedOn: string;
  question: string;
  answer: string;
  mismatch: string;
  raw: string;
  createdAt: string;
};
export type AnswerInput = Pick<AnswerRecord, "section" | "practicedOn" | "question" | "answer" | "mismatch" | "raw">;

export const cardTitle = (key: string) => `${CARD_PREFIX}${key}`;
export const patternTitle = (id: string) => `${PATTERN_PREFIX}${id}`;
export const answerTitle = (cardKey: string, id: string) => `${ANSWER_PREFIX}${cardKey}-${id}`;

export function isSectionKey(value: unknown): value is SectionKey {
  return typeof value === "string" && (SECTION_KEYS as readonly string[]).includes(value);
}
export function isPatternId(value: unknown): value is string {
  return typeof value === "string" && (SEED_PATTERNS.some((p) => p.id === value) || uuidPattern.test(value));
}
export function sectionApplies(key: string, section: SectionKey): boolean {
  return section !== "tfh" || Boolean(tfhEntry(key));
}

/** 卡片上顯示的欄位值：觸康健經絡在保存前預填目錄值；其他欄位未保存就是空的。 */
export function sectionView(card: MuscleCardRecord | null, key: string, section: SectionKey): SectionContent & { revision: number } {
  const stored = card?.sections[section];
  const fields = Object.fromEntries(SECTIONS[section].fields.map((f) => [f.key, stored?.fields[f.key] ?? ""]));
  if (section === "tfh" && !stored) fields.meridian = tfhEntry(key)?.meridian ?? "";
  return { fields, ...(section === "posture" ? { patterns: stored?.patterns ?? [] } : {}), revision: stored?.revision ?? 0 };
}

/**
 * 該層任一欄有內容就算已建。預填的經絡不是本人填的內容：保持原值時不算，改過才算。
 * 姿勢評估分頁裡，選了所屬型態也算有內容。
 */
export function sectionBuilt(card: MuscleCardRecord | null, key: string, section: SectionKey): boolean {
  const view = sectionView(card, key, section);
  const preset = tfhEntry(key)?.meridian ?? "";
  return (
    Object.entries(view.fields).some(([f, v]) => v.trim() && !(section === "tfh" && f === "meridian" && v.trim() === preset)) ||
    Boolean(view.patterns?.length)
  );
}
export const builtLabel = (built: boolean) => (built ? "已建" : "未建");

function text(value: unknown, max = FIELD_MAX): string {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string" || value.length > max) throw new LearningError("欄位格式不正確或過長");
  return value.trim();
}

export function sectionInput(
  key: string,
  section: SectionKey,
  input: unknown,
  knownPattern: (id: string) => boolean,
  previous?: StoredSection,
): SectionContent {
  if (!muscleByKey(key)) throw new LearningError("找不到這張肌肉卡", 404);
  if (!sectionApplies(key, section)) throw new LearningError(TFH_NOT_LISTED);
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new LearningError("卡片內容格式不正確");
  const raw = input as { fields?: unknown; patterns?: unknown };
  if (!raw.fields || typeof raw.fields !== "object" || Array.isArray(raw.fields)) throw new LearningError("卡片內容格式不正確");
  const given = raw.fields as Record<string, unknown>;
  if (Object.keys(given).some((f) => !SECTIONS[section].fields.some((d) => d.key === f))) throw new LearningError("有不屬於這一層的欄位");
  const fields = Object.fromEntries(SECTIONS[section].fields.map((f) => [f.key, text(given[f.key])]));
  if (section !== "posture") {
    if (raw.patterns !== undefined) throw new LearningError("只有姿勢評估可以選姿勢型態");
    return { fields };
  }
  const list = raw.patterns ?? [];
  if (!Array.isArray(list) || list.length > 30) throw new LearningError("姿勢型態格式不正確");
  const seen = new Set<string>();
  const patterns = list.map((item): PatternMembership => {
    const m = item as Partial<PatternMembership> | null;
    if (!m || !isPatternId(m.patternId) || !["tight", "weak", ""].includes(String(m.tendency ?? "")))
      throw new LearningError("姿勢型態格式不正確");
    if (seen.has(m.patternId)) throw new LearningError("同一個姿勢型態只能選一次");
    seen.add(m.patternId);
    // 舊的歸屬可以保留；新加入的型態必須存在。
    if (!knownPattern(m.patternId) && !previous?.patterns?.some((p) => p.patternId === m.patternId))
      throw new LearningError("找不到這個姿勢型態", 404);
    return { patternId: m.patternId, tendency: (m.tendency ?? "") as Tendency };
  });
  return { fields, patterns };
}

export function patternInput(input: unknown, requireName: boolean): Partial<Pick<PatternRecord, "name" | PatternFieldKey>> {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new LearningError("型態卡內容格式不正確");
  const raw = input as Record<string, unknown>;
  if (Object.keys(raw).some((k) => k !== "name" && !PATTERN_FIELDS.some((f) => f.key === k))) throw new LearningError("有不屬於型態卡的欄位");
  const out: Partial<Pick<PatternRecord, "name" | PatternFieldKey>> = {};
  if (raw.name !== undefined || requireName) {
    const name = text(raw.name, 120);
    if (!name) throw new LearningError("型態卡需要名稱");
    out.name = name;
  }
  for (const f of PATTERN_FIELDS) if (raw[f.key] !== undefined) out[f.key] = text(raw[f.key]);
  return out;
}

export function validDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
}
export function answerInput(cardKey: string, input: unknown): AnswerInput {
  if (!muscleByKey(cardKey)) throw new LearningError("找不到這張肌肉卡", 404);
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new LearningError("答題紀錄格式不正確");
  const raw = input as Record<string, unknown>;
  if (!isSectionKey(raw.section) || !sectionApplies(cardKey, raw.section)) throw new LearningError("答題紀錄的層不正確");
  if (!validDate(raw.practicedOn)) throw new LearningError("答題日期不正確");
  const entry = {
    section: raw.section,
    practicedOn: raw.practicedOn,
    question: text(raw.question),
    answer: text(raw.answer),
    mismatch: text(raw.mismatch),
    raw: text(raw.raw, RAW_MAX),
  };
  if (!entry.question) throw new LearningError("答題紀錄需要題目");
  return entry;
}

export function patternCards(records: PatternRecord[]): PatternCard[] {
  const view = (r: PatternRecord, seeded: boolean): PatternCard => ({
    id: r.id, name: r.name, description: r.description, observation: r.observation, source: r.source,
    revision: r.revision, createdAt: r.createdAt, updatedAt: r.updatedAt, seeded,
  });
  const seeds = SEED_PATTERNS.map((s) => {
    const stored = records.find((r) => r.id === s.id);
    return stored
      ? view(stored, true)
      : { id: s.id, name: s.name, description: "", observation: "", source: "", revision: 0, createdAt: "", updatedAt: "", seeded: true };
  });
  const added = records
    .filter((r) => !SEED_PATTERNS.some((s) => s.id === r.id))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((r) => view(r, false));
  return [...seeds, ...added];
}

/** 型態卡上自動列出的偏緊、偏弱肌肉：從肌肉卡的姿勢評估分頁讀來。 */
export function patternMembers(cards: MuscleCardRecord[], patternId: string) {
  return cards.flatMap((card) =>
    (card.sections.posture?.patterns ?? [])
      .filter((p) => p.patternId === patternId)
      .map((p) => ({ muscle: card.key, tendency: p.tendency })),
  );
}

export { MMT_GRADING };
