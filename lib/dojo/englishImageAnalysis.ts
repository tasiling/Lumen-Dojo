import "server-only";

import { englishImageAttachmentBytes, getEnglishImageEntry, listEnglishImageEntries, saveEnglishImageEntry, currentMonthEstimatedSpend } from "./englishImageStore";
import type { EnglishImageEntry } from "./englishImage";

const INPUT_USD_PER_MILLION = 0.2;
const OUTPUT_USD_PER_MILLION = 1.2;
const ANALYSIS_IMAGE_CHUNK_SIZE = 10;

type AnalysisResult = {
  sourceLabel: string;
  ocrText: string;
  englishRecord: string;
  chineseExplanation: string;
  learningPhrases: string;
  vocabularyWords: string;
  confidence: "high" | "medium" | "low";
  needsReview: boolean;
  reviewReason: string;
};

type AnalysisCallResult = {
  result: AnalysisResult;
  inputTokens: number;
  outputTokens: number;
};

const ANALYSIS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["sourceLabel", "ocrText", "englishRecord", "chineseExplanation", "learningPhrases", "vocabularyWords", "confidence", "needsReview", "reviewReason"],
  properties: {
    sourceLabel: { type: "string" },
    ocrText: { type: "string" },
    englishRecord: { type: "string" },
    chineseExplanation: { type: "string" },
    learningPhrases: { type: "string" },
    vocabularyWords: { type: "string" },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
    needsReview: { type: "boolean" },
    reviewReason: { type: "string" },
  },
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

function analysisPrompt(entry: EnglishImageEntry, part?: { index: number; total: number }): string {
  const context = entry.contextNote ? `\n使用者補充情境：${entry.contextNote}` : "";
  const route = entry.route === "game" ? "英文遊戲畫面" : entry.route === "classroom" ? "英文課堂教材或白板畫面" : "英文日常畫面";
  const group = entry.attachments.length > 1
    ? `這是同一段情境的 ${entry.attachments.length} 張連續圖片${part ? `，目前是第 ${part.index}/${part.total} 批` : ""}，請依畫面順序合併理解。`
    : "";
  const task = entry.route === "classroom"
    ? "辨識課堂主題、老師的問題或作業要求、文法重點，並在 englishRecord 提供一段 B1–B2、可直接拿來回答或練習的英文內容；chineseExplanation 要用中文分別說明課堂任務與文法重點。"
    : "用 B1–B2 難度寫一段自然、精簡的英文事件紀錄；中文解釋要說明畫面英文與情境。";
  return `分析這張${route}。${group}忠實抄錄可辨識的英文，不可猜測模糊文字。${task}learningPhrases 請挑 3–5 個真正能在其他情境重用的片語、搭配或完整句型，不要只放孤立單字；vocabularyWords 另外挑 1–5 個值得進單字庫的英文單字。兩欄皆每行使用「英文｜中文｜簡短用法」格式。若資訊不足，保守描述並標記需要確認。${context}`;
}

async function requestAnalysis(params: {
  apiKey: string;
  model: string;
  prompt: string;
  images?: Array<{ bytes: ArrayBuffer; mimeType: string }>;
}): Promise<AnalysisCallResult> {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${params.apiKey}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(60_000),
    body: JSON.stringify({
      model: params.model,
      store: false,
      reasoning: { effort: "none" },
      max_output_tokens: 2000,
      input: [{ role: "user", content: [
        { type: "input_text", text: params.prompt },
        ...(params.images ?? []).map((image) => ({ type: "input_image", image_url: `data:${image.mimeType};base64,${Buffer.from(image.bytes).toString("base64")}`, detail: "high" })),
      ] }],
      text: { format: {
        type: "json_schema",
        name: "english_image_analysis",
        strict: true,
        schema: ANALYSIS_SCHEMA,
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
  return {
    result,
    inputTokens: Number(usage.input_tokens ?? 0) || 0,
    outputTokens: Number(usage.output_tokens ?? 0) || 0,
  };
}

function synthesisPrompt(entry: EnglishImageEntry, parts: AnalysisResult[]): string {
  return `以下是同一組 ${entry.attachments.length} 張連續圖片分批辨識後的 JSON。請依批次順序合併成一份完整結果，刪除重複內容，但不要遺漏不同畫面出現的事件或英文。ocrText 保留重要原文；englishRecord 寫成連貫的 B1–B2 紀錄；learningPhrases 與 vocabularyWords 各精選最多 5 項，每行維持「英文｜中文｜簡短用法」。任何批次信心不足時，整體 needsReview 必須為 true 並說明原因。不可補寫原結果沒有的畫面資訊。\n\n${JSON.stringify(parts)}`;
}

export async function analyzeEnglishImage(id: string, options: { force?: boolean } = {}): Promise<EnglishImageEntry> {
  let { entry } = await getEnglishImageEntry(id);
  if (entry.route === "pending") throw new Error("請先選擇遊戲英文、英文日常或課堂英文");
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
    const model = process.env.OPENAI_ENGLISH_IMAGE_MODEL ?? "gpt-5.6-luna";
    const chunks: EnglishImageEntry["attachments"][] = [];
    for (let index = 0; index < entry.attachments.length; index += ANALYSIS_IMAGE_CHUNK_SIZE) {
      chunks.push(entry.attachments.slice(index, index + ANALYSIS_IMAGE_CHUNK_SIZE));
    }
    const partCalls = await Promise.all(chunks.map(async (chunk, index) => requestAnalysis({
      apiKey,
      model,
      prompt: analysisPrompt(entry, chunks.length > 1 ? { index: index + 1, total: chunks.length } : undefined),
      images: await Promise.all(chunk.map(englishImageAttachmentBytes)),
    })));
    const finalCall = partCalls.length === 1
      ? partCalls[0]
      : await requestAnalysis({ apiKey, model, prompt: synthesisPrompt(entry, partCalls.map((call) => call.result)) });
    const result = finalCall.result;
    const inputTokens = partCalls.reduce((sum, call) => sum + call.inputTokens, 0) + (partCalls.length > 1 ? finalCall.inputTokens : 0);
    const outputTokens = partCalls.reduce((sum, call) => sum + call.outputTokens, 0) + (partCalls.length > 1 ? finalCall.outputTokens : 0);
    const estimatedCostUsd = inputTokens / 1_000_000 * INPUT_USD_PER_MILLION + outputTokens / 1_000_000 * OUTPUT_USD_PER_MILLION;
    return saveEnglishImageEntry({
      ...entry,
      title: result.sourceLabel || entry.title,
      sourceLabel: result.sourceLabel,
      ocrText: result.ocrText,
      englishRecord: result.englishRecord,
      chineseExplanation: result.chineseExplanation,
      learningPhrases: result.learningPhrases,
      vocabularyWords: result.vocabularyWords,
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
