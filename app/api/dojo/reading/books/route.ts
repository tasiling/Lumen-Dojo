import { NextRequest, NextResponse } from "next/server";
import { createReadingBook, rereadBook } from "@/lib/notion/mutations";
import { getReadingBook, listReadingBooks } from "@/lib/notion/queries";
import { taipeiTodayISO } from "@/lib/dojo/formal";
import { isBookReason, isReadingSubject } from "@/lib/reading/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ books: await listReadingBooks() });
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
