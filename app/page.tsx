"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import EntryMeasurePanel from "@/app/components/EntryMeasurePanel";
import { carryDateOptions, fmtDateWD } from "@/lib/closing/notionFormat";
import { SPACES, type SpaceKey } from "@/lib/dojo/constants";
import type { PersonalContinuation } from "@/lib/dojo/continuations";
import {
  DAILY_TASK_CATEGORIES,
  completedBingoLines,
  emptyDailyRecord,
  mondayOf,
  taipeiTodayISO,
  type DailyRecord,
  type DailyTaskCategory,
  type MorningDepth,
  type WeeklyBoard,
} from "@/lib/dojo/formal";
import { useDojo } from "@/lib/dojo/store";

const TASK_ORDER: DailyTaskCategory[] = ["important", "hobby", "health"];
const EVENING_FIELDS = {
  light: ["highlight"],
  medium: ["highlight", "block"],
  deep: ["highlight", "block", "insight", "nextAction"],
} as const;

const MORNING_DEPTHS: { key: MorningDepth; label: string; note: string }[] = [
  { key: "light", label: "輕", note: "狀態與定向" },
  { key: "medium", label: "適中", note: "加上感恩與肯定" },
  { key: "deep", label: "深入", note: "再寫未來日記" },
];

const EVENING_LABELS = {
  highlight: ["今天的一束光", "今天值得留下的片刻"],
  block: ["卡住的地方", "哪裡消耗了你？"],
  insight: ["看見了什麼", "今天多明白了一點什麼？"],
  nextAction: ["下一步", "下一次想怎麼做？"],
} as const;

const REFLECTION_PROMPTS = {
  highlight: ["今天做得好的一件事", "今天經歷的美好時刻", "一個想感謝的人或片刻"],
  block: ["今天想改善的問題", "哪個地方消耗最多", "如果重來一次，會調整什麼"],
} as const;

function formatToday(dateISO: string) {
  return new Intl.DateTimeFormat("zh-TW", {
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(new Date(`${dateISO}T12:00:00+08:00`));
}

function carryOptionLabel(iso: string, index: number) {
  const prefix = index === 0 ? "明天" : index === 1 ? "後天" : `第 ${index + 1} 天`;
  return `${prefix} · ${fmtDateWD(iso)}`;
}

async function readResponse<T>(response: Response): Promise<T> {
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((json as { error?: string }).error ?? `操作失敗（${response.status}）`);
  return json as T;
}

export default function TodayPage() {
  const { entries, entriesLoading, entriesError } = useDojo();
  const date = useMemo(() => taipeiTodayISO(), []);
  const weekStart = useMemo(() => mondayOf(date), [date]);
  const carryOptions = useMemo(() => carryDateOptions(date), [date]);
  const todayEntries = useMemo(() => entries.filter((entry) => entry.date === date), [date, entries]);
  const [record, setRecord] = useState<DailyRecord>(() => emptyDailyRecord(date));
  const [board, setBoard] = useState<WeeklyBoard | null>(null);
  const [continuations, setContinuations] = useState<PersonalContinuation[]>([]);
  const [continuationError, setContinuationError] = useState<string | null>(null);
  const [resolvingContinuation, setResolvingContinuation] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [eveningError, setEveningError] = useState<string | null>(null);
  const [eveningFeedback, setEveningFeedback] = useState<string | null>(null);
  const [logText, setLogText] = useState("");
  const [readingVisitCount, setReadingVisitCount] = useState(0);

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

      try {
        const response = await fetch("/api/dojo/continuations", { cache: "no-store" });
        const json = await readResponse<{ cards: PersonalContinuation[] }>(response);
        if (!cancelled) {
          setContinuations(json.cards ?? []);
          setContinuationError(null);
        }
      } catch (caught) {
        if (!cancelled) setContinuationError(caught instanceof Error ? caught.message : String(caught));
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [date, weekStart]);

  useEffect(() => {
    let cancelled = false;
    async function loadReadingVisits() {
      try {
        const response = await fetch("/api/dojo/reading/cards?view=due&countOnly=true", { cache: "no-store" });
        const json = await readResponse<{ count: number }>(response);
        if (!cancelled) setReadingVisitCount(Math.max(0, json.count ?? 0));
      } catch {
        // 閱讀回訪是今天頁的輕量提醒；讀取失敗不應阻擋晨間、三件事或收光。
      }
    }
    void loadReadingVisits();
    return () => { cancelled = true; };
  }, []);

  async function writeDaily(next: DailyRecord) {
    const response = await fetch("/api/dojo/daily", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, record: next }),
    });
    const json = await readResponse<{ record: DailyRecord }>(response);
    setRecord(json.record);
    return json.record;
  }

  async function persist(next: DailyRecord, message?: string) {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const saved = await writeDaily(next);
      if (message) setNotice(message);
      return saved;
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

  function addReflectionPrompt(field: "highlight" | "block", prompt: string) {
    setEveningFeedback(null);
    setRecord((current) => {
      if (current.evening[field].includes(prompt)) return current;
      const prefix = current.evening[field].trim() ? `${current.evening[field].trim()}\n` : "";
      return {
        ...current,
        evening: { ...current.evening, [field]: `${prefix}${prompt}：` },
      };
    });
  }

  async function saveEvening() {
    const disposition = record.evening.disposition;
    setEveningError(null);
    setEveningFeedback(null);
    if (!disposition) {
      setEveningError("請選擇帶回、寫下今天或暫且放下。");
      return;
    }
    if (disposition === "journal" && !record.evening.depth) {
      setEveningError("請先選擇今晚要用輕、適中或深入復盤。");
      return;
    }
    if (disposition === "carry" && !record.evening.carryNote.trim()) {
      setEveningError("請寫下想帶回的念頭、問題或下一步。");
      return;
    }
    if (disposition === "carry" && !record.evening.carryToDate) {
      setEveningError("請選擇要在哪一天重新接住它。");
      return;
    }

    let overwrite = false;
    if (record.evening.closedAt) {
      overwrite = window.confirm("今天已經完成收光。要用這次內容取代原本紀錄嗎？");
      if (!overwrite) return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/dojo/evening", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, record, overwrite }),
      });
      const json = await readResponse<{ record: DailyRecord }>(response);
      setRecord(json.record);
      if (disposition === "journal") {
        setEveningFeedback("晚間復盤已收進今天，之後可在回看找到。");
      } else if (disposition === "pause") {
        setEveningFeedback("今晚已暫且放下；沒有建立待辦，也不需要現在解決。");
      } else {
        const carriedDate = json.record.evening.carryToDate ?? record.evening.carryToDate;
        setEveningFeedback(
          `已把這段接續帶到 ${carriedDate ? fmtDateWD(carriedDate) : "指定日期"}。未完成任務仍留在本週 Bingo。`
        );
      }
    } catch (caught) {
      setEveningError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
    }
  }

  async function resolveContinuation(card: PersonalContinuation) {
    setResolvingContinuation(card.id);
    setContinuationError(null);
    try {
      const response = await fetch("/api/dojo/continuations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: card.source, id: card.id, createdDate: card.createdDate }),
      });
      await readResponse<{ ok: true }>(response);
      setContinuations((current) => current.filter((item) => !(item.source === card.source && item.id === card.id)));
    } catch (caught) {
      setContinuationError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setResolvingContinuation(null);
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

      {continuations.length > 0 && (
        <section className="continuation-section" aria-labelledby="continuation-title">
          <div className="section-heading">
            <div>
              <span className="eyebrow">帶回今天</span>
              <h2 id="continuation-title">先接住之前留下的話</h2>
            </div>
          </div>
          <div className="continuation-list">
            {continuations.map((card) => (
              <article className="continuation-card" key={`${card.source}:${card.id}`}>
                <small>{fmtDateWD(card.createdDate)} 留下 · {fmtDateWD(card.carryToDate)} 帶回</small>
                <p>{card.text}</p>
                <button
                  type="button"
                  disabled={resolvingContinuation === card.id}
                  onClick={() => void resolveContinuation(card)}
                >
                  {resolvingContinuation === card.id ? "處理中…" : "這段已接住"}
                </button>
              </article>
            ))}
          </div>
        </section>
      )}
      {continuationError && <p className="form-error" role="alert">接續內容暫時無法讀取：{continuationError}</p>}

      {readingVisitCount > 0 && (
        <Link className="reading-today-reminder" href="/reading/visits">
          <span>閱讀回訪</span>
          <div><b>今天有 {readingVisitCount} 張洞察卡到期</b><small>回來看看：做了嗎，結果如何？</small></div>
          <i>→</i>
        </Link>
      )}

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
              {record.morning.startedAt && <span className="saved-mark">{
                record.morning.depth === "deep" ? "深層" : record.morning.depth === "medium" ? "中層" : "輕層"
              }</span>}
            </div>

            <label>今天想寫到多深？</label>
            <div className="segmented three morning-depth-picker">
              {MORNING_DEPTHS.map((depth) => (
                <button
                  type="button"
                  key={depth.key}
                  className={(record.morning.depth ?? "light") === depth.key ? "on" : ""}
                  onClick={() => setRecord((current) => ({
                    ...current,
                    morning: { ...current.morning, depth: depth.key },
                  }))}
                >
                  <b>{depth.label}</b>
                  <small>{depth.note}</small>
                </button>
              ))}
            </div>

            <label>現在的狀態</label>
            <div className="segmented three">
              {(["低", "穩", "亮"] as const).map((state) => (
                <button
                  type="button"
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

            {(record.morning.depth === "medium" || record.morning.depth === "deep") && (
              <section className="morning-layer-fields">
                <div className="morning-layer-heading">
                  <b>中層書寫</b>
                  <small>感恩與肯定句</small>
                </div>
                <label htmlFor="morning-gratitude">我很感恩的三件事</label>
                <textarea
                  id="morning-gratitude"
                  className="field"
                  value={record.morning.gratitude}
                  onChange={(event) => setRecord((current) => ({
                    ...current,
                    morning: { ...current.morning, gratitude: event.target.value },
                  }))}
                  placeholder="想寫多少都可以，不必湊滿三件。"
                />
                <label htmlFor="morning-affirmation">我的正向肯定句</label>
                <textarea
                  id="morning-affirmation"
                  className="field"
                  value={record.morning.affirmation}
                  onChange={(event) => setRecord((current) => ({
                    ...current,
                    morning: { ...current.morning, affirmation: event.target.value },
                  }))}
                  placeholder="今天想對自己說的一句話"
                />
              </section>
            )}
            {record.morning.depth === "deep" && (
              <section className="morning-layer-fields deep">
                <div className="morning-layer-heading">
                  <b>深層書寫</b>
                  <small>把想走向的生活先寫下來</small>
                </div>
                <label htmlFor="morning-future-journal">我的未來日記</label>
                <textarea
                  id="morning-future-journal"
                  className="field"
                  value={record.morning.futureJournal}
                  onChange={(event) => setRecord((current) => ({
                    ...current,
                    morning: { ...current.morning, futureJournal: event.target.value },
                  }))}
                  placeholder="用已經發生的語氣，寫下想走向的畫面。"
                />
              </section>
            )}

            <button
              type="button"
              className="primary"
              disabled={saving}
              onClick={() => void persist({
                ...record,
                morning: {
                  ...record.morning,
                  depth: record.morning.depth ?? "light",
                  startedAt: record.morning.startedAt ?? new Date().toISOString(),
                },
              }, `晨間${record.morning.depth === "deep" ? "深層" : record.morning.depth === "medium" ? "中層" : "輕層"}已存下來。`)}
            >
              {saving ? "儲存中…" : "儲存晨間啟動"}
            </button>
          </section>

          <section className="ritual-card">
            <div className="section-heading">
              <div>
                <span className="eyebrow">晨間啟動 · 今日安排</span>
                <h2>規劃今天的三件事</h2>
              </div>
              <Link href="/bingo" className="text-link">從週盤帶入</Link>
            </div>

            <div className="daily-task-list">
              {TASK_ORDER.map((category) => {
                const task = record.tasks[category];
                const meta = DAILY_TASK_CATEGORIES[category];
                return (
                  <div key={category} className={`daily-task ${category} ${task.completed ? "done" : ""}`}>
                    <button
                      type="button"
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
            <button type="button" className="primary" disabled={saving} onClick={() => void persist(record, "今天的三件事已更新。") }>
              {saving ? "儲存中…" : "儲存今天的三件事"}
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
              <button type="button" onClick={() => void addLog()} disabled={!logText.trim() || saving}>記下</button>
            </div>
            {record.daytime.logs.length > 0 && (
              <div className="day-log-list">
                {record.daytime.logs.map((log) => (
                  <div className="day-log" key={log.id}>
                    <time>{log.time}</time>
                    <span>{log.text}</span>
                    <button type="button" onClick={() => void removeLog(log.id)} aria-label={`刪除「${log.text}」`}>×</button>
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
            <button type="button" className="primary" disabled={saving} onClick={() => void persist(record, "日間札記已存下來。") }>
              {saving ? "儲存中…" : "儲存日間札記"}
            </button>
          </section>

          <section className="ritual-card evening-card" id="today-closing">
            <div className="section-heading">
              <div>
                <span className="eyebrow">晚間收光</span>
                <h2>今晚想怎麼承接自己？</h2>
              </div>
              {record.evening.closedAt && <span className="saved-mark">已收光</span>}
            </div>

            <details className="measure-disclosure">
              <summary>
                <span>片刻測頻</span>
                <small>只標記值得回看的片刻 · 選填</small>
              </summary>
              <div className="measure-disclosure-body">
                <p>頻率與投入強度不是每天必填，也不會被平均成一天的分數。</p>
                {entriesLoading && <small>正在讀取今天的片刻…</small>}
                {entriesError && <p className="form-error">{entriesError}</p>}
                {!entriesLoading && todayEntries.length === 0 && (
                  <small>今天還沒有六個場域的片刻；需要時可用下方「新增」留下。</small>
                )}
                {todayEntries.map((entry) => (
                  <article className="measure-entry" key={entry.id}>
                    <div>
                      <small>{SPACES[entry.space][0]} · {entry.kind}</small>
                      <b>{entry.title}</b>
                    </div>
                    <EntryMeasurePanel entry={entry} />
                  </article>
                ))}
              </div>
            </details>

            <p className="section-guide">選一種今晚真正需要的收束；三個選項各自有完整流程。</p>
            <div className="closing-choice-grid">
              {([
                ["journal", "寫下今天", "留下一束光，也可往卡點、洞察與下一步深入"],
                ["carry", "帶回", "把一段念頭、問題或下一步帶到指定日期"],
                ["pause", "暫且放下", "今天到此，不建立待辦或接續"],
              ] as const).map(([choice, label, description]) => (
                <button
                  type="button"
                  key={choice}
                  className={record.evening.disposition === choice ? "on" : ""}
                  aria-pressed={record.evening.disposition === choice}
                  onClick={() => {
                    setEveningError(null);
                    setEveningFeedback(null);
                    setRecord((current) => ({
                      ...current,
                      evening: { ...current.evening, disposition: choice },
                    }));
                  }}
                >
                  <b>{label}</b>
                  <small>{description}</small>
                </button>
              ))}
            </div>

            {eveningError && <p className="form-error closing-inline-message" role="alert">{eveningError}</p>}
            {eveningFeedback && (
              <div className="closing-success" role="status">
                <b>今晚已收好</b>
                <p>{eveningFeedback}</p>
                <button type="button" onClick={() => setEveningFeedback(null)}>修改今晚的選擇</button>
              </div>
            )}

            {!eveningFeedback && record.evening.disposition === "journal" && (
              <div className="closing-flow-panel journal" aria-live="polite">
                <label>今天想回看到多深？</label>
                <div className="segmented three evening-depth-picker">
                  {([
                    ["light", "輕"],
                    ["medium", "適中"],
                    ["deep", "深入"],
                  ] as const).map(([depth, label]) => (
                    <button
                      type="button"
                      key={depth}
                      className={record.evening.depth === depth ? "on" : ""}
                      aria-pressed={record.evening.depth === depth}
                      onClick={() => setRecord((current) => ({
                        ...current,
                        evening: { ...current.evening, depth },
                      }))}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {record.evening.depth && EVENING_FIELDS[record.evening.depth].map((field) => {
                  const [label, placeholder] = EVENING_LABELS[field];
                  const prompts = field === "highlight" || field === "block" ? REFLECTION_PROMPTS[field] : null;
                  return (
                    <div key={field}>
                      <label htmlFor={`evening-${field}`}>{label}</label>
                      {prompts && (
                        <div className="prompt-chip-list" aria-label={`${label}書寫提示`}>
                          {prompts.map((prompt) => (
                            <button
                              type="button"
                              key={prompt}
                              onClick={() => {
                                if (field === "highlight" || field === "block") addReflectionPrompt(field, prompt);
                              }}
                            >
                              {prompt}
                            </button>
                          ))}
                        </div>
                      )}
                      <textarea
                        id={`evening-${field}`}
                        className="field"
                        value={record.evening[field]}
                        onChange={(event) => setRecord((current) => ({
                          ...current,
                          evening: { ...current.evening, [field]: event.target.value },
                        }))}
                        placeholder={placeholder}
                      />
                    </div>
                  );
                })}

                <button type="button" className="primary" disabled={saving} onClick={() => void saveEvening()}>
                  {saving ? "收光中…" : record.evening.closedAt ? "更新今晚復盤" : "完成並儲存日復盤"}
                </button>
              </div>
            )}

            {!eveningFeedback && record.evening.disposition === "carry" && (
              <div className="closing-flow-panel carry" aria-live="polite">
                <b>把一段話帶到之後</b>
                <p>這裡承接的是念頭、問題或下一步；未完成任務會留在本週 Bingo，不會被複製。</p>
                <label htmlFor="carry-note">想帶回什麼？</label>
                <textarea
                  id="carry-note"
                  className="field"
                  value={record.evening.carryNote}
                  onChange={(event) => setRecord((current) => ({
                    ...current,
                    evening: { ...current.evening, carryNote: event.target.value },
                  }))}
                  placeholder="一個還想想看的問題、一段提醒，或下一次想試的小動作。"
                />
                <label>在哪一天重新接住？</label>
                <div className="carry-date-grid">
                  {carryOptions.map((option, index) => (
                    <button
                      type="button"
                      key={option}
                      className={record.evening.carryToDate === option ? "on" : ""}
                      aria-pressed={record.evening.carryToDate === option}
                      onClick={() => setRecord((current) => ({
                        ...current,
                        evening: { ...current.evening, carryToDate: option },
                      }))}
                    >
                      {carryOptionLabel(option, index)}
                    </button>
                  ))}
                </div>
                <button type="button" className="primary" disabled={saving} onClick={() => void saveEvening()}>
                  {saving ? "帶回中…" : "確認帶回"}
                </button>
              </div>
            )}

            {!eveningFeedback && record.evening.disposition === "pause" && (
              <div className="closing-flow-panel pause" aria-live="polite">
                <b>今晚到此，暫且放下</b>
                <p>會留下今天選擇結束的紀錄，不建立明日待辦，也不要求你現在整理出答案。</p>
                <button type="button" className="primary" disabled={saving} onClick={() => void saveEvening()}>
                  {saving ? "收光中…" : "確認暫且放下"}
                </button>
              </div>
            )}
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
