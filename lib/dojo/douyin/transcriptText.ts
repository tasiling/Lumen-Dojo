/** Transcript text shared by the capture page and the copy written back to Notion. No server-only imports. */

export type TranscriptSegment = { start: number; end: number; text: string };

/**
 * The transcript as paragraphs. BiliNote returns one unbroken text plus timestamped segments; a new paragraph
 * starts after 40 seconds, 240 characters, or a pause of 3 seconds. Text that already has line breaks is kept as is.
 */
export function transcriptReadingText(job: { text: string; segments: TranscriptSegment[] }): string {
  if (job.text.includes("\n") || job.segments.length < 2) return job.text;
  const paragraphs: string[] = [];
  let cursor = 0;
  let paragraphAt = 0;
  let paragraphTime = job.segments[0].start;
  let lastEnd = paragraphTime;
  for (const segment of job.segments) {
    const text = segment.text.trim();
    if (!text) continue;
    const at = job.text.indexOf(text, cursor);
    if (at < 0) continue;
    if (cursor && at > paragraphAt &&
       (segment.start - paragraphTime >= 40 || at - paragraphAt >= 240 || segment.start - lastEnd >= 3)) {
      paragraphs.push(job.text.slice(paragraphAt, at));
      paragraphAt = at;
      paragraphTime = segment.start;
    }
    cursor = at + text.length;
    lastEnd = segment.end;
  }
  paragraphs.push(job.text.slice(paragraphAt));
  return paragraphs.join("\n\n");
}

/**
 * A capture is one Notion rich-text property: at most 100 blocks of 2,000 characters, 200,000 in all, as JSON.
 * The transcript may use up to this many characters of it; a longer one is cut at a paragraph and marked truncated.
 */
export const TRANSCRIPT_NOTION_LIMIT = 100_000;
/** Kept below Notion's 200,000 so later edits to the capture's other fields still fit. */
export const CAPTURE_JSON_BUDGET = 190_000;

/** Cuts at the last paragraph or line break before `limit`, so stored paragraphs are whole. */
export function clipTranscript(text: string, limit: number): { text: string; truncated: boolean } {
  if (text.length <= limit) return { text, truncated: false };
  const head = text.slice(0, Math.max(0, limit));
  const at = Math.max(head.lastIndexOf("\n\n"), head.lastIndexOf("\n"));
  return { text: (at > limit * 0.5 ? head.slice(0, at) : head).trimEnd(), truncated: true };
}
