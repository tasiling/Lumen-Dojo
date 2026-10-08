import { NextRequest, NextResponse } from "next/server";
import {
  englishImageVocabCandidates,
  exportEnglishImageVocabs,
  listVocabForgeBooks,
  recommendedFocusDecks,
} from "@/lib/dojo/englishImageDispatch";
import { getEnglishImageEntry } from "@/lib/dojo/englishImageStore";
import { rewriteEnglishImageLearningUsages } from "@/lib/dojo/englishImageAnalysis";
import { learningUsageIssues } from "@/lib/dojo/englishImageLearningUsage";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id")?.trim() || "";
    if (!id) return NextResponse.json({ error: "缺少英文影像 ID" }, { status: 400 });
    const [{ entry }, books] = await Promise.all([getEnglishImageEntry(id), listVocabForgeBooks({ forceRefresh: true })]);
    return NextResponse.json({
      candidates: candidatePreviews(entry),
      books,
      exports: entry.vocabForgeExports,
      syncStates: entry.vocabForgeSyncStates,
      defaults: {
        sourceName: entry.vocabForgeDraft.sourceName || entry.sourceLabel || entry.title,
        focusDecks: entry.vocabForgeDraft.focusDecks.length ? entry.vocabForgeDraft.focusDecks : recommendedFocusDecks(entry, entry.sourceLabel),
        selectedKeys: entry.vocabForgeDraft.selectedKeys,
      },
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
    if (body.action === "rewriteUsages") {
      const entry = await rewriteEnglishImageLearningUsages(id, candidateKeys);
      return NextResponse.json({ entry, candidates: candidatePreviews(entry) });
    }
    const result = await exportEnglishImageVocabs(id, candidateKeys, vocabBook, {
      sourceName: typeof body.sourceName === "string" ? body.sourceName : "",
      focusDecks: Array.isArray(body.focusDecks) ? body.focusDecks : [vocabBook],
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = /請先|請至少|最多|候選/.test(message) ? 400 : /串接尚未完成/.test(message) ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

function candidatePreviews(entry: Parameters<typeof englishImageVocabCandidates>[0]) {
  return englishImageVocabCandidates(entry).map(candidate => ({ ...candidate, usageIssues: learningUsageIssues({ expression: candidate.expression, usage: candidate.usage.sentence, usageTranslation: candidate.usage.translation }) }));
}
