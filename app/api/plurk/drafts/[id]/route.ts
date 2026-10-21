import { NextRequest, NextResponse } from "next/server";
import { updateKnowledgeEntry, archiveKnowledgeEntry } from "@/lib/notion/mutations";
import { getKnowledgeEntry } from "@/lib/notion/queries";
import { decodePlurkContent, encodePlurkContent, plurkDraftTitle } from "@/lib/plurk/notionFormat";
import { deriveTitle, type PlurkDraft } from "@/lib/plurk/logic";

// Notion 是唯一真相來源,寫入/刪除可能發生在 App 之外(擁有者直接在 Notion
// 操作),讀取一律即時查詢,不吃 Next.js 的 Route Handler 快取,避免顯示已經
// 在 Notion 端變動過的舊資料。
export const dynamic = "force-dynamic";
// 草稿正文整筆覆寫；系統來源 metadata 由既有紀錄保留，避免人工編輯蓋樓稿後
// 失去聊解室交接關係而重建副本。
// createdAt 由呼叫端原樣回傳(建立時的日期,標題後綴不隨內容編輯而變動),
// 標題的「顯示標題」部分則每次都用當下的主噗內容重新推導,讓 Notion 裡的標題
// 能反映最新內容,方便擁有者瀏覽。
export async function PATCH(req: NextRequest, ctx: RouteContext<"/api/plurk/drafts/[id]">) {
  const { id } = await ctx.params;
  const body = await req.json();
  const { method, tplName, main, floors, at, status, createdAt } = body as {
    method: string;
    tplName: string;
    main: string;
    floors: string[];
    at: string;
    status: PlurkDraft["status"];
    createdAt: string;
  };
  const existing = await getKnowledgeEntry(id);
  const existingMeta = decodePlurkContent(existing.內容 ?? "").meta;
  const displayTitle = deriveTitle({ main: main ?? "" });
  const content = encodePlurkContent(
    {
      method: method ?? "",
      tplName: tplName ?? "",
      at: at ?? "",
      status: status ?? "draft",
      createdAt,
      sourceVariantId: existingMeta.sourceVariantId,
      sourceVersionId: existingMeta.sourceVersionId,
      sourceOperationId: existingMeta.sourceOperationId,
    },
    main ?? "",
    floors ?? []
  );
  await updateKnowledgeEntry(id, { 標題: plurkDraftTitle(displayTitle, createdAt), 內容: content });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, ctx: RouteContext<"/api/plurk/drafts/[id]">) {
  const { id } = await ctx.params;
  await archiveKnowledgeEntry(id);
  return NextResponse.json({ ok: true });
}
