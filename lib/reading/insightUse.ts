// Which insight cards (DB-22) a 織光堂 work may use, and how each one is labelled.
// Pure: no reads or writes, so the same rule applies in every place that offers cards.
import type { InsightCard } from "./types";

type Card = Pick<InsightCard, "status" | "refine">;

/** A card whose outcome the owner has recorded after acting on it. */
export function insightSettled(card: Card): boolean {
  return card.status === "已驗證" || card.status === "不成立";
}

/**
 * Every card may be used except a reading card the owner gave up on.
 * 野採淬鍊 cards carry no status of their own (it reads as 觀察中), so status never blocks them.
 */
export function insightUsable(card: Card): boolean {
  return Boolean(card.refine) || card.status !== "放棄";
}

/** The label shown wherever the card is offered or recorded as a source. */
export function insightMark(card: Card): string {
  if (card.refine) return `野採淬鍊・${card.refine.cardType || "洞察"}・本人原話`;
  return insightSettled(card) ? `閱讀洞察・${card.status}` : `閱讀洞察・${card.status}・尚未驗證`;
}

/**
 * The text a work receives from the card. Reading cards keep their existing wording so works that
 * already selected them stay valid; a 野採淬鍊 card gives the owner's words and the line they answer.
 */
export function insightSourceText(card: Pick<InsightCard, "insight" | "action" | "result" | "refine">): string {
  if (card.refine) {
    const words = card.refine.words || card.insight;
    return card.refine.quote ? `${words}\n依據的原文：${card.refine.quote}` : words;
  }
  return `${card.insight}\n行動：${card.action}${card.result ? `\n結果：${card.result}` : ""}`;
}
