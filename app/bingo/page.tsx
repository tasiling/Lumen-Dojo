"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  DAILY_TASK_CATEGORIES,
  addCalendarDays,
  completedBingoLines,
  emptyWeeklyBoard,
  mondayOf,
  taipeiTodayISO,
  type DailyRecord,
  type DailyTaskCategory,
  type WeeklyBoard,
} from "@/lib/dojo/formal";

const CATEGORIES: DailyTaskCategory[] = ["important", "hobby", "health"];

function fmtWeek(weekStart: string) {
  const end = addCalendarDays(weekStart, 6);
  const compact = (iso: string) => {
    const [, month, day] = iso.split("-");
    return `${Number(month)}/${Number(day)}`;
  };
  return `${compact(weekStart)} — ${compact(end)}`;
}

async function readResponse<T>(response: Response): Promise<T> {
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((json as { error?: string }).error ?? `操作失敗（${response.status}）`);
  return json as T;
}

export default function BingoPage() {
  const today = useMemo(() => taipeiTodayISO(), []);
  const [weekStart, setWeekStart] = useState(() => mondayOf(today));
  const [board, setBoard] = useState<WeeklyBoard>(() => emptyWeeklyBoard(weekStart));
  const [selected, setSelected] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showArchive, setShowArchive] = useState(false);
  const [archiveBoards, setArchiveBoards] = useState<WeeklyBoard[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      setNotice(null);
      setSelected(null);
      setEditing(false);
      try {
        const response = await fetch(`/api/dojo/bingo?week=${weekStart}`, { cache: "no-store" });
        const json = await readResponse<{ board: WeeklyBoard }>(response);
        if (!cancelled) setBoard(json.board);
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
  }, [weekStart]);

  async function save(next: WeeklyBoard, message?: string) {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/dojo/bingo", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekStart, board: next }),
      });
      const json = await readResponse<{ board: WeeklyBoard }>(response);
      setBoard(json.board);
      if (message) setNotice(message);
      return json.board;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      throw caught;
    } finally {
      setSaving(false);
    }
  }

  async function toggleSelected() {
    if (selected === null || selected === 12 || board.archivedAt) return;
    const current = board.cells[selected];
    if (!current.text.trim()) return;
    if (current.assignedDate && current.assignedCategory) {
      setSaving(true);
      setError(null);
      setNotice(null);
      try {
        const response = await fetch("/api/dojo/flow", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "complete-task",
            date: current.assignedDate,
            category: current.assignedCategory,
            completed: !current.completed,
          }),
        });
        const json = await readResponse<{ board: WeeklyBoard | null }>(response);
        if (!json.board) throw new Error("今天的任務連結已變更，請重新排入今天。");
        setBoard(json.board);
        setNotice(current.completed ? "今天與週盤都已改回未完成。" : "今天與週盤都已同步完成。");
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
      } finally {
        setSaving(false);
      }
      return;
    }
    const cells = board.cells.map((cell) =>
      cell.index === selected
        ? { ...cell, completed: !cell.completed, completedAt: cell.completed ? null : new Date().toISOString() }
        : cell
    );
    try {
      await save({ ...board, cells }, current.completed ? "已改回未完成。" : "完成狀態已存下來。");
    } catch {
      // save() 已顯示錯誤。
    }
  }

  async function assignToToday(category: DailyTaskCategory) {
    if (selected === null || selected === 12 || board.archivedAt) return;
    const cell = board.cells[selected];
    if (!cell.text.trim()) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const dailyResponse = await fetch(`/api/dojo/daily?date=${today}`, { cache: "no-store" });
      const dailyJson = await readResponse<{ record: DailyRecord }>(dailyResponse);
      const existing = dailyJson.record.tasks[category].text.trim();
      if (existing && existing !== cell.text.trim()) {
        const replace = window.confirm(`「${DAILY_TASK_CATEGORIES[category].label}」已有內容，要用這一格取代嗎？`);
        if (!replace) return;
      }
      const response = await fetch("/api/dojo/flow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "assign-bingo", weekStart, cellIndex: selected, date: today, category }),
      });
      const json = await readResponse<{ board: WeeklyBoard }>(response);
      setBoard(json.board);
      setNotice(`已排入今天的「${DAILY_TASK_CATEGORIES[category].label}」。`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
    }
  }

  async function archiveBoard() {
    if (board.archivedAt) return;
    const confirmed = window.confirm("封存後仍可回看，但這週盤將不能再編輯。確定封存嗎？");
    if (!confirmed) return;
    try {
      await save({ ...board, archivedAt: new Date().toISOString() }, "本週週盤已封存。");
    } catch {
      // save() 已顯示錯誤。
    }
  }

  async function loadArchive() {
    const next = !showArchive;
    setShowArchive(next);
    if (!next || archiveBoards.length) return;
    try {
      const response = await fetch("/api/dojo/bingo?archive=true", { cache: "no-store" });
      const json = await readResponse<{ boards: WeeklyBoard[] }>(response);
      setArchiveBoards(json.boards);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  const completed = board.cells.filter((cell) => cell.index !== 12 && cell.completed).length;
  const selectedCell = selected === null ? null : board.cells[selected];

  return (
    <section className="screen bingo-screen">
      <div className="section-heading page-heading">
        <div>
          <span className="eyebrow">週 Bingo</span>
          <h1>本週行光盤</h1>
          <p className="lead">把想推進的事放進一週，完成會同步回今天。</p>
        </div>
        <button onClick={() => void loadArchive()}>{showArchive ? "收起封存" : "封存紀錄"}</button>
      </div>

      <div className="week-switcher">
        <button onClick={() => setWeekStart(addCalendarDays(weekStart, -7))}>← 上週</button>
        <button className="week-label" onClick={() => setWeekStart(mondayOf(today))}>{fmtWeek(weekStart)}</button>
        <button onClick={() => setWeekStart(addCalendarDays(weekStart, 7))}>下週 →</button>
      </div>

      {error && <p className="form-error" role="alert">{error}</p>}
      {notice && <p className="save-notice" role="status">{notice}</p>}
      {loading && <div className="empty">正在讀取週盤…</div>}

      {showArchive && (
        <section className="ritual-card archive-list">
          <h2>週盤封存</h2>
          {archiveBoards.filter((item) => item.archivedAt).length === 0 ? (
            <div className="empty">還沒有封存的週盤。</div>
          ) : (
            archiveBoards.filter((item) => item.archivedAt).map((item) => (
              <button key={item.weekStart} onClick={() => { setWeekStart(item.weekStart); setShowArchive(false); }}>
                <b>{item.title}</b>
                <small>{fmtWeek(item.weekStart)} · {item.cells.filter((cell) => cell.index !== 12 && cell.completed).length}/24 · {completedBingoLines(item)} 連線</small>
              </button>
            ))
          )}
        </section>
      )}

      {!loading && (
        <>
          <section className="ritual-card board-card">
            <div className="section-heading">
              <div>
                <input
                  className="board-title"
                  value={board.title}
                  disabled={!editing || Boolean(board.archivedAt)}
                  onChange={(event) => setBoard({ ...board, title: event.target.value })}
                  aria-label="週盤名稱"
                />
                <p>{completed}/24 完成 · {completedBingoLines(board)} 條連線</p>
              </div>
              {board.archivedAt ? (
                <span className="saved-mark">已封存</span>
              ) : (
                <button onClick={() => setEditing((value) => !value)}>{editing ? "完成編輯" : "編輯格子"}</button>
              )}
            </div>

            <div className={`bingo-grid ${editing ? "editing" : ""}`}>
              {board.cells.map((cell) =>
                editing && cell.index !== 12 ? (
                  <textarea
                    key={cell.index}
                    value={cell.text}
                    maxLength={80}
                    disabled={Boolean(cell.assignedDate)}
                    title={cell.assignedDate ? "已排入今天的格子請先在今天完成或改回" : undefined}
                    onChange={(event) => setBoard({
                      ...board,
                      cells: board.cells.map((item) => item.index === cell.index
                        ? { ...item, text: event.target.value, completed: event.target.value.trim() ? item.completed : false }
                        : item),
                    })}
                    placeholder={`${cell.index + 1}`}
                    aria-label={`第 ${cell.index + 1} 格`}
                  />
                ) : (
                  <button
                    key={cell.index}
                    className={`bingo-cell ${cell.completed ? "done" : ""} ${selected === cell.index ? "selected" : ""} ${cell.index === 12 ? "free" : ""}`}
                    onClick={() => cell.index !== 12 && setSelected(cell.index)}
                    disabled={cell.index !== 12 && !cell.text.trim()}
                  >
                    <span>{cell.text || "空格"}</span>
                    {cell.completed && <i>✓</i>}
                    {cell.assignedDate && <small>已排入 {cell.assignedDate.slice(5)}</small>}
                  </button>
                )
              )}
            </div>

            {editing && (
              <button className="primary" disabled={saving} onClick={() => void save(board, "週盤格子已儲存。") }>
                {saving ? "儲存中…" : "儲存週盤"}
              </button>
            )}
          </section>

          {selectedCell && !editing && !board.archivedAt && (
            <section className="ritual-card selected-cell-panel">
              <span className="eyebrow">第 {selectedCell.index + 1} 格</span>
              <h2>{selectedCell.text}</h2>
              <div className="two">
                <button onClick={() => void toggleSelected()} disabled={saving}>
                  {selectedCell.completed ? "改回未完成" : "標記完成"}
                </button>
                <Link href="/" className="button-link">查看今天</Link>
              </div>
              <p className="lead">排進今天的哪一格？之後在今天完成時，這格會一起完成。</p>
              <div className="row">
                {CATEGORIES.map((category) => (
                  <button key={category} onClick={() => void assignToToday(category)} disabled={saving}>
                    {DAILY_TASK_CATEGORIES[category].label}
                  </button>
                ))}
              </div>
            </section>
          )}

          <section className="ritual-card">
            <span className="eyebrow">每週回望</span>
            <h2>為這一週留下脈絡</h2>
            <label htmlFor="week-bright">這週最亮的一格</label>
            <textarea id="week-bright" className="field" disabled={Boolean(board.archivedAt)} value={board.reflection.brightSpot} onChange={(event) => setBoard({ ...board, reflection: { ...board.reflection, brightSpot: event.target.value } })} />
            <label htmlFor="week-adjust">想調整什麼</label>
            <textarea id="week-adjust" className="field" disabled={Boolean(board.archivedAt)} value={board.reflection.adjustment} onChange={(event) => setBoard({ ...board, reflection: { ...board.reflection, adjustment: event.target.value } })} />
            <label htmlFor="week-next">下週想聚焦的方向</label>
            <textarea id="week-next" className="field" disabled={Boolean(board.archivedAt)} value={board.reflection.nextFocus} onChange={(event) => setBoard({ ...board, reflection: { ...board.reflection, nextFocus: event.target.value } })} />
            {!board.archivedAt && (
              <div className="two">
                <button className="primary" disabled={saving} onClick={() => void save(board, "每週回望已儲存。")}>儲存回望</button>
                <button disabled={saving} onClick={() => void archiveBoard()}>封存本週</button>
              </div>
            )}
          </section>
        </>
      )}
    </section>
  );
}
