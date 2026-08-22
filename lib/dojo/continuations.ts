export type PersonalContinuation = {
  source: "daily" | "legacy";
  id: string;
  createdDate: string;
  carryToDate: string;
  text: string;
};

export function selectDueContinuations(
  items: PersonalContinuation[],
  todayISO: string,
  limit = 3
): PersonalContinuation[] {
  const unique = new Map<string, PersonalContinuation>();
  for (const item of items) {
    const key = `${item.createdDate}\n${item.carryToDate}\n${item.text.trim()}`;
    const previous = unique.get(key);
    if (!previous || (previous.source === "legacy" && item.source === "daily")) unique.set(key, item);
  }
  return [...unique.values()]
    .filter((item) => item.carryToDate <= todayISO && item.text.trim())
    .sort((a, b) =>
      a.carryToDate.localeCompare(b.carryToDate) || a.createdDate.localeCompare(b.createdDate)
    )
    .slice(0, limit);
}
