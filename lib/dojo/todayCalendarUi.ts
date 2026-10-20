import type { SpaceKey } from "./constants";

/** Approved representative surfaces; ink is intentionally kept separate. */
export const TODAY_REALM_PALETTE: Record<SpaceKey, { surface: string; ink: string; icon: string }> = {
  practice: { surface: "linear-gradient(135deg, #ABD6C7 0%, #B4D0E0 52%, #C4B3DE 100%)", ink: "#253C5C", icon: "i-compass" },
  forage: { surface: "linear-gradient(135deg, #F0C295 0%, #E8D7A5 52%, #9ED5CA 100%)", ink: "#253C5C", icon: "i-leaf" },
  weaving: { surface: "linear-gradient(135deg, #EEAAC8 0%, #D3AFE0 52%, #ADBDE6 100%)", ink: "#253C5C", icon: "i-write" },
  liaojie: { surface: "linear-gradient(135deg, #A4D8E2 0%, #B0C7E6 52%, #B9ADE1 100%)", ink: "#253C5C", icon: "i-chat" },
  dao: { surface: "linear-gradient(135deg, #B7B1D9 0%, #D7B4C7 52%, #E3C18E 100%)", ink: "#253C5C", icon: "i-layers" },
  closing: { surface: "linear-gradient(135deg, #E9CBD3 0%, #D7D5EB 52%, #C1CDE7 100%)", ink: "#253C5C", icon: "i-moon" },
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
