import "server-only";
import { open, readFile, rename, unlink } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { withLearningWriteLock } from "../learningFoundation/fileLock";
import { LearningError } from "../learningFoundation/model";

export type Records = Record<string, unknown>;
type Change = { key: string; before: unknown; after: unknown };
type Document = { version: 1; revision: number; records: Records };
const keyPattern = /^(work|shuttle|topicExtras|reading|forge|match|review|publication|inbox):[A-Za-z0-9._:-]{1,450}$/;
const object = (v: unknown): v is Records => !!v && typeof v === "object" && !Array.isArray(v);
const equal = isDeepStrictEqual;

function directory() {
  const root = process.env.LEARNING_WRITE_LOCK_DIR;
  if (!root || !isAbsolute(root)) throw new LearningError("織光堂的持久儲存尚未就緒。", 503);
  return join(root, "weaving-studio");
}

export async function readStudio(): Promise<Document> {
  try {
    const doc = JSON.parse(await readFile(join(directory(), "workspace.json"), "utf8"));
    if (doc.version !== 1 || !Number.isSafeInteger(doc.revision) || !object(doc.records)) throw Error("織光堂資料格式不符。");
    return doc;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { version: 1, revision: 0, records: {} };
    throw error;
  }
}

const missing = Symbol("absent");
function conflict(): never { throw new LearningError("這份內容已在其他視窗修改。你的草稿已保留，可先下載再載入最新內容。", 409); }
function merge(base: unknown, proposed: unknown, current: unknown, field = ""): unknown {
  if (equal(proposed, current) || equal(base, current)) return proposed;
  if (equal(base, proposed)) return current;
  if (object(base) && object(proposed) && object(current)) {
    const merged = { ...current };
    for (const key of new Set([...Object.keys(base), ...Object.keys(proposed)])) {
      if (["__proto__", "constructor", "prototype"].includes(key)) throw new LearningError("資料欄位不正確。");
      const next = merge(Object.hasOwn(base,key) ? base[key] : missing, Object.hasOwn(proposed,key) ? proposed[key] : missing, Object.hasOwn(current,key) ? current[key] : missing,key);
      if (next === missing) delete merged[key]; else merged[key] = next;
    }
    return merged;
  }
  if (field === "cardUses" && [base, proposed, current].every(x=>x === missing || Array.isArray(x))) {
    const byId = (values: unknown) => {
      const map: Records = {};
      for (const link of (values === missing ? [] : values) as Records[]) {
        const id = link.readingId ? "reading:" + link.readingId : "card:" + link.cardId;
        if (Object.hasOwn(map, id)) conflict();
        map[id] = link;
      }
      return map;
    };
    return Object.values(merge(byId(base), byId(proposed), byId(current)) as Records);
  }
  // Two clients can create different link annotations on the same pre-existing topic.
  if (field === "topicExtras" && base === null && object(proposed) && object(current)) return merge({}, proposed, current);
  return conflict();
}

export async function changeStudio(input: unknown): Promise<{ revision: number; values: Records }> {
  if (!object(input) || !Array.isArray(input.changes)) throw new LearningError("儲存內容不完整。");
  const changes: Change[] = [];
  const keys = new Set<string>();
  for (const c of input.changes) {
    if (!object(c) || typeof c.key !== "string" || !keyPattern.test(c.key) || keys.has(c.key) ||
        !Object.hasOwn(c, "before") || !Object.hasOwn(c, "after") || (c.after !== null && !object(c.after))) {
      throw new LearningError("資料識別或欄位不正確。");
    }
    keys.add(c.key);
    changes.push({key:c.key,before:c.before,after:c.after});
  }
  const dir = directory();
  return withLearningWriteLock(async () => {
    const doc = await readStudio(), values: Records = {};
    let changed = false;
    for (const c of changes) {
      const current = doc.records[c.key] ?? null;
      const next = merge(c.before, c.after, current, c.key.split(":")[0]);
      changed ||= !equal(current, next);
      if (next === null) delete doc.records[c.key]; else doc.records[c.key] = next;
      values[c.key] = next;
    }
    if (changed) {
      doc.revision += 1;
      const temporary = join(dir, "." + randomUUID() + ".tmp");
      try {
        const handle = await open(temporary, "wx", 0o600);
        try { await handle.writeFile(JSON.stringify(doc)); await handle.sync(); } finally { await handle.close(); }
        await rename(temporary, join(dir, "workspace.json"));
        const parent = await open(dir, "r");
        try { await parent.sync(); } finally { await parent.close(); }
      } finally { await unlink(temporary).catch(() => {}); }
    }
    return { revision: doc.revision, values };
  }, dir);
}
