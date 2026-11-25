import { type NextRequest } from "next/server";
import { requireLearningOwner } from "@/lib/dojo/learningFoundation/access";
import { captureIdPattern, douyinError, douyinJson, douyinJsonBody } from "@/lib/dojo/douyin/http";
import { douyinQueue } from "@/lib/dojo/douyin/queue.mjs";
import { InputError, sourceUrl } from "@/lib/dojo/douyin/share.mjs";
import { fileSourceLabel } from "@/lib/dojo/douyin/fileOffer";
import { kickTranscriptSync, syncPendingTranscripts } from "@/lib/dojo/douyin/transcriptSync";
import { toTraditional } from "@/lib/dojo/douyin/tidy";
import { TIDY_MANUAL, checkManualTidy, cleanPastedTidy, tidyWords, type TranscriptTidy } from "@/lib/dojo/douyin/tidyText";
import { syncTranscript, transcriptForCapture } from "@/lib/dojo/douyin/transcriptSync";
import { updateCaptureEntry } from "@/lib/dojo/captureStore";
import { transcriptReadingText } from "@/lib/dojo/douyin/transcriptText";
import { douyinInstallFile } from "@/lib/dojo/douyinInstall";
import { getCaptureEntry } from "@/lib/dojo/captureStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jobView(captureId?: string) {
  if (!captureId) return null;
  const job = douyinQueue().view(captureId);
  // The Traditional original a corrected transcript is compared with for 「改了哪裡」; rebuilt here, never stored.
  return job?.tidy ? { ...job, tidyBase: toTraditional(transcriptReadingText(job)) } : job;
}

function view(captureId?: string) {
  const queue = douyinQueue();
  return douyinJson({ connection: queue.connection(), mac: queue.mac(), offers: queue.offers(), unsynced: queue.unsynced(), job: jobView(captureId) });
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
    const { action, captureId, file, text, confirm } = await douyinJsonBody(req, 400_000);
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
        job: typeof captureId === "string" && captureIdPattern.test(captureId) ? jobView(captureId) : null });
    }
    if (action === "tidy") {
      // 補做校正：correct a transcript that finished before correction existed, or whose correction did not finish.
      if (typeof captureId !== "string" || !captureIdPattern.test(captureId)) throw new InputError("請選擇一筆野採素材。");
      queue.requestTidy(captureId);
      kickTranscriptSync();
      return view(captureId);
    }
    if (action === "tidyPaste") {
      // 貼回校正版：a transcript corrected elsewhere (for example in a GPT conversation) becomes this capture's
      // corrected copy. The raw recognition is never replaced. Differences are shown first; the owner decides.
      if (typeof captureId !== "string" || !captureIdPattern.test(captureId)) throw new InputError("請選擇一筆野採素材。");
      const pasted = cleanPastedTidy(typeof text === "string" ? text : "");
      if (!pasted) throw new InputError("請先貼上校正後的逐字稿。");
      const job = queue.view(captureId);
      const done = job?.status === "done" ? job : null;
      const { capture } = await getCaptureEntry(captureId);
      const stored = capture.clip.transcript;
      if (!done && !stored?.text) throw new InputError("這筆素材還沒有完成的逐字稿。", 409);
      if (!done && stored?.truncated) throw new InputError("這份逐字稿在 Notion 只存了前半，轉錄佇列裡也沒有完整內容，無法核對貼回的版本。", 409);
      const base = toTraditional(done ? transcriptReadingText(done) : stored!.text);
      if ([...tidyWords(pasted)].length > [...tidyWords(base)].length * 2 + 200) throw new InputError("貼上的內容比原本的逐字稿長很多，請只貼校正後的逐字稿。");
      const check = checkManualTidy(base, pasted);
      if (!check.ok && confirm !== true) return douyinJson({ check, saved: false });
      const tidy: TranscriptTidy = { text: pasted, at: new Date().toISOString(), model: TIDY_MANUAL, changes: 0, state: "done", reverted: [] };
      if (done) {
        if (!queue.saveManualTidy(captureId, tidy)) throw new InputError("逐字稿剛剛更新過，請重新整理後再貼一次。", 409);
        await syncTranscript(captureId).catch(() => false);
      } else {
        // The queue no longer holds this transcript; Notion's copy is the only one, so it is updated directly.
        await updateCaptureEntry(captureId, (current) => ({ clip: { ...current.clip,
          transcript: transcriptForCapture(current, { text: stored!.text, segments: [], finishedAt: stored!.finishedAt, tidy }) } }));
      }
      return douyinJson({ check, saved: true, tidy, connection: queue.connection(), mac: queue.mac(), offers: queue.offers(), unsynced: queue.unsynced(), job: jobView(captureId) });
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
