import { createHash } from "node:crypto";
import { LearningError } from "../learningFoundation/model";
import { normalizeLightTags } from "../lightCodex";
import { REFLECTION_TOOLS } from "./templates";
import { reflectionId } from "./store";
import type { DailySource, Depth, ReflectionMetadata, ReflectionNote, ReflectionRepository, RoleSnapshot } from "./model";
type Input = Record<string, unknown>;
function object(v: unknown): Input { if (!v || typeof v !== "object" || Array.isArray(v)) throw new LearningError("筆記內容格式不正確"); return v as Input; }
function text(v: unknown, max: number, field: string): string { if (typeof v !== "string" || v.length > max) throw new LearningError(`${field}格式或長度不正確`); return v; }
function date(v: unknown): string { const s = text(v, 10, "日期"); if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || !Number.isFinite(Date.parse(s)) || new Date(s).toISOString().slice(0, 10) !== s) throw new LearningError("日期格式不正確"); return s; }
function depth(v: unknown): Depth { if (!["light", "moderate", "deep"].includes(String(v))) throw new LearningError("整理深度不正確"); return v as Depth; }
function choices(v: unknown): string[] { if (!Array.isArray(v) || v.length > 40) throw new LearningError("快捷選項格式不正確"); return [...new Set(v.map(x => text(x, 120, "選項").trim()).filter(Boolean))]; }
function source(v: unknown): DailySource {
  const s = object(v); const field = s.field;
  if (!["highlight", "block", "insight"].includes(String(field))) throw new LearningError("來源欄位不正確");
  const excerpt = text(s.excerpt, 3000, "來源片段"); if (!excerpt.trim()) throw new LearningError("來源片段不可空白");
  return { id: text(s.id, 120, "來源 ID"), date: date(s.date), field: field as DailySource["field"], revision: text(s.revision, 120, "來源版本"), excerpt };
}
export function reflectionService({ owner, repository, source: readSource, role }: {
  owner: string; repository: ReflectionRepository; source?: (s: DailySource) => Promise<DailySource>; role?: () => Promise<RoleSnapshot | null>;
}) {
  function owned(note: ReflectionNote | null): ReflectionNote { if (!note || note.owner !== owner) throw new LearningError("私人筆記不存在或 owner 無權存取", 404); return note; }
  async function snapshot(id: unknown) {
    if (id === null || id === undefined || id === "") return null;
    const r = await role?.(); if (!r || r.id !== id) throw new LearningError("角色不存在或無權存取", 404); return structuredClone(r);
  }
  return {
    async get(id: string) { return owned(await repository.get(reflectionId(id))); },
    async list(): Promise<ReflectionMetadata[]> {
      return (await repository.list()).filter(n => n.owner === owner).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map(n => {
        const { id, title, date, toolId, toolName, toolVersion, status, topicGroup, updatedAt } = n;
        return { id, title, date, toolId, toolName, toolVersion, status, topicGroup, updatedAt };
      });
    },
    async create(raw: unknown) {
      const input = object(raw); const id = reflectionId(input.createRequestId);
      const tool = REFLECTION_TOOLS.find(t => t.id === input.toolId); if (!tool) throw new LearningError("整理工具不正確");
      const practicedOn = date(input.date); const src = input.source ? source(input.source) : null;
      const fingerprint = createHash("sha256").update(JSON.stringify([tool.id, practicedOn, src ? [src.id, src.date, src.field, src.excerpt] : null])).digest("hex");
      return repository.exclusive(async () => {
        const previous = await repository.get(id);
        if (previous) { owned(previous); if (previous.requestFingerprint !== fingerprint) throw new LearningError("建立請求 ID 不可重用於不同內容", 409); return previous; }
        const verified = src ? await readSource?.(src) : null;
        if (src && !verified) throw new LearningError("無法確認日復盤來源", 503);
        const now = new Date().toISOString(); const answers: Record<string, string> = {};
        // Only explicit semantic matches; all other tools retain the editable source card.
        if (verified && ((verified.field === "highlight" && tool.id === "gratitude") || (verified.field === "block" && tool.id === "awareness") || (verified.field === "highlight" && tool.id === "awareness"))) answers[tool.questions[0].id] = verified.excerpt;
        if (input.status !== undefined && !["draft", "pending"].includes(String(input.status))) throw new LearningError("建立狀態不正確");
        const note: ReflectionNote = {
          version: 1, id, owner, revision: 1, requestFingerprint: fingerprint,
          toolId: tool.id, toolName: tool.name, toolVersion: tool.version, questions: structuredClone(tool.questions), modes: structuredClone(tool.modes),
          title: tool.name, date: practicedOn, depth: depth(input.depth ?? "moderate"), status: input.status === "pending" ? "pending" : "draft",
          answers, topicGroup: "", source: verified ?? null, sourceNote: verified?.excerpt ?? "", roleSnapshot: tool.id === "dialogue" ? await snapshot(input.roleId) : null,
          emotionChoices: [], needChoices: [], lightTags: [], createdAt: now, updatedAt: now,
        };
        await repository.write(note); return note;
      });
    },
    async update(id: string, revision: number, raw: unknown) {
      const input = object(raw);
      return repository.exclusive(async () => {
        const n = structuredClone(owned(await repository.get(reflectionId(id))));
        if (revision !== n.revision) throw new LearningError("私人筆記版本已變更，請重新讀取", 409);
        for (const key of ["title", "topicGroup", "sourceNote"] as const) if (key in input) n[key] = text(input[key], key === "sourceNote" ? 20000 : 180, key);
        if ("date" in input) n.date = date(input.date);
        if ("depth" in input) n.depth = depth(input.depth);
        if ("answers" in input) for (const [key, value] of Object.entries(object(input.answers))) {
          if (!n.questions.some(q => q.id === key)) throw new LearningError("題目 ID 不存在於保存的模板");
          n.answers[key] = text(value, 20000, "回答");
        }
        if ("status" in input) { if (!["draft", "pending", "completed"].includes(String(input.status))) throw new LearningError("筆記狀態不正確"); n.status = input.status as ReflectionNote["status"]; }
        if (n.status === "completed" && !Object.values(n.answers).some(a => a.trim())) throw new LearningError("空白筆記不能完成");
        for (const key of ["emotionChoices", "needChoices"] as const) if (key in input) n[key] = choices(input[key]);
        if ("lightTags" in input) { const tags = choices(input.lightTags); n.lightTags = normalizeLightTags({ lightTags: tags }); if (n.lightTags.length !== tags.length) throw new LearningError("光標記不正確"); }
        if ("roleId" in input) {
          if (n.toolId !== "dialogue" && input.roleId) throw new LearningError("此工具不使用角色");
          // Preserve an already saved role snapshot even when its live profile changed.
          n.roleSnapshot = input.roleId === n.roleSnapshot?.id ? n.roleSnapshot : await snapshot(input.roleId);
        }
        n.revision++; n.updatedAt = new Date().toISOString(); await repository.write(n); return n;
      });
    },
  };
}
