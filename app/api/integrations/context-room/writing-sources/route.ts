import { timingSafeEqual } from "node:crypto";
import { createJournalReader, JournalReaderError } from "@/lib/dojo/writingJournalReader.mjs";
import { DATA_SOURCES } from "@/lib/notion/schema";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
export async function GET(request: Request) {
  const expected = process.env.LUMEN_CONTEXT_ROOM_SYNC_SECRET?.trim() || "";
  const authorization = request.headers.get("authorization") || "";
  const supplied = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  const left = Buffer.from(expected), right = Buffer.from(supplied);
  if (!expected || !supplied || left.length !== right.length || !timingSafeEqual(left, right))
    return Response.json({ error: "來源讀取授權失敗" }, { status: 401, headers });
  try {
    const reader = createJournalReader({token: process.env.NOTION_TOKEN, dailyDataSourceId: DATA_SOURCES.DB14_知識庫, journalDataSourceId: DATA_SOURCES.DB18_日記庫});
    const params = new URL(request.url).searchParams;
    if (params.has("id")) return Response.json({record: await reader.read({kind: params.get("kind") || "", id: params.get("id") || ""})}, {headers});
    return Response.json(await reader.list({date: params.get("date") || "", cursor: params.get("cursor") || ""}), {headers});
  } catch (error) {
    return Response.json({error: error instanceof JournalReaderError ? error.message : "日記來源暫時無法讀取，請重試。"}, {status: error instanceof JournalReaderError ? error.status : 503, headers});
  }
}
