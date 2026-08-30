"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import EnglishWeeklyPlanner from "@/app/components/EnglishWeeklyPlanner";
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
  const detailOpen = selected !== null && !editing;

  useBackableState(detailOpen, () => setSelected(null));

  useEffect(() => {
    if (!detailOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [detailOpen]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      setNotice(null);
      setSelected(null);
      setEditing(false);
      try {
        const [boardResponse, learningResponse] = await Promise.all([
          fetch(`/api/dojo/bingo?week=${weekStart}`, { cache: "no-store" }),
          fetch("/api/dojo/learning", { cache: "no-store" }),
        ]);
        const json = await readResponse<{ board: WeeklyBoard }>(boardResponse);
        const learning = await readResponse<{ tracks: LearningTrackRecord[] }>(learningResponse);
        if (!cancelled) {
          setBoard(json.board);
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

  async function saveShortLabel() {
    if (selected === null || board.archivedAt) return;
    const next = {
      ...board,
      cells: board.cells.map((cell) => cell.index === selected
        ? { ...cell, shortLabel: shortLabelDraft.trim().slice(0, 12) }
        : cell),
    };
    try { await save(next, "盤面短名稱已儲存，完整任務內容保持不變。"); } catch { /* save 已顯示錯誤 */ }
  }

  async function confirmColors() {
    const uncolored = board.cells.filter((cell) => cell.index !== 12 && cell.text.trim() && !cell.category).length;
    if (uncolored) { setError(`還有 ${uncolored} 個已填格子尚未定色。`); return; }
    try {
      await save({ ...board, version: 2, rules: { planningDay: 0, crossColorLines: true, minimumLineColors: 2 }, colorsConfirmedAt: new Date().toISOString() }, "本週三色已確認；排入今天時會沿用這裡的分類。");
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
          {englishTrack && !board.archivedAt && (
            <EnglishWeeklyPlanner
              board={board}
              english={englishTrack}
              disabled={saving}
              onApply={async (next) => { await save(next, "英文學習路徑已放入本週盤面，請完成本週定色。"); }}
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
                <button onClick={() => { setSelected(null); setEditing((value) => !value); }}>{editing ? "完成編輯" : "編輯格子"}</button>
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
                    onClick={() => { if (cell.index !== 12) { setSelected(cell.index); setEvidenceNote(cell.evidenceNote); setShortLabelDraft(bingoCellShortLabel(cell)); } }}
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
              <button className="primary" disabled={saving} onClick={() => void save(board, "週盤格子已儲存。") }>
                {saving ? "儲存中…" : "儲存週盤"}
              </button>
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
                {selectedCell.learning && <p className="learning-cell-source">修習所・{selectedCell.learning.trackKey === "english" ? "英文到 C1" : selectedCell.learning.trackKey}・{selectedCell.learning.skill}</p>}

                <div className="cell-detail-facts">
                  <span><small>盤面名稱</small><b>{bingoCellShortLabel(selectedCell)}</b></span>
                  <span><small>完成條件</small><b>{selectedCell.completion.target} {selectedCell.completion.unit}</b></span>
                  <span><small>本週分類</small><b>{selectedCell.category ? DAILY_TASK_CATEGORIES[selectedCell.category].label.replace(/^一件/, "") : "尚未定色"}</b></span>
                </div>

                {!board.archivedAt ? (
                  <>
                    <div className="cell-short-label-editor">
                      <label htmlFor="bingo-short-label">盤面短名稱</label>
                      <div>
                        <input id="bingo-short-label" className="field" maxLength={12} value={shortLabelDraft} onChange={(event) => setShortLabelDraft(event.target.value)} placeholder="最多 12 個字" />
                        <button onClick={() => void saveShortLabel()} disabled={saving || shortLabelDraft.trim() === selectedCell.shortLabel}>儲存</button>
                      </div>
                      <small>只改盤面顯示，完整任務內容不會被縮寫覆蓋。</small>
                    </div>
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
