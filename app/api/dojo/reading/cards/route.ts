import { NextRequest, NextResponse } from "next/server";
import { createInsightCard } from "@/lib/notion/mutations";
import {
  getInsightCard,
  getReadingBook,
  listDueInsightCards,
  listInsightCards,
  listReadingBooks,
} from "@/lib/notion/queries";
import { taipeiTodayISO } from "@/lib/dojo/formal";
import { addDaysISO, isInsightActionType } from "@/lib/reading/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const view = req.nextUrl.searchParams.get("view");
    const todayISO = taipeiTodayISO();
    const cards = view === "due" ? await listDueInsightCards(todayISO) : await listInsightCards();
    if (req.nextUrl.searchParams.get("countOnly") === "true") {
      return NextResponse.json({ count: cards.length });
    }
    const books = await listReadingBooks();
    const bookTitles = new Map(books.map((book) => [book.id, book.title]));
    return NextResponse.json({
      cards: cards.map((card) => ({
        ...card,
        sourceBookTitle: card.sourceBookId ? (bookTitles.get(card.sourceBookId) ?? "來源書籍") : "來源書籍",
      })),
      todayISO,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const bookId = typeof body.bookId === "string" ? body.bookId : "";
    const insight = typeof body.insight === "string" ? body.insight.trim() : "";
    const action = typeof body.action === "string" ? body.action.trim() : "";
    const actionType = isInsightActionType(body.actionType) ? body.actionType : "觀察型";
    if (!bookId) return NextResponse.json({ error: "缺少來源書籍" }, { status: 400 });
    if (!insight) return NextResponse.json({ error: "請先留下洞察" }, { status: 400 });
    if (!action) {
      return NextResponse.json({ error: "寫不出行動的洞察，先留在筆記層就好" }, { status: 400 });
    }
    await getReadingBook(bookId);
    const todayISO = taipeiTodayISO();
    const created = await createInsightCard({
      bookId,
      insight,
      action,
      actionType,
      todayISO,
      nextVisitISO: addDaysISO(todayISO, actionType === "觀察型" ? 14 : 7),
    });
    return NextResponse.json({ ok: true, card: await getInsightCard(created.id) }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
