export const PERMANENT_FOCUS_DECKS = ['日常啟動','按摩工作','JRPG／冒險遊戲','生活模擬遊戲','故事閱讀','影音口語'] as const;
export type RoutingSelection = { sourceName: string; focusDecks: string[]; selectedKeys: string[] };
export type DestinationResult = { status: 'not-selected' | 'received' | 'partial' | 'failed'; error: string };
export type RoutingResults = { context: DestinationResult; vocab: DestinationResult };
export function normalizeRoutingSelection(value: unknown): RoutingSelection {
  const raw = value && typeof value === "object" ? value as Partial<RoutingSelection> : {};
  const strings = (items: unknown) => [...new Set((Array.isArray(items) ? items : []).filter((v): v is string => typeof v === "string").map(v => v.trim()).filter(Boolean))];
  const sourceName = typeof raw.sourceName === "string" ? raw.sourceName.normalize("NFKC").trim().slice(0, 300) : "";
  const focusDecks = strings(raw.focusDecks);
  const selectedKeys = strings(raw.selectedKeys);
  if (!sourceName) throw new Error("請確認作品或生活情境來源");
  if (!focusDecks.length) throw new Error("請至少選擇一個常駐豆倉");
  if (focusDecks.length > 2) throw new Error("最多選擇兩個常駐豆倉");
  if (focusDecks.some(deck => !PERMANENT_FOCUS_DECKS.includes(deck as typeof PERMANENT_FOCUS_DECKS[number]))) throw new Error("請選擇既有常駐豆倉，作品名稱只作為來源");
  if (!selectedKeys.length) throw new Error("請至少選擇一個單字");
  if (selectedKeys.length > 5) throw new Error("最多選擇五個單字");
  return { sourceName, focusDecks, selectedKeys };
}

// Run serially: both exports update the same source record. Each destination
// retains its own receipt; a failed receiver must not block the other receiver.
export async function dispatchSelectedDestinations(operations: { context?: () => Promise<unknown>; vocab?: () => Promise<unknown> }): Promise<RoutingResults> {
  const results: RoutingResults = { context: { status: "not-selected", error: "" }, vocab: { status: "not-selected", error: "" } };
  for (const destination of ["context", "vocab"] as const) {
    const operation = operations[destination];
    if (!operation) continue;
    try {
      const value = await operation() as { failures?: unknown[] } | undefined;
      const failed = Array.isArray(value?.failures) ? value.failures.length : 0;
      results[destination] = { status: failed ? "partial" : "received", error: failed ? `${failed} 個單字未接收，可重試` : "" };
    } catch (error) {
      results[destination] = { status: "failed", error: error instanceof Error ? error.message : String(error) };
    }
  }
  return results;
}

export function routingEntryUrl(base: string, id: string, target: "context" | "vocab" | "both"): string {
  const url = new URL(base);
  if (url.pathname.replace(/\/$/, "") === "/forage") url.pathname = "/forage/english";
  url.searchParams.set("englishImageId", id);
  url.searchParams.set("dispatch", target);
  return url.toString();
}
