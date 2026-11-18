import { NextResponse } from "next/server";
import { listCaptureEntries } from "@/lib/dojo/captureStore";
import { listEnglishImageEntries } from "@/lib/dojo/englishImageStore";
import { buildForageOverview } from "@/lib/dojo/forageOverview";

export const dynamic = "force-dynamic";

import { CAPTURE_CLIP_PURPOSES } from "@/lib/dojo/formal";

export async function GET(request: Request) {
  try {
    const [englishEntries, captureEntries] = await Promise.all([listEnglishImageEntries(), listCaptureEntries()]);
    const browse = new URL(request.url).searchParams.get("view") === "collection";
    const overview = buildForageOverview(englishEntries, captureEntries, browse ? englishEntries.length + captureEntries.length : 3);
    if (!browse) return NextResponse.json(overview);
    const captures = new Map(captureEntries.map(entry => [entry.id, entry]));
    const images = new Map(englishEntries.map(entry => [entry.id, entry]));
    const recent = overview.recent.map(item => {
      if (item.kind === "english") {
        const image = images.get(item.id);
        return { ...item, topic: "英文學習", purpose: "學習資料", original: image?.englishRecord || "", note: image?.contextNote || "" };
      }
      const entry = captures.get(item.id)!;
      return { ...item, topic: item.sourceLabel, purpose: CAPTURE_CLIP_PURPOSES[entry.clip.purpose],
        original: entry.excerpt, note: entry.forageReason || entry.note, c: entry.creativeMaturity, k: entry.sourceKnowledgeMaturity };
    });
    return NextResponse.json({ ...overview, recent }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
