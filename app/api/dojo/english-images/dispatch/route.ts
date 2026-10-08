import { NextRequest, NextResponse } from "next/server";
import { englishImageContextCandidates, englishImageVocabCandidates, exportEnglishImageContext, exportEnglishImageVocabs, normalizeSourceName } from "@/lib/dojo/englishImageDispatch";
import { getEnglishImageEntry, updateEnglishImageEntry } from "@/lib/dojo/englishImageStore";
import { dispatchSelectedDestinations, normalizeRoutingSelection } from "@/lib/dojo/englishImageRouting";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const id = typeof body.id === "string" ? body.id.trim() : "";
    if (!id) return NextResponse.json({ error: "缺少英文影像 ID" }, { status: 400 });
    if (!body.context && !body.vocab) return NextResponse.json({ error: "請選擇派送目的地" }, { status: 400 });
    const { entry } = await getEnglishImageEntry(id);
    if (entry.route === "pending" || (!entry.ocrText.trim() && !entry.englishRecord.trim())) throw new Error("請先完成分類與分析或補上英文原文");
    const sourceName = normalizeSourceName(typeof body.sourceName === "string" ? body.sourceName : "");
    if (!sourceName) throw new Error("請確認作品或生活情境來源");
    const selection = body.vocab ? normalizeRoutingSelection({ ...body.vocab, sourceName }) : null;
    const vocabCandidates = englishImageVocabCandidates(entry);
    if (selection && selection.selectedKeys.some(key => !vocabCandidates.some(candidate => candidate.key === key))) throw new Error("候選單字已變更，請重新確認");
    if (selection && new Set([...entry.vocabForgeExports.map(item => item.key), ...selection.selectedKeys]).size > 5) throw new Error("每筆素材最多送出五個單字");
    const context = body.context ? {
      id,
      contractMode: "v2" as const,
      projectMode: body.context.projectMode === "existing" ? "existing" as const : "create" as const,
      materialId: typeof body.context.materialId === "string" ? body.context.materialId : "",
      materialTitle: typeof body.context.materialTitle === "string" ? body.context.materialTitle.trim().slice(0, 300) : "",
      unitMode: body.context.unitMode === "existing" ? "existing" as const : "create" as const,
      unitId: typeof body.context.unitId === "string" ? body.context.unitId : "",
      eventTitle: typeof body.context.eventTitle === "string" ? body.context.eventTitle.trim().slice(0, 300) : "",
      projectType: typeof body.context.projectType === "string" ? body.context.projectType : "",
      crossTypeConfirmed: body.context.crossTypeConfirmed === true,
      candidateKeys: Array.isArray(body.context.candidateKeys) ? [...new Set(body.context.candidateKeys.filter((key: unknown): key is string => typeof key === "string"))] as string[] : [],
    } : null;
    if (context) {
      if (body.context.contractMode !== "v2") throw new Error("語境修習室尚未確認新版圖片交接，請稍後重試");
      if (!context.materialTitle || !context.eventTitle || (context.projectMode === "existing" && !context.materialId) || (context.unitMode === "existing" && !context.unitId)) throw new Error("請確認學習專案與單元");
      if (context.projectMode === "create" && context.unitMode === "existing") throw new Error("新專案不能使用另一個專案的既有單元");
      if (context.candidateKeys.length > 5 || context.candidateKeys.some(key => !englishImageContextCandidates(entry).some(candidate => candidate.key === key))) throw new Error("表達候選已變更，請重新確認");
    }
    // Persist the same source/selection LINE uses before any external dispatch.
    await updateEnglishImageEntry(id, () => ({
      sourceLabel: sourceName,
      ...(context ? { contextRoomDispatchDraft: context } : {}),
      vocabForgeDraft: selection || { ...entry.vocabForgeDraft, sourceName },
    }));
    const results = await dispatchSelectedDestinations({
      ...(context ? { context: () => exportEnglishImageContext(context) } : {}),
      ...(selection ? { vocab: () => exportEnglishImageVocabs(id, selection.selectedKeys, selection.focusDecks[0], selection) } : {}),
    });
    const { entry: updated } = await getEnglishImageEntry(id);
    return NextResponse.json({ entry: updated, results });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
