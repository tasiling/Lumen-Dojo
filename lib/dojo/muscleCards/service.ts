import { createHash } from "node:crypto";
import { LearningError, uuidPattern } from "../learningFoundation/model";
import { LINK_PREFIX, linkInput, linkTitle, normalizeLink, type DaoLink, type NetworkLink } from "../daoLinks/model";
import { SEED_PATTERNS, muscleByKey } from "./catalog";
import {
  ANSWER_PREFIX, CARD_PREFIX, PATTERN_FIELDS, PATTERN_PREFIX, SECTIONS, answerInput, answerTitle, cardTitle, isPatternId, isSectionKey,
  patternCards, patternInput, patternTitle, sectionInput,
  type AnswerRecord, type MuscleCardRecord, type PatternCard, type PatternRecord, type SectionKey, type StoredSection,
} from "./model";
import { cardExists, networkLinks } from "./network";

export type JsonRow = { id: string; title: string; value: unknown };
export type MuscleRepository = {
  owner: string;
  list(prefix: string): Promise<JsonRow[]>;
  /** identity：同一筆建立只送一次的穩定識別（64 位十六進位）。 */
  create(title: string, value: unknown, identity: string): Promise<void>;
  update(rowId: string, prefix: string, title: string, value: unknown): Promise<void>;
  archive(rowId: string, prefix: string): Promise<void>;
  exclusive<T>(fn: () => Promise<T>): Promise<T>;
};
export type MuscleSnapshot = { cards: MuscleCardRecord[]; patterns: PatternCard[]; links: NetworkLink[] };

const conflict = (what: string) => new LearningError(`${what}有重複或無法解析的紀錄，請人工確認`, 409);
const requestIdPattern = /^[0-9a-f-]{36}$/i;
function hashed(owner: string, ...parts: string[]) {
  return createHash("sha256").update(JSON.stringify([owner, "muscle-cards", ...parts])).digest("hex");
}
function derivedUuid(hash: string) {
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}
function requestId(value: unknown): string {
  if (typeof value !== "string" || !requestIdPattern.test(value)) throw new LearningError("需要穩定建立請求 ID");
  return value.toLowerCase();
}

function validSection(value: unknown, section: SectionKey): value is StoredSection {
  const s = value as StoredSection | null;
  return Boolean(
    s && typeof s === "object" && Number.isInteger(s.revision) && s.revision >= 1 && typeof s.updatedAt === "string" &&
    s.fields && typeof s.fields === "object" &&
    Object.entries(s.fields).every(([k, v]) => typeof v === "string" && SECTIONS[section].fields.some((f) => f.key === k)) &&
    (s.patterns === undefined || (section === "posture" && Array.isArray(s.patterns) && s.patterns.every((p) => isPatternId(p?.patternId)))),
  );
}

export function muscleService(repo: MuscleRepository) {
  async function cardRows() {
    const rows = await repo.list(CARD_PREFIX);
    const seen = new Set<string>();
    return rows.map((row) => {
      const v = row.value as MuscleCardRecord | null;
      if (
        !v || v.schema !== 1 || v.recordType !== "muscle-card" || v.owner !== repo.owner || !muscleByKey(v.key) ||
        row.title !== cardTitle(v.key) || seen.has(v.key) || !v.sections || typeof v.sections !== "object" ||
        Object.entries(v.sections).some(([k, s]) => !isSectionKey(k) || !validSection(s, k))
      )
        throw conflict("肌肉卡");
      seen.add(v.key);
      return { row, card: v };
    });
  }
  async function patternRows() {
    const rows = await repo.list(PATTERN_PREFIX);
    const seen = new Set<string>();
    return rows.map((row) => {
      const v = row.value as PatternRecord | null;
      if (
        !v || v.schema !== 1 || v.recordType !== "posture-pattern" || v.owner !== repo.owner || !isPatternId(v.id) ||
        row.title !== patternTitle(v.id) || seen.has(v.id) || !v.name?.trim() || !Number.isInteger(v.revision) || v.revision < 1 ||
        PATTERN_FIELDS.some((f) => typeof v[f.key] !== "string")
      )
        throw conflict("姿勢型態卡");
      seen.add(v.id);
      return { row, pattern: v };
    });
  }
  async function linkRows() {
    const rows = await repo.list(LINK_PREFIX);
    return rows.map((row) => {
      const link = normalizeLink(row.value, repo.owner);
      if (!link || row.title !== linkTitle(link.id)) throw conflict("道藏連結");
      return { row, link };
    });
  }
  async function snapshot(): Promise<MuscleSnapshot> {
    const [cards, patterns, links] = await Promise.all([cardRows(), patternRows(), linkRows()]);
    const cardList = cards.map((c) => c.card);
    const patternList = patternCards(patterns.map((p) => p.pattern));
    return { cards: cardList, patterns: patternList, links: networkLinks(links.map((l) => l.link), cardList, patternList) };
  }

  return {
    snapshot,

    /** 只保存一層（測試層是一個分頁）；其他層與其他分頁原樣保留。第一次保存才建立紀錄。 */
    saveSection: (key: string, section: unknown, revision: unknown, content: unknown) =>
      repo.exclusive(async () => {
        if (!muscleByKey(key)) throw new LearningError("找不到這張肌肉卡", 404);
        if (!isSectionKey(section)) throw new LearningError("卡片的層不正確");
        const [cards, patterns] = await Promise.all([cardRows(), patternRows()]);
        const known = patternCards(patterns.map((p) => p.pattern));
        const found = cards.find((c) => c.card.key === key);
        const previous = found?.card.sections[section];
        if (!Number.isInteger(revision) || revision !== (previous?.revision ?? 0))
          throw new LearningError("這一層已在別處更新，請重新整理後再編輯", 409);
        const next = sectionInput(key, section, content, (id) => known.some((p) => p.id === id), previous);
        const now = new Date().toISOString();
        const stored: StoredSection = { ...next, revision: (previous?.revision ?? 0) + 1, updatedAt: now };
        if (found) {
          const card: MuscleCardRecord = { ...found.card, sections: { ...found.card.sections, [section]: stored }, updatedAt: now };
          await repo.update(found.row.id, CARD_PREFIX, cardTitle(key), card);
          return card;
        }
        const card: MuscleCardRecord = {
          schema: 1, recordType: "muscle-card", owner: repo.owner, key, sections: { [section]: stored }, createdAt: now, updatedAt: now,
        };
        await repo.create(cardTitle(key), card, hashed(repo.owner, "card", key));
        return card;
      }),

    createPattern: (createRequestId: unknown, input: unknown) =>
      repo.exclusive(async () => {
        const id = derivedUuid(hashed(repo.owner, "pattern", requestId(createRequestId)));
        const rows = await patternRows();
        const existing = rows.find((r) => r.pattern.id === id);
        if (existing) return existing.pattern;
        const fields = patternInput(input, true);
        const now = new Date().toISOString();
        const pattern: PatternRecord = {
          schema: 1, recordType: "posture-pattern", owner: repo.owner, id, name: fields.name!,
          description: fields.description ?? "", observation: fields.observation ?? "", source: fields.source ?? "",
          revision: 1, createdAt: now, updatedAt: now,
        };
        await repo.create(patternTitle(id), pattern, hashed(repo.owner, "pattern", id));
        return pattern;
      }),

    /** 第一批種子型態卡在第一次保存時才建立紀錄（revision 0）。 */
    editPattern: (id: unknown, revision: unknown, input: unknown) =>
      repo.exclusive(async () => {
        if (!isPatternId(id)) throw new LearningError("找不到這張型態卡", 404);
        const rows = await patternRows();
        const found = rows.find((r) => r.pattern.id === id);
        const seed = SEED_PATTERNS.find((s) => s.id === id);
        if (!found && !seed) throw new LearningError("找不到這張型態卡", 404);
        if (!Number.isInteger(revision) || revision !== (found?.pattern.revision ?? 0))
          throw new LearningError("型態卡已在別處更新，請重新整理後再編輯", 409);
        const fields = patternInput(input, false);
        const now = new Date().toISOString();
        if (found) {
          const pattern: PatternRecord = { ...found.pattern, ...fields, revision: found.pattern.revision + 1, updatedAt: now };
          await repo.update(found.row.id, PATTERN_PREFIX, patternTitle(id), pattern);
          return pattern;
        }
        const pattern: PatternRecord = {
          schema: 1, recordType: "posture-pattern", owner: repo.owner, id, name: fields.name ?? seed!.name,
          description: fields.description ?? "", observation: fields.observation ?? "", source: fields.source ?? "",
          revision: 1, createdAt: now, updatedAt: now,
        };
        await repo.create(patternTitle(id), pattern, hashed(repo.owner, "pattern", id));
        return pattern;
      }),

    async listAnswers(cardKey: string): Promise<AnswerRecord[]> {
      if (!muscleByKey(cardKey)) throw new LearningError("找不到這張肌肉卡", 404);
      const rows = await repo.list(`${ANSWER_PREFIX}${cardKey}-`);
      return rows
        .map((row) => row.value as AnswerRecord)
        .filter((v) => v && v.schema === 1 && v.recordType === "muscle-answer" && v.owner === repo.owner && v.cardKey === cardKey && isSectionKey(v.section))
        .sort((a, b) => b.practicedOn.localeCompare(a.practicedOn) || b.createdAt.localeCompare(a.createdAt));
    },

    /** 每筆答題各存一筆紀錄，不合併、不計分。同一個請求重送不會重複建立。 */
    addAnswers: (cardKey: string, createRequestId: unknown, entries: unknown) =>
      repo.exclusive(async () => {
        const request = requestId(createRequestId);
        if (!Array.isArray(entries) || !entries.length || entries.length > 30) throw new LearningError("答題紀錄需要 1 到 30 筆");
        const inputs = entries.map((e) => answerInput(cardKey, e));
        const existing = await repo.list(`${ANSWER_PREFIX}${cardKey}-`);
        const now = new Date().toISOString();
        const saved: AnswerRecord[] = [];
        for (const [index, input] of inputs.entries()) {
          const id = derivedUuid(hashed(repo.owner, "answer", request, String(index)));
          const found = existing.find((row) => row.title === answerTitle(cardKey, id));
          if (found) {
            saved.push(found.value as AnswerRecord);
            continue;
          }
          const record: AnswerRecord = { schema: 1, recordType: "muscle-answer", owner: repo.owner, id, cardKey, ...input, createdAt: now };
          await repo.create(answerTitle(cardKey, id), record, hashed(repo.owner, "answer", id));
          saved.push(record);
        }
        return saved;
      }),

    archiveAnswer: (cardKey: string, id: unknown) =>
      repo.exclusive(async () => {
        if (!muscleByKey(cardKey) || typeof id !== "string" || !uuidPattern.test(id)) throw new LearningError("找不到這筆答題紀錄", 404);
        const rows = await repo.list(answerTitle(cardKey, id));
        const found = rows.find((row) => row.title === answerTitle(cardKey, id));
        if (!found) throw new LearningError("找不到這筆答題紀錄", 404);
        await repo.archive(found.id, ANSWER_PREFIX);
      }),

    createLink: (createRequestId: unknown, input: unknown) =>
      repo.exclusive(async () => {
        const id = derivedUuid(hashed(repo.owner, "link", requestId(createRequestId)));
        const [links, patterns] = await Promise.all([linkRows(), patternRows()]);
        const existing = links.find((l) => l.link.id === id);
        if (existing) return existing.link;
        const known = patternCards(patterns.map((p) => p.pattern));
        const fields = linkInput(input, (ref) => cardExists(ref, known));
        const same = (x: DaoLink) =>
          x.type === fields.type && x.note === fields.note &&
          ((x.a.kind === fields.a.kind && x.a.id === fields.a.id && x.b.kind === fields.b.kind && x.b.id === fields.b.id) ||
            (x.a.kind === fields.b.kind && x.a.id === fields.b.id && x.b.kind === fields.a.kind && x.b.id === fields.a.id));
        if (links.some((l) => same(l.link))) throw new LearningError("已經有一條相同的連結", 409);
        const link: DaoLink = { schema: 1, recordType: "dao-link", owner: repo.owner, id, ...fields, createdAt: new Date().toISOString() };
        await repo.create(linkTitle(id), link, hashed(repo.owner, "link", id));
        return link;
      }),

    archiveLink: (id: unknown) =>
      repo.exclusive(async () => {
        if (typeof id !== "string" || !uuidPattern.test(id)) throw new LearningError("自動連結由姿勢評估產生，不能在這裡刪除", 400);
        const found = (await linkRows()).find((l) => l.link.id === id);
        if (!found) throw new LearningError("找不到這條連結", 404);
        await repo.archive(found.row.id, LINK_PREFIX);
      }),
  };
}
