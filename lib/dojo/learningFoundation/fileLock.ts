import { mkdir, rmdir } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { LearningError } from "./model";
import { learningWriteOutcome, type WriteOutcome } from "./writeOutcome";

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
  const outcome: WriteOutcome = {
    sent: 0,
    confirmed: 0,
    rejected: 0,
    unresolved: 0,
  };
  try {
    const result = await learningWriteOutcome.run(outcome, fn);
    // Callers may catch a mutation error (e.g. optional trace). Never return success
    // or release the mutex while any request still has an unknown outcome.
    if (outcome.unresolved) throw new Error("呼叫端未能確認全部寫入結果");
    return result;
  } catch (error) {
    if (outcome.unresolved) {
      release = false;
      throw new LearningError(
        `學習寫入結果未確認，已保留寫入鎖；已確認 ${outcome.confirmed} 筆，結果不明 ${outcome.unresolved} 筆。請管理者核對 Notion 後恢復`,
        503,
      );
    }
    if (!(error instanceof LearningError))
      throw new LearningError(
        `學習讀取／驗證失敗；已確認 ${outcome.confirmed} 筆寫入，無結果不明的請求，可重新讀取後重試`,
        503,
      );
    throw error;
  } finally {
    if (release) await rmdir(lock);
  }
}
