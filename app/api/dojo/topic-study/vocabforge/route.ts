import { NextRequest, NextResponse } from "next/server";
import { readJsonRecord, upsertJsonRecord } from "@/lib/dojo/notionStore";
import {
  normalizeTopicStudyRound,
  topicStudyCandidates,
  topicStudyRecordTitle,
  type TopicStudyExport,
} from "@/lib/dojo/topicStudy";

export const dynamic = "force-dynamic";

type ImportResult = {
  key: string;
  expression: string;
  result: "created" | "existing";
};

function integrationEndpoint(): URL | null {
  const base = process.env.VOCABFORGE_INTEGRATION_URL?.trim();
  if (!base) return null;
  try {
    return new URL("/api/integrations/lumen/import", base);
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const endpoint = integrationEndpoint();
    const secret = process.env.LUMEN_VOCABFORGE_SYNC_SECRET?.trim();
    if (!endpoint || !secret) {
      return NextResponse.json({ error: "VocabForge 串接尚未完成 Railway 設定" }, { status: 503 });
    }
    const body = await req.json();
    const id = typeof body.id === "string" ? body.id.trim().slice(0, 80) : "";
    const requestedKeys = Array.isArray(body.keys)
      ? [...new Set(body.keys.filter((key: unknown): key is string => typeof key === "string" && Boolean(key.trim())).map((key: string) => key.trim()))]
      : [];
    if (!id) return NextResponse.json({ error: "找不到這次主題修習" }, { status: 400 });
    if (!requestedKeys.length || requestedKeys.length > 3) {
      return NextResponse.json({ error: "每次請選擇 1–3 個真正想留下的表達" }, { status: 400 });
    }

    const title = topicStudyRecordTitle(id);
    const row = await readJsonRecord(title);
    if (!row) return NextResponse.json({ error: "找不到這次主題修習" }, { status: 404 });
    const round = normalizeTopicStudyRound(row.value);
    if (!round) return NextResponse.json({ error: "主題修習內容無法讀取" }, { status: 409 });
    const candidates = topicStudyCandidates(round);
    const selected = requestedKeys.flatMap((key) => candidates.find((candidate) => candidate.key === key) ?? []);
    if (selected.length !== requestedKeys.length) {
      return NextResponse.json({ error: "候選表達已變更，請重新整理後再送出" }, { status: 409 });
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${secret}`,
      },
      body: JSON.stringify({
        sourceSystem: "Lumen Dojo",
        sourceType: "課堂主題",
        sourcePlatform: "VoiceTube",
        sourceDate: round.classDate,
        sourceRecordId: title,
        topicTitle: round.topicTitle,
        videoTitle: round.videoTitle,
        videoUrl: round.videoUrl,
        vocabBook: "課堂主題",
        items: selected,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    const result = await response.json().catch(() => ({})) as { error?: string; items?: ImportResult[] };
    if (!response.ok) {
      return NextResponse.json({ error: result.error ?? `VocabForge 接收失敗（${response.status}）` }, { status: 502 });
    }
    const imported = Array.isArray(result.items) ? result.items : [];
    const now = new Date().toISOString();
    const updates: TopicStudyExport[] = imported.flatMap((item) => {
      const candidate = selected.find((entry) => entry.key === item.key);
      if (!candidate || (item.result !== "created" && item.result !== "existing")) return [];
      return [{ key: candidate.key, expression: candidate.expression, result: item.result, syncedAt: now }];
    });
    if (updates.length !== selected.length) {
      return NextResponse.json({ error: "VocabForge 回傳的接收結果不完整" }, { status: 502 });
    }
    const byKey = new Map(round.vocabForgeExports.map((item) => [item.key, item]));
    updates.forEach((item) => byKey.set(item.key, item));
    const updated = { ...round, vocabForgeExports: [...byKey.values()], updatedAt: now };
    await upsertJsonRecord(title, updated);
    return NextResponse.json({
      ok: true,
      round: updated,
      created: updates.filter((item) => item.result === "created").length,
      existing: updates.filter((item) => item.result === "existing").length,
    });
  } catch (error) {
    const message = error instanceof Error && error.name === "TimeoutError"
      ? "VocabForge 回應逾時，請稍後再試"
      : error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
