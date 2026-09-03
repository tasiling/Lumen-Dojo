import { NextRequest, NextResponse } from "next/server";
import { appendReadingNote, archiveReadingNote, updateReadingNote } from "@/lib/notion/mutations";
import {
  isStructuredReadingNoteKind,
  parseStoredReadingNote,
  readingNoteMetadataFromUnknown,
  serializeStructuredReadingNote,
} from "@/lib/reading/notes";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, context: RouteContext<"/api/dojo/reading/books/[id]/notes">) {
  try {
    const { id } = await context.params;
    const body = await req.json();
    const text = typeof body.text === "string" ? body.text.trim() : "";
    const kind = isStructuredReadingNoteKind(body.kind) ? body.kind : "free";
    const metadata = readingNoteMetadataFromUnknown(body.metadata);
    const storedText = kind === "free"
      ? text
      : serializeStructuredReadingNote({ kind, text, metadata });
    const hasStructuredContent = kind === "preview"
      ? Boolean(metadata.currentUnderstanding || metadata.verificationFocus || text)
      : kind === "review"
        ? Boolean(metadata.changedUnderstanding || metadata.openQuestion || metadata.nextStep || text)
        : Boolean(text);
    if (kind === "free" ? !text : !hasStructuredContent) {
      return NextResponse.json({ error: "筆記還是空白的" }, { status: 400 });
    }
    if (kind === "excerpt" && !text) return NextResponse.json({ error: "請先貼上摘錄原文" }, { status: 400 });
    if (kind === "thought" && !text) return NextResponse.json({ error: "請先寫下想法" }, { status: 400 });
    const created = await appendReadingNote(id, storedText);
    const parsed = parseStoredReadingNote(storedText);
    return NextResponse.json({
      ok: true,
      note: { ...created, ...parsed, editable: true, createdAt: new Date().toISOString() },
    }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const noteId = typeof body.noteId === "string" ? body.noteId : "";
    const text = typeof body.text === "string" ? body.text : "";
    if (!noteId) return NextResponse.json({ error: "缺少筆記識別" }, { status: 400 });
    const kind = isStructuredReadingNoteKind(body.kind) ? body.kind : "free";
    const metadata = readingNoteMetadataFromUnknown(body.metadata);
    const storedText = kind === "free"
      ? text
      : serializeStructuredReadingNote({ kind, text, metadata });
    const hasStructuredContent = kind === "preview"
      ? Boolean(metadata.currentUnderstanding || metadata.verificationFocus || text.trim())
      : kind === "review"
        ? Boolean(metadata.changedUnderstanding || metadata.openQuestion || metadata.nextStep || text.trim())
        : Boolean(text.trim());
    if (kind === "free" ? !text.trim() : !hasStructuredContent) {
      return NextResponse.json({ error: "筆記還是空白的" }, { status: 400 });
    }
    await updateReadingNote(noteId, storedText);
    const parsed = parseStoredReadingNote(storedText);
    return NextResponse.json({
      ok: true,
      note: { id: noteId, ...parsed, editable: true, createdAt: "" },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const noteId = req.nextUrl.searchParams.get("noteId");
    if (!noteId) return NextResponse.json({ error: "缺少筆記識別" }, { status: 400 });
    await archiveReadingNote(noteId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
