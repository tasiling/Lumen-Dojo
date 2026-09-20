export const CREATIVE_ROLE_TITLE = "行光創現角色";
export const MANIFESTATION_MILESTONE_TITLE_PREFIX = "行光創現里程碑-";
export const CREATIVE_PRACTICE_TITLE_PREFIX = "行光創現修習-";

export type CreativeRoleMessage = {
  id: string;
  text: string;
  createdAt: string;
};

export type CreativeRoleProfile = {
  version: 2;
  id: string;
  title: string;
  traits: string[];
  note: string;
  messages: CreativeRoleMessage[];
  updatedAt: string;
};

export type ManifestationMilestone = {
  version: 1;
  id: string;
  action: string;
  response: string;
  trait: string;
  reflection: string;
  date: string;
  createdAt: string;
};

type CreativePracticeBase = {
  version: 1;
  id: string;
  practicedOn: string;
  durationSeconds: number;
  createdAt: string;
};

export type AffirmPracticeRecord = CreativePracticeBase & {
  method: "affirm";
  statements: string[];
  repetitionCount: number | null;
  feeling: string;
  roleSnapshot: { title: string; traits: string[] };
};

export type VisionPracticeRecord = CreativePracticeBase & {
  method: "vision";
  sourceType: "trait" | "milestone" | "custom";
  sourceId: string | null;
  sourceLabel: string;
  scene: string;
  sensoryDetails: string;
  bodyFeeling: string;
};

export type CreativePracticeRecord = AffirmPracticeRecord | VisionPracticeRecord;

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function emptyCreativeRole(): CreativeRoleProfile {
  return {
    version: 2,
    id: "primary",
    title: "",
    traits: [],
    note: "",
    messages: [],
    updatedAt: new Date().toISOString(),
  };
}

export function normalizeCreativeRole(value: unknown): CreativeRoleProfile {
  const source = value && typeof value === "object" ? value as Partial<CreativeRoleProfile> : {};
  const traits = Array.isArray(source.traits)
    ? source.traits.map((item) => text(item, 40)).filter(Boolean).slice(0, 3)
    : [];
  const messages = Array.isArray(source.messages)
    ? source.messages.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const message = item as Partial<CreativeRoleMessage>;
        const messageText = text(message.text, 1000);
        if (!messageText) return [];
        return [{
          id: text(message.id, 120) || crypto.randomUUID(),
          text: messageText,
          createdAt: typeof message.createdAt === "string" ? message.createdAt : new Date().toISOString(),
        }];
      }).slice(-50)
    : [];
  return {
    version: 2,
    id: text(source.id, 120) || "primary",
    title: text(source.title, 160),
    traits: [...new Set(traits)],
    note: text(source.note, 1000),
    messages,
    updatedAt: typeof source.updatedAt === "string" ? source.updatedAt : new Date().toISOString(),
  };
}

export function normalizeManifestationMilestone(
  value: unknown,
  fallback: { id: string; date: string; createdAt?: string }
): ManifestationMilestone | null {
  const source = value && typeof value === "object" ? value as Partial<ManifestationMilestone> : {};
  const action = text(source.action, 1000);
  const trait = text(source.trait, 80);
  if (!action || !trait) return null;
  return {
    version: 1,
    id: fallback.id,
    action,
    response: text(source.response, 1000),
    trait,
    reflection: text(source.reflection, 1500),
    date: /^\d{4}-\d{2}-\d{2}$/.test(String(source.date)) ? String(source.date) : fallback.date,
    createdAt: typeof source.createdAt === "string" ? source.createdAt : fallback.createdAt ?? new Date().toISOString(),
  };
}

export function manifestationMilestoneTitle(date: string, nonce: string) {
  return `${MANIFESTATION_MILESTONE_TITLE_PREFIX}${date.replaceAll("-", "")}-${nonce}`;
}

function safeDate(value: unknown, fallback: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? String(value) : fallback;
}

function safeSeconds(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(24 * 60 * 60, Math.round(number))) : 0;
}

export function normalizeCreativePractice(
  value: unknown,
  fallback: { id: string; practicedOn: string; createdAt?: string }
): CreativePracticeRecord | null {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const base = {
    version: 1 as const,
    id: fallback.id,
    practicedOn: safeDate(source.practicedOn, fallback.practicedOn),
    durationSeconds: safeSeconds(source.durationSeconds),
    createdAt: typeof source.createdAt === "string" ? source.createdAt : fallback.createdAt ?? new Date().toISOString(),
  };
  if (source.method === "affirm") {
    const statements = Array.isArray(source.statements)
      ? source.statements.map((item) => text(item, 500)).filter(Boolean).slice(0, 3)
      : [];
    if (!statements.length) return null;
    const rawCount = typeof source.repetitionCount === "number" ? source.repetitionCount : Number(source.repetitionCount);
    const repetitionCount = Number.isFinite(rawCount) && rawCount > 0 ? Math.min(9999, Math.round(rawCount)) : null;
    const snapshot = source.roleSnapshot && typeof source.roleSnapshot === "object"
      ? source.roleSnapshot as { title?: unknown; traits?: unknown }
      : {};
    return {
      ...base,
      method: "affirm",
      statements,
      repetitionCount,
      feeling: text(source.feeling, 1000),
      roleSnapshot: {
        title: text(snapshot.title, 160),
        traits: Array.isArray(snapshot.traits)
          ? [...new Set(snapshot.traits.map((item) => text(item, 40)).filter(Boolean))].slice(0, 3)
          : [],
      },
    };
  }
  if (source.method === "vision") {
    const sourceType = source.sourceType === "trait" || source.sourceType === "milestone" ? source.sourceType : "custom";
    const scene = text(source.scene, 2000);
    if (!scene) return null;
    return {
      ...base,
      method: "vision",
      sourceType,
      sourceId: typeof source.sourceId === "string" && source.sourceId.trim() ? source.sourceId.trim().slice(0, 200) : null,
      sourceLabel: text(source.sourceLabel, 300),
      scene,
      sensoryDetails: text(source.sensoryDetails, 2000),
      bodyFeeling: text(source.bodyFeeling, 1000),
    };
  }
  return null;
}

export function creativePracticeTitle(method: CreativePracticeRecord["method"], date: string, nonce: string) {
  return `${CREATIVE_PRACTICE_TITLE_PREFIX}${method}-${date.replaceAll("-", "")}-${nonce}`;
}

export function suggestedAffirmations(profile: Pick<CreativeRoleProfile, "title" | "traits">) {
  const title = profile.title.trim();
  const traits = profile.traits.filter(Boolean).slice(0, 3);
  return [
    title ? `我正在主動創作「${title}」這個版本的自己。` : "",
    traits.length ? `我決定讓${traits.join("、")}，成為我採取行動的方式。` : "",
  ].filter(Boolean);
}
