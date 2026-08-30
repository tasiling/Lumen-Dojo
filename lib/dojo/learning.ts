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
export type EnglishWeeklyMode = "foundation-writing" | "vocabulary-growth";

export type LearningActivity = {
  id: string;
  weekStart: string;
  cellIndex: number;
  templateKey: string;
  skill: string;
  progress: number;
  target: number;
  unit: string;
  evidenceNote: string;
  completedAt: string | null;
  updatedAt: string;
};

export type WeeklyLearningCandidate = {
  templateKey: string;
  title: string;
  shortTitle: string;
  skill: EnglishSkill;
  completionMode: "single" | "count";
  target: number;
  unit: string;
  requiresEvidence: boolean;
  defaultCategory: "important" | "hobby" | "health";
};

export type LearningTrackRecord = {
  version: 1 | 2;
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
    weeklyMode: EnglishWeeklyMode;
  } | null;
  activityLog: LearningActivity[];
  updatedAt: string;
};

const FOUNDATION_WRITING_CANDIDATES: WeeklyLearningCandidate[] = [
  { templateKey: "journal-translation", title: "日記自譯＋AI 對照修正", shortTitle: "日記自譯", skill: "寫作", completionMode: "single", target: 1, unit: "篇", requiresEvidence: false, defaultCategory: "important" },
  { templateKey: "vocabforge-journal-round", title: "VocabForge 一輪（來源：當週日記生詞）", shortTitle: "生詞一輪", skill: "詞彙", completionMode: "single", target: 1, unit: "輪", requiresEvidence: false, defaultCategory: "important" },
  { templateKey: "work-five-expressions", title: "5 種說法＋當週工作實際使用", shortTitle: "說法實戰", skill: "口說", completionMode: "single", target: 1, unit: "次實戰", requiresEvidence: true, defaultCategory: "important" },
  { templateKey: "speaking-scenario", title: "SpeakRPG 或 VoiceTube 情境對話一次", shortTitle: "情境對話", skill: "口說", completionMode: "single", target: 1, unit: "次", requiresEvidence: false, defaultCategory: "hobby" },
  { templateKey: "shadowing-twice", title: "跟讀練習 2 次", shortTitle: "跟讀 ×2", skill: "發音", completionMode: "count", target: 2, unit: "次", requiresEvidence: false, defaultCategory: "hobby" },
];

const VOCABULARY_GROWTH_CANDIDATES: WeeklyLearningCandidate[] = [
  { templateKey: "journal-translation", title: "日記自譯＋AI 對照修正", shortTitle: "日記自譯", skill: "寫作", completionMode: "single", target: 1, unit: "篇", requiresEvidence: false, defaultCategory: "important" },
  { templateKey: "vocabforge-journal-round-1", title: "VocabForge 第一輪（行光日記豆倉）", shortTitle: "生詞第一輪", skill: "詞彙", completionMode: "single", target: 1, unit: "輪", requiresEvidence: false, defaultCategory: "important" },
  { templateKey: "vocabforge-journal-round-2", title: "VocabForge 第二輪（行光日記豆倉）", shortTitle: "生詞第二輪", skill: "詞彙", completionMode: "single", target: 1, unit: "輪", requiresEvidence: false, defaultCategory: "important" },
  { templateKey: "work-five-expressions", title: "5 種說法＋當週工作實際使用", shortTitle: "說法實戰", skill: "口說", completionMode: "single", target: 1, unit: "次實戰", requiresEvidence: true, defaultCategory: "important" },
  { templateKey: "speaking-maintenance", title: "情境對話或跟讀維持一次", shortTitle: "口說維持", skill: "口說", completionMode: "single", target: 1, unit: "次", requiresEvidence: false, defaultCategory: "hobby" },
];

export function englishWeeklyCandidates(mode: EnglishWeeklyMode): WeeklyLearningCandidate[] {
  return (mode === "vocabulary-growth" ? VOCABULARY_GROWTH_CANDIDATES : FOUNDATION_WRITING_CANDIDATES).map((item) => ({ ...item }));
}

export function learningRecordTitle(key: LearningTrackKey): string {
  return `${LEARNING_TITLE_PREFIX}${key}`;
}

export function defaultLearningTrack(key: LearningTrackKey): LearningTrackRecord {
  const config = LEARNING_TRACKS[key];
  return {
    version: 2,
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
      weeklyMode: "foundation-writing",
    } : null,
    activityLog: [],
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
  const activityLog = Array.isArray(source.activityLog)
    ? source.activityLog.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const activity = item as Partial<LearningActivity>;
        if (!stringValue(activity.id) || !stringValue(activity.weekStart) || typeof activity.cellIndex !== "number") return [];
        return [{
          id: stringValue(activity.id).slice(0, 160),
          weekStart: stringValue(activity.weekStart).slice(0, 10),
          cellIndex: activity.cellIndex,
          templateKey: stringValue(activity.templateKey).slice(0, 100),
          skill: stringValue(activity.skill).slice(0, 100),
          progress: Math.max(0, Math.min(99, Math.round(Number(activity.progress) || 0))),
          target: Math.max(1, Math.min(99, Math.round(Number(activity.target) || 1))),
          unit: stringValue(activity.unit, "次").slice(0, 20),
          evidenceNote: stringValue(activity.evidenceNote).slice(0, 2000),
          completedAt: typeof activity.completedAt === "string" ? activity.completedAt : null,
          updatedAt: typeof activity.updatedAt === "string" ? activity.updatedAt : new Date().toISOString(),
        }];
      }).slice(-160)
    : [];

  return {
    ...base,
    version: 2,
    goal: stringValue(source.goal, base.goal).trim().slice(0, 1000),
    currentStage: stringValue(source.currentStage, base.currentStage).trim().slice(0, 500),
    currentFocus: stringValue(source.currentFocus).trim().slice(0, 1000),
    nextAction: stringValue(source.nextAction).trim().slice(0, 1000),
    english: expectedKey === "english" ? {
      currentLevel: englishSource && levels.includes(englishSource.currentLevel) ? englishSource.currentLevel : "A2",
      targetLevel: englishSource && levels.includes(englishSource.targetLevel) ? englishSource.targetLevel : "C1",
      focusSkills,
      checkpoint: stringValue(englishSource?.checkpoint, base.english?.checkpoint).trim().slice(0, 1000),
      weeklyMode: englishSource?.weeklyMode === "vocabulary-growth" ? "vocabulary-growth" : "foundation-writing",
    } : null,
    activityLog,
    updatedAt: new Date().toISOString(),
  };
}
