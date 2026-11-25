import { NextRequest, NextResponse } from "next/server";
import { requireLearningOwner } from "@/lib/dojo/learningFoundation/access";
import { LearningError } from "@/lib/dojo/learningFoundation/model";
import {
  addDaoVersion, archiveDaoQuestion, createDaoQuestion, daoToKnowledge, getDaoQuestion, linkDaoShuttle, linkDaoSources,
  listDaoQuestions, listDaoSources, storeShuttleCore, unlinkDaoSource,
} from "@/lib/dojo/daoQuestionStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
const failure = (error: unknown) => json(
  { error: error instanceof LearningError ? error.message : "操作沒有完成，請稍後再試。" },
  error instanceof LearningError ? error.status : 500,
);
const str = (value: unknown) => typeof value === "string" ? value : "";
const strings = (value: unknown) => Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];

/**
 * 道藏的長期問題。GET 列出全部；GET ?id= 讀一個；GET ?sources=1 列出可連結的來源（與織光堂共用的卡片清單）。
 * POST 以 action 區分：create、version、link、unlink、shuttle、store、knowledge、archive。
 */
export async function GET(req: NextRequest) {
  try {
    requireLearningOwner(req);
    const params = req.nextUrl.searchParams;
    if (params.get("sources") === "1") return json({ sources: await listDaoSources() });
    const id = params.get("id");
    if (id) return json({ question: await getDaoQuestion(id) });
    return json({ questions: await listDaoQuestions() });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    requireLearningOwner(req);
    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    if (!body || typeof body !== "object") throw new LearningError("請提供 JSON 物件。", 400);
    const id = str(body.id);
    switch (body.action) {
      case "create":
        return json({ question: await createDaoQuestion({ title: str(body.title), understanding: str(body.understanding), sources: strings(body.sources) }) }, 201);
      case "version":
        return json({ question: await addDaoVersion(id, { text: str(body.text), note: str(body.note), from: str(body.from) }) });
      case "link":
        return json({ question: await linkDaoSources(id, strings(body.sources)) });
      case "unlink":
        return json({ question: await unlinkDaoSource(id, str(body.source)) });
      case "shuttle":
        return json({ question: await linkDaoShuttle(id, { id: str(body.shuttleId), title: str(body.title) }) });
      case "store":
        return json({ question: await storeShuttleCore({ toId: id, shuttleId: str(body.shuttleId), title: str(body.title), core: str(body.core), cardIds: strings(body.cardIds) }) });
      case "knowledge":
        return json(await daoToKnowledge(id, { statement: str(body.statement), boundary: str(body.boundary) }));
      case "archive":
        return json({ question: await archiveDaoQuestion(id) });
      default:
        throw new LearningError("不支援的操作。", 400);
    }
  } catch (error) {
    return failure(error);
  }
}
