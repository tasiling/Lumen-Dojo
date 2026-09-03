import { NextRequest, NextResponse } from "next/server";
import { createInsightCard } from "@/lib/notion/mutations";
import {
  getInsightCard,
  getReadingBook,
  listDueInsightCards,
  listInsightCards,
  listInsightCardsForBook,
  listReadingNotes,
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
    const sourceNoteId = typeof body.sourceNoteId === "string" ? body.sourceNoteId : "";
    if (!bookId) return NextResponse.json({ error: "缺少來源書籍" }, { status: 400 });
    if (!insight) return NextResponse.json({ error: "請先留下洞察" }, { status: 400 });
    if (!action) {
      return NextResponse.json({ error: "暫時寫不出行動，就先留在閱讀紀錄" }, { status: 400 });
    }
    await getReadingBook(bookId);
    const [bookNotes, existingCards] = await Promise.all([
      sourceNoteId ? listReadingNotes(bookId) : Promise.resolve([]),
      actionType === "執行型" ? listInsightCardsForBook(bookId) : Promise.resolve([]),
    ]);
    const sourceNote = sourceNoteId ? bookNotes.find((note) => note.id === sourceNoteId) : null;
    if (sourceNoteId && !sourceNote) {
      return NextResponse.json({ error: "找不到這則來源筆記，請重新整理後再試" }, { status: 400 });
    }
    if (actionType === "執行型" && existingCards.some((card) => card.actionType === "執行型" && card.status !== "放棄")) {
      return NextResponse.json({ error: "每輪閱讀最多保留一張執行型洞察；其他想法可以先設為觀察型" }, { status: 400 });
    }
    const todayISO = taipeiTodayISO();
    const created = await createInsightCard({
      bookId,
      insight,
      action,
      actionType,
      todayISO,
      nextVisitISO: addDaysISO(todayISO, actionType === "觀察型" ? 14 : 7),
      sourceNoteId: sourceNote?.id,
      sourceText: sourceNote ? [
        `類型：${sourceNote.kind === "excerpt" ? "摘錄" : sourceNote.kind === "thought" ? "我的想法" : "自由筆記"}`,
        sourceNote.metadata.source ? `來源：${sourceNote.metadata.source}` : "",
        sourceNote.metadata.chapter ? `章節：${sourceNote.metadata.chapter}` : "",
        sourceNote.metadata.location ? `位置：${sourceNote.metadata.location}` : "",
        sourceNote.text,
        sourceNote.metadata.reflection ? `我的當時想法：${sourceNote.metadata.reflection}` : "",
      ].filter(Boolean).join("\n") : undefined,
    });
    return NextResponse.json({ ok: true, card: await getInsightCard(created.id) }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
