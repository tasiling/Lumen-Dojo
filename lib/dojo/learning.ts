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
export type EnglishWeeklyPath = "practice" | "system";
export type EnglishPracticeType =
  | "class-topic"
  | "reading"
  | "context-chat"
  | "journal-translation"
  | "vocabulary"
  | "workplace"
  | "system-build";

export type LearningActivity = {
  id: string;
  weekStart: string;
  cellIndex: number;
  templateKey: string;
  skill: string;
  path?: EnglishWeeklyPath;
  practiceType?: string;
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
  path: EnglishWeeklyPath;
  practiceType: EnglishPracticeType;
  group: string;
  completionCriteria: string;
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
  { templateKey: "journal-translation", title: "日記自譯＋AI 對照修正", shortTitle: "日記自譯", skill: "寫作", path: "practice", practiceType: "journal-translation", group: "日記自譯", completionCriteria: "完成一篇日記的自譯與 AI 對照。", completionMode: "single", target: 1, unit: "篇", requiresEvidence: false, defaultCategory: "important" },
  { templateKey: "vocabforge-journal-round", title: "VocabForge 一輪（來源：當週日記生詞）", shortTitle: "生詞一輪", skill: "詞彙", path: "practice", practiceType: "vocabulary", group: "詞彙與實戰", completionCriteria: "完成一次既定 VocabForge 回合，不另外搜尋生詞。", completionMode: "single", target: 1, unit: "輪", requiresEvidence: false, defaultCategory: "important" },
  { templateKey: "work-five-expressions", title: "5 種說法＋當週工作實際使用", shortTitle: "說法實戰", skill: "口說", path: "practice", practiceType: "workplace", group: "詞彙與實戰", completionCriteria: "選定一種說法，在工作中真正使用並記錄對方反應。", completionMode: "single", target: 1, unit: "次實戰", requiresEvidence: true, defaultCategory: "important" },
  { templateKey: "speaking-scenario", title: "SpeakRPG 或 VoiceTube 情境對話一次", shortTitle: "情境對話", skill: "口說", path: "practice", practiceType: "context-chat", group: "語境口說", completionCriteria: "完成一次指定情境對話並留下卡點。", completionMode: "single", target: 1, unit: "次", requiresEvidence: false, defaultCategory: "hobby" },
  { templateKey: "shadowing-twice", title: "跟讀練習 2 次", shortTitle: "跟讀 ×2", skill: "發音", path: "practice", practiceType: "context-chat", group: "語境口說", completionCriteria: "完成兩次跟讀練習。", completionMode: "count", target: 2, unit: "次", requiresEvidence: false, defaultCategory: "hobby" },
];

const VOCABULARY_GROWTH_CANDIDATES: WeeklyLearningCandidate[] = [
  { templateKey: "journal-translation", title: "日記自譯＋AI 對照修正", shortTitle: "日記自譯", skill: "寫作", path: "practice", practiceType: "journal-translation", group: "日記自譯", completionCriteria: "完成一篇日記的自譯與 AI 對照。", completionMode: "single", target: 1, unit: "篇", requiresEvidence: false, defaultCategory: "important" },
  { templateKey: "vocabforge-journal-round-1", title: "VocabForge 第一輪（行光日記豆倉）", shortTitle: "生詞第一輪", skill: "詞彙", path: "practice", practiceType: "vocabulary", group: "詞彙與實戰", completionCriteria: "完成第一輪既定 VocabForge 回合。", completionMode: "single", target: 1, unit: "輪", requiresEvidence: false, defaultCategory: "important" },
  { templateKey: "vocabforge-journal-round-2", title: "VocabForge 第二輪（行光日記豆倉）", shortTitle: "生詞第二輪", skill: "詞彙", path: "practice", practiceType: "vocabulary", group: "詞彙與實戰", completionCriteria: "完成第二輪既定 VocabForge 回合。", completionMode: "single", target: 1, unit: "輪", requiresEvidence: false, defaultCategory: "important" },
  { templateKey: "work-five-expressions", title: "5 種說法＋當週工作實際使用", shortTitle: "說法實戰", skill: "口說", path: "practice", practiceType: "workplace", group: "詞彙與實戰", completionCriteria: "選定一種說法，在工作中真正使用並記錄對方反應。", completionMode: "single", target: 1, unit: "次實戰", requiresEvidence: true, defaultCategory: "important" },
  { templateKey: "speaking-maintenance", title: "情境對話或跟讀維持一次", shortTitle: "口說維持", skill: "口說", path: "practice", practiceType: "context-chat", group: "語境口說", completionCriteria: "完成一次情境對話或跟讀維持。", completionMode: "single", target: 1, unit: "次", requiresEvidence: false, defaultCategory: "hobby" },
];

const ENGLISH_FOCUS_CANDIDATES: WeeklyLearningCandidate[] = [
  { templateKey: "topic-select-video", title: "課程主題・選定一支 VoiceTube 影片並保存連結", shortTitle: "主題選片", skill: "聽力", path: "practice", practiceType: "class-topic", group: "課程主題", completionCriteria: "為當週課堂主題選定一支影片，並把影片連結存進主題修習卡。", completionMode: "single", target: 1, unit: "支", requiresEvidence: false, defaultCategory: "important" },
  { templateKey: "topic-watch-absorb", title: "課程主題・看完影片並留下理解與 0–3 個表達", shortTitle: "觀看吸收", skill: "聽力", path: "practice", practiceType: "class-topic", group: "課程主題", completionCriteria: "看完影片，留下自己的理解；表達可留 0–3 個，不必湊數。", completionMode: "single", target: 1, unit: "次", requiresEvidence: false, defaultCategory: "important" },
  { templateKey: "topic-context-talk", title: "課程主題・完成一次 VoiceTube 或 GPT 語境對談", shortTitle: "主題對談", skill: "口說", path: "practice", practiceType: "class-topic", group: "課程主題", completionCriteria: "完成一次主題對談，留下成功說出的重點、卡點或下次補強方向。", completionMode: "single", target: 1, unit: "次", requiresEvidence: false, defaultCategory: "hobby" },
  { templateKey: "magic-tree-house-read", title: "Magic Tree House・閱讀一章或自然閱讀 20 分鐘", shortTitle: "故事閱讀", skill: "閱讀", path: "practice", practiceType: "reading", group: "閱讀", completionCriteria: "完成一章；若章節較長，連續自然閱讀 20 分鐘也算完成。", completionMode: "single", target: 1, unit: "回", requiresEvidence: false, defaultCategory: "hobby" },
  { templateKey: "magic-tree-house-retell", title: "Magic Tree House・用英文留下 3–5 句讀後重述", shortTitle: "讀後重述", skill: "口說", path: "practice", practiceType: "reading", group: "閱讀", completionCriteria: "用英文寫下或說出 3–5 句故事重點，不要求逐句正確。", completionMode: "single", target: 1, unit: "次", requiresEvidence: false, defaultCategory: "important" },
  { templateKey: "english-context-chat", title: "英文語境聊天・完成一次指定情境對話", shortTitle: "語境聊天", skill: "口說", path: "practice", practiceType: "context-chat", group: "語境口說", completionCriteria: "選一個按摩、生活或課堂情境完成對話，並留下至少一個卡點。", completionMode: "single", target: 1, unit: "次", requiresEvidence: false, defaultCategory: "hobby" },
  { templateKey: "journal-translation-1", title: "日記分段自譯・完成第一個段落與 AI 對照", shortTitle: "自譯一段", skill: "寫作", path: "practice", practiceType: "journal-translation", group: "日記自譯", completionCriteria: "完成一個日記段落的英文初稿，以及 AI 修正版或自己的定稿。", completionMode: "single", target: 1, unit: "段", requiresEvidence: false, defaultCategory: "important" },
  { templateKey: "journal-translation-2", title: "日記分段自譯・完成第二個段落與 AI 對照", shortTitle: "再譯一段", skill: "寫作", path: "practice", practiceType: "journal-translation", group: "日記自譯", completionCriteria: "再完成一個不同段落；不用同一天完成，也不用一次翻完整篇。", completionMode: "single", target: 1, unit: "段", requiresEvidence: false, defaultCategory: "important" },
  { templateKey: "vocabforge-one-round", title: "VocabForge・完成一輪當週既定複習", shortTitle: "詞彙一輪", skill: "詞彙", path: "practice", practiceType: "vocabulary", group: "詞彙與實戰", completionCriteria: "完成一次既定 VocabForge 回合，生詞只使用日記、閱讀或主題修習留下的內容。", completionMode: "single", target: 1, unit: "輪", requiresEvidence: false, defaultCategory: "important" },
  { templateKey: "work-expression-practice", title: "工作說法實戰・選一種英文在工作中真正使用", shortTitle: "工作實戰", skill: "口說", path: "practice", practiceType: "workplace", group: "詞彙與實戰", completionCriteria: "實際對客人使用一次，並記下日期、情境、說法與對方反應。", completionMode: "single", target: 1, unit: "次", requiresEvidence: true, defaultCategory: "important" },
];

export function englishWeeklyCandidates(mode: EnglishWeeklyMode): WeeklyLearningCandidate[] {
  return (mode === "vocabulary-growth" ? VOCABULARY_GROWTH_CANDIDATES : FOUNDATION_WRITING_CANDIDATES).map((item) => ({ ...item }));
}

export function englishFocusWeeklyCandidates(): WeeklyLearningCandidate[] {
  return ENGLISH_FOCUS_CANDIDATES.map((item) => ({ ...item }));
}

// 專屬工作台尚未完成前，週盤依真實手動負擔只放四格。後續工具成熟時，
// englishWeeklyCandidates 仍保留完整五格規格，方便切回自動化版本。
export function englishManualWeeklyCandidates(mode: EnglishWeeklyMode): WeeklyLearningCandidate[] {
  const candidates = mode === "vocabulary-growth" ? VOCABULARY_GROWTH_CANDIDATES : FOUNDATION_WRITING_CANDIDATES;
  const selectedKeys = mode === "vocabulary-growth"
    ? new Set(["journal-translation", "vocabforge-journal-round-1", "work-five-expressions", "speaking-maintenance"])
    : new Set(["journal-translation", "vocabforge-journal-round", "work-five-expressions", "speaking-scenario"]);
  return candidates.filter((item) => selectedKeys.has(item.templateKey)).map((item) => ({ ...item }));
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
          path: activity.path === "system" ? "system" as const : "practice" as const,
          practiceType: typeof activity.practiceType === "string" ? activity.practiceType : undefined,
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
