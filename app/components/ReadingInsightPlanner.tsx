"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DAILY_TASK_CATEGORIES,
  type DailyTaskCategory,
  type WeeklyBoard,
} from "@/lib/dojo/formal";
import type { InsightCardWithBook } from "@/lib/reading/types";

async function responseJson<T>(response: Response): Promise<T> {
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((json as { error?: string }).error ?? `讀取失敗（${response.status}）`);
  return json as T;
}

export default function ReadingInsightPlanner({
  board,
  disabled,
  onApply,
}: {
  board: WeeklyBoard;
  disabled: boolean;
  onApply: (board: WeeklyBoard) => Promise<void>;
}) {
  const [cards, setCards] = useState<InsightCardWithBook[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [category, setCategory] = useState<DailyTaskCategory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const response = await fetch("/api/dojo/reading/cards", { cache: "no-store" });
        const json = await responseJson<{ cards: InsightCardWithBook[] }>(response);
        if (!cancelled) setCards((json.cards ?? []).filter((card) =>
          card.actionType === "執行型" && (card.status === "待行動" || card.status === "行動中")
        ));
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : String(caught));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  const candidates = useMemo(() => {
    const used = new Set(board.cells.filter((cell) => cell.sourceType === "reading").map((cell) => cell.sourceId));
    return cards.filter((card) => !used.has(card.id));
  }, [board.cells, cards]);
  const selected = candidates.find((card) => card.id === selectedId) ?? null;
  const emptyCell = board.cells.find((cell) => cell.index !== 12 && !cell.text.trim());

  async function addSelected() {
    if (!selected || !category || !emptyCell) return;
    const next: WeeklyBoard = {
      ...board,
      colorsConfirmedAt: null,
      cells: board.cells.map((cell) => cell.index === emptyCell.index ? {
        ...cell,
        text: selected.action,
        shortLabel: selected.action.slice(0, 12),
        category,
        sourceType: "reading",
        sourceId: selected.id,
        learning: null,
        completion: { mode: "single", target: 1, progress: 0, unit: "次", requiresEvidence: false },
        evidenceNote: "",
        completed: false,
        completedAt: null,
      } : cell),
    };
    await onApply(next);
    setSelectedId(null);
    setCategory(null);
  }

  if (loading) return <section className="ritual-card reading-weekly-planner"><p className="muted-note">正在讀取執行型洞察…</p></section>;
  if (error) return <section className="ritual-card reading-weekly-planner"><p className="form-error">{error}</p></section>;
  if (candidates.length === 0) return null;

  return <section className="ritual-card reading-weekly-planner">
    <div className="section-heading">
      <div><span className="eyebrow">閱讀萃取・週日候選</span><h2>選一張洞察進入本週</h2></div>
      <span className="saved-mark">{candidates.length} 張</span>
    </div>
    <p className="lead">只有執行型會出現在這裡。選入與定色都由你決定，不會自動占用盤面。</p>
    <div className="reading-weekly-candidates">
      {candidates.map((card) => <button
        type="button"
        key={card.id}
        className={selectedId === card.id ? "on" : ""}
        onClick={() => { setSelectedId(card.id); setCategory(null); }}
      >
        <b>{card.insight}</b>
        <small>{card.action}</small>
        <span>{card.sourceBookTitle}</span>
      </button>)}
    </div>
    {selected && <div className="reading-weekly-decision">
      <p><b>這週為什麼做？</b><span>此分類會直接成為格子的三色。</span></p>
      <div>{(["important", "hobby", "health"] as DailyTaskCategory[]).map((item) => <button
        type="button"
        key={item}
        className={`task-category-button ${item} ${category === item ? "on" : ""}`}
        onClick={() => setCategory(item)}
      >{DAILY_TASK_CATEGORIES[item].label.replace(/^一件/, "")}</button>)}</div>
      <button className="primary" disabled={disabled || !category || !emptyCell} onClick={() => void addSelected()}>
        {!emptyCell ? "盤面已滿" : category ? "選入下一個空格" : "先決定本週三色"}
      </button>
    </div>}
  </section>;
}
