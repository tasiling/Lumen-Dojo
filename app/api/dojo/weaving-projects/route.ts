import { NextRequest, NextResponse } from "next/server";
import { CAPTURE_TITLE_PREFIX, WEAVING_PROJECT_TITLE_PREFIX, normalizeCaptureEntry, parseJson } from "@/lib/dojo/formal";
import { normalizeWeavingProject, weavingProjectContent, weavingProjectRecordTitle, type WeavingSourceRef } from "@/lib/dojo/weavingProjects";
import { archiveJsonRecordById, listJsonRecords, updateJsonRecordById } from "@/lib/dojo/notionStore";
import { createKnowledgeEntry } from "@/lib/notion/mutations";
import { getKnowledgeEntry, listInsightCards, listReadingBooks } from "@/lib/notion/queries";

export const dynamic = "force-dynamic";

async function projects() {
  const rows = await listJsonRecords(WEAVING_PROJECT_TITLE_PREFIX);
  const normalized = rows.map((row) => normalizeWeavingProject(row.value, { id: row.id }))
    .filter((project): project is NonNullable<typeof project> => project !== null)
    .filter((project) => project.status !== "archived");
  const legacyProjects = normalized.filter((project) => project.sourceSnapshot.startsWith("既有閱讀洞察企劃"));
  if (legacyProjects.length) {
    const [cards, books] = await Promise.all([listInsightCards(), listReadingBooks()]);
    const cardMap = new Map(cards.map((card) => [card.id, card]));
    const bookMap = new Map(books.map((book) => [book.id, book.title]));
    for (const project of legacyProjects) {
      const snapshots = project.sourceRefs.flatMap((ref, index) => {
        const card = ref.sourceType === "reading_insight" ? cardMap.get(ref.sourceId) : null;
        if (!card) return [];
        const book = card.sourceBookId ? bookMap.get(card.sourceBookId) : null;
        return [`${index + 1}. ${card.insight}\n行動化：${card.action || "未填"}${book ? `\n來源書籍：${book}` : ""}`];
      });
      if (snapshots.length) project.sourceSnapshot = snapshots.join("\n\n");
    }
  }
  return normalized.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

async function readingSource(ids: string[]) {
  const [cards, books] = await Promise.all([listInsightCards(), listReadingBooks()]);
  const cardMap = new Map(cards.map((card) => [card.id, card]));
  const bookMap = new Map(books.map((book) => [book.id, book.title]));
  const selected = ids.map((id) => cardMap.get(id));
  if (!ids.length || selected.some((card) => !card || (card.status !== "已驗證" && card.status !== "不成立"))) {
    throw new Error("只能使用已驗證或不成立的閱讀洞察");
  }
  return {
    sourceType: "reading_insights",
    sourceId: ids[0],
    sourceRefs: ids.map((sourceId) => ({ sourceType: "reading_insight", sourceId })),
    sourceSnapshot: selected.map((card, index) => {
      if (!card) return "";
      const book = card.sourceBookId ? bookMap.get(card.sourceBookId) : null;
      return `${index + 1}. ${card.insight}\n行動化：${card.action || "未填"}${book ? `\n來源書籍：${book}` : ""}`;
    }).filter(Boolean).join("\n\n"),
    fallbackTitle: selected[0]?.insight.slice(0, 80) || "閱讀洞察企劃",
  };
}

async function captureSource(id: string) {
  const row = await getKnowledgeEntry(id);
  if (!row.標題.startsWith(CAPTURE_TITLE_PREFIX)) throw new Error("素材類型不符");
  const capture = normalizeCaptureEntry(parseJson(row.內容), { id });
  if (!capture || capture.status !== "adopted" || !capture.destinations.includes("weaving") || (capture.creativeMaturity !== "C2" && capture.creativeMaturity !== "C3")) {
    throw new Error("這份素材尚未達 C2，或尚未採用並送往織光堂");
  }
  const snapshot = [capture.forageSummary || capture.excerpt, capture.note && `擷取時的想法：${capture.note}`, capture.sourceUrl && `來源：${capture.sourceUrl}`, capture.sourceLocator && `定位：${capture.sourceLocator}`]
    .filter(Boolean).join("\n\n");
  return {
    sourceType: "forage_capture",
    sourceId: id,
    sourceRefs: [{ sourceType: "forage_capture", sourceId: id }],
    sourceSnapshot: snapshot,
    fallbackTitle: capture.weaving.projectTitle || capture.title,
    legacyDraft: capture.weaving.productionNote,
    legacyOutputUrl: capture.weaving.outputUrl,
  };
}

export async function GET(req: NextRequest) {
  try {
    const rows = await projects();
    const id = req.nextUrl.searchParams.get("id");
    if (id) {
      const project = rows.find((item) => item.id === id);
      return project ? NextResponse.json({ project }) : NextResponse.json({ error: "找不到這張織光案" }, { status: 404 });
    }
    return NextResponse.json({ projects: rows });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const legacyIds = Array.isArray(body.insightCardIds) ? body.insightCardIds.filter((id: unknown): id is string => typeof id === "string") : [];
    const requestedRefs: WeavingSourceRef[] = Array.isArray(body.sourceRefs) ? body.sourceRefs : [];
    const readingIds = legacyIds.length ? legacyIds : requestedRefs.filter((ref) => ref?.sourceType === "reading_insight").map((ref) => ref.sourceId);
    const requestedSourceType = typeof body.sourceType === "string" ? body.sourceType : (readingIds.length ? "reading_insights" : "manual");

    let source = {
      sourceType: requestedSourceType,
      sourceId: typeof body.sourceId === "string" ? body.sourceId : null,
      sourceRefs: requestedRefs,
      sourceSnapshot: typeof body.sourceSnapshot === "string" ? body.sourceSnapshot : "",
      fallbackTitle: "手動題材",
      legacyDraft: "",
      legacyOutputUrl: "",
    };
    if (requestedSourceType === "reading_insights") source = { ...source, ...await readingSource(readingIds) };
    if (requestedSourceType === "forage_capture") {
      if (!source.sourceId) return NextResponse.json({ error: "缺少來源素材" }, { status: 400 });
      source = { ...source, ...await captureSource(source.sourceId) };
    }

    const coreStatement = typeof body.coreStatement === "string" ? body.coreStatement.trim() : "";
    if (!coreStatement) return NextResponse.json({ error: "請先寫下這次最想說的一句話" }, { status: 400 });
    const project = normalizeWeavingProject({
      version: 2, recordType: "weaving-project", title: body.title || source.fallbackTitle || coreStatement.slice(0, 80),
      sourceType: source.sourceType, sourceId: source.sourceId, sourceRefs: source.sourceRefs,
      sourceSnapshot: source.sourceSnapshot, coreStatement, audience: "", format: body.format || "text",
      formatSubtype: body.formatSubtype || "unselected", status: "selecting",
      nextAction: body.format === "comic" ? "等待漫畫工作台第二階段開放" : body.format === "video" ? "等待影片工作台第三階段開放" : "選擇本次文字形式",
      draftText: source.legacyDraft, outputUrl: source.legacyOutputUrl, toolKey: null, sentToLiaojieAt: null,
    }, { id: "pending", touch: true });
    if (!project) return NextResponse.json({ error: "織光案內容不完整" }, { status: 400 });
    const created = await createKnowledgeEntry({ 標題: weavingProjectRecordTitle(crypto.randomUUID()), 內容: JSON.stringify(weavingProjectContent(project)) });
    project.id = created.id;
    return NextResponse.json({ ok: true, project }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: /只能使用|尚未完成|缺少|類型不符/.test(message) ? 409 : 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    if (typeof body.id !== "string") return NextResponse.json({ error: "缺少織光案 id" }, { status: 400 });
    const row = await getKnowledgeEntry(body.id);
    if (!row.標題.startsWith(WEAVING_PROJECT_TITLE_PREFIX)) return NextResponse.json({ error: "紀錄類型不符" }, { status: 400 });
    const previous = normalizeWeavingProject(parseJson(row.內容), { id: body.id });
    if (!previous) return NextResponse.json({ error: "既有織光案無法讀取" }, { status: 409 });
    const project = normalizeWeavingProject({ ...previous, ...body.project, sourceType: previous.sourceType, sourceId: previous.sourceId, sourceRefs: previous.sourceRefs, sourceSnapshot: previous.sourceSnapshot, createdAt: previous.createdAt }, { id: body.id, touch: true });
    if (!project) return NextResponse.json({ error: "織光案內容不完整" }, { status: 400 });
    await updateJsonRecordById(body.id, WEAVING_PROJECT_TITLE_PREFIX, row.標題, weavingProjectContent(project));
    return NextResponse.json({ ok: true, project });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "缺少織光案 id" }, { status: 400 });
    await archiveJsonRecordById(id, WEAVING_PROJECT_TITLE_PREFIX);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
