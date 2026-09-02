"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import EnglishWeeklyPlanner from "@/app/components/EnglishWeeklyPlanner";
import ReadingInsightPlanner from "@/app/components/ReadingInsightPlanner";
import WeeklySetupPlanner from "@/app/components/WeeklySetupPlanner";
import {
  DAILY_TASK_CATEGORIES,
  addCalendarDays,
  completedBingoLines,
  emptyWeeklyBoard,
  mondayOf,
  taipeiTodayISO,
  type DailyRecord,
  type DailyTaskCategory,
  type BingoCell,
  type WeeklyBoard,
} from "@/lib/dojo/formal";
import type { LearningTrackRecord } from "@/lib/dojo/learning";
import { useBackableState } from "@/lib/dojo/backstack";

const CATEGORIES: DailyTaskCategory[] = ["important", "hobby", "health"];
const ENGLISH_CELL_SHORT_LABELS: Record<string, string> = {
  "journal-translation": "日記自譯",
  "vocabforge-journal-round": "生詞一輪",
  "vocabforge-journal-round-1": "生詞第一輪",
  "vocabforge-journal-round-2": "生詞第二輪",
  "work-five-expressions": "說法實戰",
  "speaking-scenario": "情境對話",
  "shadowing-twice": "跟讀 ×2",
  "speaking-maintenance": "口說維持",
  "topic-select-video": "主題選片",
  "topic-watch-absorb": "觀看吸收",
  "topic-context-talk": "主題對談",
  "magic-tree-house-read": "故事閱讀",
  "magic-tree-house-retell": "讀後重述",
  "english-context-chat": "語境聊天",
  "journal-translation-1": "自譯一段",
  "journal-translation-2": "再譯一段",
  "vocabforge-one-round": "詞彙一輪",
  "work-expression-practice": "工作實戰",
};

function bingoCellShortLabel(cell: BingoCell) {
  return cell.shortLabel.trim() || (cell.learning?.trackKey === "english" ? ENGLISH_CELL_SHORT_LABELS[cell.learning.templateKey] : "") || cell.text;
}

function fmtWeek(weekStart: string) {
  const end = addCalendarDays(weekStart, 6);
  const compact = (iso: string) => {
    const [, month, day] = iso.split("-");
    return `${Number(month)}/${Number(day)}`;
  };
  return `${compact(weekStart)} — ${compact(end)}`;
}

function shuffledBoard(board: WeeklyBoard): WeeklyBoard {
  const movable = board.cells.filter((cell) => cell.index !== 12);
  const shuffled = [...movable];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapWith = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapWith]] = [shuffled[swapWith], shuffled[index]];
  }
  if (shuffled.every((cell, index) => cell.index === movable[index].index)) {
    shuffled.push(shuffled.shift()!);
  }
  let cursor = 0;
  return {
    ...board,
    cells: board.cells.map((cell) => {
      if (cell.index === 12) return cell;
      const moved = shuffled[cursor];
      cursor += 1;
      return { ...moved, index: cell.index };
    }),
  };
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
  const [englishTrack, setEnglishTrack] = useState<LearningTrackRecord | null>(null);
  const [evidenceNote, setEvidenceNote] = useState("");
  const [shortLabelDraft, setShortLabelDraft] = useState("");
  const [cellEditOpen, setCellEditOpen] = useState(false);
  const [cellTextDraft, setCellTextDraft] = useState("");
  const [criteriaDraft, setCriteriaDraft] = useState("");
  const [targetDraft, setTargetDraft] = useState("1");
  const [unitDraft, setUnitDraft] = useState("次");
  const [boardSettingsOpen, setBoardSettingsOpen] = useState(false);
  const [boardTitleDraft, setBoardTitleDraft] = useState("本週行光盤");
  const detailOpen = selected !== null && !editing;

  useBackableState(detailOpen, () => setSelected(null));
  useBackableState(boardSettingsOpen, () => setBoardSettingsOpen(false));

  useEffect(() => {
    if (!detailOpen && !boardSettingsOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [detailOpen, boardSettingsOpen]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      setNotice(null);
      setSelected(null);
      setEditing(false);
      setBoardSettingsOpen(false);
      try {
        const [boardResponse, learningResponse] = await Promise.all([
          fetch(`/api/dojo/bingo?week=${weekStart}`, { cache: "no-store" }),
          fetch("/api/dojo/learning", { cache: "no-store" }),
        ]);
        const json = await readResponse<{ board: WeeklyBoard }>(boardResponse);
        const learning = await readResponse<{ tracks: LearningTrackRecord[] }>(learningResponse);
        if (!cancelled) {
          setBoard(json.board);
          setBoardTitleDraft(json.board.title);
          setEnglishTrack(learning.tracks.find((track) => track.key === "english") ?? null);
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
  }, [weekStart]);

  function openCell(index: number) {
    const cell = board.cells[index];
    setSelected(index);
    setEvidenceNote(cell.evidenceNote);
    setShortLabelDraft(bingoCellShortLabel(cell));
    setCellTextDraft(cell.text);
    setCriteriaDraft(cell.completion.criteria ?? "");
    setTargetDraft(String(cell.completion.target));
    setUnitDraft(cell.completion.unit);
    setCellEditOpen(false);
  }

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

  async function removeCells(indexes: number[], label: string) {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/dojo/bingo", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remove-cells", weekStart, cellIndexes: indexes }),
      });
      const json = await readResponse<{ board: WeeklyBoard; removed: number; preservedDailyTasks: number }>(response);
      setBoard(json.board);
      setSelected(null);
      setCellEditOpen(false);
      const preserved = json.preservedDailyTasks > 0 ? `；${json.preservedDailyTasks} 筆今天任務已保留並解除週盤連結` : "";
      setNotice(`已從本週移除「${label}」${json.removed} 格${preserved}。`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      throw caught;
    } finally {
      setSaving(false);
    }
  }

  async function saveCellEdit() {
    if (selected === null || board.archivedAt) return;
    const text = cellTextDraft.trim();
    const target = Math.max(1, Math.min(99, Math.round(Number(targetDraft) || 1)));
    const unit = unitDraft.trim().slice(0, 20) || "次";
    if (!text) {
      setError("任務名稱不能留空；若不需要這格，請使用「從本週刪除」。");
      return;
    }
    const next: WeeklyBoard = {
      ...board,
      colorsConfirmedAt: null,
      cells: board.cells.map((cell) => {
        if (cell.index !== selected) return cell;
        const progress = Math.min(target, cell.completion.progress);
        const completed = progress >= target;
        return {
          ...cell,
          text: text.slice(0, 300),
          shortLabel: shortLabelDraft.trim().slice(0, 12),
          completion: {
            ...cell.completion,
            mode: target > 1 ? "count" : "single",
            target,
            progress,
            unit,
            criteria: criteriaDraft.trim().slice(0, 1000),
          },
          completed,
          completedAt: completed ? (cell.completedAt ?? new Date().toISOString()) : null,
        };
      }),
    };
    try {
      const saved = await save(next, "任務內容與完成條件已更新；請重新確認本週三色。");
      const cell = saved.cells[selected];
      setCellTextDraft(cell.text);
      setShortLabelDraft(bingoCellShortLabel(cell));
      setCriteriaDraft(cell.completion.criteria ?? "");
      setTargetDraft(String(cell.completion.target));
      setUnitDraft(cell.completion.unit);
      setCellEditOpen(false);
    } catch { /* save 已顯示錯誤 */ }
  }

  async function removeSelectedCell() {
    if (selected === null || board.archivedAt) return;
    const cell = board.cells[selected];
    const detail = cell.assignedDate
      ? "已排入今天的任務會保留，但會解除週盤連結。"
      : cell.completed ? "已完成的生活與學習紀錄會保留。" : "";
    if (!window.confirm(`確定從本週刪除「${bingoCellShortLabel(cell)}」嗎？${detail}`)) return;
    try { await removeCells([selected], bingoCellShortLabel(cell)); } catch { /* removeCells 已顯示錯誤 */ }
  }

  async function saveBoardTitle() {
    const title = boardTitleDraft.trim();
    if (!title) { setError("週盤名稱不能留空。"); return; }
    try {
      await save({ ...board, title: title.slice(0, 200) }, "週盤名稱已更新。");
      setBoardSettingsOpen(false);
    } catch { /* save 已顯示錯誤 */ }
  }

  async function deleteBoard() {
    if (board.archivedAt) return;
    const contentCount = board.cells.filter((cell) => cell.index !== 12 && cell.text.trim()).length;
    const confirmed = window.confirm(`確定刪除 ${fmtWeek(weekStart)} 的整張週盤嗎？目前有 ${contentCount} 個格子；今天任務與已完成紀錄會保留。`);
    if (!confirmed) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/dojo/bingo?week=${weekStart}`, { method: "DELETE" });
      const json = await readResponse<{ board: WeeklyBoard; deleted: boolean; preservedDailyTasks: number }>(response);
      setBoard(json.board);
      setBoardTitleDraft(json.board.title);
      setBoardSettingsOpen(false);
      setSelected(null);
      const preserved = json.preservedDailyTasks > 0 ? `，並保留 ${json.preservedDailyTasks} 筆今天任務` : "";
      setNotice(json.deleted ? `本週週盤已移至 Notion 垃圾桶${preserved}。` : "本週原本就是空白週盤。");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
    }
  }

  async function changeProgress(direction: -1 | 1) {
    if (selected === null || selected === 12 || board.archivedAt) return;
    setSaving(true); setError(null); setNotice(null);
    try {
      const response = await fetch("/api/dojo/flow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "progress-bingo", weekStart, cellIndex: selected, direction, evidenceNote }),
      });
      const json = await readResponse<{ board: WeeklyBoard }>(response);
      setBoard(json.board);
      const cell = json.board.cells[selected];
      setNotice(cell.completed ? "這一格已完成，進度也已回寫修習所。" : `已記下 ${cell.completion.progress}/${cell.completion.target} ${cell.completion.unit}。`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
    finally { setSaving(false); }
  }

  async function assignToToday() {
    if (selected === null || selected === 12 || board.archivedAt) return;
    const cell = board.cells[selected];
    if (!cell.text.trim()) return;
    const category = cell.category;
    if (!category) { setError("請先在週盤為這一格決定重要、喜歡或照顧自己。"); return; }
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

  async function setCellCategory(category: DailyTaskCategory) {
    if (selected === null || board.archivedAt) return;
    const next: WeeklyBoard = {
      ...board,
      version: 2,
      rules: { planningDay: 0, crossColorLines: true, minimumLineColors: 2 },
      colorsConfirmedAt: null,
      cells: board.cells.map((cell) => cell.index === selected ? { ...cell, category } : cell),
    };
    try { await save(next, `已設為「${DAILY_TASK_CATEGORIES[category].label}」。`); } catch { /* save 已顯示錯誤 */ }
  }

  async function confirmColors() {
    const uncolored = board.cells.filter((cell) => cell.index !== 12 && cell.text.trim() && !cell.category).length;
    if (uncolored) { setError(`還有 ${uncolored} 個已填格子尚未定色。`); return; }
    try {
      await save({ ...board, version: 2, rules: { planningDay: 0, crossColorLines: true, minimumLineColors: 2 }, colorsConfirmedAt: new Date().toISOString() }, "本週三色已確認；排入今天時會沿用這裡的分類。");
    } catch { /* save 已顯示錯誤 */ }
  }

  async function shuffleCells() {
    if (board.archivedAt || board.cells.some((cell) => cell.assignedDate)) return;
    setSelected(null);
    try {
      await save(shuffledBoard(board), "24 個一般格已隨機換位；中央自在格保持原位。");
    } catch { /* save 已顯示錯誤 */ }
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
  const colorCounts = CATEGORIES.map((category) => ({
    category,
    count: board.cells.filter((cell) => cell.index !== 12 && cell.text.trim() && cell.category === category).length,
  }));
  const uncoloredCount = board.cells.filter((cell) => cell.index !== 12 && cell.text.trim() && !cell.category).length;
  const hasAssignedCells = board.cells.some((cell) => Boolean(cell.assignedDate));
  const hasBoardContent = board.cells.some((cell) => cell.index !== 12 && Boolean(cell.text.trim()));
  const clearedManagedCells = board.cells.filter((cell) =>
    cell.index !== 12 && !cell.text.trim() && Boolean(cell.sourceId || cell.learning || cell.assignedDate || cell.completion.progress)
  ).length;

  return (
    <section className="screen bingo-screen">
      <div className="section-heading page-heading">
        <div>
          <span className="eyebrow">週 Bingo</span>
          <h1>本週行光盤</h1>
          <p className="lead">把想推進的事放進一週，完成會同步回今天。</p>
        </div>
        <div className="page-heading-actions">
          {!board.archivedAt && <button disabled={loading} onClick={() => { setBoardTitleDraft(board.title); setBoardSettingsOpen(true); }}>週盤設定</button>}
          <button onClick={() => void loadArchive()}>{showArchive ? "收起封存" : "封存紀錄"}</button>
        </div>
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

      {boardSettingsOpen && !board.archivedAt && (
        <div className="modal bingo-detail-modal" onClick={(event) => event.target === event.currentTarget && setBoardSettingsOpen(false)}>
          <section className="sheet board-settings-sheet" role="dialog" aria-modal="true" aria-labelledby="board-settings-title">
            <div className="bingo-detail-handle" aria-hidden="true" />
            <div className="toolbar bingo-detail-heading">
              <div><span className="eyebrow">{fmtWeek(weekStart)}</span><h2 id="board-settings-title">週盤設定</h2></div>
              <button onClick={() => setBoardSettingsOpen(false)}>關閉</button>
            </div>
            <label htmlFor="board-settings-name">週盤名稱</label>
            <input id="board-settings-name" className="field" maxLength={200} value={boardTitleDraft} onChange={(event) => setBoardTitleDraft(event.target.value)} />
            <button type="button" className="primary" disabled={saving || !boardTitleDraft.trim() || boardTitleDraft.trim() === board.title} onClick={() => void saveBoardTitle()}>{saving ? "儲存中…" : "儲存名稱"}</button>
            <div className="board-delete-zone">
              <b>刪除整張週盤</b>
              <p>週盤會移至 Notion 垃圾桶。已排入今天的任務與完成紀錄會保留，但不再連回這張週盤。</p>
              <button type="button" className="danger-button" disabled={saving} onClick={() => void deleteBoard()}>刪除 {fmtWeek(weekStart)} 週盤</button>
            </div>
          </section>
        </div>
      )}

      {!loading && (
        <>
          {englishTrack && !board.archivedAt && (
            <EnglishWeeklyPlanner
              board={board}
              english={englishTrack}
              disabled={saving}
              onApply={async (next) => { await save(next, "英文學習路徑已放入本週盤面，請完成本週定色。"); }}
              onRemove={removeCells}
            />
          )}

          {!board.archivedAt && (
            <WeeklySetupPlanner
              board={board}
              disabled={saving}
              onApply={async (next, message) => { await save(next, message); }}
              onRemove={removeCells}
            />
          )}

          {!board.archivedAt && (
            <ReadingInsightPlanner
              board={board}
              disabled={saving}
              onApply={async (next) => { await save(next, "閱讀洞察已選入本週盤面；原始卡片仍留在閱讀萃取。"); }}
            />
          )}

          <section className="ritual-card weekly-color-plan">
            <div className="section-heading">
              <div><span className="eyebrow">週日定色</span><h2>先決定這週為什麼做</h2></div>
              <span className={`saved-mark ${board.colorsConfirmedAt ? "confirmed" : ""}`}>{board.colorsConfirmedAt ? "已確認" : `${uncoloredCount} 格待定`}</span>
            </div>
            <p className="lead">每格在週盤決定「重要／喜歡／照顧自己」，排入今天時直接沿用。有效連線需至少包含兩種顏色。</p>
            <div className="weekly-color-counts">
              {colorCounts.map(({ category, count }) => <span key={category} className={category}>{DAILY_TASK_CATEGORIES[category].label.replace(/^一件/, "")} <b>{count}</b></span>)}
            </div>
            {!board.archivedAt && <button className="primary" disabled={saving || uncoloredCount > 0} onClick={() => void confirmColors()}>{board.colorsConfirmedAt ? "重新確認本週三色" : "確認本週三色"}</button>}
          </section>

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
                <div className="board-heading-actions">
                  <button
                    disabled={saving || editing || hasAssignedCells || !hasBoardContent}
                    title={hasAssignedCells ? "已有格子排入今天，為避免完成狀態失去對應，本週不再換位" : "中央自在格不移動"}
                    onClick={() => void shuffleCells()}
                  >隨機換位</button>
                  <button onClick={() => { setSelected(null); setEditing((value) => !value); }}>{editing ? "完成編輯" : "編輯格子"}</button>
                </div>
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
                        ? { ...item, text: event.target.value, completed: event.target.value.trim() ? item.completed : false, completion: event.target.value.trim() ? item.completion : { ...item.completion, progress: 0 }, category: event.target.value.trim() ? item.category : null }
                        : item),
                    })}
                    placeholder={`${cell.index + 1}`}
                    aria-label={`第 ${cell.index + 1} 格`}
                  />
                ) : (
                  <button
                    key={cell.index}
                    className={`bingo-cell ${cell.category ?? "uncolored"} ${cell.completed ? "done" : ""} ${selected === cell.index ? "selected" : ""} ${cell.index === 12 ? "free" : ""}`}
                    onClick={() => { if (cell.index !== 12) openCell(cell.index); }}
                    disabled={cell.index !== 12 && !cell.text.trim()}
                    aria-label={cell.index === 12
                      ? "自在格，已完成"
                      : `${cell.text || "空格"}${cell.category ? `，${DAILY_TASK_CATEGORIES[cell.category].label}` : "，尚未定色"}${cell.completed ? "，已完成" : ""}`}
                  >
                    <span className="bingo-cell-title">{bingoCellShortLabel(cell) || "空格"}</span>
                    {cell.completed && <i>✓</i>}
                    {cell.index !== 12 && cell.text && !cell.category && <em>待定色</em>}
                    {cell.completion.target > 1 && <small>{cell.completion.progress}/{cell.completion.target}</small>}
                    {cell.assignedDate && <small className="bingo-cell-date">已排 {cell.assignedDate.slice(5)}</small>}
                  </button>
                )
              )}
            </div>

            {editing && (
              <>
                {clearedManagedCells > 0 && <p className="form-error">有 {clearedManagedCells} 格原有任務被清空，請先重新輸入名稱。若要移除，請保留名稱、完成編輯後再使用「從本週刪除」。</p>}
                <button className="primary" disabled={saving || clearedManagedCells > 0} onClick={() => void save(board, "週盤格子已儲存。") }>
                  {saving ? "儲存中…" : "儲存週盤"}
                </button>
              </>
            )}
          </section>

          {selectedCell && !editing && (
            <div className="modal bingo-detail-modal" onClick={(event) => event.target === event.currentTarget && setSelected(null)}>
              <section className="sheet selected-cell-panel" role="dialog" aria-modal="true" aria-labelledby="bingo-detail-title">
                <div className="bingo-detail-handle" aria-hidden="true" />
                <div className="toolbar bingo-detail-heading">
                  <div>
                    <span className="eyebrow">第 {selectedCell.index + 1} 格</span>
                    <h2 id="bingo-detail-title">{selectedCell.text}</h2>
                  </div>
                  <button onClick={() => setSelected(null)}>關閉</button>
                </div>
                {selectedCell.learning && <p className="learning-cell-source">修習所・{selectedCell.learning.trackKey === "english" ? "英文到 C1" : selectedCell.learning.trackKey}・{selectedCell.learning.path === "system" ? "系統建置" : "英文修習"}・{selectedCell.learning.skill}</p>}
                {selectedCell.sourceType === "reading" && <p className="learning-cell-source">閱讀萃取・執行型洞察</p>}
                {selectedCell.completion.criteria && <p className="cell-completion-criteria"><b>做到什麼才算完成？</b>{selectedCell.completion.criteria}</p>}

                <div className="cell-detail-facts">
                  <span><small>盤面名稱</small><b>{bingoCellShortLabel(selectedCell)}</b></span>
                  <span><small>完成條件</small><b>{selectedCell.completion.target} {selectedCell.completion.unit}</b></span>
                  <span><small>本週分類</small><b>{selectedCell.category ? DAILY_TASK_CATEGORIES[selectedCell.category].label.replace(/^一件/, "") : "尚未定色"}</b></span>
                </div>

                {!board.archivedAt ? (
                  <>
                    <div className="cell-management-actions">
                      <button type="button" onClick={() => setCellEditOpen((value) => !value)}>{cellEditOpen ? "收起編輯" : "編輯任務"}</button>
                      <button type="button" className="danger-button" disabled={saving} onClick={() => void removeSelectedCell()}>從本週刪除</button>
                    </div>
                    {cellEditOpen && (
                      <div className="cell-task-editor">
                        <label htmlFor="bingo-task-name">任務名稱</label>
                        <textarea id="bingo-task-name" className="field" rows={3} maxLength={300} value={cellTextDraft} onChange={(event) => setCellTextDraft(event.target.value)} />
                        <label htmlFor="bingo-short-label">盤面短名稱</label>
                        <input id="bingo-short-label" className="field" maxLength={12} value={shortLabelDraft} onChange={(event) => setShortLabelDraft(event.target.value)} placeholder="最多 12 個字" />
                        <label htmlFor="bingo-completion-criteria">做到什麼才算完成？</label>
                        <textarea id="bingo-completion-criteria" className="field" rows={3} maxLength={1000} value={criteriaDraft} onChange={(event) => setCriteriaDraft(event.target.value)} placeholder="例如：完成一章閱讀並留下三句重述" />
                        <div className="cell-completion-editor">
                          <label htmlFor="bingo-completion-target">目標數量<input id="bingo-completion-target" className="field" type="number" min="1" max="99" inputMode="numeric" value={targetDraft} onChange={(event) => setTargetDraft(event.target.value)} /></label>
                          <label htmlFor="bingo-completion-unit">單位<input id="bingo-completion-unit" className="field" maxLength={20} value={unitDraft} onChange={(event) => setUnitDraft(event.target.value)} placeholder="次" /></label>
                        </div>
                        <button type="button" className="primary" disabled={saving || !cellTextDraft.trim()} onClick={() => void saveCellEdit()}>{saving ? "儲存中…" : "儲存任務修改"}</button>
                        <small>來源企劃與既有進度不會因修改名稱而消失。</small>
                      </div>
                    )}
                    <div className="cell-color-picker">
                      <small>本週三色</small>
                      <div className="row">{CATEGORIES.map((category) => <button key={category} className={`task-category-button ${category} ${selectedCell.category === category ? "on" : ""}`} onClick={() => void setCellCategory(category)} disabled={saving || Boolean(selectedCell.assignedDate)}>{DAILY_TASK_CATEGORIES[category].label.replace(/^一件/, "")}</button>)}</div>
                    </div>
                    {selectedCell.completion.requiresEvidence && <label className="evidence-field">工作實戰紀錄<textarea className="field" rows={3} value={evidenceNote} onChange={(event) => setEvidenceNote(event.target.value)} placeholder="實際使用日期、情境、說出的句子與對方反應" /></label>}
                    <div className="cell-progress">
                      <span>本週進度 <b>{selectedCell.completion.progress}/{selectedCell.completion.target}</b> {selectedCell.completion.unit}</span>
                      <div><button onClick={() => void changeProgress(-1)} disabled={saving || selectedCell.completion.progress === 0}>−</button><button className="primary" onClick={() => void changeProgress(1)} disabled={saving || selectedCell.completed}>{selectedCell.completed ? "已完成" : selectedCell.completion.target > 1 ? "記一次" : "完成這格"}</button></div>
                    </div>
                    <div className="two">
                      <button onClick={() => void assignToToday()} disabled={saving || !selectedCell.category}>{selectedCell.assignedDate ? `已排入 ${selectedCell.assignedDate.slice(5)}` : selectedCell.category ? `排入今天・${DAILY_TASK_CATEGORIES[selectedCell.category].label.replace(/^一件/, "")}` : "請先定色"}</button>
                      <Link href="/" className="button-link">查看今天</Link>
                    </div>
                  </>
                ) : (
                  <div className="cell-progress"><span>封存進度 <b>{selectedCell.completion.progress}/{selectedCell.completion.target}</b> {selectedCell.completion.unit}</span></div>
                )}
              </section>
            </div>
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
