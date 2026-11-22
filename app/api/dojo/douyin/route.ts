import { type NextRequest } from "next/server";
import { requireLearningOwner } from "@/lib/dojo/learningFoundation/access";
import { captureIdPattern, douyinError, douyinJson, douyinJsonBody } from "@/lib/dojo/douyin/http";
import { douyinQueue } from "@/lib/dojo/douyin/queue.mjs";
import { InputError, sourceUrl } from "@/lib/dojo/douyin/share.mjs";
import { fileSourceLabel } from "@/lib/dojo/douyin/fileOffer";
import { kickTranscriptSync, syncPendingTranscripts } from "@/lib/dojo/douyin/transcriptSync";
import { douyinInstallFile } from "@/lib/dojo/douyinInstall";
import { getCaptureEntry } from "@/lib/dojo/captureStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function view(captureId?: string) {
  const queue = douyinQueue();
  return douyinJson({ connection: queue.connection(), mac: queue.mac(), offers: queue.offers(), unsynced: queue.unsynced(), job: captureId ? queue.view(captureId) : null });
}

export async function GET(req: NextRequest) {
  try {
    requireLearningOwner(req);
    const id = req.nextUrl.searchParams.get("captureId");
    if (id && !captureIdPattern.test(id)) throw new InputError("素材編號格式不符。");
    kickTranscriptSync();
    return view(id ?? undefined);
  } catch (error) {
    return douyinError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    requireLearningOwner(req);
    const { action, captureId, file } = await douyinJsonBody(req);
    const queue = douyinQueue();
    if (action === "install") {
      // The authenticated browser's origin was validated against Host and TLS by requireLearningOwner.
      const origin = req.headers.get("origin") || "https://lumen-dojo.up.railway.app";
      if (!origin.startsWith("https://")) throw new InputError("請從行光道場的 HTTPS 網址下載。", 403);
      const file = douyinInstallFile(origin, queue.issue());
      return new Response(file, {
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Disposition": 'attachment; filename="YeCai-Connect-Mac-Production.command"',
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
    if (action === "syncTranscripts") {
      // Writes transcripts Notion does not hold yet, including those finished before write-back existed.
      const result = await syncPendingTranscripts({ limit: 20, force: true });
      return douyinJson({ ...result, connection: queue.connection(), mac: queue.mac(), offers: queue.offers(), unsynced: result.remaining,
        job: typeof captureId === "string" && captureIdPattern.test(captureId) ? queue.view(captureId) : null });
    }
    if ((action !== "retry" && action !== "attach") || typeof captureId !== "string" || !captureIdPattern.test(captureId))
      throw new InputError("請選擇一筆野採素材。");
    if (action === "attach") {
      // A file waiting on the Mac is transcribed for this capture; only its transcript will reach this site.
      const { capture } = await getCaptureEntry(captureId);
      queue.assign(captureId, file as string, { title: capture.title, source: fileSourceLabel(capture) });
      return view(captureId);
    }
    // A file is retried from the copy still in the Mac's inbox folder; it needs no source link.
    if (queue.view(captureId)?.kind === "file") {
      queue.retry(captureId);
      return view(captureId);
    }
    const { capture } = await getCaptureEntry(captureId);
    const source = sourceUrl(capture.sourceUrl);
    if (!source) throw new InputError("這筆素材沒有可讀取的抖音影片網址，請把影片存進 iCloud 雲碟的「行光轉錄」資料夾。", 422);
    if (!queue.view(captureId)) {
      const match = queue.matchingIds(source)[0] || null;
      queue.enqueue(captureId, { ...source, raw: "", title: capture.title }, match);
    }
    queue.retry(captureId);
    return view(captureId);
  } catch (error) {
    return douyinError(error);
  }
}
