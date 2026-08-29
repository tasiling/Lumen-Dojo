"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useDojo } from "@/lib/dojo/store";
import {
  DAILY_TASK_CATEGORIES,
  addCalendarDays,
  mondayOf,
  taipeiTodayISO,
  type DailyRecord,
  type DailyTaskCategory,
  type PersonalCalendarItem,
} from "@/lib/dojo/formal";
import { SPACES } from "@/lib/dojo/constants";

type FormalCalendarItem = {
  type: "明細" | "場次";
  id: string;
  日期: string | null;
  標題: string;
  更次?: string | null;
  項目用途?: string | null;
  當場主題?: string;
  狀態: string | null;
  所屬Session?: string | null;
};

type DashboardData = {
  calendar: FormalCalendarItem[];
  completion: { total: number; done: number };
  today: string;
};

type AgendaSource = "personal" | "today" | "work";
type CalendarMode = "calendar" | "all" | "personal" | "work";
type AgendaItem = {
  id: string;
  date: string;
  title: string;
  source: AgendaSource;
  sourceLabel: string;
  time?: string;
  status?: string;
  note?: string;
  href?: string;
  manualId?: string;
  taskCategory?: DailyTaskCategory;
};

type DailyReviewSnapshot = {
  morning: 0 | 1;
  evening: 0 | 1 | 2 | 3;
  taskProgress: { done: number; total: number };
};

const CALENDAR_MODES: { id: CalendarMode; label: string }[] = [
  { id: "calendar", label: "行事曆" },
  { id: "all", label: "全部" },
  { id: "personal", label: "個人行程" },
  { id: "work", label: "工作後台" },
];

const WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"];
const TASK_ORDER: DailyTaskCategory[] = ["important", "hobby", "health"];

async function readResponse<T>(response: Response): Promise<T> {
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((json as { error?: string }).error ?? `載入失敗（${response.status}）`);
  return json as T;
}

function shiftMonth(yearMonth: string, delta: number) {
  const [year, month] = yearMonth.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + delta, 1, 12));
  return date.toISOString().slice(0, 7);
}

function monthGrid(yearMonth: string) {
  const [year, month] = yearMonth.split("-").map(Number);
  const first = `${yearMonth}-01`;
  const start = mondayOf(first);
  return Array.from({ length: 42 }, (_, index) => {
    const iso = addCalendarDays(start, index);
    return { iso, day: Number(iso.slice(8, 10)), inMonth: iso.slice(0, 7) === yearMonth, month, year };
  });
}

function fmtDay(dateISO: string) {
  return new Intl.DateTimeFormat("zh-TW", { month: "long", day: "numeric", weekday: "long" })
    .format(new Date(`${dateISO}T12:00:00+08:00`));
}

function dailyReviewSnapshot(record?: DailyRecord): DailyReviewSnapshot {
  const eveningLevel = record?.evening.closedAt
    ? record.evening.depth === "deep"
      ? 3
      : record.evening.depth === "medium"
        ? 2
        : 1
    : 0;
  return {
    morning: record?.morning.startedAt ? 1 : 0,
    evening: eveningLevel,
    taskProgress: {
      done: record ? TASK_ORDER.filter((category) => record.tasks[category].completed).length : 0,
      total: TASK_ORDER.length,
    },
  };
}

function hasDailyActivity(record?: DailyRecord) {
  if (!record) return false;
  return Boolean(
    record.morning.startedAt ||
    record.morning.intention.trim() ||
    record.morning.gratitude.trim() ||
    record.morning.affirmation.trim() ||
    record.morning.futureJournal.trim() ||
    record.morning.state ||
    record.daytime.logs.length ||
    record.daytime.note.trim() ||
    record.evening.closedAt ||
    record.evening.highlight.trim() ||
    record.evening.block.trim() ||
    record.evening.insight.trim() ||
    record.evening.nextAction.trim() ||
    record.evening.carryNote.trim() ||
    TASK_ORDER.some((category) => {
      const task = record.tasks[category];
      return task.text.trim() || task.completed || task.result.trim();
    })
  );
}

function hasDailyTaskPlan(record?: DailyRecord) {
  return Boolean(record && TASK_ORDER.some((category) => record.tasks[category].text.trim()));
}

function ReviewMark({ review, large = false }: { review: DailyReviewSnapshot; large?: boolean }) {
  const radii = large ? [8, 13, 18] : [5, 8, 11];
  const center = large ? 22 : 14;
  const box = large ? 44 : 28;
  return (
    <svg
      className={`calendar-review-mark ${large ? "large" : ""}`}
      viewBox={`0 0 ${box} ${box}`}
      role="img"
      aria-label={`晨間${review.morning ? "已記錄" : "未記錄"}，收光 ${review.evening} 層，三件事完成 ${review.taskProgress.done} 件`}
    >
      {radii.map((radius, index) => {
        const left = center - radius;
        const right = center + radius;
        return (
          <g key={radius}>
            <path className="track" d={`M ${left} ${center} A ${radius} ${radius} 0 0 1 ${right} ${center}`} />
            <path className="track" d={`M ${right} ${center} A ${radius} ${radius} 0 0 1 ${left} ${center}`} />
            {review.morning > index && (
              <path className="morning" d={`M ${left} ${center} A ${radius} ${radius} 0 0 1 ${right} ${center}`} />
            )}
            {review.evening > index && (
              <path className="evening" d={`M ${right} ${center} A ${radius} ${radius} 0 0 1 ${left} ${center}`} />
            )}
          </g>
        );
      })}
      <circle className="seed" cx={center} cy={center} r={large ? 2.2 : 1.7} />
    </svg>
  );
}

function CalendarReviewCell({ record, showEmpty = false }: { record?: DailyRecord; showEmpty?: boolean }) {
  if (!record || !hasDailyActivity(record)) {
    return showEmpty ? <span className="calendar-empty-dot" aria-hidden="true" /> : null;
  }
  const review = dailyReviewSnapshot(record);
  return (
    <span className="calendar-review-cell">
      <ReviewMark review={review} />
      {hasDailyTaskPlan(record) && <small>{review.taskProgress.done}/{review.taskProgress.total}</small>}
    </span>
  );
}

export default function CalendarPage() {
  const { openQuickAdd } = useDojo();
  const today = useMemo(() => taipeiTodayISO(), []);
  const [yearMonth, setYearMonth] = useState(today.slice(0, 7));
  const [selectedDay, setSelectedDay] = useState(today);
  const [view, setView] = useState<"month" | "week" | "day">("month");
  const [mode, setMode] = useState<CalendarMode>("calendar");
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [personal, setPersonal] = useState<PersonalCalendarItem[]>([]);
  const [daily, setDaily] = useState<DailyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [dashboardResponse, personalResponse] = await Promise.all([
        fetch(`/api/dashboard?month=${yearMonth}`, { cache: "no-store" }),
        fetch(`/api/dojo/calendar?month=${yearMonth}`, { cache: "no-store" }),
      ]);
      const dashboardJson = await readResponse<DashboardData>(dashboardResponse);
      const personalJson = await readResponse<{ items: PersonalCalendarItem[]; daily: DailyRecord[] }>(personalResponse);
      setDashboard(dashboardJson);
      setPersonal(personalJson.items ?? []);
      setDaily(personalJson.daily ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoading(false);
    }
  }, [yearMonth]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    function onCalendarChange() {
      void load();
    }
    window.addEventListener("dojo:calendar-changed", onCalendarChange);
    return () => window.removeEventListener("dojo:calendar-changed", onCalendarChange);
  }, [load]);

  const agenda = useMemo<AgendaItem[]>(() => {
    const personalItems: AgendaItem[] = personal.map((item) => ({
      id: `personal:${item.id}`,
      manualId: item.id,
      date: item.date,
      title: item.title,
      source: "personal" as const,
      sourceLabel: "個人行程",
      time: item.startTime,
      status: SPACES[item.space][0],
      note: item.note,
    }));
    const todayItems: AgendaItem[] = daily.flatMap((record) =>
      TASK_ORDER.flatMap((category) => {
        const task = record.tasks[category];
        return task.text.trim()
          ? [{
              id: `today:${record.date}:${category}`,
              date: record.date,
              title: task.text,
              source: "today" as const,
              taskCategory: category,
              sourceLabel: DAILY_TASK_CATEGORIES[category].label,
              status: task.completed ? "已完成" : "進行中",
              href: record.date === today ? "/" : `/review?date=${record.date}`,
            }]
          : [];
      })
    );
    const workItems: AgendaItem[] = (dashboard?.calendar ?? []).flatMap((item) =>
      item.日期
        ? [{
            id: `work:${item.id}`,
            date: item.日期,
            title: item.更次 ? `日上三更・${item.更次}` : item.標題,
            source: "work" as const,
            sourceLabel: item.更次 ? "日上三更" : item.type,
            status: item.狀態 ?? undefined,
            note: item.項目用途 ?? item.當場主題 ?? undefined,
            href: item.更次 ? `/sanko?detailId=${item.id}` : item.所屬Session ? `/sessions?sessionId=${item.所屬Session}` : undefined,
          }]
        : []
    );
    return [...personalItems, ...todayItems, ...workItems]
      .filter((item) => mode === "calendar" || mode === "all" || item.source === mode)
      .sort((a, b) => `${a.date}T${a.time ?? "99:99"}`.localeCompare(`${b.date}T${b.time ?? "99:99"}`));
  }, [personal, daily, dashboard, mode, today]);

  const byDay = useMemo(() => {
    const result = new Map<string, AgendaItem[]>();
    for (const item of agenda) result.set(item.date, [...(result.get(item.date) ?? []), item]);
    return result;
  }, [agenda]);

  const dailyByDay = useMemo(() => new Map(daily.map((record) => [record.date, record])), [daily]);

  async function removePersonal(id: string) {
    if (!window.confirm("要刪除這筆個人行程嗎？這會送進 Notion 垃圾桶，可在 Notion 復原。")) return;
    try {
      const response = await fetch(`/api/dojo/calendar?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      await readResponse(response);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  function moveMonth(delta: number) {
    const next = shiftMonth(yearMonth, delta);
    setYearMonth(next);
    setSelectedDay(`${next}-01`);
  }

  function chooseDay(iso: string) {
    setSelectedDay(iso);
    if (iso.slice(0, 7) !== yearMonth) setYearMonth(iso.slice(0, 7));
  }

  const cells = monthGrid(yearMonth);
  const weekStart = mondayOf(selectedDay);
  const weekDays = Array.from({ length: 7 }, (_, index) => addCalendarDays(weekStart, index));
  const donePercent = dashboard?.completion.total
    ? Math.round((dashboard.completion.done / dashboard.completion.total) * 100)
    : 0;

  return (
    <section className="screen calendar-screen">
      <div className="section-heading page-heading">
        <div>
          <span className="eyebrow">行光道場</span>
          <h1>行事曆</h1>
          <p className="lead">看見每天留下的狀態，也能分開查看個人與工作排程。</p>
        </div>
        <button className="primary compact-button" onClick={() => openQuickAdd({ mode: "calendar", presetDate: selectedDay })}>＋ 新增</button>
      </div>

      {mode === "work" && (
        <div className="calendar-metric">
          <div>
            <small>本月交付</small>
            <b>{dashboard?.completion.done ?? 0}/{dashboard?.completion.total ?? 0}</b>
          </div>
          <div className="metric-bar"><i style={{ width: `${donePercent}%` }} /></div>
          <Link href="/backstage">進入工作後台</Link>
        </div>
      )}

      <div className="calendar-controls">
        <button onClick={() => moveMonth(-1)}>←</button>
        <button className="month-label" onClick={() => { setYearMonth(today.slice(0, 7)); setSelectedDay(today); }}>
          {yearMonth.replace("-", " 年 ")} 月
        </button>
        <button onClick={() => moveMonth(1)}>→</button>
      </div>

      <div className="segmented three">
        {([[
          "month", "月",
        ], ["week", "週"], ["day", "日"]] as const).map(([key, label]) => (
          <button key={key} className={view === key ? "on" : ""} onClick={() => setView(key)}>{label}</button>
        ))}
      </div>

      <div className="row source-filter" aria-label="行事曆顯示內容">
        {CALENDAR_MODES.map(({ id, label }) => (
          <button key={id} className={mode === id ? "on" : ""} onClick={() => setMode(id)}>{label}</button>
        ))}
      </div>

      {error && <p className="form-error" role="alert">{error}</p>}
      {loading && <div className="empty">正在讀取行事曆…</div>}

      {!loading && view === "month" && (
        <div className={`month-calendar ${mode === "calendar" ? "calendar-rich" : "calendar-compact"}`}>
          <div className="calendar-frame">
            <div className="calendar-weekdays">{WEEKDAYS.map((day) => <span key={day}>{day}</span>)}</div>
            <div className="calendar-grid">
              {cells.map((cell) => {
                const items = byDay.get(cell.iso) ?? [];
                const dailyRecord = dailyByDay.get(cell.iso);
                const sources = Array.from(new Set(items.map((item) => item.source)));
                return (
                  <button
                    key={cell.iso}
                    className={`${cell.inMonth ? "" : "outside"} ${cell.iso === today ? "today" : ""} ${cell.iso === selectedDay ? "selected" : ""}`}
                    onClick={() => chooseDay(cell.iso)}
                    aria-label={`${cell.iso}${mode === "calendar" && hasDailyActivity(dailyRecord) ? "，有留下狀態" : items.length ? `，${items.length} 件` : ""}`}
                  >
                    <span className="calendar-date-row">
                      <b>{cell.day}</b>
                      {mode !== "calendar" && items.length > 0 && <span className="calendar-item-count">{items.length}</span>}
                    </span>
                    {mode === "calendar" ? (
                      <CalendarReviewCell record={dailyRecord} showEmpty />
                    ) : (
                      <span className="calendar-dots" aria-hidden="true">
                        {sources.map((source) => <i key={source} className={source} />)}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {!loading && view === "week" && (
        <div className={`week-calendar ${mode === "calendar" ? "calendar-rich" : "calendar-compact"}`}>
          {weekDays.map((iso, index) => {
            const record = dailyByDay.get(iso);
            const review = dailyReviewSnapshot(record);
            const planned = hasDailyTaskPlan(record);
            const itemCount = (byDay.get(iso) ?? []).length;
            return (
              <button key={iso} className={`${iso === selectedDay ? "selected" : ""} ${iso === today ? "today" : ""}`} onClick={() => chooseDay(iso)}>
                <small>週{WEEKDAYS[index]}</small>
                <b>{Number(iso.slice(8))}</b>
                {mode === "calendar" && <ReviewMark review={review} />}
                <span>{mode === "calendar" && planned ? `${review.taskProgress.done}/3` : `${itemCount} 件`}</span>
              </button>
            );
          })}
        </div>
      )}

      {!loading && (
        <>
          {mode === "calendar" && <DailyReviewSummary date={selectedDay} record={dailyByDay.get(selectedDay)} today={today} />}
          <DayAgenda
            date={selectedDay}
            items={byDay.get(selectedDay) ?? []}
            onAdd={() => openQuickAdd({ mode: "calendar", presetDate: selectedDay })}
            onRemove={removePersonal}
          />
        </>
      )}
    </section>
  );
}

function DailyReviewSummary({ date, record, today }: { date: string; record?: DailyRecord; today: string }) {
  const review = dailyReviewSnapshot(record);
  const eveningLabels = ["未記錄", "輕層", "中層", "深層"];
  const hasActivity = hasDailyActivity(record);
  const hasTaskPlan = hasDailyTaskPlan(record);
  const eveningStatus = !record?.evening.closedAt
    ? "未記錄"
    : record.evening.disposition === "carry"
      ? record.evening.carryToDate
        ? `帶回 ${Number(record.evening.carryToDate.slice(5, 7))}/${Number(record.evening.carryToDate.slice(8, 10))}`
        : "帶回"
      : record.evening.disposition === "pause"
        ? "暫且放下"
        : eveningLabels[review.evening];
  return (
    <section className="ritual-card calendar-day-review">
      <div className="calendar-review-date">
        <ReviewMark review={review} large />
        <div>
          <span className="eyebrow">所選日期</span>
          <h2>{Number(date.slice(5, 7))} 月 {Number(date.slice(8, 10))} 日</h2>
        </div>
      </div>

      <div className="calendar-record-pair">
        <div>
          <i className="morning-dot" />
          <span>晨間</span>
          <strong>{review.morning ? "已記錄" : "未記錄"}</strong>
        </div>
        <div>
          <i className="evening-dot" />
          <span>收光</span>
          <strong>{eveningStatus}</strong>
        </div>
      </div>

      <div className="calendar-task-progress">
        <span>規劃今天的三件事</span>
        <strong>{hasTaskPlan ? `${review.taskProgress.done} / ${review.taskProgress.total} 已完成` : "未設定"}</strong>
      </div>

      {hasActivity ? (
        <Link className="button-link calendar-review-link" href={date === today ? "/" : `/review?date=${date}`}>
          {date === today ? "回到今天繼續書寫" : "查看這一天"}
        </Link>
      ) : (
        <p className="calendar-empty-copy">這一天還沒有留下紀錄。空白只是空白，不代表失敗。</p>
      )}
    </section>
  );
}

function DayAgenda({
  date,
  items,
  onAdd,
  onRemove,
}: {
  date: string;
  items: AgendaItem[];
  onAdd: () => void;
  onRemove: (id: string) => Promise<void>;
}) {
  return (
    <section className="ritual-card day-agenda">
      <div className="section-heading">
        <div>
          <span className="eyebrow">{fmtDay(date)}</span>
          <h2>這一天</h2>
        </div>
        <button onClick={onAdd}>＋ 行程</button>
      </div>
      {items.length === 0 ? (
        <div className="empty">這天還沒有安排或紀錄。</div>
      ) : (
        <div className="agenda-list">
          {items.map((item) => (
            <div
              key={item.id}
              className={`agenda-item ${item.source}${item.taskCategory ? ` ${item.taskCategory}` : ""}`}
            >
              <div className="agenda-time">{item.time || "全天"}</div>
              <div className="agenda-body">
                <small>{item.sourceLabel}{item.status ? ` · ${item.status}` : ""}</small>
                {item.href ? <Link href={item.href}>{item.title}</Link> : <b>{item.title}</b>}
                {item.note && <p>{item.note}</p>}
              </div>
              {item.manualId && <button className="icon-button danger" onClick={() => void onRemove(item.manualId!)} aria-label={`刪除「${item.title}」`}>×</button>}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
