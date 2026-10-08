import { open, unlink } from "node:fs/promises";
import { join } from "node:path";
import { LearningError, SEEDS } from "./model";
import { learningWriteOutcome } from "./writeOutcome";

// A durable intent marker prevents retrying an ambiguous Notion create when a query
// has not yet observed it. The shared writer lock must already be held.
export async function createSeedOnce<T>(
  seedKey: string,
  create: () => Promise<T>,
  directory = process.env.LEARNING_WRITE_LOCK_DIR,
): Promise<T> {
  if (!directory || !SEEDS.some((seed) => seed.key === seedKey))
    throw new LearningError("初始化寫入設定或識別不正確", 503);
  let marker;
  try {
    marker = await open(join(directory, `seed-${seedKey}.intent`), "wx");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST")
      throw new LearningError(
        "初始化曾嘗試寫入此項目，但目前讀不到結果。請管理者核對 Notion 與初始化意圖紀錄；為避免副本，不自動再次建立",
        409,
      );
    throw error;
  }
  const outcome = learningWriteOutcome.getStore();
  const sentBefore = outcome?.sent;
  const rejectedBefore = outcome?.rejected;
  try {
    try {
      await marker.writeFile(new Date().toISOString());
      await marker.sync();
    } finally {
      await marker.close();
    }
    const parent = await open(directory, "r");
    try {
      await parent.sync();
    } finally {
      await parent.close();
    }
    // Keep the intent after acknowledged/uncertain creates: a renamed or
    // temporarily invisible row must never be recreated.
    return await create();
  } catch (error) {
    // Only our own new intent: no dispatch, or every dispatched request has
    // an explicit provider rejection. Never remove an uncertain create intent.
    // Existing intents are never removed. Cleanup failure remains conservative.
    if (
      outcome &&
      outcome.sent - sentBefore! === outcome.rejected - rejectedBefore!
    ) {
      await unlink(join(directory, `seed-${seedKey}.intent`));
      const parent = await open(directory, "r");
      try {
        await parent.sync();
      } finally {
        await parent.close();
      }
    }
    throw error;
  }
}
