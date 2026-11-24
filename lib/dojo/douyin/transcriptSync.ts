import "server-only";

import { getCaptureEntry, updateCaptureEntry } from "@/lib/dojo/captureStore";
import { captureContent, type CaptureEntry, type CaptureTranscript } from "@/lib/dojo/formal";
import type { TranscriptTidy } from "./tidyText";
import { tidyTranscript } from "./tidy";
import { douyinFinishedMessage } from "./lineStatus";
import { clipQuickReply, pushLineMessage } from "@/lib/dojo/lineClipping";
import { douyinQueue } from "./queue.mjs";
import { CAPTURE_JSON_BUDGET, clipTranscript, transcriptReadingText, TRANSCRIPT_NOTION_LIMIT } from "./transcriptText";

/**
 * Notion is the source of truth for a capture, so a finished transcript is copied from the transcription queue into
 * the capture's record as `clip.transcript`. Timestamped segments stay in the queue: an hour of speech is about a
 * thousand segments, which would not fit beside the text in one 200,000-character record.
 */
export function transcriptForCapture(capture: CaptureEntry, job: {
  text: string; segments: { start: number; end: number; text: string }[]; finishedAt: string; tidy?: TranscriptTidy | null;
}): CaptureTranscript {
  const full = transcriptReadingText(job);
  const tidyFull = job.tidy?.text ?? "";
  // With a corrected copy the record holds two versions of the same speech, so each gets half the room.
  let limit = tidyFull ? TRANSCRIPT_NOTION_LIMIT * 0.9 / 2 : TRANSCRIPT_NOTION_LIMIT;
  const build = () => {
    const original = clipTranscript(full, limit);
    const tidied = tidyFull ? clipTranscript(tidyFull, limit) : null;
    return {
      text: original.text, finishedAt: job.finishedAt, truncated: original.truncated || Boolean(tidied?.truncated),
      ...(job.tidy && tidied ? { tidy: { ...job.tidy, text: tidied.text } } : {}),
    };
  };
  let transcript = build();
  // The whole capture is one JSON property; leave room for its other fields (JSON escapes each line break as two characters).
  for (let attempt = 0; attempt < 4; attempt++) {
    const size = JSON.stringify(captureContent({ ...capture, clip: { ...capture.clip, transcript } })).length;
    if (size <= CAPTURE_JSON_BUDGET) break;
    limit -= (size - CAPTURE_JSON_BUDGET) / (tidyFull ? 2 : 1) + 200;
    transcript = { ...build(), truncated: true };
  }
  return transcript;
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
  if (!stored || stored.text !== wanted.text || stored.finishedAt !== wanted.finishedAt || stored.truncated !== wanted.truncated
    || JSON.stringify(stored.tidy ?? null) !== JSON.stringify(wanted.tidy ?? null))
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

let tidying: Promise<number> | null = null;

/**
 * Corrects finished transcripts that are waiting (逐字稿校正), one at a time, then announces those that came from a
 * new transcription. Correction never fails a transcript: whatever happens, the Traditional original is stored.
 */
export function tidyPendingTranscripts({ limit = 2, notify = notifyOwner }: { limit?: number; notify?: (captureId: string, message: string) => Promise<void> } = {}): Promise<number> {
  if (tidying) return tidying;
  const run = (async () => {
    const queue = douyinQueue();
    let settled = 0;
    for (const { id, notify: announce } of queue.pendingTidy(limit)) {
      const job = queue.view(id);
      if (!job || job.status !== "done" || !job.finishedAt) continue;
      let outcome;
      try {
        outcome = await tidyTranscript(transcriptReadingText(job), queue.tidySpentThisMonth());
      } catch (error) {
        console.error("野採逐字稿校正失敗", error instanceof Error ? error.message : "UnknownError");
        continue;
      }
      if (!queue.saveTidy(id, job.finishedAt, outcome.tidy, outcome.reason, outcome.costUsd)) continue;
      settled++;
      if (announce) {
        const message = douyinFinishedMessage(queue.view(id));
        if (message) await notify(id, message).catch((error) => {
          console.error("野採轉錄通知未送達", error instanceof Error ? error.message : "UnknownError");
        });
      }
    }
    return settled;
  })();
  tidying = run.finally(() => { tidying = null; });
  return tidying;
}

async function notifyOwner(captureId: string, message: string) {
  await pushLineMessage(message, clipQuickReply(captureId, false, false, "查看這筆素材"));
}

/**
 * Starts correction and then the Notion write-back without waiting; used where a Mac or page request must not
 * wait on the model or Notion. A transcript is written once when it finishes and again when its correction settles.
 */
export function kickTranscriptSync(): void {
  try {
    void tidyPendingTranscripts().catch(() => 0).then(() => syncPendingTranscripts()).catch(() => undefined);
  } catch { /* the queue is not configured; nothing to sync */ }
}
