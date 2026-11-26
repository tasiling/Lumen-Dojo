import "server-only";

import { captureImageUrl, getCaptureEntry, listCaptureEntries, updateCaptureEntry } from "./captureStore";
import { listEnglishImageEntries, currentMonthEstimatedSpend } from "./englishImageStore";
import { IMAGE_TEXT_MAX_IMAGES, IMAGE_TEXT_PROMPT, imagePagesFromResult, imageTextSchema, type CaptureImagePage, type CaptureImageText } from "./captureImageText";
import type { CaptureEntry } from "./formal";
import { LearningError } from "./learningFoundation/model";

// Same pricing and monthly budget as the English image analysis; both count toward one monthly estimate.
const INPUT_USD_PER_MILLION = 0.2;
const OUTPUT_USD_PER_MILLION = 1.2;
const CHUNK = 10;

function budgetUsd(): number {
  const value = Number(process.env.OPENAI_ENGLISH_IMAGE_MONTHLY_BUDGET_USD ?? "2");
  return Number.isFinite(value) && value >= 0 ? value : 2;
}

function monthOf(date: string | null) {
  const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit" });
  return date && !Number.isNaN(Date.parse(date)) ? formatter.format(new Date(date)) : "";
}

async function spentThisMonth(): Promise<number> {
  const month = monthOf(new Date().toISOString());
  const [english, captures] = await Promise.all([listEnglishImageEntries(), listCaptureEntries()]);
  return currentMonthEstimatedSpend(english) + captures.reduce((sum, capture) =>
    sum + (monthOf(capture.clip.imageText?.readAt ?? null) === month ? capture.clip.imageText?.estimatedCostUsd ?? 0 : 0), 0);
}

function outputText(payload: Record<string, unknown>): string {
  if (typeof payload.output_text === "string") return payload.output_text;
  for (const item of Array.isArray(payload.output) ? payload.output : []) {
    for (const part of item && typeof item === "object" && Array.isArray((item as { content?: unknown[] }).content) ? (item as { content: unknown[] }).content : []) {
      if (part && typeof part === "object" && typeof (part as { text?: unknown }).text === "string") return (part as { text: string }).text;
    }
  }
  return "";
}

async function imageData(captureId: string, blockId: string): Promise<string> {
  const url = await captureImageUrl(captureId, blockId);
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`圖片讀取失敗（${response.status}）`);
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > 20 * 1024 * 1024) throw new Error("圖片超過 20 MB，無法讀取");
  const type = (response.headers.get("content-type") ?? "image/jpeg").split(";")[0];
  return `data:${type};base64,${Buffer.from(bytes).toString("base64")}`;
}

async function readChunk(capture: CaptureEntry, attachments: CaptureEntry["clip"]["attachments"], apiKey: string, model: string) {
  const images = await Promise.all(attachments.map((attachment) => imageData(capture.id, attachment.blockId)));
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(120_000),
    body: JSON.stringify({
      model, store: false, reasoning: { effort: "none" },
      max_output_tokens: 1200 + attachments.length * 1200,
      input: [{ role: "user", content: [
        { type: "input_text", text: IMAGE_TEXT_PROMPT },
        ...images.flatMap((url, index) => [{ type: "input_text", text: `圖 ${index + 1}` }, { type: "input_image", image_url: url, detail: "high" }]),
      ] }],
      text: { format: { type: "json_schema", name: "capture_image_text", strict: true, schema: imageTextSchema(attachments.length) } },
    }),
  });
  const payload = await response.json() as Record<string, unknown>;
  if (!response.ok) {
    const message = payload.error && typeof payload.error === "object" ? (payload.error as { message?: unknown }).message : null;
    throw new Error(typeof message === "string" ? message : `OpenAI 回應 ${response.status}`);
  }
  const usage = payload.usage as { input_tokens?: number; output_tokens?: number } | undefined;
  return {
    pages: imagePagesFromResult(JSON.parse(outputText(payload) || "{}"), attachments.map((attachment) => attachment.id)),
    cost: (Number(usage?.input_tokens) || 0) / 1_000_000 * INPUT_USD_PER_MILLION + (Number(usage?.output_tokens) || 0) / 1_000_000 * OUTPUT_USD_PER_MILLION,
  };
}

/**
 * Reads the text of a capture's images, only when the owner asks. A new reading replaces the previous one and
 * clears the confirmation; the original images are never changed. Errors name the capture, never its content.
 */
export async function readCaptureImageText(id: string): Promise<CaptureEntry> {
  const { capture } = await getCaptureEntry(id);
  const attachments = capture.clip.attachments.slice(0, IMAGE_TEXT_MAX_IMAGES);
  if (!attachments.length) throw new LearningError("這筆採集還沒有圖片。", 400);
  const previous = capture.clip.imageText;
  if (previous?.state === "reading" && previous.readAt && Date.now() - Date.parse(previous.readAt) < 4 * 60_000)
    throw new LearningError("圖片文字正在讀取中，請稍候。", 409);
  const apiKey = process.env.OPENAI_API_KEY ?? "";
  if (!apiKey) throw new LearningError("尚未設定 OPENAI_API_KEY。", 503);
  if (await spentThisMonth() >= budgetUsd()) throw new LearningError(`本月讀圖預算已達 US$${budgetUsd().toFixed(2)}。`, 429);
  const model = process.env.OPENAI_ENGLISH_IMAGE_MODEL ?? "gpt-5.6-luna";
  const startedAt = new Date().toISOString();
  const base: CaptureImageText = { state: "reading", pages: previous?.pages ?? [], confirmed: false, confirmedAt: null, readAt: startedAt, model, estimatedCostUsd: previous?.estimatedCostUsd ?? 0, error: "" };
  await updateCaptureEntry(id, (current) => ({ clip: { ...current.clip, imageText: base } }));
  try {
    const chunks: CaptureEntry["clip"]["attachments"][] = [];
    for (let index = 0; index < attachments.length; index += CHUNK) chunks.push(attachments.slice(index, index + CHUNK));
    const results = await Promise.all(chunks.map((chunk) => readChunk(capture, chunk, apiKey, model)));
    const pages: CaptureImagePage[] = results.flatMap((result) => result.pages);
    const cost = results.reduce((sum, result) => sum + result.cost, 0);
    return updateCaptureEntry(id, (current) => ({ clip: { ...current.clip, imageText: { ...base, state: "ready", pages, estimatedCostUsd: (previous?.estimatedCostUsd ?? 0) + cost } } }));
  } catch (error) {
    console.error("capture image text failed", id, error instanceof Error ? error.name : "unknown");
    const message = error instanceof Error && /[㐀-鿿]/.test(error.message) ? error.message : "AI 讀圖沒有完成，請稍後重試。";
    return updateCaptureEntry(id, (current) => ({ clip: { ...current.clip, imageText: { ...base, state: "failed", error: message.slice(0, 500) } } }));
  }
}

/** Saves the owner's edits and, when asked, confirms the text as part of the original. */
export async function saveCaptureImageText(id: string, input: { pages: { attachmentId: string; text: string }[]; confirm: boolean }): Promise<CaptureEntry> {
  return updateCaptureEntry(id, (current) => {
    const existing = current.clip.imageText;
    if (!existing || existing.state === "reading") throw new LearningError("還沒有讀出的圖片文字。", 409);
    const pages = existing.pages.map((page) => {
      const edit = input.pages.find((item) => item.attachmentId === page.attachmentId);
      return edit ? { ...page, text: edit.text.replace(/\r\n?/g, "\n").trim().slice(0, 6000) } : page;
    });
    const confirmed = input.confirm && pages.some((page) => page.text.trim());
    if (input.confirm && !confirmed) throw new LearningError("沒有可確認的文字。", 400);
    return { clip: { ...current.clip, imageText: { ...existing, pages, confirmed: input.confirm ? true : existing.confirmed, confirmedAt: input.confirm ? new Date().toISOString() : existing.confirmedAt } } };
  });
}

/** Takes the text out of the original again, keeping what was read. */
export async function unconfirmCaptureImageText(id: string): Promise<CaptureEntry> {
  return updateCaptureEntry(id, (current) => current.clip.imageText
    ? { clip: { ...current.clip, imageText: { ...current.clip.imageText, confirmed: false, confirmedAt: null } } }
    : {});
}
