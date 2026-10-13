import "server-only";
import { mkdir, open, readFile, readdir, rename, unlink } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { withLearningWriteLock } from "../learningFoundation/fileLock";
import { LearningError } from "../learningFoundation/model";
import { trackLearningWrite } from "../learningFoundation/writeOutcome";
import type { ReflectionNote, ReflectionRepository } from "./model";

export function reflectionId(value: unknown): string {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))
    throw new LearningError("私人筆記 ID 格式不正確");
  return value.toLowerCase();
}
export function fileReflectionRepository(directory = process.env.LEARNING_WRITE_LOCK_DIR): ReflectionRepository {
  function root() {
    if (!directory || !isAbsolute(directory)) throw new LearningError("私人保存未啟用：需共用持久目錄 LEARNING_WRITE_LOCK_DIR", 503);
    return join(directory, "private-reflections");
  }
  async function get(id: string): Promise<ReflectionNote | null> {
    let content: string;
    try { content = await readFile(join(root(), `${reflectionId(id)}.json`), "utf8"); }
    catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return null; throw e; }
    const note = JSON.parse(content) as ReflectionNote;
    if (note.version !== 1 || note.id !== reflectionId(id) || typeof note.owner !== "string" || !Number.isSafeInteger(note.revision) || !Array.isArray(note.questions) || !note.answers)
      throw new LearningError("私人筆記資料格式無法確認，未修改內容", 503);
    return note;
  }
  return {
    get,
    exclusive: fn => withLearningWriteLock(fn, directory),
    async list() {
      let files: string[];
      try { files = await readdir(root()); } catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return []; throw e; }
      const result: ReflectionNote[] = [];
      for (const f of files.filter(f => f.endsWith(".json"))) {
        const note = await get(f.slice(0, -5));
        if (!note) throw new LearningError("私人筆記列表變動，請重新讀取", 503);
        result.push(note);
      }
      return result;
    },
    async write(note) {
      const dir = root(); await mkdir(dir, { recursive: true, mode: 0o700 });
      const temp = join(dir, `.${reflectionId(note.id)}-${crypto.randomUUID()}.tmp`);
      const handle = await open(temp, "wx", 0o600);
      try { await handle.writeFile(JSON.stringify(note)); await handle.sync(); }
      finally { await handle.close(); }
      try {
        // A failure after rename may already have committed: retain the shared lock.
        await trackLearningWrite(async () => {
          await rename(temp, join(dir, `${note.id}.json`));
          const parent = await open(dir, "r"); try { await parent.sync(); } finally { await parent.close(); }
        });
      } finally { await unlink(temp).catch(e => { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; }); }
    },
  };
}
