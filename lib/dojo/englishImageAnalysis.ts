import "server-only";

import { englishImageBytes, getEnglishImageEntry, listEnglishImageEntries, saveEnglishImageEntry, currentMonthEstimatedSpend } from "./englishImageStore";
import type { EnglishImageEntry } from "./englishImage";

const INPUT_USD_PER_MILLION = 0.2;
const OUTPUT_USD_PER_MILLION = 1.2;

type AnalysisResult = {
  sourceLabel: string;
  ocrText: string;
  englishRecord: string;
  chineseExplanation: string;
  learningPhrases: string;
  confidence: "high" | "medium" | "low";
  needsReview: boolean;
  reviewReason: string;
};

function budgetUsd(): number {
  const value = Number(process.env.OPENAI_ENGLISH_IMAGE_MONTHLY_BUDGET_USD ?? "2");
  return Number.isFinite(value) && value >= 0 ? value : 2;
}

function outputText(payload: Record<string, unknown>): string {
  if (typeof payload.output_text === "string") return payload.output_text;
  if (!Array.isArray(payload.output)) return "";
  for (const item of payload.output) {
    if (!item || typeof item !== "object" || !Array.isArray((item as { content?: unknown }).content)) continue;
    for (const part of (item as { content: unknown[] }).content) {
      if (part && typeof part === "object" && (part as { type?: unknown }).type === "output_text" && typeof (part as { text?: unknown }).text === "string") {
        return (part as { text: string }).text;
      }
    }
  }
  return "";
}

function analysisPrompt(entry: EnglishImageEntry): string {
  const context = entry.contextNote ? `\n使用者補充情境：${entry.contextNote}` : "";
  const route = entry.route === "game" ? "英文遊戲畫面" : "英文日常畫面";
  return `分析這張${route}。忠實抄錄可辨識的英文，不可猜測模糊文字。用 B1–B2 難度寫一段自然、精簡的英文事件紀錄；中文解釋要說明畫面英文與情境；挑最多 5 個值得學的詞句，每行格式為「英文｜中文｜簡短用法」。若資訊不足，保守描述並標記需要確認。${context}`;
}

export async function analyzeEnglishImage(id: string, options: { force?: boolean } = {}): Promise<EnglishImageEntry> {
  let { entry } = await getEnglishImageEntry(id);
  if (entry.route === "pending") throw new Error("請先選擇遊戲英文或英文日常");
  if (!options.force && (entry.analysisStatus === "completed" || entry.analysisStatus === "needs-review")) return entry;
  const processingIsFresh = entry.analysisStatus === "processing" && Date.now() - new Date(entry.updatedAt).getTime() < 2 * 60_000;
  if (processingIsFresh) throw new Error("這張圖片正在分析中");
  const apiKey = process.env.OPENAI_API_KEY ?? "";
  if (!apiKey) {
    return saveEnglishImageEntry({ ...entry, analysisStatus: "failed", analysisError: "尚未設定 OPENAI_API_KEY" });
  }
  const entries = await listEnglishImageEntries();
  const spent = currentMonthEstimatedSpend(entries);
  if (spent >= budgetUsd()) {
    return saveEnglishImageEntry({ ...entry, analysisStatus: "failed", analysisError: `本月英文影像 AI 預算已達 US$${budgetUsd().toFixed(2)}` });
  }

  entry = await saveEnglishImageEntry({
    ...entry,
    analysisStatus: "processing",
    analysisError: "",
    analysisAttempts: entry.analysisAttempts + 1,
  });
  try {
    const image = await englishImageBytes(entry);
    const model = process.env.OPENAI_ENGLISH_IMAGE_MODEL ?? "gpt-5.6-luna";
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(30_000),
      body: JSON.stringify({
        model,
        store: false,
        reasoning: { effort: "none" },
        max_output_tokens: 1200,
        input: [{ role: "user", content: [
          { type: "input_text", text: analysisPrompt(entry) },
          { type: "input_image", image_url: `data:${image.mimeType};base64,${Buffer.from(image.bytes).toString("base64")}`, detail: "high" },
        ] }],
        text: { format: {
          type: "json_schema",
          name: "english_image_analysis",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["sourceLabel", "ocrText", "englishRecord", "chineseExplanation", "learningPhrases", "confidence", "needsReview", "reviewReason"],
            properties: {
              sourceLabel: { type: "string" },
              ocrText: { type: "string" },
              englishRecord: { type: "string" },
              chineseExplanation: { type: "string" },
              learningPhrases: { type: "string" },
              confidence: { type: "string", enum: ["high", "medium", "low"] },
              needsReview: { type: "boolean" },
              reviewReason: { type: "string" },
            },
          },
        } },
      }),
    });
    const payload = await response.json() as Record<string, unknown>;
    if (!response.ok) {
      const error = payload.error && typeof payload.error === "object" ? (payload.error as { message?: unknown }).message : null;
      throw new Error(typeof error === "string" ? error : `OpenAI 回應 ${response.status}`);
    }
    const result = JSON.parse(outputText(payload)) as AnalysisResult;
    const usage = payload.usage && typeof payload.usage === "object" ? payload.usage as Record<string, unknown> : {};
    const inputTokens = Number(usage.input_tokens ?? 0) || 0;
    const outputTokens = Number(usage.output_tokens ?? 0) || 0;
    const estimatedCostUsd = inputTokens / 1_000_000 * INPUT_USD_PER_MILLION + outputTokens / 1_000_000 * OUTPUT_USD_PER_MILLION;
    return saveEnglishImageEntry({
      ...entry,
      title: result.sourceLabel || entry.title,
      sourceLabel: result.sourceLabel,
      ocrText: result.ocrText,
      englishRecord: result.englishRecord,
      chineseExplanation: result.chineseExplanation,
      learningPhrases: result.learningPhrases,
      analysisStatus: result.needsReview || result.confidence === "low" ? "needs-review" : "completed",
      analysisConfidence: result.confidence,
      analysisReviewReason: result.reviewReason,
      analysisError: "",
      analyzedAt: new Date().toISOString(),
      analysisModel: model,
      inputTokens,
      outputTokens,
      estimatedCostUsd,
    });
  } catch (error) {
    return saveEnglishImageEntry({
      ...entry,
      analysisStatus: "failed",
      analysisError: error instanceof Error ? error.message.slice(0, 3000) : String(error).slice(0, 3000),
    });
  }
}
