// Pure planning rules for the automatic "screenshot → learning unit" step.
// No I/O here so the rules can be tested without Notion, OpenAI or the receiver.
import type { EnglishImageContextAuto, EnglishImageEntry } from "./englishImage";

export type AutoUnitProject = {
  id: string;
  type: string;
  title: string;
  units: Array<{ id: string; label: string; learningGoal: string; status: string }>;
};

/** What the model (or nothing, when it is unavailable) suggested. Never trusted without validation. */
export type AutoUnitDecision = {
  project: "existing" | "new" | "ask";
  projectId: string;
  projectTitle: string;
  unit: "existing" | "new";
  unitId: string;
  unitTitle: string;
  reason: string;
};

/** A project the owner picked in LINE, which outranks every automatic guess. */
export type AutoUnitChoice = { projectId?: string; projectTitle?: string };

export type AutoUnitTarget = {
  projectMode: "create" | "existing";
  materialId: string;
  materialTitle: string;
  projectType: string;
  unitMode: "create" | "existing";
  unitId: string;
  eventTitle: string;
  crossTypeConfirmed: boolean;
  reason: string;
  decidedBy: EnglishImageContextAuto["decidedBy"];
};

export function expectedProjectType(route: EnglishImageEntry["route"]): string {
  return route === "field" ? "field_experience" : route === "video" ? "video" : route === "game" ? "game_journey"
    : route === "classroom" ? "class_topic" : route === "reading" ? "reading" : "custom";
}

export function comparableTitle(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("en").replace(/[\s_:：／/|｜–—-]+/g, "");
}

function clean(value: unknown, max: number): string {
  return typeof value === "string" ? value.normalize("NFKC").replace(/\s+/g, " ").trim().slice(0, max) : "";
}

export function findProjectByTitle(projects: AutoUnitProject[], title: string): AutoUnitProject | undefined {
  const expected = comparableTitle(title);
  return expected ? projects.find(project => comparableTitle(project.title) === expected) : undefined;
}

/**
 * Projects the model may choose from: only the same kind of material, so an
 * automatic run can never cross project types without the owner saying so.
 */
export function selectableProjects(entry: EnglishImageEntry, projects: AutoUnitProject[]): AutoUnitProject[] {
  const type = expectedProjectType(entry.route);
  return projects.filter(project => !project.type || project.type === type).slice(0, 20)
    .map(project => ({ ...project, units: project.units.filter(unit => unit.status === "active").slice(0, 40) }));
}

/** A unit name that still says something when the model is unavailable. */
export function fallbackUnitTitle(entry: EnglishImageEntry, firstExpression = ""): string {
  const screens = entry.route === "game" ? entry.gameLearning?.screens ?? [] : [];
  const fromScreens = [...new Set(screens.map(screen => clean(screen.unit || screen.title, 60)).filter(Boolean))].slice(0, 2).join("、");
  if (fromScreens) return fromScreens.slice(0, 120);
  const title = clean(entry.title, 120);
  if (title && comparableTitle(title) !== comparableTitle(entry.sourceLabel)) return title;
  if (firstExpression) return `「${clean(firstExpression, 60)}」等表達`;
  return `${entry.capturedAt.slice(0, 10)} 的素材`;
}

/**
 * Decide where one analysed source goes. Order of authority:
 * the owner's pick → the unit this source already lives in → an exact title
 * match → a validated model suggestion → a new project named after the source.
 * Returns "ask" only when nothing names the project.
 */
export function resolveAutoUnitTarget(params: {
  entry: EnglishImageEntry;
  projects: AutoUnitProject[];
  supportsExistingUnit: boolean;
  sourceName: string;
  decision: AutoUnitDecision | null;
  choice?: AutoUnitChoice;
  firstExpression?: string;
}): AutoUnitTarget | "ask" {
  const { entry, projects, supportsExistingUnit, decision } = params;
  const expectedType = expectedProjectType(entry.route);
  const choice = params.choice ?? {};
  const ownerPicked = Boolean(choice.projectId || clean(choice.projectTitle, 300));

  if (!ownerPicked && supportsExistingUnit) {
    const previous = [...entry.contextRoomLinks].reverse().find(link => link.status === "synced" && link.projectId && link.unitId);
    const project = previous && projects.find(item => item.id === previous.projectId);
    const unit = project?.units.find(item => item.id === previous?.unitId && item.status === "active");
    if (previous && project && unit) {
      return {
        projectMode: "existing", materialId: project.id, materialTitle: project.title, projectType: project.type,
        unitMode: "existing", unitId: unit.id, eventTitle: unit.label,
        crossTypeConfirmed: Boolean(project.type) && project.type !== expectedType,
        reason: "這組素材先前已經放在這個單元，這次直接更新內容。", decidedBy: "rule",
      };
    }
  }

  const allowed = selectableProjects(entry, projects);
  let project: AutoUnitProject | undefined;
  let newTitle = "";
  let decidedBy: AutoUnitTarget["decidedBy"] = "rule";
  let projectReason = "";

  if (ownerPicked) {
    decidedBy = "owner";
    project = (choice.projectId ? projects.find(item => item.id === choice.projectId) : undefined)
      ?? findProjectByTitle(projects, clean(choice.projectTitle, 300));
    if (!project) newTitle = clean(choice.projectTitle, 300);
    if (!project && !newTitle) return "ask";
    projectReason = "依你指定的學習專案安排。";
  } else {
    project = findProjectByTitle(projects, params.sourceName);
    if (project) projectReason = `來源名稱與既有學習專案「${project.title}」相同。`;
    else if (decision?.project === "existing" && allowed.some(item => item.id === decision.projectId)) {
      project = allowed.find(item => item.id === decision.projectId);
      decidedBy = "ai";
    } else if (decision?.project === "new" && (clean(decision.projectTitle, 300) || params.sourceName)) {
      newTitle = clean(decision.projectTitle, 300) || params.sourceName;
      decidedBy = "ai";
    } else if (params.sourceName) {
      newTitle = params.sourceName;
      projectReason = "沒有名稱相同的學習專案，所以用來源名稱建立新專案。";
    } else return "ask";
    // A model-proposed name that already exists must reuse that project, not duplicate it.
    if (!project && newTitle) project = findProjectByTitle(projects, newTitle);
  }

  const modelReason = clean(decision?.reason, 300);
  const unit = project && supportsExistingUnit && decision?.unit === "existing"
    ? project.units.find(item => item.id === decision.unitId && item.status === "active")
    : undefined;
  if (unit && decidedBy === "rule") decidedBy = "ai";
  const unitTitle = unit?.label || clean(decision?.unit === "new" ? decision.unitTitle : "", 300)
    || fallbackUnitTitle(entry, params.firstExpression);
  const usedModel = Boolean(decision) && (decidedBy === "ai" || Boolean(unit) || unitTitle === clean(decision?.unitTitle, 300));
  return {
    projectMode: project ? "existing" : "create",
    materialId: project?.id ?? "",
    materialTitle: project?.title ?? newTitle,
    projectType: project?.type || expectedType,
    unitMode: unit ? "existing" : "create",
    unitId: unit?.id ?? "",
    eventTitle: unitTitle,
    // Crossing project types is only allowed on the owner's explicit pick or an exact title match.
    crossTypeConfirmed: Boolean(project?.type) && project?.type !== expectedType,
    reason: [projectReason, usedModel ? modelReason : ""].filter(Boolean).join(" ") || "依素材內容建立新的學習單元。",
    decidedBy,
  };
}

/** The first thing the owner reads in LINE: did a unit get built, and where. */
export function autoUnitLineReport(auto: EnglishImageContextAuto | null | undefined): string {
  if (!auto) return "";
  if (auto.status === "built") {
    return [
      auto.unitReused ? "✅ 已併入語境修習室的既有學習單元" : "✅ 已在語境修習室建立新的學習單元",
      `學習專案：${auto.projectTitle}（${auto.projectReused ? "既有專案" : "新建立"}）`,
      `學習單元：${auto.unitTitle}（${auto.unitReused ? "既有單元" : "新建立"}）`,
      `收進表達：${auto.expressionCount} 個`,
      auto.reason ? `安排理由：${auto.reason}` : "",
      "接下來只要到語境修習室複習即可；位置不合適時可按「改放其他單元」。",
    ].filter(Boolean).join("\n");
  }
  if (auto.status === "needs-source") {
    return "⏸ 學習單元尚未建立\n還無法判斷這組素材屬於哪個學習專案。請點選下方的既有專案，或按「輸入專案名稱」告訴我作品或主題名稱，我會立刻建立單元。";
  }
  return `⚠️ 學習單元尚未建立\n原因：${auto.error || "語境修習室沒有回應"}\n原圖與 AI 整理都已保存，可按「再試一次建立單元」。`;
}

/** One short phrase for lists ("最近一筆", the inbox badges). */
export function autoUnitStatusLabel(entry: Pick<EnglishImageEntry, "contextRoomAuto" | "contextRoomStatus" | "contextRoomExport">): string {
  const auto = entry.contextRoomAuto;
  if (auto?.status === "built") return `已建立學習單元「${auto.unitTitle}」`;
  if (auto?.status === "needs-source") return "學習單元尚未建立（等你指定學習專案）";
  if (auto?.status === "failed") return "學習單元建立失敗，可重試";
  if (entry.contextRoomStatus === "synced" && entry.contextRoomExport) return `已送入學習單元「${entry.contextRoomExport.eventTitle}」`;
  return "尚未建立學習單元";
}
