/**
 * 道藏的長期問題：一個反覆回來想的問題、「我現在怎麼看」的理解版本、連結的來源，以及它的去處。
 * 純函式，伺服器與畫面共用。理解只能由本人寫下或採用本人原話；GPT 的推論不進理解。
 */

export const DAO_QUESTION_TITLE_PREFIX = "行光道藏問題-";
export const DAO_FORMAT = "道藏理解/v1";
export const DAO_TEXT_MAX = 4000;
export const DAO_SOURCES_MAX = 60;

export type DaoVersion = { n: number; text: string; note: string; from: string; at: string };
export type DaoShuttleLink = { id: string; title: string };
export type DaoKnowledgeLink = { claimId: string; statement: string };
export type DaoQuestion = {
  version: 1;
  recordType: "dao-question";
  id: string;
  title: string;
  archived: boolean;
  versions: DaoVersion[];
  /** Card ids as the studio's card list names them, e.g. insight:…, manual:…, awareness:…. */
  sources: string[];
  shuttles: DaoShuttleLink[];
  knowledge: DaoKnowledgeLink | null;
  createdAt: string;
  updatedAt: string;
};

/** A source as the studio's card list serves it (lib/dojo/weavingStudio/catalog.ts). */
export type DaoSource = {
  id: string; title: string; type: string; idea: string; quote: string; source: string; location: string;
  author: string; quoteLabel: string; url: string; basis?: string;
};

const text = (value: unknown, max = DAO_TEXT_MAX) => typeof value === "string" ? value.trim().slice(0, max) : "";
const isoOr = (value: unknown, fallback: string) =>
  typeof value === "string" && !Number.isNaN(Date.parse(value)) ? new Date(value).toISOString() : fallback;

export function newDaoQuestionId(now = new Date(), random = Math.random): string {
  const day = now.toISOString().slice(0, 10).replace(/-/g, "");
  const tail = Array.from({ length: 4 }, () => "0123456789ABCDEFGHJKLMNPQRSTUVWXYZ"[Math.floor(random() * 34)]).join("");
  return `DQ-${day}-${tail}`;
}
export const isDaoQuestionId = (value: string) => /^DQ-\d{8}-[0-9A-Z]{4}$/.test(value);
export const isDaoSourceId = (value: string) => /^[a-z]+:[^\s]{1,280}$/.test(value);

export function normalizeDaoQuestion(value: unknown): DaoQuestion | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (raw.recordType !== "dao-question" || typeof raw.id !== "string" || !isDaoQuestionId(raw.id)) return null;
  const now = new Date().toISOString();
  const createdAt = isoOr(raw.createdAt, now);
  const versions = (Array.isArray(raw.versions) ? raw.versions : []).flatMap((item, index): DaoVersion[] => {
    if (!item || typeof item !== "object") return [];
    const v = item as Record<string, unknown>;
    const body = text(v.text);
    return body ? [{ n: index + 1, text: body, note: text(v.note), from: text(v.from, 200) || "本人寫下", at: isoOr(v.at, createdAt) }] : [];
  });
  const sources = [...new Set((Array.isArray(raw.sources) ? raw.sources : []).filter((s): s is string => typeof s === "string" && isDaoSourceId(s)))].slice(0, DAO_SOURCES_MAX);
  const shuttles = (Array.isArray(raw.shuttles) ? raw.shuttles : []).flatMap((item): DaoShuttleLink[] => {
    if (!item || typeof item !== "object") return [];
    const s = item as Record<string, unknown>;
    const id = text(s.id, 120);
    return id ? [{ id, title: text(s.title, 300) }] : [];
  });
  const k = raw.knowledge && typeof raw.knowledge === "object" ? raw.knowledge as Record<string, unknown> : null;
  const knowledge = k && text(k.claimId, 200) ? { claimId: text(k.claimId, 200), statement: text(k.statement) } : null;
  const title = text(raw.title, 500);
  if (!title) return null;
  return {
    version: 1, recordType: "dao-question", id: raw.id, title, archived: raw.archived === true,
    versions, sources, shuttles, knowledge, createdAt, updatedAt: isoOr(raw.updatedAt, createdAt),
  };
}

export function newDaoQuestion(input: { id: string; title: string; understanding?: string; sources?: string[]; now: string }): DaoQuestion {
  const q: DaoQuestion = {
    version: 1, recordType: "dao-question", id: input.id, title: text(input.title, 500), archived: false,
    versions: [], sources: [], shuttles: [], knowledge: null, createdAt: input.now, updatedAt: input.now,
  };
  const first = text(input.understanding);
  if (first) q.versions.push({ n: 1, text: first, note: "", from: "本人寫下", at: input.now });
  return withSources(q, input.sources ?? [], input.now);
}

export function withVersion(q: DaoQuestion, input: { text: string; note?: string; from?: string }, now: string): DaoQuestion {
  const body = text(input.text);
  if (!body) return q;
  return { ...q, updatedAt: now, versions: [...q.versions, { n: q.versions.length + 1, text: body, note: text(input.note), from: text(input.from, 200) || "本人寫下", at: now }] };
}
export function withSources(q: DaoQuestion, ids: string[], now: string): DaoQuestion {
  const next = [...new Set([...q.sources, ...ids.filter(isDaoSourceId)])].slice(0, DAO_SOURCES_MAX);
  return { ...q, sources: next, updatedAt: now };
}
export function withoutSource(q: DaoQuestion, id: string, now: string): DaoQuestion {
  return { ...q, sources: q.sources.filter((s) => s !== id), updatedAt: now };
}
export function withShuttle(q: DaoQuestion, link: DaoShuttleLink, now: string): DaoQuestion {
  if (q.shuttles.some((s) => s.id === link.id)) return q;
  return { ...q, shuttles: [...q.shuttles, { id: text(link.id, 120), title: text(link.title, 300) }], updatedAt: now };
}
export const latestUnderstanding = (q: DaoQuestion) => q.versions[q.versions.length - 1] ?? null;

/* ---------- 和 GPT 接著想 ---------- */

export const DAO_METHODS = {
  ask: { name: "先問我，一次一題", lines: ["一次只問我一題，等我回答後才問下一題。", "每一題都引用一段來源（S 編號）並寫出它的出處與由來，再問我現在怎麼看。"] },
  buddy: { name: "讀書搭子：不同來源怎麼回答這個問題", lines: ["逐段說出每個來源各自怎麼回答這個長期問題，引用原文並附出處與由來；不同來源並列，不要混成一個說法。", "在我說出「我在意的是哪一點」之前，先求看懂，不評論、不下結論。"] },
  layers: { name: "拆書計畫：往下三層問", lines: ["依序往下三層問：表面（來源說了什麼）、機制（為什麼會這樣）、更深一層（這對我意味著什麼）。每一層先引用一段來源再提問。", "最後一題必須是只有用我自己的經驗才能回答的問題。"] },
} as const;
export type DaoMethod = keyof typeof DAO_METHODS;

/** One source as GPT receives it: its words, where it is from, and how it came about. */
export function daoSourceLines(s: DaoSource, index: number): string[] {
  const own = !/GPT/.test(s.author), mine = s.quoteLabel === "我的原話", where = [s.source, s.location].filter(Boolean).join(" · ");
  const lines = [`S${index + 1}｜${s.type}${own ? "" : "｜GPT 延伸，我尚未確認"}｜${s.idea || s.title}`];
  if (mine && s.quote && s.quote !== s.idea) lines.push(`我的原話：${s.quote}`);
  lines.push(`出處：${where || "未記載"}${s.author ? `（${s.author}）` : ""}`);
  if (s.basis) lines.push(`由來：我回應這段原文時說的——${s.basis}`);
  else if (!own && s.quote) lines.push(`由來：這是 GPT 在討論中說的，不是我的話——「${s.quote}」`);
  else if (!mine && s.quote && s.quote !== s.idea) lines.push(`由來：我讀到這段${s.quoteLabel || "原文"}時留下的——「${s.quote}」${where ? `（${where}）` : ""}`);
  else if (where) lines.push(`由來：${where}`);
  return lines;
}

export function buildDaoPackage(q: DaoQuestion, sources: DaoSource[], method: DaoMethod): string {
  const L = [`【道藏討論包｜${DAO_FORMAT}】`, `問題編號：${q.id}`, `長期問題：${q.title}`, "", "【我目前的理解】"];
  if (!q.versions.length) L.push("（還沒寫下）");
  for (const v of q.versions) L.push(`第 ${v.n} 次（${v.at.slice(0, 10)}，${v.from}）：${v.text}${v.note ? `｜當時的心得：${v.note}` : ""}`);
  L.push("", "【有關的來源】引用時一律寫出編號、出處與由來，照記載抄寫，不得省略或改寫。");
  if (!sources.length) L.push("（還沒有連結來源）");
  sources.forEach((s, i) => L.push("", ...daoSourceLines(s, i)));
  L.push("", `【這輪的問法：${DAO_METHODS[method].name}】`, ...DAO_METHODS[method].lines.map((l) => `- ${l}`));
  L.push("", "【規則】",
    "- 這是在幫我更新「我現在怎麼看」。只有我用自己的話說出的理解，才可以成為候選理解；候選理解只能由我說過的話組成。",
    "- 引用我的話必須逐字，不要替我換句話說。",
    "- 你自己的推論另外列在「GPT 的推論」，並標示「尚未由本人確認」。",
    "- 不替我下結論，也不判斷我的理解對不對。",
    "- 我說「可以收尾」時，才依下面的格式輸出。", "",
    "【回傳格式】整段放在一個程式碼區塊裡，標記行照抄。",
    `===${DAO_FORMAT}===`, `問題編號：${q.id}`, "===我說過的話===", "T2｜（逐字）", "===候選理解===", "#1｜用到 T2,T4｜（只用我說過的話組成的一句）",
    "===這次為什麼改變===", "- （我說過的、關於理解為什麼變了的話，逐字）", "===GPT 的推論===", "- （尚未由本人確認）", "===結束===");
  return L.join("\n");
}

export type DaoReturn = {
  id: string;
  said: { n: number; text: string }[];
  candidates: { n: number; uses: string; text: string }[];
  why: string[];
  gpt: string[];
};
export function parseDaoReturn(raw: string): DaoReturn {
  const out: DaoReturn = { id: "", said: [], candidates: [], why: [], gpt: [] };
  let section = "";
  for (const line of String(raw || "").replace(/\r/g, "").split("\n")) {
    if (/^\s*```/.test(line)) continue;
    const mark = line.match(/^\s*=+\s*(.+?)\s*=+\s*$/);
    if (mark) { section = mark[1].replace(/\s+/g, ""); continue; }
    const body = line.trim();
    if (!body || body === "無") continue;
    const id = body.match(/^問題編號\s*[：:]\s*(\S+)/);
    if (id) { out.id = id[1]; continue; }
    if (section === "我說過的話") {
      const m = body.match(/^T(\d+)\s*[｜|]\s*(.+)$/);
      if (m) out.said.push({ n: Number(m[1]), text: m[2].trim() });
    } else if (section === "候選理解") {
      const m = body.match(/^#\s*(\d+)\s*[｜|]\s*(?:用到\s*([^｜|]*)[｜|])?\s*(.+)$/);
      if (m) out.candidates.push({ n: Number(m[1]), uses: (m[2] ?? "").trim(), text: m[3].trim() });
    } else if (section === "這次為什麼改變") out.why.push(body.replace(/^[-・•]\s*/, ""));
    else if (section === "GPT的推論") out.gpt.push(body.replace(/^[-・•]\s*/, ""));
  }
  return out;
}

/** A candidate is the owner's own only when every piece of it appears in what she said. */
export function daoCandidateIsOwn(candidate: string, said: { text: string }[]): boolean {
  const all = said.map((s) => s.text).join("").replace(/[\s，。、！？；：「」『』]/g, "");
  const parts = candidate.split(/[，。、！？；：\s]+/).map((p) => p.replace(/[「」『』]/g, "")).filter((p) => p.length > 1);
  return parts.length > 0 && parts.every((p) => all.includes(p));
}

/* ---------- 心智圖 ---------- */

export function daoMindmapMarkdown(questions: DaoQuestion[], sources: Map<string, DaoSource>): string {
  const L = ["# 道藏"];
  for (const q of questions) {
    const v = latestUnderstanding(q);
    L.push("", `## ${q.title}`);
    if (v) L.push("### 我現在怎麼看", `- ${v.text}`);
    if (q.versions.length > 1) { L.push("### 理解的變化"); q.versions.slice(0, -1).forEach((x) => L.push(`- 第 ${x.n} 次：${x.text}`)); }
    const found = q.sources.map((id) => sources.get(id)).filter((s): s is DaoSource => Boolean(s));
    if (found.length) { L.push("### 來源"); found.forEach((s) => L.push(`- 【${daoSourceKind(s)}】${s.idea || s.title}（${[s.source, s.location].filter(Boolean).join(" · ")}）`)); }
    if (q.shuttles.length || q.knowledge) {
      L.push("### 去處");
      q.shuttles.forEach((s) => L.push(`- 織光杼：${s.title}`));
      if (q.knowledge) L.push(`- 知識：${q.knowledge.statement}`);
    }
  }
  return L.join("\n");
}

/** The field a card came from, by its id. */
export function daoSourceKind(s: Pick<DaoSource, "id" | "source">): string {
  if (s.id.startsWith("awareness:")) return "覺察";
  if (s.id.startsWith("interview:") || s.source === "野採淬鍊" || s.source === "野採") return "野採";
  return "閱讀";
}
