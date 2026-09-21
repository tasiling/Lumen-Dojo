import { NextRequest, NextResponse } from "next/server";
import {
  englishImageVocabCandidates,
  exportEnglishImageVocabs,
  listVocabForgeBooks,
} from "@/lib/dojo/englishImageDispatch";
import { getEnglishImageEntry } from "@/lib/dojo/englishImageStore";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id")?.trim() || "";
    if (!id) return NextResponse.json({ error: "缺少英文影像 ID" }, { status: 400 });
    const [{ entry }, books] = await Promise.all([getEnglishImageEntry(id), listVocabForgeBooks({ forceRefresh: true })]);
    return NextResponse.json({
      candidates: englishImageVocabCandidates(entry),
      books,
      exports: entry.vocabForgeExports,
      syncStates: entry.vocabForgeSyncStates,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: /串接|無法讀取|沒有可選擇/.test(message) ? 503 : 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const id = typeof body.id === "string" ? body.id.trim() : "";
    const vocabBook = typeof body.vocabBook === "string" ? body.vocabBook : "";
    const candidateKeys = Array.isArray(body.candidateKeys)
      ? body.candidateKeys.filter((value: unknown): value is string => typeof value === "string")
      : [];
    if (!id) return NextResponse.json({ error: "缺少英文影像 ID" }, { status: 400 });
    const result = await exportEnglishImageVocabs(id, candidateKeys, vocabBook);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = /請先|請至少|最多|候選/.test(message) ? 400 : /串接尚未完成/.test(message) ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
