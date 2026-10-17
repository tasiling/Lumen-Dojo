"use client";
import { useState } from 'react';
import { DAILY_TASK_CATEGORIES, emptyBingoCell, mondayOf, taipeiTodayISO, type DailyTaskCategory, type WeeklyBoard } from '@/lib/dojo/formal';
import type { WeavingShuttle, WeavingWork } from '@/lib/dojo/weavingShuttle';
async function json<T>(response: Response): Promise<T> { const v = await response.json(); if (!response.ok)
    throw new Error(v.error); return v; }
export default function WeeklyAction({ work, shuttle }: {
    work: WeavingWork;
    shuttle: WeavingShuttle;
}) {
    const [boardOpen, setBoardOpen] = useState(false), [board, setBoard] = useState<WeeklyBoard | null>(null), [selectedCell, setSelectedCell] = useState<number | null>(null), [boardCategory, setBoardCategory] = useState<DailyTaskCategory>('important'), [saving, setSaving] = useState(false), [error, setError] = useState<string | null>(null), [notice, setNotice] = useState<string | null>(null);
    async function openBoard() {
        if (!work?.nextAction.trim())
            return;
        setBoardOpen(true);
        setError(null);
        try {
            const week = mondayOf(taipeiTodayISO());
            const response = await fetch(`/api/dojo/bingo?week=${week}`, { cache: "no-store" });
            const result = await json<{
                board: WeeklyBoard;
            }>(response);
            setBoard(result.board);
        }
        catch (caught) {
            setError(caught instanceof Error ? caught.message : String(caught));
        }
    }
    async function addToBoard() {
        if (!shuttle || !work || !board || selectedCell === null)
            return;
        const cell = board.cells[selectedCell];
        if (!cell || cell.index === 12 || cell.text.trim()) {
            setError("請選擇一個空白週盤格。");
            return;
        }
        const next: WeeklyBoard = { ...board, colorsConfirmedAt: null, cells: board.cells.map((item) => item.index !== selectedCell ? item : { ...emptyBingoCell(item.index, board.weekStart), text: work.nextAction, shortLabel: work.nextAction.slice(0, 12), category: boardCategory, sourceType: "project", sourceId: `${shuttle.id}:${work.id}` }) };
        setSaving(true);
        setError(null);
        try {
            const response = await fetch("/api/dojo/bingo", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ weekStart: board.weekStart, board: next }) });
            const result = await json<{
                board: WeeklyBoard;
            }>(response);
            setBoard(result.board);
            setBoardOpen(false);
            setSelectedCell(null);
            setNotice("只排入這條作品緯線的一個動作；織光杼與成品都沒有被直接完成。");
        }
        catch (caught) {
            setError(caught instanceof Error ? caught.message : String(caught));
        }
        finally {
            setSaving(false);
        }
    }
    return <section className="ritual-card"><h2>安排這件作品的一個動作</h2><p>{work.nextAction}</p><button onClick={() => void openBoard()}>排入本週一格</button>{error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}    {boardOpen && board && <div className="modal show" onClick={(event) => event.target === event.currentTarget && setBoardOpen(false)}><section className="sheet board-picker-sheet"><div className="toolbar"><h2>排入本週一格</h2><button onClick={() => setBoardOpen(false)}>關閉</button></div><p>只排入「{work?.nextAction}」，不代表整件作品或織光杼完成。</p><div className="board-empty-grid">{board.cells.filter((cell) => cell.index !== 12 && !cell.text.trim()).map((cell) => <button key={cell.index} className={selectedCell === cell.index ? "on" : ""} onClick={() => setSelectedCell(cell.index)}>第 {cell.index + 1} 格</button>)}</div><label>本週分類</label><div className="row">{(Object.keys(DAILY_TASK_CATEGORIES) as DailyTaskCategory[]).map((category) => <button key={category} className={boardCategory === category ? "on" : ""} onClick={() => setBoardCategory(category)}>{DAILY_TASK_CATEGORIES[category].label.replace(/^一件/, "")}</button>)}</div><button className="primary" disabled={selectedCell === null || saving} onClick={() => void addToBoard()}>確認排入這一格</button></section></div>}</section>;
}
