// Server-side, read-only adapter for the Dojo's existing Notion records.
const VERSION = "2026-03-11";
const UUID = /^[\da-f]{8}-?[\da-f]{4}-?[\da-f]{4}-?[\da-f]{4}-?[\da-f]{12}$/i;
const normalizeId = (value) =>
  String(value || "")
    .replaceAll("-", "")
    .toLowerCase();
const JOURNAL_FIELDS = [
  "我很感恩的三件事",
  "我今天經歷的美好事物",
  "我今天做的好事",
  "讓這一天變更棒的方法",
  "我要改善什麼問題",
  "我的正向肯定句",
  "我的未來日記",
];
export class JournalReaderError extends Error {
  constructor(message, status = 503) {
    super(message);
    this.status = status;
  }
}
export function validJournalDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const date = new Date(value + "T00:00:00Z");
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}
const textOf = (item) =>
  typeof item?.plain_text === "string"
    ? item.plain_text
    : typeof item?.text?.content === "string"
      ? item.text.content
      : "";
const propertyText = (property) =>
  (property?.rich_text || property?.title || []).map(textOf).join("");
function titleDate(title, kind) {
  const match = title.match(
    kind === "daily"
      ? /^行光今日-(\d{4})(\d{2})(\d{2})$/
      : /^日記-(\d{4})(\d{2})(\d{2})$/,
  );
  const date = match ? `${match[1]}-${match[2]}-${match[3]}` : "";
  return validJournalDate(date) ? date : "";
}
function partsOf(value, kind) {
  const parts = [];
  const add = (id, label, text) => {
    if (typeof text === "string" && text.trim())
      parts.push({ id, label, text });
  };
  if (kind === "journal") {
    for (const field of JOURNAL_FIELDS)
      add(field, field, propertyText(value[field]));
    return parts;
  }
  const morning = value.morning || {},
    evening = value.evening || {};
  for (const [key, label] of [
    ["intention", "今天的選擇（安排）"],
    ["selfNote", "此刻的我"],
    ["roleReply", "我想對那個我說的話"],
    ["creativeState", "想創作的狀態"],
    ["gratitude", "今天想感謝的人事物"],
    ["affirmation", "我的正向肯定句"],
    ["futureJournal", "我的未來日記（想像）"],
  ])
    add("morning." + key, label, morning[key]);
  for (const [key, label] of [
    ["important", "重要的事"],
    ["hobby", "喜歡的事"],
    ["health", "照顧自己的事"],
  ]) {
    const task = value.tasks?.[key];
    add(`tasks.${key}.text`, `${label}（安排）`, task?.text);
    add(`tasks.${key}.result`, `${label}｜我的結果與感想`, task?.result);
  }
  if (Array.isArray(value.daytime?.logs))
    for (const [index, log] of value.daytime.logs.entries())
      add(
        "daytime.logs:" +
          (typeof log?.id === "string" && log.id ? log.id : `legacy-${index}`),
        `白天紀錄${log?.time ? " · " + log.time : ""}`,
        log?.text,
      );
  add("daytime.note", "日間札記", value.daytime?.note);
  for (const [key, label] of [
    ["highlight", "今天的一束光"],
    ["practiceReflection", "今天的實踐回望"],
    ["block", "今天的卡點與消耗"],
    ["insight", "今天的發現"],
    ["nextAction", "下一次的小調整（安排）"],
    ["carryNote", "想帶回之後的話"],
  ])
    add("evening." + key, label, evening[key]);
  return parts;
}
export function journalReaderFromEnv(env = process.env) {
  return createJournalReader({
    token: env.LUMEN_DOJO_NOTION_TOKEN || env.NOTION_API_KEY,
    dailyDataSourceId:
      env.LUMEN_DOJO_NOTION_DATA_SOURCE_ID ||
      "6b2ff51d-2e10-4cde-b9ea-4644702846fa",
    journalDataSourceId:
      env.LUMEN_DOJO_NOTION_JOURNAL_DATA_SOURCE_ID ||
      "5879b2b5-6f4d-4369-9493-a54fa085786d",
  });
}
export function createJournalReader({
  token,
  dailyDataSourceId,
  journalDataSourceId,
  fetchImpl = fetch,
  wait = (ms) => new Promise((r) => setTimeout(r, ms)),
}) {
  const sources = { daily: dailyDataSourceId, journal: journalDataSourceId };
  const labels = { daily: "行光今日", journal: "舊版七題日記" };
  let lastRequest = 0;
  async function request(path, init = {}) {
    if (!token)
      throw new JournalReaderError(
        "日記來源尚未連線，請稍後重試；也可以先手動輸入。",
      );
    for (let attempt = 0; attempt < 3; attempt++) {
      await wait(Math.max(0, 350 - (Date.now() - lastRequest)));
      lastRequest = Date.now();
      try {
        const response = await fetchImpl("https://api.notion.com/v1" + path, {
          ...init,
          method: init.method || "GET",
          cache: "no-store",
          redirect: "error",
          signal: AbortSignal.timeout(8000),
          headers: {
            Authorization: `Bearer ${token}`,
            "Notion-Version": VERSION,
            "Content-Type": "application/json",
          },
        });
        if (!response.ok) {
          if (
            (response.status === 429 || response.status >= 500) &&
            attempt < 2
          ) {
            const retry = Math.min(
              2000,
              Math.max(
                350,
                Number(response.headers.get("retry-after")) * 1000 ||
                  500 * (attempt + 1),
              ),
            );
            await response.body?.cancel();
            await wait(retry);
            continue;
          }
          throw new JournalReaderError(
            "暫時無法讀取日記來源，請檢查連線或讀取權限後重試。",
          );
        }
        return await response.json();
      } catch (error) {
        if (error instanceof JournalReaderError) throw error;
        if (attempt === 2)
          throw new JournalReaderError(
            "日記來源連線逾時或讀取失敗，請重試；目前文字會保留。",
          );
        await wait(500 * (attempt + 1));
      }
    }
  }
  function checkPage(page, kind) {
    if (
      !sources[kind] ||
      !UUID.test(sources[kind]) ||
      !page ||
      page.object !== "page" ||
      !UUID.test(page.id || "") ||
      page.archived ||
      page.in_trash ||
      normalizeId(page.parent?.data_source_id) !== normalizeId(sources[kind])
    )
      throw new JournalReaderError("找不到可讀取的來源紀錄。", 404);
    const title = propertyText(page.properties?.標題),
      date = titleDate(title, kind);
    if (!date)
      throw new JournalReaderError("來源紀錄的名稱或日期不正確。", 422);
    if (
      kind === "journal" &&
      page.properties?.日期?.date?.start?.slice(0, 10) !== date
    )
      throw new JournalReaderError("來源紀錄日期不一致。", 422);
    return {
      id: page.id,
      kind,
      date,
      title: `${date}｜${labels[kind]}`,
      updatedAt: page.last_edited_time || "",
      url: "https://www.notion.so/" + normalizeId(page.id),
    };
  }
  async function completeProperty(page, name) {
    const property = page.properties?.[name],
      values = property?.rich_text || [];
    if (values.length < 25 && !property?.has_more) return;
    if (
      typeof property.id !== "string" ||
      !property.id ||
      property.id.length > 200
    )
      throw new JournalReaderError("這篇日記較長，暫時無法完整讀取，請重試。");
    const all = [];
    let cursor = "";
    const seen = new Set();
    do {
      const params = new URLSearchParams({
        page_size: "100",
        ...(cursor ? { start_cursor: cursor } : {}),
      });
      const value = await request(
        `/pages/${page.id}/properties/${encodeURIComponent(decodeURIComponent(property.id))}?${params}`,
      );
      if (
        !Array.isArray(value.results) ||
        (value.has_more && !UUID.test(value.next_cursor || ""))
      )
        throw new JournalReaderError("日記長文讀取不完整，請重試。");
      for (const item of value.results)
        if (item.type === "rich_text") all.push(item.rich_text);
      cursor = value.has_more ? value.next_cursor : "";
      if (
        (cursor && (!UUID.test(cursor) || seen.has(cursor))) ||
        all.length > 1000
      )
        throw new JournalReaderError("日記長文讀取不完整，請重試。");
      seen.add(cursor);
    } while (cursor);
    property.rich_text = all;
  }
  function decodeCursor(raw, date) {
    if (!raw) return { daily: null, journal: null };
    try {
      if (typeof raw !== "string" || raw.length > 1000 || !/^[\w-]+$/.test(raw))
        throw Error();
      const c = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
      if (
        c.date !== date ||
        Object.keys(c).some((k) => !["date", "daily", "journal"].includes(k)) ||
        [c.daily, c.journal].some(
          (v) => v !== null && v !== "done" && !UUID.test(v || ""),
        )
      )
        throw Error();
      return c;
    } catch {
      throw new JournalReaderError("日記游標已失效，請重新讀取最近紀錄。", 400);
    }
  }
  return {
    async list({ date = "", cursor = "" } = {}) {
      if (date && !validJournalDate(date))
        throw new JournalReaderError("請選擇有效的紀錄日期。", 400);
      const previous = decodeCursor(cursor, date),
        next = { date },
        warnings = [],
        records = [];
      let succeeded = 0;
      await Promise.all(
        Object.entries(sources).map(async ([kind, dataSourceId]) => {
          if (previous[kind] === "done") {
            next[kind] = "done";
            succeeded++;
            return;
          }
          try {
            if (!UUID.test(dataSourceId || ""))
              throw new JournalReaderError("來源尚未設定。");
            const result = await request(
              `/data_sources/${dataSourceId}/query`,
              {
                method: "POST",
                body: JSON.stringify({
                  page_size: 15,
                  filter: {
                    property: "標題",
                    title: date
                      ? {
                          equals:
                            (kind === "daily" ? "行光今日-" : "日記-") +
                            date.replaceAll("-", ""),
                        }
                      : {
                          starts_with: kind === "daily" ? "行光今日-" : "日記-",
                        },
                  },
                  sorts: [{ property: "標題", direction: "descending" }],
                  ...(previous[kind] ? { start_cursor: previous[kind] } : {}),
                }),
              },
            );
            if (
              !Array.isArray(result.results) ||
              (result.has_more && !UUID.test(result.next_cursor || ""))
            )
              throw new JournalReaderError("日記清單讀取不完整。");
            next[kind] = result.has_more ? result.next_cursor : "done";
            let invalid = 0;
            for (const page of result.results) {
              try {
                const row = checkPage(page, kind);
                if (!date || row.date === date) records.push(row);
              } catch {
                invalid++;
              }
            }
            if (invalid)
              warnings.push(
                `${labels[kind]}有 ${invalid} 筆格式無法辨讀的紀錄，原資料仍保留。`,
              );
            succeeded++;
          } catch {
            next[kind] = previous[kind];
            warnings.push(
              `${labels[kind]}暫時無法讀取，請重試；目前文字會保留。`,
            );
          }
        }),
      );
      if (!succeeded)
        throw new JournalReaderError(
          "目前無法讀取日記來源，請稍後重試；也可以先手動輸入。",
        );
      records.sort(
        (a, b) =>
          b.date.localeCompare(a.date) ||
          a.kind.localeCompare(b.kind) ||
          a.id.localeCompare(b.id),
      );
      const nextCursor =
        next.daily === "done" && next.journal === "done"
          ? ""
          : Buffer.from(JSON.stringify(next)).toString("base64url");
      return { records, nextCursor, warnings };
    },
    async read({ kind, id }) {
      if (!["daily", "journal"].includes(kind))
        throw new JournalReaderError("日記來源類型不正確。", 400);
      if (!UUID.test(id || ""))
        throw new JournalReaderError("日記識別不正確。", 400);
      const page = await request(`/pages/${id}`),
        row = checkPage(page, kind);
      if (normalizeId(row.id) !== normalizeId(id))
        throw new JournalReaderError("日記來源識別不一致。", 404);
      for (const name of kind === "daily" ? ["內容"] : JOURNAL_FIELDS)
        await completeProperty(page, name);
      let value = page.properties;
      if (kind === "daily") {
        try {
          const content = propertyText(page.properties?.內容);
          if (content.length > 500000) throw Error();
          value = JSON.parse(content);
        } catch {
          throw new JournalReaderError(
            "這篇紀錄暫時無法辨讀，請重試或選另一篇；原文仍保留。",
            422,
          );
        }
        if (!value || typeof value !== "object" || value.date !== row.date)
          throw new JournalReaderError("來源紀錄日期不一致。", 422);
      }
      return { ...row, parts: partsOf(value, kind) };
    },
  };
}
