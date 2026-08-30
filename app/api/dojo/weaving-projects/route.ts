import { NextRequest, NextResponse } from "next/server";
import { WEAVING_PROJECT_TITLE_PREFIX, parseJson } from "@/lib/dojo/formal";
import {
  normalizeReadingWeavingProject,
  readingWeavingProjectContent,
  weavingProjectRecordTitle,
} from "@/lib/dojo/weavingProjects";
import { listJsonRecords, updateJsonRecordById } from "@/lib/dojo/notionStore";
import { createKnowledgeEntry } from "@/lib/notion/mutations";
import { getKnowledgeEntry, listInsightCards, listReadingBooks } from "@/lib/notion/queries";

export const dynamic = "force-dynamic";

async function resolvedProjects() {
  const [rows, cards, books] = await Promise.all([
    listJsonRecords(WEAVING_PROJECT_TITLE_PREFIX),
    listInsightCards(),
    listReadingBooks(),
  ]);
  const bookTitles = new Map(books.map((book) => [book.id, book.title]));
  const cardMap = new Map(cards.map((card) => [card.id, {
    ...card,
    sourceBookTitle: card.sourceBookId ? (bookTitles.get(card.sourceBookId) ?? "來源書籍") : "來源書籍",
  }]));
  return rows
    .map((row) => normalizeReadingWeavingProject(row.value, { id: row.id }))
    .filter((project): project is NonNullable<typeof project> => project !== null)
    .map((project) => ({
      ...project,
      cards: project.insightCardIds.flatMap((id) => {
        const card = cardMap.get(id);
        return card ? [card] : [];
      }),
    }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function GET() {
  try {
    return NextResponse.json({ projects: await resolvedProjects() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const rawCardIds: unknown[] = Array.isArray(body.insightCardIds) ? body.insightCardIds : [];
    const cardIds: string[] = [...new Set(rawCardIds.filter((id): id is string => typeof id === "string" && Boolean(id.trim())))];
    if (cardIds.length === 0) return NextResponse.json({ error: "請至少選一張成熟洞察" }, { status: 400 });
    if (cardIds.length > 8) return NextResponse.json({ error: "一次最多組合八張洞察" }, { status: 400 });

    const cards = await listInsightCards();
    const cardMap = new Map(cards.map((card) => [card.id, card]));
    const selected = cardIds.map((id) => cardMap.get(id));
    if (selected.some((card) => !card || (card.status !== "已驗證" && card.status !== "不成立"))) {
      return NextResponse.json({ error: "只能使用已驗證或不成立的洞察" }, { status: 409 });
    }

    const project = normalizeReadingWeavingProject({
      ...body,
      insightCardIds: cardIds,
      status: "ready",
      productionNote: "",
      outputUrl: "",
    }, { id: "pending", touch: true });
    if (!project) return NextResponse.json({ error: "請選擇成品形式" }, { status: 400 });
    if (!project.title || project.title === "未命名閱讀企劃") {
      project.title = selected[0]?.insight.slice(0, 60) || "閱讀洞察企劃";
    }
    const nonce = crypto.randomUUID();
    const created = await createKnowledgeEntry({
      標題: weavingProjectRecordTitle(nonce),
      內容: JSON.stringify(readingWeavingProjectContent(project)),
    });
    return NextResponse.json({ ok: true, id: created.id, projects: await resolvedProjects() }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    if (typeof body.id !== "string") return NextResponse.json({ error: "缺少企劃 id" }, { status: 400 });
    const row = await getKnowledgeEntry(body.id);
    if (!row.標題.startsWith(WEAVING_PROJECT_TITLE_PREFIX)) {
      return NextResponse.json({ error: "紀錄類型不符" }, { status: 400 });
    }
    const previous = normalizeReadingWeavingProject(parseJson(row.內容), { id: body.id });
    if (!previous) return NextResponse.json({ error: "既有閱讀企劃無法讀取" }, { status: 409 });
    const project = normalizeReadingWeavingProject({ ...previous, ...body.project, createdAt: previous.createdAt }, { id: body.id, touch: true });
    if (!project) return NextResponse.json({ error: "企劃內容不完整" }, { status: 400 });
    await updateJsonRecordById(body.id, WEAVING_PROJECT_TITLE_PREFIX, row.標題, readingWeavingProjectContent(project));
    return NextResponse.json({ ok: true, projects: await resolvedProjects() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
