// 週薪查詢（行光剪藏）：指令解析與回覆文字。純規則，不連網。
// 一週是週一到週日，薪水在下週一入帳。數字來自財富豐盛記錄本（Luminara），這裡只負責顯示。

export type WeekPay = {
  week_start: string;
  week_end: string;
  pay_day: string;
  days: number;
  gross_minor: string;
  card_count: number;
  card_fee_minor: string;
  /** null when some day has no card-payment count, so the estimate would be a guess. */
  estimated_pay_minor: string | null;
  received_minor: string;
  daily: { work_date: string; amount_minor: string; card_payment_count: number | null }[];
};

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

export function shiftDate(date: string, days: number): string {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function mondayOf(date: string): string {
  const d = new Date(date + "T12:00:00Z");
  return shiftDate(date, -((d.getUTCDay() + 6) % 7));
}

function realDate(year: number, month: number, day: number): string | null {
  const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const d = new Date(date + "T12:00:00Z");
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === date ? date : null;
}

/**
 * The date whose week to show, or null when the text is not a pay lookup.
 * 「週薪」「薪水」「本週薪水」→ this week; 「上週薪水」→ last week; 「週薪 11/17」「薪水 2026/11/17」→ that date's week.
 * A month/day later than today means last year (asking in January about late December).
 */
export function parseWeekPayCommand(text: string, today: string): string | null {
  const t = text.trim().replace(/\s+/g, " ");
  if (/^(?:本週|這週|这周)?(?:週薪|周薪|薪水|預計薪水|预计薪水)$/.test(t)) return today;
  if (/^(?:上週|上周)(?:週薪|周薪|薪水|預計薪水)$/.test(t)) return shiftDate(today, -7);
  const m = /^(?:週薪|周薪|薪水|預計薪水)\s*(?:(\d{4})\/)?(\d{1,2})\/(\d{1,2})$/.exec(t);
  if (!m) return null;
  const year = m[1] ? Number(m[1]) : Number(today.slice(0, 4));
  let date = realDate(year, Number(m[2]), Number(m[3]));
  if (date && !m[1] && date > today) date = realDate(year - 1, Number(m[2]), Number(m[3]));
  return date ?? "invalid";
}

const day = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}（${WEEKDAYS[new Date(date + "T12:00:00Z").getUTCDay()]}）`;

export function aud(minor: string): string {
  const zero = BigInt(0), hundred = BigInt(100);
  const n = BigInt(minor), sign = n < zero ? "-" : "", abs = n < zero ? -n : n;
  return `AUD ${sign}${(abs / hundred).toLocaleString("en-US")}.${(abs % hundred).toString().padStart(2, "0")}`;
}

/** The reply for one week. Lists each recorded day, then the totals; nothing is averaged. */
export function weekPayReply(week: WeekPay, today: string): string {
  const head = [`週薪預估｜${day(week.week_start)}–${day(week.week_end)}`,
    week.pay_day <= today ? `入帳日 ${day(week.pay_day)}，已過` : `預計 ${day(week.pay_day)} 入帳`];
  if (!week.days) {
    return [...head, "", week.week_start > today ? "這週還沒開始。" : "這週還沒有業績紀錄。",
      "記業績請傳「日期:業績，刷卡筆數」，例如 11/18:255，4"].join("\n");
  }
  const lines = week.daily.map((d) => `・${day(d.work_date)} ${aud(d.amount_minor)}，${d.card_payment_count === null ? "刷卡筆數未記" : `刷卡 ${d.card_payment_count} 筆`}`);
  const totals = [`已記 ${week.days} 天，業績合計 ${aud(week.gross_minor)}`];
  if (week.estimated_pay_minor === null) {
    totals.push("有幾天沒有記刷卡筆數，暫時無法估算；請到財富豐盛記錄本補上。");
  } else {
    totals.push(`刷卡手續費 ${aud(week.card_fee_minor)}（${week.card_count} 筆）`, `預估週薪 ${aud(week.estimated_pay_minor)}`);
  }
  if (BigInt(week.received_minor) > BigInt(0)) totals.push(`已實收 ${aud(week.received_minor)}`);
  const open = week.week_end >= today;
  return [...head, "", ...lines, "", ...totals, "",
    open ? "這週還沒結束，數字會隨新的業績更新。" : "",
    "這是預估：業績扣刷卡手續費後對半，整週合計後四捨五入一次；實際以入帳為準。"].filter((line, i, all) => line !== "" || all[i - 1] !== "").join("\n").trim();
}

/** Neighbouring weeks for the quick reply; never a week that has not started. */
export function weekPayNeighbours(weekStart: string, today: string): { label: string; date: string }[] {
  const current = mondayOf(today);
  return [
    { label: "上一週", date: shiftDate(weekStart, -7) },
    ...(shiftDate(weekStart, 7) <= current ? [{ label: "下一週", date: shiftDate(weekStart, 7) }] : []),
    ...(weekStart !== current ? [{ label: "本週", date: today }] : []),
  ];
}
