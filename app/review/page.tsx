"use client";

import { useEffect, useMemo, useState } from "react";
import { useDojo } from "@/lib/dojo/store";
import {
  DAILY_TASK_CATEGORIES,
  type DailyRecord,
  type DailyTaskCategory,
} from "@/lib/dojo/formal";
import {
  GUANGFA,
  GUANGXING,
  SPACES,
  type DojoEntry,
  type SpaceKey,
} from "@/lib/dojo/constants";
import { formatFreqIntensityLabel, resolveHawkinsLevel } from "@/lib/dojo/hawkins";

const TASK_ORDER: DailyTaskCategory[] = ["important", "hobby", "health"];

async function readResponse<T>(response: Response): Promise<T> {
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((json as { error?: string }).error ?? `載入失敗（${response.status}）`);
  return json as T;
}

function fmtDate(dateISO: string) {
  return new Intl.DateTimeFormat("zh-TW", { year: "numeric", month: "long", day: "numeric", weekday: "short" })
    .format(new Date(`${dateISO}T12:00:00+08:00`));
}

export default function ReviewPage() {
  const { entries: editableEntries, openQuickAdd, removeEntry, refreshEntries } = useDojo();
  const [daily, setDaily] = useState<DailyRecord[]>([]);
  const [entries, setEntries] = useState<DojoEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"all" | "daily" | "entries">("all");
  const [space, setSpace] = useState<"all" | SpaceKey>("all");
  const [dateFilter, setDateFilter] = useState("");

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
        const json = await readResponse<{ daily: DailyRecord[]; entries: DojoEntry[] }>(response);
        if (!cancelled) {
          setDaily(json.daily ?? []);
          setEntries(json.entries ?? []);
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

  const normalizedQuery = query.trim().toLocaleLowerCase("zh-Hant");
  const visibleDaily = useMemo(() => daily.filter((record) => {
    if (dateFilter && record.date !== dateFilter) return false;
    if (!normalizedQuery) return true;
    const text = [
      record.morning.intention,
      record.daytime.note,
      ...record.daytime.logs.map((log) => log.text),
      ...TASK_ORDER.map((category) => record.tasks[category].text),
      record.evening.highlight,
      record.evening.block,
      record.evening.insight,
      record.evening.nextAction,
    ].join(" ").toLocaleLowerCase("zh-Hant");
    return text.includes(normalizedQuery);
  }), [daily, dateFilter, normalizedQuery]);

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

  return (
    <section className="screen review-screen">
      <div className="section-heading page-heading">
        <div>
          <span className="eyebrow">回看</span>
          <h1>走過的光</h1>
          <p className="lead">今天的三件事、札記、晚間復盤與六場域痕跡都在這裡。</p>
        </div>
        {dateFilter && <button onClick={() => setDateFilter("")}>清除日期</button>}
      </div>

      <input className="field search-field" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜尋任務、札記或痕跡" />

      <div className="segmented three">
        <button className={mode === "all" ? "on" : ""} onClick={() => setMode("all")}>全部</button>
        <button className={mode === "daily" ? "on" : ""} onClick={() => setMode("daily")}>每日回看</button>
        <button className={mode === "entries" ? "on" : ""} onClick={() => setMode("entries")}>場域痕跡</button>
      </div>

      {(mode === "all" || mode === "entries") && (
        <div className="row source-filter">
          <button className={space === "all" ? "on" : ""} onClick={() => setSpace("all")}>全部場域</button>
          {(Object.entries(SPACES) as [SpaceKey, (typeof SPACES)[SpaceKey]][]).map(([key, value]) => (
            <button key={key} className={space === key ? "on" : ""} onClick={() => setSpace(key)}>{value[0]}</button>
          ))}
        </div>
      )}

      {dateFilter && <p className="save-notice">正在查看 {fmtDate(dateFilter)}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {loading && <div className="empty">正在整理回看…</div>}

      {!loading && (mode === "all" || mode === "daily") && (
        <div className="review-days">
          {visibleDaily.map((record) => <DailyReviewCard key={record.date} record={record} />)}
          {visibleDaily.length === 0 && mode === "daily" && <div className="empty">這個條件下沒有每日回看。</div>}
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

      {!loading && mode === "all" && visibleDaily.length === 0 && visibleEntries.length === 0 && (
        <div className="empty">還沒有符合條件的內容。</div>
      )}
    </section>
  );
}

function DailyReviewCard({ record }: { record: DailyRecord }) {
  const completed = TASK_ORDER.filter((category) => record.tasks[category].completed).length;
  const hasEvening = Boolean(record.evening.closedAt || record.evening.highlight || record.evening.insight);
  return (
    <details className="review-day-card" open={false}>
      <summary>
        <div>
          <span className="eyebrow">{fmtDate(record.date)}</span>
          <b>{record.morning.intention || "這一天沒有留下晨間意圖"}</b>
        </div>
        <span>{completed}/3 · {hasEvening ? "已收光" : "未收光"}</span>
      </summary>
      <div className="review-day-body">
        <h3>今日三件事</h3>
        {TASK_ORDER.map((category) => {
          const task = record.tasks[category];
          if (!task.text) return null;
          return (
            <div className="review-task" key={category}>
              <span>{task.completed ? "✓" : "○"}</span>
              <div>
                <small>{DAILY_TASK_CATEGORIES[category].label}</small>
                <b>{task.text}</b>
                {task.result && <p>{task.result}</p>}
              </div>
            </div>
          );
        })}

        {record.daytime.logs.length > 0 && (
          <>
            <h3>白天追蹤</h3>
            <div className="timeline">
              {record.daytime.logs.map((log) => <div className="event" key={log.id}><b>{log.text}</b><small>{log.time}</small></div>)}
            </div>
          </>
        )}

        {record.daytime.note && <><h3>日間札記</h3><p className="review-prose">{record.daytime.note}</p></>}

        {hasEvening && (
          <>
            <h3>晚間復盤</h3>
            <div className="review-reflection">
              {record.evening.highlight && <p><b>一束光</b>{record.evening.highlight}</p>}
              {record.evening.block && <p><b>卡住的地方</b>{record.evening.block}</p>}
              {record.evening.insight && <p><b>看見了什麼</b>{record.evening.insight}</p>}
              {record.evening.nextAction && <p><b>下一步</b>{record.evening.nextAction}</p>}
            </div>
          </>
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
          <button onClick={(event) => { event.stopPropagation(); onEdit(); }}>編輯</button>
          <button className="danger" onClick={(event) => { event.stopPropagation(); onDelete(); }}>刪除</button>
        </div>
      )}
    </article>
  );
}
