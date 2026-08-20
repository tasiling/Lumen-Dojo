import type { DailyRecord, DailyTaskCategory } from "./formal";

const TASK_CATEGORIES: DailyTaskCategory[] = ["important", "hobby", "health"];

function sameOrigin(
  left: DailyRecord["tasks"][DailyTaskCategory]["origin"],
  right: DailyRecord["tasks"][DailyTaskCategory]["origin"]
) {
  if (!left || !right) return left === right;
  return left.type === right.type && left.weekStart === right.weekStart && left.cellIndex === right.cellIndex;
}

export type CarryIncompleteTasksResult = {
  target: DailyRecord;
  carried: DailyTaskCategory[];
  alreadyPresent: DailyTaskCategory[];
  skipped: DailyTaskCategory[];
};

/**
 * 將來源日尚未完成的三件事，放進目標日同分類的空格。
 * 已有內容的目標格不會被覆寫；相同內容與來源視為已帶入，讓重試維持冪等。
 */
export function carryIncompleteTasks(source: DailyRecord, target: DailyRecord): CarryIncompleteTasksResult {
  const next: DailyRecord = {
    ...target,
    tasks: { ...target.tasks },
  };
  const carried: DailyTaskCategory[] = [];
  const alreadyPresent: DailyTaskCategory[] = [];
  const skipped: DailyTaskCategory[] = [];

  for (const category of TASK_CATEGORIES) {
    const sourceTask = source.tasks[category];
    if (!sourceTask.text.trim() || sourceTask.completed) continue;

    const targetTask = target.tasks[category];
    if (targetTask.text.trim()) {
      if (targetTask.text.trim() === sourceTask.text.trim() && sameOrigin(targetTask.origin, sourceTask.origin)) {
        alreadyPresent.push(category);
      } else {
        skipped.push(category);
      }
      continue;
    }

    next.tasks[category] = {
      ...sourceTask,
      category,
      completed: false,
      completedAt: null,
      result: "",
    };
    carried.push(category);
  }

  return { target: next, carried, alreadyPresent, skipped };
}
