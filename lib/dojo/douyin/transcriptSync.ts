import "server-only";

import { getCaptureEntry, updateCaptureEntry } from "@/lib/dojo/captureStore";
import { captureContent, type CaptureEntry, type CaptureTranscript } from "@/lib/dojo/formal";
import { douyinQueue } from "./queue.mjs";
import { CAPTURE_JSON_BUDGET, clipTranscript, transcriptReadingText, TRANSCRIPT_NOTION_LIMIT } from "./transcriptText";

/**
 * Notion is the source of truth for a capture, so a finished transcript is copied from the transcription queue into
 * the capture's record as `clip.transcript`. Timestamped segments stay in the queue: an hour of speech is about a
 * thousand segments, which would not fit beside the text in one 200,000-character record.
 */
export function transcriptForCapture(capture: CaptureEntry, job: { text: string; segments: { start: number; end: number; text: string }[]; finishedAt: string }): CaptureTranscript {
  const full = transcriptReadingText(job);
  let { text, truncated } = clipTranscript(full, TRANSCRIPT_NOTION_LIMIT);
  // The whole capture is one JSON property; leave room for its other fields (JSON escapes each line break as two characters).
  for (let attempt = 0; attempt < 4; attempt++) {
    const size = JSON.stringify(captureContent({ ...capture, clip: { ...capture.clip, transcript: { text, finishedAt: job.finishedAt, truncated } } })).length;
    if (size <= CAPTURE_JSON_BUDGET) break;
    ({ text } = clipTranscript(text, text.length - (size - CAPTURE_JSON_BUDGET) - 200));
    truncated = true;
  }
  return { text, finishedAt: job.finishedAt, truncated };
}

/** Writes one capture's finished transcript to its Notion record. Throws when Notion cannot be written. */
export async function syncTranscript(captureId: string): Promise<boolean> {
  const queue = douyinQueue();
  const job = queue.view(captureId);
  if (!job || job.status !== "done" || !job.finishedAt) return false;
  const finishedAt = job.finishedAt;
  const { capture } = await getCaptureEntry(captureId);
  const wanted = transcriptForCapture(capture, { ...job, finishedAt });
  const stored = capture.clip.transcript;
  if (!stored || stored.text !== wanted.text || stored.finishedAt !== wanted.finishedAt || stored.truncated !== wanted.truncated)
    await updateCaptureEntry(captureId, (current) => ({ clip: { ...current.clip, transcript: transcriptForCapture(current, { ...job, finishedAt }) } }));
  queue.markSynced(captureId, finishedAt);
  return true;
}

let sweeping: Promise<{ synced: number; failed: number; remaining: number }> | null = null;

/**
 * Writes pending transcripts to Notion, a few at a time. Existing transcripts finished before this existed are
 * pending too, so this is also the backfill. A failure is counted and retried later; it never throws.
 */
export function syncPendingTranscripts({ limit = 5, force = false } = {}): Promise<{ synced: number; failed: number; remaining: number }> {
  if (sweeping) return sweeping;
  const run = (async () => {
    const queue = douyinQueue();
    let synced = 0, failed = 0;
    for (const id of queue.pendingSync(limit, force)) {
      try {
        if (await syncTranscript(id)) synced++;
      } catch (error) {
        failed++;
        queue.syncFailed(id);
        console.error("野採逐字稿未能寫回 Notion", error instanceof Error ? error.message : "UnknownError");
      }
    }
    return { synced, failed, remaining: queue.unsynced() };
  })();
  sweeping = run.finally(() => { sweeping = null; });
  return sweeping;
}

/** Starts a sweep without waiting for it; used where a Mac or page request must not wait on Notion. */
export function kickTranscriptSync(): void {
  try {
    void syncPendingTranscripts().catch(() => undefined);
  } catch { /* the queue is not configured; nothing to sync */ }
}
