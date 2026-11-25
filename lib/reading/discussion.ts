export const DISCUSSION_FORMAT = "心知閱讀討論/v1";
export const DISCUSSION_SCOPES = { both: "原文與我的想法", excerpt: "只帶原文", reflection: "只帶我的想法" } as const;
export type DiscussionScope = keyof typeof DISCUSSION_SCOPES;
export type DiscussionSource = {
  bookId: string;
  bookTitle: string;
  readCount: number;
  noteId: string;
  label: string;
  locator: string;
  readingQuestion: string;
  excerpt: string;
  reflection: string;
  /** 對照的另一則筆記：S2 是它的作者原文，N2 是我對它的想法。 */
  compare?: { noteId: string; label: string; locator: string; excerpt: string; reflection: string;
    /** 對照段來自另一本書時才有。 */
    bookId?: string; bookTitle?: string; readCount?: number };
};

/** 這輪的讀法。每一種只改變 GPT 怎麼出題，觀點仍然只出自本人。 */
export const READING_METHODS = {
  open: { name: "一般討論", from: "", hint: "依選段自然討論，沒有指定讀法。", compare: "none", lines: [] },
  buddy: {
    name: "看懂作者在說什麼", from: "讀書搭子", hint: "先求看懂，再談同不同意。可以加一則對照的筆記，看兩段各自怎麼回答同一個問題。", compare: "optional",
    lines: [
      "依序圍繞四件事出題：作者在談什麼、他是怎麼說的、他說得有沒有道理、這和我有什麼關係。",
      "在我表示已經看懂之前，不要請我評論或批評，也不要替我下結論。",
      "有對照的筆記時，先和我定出一個兩段都在回答的共同問題，再問我兩段各自怎麼回答；兩邊並列，不要混成一個說法。",
    ],
  },
  layers: {
    name: "往下三層，問回我的經驗", from: "拆書計畫", hint: "從表面論點往下問到背後機制，最後一題只有我的經驗能回答。", compare: "none",
    lines: [
      "依序往下三層出題：表面論點（這段說了什麼）、背後機制（為什麼會這樣）、更深一層（這對我意味著什麼）。",
      "每一層先逐字引用一句原文再提問。",
      "每一題要有摩擦力：拿我的說法和原文之間的落差來追問，不要只請我補充。",
      "最後一題必須是只有用我自己的經驗才能回答的問題。",
    ],
  },
  distill: {
    name: "兩段摘錄是互補還是分歧", from: "書籍深度蒸餾", hint: "需要再選一則對照的筆記。辨別兩段是互補、真正的分歧，還是證據不足。", compare: "required",
    lines: [
      "這輪只處理一件事：S 與 S2 兩段原文的關係是互補、分歧，還是證據不足。",
      "先問我怎麼看這兩段的關係，等我回答後才提出你的看法；你的看法要寫明「這是 GPT 的推論，尚未確認」。",
      "每次比較都要逐字引用兩邊的原句並寫出各自的位置，不要把兩邊合成一個結論。",
      "談到分歧時，問我分歧落在哪一點、各自在什麼情況下成立；不要替我決定誰對。",
    ],
  },
  bounds: {
    name: "檢查論點的適用界線", from: "書籍百維拆解術", hint: "一次一個切入點，找出這個說法在什麼條件下成立、什麼條件下不成立。", compare: "none",
    lines: [
      "每一題只針對一句原文，並且只用一個切入點。輪流使用：他沒說出口的前提、他刻意沒談的部分、這個說法在什麼條件下才成立、在什麼條件下不成立、最強的反方會怎麼說。",
      "反方的說法是你提出的假設，要標明「這是 GPT 提出的反方，不是作者也不是我的話」。",
      "收斂前請我用自己的話說出這個論點的適用界線；候選只能用我說過的界線。",
    ],
  },
  action: {
    name: "做成一個行動實驗", from: "把好書變成 AI 外腦", hint: "把讀到的想法變成一個我會去做或去觀察的小實驗。", compare: "none",
    lines: [
      "這輪的目標是把選段裡的一個想法做成我自己的行動實驗。",
      "依序問我四件事：我會在什麼情境用上它、我具體要做或觀察什麼、我怎麼知道有沒有看到結果、我打算什麼時候回來看。",
      "四件事都由我說出，你只追問到夠具體，不要替我設計實驗或補上我沒說的步驟。",
      "收尾時候選使用「洞察卡」類型，「行動」欄只填我說過的實驗內容。",
    ],
  },
} as const satisfies Record<string, { name: string; from: string; hint: string; compare: "none" | "optional" | "required"; lines: readonly string[] }>;
export type ReadingMethodKey = keyof typeof READING_METHODS;
export const isReadingMethod = (value: unknown): value is ReadingMethodKey => typeof value === "string" && Object.hasOwn(READING_METHODS, value);
export function methodLabel(key: ReadingMethodKey | undefined) {
  const method = READING_METHODS[key ?? "open"];
  return method.from ? method.from + "｜" + method.name : method.name;
}
export type DiscussionTurn = { role: "我" | "GPT"; text: string };
export type DiscussionResult = {
  type: "觀點" | "洞察卡";
  text: string;
  action: string;
  anchor: string;
  quote: string;
};
export type DiscussionCandidate = DiscussionResult & {
  id: string;
  state: "pending" | "confirmed" | "skipped";
  evidenceError?: string;
  cardId?: string;
};
export type DiscussionReturn = {
  status: "暫存" | "完成";
  turns: DiscussionTurn[];
  next: string;
  candidates: DiscussionCandidate[];
};
export type DiscussionRound = {
  archiveId?: string;
  id: string;
  source: DiscussionSource;
  starter: "gpt" | "me";
  /** 沒有這個欄位的舊輪次就是一般討論。 */
  method?: ReadingMethodKey;
  question: string;
  createdAt: string;
  savedAt?: string;
  result?: DiscussionReturn;
};
export type ReadingDiscussion = {
  id: string;
  scope: DiscussionScope;
  rounds: DiscussionRound[];
};
export type DiscussionShortcut = { bookId: string; discussionId: string; roundId: string };
export type DiscussionSummary = {
  archivesUnavailable?: boolean;
  resume: (DiscussionShortcut & { bookTitle: string; noteLabel: string; next: string }) | null;
  pending: (DiscussionShortcut & { bookTitle: string; noteLabel: string; count: number })[];
};

export const CONVERGENCE_GUIDE = [
  "每次我說完，回到這輪想釐清的問題。從整輪我的發言判斷。當我已用自己的話回答，而且給過一個理由、例子、區別、適用界線或尚待查證之處，就主動收斂。這些線索擇一就夠，依內容判斷。書摘、你舉的例子或我簡短附和的話，單獨都不足以代表我的理解。",
  "若我還有直接影響原問題的疑問，一次只補一個關鍵點。若再問只會重複，或會另開未要求的新題，就停下追問。即使還沒有定論，也可以小結已釐清的部分並標出待查處。",
  "收斂時先用一兩句話保留我的理解與用詞。接著只問「這輪可以整理成完成卡嗎？」等我同意後直接出卡。若我想再談，就接我指定的一點。我可隨時說「整理這次討論」或「先暫存」，此時直接給相應的卡。",
].join("\n\n");

function cardShape(discussion: ReadingDiscussion, round: DiscussionRound, status: DiscussionReturn["status"]) {
  return {
    格式: DISCUSSION_FORMAT,
    討論ID: discussion.id,
    討論包ID: round.id,
    選段ID: round.source.noteId,
    帶入範圍: discussion.scope,
    狀態: status,
    問答: [],
    下次從這裡: "",
    候選: [],
  };
}

export function returnInstructions(discussion: ReadingDiscussion, round: DiscussionRound, status: DiscussionReturn["status"]) {
  return [
    status === "完成" ? "請整理這次討論，輸出完成卡，讓我挑選觀點與洞察卡。" : "請整理成暫存卡，讓我下次接著談。",
    "只輸出一個有效的 JSON 物件，沿用三個識別碼及帶入範圍。",
    JSON.stringify(cardShape(discussion, round, status), null, 2),
    '「問答」按順序寫本輪逐字發言，每則為 {"角色":"我","內容":"..."} 或 {"角色":"GPT","內容":"..."}。不要抄入舊輪、討論包、收尾指令或補寫我沒說過的話。依順序編號 T1、T2 等。',
    status === "暫存"
      ? "「下次從這裡」寫一個具體的續談點，候選留空。"
      : '候選可留空。每項用 {"類型":"觀點","內容":"...","依據":"T2","依據原句":"...","行動":""}。類型也可為「洞察卡」。依據使用本輪 T 編號，或確實帶入的 S（作者原文）、N（我的筆記）' + (round.source.compare ? "、S2（對照的作者原文）、N2（我對對照段的想法）" : "") + '。逐字引用原句。GPT 的提議和作者原文各用自己的來源。本人同意收尾只表示可以整理。洞察卡可帶一項本人願意觀察或執行的行動。',
    "輸出前核對引號和換行的 JSON 跳脫。",
  ].join("\n\n");
}

export function discussionPrompt(discussion: ReadingDiscussion, round: DiscussionRound) {
  const { source } = round;
  const method = READING_METHODS[round.method ?? "open"];
  const priorIndex = discussion.rounds.findIndex(item => item.id === round.id) - 1;
  const previous = discussion.rounds[priorIndex]?.result;
  return [
    "【心知｜本次閱讀討論包】",
    [source.bookTitle, "第 " + source.readCount + " 次閱讀", source.locator, source.label].filter(Boolean).join(" · "),
    source.readingQuestion && "讀前問題　" + source.readingQuestion,
    source.excerpt && "【S｜作者原文】\n" + source.excerpt,
    source.reflection && "【N｜我當時的想法】\n" + source.reflection,
    source.compare && [
      "【對照的另一則筆記】" + [source.compare.bookTitle && "另一本書《" + source.compare.bookTitle + "》", source.compare.bookTitle && source.compare.readCount && "第 " + source.compare.readCount + " 次閱讀",
        source.compare.locator, source.compare.label].filter(Boolean).join(" · "),
      source.compare.bookTitle && "S、N 出自《" + source.bookTitle + "》，S2、N2 出自《" + source.compare.bookTitle + "》。引用時寫明是哪一本書，兩位作者的說法不要混在一起。",
      source.compare.excerpt && "【S2｜對照的作者原文】\n" + source.compare.excerpt,
      source.compare.reflection && "【N2｜我對這段的想法】\n" + source.compare.reflection,
    ].filter(Boolean).join("\n\n"),
    "用繁體中文，依選段討論。分清作者原文、我的說法和你的推論。依實際看到的材料作答；缺少的資料列為待查。一次談一個重點。",
    method.lines.length > 0 && ["【本輪的讀法：" + method.name + "（方法：" + method.from + "）】", ...method.lines.map(line => "- " + line),
      "- 引用原文一律逐字，並寫出它的位置；我的話照我說的引用，不要替我換句話說。"].join("\n"),
    "【何時主動收斂】\n" + CONVERGENCE_GUIDE,
    previous?.status === "暫存" && [
      "【接續上次｜舊輪次供回顧】",
      ...previous.turns.slice(-12).map(turn => turn.role + "　" + turn.text),
      "下次從這裡　" + previous.next,
      "沿用已說清楚的地方。本輪回傳只記新的問答。",
    ].join("\n"),
    round.question && (round.starter === "me" ? "我這次的問題　" : "我想談的方向　") + round.question,
    "【收尾才使用的格式】\n" + returnInstructions(discussion, round, "完成"),
    "若我說「先暫存」，沿用同一格式與識別碼，把狀態改為「暫存」，寫好下次從這裡，候選留空。",
    round.starter === "me" ? "收到後，先就選段回答我的問題。" : "收到後，依選段或續談點問我一個問題，等我回答。",
  ].filter(Boolean).join("\n\n");
}

export function evidenceFor(round: DiscussionRound, turns = round.result?.turns ?? []) {
  const refs: Record<string, { label: string; text: string }> = {};
  if (round.source.excerpt) refs.S = { label: "作者原文", text: round.source.excerpt };
  if (round.source.reflection) refs.N = { label: "我的閱讀筆記", text: round.source.reflection };
  if (round.source.compare?.excerpt) refs.S2 = { label: "對照的作者原文", text: round.source.compare.excerpt };
  if (round.source.compare?.reflection) refs.N2 = { label: "我對對照段的想法", text: round.source.compare.reflection };
  turns.forEach((turn, index) => { refs["T" + (index + 1)] = { label: turn.role === "我" ? "我的發言" : "GPT 發言", text: turn.text }; });
  return refs;
}

const clean = (value: unknown) => typeof value === "string" ? value.trim() : "";
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const copyId = (value: unknown) => clean(value).toLowerCase().replace(/[‐‑‒–—−﹣－]/g, "-");

export function parseReturnText(raw: string) {
  if (!raw.trim() || raw.length > 170_000) throw Error("請貼上一張完整回傳卡。若對話太長，可以分輪整理。");
  const blocks = [...raw.trim().matchAll(/^```(?:json)?[ \t]*\r?\n([\s\S]*?)^```[ \t]*\r?$/gmi)]
    .map(match => match[1].trim()).filter(block => block.startsWith("{"));
  if (blocks.length > 1) throw Error("請一次貼回一張回傳卡。");
  const body = blocks[0] ?? raw;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) throw Error("找不到完整回傳卡，請複製 GPT 的整張 JSON。");
  const json = body.slice(start, end + 1);
  try { return object(JSON.parse(json)); }
  catch {
    const escaped = json.replace(/"(?:\\[\s\S]|[^"\\])*"/g, part => part.replace(/[\u0000-\u001f]/g, character => JSON.stringify(character).slice(1, -1)));
    if (escaped !== json) {
      try { return object(JSON.parse(escaped)); } catch { /* The original GPT chat can repair the card. */ }
    }
    throw Error("回傳卡的 JSON 尚未完整，請原 GPT 對話核對引號與換行。");
  }
}

export function returnIdentity(raw: string) {
  const card = parseReturnText(raw);
  if (card.格式 !== DISCUSSION_FORMAT) throw Error("請使用心知閱讀討論的回傳卡。");
  return { card, discussionId: copyId(card.討論ID), roundId: copyId(card.討論包ID), noteId: copyId(card.選段ID) };
}

export function validateReturn(raw: string, discussion: ReadingDiscussion, round: DiscussionRound): DiscussionReturn {
  const { card, discussionId, roundId, noteId } = returnIdentity(raw);
  if (discussionId !== discussion.id || roundId !== round.id || noteId !== round.source.noteId
    || (card.帶入範圍 !== undefined && card.帶入範圍 !== discussion.scope))
    throw Error("這張卡的選段或討論包識別不符，請用原對話的回傳卡。");
  const status = card.狀態;
  if (status !== "暫存" && status !== "完成") throw Error("回傳狀態須為暫存或完成。");
  if (!Array.isArray(card.問答) || !card.問答.length || card.問答.length > 240)
    throw Error("請貼回包含本輪實際發言的回傳卡，每輪最多 240 則。");
  const turns = card.問答.map((value, index): DiscussionTurn => {
    const turn = object(value);
    const speaker = clean(turn.角色 ?? turn.role);
    const role = ["我", "本人", "使用者", "user"].includes(speaker) ? "我" : ["GPT", "ChatGPT", "assistant"].includes(speaker) ? "GPT" : null;
    const text = clean(turn.內容 ?? turn.content);
    if (!role || !text) throw Error("請核對本輪第 " + (index + 1) + " 則發言的角色與內容。");
    return { role, text };
  });
  const next = clean(card.下次從這裡);
  if (status === "暫存" && !next) throw Error("暫存卡需要保留一個下次可以接著談的問題。");
  const entries = card.候選 ?? [];
  if (!Array.isArray(entries) || entries.length > 80 || (status === "暫存" && entries.length)) throw Error("暫存卡的候選須留空。完成卡最多可帶回 80 筆。");
  const refs = evidenceFor(round, turns);
  const candidates = entries.map((value, index): DiscussionCandidate => {
    const entry = object(value);
    const anchor = clean(entry.依據);
    const quote = clean(entry.依據原句);
    const valid = Object.hasOwn(refs, anchor) && quote && refs[anchor].text.includes(quote);
    return {
      id: String(index + 1),
      type: entry.類型 === "洞察卡" ? "洞察卡" : "觀點",
      text: clean(entry.內容),
      action: clean(entry.行動),
      anchor,
      quote,
      state: "pending",
      ...(!valid || !["觀點", "洞察卡"].includes(String(entry.類型)) ? { evidenceError: "請核對候選的類型與依據原句。" } : {}),
    };
  });
  return { status, turns, next, candidates };
}

export function approvedResult(input: unknown, round: DiscussionRound): DiscussionResult {
  const raw = object(input);
  const { type } = raw;
  const text = clean(raw.text);
  const action = type === "洞察卡" ? clean(raw.action) : "";
  const anchor = clean(raw.anchor);
  const quote = clean(raw.quote);
  const refs = evidenceFor(round);
  if (type !== "觀點" && type !== "洞察卡") throw Error("請選擇保留的成果類型。");
  if (!text || text.length > 1800) throw Error("請填寫想留下的文字，最多 1,800 字元。");
  if (type === "洞察卡" && (!action || action.length > 6000)) throw Error("請填寫想觀察或實際執行的事。");
  if (!Object.hasOwn(refs, anchor) || !quote || !refs[anchor].text.includes(quote)) throw Error("依據原句和選取的來源對不上。");
  return { type, text, action, anchor, quote };
}

export function discussionCitation(round: DiscussionRound, number: number) {
  const s = round.source;
  return [s.bookTitle, "第 " + s.readCount + " 次閱讀", s.locator, s.label, "第 " + number + " 輪討論"].filter(Boolean).join(" · ");
}

export function discussionProductText(round: DiscussionRound, number: number, result: DiscussionResult) {
  return [
    result.type === "觀點" ? "【我的觀點】" : "【洞察卡】",
    result.text,
    result.action && "待觀察／執行　" + result.action,
    "來源　" + discussionCitation(round, number) + " · v1",
  ].filter(Boolean).join("\n");
}

export function discussionHref(ref: DiscussionShortcut, noteId?: string) {
  const search = new URLSearchParams({ discussion: ref.discussionId, round: ref.roundId });
  if (noteId) search.set("note", noteId);
  return "/reading/books/" + encodeURIComponent(ref.bookId) + "?" + search;
}
