import { NextResponse } from "next/server";
import { markTraceMeasure } from "@/lib/notion/mutations";

// Notion 是唯一真相來源,讀取一律即時查詢,不吃 Route Handler 快取。
export const dynamic = "force-dynamic";

// 標記頻率/強度(補充裁決04「什麼算動靜」表):呼叫端是 lib/dojo/store.tsx
// 的測頻編輯流程；null 代表使用者明確清除該標記。
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const { 頻率, 強度 } = body as { 頻率?: number | null; 強度?: number | null };
  await markTraceMeasure(id, { 頻率, 強度 });
  return NextResponse.json({ ok: true });
}
