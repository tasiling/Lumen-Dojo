"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  DAILY_TASK_CATEGORIES,
  addCalendarDays,
  completedBingoLines,
  emptyDailyRecord,
  mondayOf,
  taipeiTodayISO,
  type DailyRecord,
  type DailyTaskCategory,
  type WeeklyBoard,
} from "@/lib/dojo/formal";
import { SPACES, type SpaceKey } from "@/lib/dojo/constants";

const TASK_ORDER: DailyTaskCategory[] = ["important", "hobby", "health"];
const EVENING_FIELDS = {
  light: ["highlight"],
  medium: ["highlight", "block"],
  deep: ["highlight", "block", "insight", "nextAction"],
} as const;

const EVENING_LABELS = {
  highlight: ["今天的一束光", "今天值得留下的片刻"],
  block: ["卡住的地方", "哪裡消耗了你？"],
  insight: ["看見了什麼", "今天多明白了一點什麼？"],
  nextAction: ["下一步", "要帶往明天的一個小動作"],
} as const;

function formatToday(dateISO: string) {
  return new Intl.DateTimeFormat("zh-TW", {
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(new Date(`${dateISO}T12:00:00+08:00`));
}

async function readResponse<T>(response: Response): Promise<T> {
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((json as { error?: string }).error ?? `操作失敗（${response.status}）`);
  return json as T;
}

export default function TodayPage() {
  const date = useMemo(() => taipeiTodayISO(), []);
  const weekStart = useMemo(() => mondayOf(date), [date]);
  const [record, setRecord] = useState<DailyRecord>(() => emptyDailyRecord(date));
  const [board, setBoard] = useState<WeeklyBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [logText, setLogText] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [dailyResponse, boardResponse] = await Promise.all([
          fetch(`/api/dojo/daily?date=${date}`, { cache: "no-store" }),
          fetch(`/api/dojo/bingo?week=${weekStart}`, { cache: "no-store" }),
        ]);
        const dailyJson = await readResponse<{ record: DailyRecord }>(dailyResponse);
        const boardJson = await readResponse<{ board: WeeklyBoard }>(boardResponse);
        if (!cancelled) {
          setRecord(dailyJson.record);
          setBoard(boardJson.board);
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
  }, [date, weekStart]);

  async function persist(next: DailyRecord, message?: string) {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/dojo/daily", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, record: next }),
      });
      const json = await readResponse<{ record: DailyRecord }>(response);
      setRecord(json.record);
      if (message) setNotice(message);
      return json.record;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      throw caught;
    } finally {
      setSaving(false);
    }
  }

  function updateTask(category: DailyTaskCategory, patch: Partial<DailyRecord["tasks"][DailyTaskCategory]>) {
    setRecord((current) => ({
      ...current,
      tasks: { ...current.tasks, [category]: { ...current.tasks[category], ...patch } },
    }));
  }

  async function toggleTask(category: DailyTaskCategory) {
    const task = record.tasks[category];
    if (!task.text.trim()) return;
    const completed = !task.completed;
    const next: DailyRecord = {
      ...record,
      tasks: {
        ...record.tasks,
        [category]: {
          ...task,
          completed,
          completedAt: completed ? new Date().toISOString() : null,
        },
      },
    };
    try {
      await persist(next);
      const response = await fetch("/api/dojo/flow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "complete-task", date, category, completed, result: next.tasks[category].result }),
      });
      const json = await readResponse<{ daily: DailyRecord; board: WeeklyBoard | null }>(response);
      setRecord(json.daily);
      if (json.board) setBoard(json.board);
      setNotice(completed ? "已記下完成時間，週盤也已同步。" : "已改回進行中，週盤也已同步。");
    } catch {
      // persist() 已將錯誤放到頁面上。
    }
  }

  async function addLog() {
    const text = logText.trim();
    if (!text) return;
    const now = new Date();
    const time = new Intl.DateTimeFormat("zh-TW", {
      timeZone: "Asia/Taipei",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(now);
    const next = {
      ...record,
      daytime: {
        ...record.daytime,
        logs: [...record.daytime.logs, { id: crypto.randomUUID(), time, text, createdAt: now.toISOString() }],
      },
    };
    setLogText("");
    try {
      await persist(next, "白天追蹤已存下來。");
    } catch {
      setLogText(text);
    }
  }

  async function removeLog(id: string) {
    const next = {
      ...record,
      daytime: { ...record.daytime, logs: record.daytime.logs.filter((log) => log.id !== id) },
    };
    try {
      await persist(next);
    } catch {
      // persist() 已顯示錯誤。
    }
  }

  async function saveEvening() {
    if (!record.evening.depth) {
      setError("請先選擇今晚要用輕、適中或深入復盤。");
      return;
    }
    if (!record.evening.disposition) {
      setError("請選擇帶回、寫下今天或暫且放下。");
      return;
    }

    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const existingResponse = await fetch("/api/closing/today", { cache: "no-store" });
      const existingJson = await readResponse<{ existing: unknown }>(existingResponse);
      if (existingJson.existing) {
        const replace = window.confirm("今天已經收過光。要用這次的晚間復盤取代原本紀錄嗎？");
        if (!replace) {
          setSaving(false);
          return;
        }
      }

      const next = {
        ...record,
        evening: { ...record.evening, closedAt: new Date().toISOString() },
      };
      const saved = await persist(next);
      const closingResponse = await fetch("/api/closing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          choice: saved.evening.disposition,
          note: saved.evening.nextAction,
          carryToDate: saved.evening.disposition === "carry" ? addCalendarDays(date, 1) : undefined,
        }),
      });
      await readResponse(closingResponse);
      setNotice("晚間復盤已收進今天，之後可在回看找到。");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
    }
  }

  const taskDone = TASK_ORDER.filter((category) => record.tasks[category].completed).length;
  const boardDone = board?.cells.filter((cell) => cell.index !== 12 && cell.completed).length ?? 0;

  return (
    <section className="screen today-screen">
      <div className="hero today-hero">
        <div className="eyebrow">今天 · {formatToday(date)}</div>
        <h1>把光放回今天</h1>
        <p>晨間定向、白天留下動靜，晚上再把一天收回來。</p>
        <div className="today-summary">
          <span>三件事 {taskDone}/3</span>
          <Link href="/bingo">週盤 {boardDone}/24 · {board ? completedBingoLines(board) : 0} 連線</Link>
        </div>
      </div>

      {loading && <div className="empty">正在讀取今天…</div>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {notice && <p className="save-notice" role="status">{notice}</p>}

      {!loading && (
        <>
          <section className="ritual-card morning-card">
            <div className="section-heading">
              <div>
                <span className="eyebrow">晨間啟動</span>
                <h2>先看見此刻</h2>
              </div>
              {record.morning.startedAt && <span className="saved-mark">已啟動</span>}
            </div>

            <label>現在的狀態</label>
            <div className="segmented three">
              {(["低", "穩", "亮"] as const).map((state) => (
                <button
                  key={state}
                  className={record.morning.state === state ? "on" : ""}
                  onClick={() => setRecord({ ...record, morning: { ...record.morning, state } })}
                >
                  {state}
                </button>
              ))}
            </div>

            <label htmlFor="morning-intention">今天想把光放在哪裡？</label>
            <textarea
              id="morning-intention"
              className="field"
              value={record.morning.intention}
              onChange={(event) => setRecord({ ...record, morning: { ...record.morning, intention: event.target.value } })}
              placeholder="一句今天的方向即可"
            />
            <button
              className="primary"
              disabled={saving}
              onClick={() => void persist({
                ...record,
                morning: { ...record.morning, startedAt: record.morning.startedAt ?? new Date().toISOString() },
              }, "晨間啟動已存下來。")}
            >
              {saving ? "儲存中…" : "儲存晨間啟動"}
            </button>
          </section>

          <section className="ritual-card">
            <div className="section-heading">
              <div>
                <span className="eyebrow">今日三件事</span>
                <h2>重要、喜歡、照顧自己</h2>
              </div>
              <Link href="/bingo" className="text-link">從週盤帶入</Link>
            </div>

            <div className="daily-task-list">
              {TASK_ORDER.map((category) => {
                const task = record.tasks[category];
                const meta = DAILY_TASK_CATEGORIES[category];
                return (
                  <div key={category} className={`daily-task ${task.completed ? "done" : ""}`}>
                    <button
                      className={`task-check ${task.completed ? "on" : ""}`}
                      onClick={() => void toggleTask(category)}
                      disabled={!task.text.trim() || saving}
                      aria-label={task.completed ? `將${meta.label}改回未完成` : `完成${meta.label}`}
                    >
                      {task.completed ? "✓" : ""}
                    </button>
                    <div className="task-body">
                      <label htmlFor={`task-${category}`}>{meta.label}</label>
                      <input
                        id={`task-${category}`}
                        className="field"
                        value={task.text}
                        onChange={(event) => updateTask(category, {
                          text: event.target.value,
                          origin: task.origin && event.target.value !== task.text ? null : task.origin,
                        })}
                        placeholder={meta.prompt}
                      />
                      {task.origin && <small>來自本週週盤第 {task.origin.cellIndex + 1} 格</small>}
                      {task.completed && (
                        <textarea
                          className="field compact"
                          value={task.result}
                          onChange={(event) => updateTask(category, { result: event.target.value })}
                          placeholder="完成後留下結果或感受（選填）"
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <button className="primary" disabled={saving} onClick={() => void persist(record, "今日三件事已更新。") }>
              {saving ? "儲存中…" : "儲存今日三件事"}
            </button>
          </section>

          <section className="ritual-card daytime-card">
            <span className="eyebrow">白天追蹤</span>
            <h2>留下正在發生的事</h2>
            <div className="quick-log">
              <input
                className="field"
                value={logText}
                onChange={(event) => setLogText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void addLog();
                  }
                }}
                placeholder="一句進度、感受或轉折"
              />
              <button onClick={() => void addLog()} disabled={!logText.trim() || saving}>記下</button>
            </div>
            {record.daytime.logs.length > 0 && (
              <div className="day-log-list">
                {record.daytime.logs.map((log) => (
                  <div className="day-log" key={log.id}>
                    <time>{log.time}</time>
                    <span>{log.text}</span>
                    <button onClick={() => void removeLog(log.id)} aria-label={`刪除「${log.text}」`}>×</button>
                  </div>
                ))}
              </div>
            )}

            <label htmlFor="day-note">日間札記</label>
            <textarea
              id="day-note"
              className="field journal-field"
              value={record.daytime.note}
              onChange={(event) => setRecord({ ...record, daytime: { ...record.daytime, note: event.target.value } })}
              placeholder="自由寫下今天，不需要整理成結論。"
            />
            <button className="primary" disabled={saving} onClick={() => void persist(record, "日間札記已存下來。") }>
              {saving ? "儲存中…" : "儲存日間札記"}
            </button>
          </section>

          <section className="ritual-card evening-card">
            <span className="eyebrow">晚間收光</span>
            <h2>用今天需要的深度回看</h2>
            <div className="segmented three">
              {([
                ["light", "輕"],
                ["medium", "適中"],
                ["deep", "深入"],
              ] as const).map(([depth, label]) => (
                <button
                  key={depth}
                  className={record.evening.depth === depth ? "on" : ""}
                  onClick={() => setRecord({ ...record, evening: { ...record.evening, depth } })}
                >
                  {label}
                </button>
              ))}
            </div>

            {record.evening.depth && EVENING_FIELDS[record.evening.depth].map((field) => {
              const [label, placeholder] = EVENING_LABELS[field];
              return (
                <div key={field}>
                  <label htmlFor={`evening-${field}`}>{label}</label>
                  <textarea
                    id={`evening-${field}`}
                    className="field"
                    value={record.evening[field]}
                    onChange={(event) => setRecord({
                      ...record,
                      evening: { ...record.evening, [field]: event.target.value },
                    })}
                    placeholder={placeholder}
                  />
                </div>
              );
            })}

            <label>今天怎麼結束？</label>
            <div className="closing-choice-grid">
              {([
                ["carry", "帶回明天", "把下一步放到明天的接續入口"],
                ["journal", "寫下今天", "留下復盤，不建立待辦"],
                ["pause", "暫且放下", "今天到此，不留下接續"],
              ] as const).map(([choice, label, description]) => (
                <button
                  key={choice}
                  className={record.evening.disposition === choice ? "on" : ""}
                  onClick={() => setRecord({ ...record, evening: { ...record.evening, disposition: choice } })}
                >
                  <b>{label}</b>
                  <small>{description}</small>
                </button>
              ))}
            </div>
            <button className="primary" disabled={saving} onClick={() => void saveEvening()}>
              {saving ? "收光中…" : record.evening.closedAt ? "更新今晚復盤" : "完成今晚收光"}
            </button>
          </section>

          <section className="spaces-shortcut">
            <div className="section-heading">
              <div>
                <span className="eyebrow">六個場域</span>
                <h2>需要時再走進去</h2>
              </div>
              <Link href="/map" className="text-link">完整場域圖</Link>
            </div>
            <div className="grid">
              {(Object.entries(SPACES) as [SpaceKey, (typeof SPACES)[SpaceKey]][]).map(([key, value]) => (
                <Link key={key} href={`/${key}`} className={`space-link ${value[1]}`}>
                  <span className="dot" />
                  <b>{value[0]}</b>
                  <small>{value[2]}</small>
                </Link>
              ))}
            </div>
          </section>
        </>
      )}
    </section>
  );
}
