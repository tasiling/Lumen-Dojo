"use client";

import { useState } from "react";
import type { BingoCell, DailyTaskCategory, WeeklyBoard } from "@/lib/dojo/formal";

type SetupTemplate = {
  id: string;
  text: string;
  shortLabel: string;
  category: DailyTaskCategory;
  sourceType: BingoCell["sourceType"];
  completionCriteria: string;
  learning?: NonNullable<BingoCell["learning"]>;
  completionMode?: BingoCell["completion"]["mode"];
  target?: number;
  unit?: string;
};

type SetupGroup = {
  key: string;
  title: string;
  countLabel: string;
  note: string;
  tone: string;
  recommendation?: string;
  templates: SetupTemplate[];
};

const SANKO_TEMPLATES: SetupTemplate[] = [
  { id: "sanko-topics", text: "決定兩天主題、題目與選項", shortLabel: "兩天題目", category: "important", sourceType: "routine", completionCriteria: "完成兩天份的主題、題目與選項。" },
  { id: "sanko-cards", text: "完成兩天抽牌與素材整理", shortLabel: "抽牌整理", category: "important", sourceType: "routine", completionCriteria: "完成兩天份抽牌與素材整理。" },
  { id: "sanko-draft-1", text: "完成第一天解牌成稿", shortLabel: "首日成稿", category: "important", sourceType: "routine", completionCriteria: "完成第一天解牌成稿。" },
  { id: "sanko-draft-2", text: "完成第二天解牌成稿", shortLabel: "次日成稿", category: "important", sourceType: "routine", completionCriteria: "完成第二天解牌成稿。" },
  { id: "sanko-publish", text: "完成兩天發布或排程", shortLabel: "發布排程", category: "important", sourceType: "routine", completionCriteria: "完成兩天份發布或排程。" },
];

const GROUPS: SetupGroup[] = [
  {
    key: "sanko",
    title: "日上三更・手動兩天版",
    countLabel: "5 格重要",
    note: "工具尚未完成時，每格對應一段真實手工作業；要不要放進本週由你決定。",
    tone: "sanko",
    recommendation: "本週建議：先不加入",
    templates: SANKO_TEMPLATES,
  },
  {
    key: "english-system",
    title: "英文系統建置",
    countLabel: "4 格重要",
    note: "只放本週能驗收的成果；建置格與真正的英文修習分開留下紀錄。",
    tone: "system",
    templates: [
      { id: "english-system-topic-mobile", text: "完成主題修習手機介面測試並整理問題", shortLabel: "主題介面測試", category: "important", sourceType: "project", completionCriteria: "用手機跑完一輪主題修習，留下需要修正的問題。", learning: { trackKey: "english", templateKey: "system-topic-mobile", skill: "系統建置", path: "system", practiceType: "system-build" } },
      { id: "english-system-vocab-link", text: "完成 Lumen 傳送 VocabForge 流程測試或修正", shortLabel: "詞彙串接", category: "important", sourceType: "project", completionCriteria: "成功送出一筆測試資料，或完成一個已確認的串接修正。", learning: { trackKey: "english", templateKey: "system-vocab-link", skill: "系統建置", path: "system", practiceType: "system-build" } },
      { id: "english-system-context-log", text: "建立英文語境聊天的紀錄格式第一版", shortLabel: "聊天紀錄格式", category: "important", sourceType: "project", completionCriteria: "定下能保存情境、成功句、卡點與下次補強的第一版格式。", learning: { trackKey: "english", templateKey: "system-context-log", skill: "系統建置", path: "system", practiceType: "system-build" } },
      { id: "english-system-magic-tree", text: "整理 Magic Tree House 閱讀流程第一版", shortLabel: "故事閱讀流程", category: "important", sourceType: "project", completionCriteria: "完成閱讀、重述與表達去向的低負擔流程草案。", learning: { trackKey: "english", templateKey: "system-magic-tree", skill: "系統建置", path: "system", practiceType: "system-build" } },
    ],
  },
  {
    key: "health",
    title: "健康與生活",
    countLabel: "5 格照顧自己",
    note: "先放入低壓範例，再到盤面把括號條件改成你這週真正做得到的量。",
    tone: "health",
    templates: [
      { id: "health-stretch", text: "伸展或復健（2 次）", shortLabel: "伸展 ×2", category: "health", sourceType: "routine", completionCriteria: "完成兩次伸展或復健。", completionMode: "count", target: 2, unit: "次" },
      { id: "health-movement", text: "正式運動（1 次）", shortLabel: "運動一次", category: "health", sourceType: "routine", completionCriteria: "完成一次正式運動。" },
      { id: "health-sleep", text: "提早睡覺（2 晚）", shortLabel: "早睡 ×2", category: "health", sourceType: "routine", completionCriteria: "完成兩晚自己設定的早睡條件。", completionMode: "count", target: 2, unit: "晚" },
      { id: "health-meals", text: "做菜或準備餐點（2 餐）", shortLabel: "備餐 ×2", category: "health", sourceType: "routine", completionCriteria: "完成兩餐做菜或備餐。", completionMode: "count", target: 2, unit: "餐" },
      { id: "health-rest", text: "保留一段完整休息（半天）", shortLabel: "休息半天", category: "health", sourceType: "routine", completionCriteria: "保留半天不安排推進型工作。", unit: "段" },
    ],
  },
  {
    key: "projects",
    title: "其他專案",
    countLabel: "2 格重要",
    note: "英文已是本週主專案，其他專案只保留兩個必要下一步。",
    tone: "project",
    templates: [
      { id: "project-required-1", text: "其他必要專案：完成第一個明確下一步", shortLabel: "必要專案一", category: "important", sourceType: "project", completionCriteria: "把文字改成具體成果後，完成該成果一次。" },
      { id: "project-required-2", text: "其他必要專案：完成第二個明確下一步", shortLabel: "必要專案二", category: "important", sourceType: "project", completionCriteria: "把文字改成具體成果後，完成該成果一次。" },
    ],
  },
  {
    key: "hobbies",
    title: "純粹喜歡",
    countLabel: "3 格喜歡",
    note: "保留給真正想做的事；加入後請改成你的內容，不拿英文建置補滿。",
    tone: "hobby",
    templates: [
      { id: "hobby-1", text: "喜歡的事 1（週日填寫）", shortLabel: "喜歡一", category: "hobby", sourceType: "flexible", completionCriteria: "改成這週真正想做的一件事後完成。" },
      { id: "hobby-2", text: "喜歡的事 2（週日填寫）", shortLabel: "喜歡二", category: "hobby", sourceType: "flexible", completionCriteria: "改成這週真正想做的一件事後完成。" },
      { id: "hobby-3", text: "喜歡的事 3（週日填寫）", shortLabel: "喜歡三", category: "hobby", sourceType: "flexible", completionCriteria: "改成這週真正想做的一件事後完成。" },
    ],
  },
];

const SOURCE_PREFIX = "weekly-setup:";

export default function WeeklySetupPlanner({
  board,
  disabled,
  onApply,
  onRemove,
}: {
  board: WeeklyBoard;
  disabled: boolean;
  onApply: (board: WeeklyBoard, message: string) => Promise<void>;
  onRemove: (indexes: number[], label: string) => Promise<void>;
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
          learning: template.learning ?? null,
          completion: { mode: template.completionMode ?? "single", target: template.target ?? 1, progress: 0, unit: template.unit ?? "次", requiresEvidence: false, criteria: template.completionCriteria },
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

  async function removeGroup(group: SetupGroup, indexes: number[]) {
    const confirmed = window.confirm(`確定從本週移除「${group.title}」的 ${indexes.length} 格嗎？已排入今天的任務會保留，但會解除週盤連結。`);
    if (!confirmed) return;
    setError(null);
    try {
      await onRemove(indexes, group.title);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "移除週盤企劃時發生錯誤");
    }
  }

  return (
    <section className="ritual-card weekly-setup-planner">
      <button type="button" className="weekly-setup-head" onClick={() => setOpen((value) => !value)}>
        <span><small>週日組盤</small><b>本週企劃清單</b></span>
        <em>自由選配・不必填滿</em>
      </button>
      {open && <div className="weekly-setup-body">
        <p>每一組都只是建議模板。你可以加入、補入或從本週移除；不會因為本週主攻英文而鎖住其他企劃。</p>
        <div className="weekly-setup-groups">
          {GROUPS.map((group) => {
            const added = group.templates.filter((template) => existing.has(`${SOURCE_PREFIX}${template.id}`)).length;
            const complete = added === group.templates.length;
            const indexes = board.cells.flatMap((cell) => group.templates.some((template) => cell.sourceId === `${SOURCE_PREFIX}${template.id}`) ? [cell.index] : []);
            return <article key={group.key} className={group.tone}>
              <div className="weekly-setup-group-heading">
                <div><b>{group.title}</b><small>{group.countLabel}{group.recommendation ? `・${group.recommendation}` : ""}</small></div>
                <span>{added}/{group.templates.length}</span>
              </div>
              <p>{group.note}</p>
              <ul>{group.templates.map((template) => <li key={template.id} className={existing.has(`${SOURCE_PREFIX}${template.id}`) ? "added" : ""}>{template.text}</li>)}</ul>
              <div className="weekly-setup-group-actions">
                {complete ? <div className="weekly-setup-complete">已放入盤面</div> : <button type="button" disabled={disabled} onClick={() => void applyGroup(group)}>加入尚缺的 {group.templates.length - added} 格</button>}
                {indexes.length > 0 && <button type="button" className="remove" disabled={disabled} onClick={() => void removeGroup(group, indexes)}>從本週移除 {indexes.length} 格</button>}
              </div>
            </article>;
          })}
        </div>
        {error && <p className="form-error">{error}</p>}
        <p className="weekly-setup-footnote">加入順序不影響位置；全部填好後再使用「隨機換位」，中央自在格不會移動。</p>
      </div>}
    </section>
  );
}
