import { NextRequest, NextResponse } from "next/server";
import { createReadingBook, rereadBook } from "@/lib/notion/mutations";
import { getReadingBook, listReadingBooks, listReadingNotes } from "@/lib/notion/queries";
import { taipeiTodayISO } from "@/lib/dojo/formal";
import { isBookReason, isReadingSubject } from "@/lib/reading/types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const books = await listReadingBooks();
    if (request?.nextUrl.searchParams.get("focus") !== "anxiety-effort") return NextResponse.json({ books });
    const matches = books.filter(book => book.readCount === 1 && /Magic\s*Shop|你的心.{0,4}是最強大的魔法/i.test(book.title));
    let selection: { bookId: string; noteId: string } | null = null;
    if (matches.length === 1) {
      const notes = (await listReadingNotes(matches[0].id)).filter(note => note.kind === "excerpt"
        && note.text.includes("焦慮") && note.metadata.reflection?.includes("努力"));
      if (notes.length === 1) selection = { bookId: matches[0].id, noteId: notes[0].id };
    }
    return NextResponse.json({ books, selection });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const mode = body.mode === "wait" || body.mode === "reread" ? body.mode : "start";
    const todayISO = taipeiTodayISO();

    if (mode === "reread") {
      const sourceBookId = typeof body.sourceBookId === "string" ? body.sourceBookId : "";
      const question = typeof body.question === "string" ? body.question.trim() : "";
      const reason = isBookReason(body.reason) ? body.reason : null;
      if (!sourceBookId) return NextResponse.json({ error: "缺少原本的閱讀紀錄" }, { status: 400 });
      if (!question) return NextResponse.json({ error: "重讀前，請先寫下這次想找的問題" }, { status: 400 });
      const created = await rereadBook({ sourceBookId, question, reason, todayISO });
      return NextResponse.json({ ok: true, book: await getReadingBook(created.id) }, { status: 201 });
    }

    const title = typeof body.title === "string" ? body.title.trim() : "";
    const author = typeof body.author === "string" ? body.author.trim() : "";
    const question = typeof body.question === "string" ? body.question.trim() : "";
    const subject = isReadingSubject(body.subject) ? body.subject : null;
    const reason = isBookReason(body.reason) ? body.reason : null;
    if (!title) return NextResponse.json({ error: "請先填寫書名" }, { status: 400 });
    if (mode === "start" && !question) {
      return NextResponse.json({ error: "讀前先問：我想從這本書找到什麼" }, { status: 400 });
    }

    const created = await createReadingBook({
      title,
      author,
      subtitle: typeof body.subtitle === "string" ? body.subtitle.trim() : undefined,
      category: typeof body.category === "string" ? body.category.trim() : undefined,
      subject,
      reason,
      question,
      status: mode === "start" ? "閱讀中" : "待讀",
      todayISO,
    });
    return NextResponse.json({ ok: true, book: await getReadingBook(created.id) }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
