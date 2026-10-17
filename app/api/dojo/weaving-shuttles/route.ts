import { requireLearningOwner } from "@/lib/dojo/learningFoundation/access";
import { createPair, migrateLegacy, patchShuttle } from "@/lib/dojo/weavingWorkflow/store";
import { weavingRouteError } from "@/lib/dojo/weavingWorkflow/http";
import { NextRequest, NextResponse } from "next/server";
import { WEAVING_PROJECT_TITLE_PREFIX,WEAVING_SHUTTLE_TITLE_PREFIX,WEAVING_WORK_TITLE_PREFIX } from '@/lib/dojo/formal';
import { normalizeWeavingProject } from '@/lib/dojo/weavingProjects';
import { legacyBundle,normalizeWeavingShuttle,normalizeWeavingWork,type WeavingShuttle,type WeavingShuttleBundle,type WeavingWork } from '@/lib/dojo/weavingShuttle';
import { listJsonRecords } from '@/lib/dojo/notionStore';
import { listInsightCards,listReadingBooks } from '@/lib/notion/queries';

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

export async function GET(req: NextRequest) {
  try {
    requireLearningOwner(req);
    const rows = await bundles();
    const id = req.nextUrl.searchParams.get("id");
    if (id) {
      const bundle = rows.find((item) => item.shuttle.id === id);
      return bundle ? NextResponse.json({ bundle }) : NextResponse.json({ error: "找不到這張織光杼" }, { status: 404 });
    }
    return NextResponse.json({ bundles: rows });
  } catch (error) {
    return weavingRouteError(error);
  }
}

export async function POST(req: NextRequest) {
  try { requireLearningOwner(req); const body = await req.json(); const bundle = body.action === "migrate" ? await migrateLegacy(body) : await createPair(body); return NextResponse.json({ok:true,bundle},{status:201}); } catch(error) { return weavingRouteError(error); }
}
export async function PATCH(req: NextRequest) {
  try { requireLearningOwner(req); const shuttle=await patchShuttle(await req.json()); return NextResponse.json({ok:true,shuttle}); } catch(error) { return weavingRouteError(error); }
}
