import { PERSONAL_TEMPLATES, PERSONAL_PROJECTS, PERSONAL_BUNDLES } from "./weeklyPersonalizedSeed";
import type { BingoCell, DailyTaskCategory } from "./formal";

export type WeeklyTaskSource = "routine" | "project" | "custom" | "integration";
export type WeeklyTemplateStatus = "active" | "archived" | "done" | "paused" | "cancelled";
export type WeeklyProjectStatus = "priority" | "active" | "next" | "paused" | "done" | "cancelled";

export type WeeklyTaskTemplate = {
  id: string;
  name: string;
  shortLabel: string;
  category: DailyTaskCategory | null;
  source: WeeklyTaskSource;
  completionMode: BingoCell["completion"]["mode"];
  target: number;
  unit: string;
  criteria: string;
  note: string;
  templateCategory: string;
  projectId: string | null;
  subproject: string;
  status: WeeklyTemplateStatus;
  builtIn: boolean;
  checklist?: { id: string; text: string; done: boolean }[];
  superseded?: boolean;
};

export type WeeklyProjectTemplate = {
  id: string;
  name: string;
  group: string;
  status: WeeklyProjectStatus;
  statusLabel: string;
  recommendationAfter: string | null;
  goal?: string;
};

export type WeeklyTemplateBundle = {
  id: string;
  name: string;
  templateIds: string[];
  status: WeeklyTemplateStatus;
  builtIn: boolean;
};

export type WeeklyTemplateLibrary = {
  version: 2;
  revision?: 3;
  retiredProjects?: WeeklyProjectTemplate[];
  templates: WeeklyTaskTemplate[];
  projects: WeeklyProjectTemplate[];
  bundles: WeeklyTemplateBundle[];
  updatedAt: string;
};

type TemplateSeed = Partial<WeeklyTaskTemplate> & Pick<WeeklyTaskTemplate, "id" | "name" | "templateCategory">;

const routine = (seed: TemplateSeed): WeeklyTaskTemplate => ({
  shortLabel: seed.name.slice(0, 12), category: "important", source: "routine", completionMode: "single",
  target: 1, unit: "次", criteria: `完成「${seed.name}」。`, note: "", projectId: null, subproject: "",
  status: "active", builtIn: true, ...seed,
});

const project = (projectId: string, subproject: string, seed: TemplateSeed): WeeklyTaskTemplate => routine({
  source: "project", projectId, subproject, completionMode: "specified", ...seed,
});

const ROUTINES: WeeklyTaskTemplate[] = [
  routine({ id: "english-vocabforge-science", name: "VocabForge科學複習", shortLabel: "詞彙複習", templateCategory: "英文", completionMode: "count", target: 3, unit: "輪", criteria: "完成三輪科學複習；每輪五個單字。" }),
  routine({ id: "english-topic-input", name: "主題素材理解", templateCategory: "英文", criteria: "完成一次指定素材理解。" }),
  routine({ id: "english-topic-expression", name: "英文主題表達", templateCategory: "英文", criteria: "完成 First Answer、回饋及 Second Take。" }),
  routine({ id: "english-micro-context", name: "微型語境修習", templateCategory: "英文", criteria: "完成一次微型語境練習。" }),
  routine({ id: "english-context-transfer", name: "語境轉用", templateCategory: "英文", criteria: "把本週英文放進另一個真實或模擬語境中使用一次。" }),
  routine({ id: "english-reading", name: "英文閱讀", templateCategory: "英文", criteria: "完成一次閱讀活動；不強制製作筆記。" }),
  routine({ id: "english-media", name: "英文影音輸入", templateCategory: "英文", criteria: "完成一次指定片段的觀看或聆聽。" }),
  routine({ id: "english-real-use", name: "真實英文運用", templateCategory: "英文", completionMode: "free", criteria: "在工作、課堂或生活中使用英文，完成後留下簡短成果。" }),
  routine({ id: "english-weekly-revisit", name: "跨週回訪", templateCategory: "英文", criteria: "回訪至少相隔一週的舊素材。" }),
  routine({ id: "english-biweekly-revisit", name: "跨雙週回訪", templateCategory: "英文", criteria: "回訪至少相隔兩週的舊素材。" }),
  routine({ id: "english-flex-1", name: "彈性英文①", templateCategory: "英文", completionMode: "free", criteria: "自行決定本週想完成的英文成果。" }),
  routine({ id: "english-flex-2", name: "彈性英文②", templateCategory: "英文", completionMode: "free", criteria: "自行決定本週想完成的英文成果。" }),
  ...["繼續閱讀", "完成素材理解", "知識萃取", "洞察實踐", "知識回訪"].map((name, index) => routine({ id: `knowledge-${index + 1}`, name, templateCategory: "閱讀與知識" })),
  routine({ id: "health-stretch", name: "伸展與放鬆", category: "health", templateCategory: "健康與生活", completionMode: "count", target: 2 }),
  ...["運動一次", "提早睡覺", "自己做飯", "完整休息", "身體照顧"].map((name, index) => routine({ id: `health-${index + 2}`, name, category: "health", templateCategory: "健康與生活" })),
  ...["純粹玩遊戲", "創作靈感採集", "自由創作", "外出探索"].map((name, index) => routine({ id: `joy-${index + 1}`, name, category: "hobby", templateCategory: "喜歡的事", completionMode: "free" })),
];

const PROJECTS: WeeklyProjectTemplate[] = [
  { id: "lumen-improvement", name: "行光道場優化完善", group: "網站開發", status: "priority", statusLabel: "優先進行", recommendationAfter: null },
  { id: "muscle-education", name: "Muscle Education", group: "學習與內容", status: "active", statusLabel: "進行中", recommendationAfter: null },
  { id: "magic-tree-house", name: "Magic Tree House", group: "英文閱讀", status: "active", statusLabel: "進行中", recommendationAfter: null },
  { id: "context-room", name: "語境修習室", group: "網站開發", status: "active", statusLabel: "進行中", recommendationAfter: null },
  { id: "practice-improvement", name: "修習所優化", group: "網站開發", status: "next", statusLabel: "下一階段", recommendationAfter: null },
  { id: "zero-chat", name: "全零聊解室", group: "內容專案", status: "paused", statusLabel: "暫緩", recommendationAfter: "2026-11-01" },
];

const PROJECT_TASKS: WeeklyTaskTemplate[] = [
  ...["整理使用問題", "完成一項功能優化", "素材處理測試", "資料同步檢查", "手機介面完善", "完成一份開發需求規劃"].map((name, i) => project("lumen-improvement", "野採", { id: `lumen-forage-${i + 1}`, name: `野採｜${name}`, templateCategory: "本週專案" })),
  ...["整理功能問題", "知識整理流程完善", "知識連結功能完善", "內容轉化流程完善", "手機介面完善", "完整流程測試"].map((name, i) => project("lumen-improvement", "織光堂基礎功能", { id: `lumen-weaving-base-${i + 1}`, name: `織光堂｜${name}`, templateCategory: "本週專案" })),
  ...["長文", "圖文", "短影音", "長影片", "Podcast"].flatMap((workbench) => ["需求整理", "流程設計", "介面設計", "功能建置", "實際測試", "問題修正"].map((action, i) => project("lumen-improvement", `織光堂・${workbench}工作台`, { id: `lumen-weaving-${workbench}-${i + 1}`, name: `織光堂｜${workbench}工作台｜${action}`, templateCategory: "本週專案" }))),
  ...["整理現有功能", "完善一項功能", "行光牌測試", "資料管理檢查", "手機操作完善", "完成一份開發需求規劃"].map((name, i) => project("lumen-improvement", "道藏", { id: `lumen-dao-${i + 1}`, name: `道藏｜${name}`, templateCategory: "本週專案" })),
  ...["跨功能流程測試", "資料整合檢查", "手機介面驗收", "完成一項問題修復", "完成PR檢查", "完成部署與驗收"].map((name, i) => project("lumen-improvement", "系統整合", { id: `lumen-integration-${i + 1}`, name: `行光道場｜${name}`, templateCategory: "本週專案" })),
  ...["肌肉專業理解", "中文顧客解說", "英文五話題", "微型肌肉英文", "拉伸指導練習"].map((name, i) => project("muscle-education", "", { id: `muscle-${i + 1}`, name, templateCategory: "本週專案" })),
  ...["閱讀一個章節", "完成素材理解", "完成英文重述", "完成一項英文語境修習"].map((name, i) => project("magic-tree-house", "", { id: `magic-${i + 1}`, name, templateCategory: "本週專案" })),
  ...["功能需求規劃", "完成一項功能開發", "完成一項功能測試", "修復一項使用問題", "完成PR檢查", "完成部署與實際驗收"].map((name, i) => project("context-room", "", { id: `context-${i + 1}`, name, templateCategory: "本週專案" })),
  ...["功能整理", "使用問題盤點", "完成一項功能優化", "實際修習測試", "手機介面完善"].map((name, i) => project("practice-improvement", "", { id: `practice-${i + 1}`, name, templateCategory: "本週專案" })),
];

const BUNDLES: WeeklyTemplateBundle[] = [{
  id: "english-6-plus-2", name: "我的英文週盤6＋2",
  templateIds: ["english-topic-input", "english-topic-expression", "english-vocabforge-science", "english-context-transfer", "english-reading", "english-real-use", "english-flex-1", "english-flex-2"],
  status: "active", builtIn: true,
}];

function legacyWeeklyTemplateLibrary(): WeeklyTemplateLibrary {
  return { version: 2, templates: [...ROUTINES, ...PROJECT_TASKS], projects: PROJECTS, bundles: BUNDLES, updatedAt: new Date().toISOString() };
}

export function defaultWeeklyTemplateLibrary(): WeeklyTemplateLibrary {
 const old=legacyWeeklyTemplateLibrary();
 return {version:2,revision:3,templates:[...structuredClone(PERSONAL_TEMPLATES),...old.templates.map(t=>({...t,status:'archived' as const}))],projects:[...structuredClone(PERSONAL_PROJECTS),...old.projects.filter(p=>["context-room","zero-chat"].includes(p.id)).map(p=>({...p,name:p.id==="context-room"?"語境修習室建置與更新":p.name}))],retiredProjects:old.projects,bundles:[...structuredClone(PERSONAL_BUNDLES),...old.bundles.map(b=>({...b,status:'archived' as const}))],updatedAt:new Date().toISOString()};
}
export function normalizeWeeklyTemplateLibrary(value: unknown): WeeklyTemplateLibrary {
 const defaults=defaultWeeklyTemplateLibrary();
 const source=value&&typeof value==='object'?value as Partial<WeeklyTemplateLibrary>:{};
 const newIds=new Set(PERSONAL_TEMPLATES.map(t=>t.id));
 const templates=new Map(defaults.templates.map(t=>[t.id,t]));
 for(const raw of Array.isArray(source.templates)?source.templates:[]){
  if(!raw||typeof raw.id!=='string'||!raw.id.trim())continue;
  const prior=templates.get(raw.id)||routine({id:raw.id,name:raw.name||'未命名範本',templateCategory:'我的範本',builtIn:false});
  const retired=source.revision!==3&&prior.builtIn&&!newIds.has(raw.id);
  templates.set(raw.id,{...prior,...raw,name:String(raw.name||prior.name).slice(0,300),criteria:String(raw.criteria||'').slice(0,1000),target:Math.max(1,Math.min(99,Math.round(Number(raw.target)||1))),status:retired?'archived':raw.status||prior.status});
 }
 const removed=new Set(['muscle-education','magic-tree-house','lumen-improvement','practice-improvement']);
 const projects=new Map(defaults.projects.map(p=>[p.id,p]));
 const retired=new Map((defaults.retiredProjects||[]).filter(p=>removed.has(p.id)).map(p=>[p.id,p]));
 for(const p of [...(source.retiredProjects||[]),...(source.projects||[])])if(p?.id){if(removed.has(p.id))retired.set(p.id,p);else projects.set(p.id,{...projects.get(p.id),...p} as WeeklyProjectTemplate)}
 const bundles=new Map(defaults.bundles.map(b=>[b.id,b]));
 for(const b of source.bundles||[])if(b?.id)bundles.set(b.id,{...b,status:source.revision!==3&&b.builtIn?'archived':b.status});
 return {version:2,revision:3,templates:[...templates.values()],projects:[...projects.values()],retiredProjects:[...retired.values()],bundles:[...bundles.values()],updatedAt:new Date().toISOString()};
}
export function templateToCell(template: WeeklyTaskTemplate, index: number, weekStart: string): BingoCell {
  const now = Date.now().toString(36);
  return {
    index, taskInstanceId: `task:${weekStart}:${now}:${Math.random().toString(36).slice(2, 8)}`, templateId: template.id,
    text: template.name, shortLabel: template.shortLabel || template.name.slice(0, 12), category: template.category,
    sourceType: template.source === "project" ? "project" : template.source === "routine" ? "routine" : "manual",
    sourceId: template.projectId || template.id, learning: null,
    completion: { mode: template.completionMode, target: template.completionMode === "checklist" ? Math.max(1,template.checklist?.length||0) : template.completionMode === "count" ? template.target : 1, progress: 0, unit: template.unit, requiresEvidence: template.completionMode === "free", criteria: template.criteria },
    checklist: template.checklist?.map((item,i)=>({...item,id:`item-${now}-${i}`,done:false})),
    evidenceNote: "", note: template.note, completed: false, completedAt: null, assignedDate: null, assignedCategory: null,
  };
}
