import { NextRequest, NextResponse } from "next/server";
import { requireLearningOwner } from "@/lib/dojo/learningFoundation/access";
import { LearningError } from "@/lib/dojo/learningFoundation/model";
import { DATA_SOURCES } from "@/lib/notion/schema";
import { readJsonRecord } from "@/lib/dojo/notionStore";
import { dailyRecordTitle } from "@/lib/dojo/formal";
import { CREATIVE_ROLE_TITLE, normalizeCreativeRole } from "@/lib/dojo/manifestation";
import { fileReflectionRepository } from "@/lib/dojo/reflection/store";
import { reflectionService } from "@/lib/dojo/reflection/service";
import type { DailySource, RoleSnapshot } from "@/lib/dojo/reflection/model";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };
function response(value: unknown, status = 200) { return NextResponse.json(value, { status, headers }); }
function failure(e: unknown) { return response({ error: e instanceof LearningError ? e.message : "私人整理暫時不可用；請保留草稿並重新核對" }, e instanceof LearningError ? e.status : 503); }
async function role(): Promise<RoleSnapshot | null> {
  const row = await readJsonRecord(CREATIVE_ROLE_TITLE); if (!row) return null;
  const r = normalizeCreativeRole(row.value); return r.title ? { id: r.id, title: r.title, traits: r.traits, updatedAt: r.updatedAt } : null;
}
function service() {
  return reflectionService({ owner: DATA_SOURCES.DB14_知識庫, repository: fileReflectionRepository(), role,
    async source(s: DailySource) {
      const row = await readJsonRecord(dailyRecordTitle(s.date));
      const value = row?.value as { updatedAt?: string; evening?: Partial<Record<DailySource["field"], string>> } | null;
      if (!row || row.id !== s.id || value?.updatedAt !== s.revision || typeof value?.evening?.[s.field] !== "string" || !value.evening[s.field]!.includes(s.excerpt))
        throw new LearningError("來源版本或片段已變更，請重新保存日復盤並選取文字", 409);
      return { ...s };
    },
  });
}
async function body(req: NextRequest) {
  const text = await req.text(); if (Buffer.byteLength(text, "utf8") > 600000) throw new LearningError("私人筆記內容超過保存上限", 413);
  try { return JSON.parse(text); } catch { throw new LearningError("請求內容格式不正確"); }
}
export async function GET(req: NextRequest) {
  try { requireLearningOwner(req); if (req.nextUrl.searchParams.get("role") === "1") return response({ role: await role() });
    const id = req.nextUrl.searchParams.get("id"); return response(id ? { note: await service().get(id) } : { notes: await service().list() });
  } catch (e) { return failure(e); }
}
export async function POST(req: NextRequest) { try { requireLearningOwner(req); return response({ note: await service().create(await body(req)) }, 201); } catch (e) { return failure(e); } }
export async function PATCH(req: NextRequest) { try { requireLearningOwner(req); const b = await body(req); return response({ note: await service().update(b.id, b.revision, b.patch) }); } catch (e) { return failure(e); } }
