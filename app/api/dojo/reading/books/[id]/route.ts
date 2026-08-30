import { NextRequest, NextResponse } from "next/server";
import { updateReadingBook } from "@/lib/notion/mutations";
import { getReadingBook, listInsightCardsForBook, listReadingNotes } from "@/lib/notion/queries";
import { taipeiTodayISO } from "@/lib/dojo/formal";
import { isBookReason, isBookStatus, isReadingSubject } from "@/lib/reading/types";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, context: RouteContext<"/api/dojo/reading/books/[id]">) {
  try {
    const { id } = await context.params;
    const [book, notes, cards] = await Promise.all([
      getReadingBook(id),
      listReadingNotes(id),
      listInsightCardsForBook(id),
    ]);
    return NextResponse.json({ book, notes, cards });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, context: RouteContext<"/api/dojo/reading/books/[id]">) {
  try {
    const { id } = await context.params;
    const body = await req.json();
    const current = await getReadingBook(id);
    const status = isBookStatus(body.status) ? body.status : undefined;
    const question = typeof body.question === "string" ? body.question.trim() : undefined;
    const subject = isReadingSubject(body.subject) ? body.subject : undefined;
    const reason = isBookReason(body.reason) ? body.reason : undefined;
    const finalQuestion = question ?? current.question;
    if (status === "閱讀中" && !finalQuestion) {
      return NextResponse.json({ error: "開始閱讀前，請先寫下這次想找的問題" }, { status: 400 });
    }
    if (!status && question === undefined && subject === undefined && reason === undefined) {
      return NextResponse.json({ error: "沒有可更新的內容" }, { status: 400 });
    }
    await updateReadingBook(id, { status, question, subject, reason, todayISO: taipeiTodayISO() });
    return NextResponse.json({ ok: true, book: await getReadingBook(id) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
