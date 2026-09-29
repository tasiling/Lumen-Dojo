import { mkdir, rmdir } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { LearningError } from "./model";

// Atomic mkdir coordinates processes sharing one durable POSIX filesystem.
// Never expire a lock automatically: an old writer may still be writing to Notion.
export async function withLearningWriteLock<T>(
  fn: () => Promise<T>,
  directory = process.env.LEARNING_WRITE_LOCK_DIR,
): Promise<T> {
  if (!directory || !isAbsolute(directory))
    throw new LearningError(
      "學習寫入未啟用：需設定共用持久目錄 LEARNING_WRITE_LOCK_DIR",
      503,
    );
  await mkdir(directory, { recursive: true });
  const lock = join(directory, "learning-writer.lock");
  try {
    await mkdir(lock);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST")
      throw new LearningError(
        "另一筆學習寫入進行中；請稍後重試。若持續發生，需管理者確認殘留鎖",
        409,
      );
    throw error;
  }
  let release = true;
  try {
    return await fn();
  } catch (error) {
    if (!(error instanceof LearningError)) {
      release = false;
      throw new LearningError(
        `學習寫入結果未確認，已保留寫入鎖；請管理者核對 Notion 後恢復。原因：${error instanceof Error ? error.message : String(error)}`,
        503,
      );
    }
    throw error;
  } finally {
    if (release) await rmdir(lock);
  }
}
