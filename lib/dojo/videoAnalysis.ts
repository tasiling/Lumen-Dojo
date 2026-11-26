// 畫面與節奏分析：資料格式、讀畫面的指令、節奏的計算、核對後併入原文與存成手法觀察卡的規則。
// 純規則，不讀寫任何資料。切點與時間由 Mac 用 FFmpeg 量出（確定值）；畫面內容與手法由 AI 看關鍵畫面描述（需核對）。

export type AnalysisFrame = { t: number; shot: number };

export type AnalysisShot = {
  index: number;
  start: number;
  end: number;
  /** What the frames show. */
  picture: string;
  /** Camera: push in, pull out, pan, rotate, static. */
  camera: string;
  /** How elements move or change inside the shot. */
  motion: string;
  /** How this shot begins: cut, wipe, zoom, morph… */
  transition: string;
  /** On-screen text, verbatim. */
  text: string;
};

export type AnalysisTechnique = {
  name: string;
  how: string;
  shots: number[];
  /** "visible" when the frames show it; "inferred" when it is read from the frames before and after. */
  basis: "visible" | "inferred";
  /** The 手法觀察 card saved from this technique, if any. */
  cardId?: string;
};

export type VideoAnalysis = {
  state: "queued" | "working" | "reading" | "ready" | "failed";
  requestedAt: string;
  duration: number;
  /** Cut times in seconds, measured on the Mac. */
  cuts: number[];
  shots: AnalysisShot[];
  rhythm: string;
  techniques: AnalysisTechnique[];
  uncertain: string;
  /** Only a confirmed analysis joins the original used for 淬鍊. */
  confirmed: boolean;
  readAt: string | null;
  model: string;
  estimatedCostUsd: number;
  error: string;
};

export const MAX_FRAMES = 48;
export const MAX_SHOTS = 60;

const round = (value: number) => Math.round(value * 100) / 100;

/** Shot boundaries from the measured cuts. Deterministic: the same video always gives the same shots. */
export function shotRanges(duration: number, cuts: number[]): { index: number; start: number; end: number }[] {
  const points = [...new Set(cuts.filter((t) => Number.isFinite(t) && t > 0.05 && t < duration - 0.05).map(round))].sort((a, b) => a - b);
  const edges = [0, ...points, round(duration)];
  return edges.slice(0, -1).map((start, position) => ({ index: position + 1, start, end: edges[position + 1] })).slice(0, MAX_SHOTS);
}

/** Facts about the cutting rhythm, computed from the cuts alone (no AI). */
export function rhythmFacts(duration: number, cuts: number[]) {
  const shots = shotRanges(duration, cuts);
  const lengths = shots.map((shot) => round(shot.end - shot.start));
  const fastest = shots.reduce<{ start: number; end: number; count: number } | null>((best, shot) => {
    const window = shots.filter((other) => other.start >= shot.start && other.start < shot.start + 3);
    const span = { start: shot.start, end: round(Math.min(duration, shot.start + 3)), count: window.length };
    return !best || span.count > best.count ? span : best;
  }, null);
  return {
    shotCount: shots.length,
    shortest: lengths.length ? Math.min(...lengths) : 0,
    longest: lengths.length ? Math.max(...lengths) : 0,
    lengths,
    /** The three seconds with the most cuts. */
    fastest: fastest && fastest.count > 1 ? fastest : null,
  };
}

export const ANALYSIS_PROMPT = [
  "你要分析一支短影音（多為小動畫）的畫面與節奏，目的是讓創作者學會它的手法。",
  "下面提供：影片長度、用 FFmpeg 量出的鏡頭切點（確定值），以及每個鏡頭的關鍵畫面，每張畫面標有時間與所屬鏡頭。",
  "規則：",
  "- 只描述畫面裡看得到的東西；兩張畫面之間的動作是從前後畫面推測的，要寫明「依前後畫面推測」。",
  "- 鏡頭的時間一律使用提供的切點，不要自己改。",
  "- camera 寫鏡頭怎麼動：推近、拉遠、平移、旋轉、固定；motion 寫畫面中的元素怎麼進場、變形、退場；transition 寫這個鏡頭怎麼開始（直切、縮放轉場、滑入、變形接續等）。",
  "- text 逐字抄錄畫面上的文字，沒有就留空。",
  "- rhythm 用三到五句說明節奏：哪裡快切、哪裡停留、快慢怎麼交替。沒有提供聲音，不要推測音樂拍點。",
  "- techniques 列出三到八個值得學的手法：name 用一句話命名，how 說明怎麼做到、要注意什麼，shots 列出出現的鏡頭編號，basis 寫 visible 或 inferred。",
  "- uncertain 寫出看不清楚或無法判斷的地方。",
  "- 使用繁體中文。",
].join("\n");

export function analysisSchema(shotCount: number) {
  const shot = {
    type: "object", additionalProperties: false, required: ["index", "picture", "camera", "motion", "transition", "text"],
    properties: { index: { type: "integer" }, picture: { type: "string" }, camera: { type: "string" }, motion: { type: "string" }, transition: { type: "string" }, text: { type: "string" } },
  };
  return {
    type: "object", additionalProperties: false, required: ["shots", "rhythm", "techniques", "uncertain"],
    properties: {
      shots: { type: "array", minItems: shotCount, maxItems: shotCount, items: shot },
      rhythm: { type: "string" },
      techniques: { type: "array", minItems: 1, maxItems: 8, items: {
        type: "object", additionalProperties: false, required: ["name", "how", "shots", "basis"],
        properties: { name: { type: "string" }, how: { type: "string" }, shots: { type: "array", items: { type: "integer" } }, basis: { type: "string", enum: ["visible", "inferred"] } },
      } },
      uncertain: { type: "string" },
    },
  } as const;
}

/** The measured timeline, given to the model before the frames. */
export function timelineText(duration: number, cuts: number[]): string {
  const shots = shotRanges(duration, cuts);
  const timeline = shots.length > 1 ? shots.map((shot) => `鏡頭 ${shot.index}｜${shot.start}–${shot.end}`).join("；") : "無切點，整支是一個鏡頭（鏡頭 1）";
  return [`影片長度：${round(duration)} 秒`, "鏡頭切點（秒）：" + timeline].join("\n");
}

const text = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";

/** Joins the model's description onto the measured shots. Throws when a shot is missing. */
export function analysisFromResult(result: unknown, duration: number, cuts: number[]): Pick<VideoAnalysis, "shots" | "rhythm" | "techniques" | "uncertain"> {
  const raw = result && typeof result === "object" ? result as Record<string, unknown> : {};
  const rows = Array.isArray(raw.shots) ? raw.shots as Record<string, unknown>[] : [];
  const ranges = shotRanges(duration, cuts);
  const shots = ranges.map((range) => {
    const row = rows.find((item) => item && item.index === range.index);
    if (!row) throw new Error(`鏡頭 ${range.index} 沒有分析結果，請重新分析。`);
    return { ...range, picture: text(row.picture, 600), camera: text(row.camera, 200), motion: text(row.motion, 600), transition: text(row.transition, 200), text: text(row.text, 600) };
  });
  const techniques = (Array.isArray(raw.techniques) ? raw.techniques as Record<string, unknown>[] : []).flatMap((item) => {
    const name = text(item?.name, 120);
    if (!name) return [];
    return [{
      name, how: text(item.how, 1200),
      shots: Array.isArray(item.shots) ? [...new Set(item.shots.filter((n): n is number => Number.isSafeInteger(n) && n >= 1 && n <= ranges.length))] : [],
      basis: item.basis === "visible" ? "visible" as const : "inferred" as const,
    }];
  }).slice(0, 8);
  return { shots, rhythm: text(raw.rhythm, 1500), techniques, uncertain: text(raw.uncertain, 1000) };
}

export function normalizeVideoAnalysis(value: unknown): VideoAnalysis | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Partial<VideoAnalysis>;
  const state = (["queued", "working", "reading", "ready", "failed"] as const).find((item) => item === raw.state) ?? "failed";
  const duration = Number.isFinite(raw.duration) ? Math.max(0, Number(raw.duration)) : 0;
  const cuts = Array.isArray(raw.cuts) ? raw.cuts.filter((t): t is number => Number.isFinite(t)).slice(0, MAX_SHOTS) : [];
  const shots = Array.isArray(raw.shots) ? raw.shots.flatMap((shot) => shot && typeof shot === "object" && Number.isSafeInteger(shot.index) ? [{
    index: shot.index, start: Number(shot.start) || 0, end: Number(shot.end) || 0, picture: text(shot.picture, 600), camera: text(shot.camera, 200),
    motion: text(shot.motion, 600), transition: text(shot.transition, 200), text: text(shot.text, 600),
  }] : []).slice(0, MAX_SHOTS) : [];
  const techniques = Array.isArray(raw.techniques) ? raw.techniques.flatMap((item) => item && typeof item === "object" && text(item.name, 120) ? [{
    name: text(item.name, 120), how: text(item.how, 1200),
    shots: Array.isArray(item.shots) ? item.shots.filter((n): n is number => Number.isSafeInteger(n)) : [],
    basis: item.basis === "visible" ? "visible" as const : "inferred" as const,
    ...(text(item.cardId, 100) ? { cardId: text(item.cardId, 100) } : {}),
  }] : []).slice(0, 8) : [];
  return {
    state, requestedAt: text(raw.requestedAt, 40), duration, cuts, shots, rhythm: text(raw.rhythm, 1500), techniques,
    uncertain: text(raw.uncertain, 1000), confirmed: raw.confirmed === true && state === "ready" && shots.length > 0,
    readAt: text(raw.readAt, 40) || null, model: text(raw.model, 80),
    estimatedCostUsd: Number.isFinite(raw.estimatedCostUsd) ? Math.max(0, Number(raw.estimatedCostUsd)) : 0, error: text(raw.error, 1000),
  };
}

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(1).padStart(4, "0")}`;

/** The confirmed storyboard as it joins the original: one paragraph per shot, then the rhythm. */
export function analysisForOriginal(analysis: VideoAnalysis | undefined): string {
  if (!analysis?.confirmed) return "";
  const shots = analysis.shots.map((shot) => [
    `鏡頭 ${shot.index}（${clock(shot.start)}–${clock(shot.end)}）`,
    shot.picture && `畫面：${shot.picture}`, shot.camera && `鏡頭：${shot.camera}`, shot.motion && `動作：${shot.motion}`,
    shot.transition && `轉場：${shot.transition}`, shot.text && `字幕：${shot.text}`,
  ].filter(Boolean).join("｜"));
  return [...shots, analysis.rhythm && `節奏：${analysis.rhythm.replace(/\s*\n\s*/g, " ")}`].filter(Boolean).join("\n");
}

/** What a 手法觀察 card saved from one technique carries. The owner's own words are required. */
export function techniqueCard(analysis: VideoAnalysis, index: number, input: { title: string; words: string }, captureId: string) {
  const technique = analysis.techniques[index];
  if (!technique) return "找不到這個手法。";
  const words = input.words.trim();
  if (!words) return "請用自己的話寫下想學的是什麼，這會成為卡片的「我的原話」。";
  const title = input.title.trim() || technique.name;
  const shots = technique.shots.map((n) => analysis.shots.find((shot) => shot.index === n)).filter((shot) => shot !== undefined);
  const quote = [
    `AI 畫面分析（${technique.basis === "visible" ? "畫面可見" : "依前後畫面推測"}）：${technique.name}——${technique.how}`,
    ...shots.map((shot) => `鏡頭 ${shot.index}（${clock(shot.start)}–${clock(shot.end)}）${shot.picture}`),
  ].join("\n").slice(0, 1900);
  return {
    title: title.slice(0, 120), words: words.slice(0, 1900), titleOrigin: title === technique.name ? "整理版" : "改寫",
    cardType: "手法觀察", quote, discussion: `影片分析 ${captureId} #${index + 1}`, captureIds: [captureId],
  };
}
