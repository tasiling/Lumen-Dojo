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
};

const SOURCE_LABELS: Record<AgendaSource, string> = {
  personal: "個人行程",
  today: "今日三件事",
  work: "工作後台",
};

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

export default function CalendarPage() {
  const { openQuickAdd } = useDojo();
  const today = useMemo(() => taipeiTodayISO(), []);
  const [yearMonth, setYearMonth] = useState(today.slice(0, 7));
  const [selectedDay, setSelectedDay] = useState(today);
  const [view, setView] = useState<"month" | "week" | "day">("month");
  const [filter, setFilter] = useState<"all" | AgendaSource>("all");
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
      sourceLabel: SOURCE_LABELS.personal,
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
      .filter((item) => filter === "all" || item.source === filter)
      .sort((a, b) => `${a.date}T${a.time ?? "99:99"}`.localeCompare(`${b.date}T${b.time ?? "99:99"}`));
  }, [personal, daily, dashboard, filter, today]);

  const byDay = useMemo(() => {
    const result = new Map<string, AgendaItem[]>();
    for (const item of agenda) result.set(item.date, [...(result.get(item.date) ?? []), item]);
    return result;
  }, [agenda]);

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
          <span className="eyebrow">整合行事曆</span>
          <h1>行事曆</h1>
          <p className="lead">個人行程、今日三件事與工作後台排程在同一個時間軸。</p>
        </div>
        <button className="primary compact-button" onClick={() => openQuickAdd({ mode: "calendar", presetDate: selectedDay })}>＋ 新增</button>
      </div>

      <div className="calendar-metric">
        <div>
          <small>工作後台本月交付</small>
          <b>{dashboard?.completion.done ?? 0}/{dashboard?.completion.total ?? 0}</b>
        </div>
        <div className="metric-bar"><i style={{ width: `${donePercent}%` }} /></div>
        <Link href="/backstage">進入工作後台</Link>
      </div>

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

      <div className="row source-filter">
        <button className={filter === "all" ? "on" : ""} onClick={() => setFilter("all")}>全部</button>
        {(Object.entries(SOURCE_LABELS) as [AgendaSource, string][]).map(([key, label]) => (
          <button key={key} className={filter === key ? "on" : ""} onClick={() => setFilter(key)}>{label}</button>
        ))}
      </div>

      {error && <p className="form-error" role="alert">{error}</p>}
      {loading && <div className="empty">正在讀取行事曆…</div>}

      {!loading && view === "month" && (
        <div className="month-calendar">
          <div className="calendar-weekdays">{WEEKDAYS.map((day) => <span key={day}>{day}</span>)}</div>
          <div className="calendar-grid">
            {cells.map((cell) => {
              const items = byDay.get(cell.iso) ?? [];
              return (
                <button
                  key={cell.iso}
                  className={`${cell.inMonth ? "" : "outside"} ${cell.iso === today ? "today" : ""} ${cell.iso === selectedDay ? "selected" : ""}`}
                  onClick={() => chooseDay(cell.iso)}
                >
                  <b>{cell.day}</b>
                  <span className="calendar-dots">
                    {Array.from(new Set(items.map((item) => item.source))).map((source) => <i key={source} className={source} />)}
                  </span>
                  {items.length > 0 && <small>{items.length}</small>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {!loading && view === "week" && (
        <div className="week-calendar">
          {weekDays.map((iso, index) => (
            <button key={iso} className={`${iso === selectedDay ? "selected" : ""} ${iso === today ? "today" : ""}`} onClick={() => chooseDay(iso)}>
              <small>週{WEEKDAYS[index]}</small>
              <b>{Number(iso.slice(8))}</b>
              <span>{(byDay.get(iso) ?? []).length} 件</span>
            </button>
          ))}
        </div>
      )}

      {!loading && (
        <DayAgenda
          date={selectedDay}
          items={byDay.get(selectedDay) ?? []}
          onAdd={() => openQuickAdd({ mode: "calendar", presetDate: selectedDay })}
          onRemove={removePersonal}
        />
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
            <div key={item.id} className={`agenda-item ${item.source}`}>
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
