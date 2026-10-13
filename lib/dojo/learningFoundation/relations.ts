import type { CaptureEntry } from "../formal";
import { LearningError, type LearningEntity } from "./model";

// Unknown historical references survive unchanged; only newly introduced IDs need authorization.
export function mergeLearningRelations(
  previous: Pick<CaptureEntry, "learningTracks" | "learningItemIds">,
  input: { learningTracks?: unknown; learningItemIds?: unknown },
  entities: LearningEntity[],
) {
  const items = entities.filter((e) => e.kind === "item");
  const prior = previous.learningItemIds ?? [];
  let ids: string[];
  if (input.learningItemIds === undefined) {
    ids = [...prior]; // old forms cannot erase the new stable-ID field
  } else {
    if (
      !Array.isArray(input.learningItemIds) ||
      input.learningItemIds.some(
        (id) => typeof id !== "string" || id.length > 160,
      )
    )
      throw new LearningError("學習關聯格式不正確");
    ids = [...new Set(input.learningItemIds as string[])];
    if (
      ids.some(
        (id) =>
          !prior.includes(id) &&
          !items.some((e) => e.id === id && e.status !== "archived"),
      )
    )
      throw new LearningError("拒絕未授權或不存在的學習關聯", 403);
    // Unresolved existing history cannot be silently discarded by a form that cannot resolve it.
    ids = [
      ...new Set([
        ...ids,
        ...prior.filter((id) => !items.some((e) => e.id === id)),
      ]),
    ];
  }
  const requestedLegacy = Array.isArray(input.learningTracks)
    ? input.learningTracks
    : previous.learningTracks;
  for (const key of requestedLegacy) {
    const mapped = items.find((e) => e.legacyKey === key);
    if (
      mapped &&
      !ids.includes(mapped.id) &&
      input.learningItemIds === undefined
    )
      ids.push(mapped.id);
  }
  const mappedLegacy = ids.flatMap((id) => {
    const e = items.find((i) => i.id === id);
    return e?.legacyKey ? [e.legacyKey] : [];
  });
  // Keep the five-key projection for consumers predating R2; names are never identifiers.
  const learningTracks = [
    ...new Set([
      ...requestedLegacy.filter(
        (k): k is CaptureEntry["learningTracks"][number] =>
          ["english", "massage", "yijing", "ziwei", "qimen"].includes(
            String(k),
          ),
      ),
      ...mappedLegacy,
    ]),
  ];
  return { learningItemIds: ids, learningTracks };
}
