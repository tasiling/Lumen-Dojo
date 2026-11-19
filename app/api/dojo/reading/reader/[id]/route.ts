import { NextRequest, NextResponse } from "next/server";
import { listReadingBooks, listReadingNotes } from "@/lib/notion/queries";
import { notion, withNotionRateLimit } from "@/lib/notion/client";
import { listBookDiscussions } from "@/lib/reading/discussionStore";
import { requireLearningOwner } from "@/lib/dojo/learningFoundation/access";

async function archive(id:string) {
  const lines:string[]=[];
  let cursor:string|undefined;
  do {
    const page=await withNotionRateLimit(()=>notion().blocks.children.list({block_id:id,start_cursor:cursor,page_size:100}));
    for(const block of page.results) {
      if (!("type" in block)) continue;
      const data=(block as unknown as Record<string,{rich_text?:{plain_text:string}[]}>)[block.type];
      const text=data.rich_text?.map(item=>item.plain_text).join("") || "";
      if (text === "原討論識別") return lines;
      if (text) lines.push(text);
    }
    cursor=page.next_cursor || undefined;
  } while(cursor);
  return lines;
}
export async function GET(request:NextRequest, context:RouteContext<"/api/dojo/reading/reader/[id]">) {
  requireLearningOwner(request);
  const {id}=await context.params;
  const books=await listReadingBooks();
  const book=books.find(b=>b.id.replaceAll("-","")===id.replaceAll("-",""));
  if(!book) return NextResponse.json({error:"找不到書籍"},{status:404});
  const children:{id:string;title:string}[]=[];
  const [notes,threads]=await Promise.all([listReadingNotes(book.id,children),listBookDiscussions(book.id).catch(()=>null)]);
  const archives=await Promise.all(children.map(async child=>({...child,lines:await archive(child.id)})));
  return NextResponse.json({book,notes,archives,discussions:threads?.discussions??[],discussionUnavailable:!threads},{headers:{"Cache-Control":"private, no-store"}});
}
