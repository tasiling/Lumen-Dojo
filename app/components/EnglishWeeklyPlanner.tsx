"use client";

import { useMemo, useState } from "react";
import {
  DAILY_TASK_CATEGORIES,
  type DailyTaskCategory,
  type WeeklyBoard,
} from "@/lib/dojo/formal";
import {
  englishFocusWeeklyCandidates,
  type LearningTrackRecord,
} from "@/lib/dojo/learning";

const CATEGORIES: DailyTaskCategory[] = ["important", "hobby", "health"];

export default function EnglishWeeklyPlanner({
  board,
  english,
  disabled,
  onApply,
  onRemove,
}: {
  board: WeeklyBoard;
  english: LearningTrackRecord;
  disabled: boolean;
  onApply: (board: WeeklyBoard) => Promise<void>;
  onRemove: (indexes: number[], label: string) => Promise<void>;
}) {
  const candidates = useMemo(() => englishFocusWeeklyCandidates(), []);
  const groups = useMemo(() => [...new Set(candidates.map((item) => item.group))], [candidates]);
  const [colors, setColors] = useState<Record<string, DailyTaskCategory>>(() =>
    Object.fromEntries(candidates.map((item) => [item.templateKey, item.defaultCategory]))
  );
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const existing = new Set(board.cells.flatMap((cell) => cell.learning?.trackKey === "english" ? [cell.learning.templateKey] : []));
  const missing = candidates.filter((item) => !existing.has(item.templateKey));
  const existingCount = candidates.filter((item) => existing.has(item.templateKey)).length;
  const existingIndexes = board.cells.flatMap((cell) =>
    cell.learning?.trackKey === "english" && candidates.some((candidate) => candidate.templateKey === cell.learning?.templateKey)
      ? [cell.index]
      : []
  );

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
      colorsConfirmedAt: null,
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
          learning: {
            trackKey: "english",
            templateKey: candidate.templateKey,
            skill: candidate.skill,
            path: candidate.path,
            practiceType: candidate.practiceType,
          },
          completion: {
            mode: candidate.completionMode,
            target: candidate.target,
            progress: 0,
            unit: candidate.unit,
            requiresEvidence: candidate.requiresEvidence,
            criteria: candidate.completionCriteria,
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

  async function removeEnglishPlan() {
    if (!existingIndexes.length) return;
    const confirmed = window.confirm(`確定從本週移除已加入的 ${existingIndexes.length} 個英文修習格嗎？已排入今天或已完成的紀錄會保留。`);
    if (!confirmed) return;
    setError(null);
    try {
      await onRemove(existingIndexes, "英文集中週修習鏈");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "移除英文修習格時發生錯誤");
    }
  }

  return (
    <section className="ritual-card english-week-planner">
      <button type="button" className="english-week-planner-head" onClick={() => setOpen((value) => !value)}>
        <span><small>英文修習・實際讀聽寫說</small><b>英文集中週・10 格修習鏈</b></span>
        <em>{existingCount}/{candidates.length} 已放入</em>
      </button>
      {open && (
        <div className="english-week-planner-body">
          <p>課程主題、閱讀、語境聊天、分段自譯與詞彙實戰各自成格；完成一格只代表一份真實練習，不會因匯入素材連帶完成其他格。目前階段：{english.english?.weeklyMode === "vocabulary-growth" ? "後三個月・詞彙擴充" : "前三個月・書面習慣建立"}。</p>
          {groups.map((group) => <section className="english-candidate-group" key={group}>
            <h3>{group}</h3>
            {candidates.filter((candidate) => candidate.group === group).map((candidate) => (
              <article key={candidate.templateKey} className={existing.has(candidate.templateKey) ? "already-added" : ""}>
                <div><b>{candidate.title}</b><small>{candidate.skill} · {candidate.completionCriteria}</small></div>
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
          </section>)}
          {error && <p className="form-error">{error}</p>}
          <div className="english-week-actions">
            {missing.length > 0 ? (
              <button type="button" className="primary english-week-apply" disabled={disabled} onClick={() => void apply()}>
                加入尚未放入的 {missing.length} 格
              </button>
            ) : <p className="save-notice">本週英文 10 格已全部放入。</p>}
            {existingIndexes.length > 0 && <button type="button" className="remove" disabled={disabled} onClick={() => void removeEnglishPlan()}>從本週移除 {existingIndexes.length} 格</button>}
          </div>
        </div>
      )}
    </section>
  );
}
