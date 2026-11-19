import { NextRequest, NextResponse } from "next/server";
import { listReadingBooks, listReadingNotes } from "@/lib/notion/queries";
import { bookArchives } from "@/lib/reading/archiveStore";
import { listBookDiscussions } from "@/lib/reading/discussionStore";
import { requireLearningOwner } from "@/lib/dojo/learningFoundation/access";

export async function GET(request:NextRequest, context:RouteContext<"/api/dojo/reading/reader/[id]">) {
  requireLearningOwner(request);
  const {id}=await context.params;
  const books=await listReadingBooks();
  const book=books.find(b=>b.id.replaceAll("-","")===id.replaceAll("-",""));
  if(!book) return NextResponse.json({error:"找不到書籍"},{status:404});
  const children:{id:string;title:string}[]=[];
  const notes=await listReadingNotes(book.id,children);
  const {archives,recovered}=await bookArchives(book.id,{book,notes,children});
  const threads=await listBookDiscussions(book.id,recovered).catch(()=>null);
  return NextResponse.json({book,notes,archives,discussions:threads?.discussions??recovered,discussionUnavailable:!threads},{headers:{"Cache-Control":"private, no-store"}});
}
