import { NextRequest, NextResponse } from "next/server";
import {
  CAPTURE_TITLE_PREFIX,
  WEAVING_PROJECT_TITLE_PREFIX,
  WEAVING_SHUTTLE_TITLE_PREFIX,
  WEAVING_WORK_TITLE_PREFIX,
  normalizeCaptureEntry,
  parseJson,
} from "@/lib/dojo/formal";
import { normalizeWeavingProject, type WeavingSourceRef } from "@/lib/dojo/weavingProjects";
import {
  createShuttleDraft,
  createWorkDraft,
  currentCore,
  legacyBundle,
  normalizeWeavingShuttle,
  normalizeWeavingWork,
  shuttleContent,
  shuttleRecordTitle,
  workContent,
  workRecordTitle,
  type WeavingShuttle,
  type WeavingShuttleBundle,
  type WeavingWork,
} from "@/lib/dojo/weavingShuttle";
import { archiveJsonRecordById, listJsonRecords, updateJsonRecordById } from "@/lib/dojo/notionStore";
import { archiveKnowledgeEntry, createKnowledgeEntry } from "@/lib/notion/mutations";
import { getKnowledgeEntry, listInsightCards, listReadingBooks } from "@/lib/notion/queries";

export const dynamic = "force-dynamic";

async function newBundles(): Promise<WeavingShuttleBundle[]> {
  const [shuttleRows, workRows] = await Promise.all([
    listJsonRecords(WEAVING_SHUTTLE_TITLE_PREFIX),
    listJsonRecords(WEAVING_WORK_TITLE_PREFIX),
  ]);
  const shuttles = shuttleRows.map((row) => normalizeWeavingShuttle(row.value, { id: row.id }))
    .filter((row): row is WeavingShuttle => row !== null && row.status !== "archived");
  const works = workRows.map((row) => normalizeWeavingWork(row.value, { id: row.id }))
    .filter((row): row is WeavingWork => row !== null && row.status !== "archived");
  return shuttles.map((shuttle) => ({
    shuttle,
    works: works.filter((work) => work.shuttleId === shuttle.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    legacyProjectId: null,
  }));
}

async function legacyBundles(): Promise<WeavingShuttleBundle[]> {
  const rows = await listJsonRecords(WEAVING_PROJECT_TITLE_PREFIX);
  const projects = rows.map((row) => normalizeWeavingProject(row.value, { id: row.id }))
    .filter((project): project is NonNullable<typeof project> => project !== null && project.status !== "archived");
  const bundles = projects.map(legacyBundle);
  const readingBundles = bundles.filter((bundle) => bundle.shuttle.sourceType === "reading_insights");
  if (readingBundles.length) {
    const [cards, books] = await Promise.all([listInsightCards(), listReadingBooks()]);
    const cardMap = new Map(cards.map((card) => [card.id, card]));
    const bookMap = new Map(books.map((book) => [book.id, book.title]));
    for (const bundle of readingBundles) {
      const snapshots = bundle.shuttle.sourceRefs.flatMap((ref, index) => {
        const card = ref.sourceType === "reading_insight" ? cardMap.get(ref.sourceId) : null;
        if (!card) return [];
        const book = card.sourceBookId ? bookMap.get(card.sourceBookId) : null;
        return [`${index + 1}. ${card.insight}\n行動化：${card.action || "未填"}${book ? `\n來源書籍：${book}` : ""}`];
      });
      if (snapshots.length) bundle.shuttle.sourceSnapshot = snapshots.join("\n\n");
    }
  }
  return bundles;
}

async function bundles(): Promise<WeavingShuttleBundle[]> {
  const [current, legacy] = await Promise.all([newBundles(), legacyBundles()]);
  return [...current, ...legacy].sort((a, b) => b.shuttle.updatedAt.localeCompare(a.shuttle.updatedAt));
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
    sourceType: "reading_insights", sourceId: ids[0],
    sourceRefs: ids.map((sourceId) => ({ sourceType: "reading_insight", sourceId })),
    sourceSnapshot: selected.map((card, index) => {
      if (!card) return "";
      const book = card.sourceBookId ? bookMap.get(card.sourceBookId) : null;
      return `${index + 1}. ${card.insight}\n行動化：${card.action || "未填"}${book ? `\n來源書籍：${book}` : ""}`;
    }).filter(Boolean).join("\n\n"),
    fallbackTitle: selected[0]?.insight.slice(0, 80) || "閱讀洞察",
    legacyDraft: "", legacyOutputUrl: "",
  };
}

async function captureSource(id: string) {
  const row = await getKnowledgeEntry(id);
  if (!row.標題.startsWith(CAPTURE_TITLE_PREFIX)) throw new Error("素材類型不符");
  const capture = normalizeCaptureEntry(parseJson(row.內容), { id });
  if (!capture || capture.status !== "adopted" || !capture.destinations.includes("weaving") || (capture.creativeMaturity !== "C2" && capture.creativeMaturity !== "C3")) {
    throw new Error("這份素材尚未達 C2，或尚未採用並送往織光堂");
  }
  return {
    sourceType: "forage_capture", sourceId: id,
    sourceRefs: [{ sourceType: "forage_capture", sourceId: id }],
    sourceSnapshot: [capture.forageSummary || capture.excerpt, capture.note && `擷取時的想法：${capture.note}`, capture.sourceUrl && `來源：${capture.sourceUrl}`, capture.sourceLocator && `定位：${capture.sourceLocator}`].filter(Boolean).join("\n\n"),
    fallbackTitle: capture.weaving.projectTitle || capture.title,
    legacyDraft: capture.weaving.productionNote, legacyOutputUrl: capture.weaving.outputUrl,
  };
}

async function createPair(input: {
  title: string; sourceType: string; sourceId?: string | null; sourceRefs?: WeavingSourceRef[]; sourceSnapshot: string;
  coreStatement: string; audience?: string; direction?: string; format: "text" | "comic" | "video";
  workTitle?: string; formatSubtype?: string; draftText?: string; outputUrl?: string;
  branchedFromShuttleId?: string | null; branchedFromWorkId?: string | null;
}) {
  const shuttle = createShuttleDraft(input);
  const createdShuttle = await createKnowledgeEntry({ 標題: shuttleRecordTitle(crypto.randomUUID()), 內容: JSON.stringify(shuttleContent(shuttle)) });
  shuttle.id = createdShuttle.id;
  try {
    const work = createWorkDraft({
      shuttleId: shuttle.id, title: input.workTitle || input.title, coreVersionId: currentCore(shuttle).id,
      format: input.format, formatSubtype: input.formatSubtype, draftText: input.draftText, outputUrl: input.outputUrl,
    });
    const createdWork = await createKnowledgeEntry({ 標題: workRecordTitle(crypto.randomUUID()), 內容: JSON.stringify(workContent(work)) });
    work.id = createdWork.id;
    return { shuttle, work };
  } catch (error) {
    await archiveKnowledgeEntry(shuttle.id).catch(() => undefined);
    throw error;
  }
}

export async function GET(req: NextRequest) {
  try {
    const rows = await bundles();
    const id = req.nextUrl.searchParams.get("id");
    if (id) {
      const bundle = rows.find((item) => item.shuttle.id === id);
      return bundle ? NextResponse.json({ bundle }) : NextResponse.json({ error: "找不到這張織光杼" }, { status: 404 });
    }
    return NextResponse.json({ bundles: rows });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (body.action === "migrate") {
      const legacyId = typeof body.legacyProjectId === "string" ? body.legacyProjectId : "";
      if (!legacyId) return NextResponse.json({ error: "缺少舊版織光案 id" }, { status: 400 });
      const row = await getKnowledgeEntry(legacyId);
      if (!row.標題.startsWith(WEAVING_PROJECT_TITLE_PREFIX)) return NextResponse.json({ error: "來源不是舊版織光案" }, { status: 400 });
      const legacy = normalizeWeavingProject(parseJson(row.內容), { id: legacyId });
      if (!legacy) return NextResponse.json({ error: "舊版織光案無法讀取" }, { status: 409 });
      const result = await createPair({
        title: legacy.title, sourceType: legacy.sourceType, sourceId: legacy.sourceId, sourceRefs: legacy.sourceRefs,
        sourceSnapshot: legacy.sourceSnapshot, coreStatement: legacy.coreStatement, audience: legacy.audience,
        format: legacy.format, formatSubtype: legacy.formatSubtype, workTitle: legacy.title,
        draftText: legacy.draftText, outputUrl: legacy.outputUrl,
      });
      await archiveJsonRecordById(legacyId, WEAVING_PROJECT_TITLE_PREFIX);
      return NextResponse.json({ ok: true, bundle: { shuttle: result.shuttle, works: [result.work], legacyProjectId: null } }, { status: 201 });
    }

    const legacyIds = Array.isArray(body.insightCardIds) ? body.insightCardIds.filter((id: unknown): id is string => typeof id === "string") : [];
    const requestedRefs: WeavingSourceRef[] = Array.isArray(body.sourceRefs) ? body.sourceRefs : [];
    const readingIds = legacyIds.length ? legacyIds : requestedRefs.filter((ref) => ref?.sourceType === "reading_insight").map((ref) => ref.sourceId);
    const requestedSourceType = typeof body.sourceType === "string" ? body.sourceType : (readingIds.length ? "reading_insights" : "manual");
    let source = {
      sourceType: requestedSourceType, sourceId: typeof body.sourceId === "string" ? body.sourceId : null,
      sourceRefs: requestedRefs, sourceSnapshot: typeof body.sourceSnapshot === "string" ? body.sourceSnapshot : "",
      fallbackTitle: "手動題材", legacyDraft: "", legacyOutputUrl: "",
    };
    if (requestedSourceType === "reading_insights") source = { ...source, ...await readingSource(readingIds) };
    if (requestedSourceType === "forage_capture") {
      if (!source.sourceId) return NextResponse.json({ error: "缺少來源素材" }, { status: 400 });
      source = { ...source, ...await captureSource(source.sourceId) };
    }
    const coreStatement = typeof body.coreStatement === "string" ? body.coreStatement.trim() : "";
    if (!coreStatement) return NextResponse.json({ error: "請先寫下這次最想說的一句話" }, { status: 400 });
    const format = body.format === "comic" || body.format === "video" ? body.format : "text";
    const title = String(body.title || source.fallbackTitle || coreStatement.slice(0, 80)).trim();
    const result = await createPair({
      title, sourceType: source.sourceType, sourceId: source.sourceId, sourceRefs: source.sourceRefs,
      sourceSnapshot: source.sourceSnapshot, coreStatement, format, workTitle: title,
      draftText: source.legacyDraft, outputUrl: source.legacyOutputUrl,
    });
    return NextResponse.json({ ok: true, bundle: { shuttle: result.shuttle, works: [result.work], legacyProjectId: null } }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: /只能使用|尚未完成|缺少|類型不符/.test(message) ? 409 : 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    if (typeof body.id !== "string") return NextResponse.json({ error: "缺少織光杼 id" }, { status: 400 });
    const row = await getKnowledgeEntry(body.id);
    if (!row.標題.startsWith(WEAVING_SHUTTLE_TITLE_PREFIX)) return NextResponse.json({ error: "紀錄類型不符" }, { status: 400 });
    const previous = normalizeWeavingShuttle(parseJson(row.內容), { id: body.id });
    if (!previous) return NextResponse.json({ error: "既有織光杼無法讀取" }, { status: 409 });
    const shuttle = normalizeWeavingShuttle({
      ...previous, ...body.shuttle, sourceType: previous.sourceType, sourceId: previous.sourceId,
      sourceRefs: previous.sourceRefs, sourceSnapshot: previous.sourceSnapshot,
      coreVersions: previous.coreVersions, currentCoreVersionId: previous.currentCoreVersionId,
      branchedFromShuttleId: previous.branchedFromShuttleId, branchedFromWorkId: previous.branchedFromWorkId,
      createdAt: previous.createdAt,
    }, { id: body.id, touch: true });
    if (!shuttle) return NextResponse.json({ error: "織光杼內容不完整" }, { status: 400 });
    await updateJsonRecordById(body.id, WEAVING_SHUTTLE_TITLE_PREFIX, row.標題, shuttleContent(shuttle));
    return NextResponse.json({ ok: true, shuttle });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
