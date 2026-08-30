"use client";

import { useMemo, useState } from "react";
import {
  DAILY_TASK_CATEGORIES,
  type DailyTaskCategory,
  type WeeklyBoard,
} from "@/lib/dojo/formal";
import {
  englishWeeklyCandidates,
  type LearningTrackRecord,
} from "@/lib/dojo/learning";

const CATEGORIES: DailyTaskCategory[] = ["important", "hobby", "health"];

export default function EnglishWeeklyPlanner({
  board,
  english,
  disabled,
  onApply,
}: {
  board: WeeklyBoard;
  english: LearningTrackRecord;
  disabled: boolean;
  onApply: (board: WeeklyBoard) => Promise<void>;
}) {
  const candidates = useMemo(
    () => englishWeeklyCandidates(english.english?.weeklyMode ?? "foundation-writing"),
    [english.english?.weeklyMode]
  );
  const [colors, setColors] = useState<Record<string, DailyTaskCategory>>(() =>
    Object.fromEntries(candidates.map((item) => [item.templateKey, item.defaultCategory]))
  );
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const existing = new Set(board.cells.flatMap((cell) => cell.learning?.trackKey === "english" ? [cell.learning.templateKey] : []));
  const missing = candidates.filter((item) => !existing.has(item.templateKey));
  const existingCount = candidates.filter((item) => existing.has(item.templateKey)).length;

  async function apply() {
    const empty = board.cells.filter((cell) => cell.index !== 12 && !cell.text.trim());
    if (empty.length < missing.length) {
      setError(`還需要 ${missing.length} 個空格，目前只剩 ${empty.length} 格。`);
      return;
    }
    const byIndex = new Map(empty.slice(0, missing.length).map((cell, index) => [cell.index, missing[index]]));
    const next: WeeklyBoard = {
      ...board,
      version: 2,
      rules: { planningDay: 0, crossColorLines: true, minimumLineColors: 2 },
      cells: board.cells.map((cell) => {
        const candidate = byIndex.get(cell.index);
        if (!candidate) return cell;
        return {
          ...cell,
          text: candidate.title,
          shortLabel: candidate.shortTitle,
          category: colors[candidate.templateKey] ?? candidate.defaultCategory,
          sourceType: "learning",
          sourceId: "english",
          learning: { trackKey: "english", templateKey: candidate.templateKey, skill: candidate.skill },
          completion: {
            mode: candidate.completionMode,
            target: candidate.target,
            progress: 0,
            unit: candidate.unit,
            requiresEvidence: candidate.requiresEvidence,
          },
          evidenceNote: "",
          completed: false,
          completedAt: null,
        };
      }),
    };
    setError(null);
    try {
      await onApply(next);
      setOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "加入週盤時發生錯誤");
    }
  }

  return (
    <section className="ritual-card english-week-planner">
      <button type="button" className="english-week-planner-head" onClick={() => setOpen((value) => !value)}>
        <span><small>修習所・英文到 C1</small><b>本週英文五格</b></span>
        <em>{existingCount}/5 已放入</em>
      </button>
      {open && (
        <div className="english-week-planner-body">
          <p>{english.english?.weeklyMode === "vocabulary-growth" ? "後三個月：維持自譯，詞彙增加到兩輪。" : "前三個月：日記自譯是唯一新增習慣，其餘維持低量。"}</p>
          {candidates.map((candidate) => (
            <article key={candidate.templateKey} className={existing.has(candidate.templateKey) ? "already-added" : ""}>
              <div><b>{candidate.title}</b><small>{candidate.skill} · {candidate.completionMode === "count" ? `${candidate.target} ${candidate.unit}` : candidate.unit}</small></div>
              {existing.has(candidate.templateKey) ? <span>已在盤面</span> : (
                <div className="candidate-colors" aria-label={`${candidate.title}的三色分類`}>
                  {CATEGORIES.map((category) => (
                    <button
                      type="button"
                      key={category}
                      className={`${category} ${colors[candidate.templateKey] === category ? "on" : ""}`}
                      onClick={() => setColors((current) => ({ ...current, [candidate.templateKey]: category }))}
                    >{DAILY_TASK_CATEGORIES[category].label.replace(/^一件/, "")}</button>
                  ))}
                </div>
              )}
            </article>
          ))}
          {error && <p className="form-error">{error}</p>}
          {missing.length > 0 ? (
            <button type="button" className="primary english-week-apply" disabled={disabled} onClick={() => void apply()}>
              加入尚未放入的 {missing.length} 格
            </button>
          ) : <p className="save-notice">本週英文五格已全部放入。</p>}
        </div>
      )}
    </section>
  );
}
