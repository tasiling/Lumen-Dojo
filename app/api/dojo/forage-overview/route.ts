import { NextResponse } from "next/server";
import { listCaptureEntries } from "@/lib/dojo/captureStore";
import { listEnglishImageEntries } from "@/lib/dojo/englishImageStore";
import { buildForageOverview } from "@/lib/dojo/forageOverview";

export const dynamic = "force-dynamic";

import { CAPTURE_CLIP_PURPOSES } from "@/lib/dojo/formal";
import { captureOriginal } from "@/lib/dojo/refineRecord";

/** The source's own words, cut short, for a card that has no picture to show. */
function lede(text: string): string {
  const one = text.replace(/\s+/g, " ").trim();
  return one.length > 90 ? one.slice(0, 88) + "…" : one;
}

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
        return { ...item, topic: "英文學習", purpose: "學習資料", original: image?.englishRecord || "", note: image?.contextNote || "",
          // The first original picture is the card's cover in 回看所拾.
          cover: image?.attachments.length ? `/api/dojo/english-images/image?id=${encodeURIComponent(item.id)}&index=0` : "",
          images: image?.attachments.length ?? 0, platform: "", lede: "", form: "圖片" };
      }
      const entry = captures.get(item.id)!;
      const own = captureOriginal(entry);
      const first = entry.clip.attachments[0];
      return { ...item, topic: item.sourceLabel, purpose: CAPTURE_CLIP_PURPOSES[entry.clip.purpose],
        original: entry.excerpt, note: entry.forageReason || entry.note, c: entry.creativeMaturity, k: entry.sourceKnowledgeMaturity,
        cover: first ? `/api/dojo/captures/${encodeURIComponent(entry.id)}/images/${encodeURIComponent(first.blockId)}` : "",
        images: entry.clip.attachments.length, platform: entry.clip.platform || "",
        lede: lede(own.text || entry.excerpt), form: entry.clip.transcript ? "影片" : entry.clip.threadsPost ? "貼文" : first ? "圖片" : "文字" };
    });
    return NextResponse.json({ ...overview, recent }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
