"use client";

import { useEffect, useMemo, useState } from "react";
import {
  GUANGFA,
  GUANGXING,
  SPACES,
  type DojoEntry,
  type SpaceKey,
} from "@/lib/dojo/constants";
import {
  DAILY_TASK_CATEGORIES,
  taipeiTodayISO,
  type DailyRecord,
  type DailyTaskCategory,
} from "@/lib/dojo/formal";
import { combineJournalTexts, formatDailyJournalText, type JournalExportMode } from "@/lib/dojo/journalExport";
import { formatFreqIntensityLabel, resolveHawkinsLevel } from "@/lib/dojo/hawkins";
import { useDojo } from "@/lib/dojo/store";
import { JOURNAL_QUESTIONS, type JournalQuestionKey } from "@/lib/journal/notionFormat";

const TASK_ORDER: DailyTaskCategory[] = ["important", "hobby", "health"];
const EVENING_DISPOSITION_LABELS = {
  carry: "帶回",
  journal: "寫下今天",
  pause: "暫且放下",
} as const;

type HistoricalJournal = {
  id: string;
  date: string;
  標題: string;
  日期: string | null;
  answers: Record<JournalQuestionKey, string>;
};

type LegacyClosing = {
  id: string;
  date: string;
  title: string;
  note: string;
  carryToDate: string | null;
  carryResolvedAt: string | null;
};

async function readResponse<T>(response: Response): Promise<T> {
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((json as { error?: string }).error ?? `載入失敗（${response.status}）`);
  return json as T;
}

function fmtDate(dateISO: string) {
  return new Intl.DateTimeFormat("zh-TW", { year: "numeric", month: "long", day: "numeric", weekday: "short" })
    .format(new Date(`${dateISO}T12:00:00+08:00`));
}

function downloadText(filename: string, content: string) {
  const blob = new Blob(["\uFEFF", content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export default function ReviewPage() {
  const { entries: editableEntries, openQuickAdd, removeEntry, refreshEntries } = useDojo();
  const [daily, setDaily] = useState<DailyRecord[]>([]);
  const [entries, setEntries] = useState<DojoEntry[]>([]);
  const [journals, setJournals] = useState<HistoricalJournal[]>([]);
  const [legacyClosings, setLegacyClosings] = useState<LegacyClosing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"all" | "daily" | "entries">("all");
  const [space, setSpace] = useState<"all" | SpaceKey>("all");
  const [dateFilter, setDateFilter] = useState("");
  const [exportMonth, setExportMonth] = useState(() => taipeiTodayISO().slice(0, 7));

  useEffect(() => {
    const date = new URLSearchParams(window.location.search).get("date");
    if (!date) return;
    const timer = window.setTimeout(() => setDateFilter(date), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/dojo/review", { cache: "no-store" });
        const json = await readResponse<{
          daily: DailyRecord[];
          entries: DojoEntry[];
          journals: HistoricalJournal[];
          legacyClosings: LegacyClosing[];
        }>(response);
        if (!cancelled) {
          setDaily(json.daily ?? []);
          setEntries(json.entries ?? []);
          setJournals(json.journals ?? []);
          setLegacyClosings(json.legacyClosings ?? []);
        }
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : String(caught));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const dailyByDate = useMemo(() => new Map(daily.map((record) => [record.date, record])), [daily]);
  const journalsByDate = useMemo(() => {
    const map = new Map<string, HistoricalJournal[]>();
    for (const journal of journals) map.set(journal.date, [...(map.get(journal.date) ?? []), journal]);
    return map;
  }, [journals]);
  const legacyClosingsByDate = useMemo(() => {
    const map = new Map<string, LegacyClosing[]>();
    for (const closing of legacyClosings) map.set(closing.date, [...(map.get(closing.date) ?? []), closing]);
    return map;
  }, [legacyClosings]);

  const allReviewDates = useMemo(() => [...new Set([
    ...daily.map((record) => record.date),
    ...journals.map((journal) => journal.date),
    ...legacyClosings.map((closing) => closing.date),
  ])].sort((a, b) => b.localeCompare(a)), [daily, journals, legacyClosings]);

  const normalizedQuery = query.trim().toLocaleLowerCase("zh-Hant");
  const visibleReviewDates = useMemo(() => {
    return allReviewDates.filter((date) => {
      if (dateFilter && date !== dateFilter) return false;
      if (!normalizedQuery) return true;
      const record = dailyByDate.get(date);
      const text = [
        record?.morning.intention,
        record?.morning.gratitude,
        record?.morning.affirmation,
        record?.morning.futureJournal,
        record?.daytime.note,
        ...(record?.daytime.logs.map((log) => log.text) ?? []),
        ...TASK_ORDER.flatMap((category) => [
          record?.tasks[category].text ?? "",
          record?.tasks[category].result ?? "",
        ]),
        record?.evening.highlight,
        record?.evening.block,
        record?.evening.insight,
        record?.evening.nextAction,
        record?.evening.carryNote,
        ...(journalsByDate.get(date) ?? []).flatMap((journal) => Object.values(journal.answers)),
        ...(legacyClosingsByDate.get(date) ?? []).flatMap((closing) => [closing.title, closing.note]),
      ].filter(Boolean).join(" ").toLocaleLowerCase("zh-Hant");
      return text.includes(normalizedQuery);
    });
  }, [allReviewDates, dailyByDate, dateFilter, journalsByDate, legacyClosingsByDate, normalizedQuery]);

  const visibleEntries = useMemo(() => entries.filter((entry) => {
    if (dateFilter && entry.date !== dateFilter) return false;
    if (space !== "all" && entry.space !== space) return false;
    if (!normalizedQuery) return true;
    return `${entry.title} ${entry.note ?? ""} ${entry.kind}`.toLocaleLowerCase("zh-Hant").includes(normalizedQuery);
  }), [entries, dateFilter, normalizedQuery, space]);

  async function deleteEntry(entry: DojoEntry) {
    if (entry.id.startsWith("trace:")) return;
    if (!window.confirm(`要刪除「${entry.title}」嗎？資料會送進 Notion 垃圾桶。`)) return;
    try {
      await removeEntry(entry.id);
      setEntries((current) => current.filter((item) => item.id !== entry.id));
      await refreshEntries();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  function viewLegacy(entry: DojoEntry) {
    if (!entry.id.startsWith("trace:") || !entry.traceId) return;
    void fetch(`/api/traces/${entry.traceId}/view`, { method: "PATCH" });
  }

  function exportMonthJournal() {
    const dates = allReviewDates.filter((date) => date.startsWith(`${exportMonth}-`)).sort();
    const text = combineJournalTexts(dates.map((date) => formatDailyJournalText({
      date,
      record: dailyByDate.get(date),
      journals: journalsByDate.get(date) ?? [],
      legacyClosings: legacyClosingsByDate.get(date) ?? [],
      mode: "review",
    })));
    if (!text) return;
    downloadText(`行光日記-${exportMonth}.txt`, text);
  }

  return (
    <section className="screen review-screen">
      <div className="section-heading page-heading">
        <div>
          <span className="eyebrow">回看</span>
          <h1>走過的光</h1>
          <p className="lead">晨間、三件事、札記、晚間復盤與舊版筆記，都依日期留在這裡。</p>
        </div>
        {dateFilter && <button type="button" onClick={() => setDateFilter("")}>清除日期</button>}
      </div>

      <input className="field search-field" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜尋任務、札記、復盤或痕跡" />

      <div className="segmented three">
        <button type="button" className={mode === "all" ? "on" : ""} onClick={() => setMode("all")}>全部</button>
        <button type="button" className={mode === "daily" ? "on" : ""} onClick={() => setMode("daily")}>日期回看</button>
        <button type="button" className={mode === "entries" ? "on" : ""} onClick={() => setMode("entries")}>場域痕跡</button>
      </div>

      <section className="review-export-bar">
        <div><small>純文字備份</small><b>匯出日間札記與日復盤</b></div>
        <input type="month" value={exportMonth} onChange={(event) => setExportMonth(event.target.value)} aria-label="選擇匯出月份" />
        <button type="button" onClick={exportMonthJournal} disabled={!allReviewDates.some((date) => date.startsWith(`${exportMonth}-`))}>匯出本月</button>
      </section>

      {(mode === "all" || mode === "entries") && (
        <div className="row source-filter">
          <button type="button" className={space === "all" ? "on" : ""} onClick={() => setSpace("all")}>全部場域</button>
          {(Object.entries(SPACES) as [SpaceKey, (typeof SPACES)[SpaceKey]][]).map(([key, value]) => (
            <button type="button" key={key} className={space === key ? "on" : ""} onClick={() => setSpace(key)}>{value[0]}</button>
          ))}
        </div>
      )}

      {dateFilter && <p className="save-notice">正在查看 {fmtDate(dateFilter)}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {loading && <div className="empty">正在整理回看…</div>}

      {!loading && (mode === "all" || mode === "daily") && (
        <div className="review-days">
          {visibleReviewDates.map((date) => (
            <DailyReviewCard
              key={date}
              date={date}
              record={dailyByDate.get(date)}
              journals={journalsByDate.get(date) ?? []}
              legacyClosings={legacyClosingsByDate.get(date) ?? []}
            />
          ))}
          {visibleReviewDates.length === 0 && mode === "daily" && <div className="empty">這個條件下沒有日期回看。</div>}
        </div>
      )}

      {!loading && (mode === "all" || mode === "entries") && (
        <div className="review-entries">
          {mode === "all" && visibleEntries.length > 0 && <h2 className="review-divider">場域痕跡</h2>}
          {visibleEntries.map((entry) => (
            <ReviewEntryCard
              key={entry.id}
              entry={entry}
              editable={editableEntries.some((item) => item.id === entry.id)}
              onEdit={() => openQuickAdd({ editId: entry.id })}
              onDelete={() => void deleteEntry(entry)}
              onView={() => viewLegacy(entry)}
            />
          ))}
          {visibleEntries.length === 0 && mode === "entries" && <div className="empty">這個條件下沒有場域痕跡。</div>}
        </div>
      )}

      {!loading && mode === "all" && visibleReviewDates.length === 0 && visibleEntries.length === 0 && (
        <div className="empty">還沒有符合條件的內容。</div>
      )}
    </section>
  );
}

function DailyReviewCard({
  date,
  record,
  journals,
  legacyClosings,
}: {
  date: string;
  record?: DailyRecord;
  journals: HistoricalJournal[];
  legacyClosings: LegacyClosing[];
}) {
  const completed = record ? TASK_ORDER.filter((category) => record.tasks[category].completed).length : 0;
  const hasTasks = Boolean(record && TASK_ORDER.some((category) => record.tasks[category].text));
  const hasMorningNotes = Boolean(record && (
    record.morning.gratitude || record.morning.affirmation || record.morning.futureJournal
  ));
  const oldAnswers = journals.flatMap((journal) =>
    JOURNAL_QUESTIONS.flatMap((question) => {
      const value = journal.answers[question.key]?.trim();
      return value ? [{ label: question.label, value }] : [];
    })
  );
  const hasEvening = Boolean(
    record?.evening.closedAt || record?.evening.highlight || record?.evening.insight || legacyClosings.length
  );
  const morningDepthLabel = record?.morning.depth === "deep" ? "深層" : record?.morning.depth === "medium" ? "中層" : record?.morning.startedAt ? "輕層" : null;
  const summaryStatus = record
    ? `${completed}/3 · ${hasEvening ? "已收光" : "未收光"}`
    : `舊資料 · ${oldAnswers.length ? "有舊筆記" : "有收光處置"}`;

  function exportDay(mode: JournalExportMode) {
    const content = formatDailyJournalText({ date, record, journals, legacyClosings, mode });
    downloadText(`${mode === "full" ? "行光每日紀錄" : "行光日記"}-${date}.txt`, content);
  }

  return (
    <details className="review-day-card">
      <summary>
        <div>
          <span className="eyebrow">{fmtDate(date)}</span>
          <b>{record?.morning.intention || (oldAnswers.length ? "這一天留有舊版筆記" : "這一天留下了一段紀錄")}</b>
        </div>
        <span>{summaryStatus}</span>
      </summary>
      <div className="review-day-body">
        <div className="review-export-actions">
          <button type="button" onClick={() => exportDay("review")}>匯出日復盤</button>
          <button type="button" onClick={() => exportDay("full")}>匯出完整紀錄</button>
        </div>
        {record?.morning.intention && <><h3>晨間意圖{morningDepthLabel ? ` · ${morningDepthLabel}` : ""}</h3><p className="review-prose">{record.morning.intention}</p></>}

        {hasMorningNotes && (
          <>
            <h3>晨間筆記</h3>
            <div className="review-reflection">
              {record?.morning.gratitude && <p><b>我很感恩的三件事</b>{record.morning.gratitude}</p>}
              {record?.morning.affirmation && <p><b>我的正向肯定句</b>{record.morning.affirmation}</p>}
              {record?.morning.futureJournal && <p><b>我的未來日記</b>{record.morning.futureJournal}</p>}
            </div>
          </>
        )}

        {hasTasks && (
          <>
            <h3>三件事完成情況</h3>
            {TASK_ORDER.map((category) => {
              const task = record?.tasks[category];
              if (!task?.text) return null;
              return (
                <div className={`review-task ${category}`} key={category}>
                  <span>{task.completed ? "✓" : "○"}</span>
                  <div>
                    <small>{DAILY_TASK_CATEGORIES[category].label}</small>
                    <b>{task.text}</b>
                    {task.result && <p>{task.result}</p>}
                  </div>
                </div>
              );
            })}
          </>
        )}

        {record && record.daytime.logs.length > 0 && (
          <>
            <h3>白天追蹤</h3>
            <div className="timeline">
              {record.daytime.logs.map((log) => <div className="event" key={log.id}><b>{log.text}</b><small>{log.time}</small></div>)}
            </div>
          </>
        )}

        {record?.daytime.note && <><h3>日間札記</h3><p className="review-prose">{record.daytime.note}</p></>}

        {record && (record.evening.closedAt || record.evening.disposition) && (
          <>
            <h3>晚間復盤</h3>
            <div className="review-reflection">
              {record.evening.disposition && (
                <p><b>收光選擇</b>{EVENING_DISPOSITION_LABELS[record.evening.disposition]}</p>
              )}
              {record.evening.highlight && <p><b>一束光</b>{record.evening.highlight}</p>}
              {record.evening.block && <p><b>卡住的地方</b>{record.evening.block}</p>}
              {record.evening.insight && <p><b>看見了什麼</b>{record.evening.insight}</p>}
              {record.evening.nextAction && <p><b>下一步</b>{record.evening.nextAction}</p>}
              {record.evening.carryNote && (
                <p>
                  <b>帶回 {record.evening.carryToDate ? fmtDate(record.evening.carryToDate) : "之後"}</b>
                  {record.evening.carryNote}
                </p>
              )}
            </div>
          </>
        )}

        {oldAnswers.length > 0 && (
          <details className="historical-review-block">
            <summary>舊版晨間與收光筆記</summary>
            <div className="review-reflection">
              {oldAnswers.map((answer, index) => <p key={`${answer.label}:${index}`}><b>{answer.label}</b>{answer.value}</p>)}
            </div>
          </details>
        )}

        {legacyClosings.length > 0 && (
          <details className="historical-review-block">
            <summary>舊版收光處置</summary>
            <div className="review-reflection">
              {legacyClosings.map((closing) => (
                <p key={closing.id}>
                  <b>{closing.title}{closing.carryToDate ? ` · 帶到 ${fmtDate(closing.carryToDate)}` : ""}</b>
                  {closing.note || "這一天沒有另外留下文字。"}
                </p>
              ))}
            </div>
          </details>
        )}
      </div>
    </details>
  );
}

function ReviewEntryCard({
  entry,
  editable,
  onEdit,
  onDelete,
  onView,
}: {
  entry: DojoEntry;
  editable: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onView: () => void;
}) {
  const color = SPACES[entry.space][1];
  const measure = formatFreqIntensityLabel(entry.freq, entry.intensity);
  const level = entry.freq != null ? resolveHawkinsLevel(entry.freq) : null;
  return (
    <article className={`item ${color}`} onClick={onView}>
      <span className="status"><span className="dot" />{SPACES[entry.space][0]} · {entry.kind}</span>
      {entry.guangxing && <span className="tag">{GUANGXING[entry.guangxing][0]}</span>}
      {entry.guangfa && <span className="tag">{GUANGFA[entry.guangfa][0]}</span>}
      {measure && <span className="tag" style={{ borderColor: level?.color, color: level?.color }}>{measure}</span>}
      <b>{entry.title}</b>
      {entry.note && <p className="review-prose compact">{entry.note}</p>}
      <small>{entry.date || "未標日期"} · {entry.privacy}</small>
      {editable && (
        <div className="actions">
          <button type="button" onClick={(event) => { event.stopPropagation(); onEdit(); }}>編輯</button>
          <button type="button" className="danger" onClick={(event) => { event.stopPropagation(); onDelete(); }}>刪除</button>
        </div>
      )}
    </article>
  );
}
