"use client";

import { useState } from "react";
import type { BingoCell, DailyTaskCategory, WeeklyBoard } from "@/lib/dojo/formal";

type SetupTemplate = {
  id: string;
  text: string;
  shortLabel: string;
  category: DailyTaskCategory;
  sourceType: BingoCell["sourceType"];
};

type SetupGroup = {
  key: string;
  title: string;
  countLabel: string;
  note: string;
  tone: string;
  templates: SetupTemplate[];
};

const GROUPS: SetupGroup[] = [
  {
    key: "sanko",
    title: "日上三更・手動兩天版",
    countLabel: "5 格重要",
    note: "工具尚未完成，第一週只安排兩天份；每格都對應一段真實手工作業。",
    tone: "sanko",
    templates: [
      { id: "sanko-topics", text: "決定兩天主題、題目與選項", shortLabel: "兩天題目", category: "important", sourceType: "routine" },
      { id: "sanko-cards", text: "完成兩天抽牌與素材整理", shortLabel: "抽牌整理", category: "important", sourceType: "routine" },
      { id: "sanko-draft-1", text: "完成第一天解牌成稿", shortLabel: "首日成稿", category: "important", sourceType: "routine" },
      { id: "sanko-draft-2", text: "完成第二天解牌成稿", shortLabel: "次日成稿", category: "important", sourceType: "routine" },
      { id: "sanko-publish", text: "完成兩天發布或排程", shortLabel: "發布排程", category: "important", sourceType: "routine" },
    ],
  },
  {
    key: "reading-validation",
    title: "閱讀萃取・真實驗證",
    countLabel: "2 格重要",
    note: "先讓現有流程跑完一輪，再依實際卡住的位置決定下一次開發。",
    tone: "reading",
    templates: [
      { id: "reading-full-loop", text: "用一本真實書跑完閱讀紀錄、文獻筆記與我的洞察", shortLabel: "閱讀一輪", category: "important", sourceType: "project" },
      { id: "reading-card-test", text: "立一張洞察卡並完成去向或回訪測試", shortLabel: "洞察驗證", category: "important", sourceType: "project" },
    ],
  },
  {
    key: "health",
    title: "健康與生活",
    countLabel: "5 格照顧自己",
    note: "先放入低壓範例，再到盤面把括號條件改成你這週真正做得到的量。",
    tone: "health",
    templates: [
      { id: "health-stretch", text: "伸展或復健（2 次）", shortLabel: "伸展 ×2", category: "health", sourceType: "routine" },
      { id: "health-movement", text: "正式運動（1 次）", shortLabel: "運動一次", category: "health", sourceType: "routine" },
      { id: "health-sleep", text: "提早睡覺（2 晚）", shortLabel: "早睡 ×2", category: "health", sourceType: "routine" },
      { id: "health-meals", text: "做菜或準備餐點（2 餐）", shortLabel: "備餐 ×2", category: "health", sourceType: "routine" },
      { id: "health-rest", text: "保留一段完整休息（半天）", shortLabel: "休息半天", category: "health", sourceType: "routine" },
    ],
  },
  {
    key: "projects",
    title: "其他專案",
    countLabel: "3 格重要",
    note: "最多只讓兩個專案進場：主專案兩格，維持型專案一格。",
    tone: "project",
    templates: [
      { id: "project-main-1", text: "主專案：第一個具體推進", shortLabel: "主專案一", category: "important", sourceType: "project" },
      { id: "project-main-2", text: "主專案：第二個具體推進", shortLabel: "主專案二", category: "important", sourceType: "project" },
      { id: "project-maintain", text: "維持型專案：完成一個下一步", shortLabel: "維持專案", category: "important", sourceType: "project" },
    ],
  },
  {
    key: "hobbies",
    title: "純粹喜歡",
    countLabel: "5 格喜歡",
    note: "這五格先保留給真正想做的事；加入後請改成你的內容，不拿工作補滿。",
    tone: "hobby",
    templates: [
      { id: "hobby-1", text: "喜歡的事 1（週日填寫）", shortLabel: "喜歡一", category: "hobby", sourceType: "flexible" },
      { id: "hobby-2", text: "喜歡的事 2（週日填寫）", shortLabel: "喜歡二", category: "hobby", sourceType: "flexible" },
      { id: "hobby-3", text: "喜歡的事 3（週日填寫）", shortLabel: "喜歡三", category: "hobby", sourceType: "flexible" },
      { id: "hobby-4", text: "喜歡的事 4（週日填寫）", shortLabel: "喜歡四", category: "hobby", sourceType: "flexible" },
      { id: "hobby-5", text: "喜歡的事 5（週日填寫）", shortLabel: "喜歡五", category: "hobby", sourceType: "flexible" },
    ],
  },
];

const SOURCE_PREFIX = "weekly-setup:";

export default function WeeklySetupPlanner({
  board,
  disabled,
  onApply,
}: {
  board: WeeklyBoard;
  disabled: boolean;
  onApply: (board: WeeklyBoard, message: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const existing = new Set(board.cells.flatMap((cell) => cell.sourceId?.startsWith(SOURCE_PREFIX) ? [cell.sourceId] : []));

  async function applyGroup(group: SetupGroup) {
    const missing = group.templates.filter((template) => !existing.has(`${SOURCE_PREFIX}${template.id}`));
    const empty = board.cells.filter((cell) => cell.index !== 12 && !cell.text.trim());
    if (empty.length < missing.length) {
      setError(`「${group.title}」還需要 ${missing.length} 個空格，目前只剩 ${empty.length} 格。`);
      return;
    }
    const byIndex = new Map(empty.slice(0, missing.length).map((cell, index) => [cell.index, missing[index]]));
    const next: WeeklyBoard = {
      ...board,
      version: 2,
      colorsConfirmedAt: null,
      rules: { planningDay: 0, crossColorLines: true, minimumLineColors: 2 },
      cells: board.cells.map((cell) => {
        const template = byIndex.get(cell.index);
        if (!template) return cell;
        return {
          ...cell,
          text: template.text,
          shortLabel: template.shortLabel,
          category: template.category,
          sourceType: template.sourceType,
          sourceId: `${SOURCE_PREFIX}${template.id}`,
          learning: null,
          completion: { mode: "single", target: 1, progress: 0, unit: "次", requiresEvidence: false },
          evidenceNote: "",
          completed: false,
          completedAt: null,
        };
      }),
    };
    setError(null);
    try {
      await onApply(next, `已加入「${group.title}」${missing.length} 格；可到編輯格子調整文字與條件。`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "加入週盤時發生錯誤");
    }
  }

  return (
    <section className="ritual-card weekly-setup-planner">
      <button type="button" className="weekly-setup-head" onClick={() => setOpen((value) => !value)}>
        <span><small>週日組盤</small><b>手動負擔版配置</b></span>
        <em>20 格模板＋英文 4 格</em>
      </button>
      {open && <div className="weekly-setup-body">
        <p>先依現在真正要手做的份量排入；工具完成後，再調高日上三更與英文的產量。</p>
        <div className="weekly-setup-groups">
          {GROUPS.map((group) => {
            const added = group.templates.filter((template) => existing.has(`${SOURCE_PREFIX}${template.id}`)).length;
            const complete = added === group.templates.length;
            return <article key={group.key} className={group.tone}>
              <div className="weekly-setup-group-heading">
                <div><b>{group.title}</b><small>{group.countLabel}</small></div>
                <span>{added}/{group.templates.length}</span>
              </div>
              <p>{group.note}</p>
              <ul>{group.templates.map((template) => <li key={template.id} className={existing.has(`${SOURCE_PREFIX}${template.id}`) ? "added" : ""}>{template.text}</li>)}</ul>
              {complete ? <div className="weekly-setup-complete">已放入盤面</div> : <button type="button" disabled={disabled} onClick={() => void applyGroup(group)}>加入尚缺的 {group.templates.length - added} 格</button>}
            </article>;
          })}
        </div>
        {error && <p className="form-error">{error}</p>}
        <p className="weekly-setup-footnote">加入順序不影響位置；全部填好後再使用「隨機換位」，中央自在格不會移動。</p>
      </div>}
    </section>
  );
}
