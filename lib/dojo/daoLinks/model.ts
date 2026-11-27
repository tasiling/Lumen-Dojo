// 道藏的卡片連結：知識網絡的資料只放在這裡。兩端是任何類型的卡（kind + id），
// 之後要把其他卡片接進同一張網，只要登記新的 kind，不必改連結格式。
import { LearningError, uuidPattern } from "../learningFoundation/model";

export const LINK_PREFIX = "行光道藏連結-";
export const LINK_NOTE_MAX = 1000;

export type CardRef = { kind: string; id: string };
export const LINK_TYPES = {
  synergist: "協同",
  antagonist: "拮抗",
  "same-action": "同一個動作",
  "same-test": "同一個測試",
  "same-posture": "同一個姿勢型態",
} as const;
export type LinkType = keyof typeof LINK_TYPES;
/** 手動建立的連結類型；「同一個姿勢型態」由姿勢評估自動產生，不能手動建。 */
export const MANUAL_LINK_TYPES: LinkType[] = ["synergist", "antagonist", "same-action", "same-test"];

export type DaoLink = {
  schema: 1;
  recordType: "dao-link";
  owner: string;
  id: string;
  a: CardRef;
  b: CardRef;
  type: LinkType;
  note: string;
  createdAt: string;
};
/** 網絡上的一條連結：存下來的手動連結，或由卡片內容推導的自動連結。 */
export type NetworkLink = { id: string; a: CardRef; b: CardRef; type: LinkType; note: string; derived: boolean };

export const linkTitle = (id: string) => `${LINK_PREFIX}${id}`;
export const sameRef = (x: CardRef, y: CardRef) => x.kind === y.kind && x.id === y.id;
export const refKey = (r: CardRef) => `${r.kind}:${r.id}`;

export function parseRef(value: unknown): CardRef {
  const v = value as Partial<CardRef> | null;
  if (!v || typeof v !== "object" || typeof v.kind !== "string" || !/^[a-z][a-z-]{0,39}$/.test(v.kind) || typeof v.id !== "string" || !/^[A-Za-z0-9-]{1,80}$/.test(v.id))
    throw new LearningError("連結的卡片識別不正確");
  return { kind: v.kind, id: v.id };
}

export function linkInput(input: unknown, exists: (ref: CardRef) => boolean): Pick<DaoLink, "a" | "b" | "type" | "note"> {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new LearningError("連結格式不正確");
  const raw = input as Record<string, unknown>;
  const a = parseRef(raw.a), b = parseRef(raw.b);
  if (sameRef(a, b)) throw new LearningError("連結的兩端不能是同一張卡");
  if (!exists(a) || !exists(b)) throw new LearningError("找不到連結的卡片", 404);
  if (!MANUAL_LINK_TYPES.includes(raw.type as LinkType)) throw new LearningError("這種連結類型不能手動建立");
  if (raw.note !== undefined && (typeof raw.note !== "string" || raw.note.length > LINK_NOTE_MAX)) throw new LearningError("說明格式不正確或過長");
  return { a, b, type: raw.type as LinkType, note: typeof raw.note === "string" ? raw.note.trim() : "" };
}

export function normalizeLink(value: unknown, owner: string): DaoLink | null {
  const v = value as Partial<DaoLink> | null;
  if (!v || v.schema !== 1 || v.recordType !== "dao-link" || v.owner !== owner || typeof v.id !== "string" || !uuidPattern.test(v.id)) return null;
  try {
    const a = parseRef(v.a), b = parseRef(v.b);
    if (!Object.hasOwn(LINK_TYPES, String(v.type))) return null;
    return { schema: 1, recordType: "dao-link", owner, id: v.id, a, b, type: v.type as LinkType, note: typeof v.note === "string" ? v.note : "", createdAt: String(v.createdAt ?? "") };
  } catch {
    return null;
  }
}

export const asNetworkLink = (l: DaoLink): NetworkLink => ({ id: l.id, a: l.a, b: l.b, type: l.type, note: l.note, derived: false });

/** 和一張卡直接相連的卡：局部視窗只看這一層。 */
export function neighbors(links: NetworkLink[], ref: CardRef): { link: NetworkLink; other: CardRef }[] {
  return links.flatMap((link) =>
    sameRef(link.a, ref) ? [{ link, other: link.b }] : sameRef(link.b, ref) ? [{ link, other: link.a }] : [],
  );
}
