import { DAILY_TASK_CATEGORIES, type DailyRecord, type DailyTaskCategory } from "./formal";
import { JOURNAL_QUESTIONS, type JournalQuestionKey } from "../journal/notionFormat";

export type JournalExportMode = "review" | "full";

export type ExportHistoricalJournal = {
  answers: Record<JournalQuestionKey, string>;
};

export type ExportLegacyClosing = {
  title: string;
  note: string;
  carryToDate: string | null;
};

const TASK_ORDER: DailyTaskCategory[] = ["important", "hobby", "health"];
const DISPOSITION_LABELS = { carry: "帶回", journal: "寫下今天", pause: "暫且放下" } as const;
const DEPTH_LABELS = { light: "輕層", medium: "中層", deep: "深層" } as const;

function section(title: string, lines: Array<string | null | undefined>): string | null {
  const content = lines.map((line) => line?.trim() ?? "").filter(Boolean);
  return content.length ? `【${title}】\n${content.join("\n\n")}` : null;
}

function labeled(label: string, value: string | null | undefined): string | null {
  const text = value?.trim();
  return text ? `${label}\n${text}` : null;
}

export function formatDailyJournalText(params: {
  date: string;
  record?: DailyRecord;
  journals?: ExportHistoricalJournal[];
  legacyClosings?: ExportLegacyClosing[];
  mode: JournalExportMode;
}): string {
  const { date, record, mode } = params;
  const journals = params.journals ?? [];
  const legacyClosings = params.legacyClosings ?? [];
  const sections: string[] = [];

  if (mode === "full" && record) {
    const morning = section("晨間", [
      record.morning.depth ? `晨間層級\n${DEPTH_LABELS[record.morning.depth]}` : null,
      labeled("今日意圖", record.morning.intention),
      record.morning.state ? `此刻狀態\n${record.morning.state}` : null,
      labeled("我很感恩的三件事", record.morning.gratitude),
      labeled("我的正向肯定句", record.morning.affirmation),
      labeled("我的未來日記", record.morning.futureJournal),
    ]);
    if (morning) sections.push(morning);

    const tasks = section("本日三件事", TASK_ORDER.flatMap((category) => {
      const task = record.tasks[category];
      if (!task.text.trim()) return [];
      return [`${task.completed ? "[x]" : "[ ]"} ${DAILY_TASK_CATEGORIES[category].label}\n${task.text.trim()}${task.result.trim() ? `\n結果：${task.result.trim()}` : ""}`];
    }));
    if (tasks) sections.push(tasks);

    const logs = section("白天追蹤", record.daytime.logs.map((log) => `${log.time}　${log.text}`));
    if (logs) sections.push(logs);
  }

  const daytime = section("日間札記", [record?.daytime.note]);
  if (daytime) sections.push(daytime);

  if (record) {
    // The review export becomes English-practice material.  The closing
    // disposition is workflow metadata ("寫下今天", "帶回", ...), not prose
    // the user wrote, so only keep it in the full archival export.
    const highlightLabel = mode === "review"
      ? "一束光（今日亮點：今天值得記住的美好時刻）"
      : "一束光";
    const evening = section("晚間復盤", [
      mode === "full" && record.evening.disposition
        ? `收光選擇\n${DISPOSITION_LABELS[record.evening.disposition]}`
        : null,
      labeled(highlightLabel, record.evening.highlight),
      labeled("卡住的地方", record.evening.block),
      labeled("看見了什麼", record.evening.insight),
      labeled("下一步", record.evening.nextAction),
      record.evening.carryNote.trim()
        ? `帶回${record.evening.carryToDate ? ` ${record.evening.carryToDate}` : "之後"}\n${record.evening.carryNote.trim()}`
        : null,
    ]);
    if (evening) sections.push(evening);
  }

  const historical = section("舊版晨間與收光筆記", journals.flatMap((journal) =>
    JOURNAL_QUESTIONS.flatMap((question) => labeled(question.label, journal.answers[question.key]) ?? [])
  ));
  if (historical) sections.push(historical);

  const oldClosing = section("舊版收光處置", legacyClosings.map((closing) => {
    const destination = closing.carryToDate ? ` · 帶到 ${closing.carryToDate}` : "";
    return `${closing.title}${destination}${closing.note.trim() ? `\n${closing.note.trim()}` : ""}`;
  }));
  if (oldClosing) sections.push(oldClosing);

  const title = mode === "full" ? "行光每日紀錄" : "行光日記";
  return `${title}\n日期：${date}${sections.length ? `\n\n${sections.join("\n\n")}` : "\n\n這一天沒有留下文字內容。"}`;
}

export function combineJournalTexts(texts: string[]): string {
  return texts.filter(Boolean).join("\n\n────────────────────\n\n");
}
