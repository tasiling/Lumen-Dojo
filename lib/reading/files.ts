import "server-only";
import { mkdir, open, readFile, readdir, rename, unlink } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
import { LearningError } from "@/lib/dojo/learningFoundation/model";

export function readingDirectory(name: string) {
  const root = process.env.LEARNING_WRITE_LOCK_DIR;
  if (!root || !isAbsolute(root)) throw new LearningError("閱讀紀錄的持久儲存尚未就緒。", 503);
  return join(root, name);
}
export async function getJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}
export async function jsonIds(dir: string): Promise<string[]> {
  try {
    return (await readdir(dir)).filter((n) => n.endsWith(".json")).map((n) => n.slice(0, -5));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}
export async function atomicFile(path: string, value: string | Buffer) {
  const folder = dirname(path);
  await mkdir(folder, { recursive: true, mode: 0o700 });
  const temp = join(folder, "." + crypto.randomUUID() + ".tmp");
  try {
    const handle = await open(temp, "wx", 0o600);
    try {
      await handle.writeFile(value);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temp, path);
    const parent = await open(folder, "r");
    try {
      await parent.sync();
    } finally {
      await parent.close();
    }
  } finally {
    await unlink(temp).catch(() => {});
  }
}
export const putJson = (path: string, value: unknown) => atomicFile(path, JSON.stringify(value));
