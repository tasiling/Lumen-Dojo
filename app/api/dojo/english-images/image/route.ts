import { NextRequest, NextResponse } from "next/server";
import { englishImageUrl, getEnglishImageEntry } from "@/lib/dojo/englishImageStore";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id") ?? "";
    const { entry } = await getEnglishImageEntry(id);
    return NextResponse.redirect(await englishImageUrl(entry), { status: 307 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 404 });
  }
}
