import { NextResponse } from "next/server";
import { listCaptureEntries } from "@/lib/dojo/captureStore";
import { listEnglishImageEntries } from "@/lib/dojo/englishImageStore";
import { buildForageOverview } from "@/lib/dojo/forageOverview";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [englishEntries, captureEntries] = await Promise.all([listEnglishImageEntries(), listCaptureEntries()]);
    return NextResponse.json(buildForageOverview(englishEntries, captureEntries));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
