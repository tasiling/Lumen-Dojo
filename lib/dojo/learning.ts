import { LEARNING_TITLE_PREFIX, type LearningTrackKey } from "./formal";

export { LEARNING_TITLE_PREFIX };

export const LEARNING_TRACKS: Record<LearningTrackKey, {
  title: string;
  short: string;
  defaultGoal: string;
  defaultStage: string;
  color: string;
}> = {
  english: {
    title: "英文到 C1",
    short: "英",
    defaultGoal: "建立能在生活、學校與工作中自在表達的 C1 英文能力",
    defaultStage: "建立穩定的 B1 基礎",
    color: "#56728d",
  },
  massage: {
    title: "按摩知識",
    short: "按",
    defaultGoal: "把解剖、評估、禁忌與手法連成可在工作中使用的知識",
    defaultStage: "整理常見部位與客人描述",
    color: "#9a6c55",
  },
  yijing: {
    title: "易經",
    short: "易",
    defaultGoal: "理解陰陽、八卦與六十四卦，逐步建立可自行推導的易經語言",
    defaultStage: "八卦核心運動與彼此差異",
    color: "#6d7b59",
  },
  ziwei: {
    title: "紫微斗數",
    short: "紫",
    defaultGoal: "建立宮位、星曜、結構與四化的獨立判讀能力",
    defaultStage: "十四主星的核心功能與差異",
    color: "#78658d",
  },
  qimen: {
    title: "奇門遁甲",
    short: "奇",
    defaultGoal: "從干支五行與九宮開始，建立可拆解盤面關係的奇門語言",
    defaultStage: "補齊干支五行與九宮前備知識",
    color: "#8b7650",
  },
};

export const ENGLISH_SKILLS = ["聽力", "口說", "閱讀", "寫作", "詞彙", "文法", "發音"] as const;
export type EnglishSkill = (typeof ENGLISH_SKILLS)[number];
export type CefrLevel = "A1" | "A2" | "B1" | "B2" | "C1";

export type LearningTrackRecord = {
  version: 1;
  recordType: "learning-track";
  key: LearningTrackKey;
  goal: string;
  currentStage: string;
  currentFocus: string;
  nextAction: string;
  english: {
    currentLevel: CefrLevel;
    targetLevel: CefrLevel;
    focusSkills: EnglishSkill[];
    checkpoint: string;
  } | null;
  updatedAt: string;
};

export function learningRecordTitle(key: LearningTrackKey): string {
  return `${LEARNING_TITLE_PREFIX}${key}`;
}

export function defaultLearningTrack(key: LearningTrackKey): LearningTrackRecord {
  const config = LEARNING_TRACKS[key];
  return {
    version: 1,
    recordType: "learning-track",
    key,
    goal: config.defaultGoal,
    currentStage: config.defaultStage,
    currentFocus: "",
    nextAction: "",
    english: key === "english" ? {
      currentLevel: "A2",
      targetLevel: "C1",
      focusSkills: ["口說", "聽力"],
      checkpoint: "先穩定完成日常與按摩工作情境的 B1 口語表達",
    } : null,
    updatedAt: new Date().toISOString(),
  };
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

export function normalizeLearningTrack(value: unknown, expectedKey: LearningTrackKey): LearningTrackRecord {
  const base = defaultLearningTrack(expectedKey);
  const source = value && typeof value === "object" ? value as Partial<LearningTrackRecord> : {};
  const englishSource = source.english && typeof source.english === "object" ? source.english : null;
  const levels: CefrLevel[] = ["A1", "A2", "B1", "B2", "C1"];
  const focusSkills = englishSource && Array.isArray(englishSource.focusSkills)
    ? englishSource.focusSkills.filter((skill): skill is EnglishSkill => ENGLISH_SKILLS.includes(skill as EnglishSkill))
    : base.english?.focusSkills ?? [];

  return {
    ...base,
    goal: stringValue(source.goal, base.goal).trim().slice(0, 1000),
    currentStage: stringValue(source.currentStage, base.currentStage).trim().slice(0, 500),
    currentFocus: stringValue(source.currentFocus).trim().slice(0, 1000),
    nextAction: stringValue(source.nextAction).trim().slice(0, 1000),
    english: expectedKey === "english" ? {
      currentLevel: englishSource && levels.includes(englishSource.currentLevel) ? englishSource.currentLevel : "A2",
      targetLevel: englishSource && levels.includes(englishSource.targetLevel) ? englishSource.targetLevel : "C1",
      focusSkills,
      checkpoint: stringValue(englishSource?.checkpoint, base.english?.checkpoint).trim().slice(0, 1000),
    } : null,
    updatedAt: new Date().toISOString(),
  };
}
