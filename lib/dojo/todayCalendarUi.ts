import type { SpaceKey } from "./constants";

/** Approved representative surfaces; ink is intentionally kept separate. */
export const TODAY_REALM_PALETTE: Record<SpaceKey, { surface: string; ink: string; icon: string }> = {
  practice: { surface: "#A9C3B5", ink: "#26372F", icon: "i-compass" },
  forage: { surface: "#E3BC9E", ink: "#383223", icon: "i-leaf" },
  weaving: { surface: "#DCAEBB", ink: "#3F2D2D", icon: "i-write" },
  liaojie: { surface: "#A7BDDB", ink: "#27343F", icon: "i-chat" },
  dao: { surface: "#B1B4D5", ink: "#313140", icon: "i-layers" },
  closing: { surface: "#C4B2D3", ink: "#35303E", icon: "i-moon" },
};

export function moveCalendarPeriod(yearMonth: string, selectedDay: string, view: "month" | "week" | "day", delta: number) {
  if (view === "month") {
    const [year, month] = yearMonth.split("-").map(Number);
    const next = new Date(Date.UTC(year, month - 1 + delta, 1, 12)).toISOString().slice(0, 7);
    return { yearMonth: next, selectedDay: `${next}-01` };
  }
  const date = new Date(`${selectedDay}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta * (view === "week" ? 7 : 1));
  const next = date.toISOString().slice(0, 10);
  return { yearMonth: next.slice(0, 7), selectedDay: next };
}

export function calendarEditError(item: { title: string; date: string; startTime: string; endTime: string }): string | null {
  if (!item.title.trim()) return "請填寫行程名稱。";
  const date = new Date(`${item.date}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(item.date) || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== item.date) return "請選擇有效日期。";
  if ([item.startTime, item.endTime].some(time => time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))) return "請填寫有效時間。";
  if (item.startTime && item.endTime && item.endTime <= item.startTime) return "結束時間需要晚於開始時間。";
  return null;
}
