import "server-only";

import { budgetUsd, outputText, spentThisMonth } from "./captureImageReader";
import { getCaptureEntry, updateCaptureEntry } from "./captureStore";
import { douyinQueue } from "./douyin/queue.mjs";
import type { CaptureEntry } from "./formal";
import { LearningError } from "./learningFoundation/model";
import { clipQuickReply, pushLineMessage } from "./lineClipping";
import { createRefineCard } from "@/lib/notion/mutations";
import { findRefineCardId } from "@/lib/notion/queries";
import { taipeiTodayISO } from "./formal";
import {
  ANALYSIS_PROMPT, MAX_FRAMES, analysisFromResult, analysisSchema, shotRanges, techniqueCard, timelineText, type VideoAnalysis,
} from "./videoAnalysis";

const INPUT_USD_PER_MILLION = 0.2;
const OUTPUT_USD_PER_MILLION = 1.2;
const FRAME_MAX_BYTES = 400 * 1024;

const blank = (requestedAt: string): VideoAnalysis => ({
  state: "queued", requestedAt, duration: 0, cuts: [], shots: [], rhythm: "", techniques: [], uncertain: "",
  confirmed: false, readAt: null, model: "", estimatedCostUsd: 0, error: "",
});

export type AnalysisStatus = { analysis: VideoAnalysis | null; queue: { status: string; phase: string; error: string } | null; macReady: boolean };

export async function videoAnalysisStatus(captureId: string): Promise<AnalysisStatus> {
  const { capture } = await getCaptureEntry(captureId);
  let queue: AnalysisStatus["queue"] = null, macReady = false;
  try { const q = douyinQueue(); queue = q.analysisView(captureId); macReady = q.macAnalyses(); } catch { /* queue storage unavailable */ }
  return { analysis: capture.clip.videoAnalysis ?? null, queue, macReady };
}

/** Queues an analysis only when the owner asks. A new request replaces the previous result and its confirmation. */
export async function requestVideoAnalysis(captureId: string): Promise<AnalysisStatus> {
  await getCaptureEntry(captureId);
  if (await spentThisMonth() >= budgetUsd()) throw new LearningError(`本月 AI 讀圖預算已達 US$${budgetUsd().toFixed(2)}。`, 429);
  let queue;
  try { queue = douyinQueue(); } catch { throw new LearningError("Mac 轉錄的佇列尚未啟用。", 503); }
  try { queue.requestAnalysis(captureId); }
  catch (error) { throw new LearningError(error instanceof Error ? error.message : "暫時無法排入分析。", 409); }
  await updateCaptureEntry(captureId, (current) => {
    // Cards already saved from an earlier analysis stay in DB-22; only the analysis itself is replaced.
    return { clip: { ...current.clip, videoAnalysis: blank(new Date().toISOString()) } };
  });
  return videoAnalysisStatus(captureId);
}

type Frame = { t: number; shot: number; data: string };

/** Checks what the Mac sent. Frames are JPEG thumbnails; nothing else about the video is accepted. */
export function validFrames(data: Record<string, unknown>): { duration: number; cuts: number[]; frames: Frame[] } {
  const duration = Number(data.duration);
  if (!Number.isFinite(duration) || duration <= 0 || duration > 3600) throw new Error("影片長度格式不符。");
  const cuts = Array.isArray(data.cuts) ? data.cuts.filter((t): t is number => typeof t === "number" && Number.isFinite(t) && t > 0 && t < duration) : [];
  const shots = shotRanges(duration, cuts).length;
  const frames = Array.isArray(data.frames) ? data.frames.flatMap((frame) => {
    if (!frame || typeof frame !== "object") return [];
    const { t, shot, data: image } = frame as Record<string, unknown>;
    if (typeof t !== "number" || !Number.isFinite(t) || t < 0 || t > duration + 1 || !Number.isSafeInteger(shot) || (shot as number) < 1 || (shot as number) > shots) return [];
    if (typeof image !== "string" || !/^[A-Za-z0-9+/=]+$/.test(image) || image.length * 0.75 > FRAME_MAX_BYTES || !image.startsWith("/9j/")) return [];
    return [{ t, shot: shot as number, data: image }];
  }) : [];
  if (!frames.length) throw new Error("沒有收到可用的關鍵畫面。");
  return { duration, cuts, frames: frames.slice(0, MAX_FRAMES) };
}

/** Reads the frames the Mac sent and stores the storyboard. Runs after the Mac's request has been answered. */
export async function readAnalysisFrames(captureId: string, input: { duration: number; cuts: number[]; frames: Frame[] }): Promise<void> {
  const queue = douyinQueue();
  const model = process.env.OPENAI_ENGLISH_IMAGE_MODEL ?? "gpt-5.6-luna";
  const startedAt = new Date().toISOString();
  try {
    await updateCaptureEntry(captureId, (current) => ({ clip: { ...current.clip, videoAnalysis: { ...(current.clip.videoAnalysis ?? blank(startedAt)), state: "reading", duration: input.duration, cuts: input.cuts } } }));
    const apiKey = process.env.OPENAI_API_KEY ?? "";
    if (!apiKey) throw new Error("尚未設定 OPENAI_API_KEY。");
    const shots = shotRanges(input.duration, input.cuts).length;
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, signal: AbortSignal.timeout(180_000),
      body: JSON.stringify({
        model, store: false, reasoning: { effort: "none" }, max_output_tokens: 2500 + shots * 350,
        input: [{ role: "user", content: [
          { type: "input_text", text: ANALYSIS_PROMPT + "\n\n" + timelineText(input.duration, input.cuts) },
          ...input.frames.sort((a, b) => a.t - b.t).flatMap((frame) => [
            { type: "input_text", text: `鏡頭 ${frame.shot}｜${frame.t.toFixed(2)} 秒` },
            { type: "input_image", image_url: `data:image/jpeg;base64,${frame.data}`, detail: "high" },
          ]),
        ] }],
        text: { format: { type: "json_schema", name: "video_craft_analysis", strict: true, schema: analysisSchema(shots) } },
      }),
    });
    const payload = await response.json() as Record<string, unknown>;
    if (!response.ok) throw new Error(`OpenAI 回應 ${response.status}`);
    const usage = payload.usage as { input_tokens?: number; output_tokens?: number } | undefined;
    const cost = (Number(usage?.input_tokens) || 0) / 1_000_000 * INPUT_USD_PER_MILLION + (Number(usage?.output_tokens) || 0) / 1_000_000 * OUTPUT_USD_PER_MILLION;
    const parsed = analysisFromResult(JSON.parse(outputText(payload) || "{}"), input.duration, input.cuts);
    const saved = await updateCaptureEntry(captureId, (current) => ({ clip: { ...current.clip, videoAnalysis: {
      ...(current.clip.videoAnalysis ?? blank(startedAt)), ...parsed, state: "ready", duration: input.duration, cuts: input.cuts,
      confirmed: false, readAt: new Date().toISOString(), model, estimatedCostUsd: (current.clip.videoAnalysis?.estimatedCostUsd ?? 0) + cost, error: "",
    } } }));
    queue.settleAnalysis(captureId);
    notify(saved, `畫面與節奏分析完成｜「${saved.title}」\n共 ${parsed.shots.length} 個鏡頭、${parsed.techniques.length} 個可學的手法。請到採集頁核對，想留下的手法可以存成手法觀察卡。`);
  } catch (error) {
    const message = error instanceof Error && /[㐀-鿿]/.test(error.message) ? error.message : "AI 沒有完成畫面分析，請稍後重試。";
    console.error("video analysis failed", captureId, error instanceof Error ? error.name : "unknown");
    queue.settleAnalysis(captureId, message);
    try {
      const saved = await updateCaptureEntry(captureId, (current) => ({ clip: { ...current.clip, videoAnalysis: { ...(current.clip.videoAnalysis ?? blank(startedAt)), state: "failed", error: message } } }));
      notify(saved, `畫面與節奏分析沒有完成｜「${saved.title}」\n原因：${message}`);
    } catch { /* the capture may have been removed */ }
  }
}

/** The Mac could not fetch or cut the video. */
export async function failVideoAnalysis(captureId: string, message: string): Promise<void> {
  try {
    const saved = await updateCaptureEntry(captureId, (current) => ({ clip: { ...current.clip, videoAnalysis: { ...(current.clip.videoAnalysis ?? blank(new Date().toISOString())), state: "failed", error: message.slice(0, 600) } } }));
    notify(saved, `畫面與節奏分析沒有完成｜「${saved.title}」\n原因：${message}`);
  } catch { /* the capture may have been removed */ }
}

function notify(capture: CaptureEntry, text: string) {
  void pushLineMessage(text, clipQuickReply(capture.id, false, false, "到採集頁核對")).catch(() => undefined);
}

export async function confirmVideoAnalysis(captureId: string, confirmed: boolean): Promise<CaptureEntry> {
  return updateCaptureEntry(captureId, (current) => {
    const analysis = current.clip.videoAnalysis;
    if (!analysis || analysis.state !== "ready") throw new LearningError("還沒有完成的分析。", 409);
    return { clip: { ...current.clip, videoAnalysis: { ...analysis, confirmed } } };
  });
}

/** Saves one technique as a 手法觀察 card in DB-22. A retry finds the card already made instead of making another. */
export async function saveTechniqueCard(captureId: string, index: number, input: { title: string; words: string }): Promise<CaptureEntry> {
  const { capture } = await getCaptureEntry(captureId);
  const analysis = capture.clip.videoAnalysis;
  if (!analysis || analysis.state !== "ready") throw new LearningError("還沒有完成的分析。", 409);
  if (analysis.techniques[index]?.cardId) throw new LearningError("這個手法已經存成卡片。", 409);
  const draft = techniqueCard(analysis, index, input, captureId);
  if (typeof draft === "string") throw new LearningError(draft, 422);
  const cardId = await findRefineCardId(draft.discussion) ?? (await createRefineCard({ ...draft, todayISO: taipeiTodayISO() })).id;
  return updateCaptureEntry(captureId, (current) => {
    const latest = current.clip.videoAnalysis;
    if (!latest) return {};
    return { clip: { ...current.clip, videoAnalysis: { ...latest, techniques: latest.techniques.map((item, position) => position === index ? { ...item, cardId } : item) } } };
  });
}
