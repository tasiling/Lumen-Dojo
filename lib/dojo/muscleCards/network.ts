// 肌肉卡、型態卡接進道藏卡片連結：登記卡片類型、推導「同一個姿勢型態」的自動連結。
import { asNetworkLink, type CardRef, type DaoLink, type NetworkLink } from "../daoLinks/model";
import { MUSCLES, muscleByKey } from "./catalog";
import { TENDENCY_LABELS, patternMembers, type MuscleCardRecord, type PatternCard } from "./model";

export const MUSCLE_KIND = "muscle";
export const PATTERN_KIND = "posture-pattern";

export function cardExists(ref: CardRef, patterns: PatternCard[]): boolean {
  if (ref.kind === MUSCLE_KIND) return Boolean(muscleByKey(ref.id));
  if (ref.kind === PATTERN_KIND) return patterns.some((p) => p.id === ref.id);
  return false;
}
export function cardLabel(ref: CardRef, patterns: PatternCard[]): string {
  if (ref.kind === MUSCLE_KIND) return muscleByKey(ref.id)?.name ?? "（已不在目錄的肌肉卡）";
  if (ref.kind === PATTERN_KIND) return patterns.find((p) => p.id === ref.id)?.name ?? "（找不到的型態卡）";
  return "（尚未支援的卡片類型）";
}

const order = (key: string) => MUSCLES.findIndex((m) => m.key === key);

/** 同屬一個型態的肌肉自動互連，也各自連到型態卡。不存檔，每次由姿勢評估分頁推導。 */
export function postureLinks(cards: MuscleCardRecord[], patterns: PatternCard[]): NetworkLink[] {
  const links: NetworkLink[] = [];
  for (const pattern of patterns) {
    const members = patternMembers(cards, pattern.id).sort((x, y) => order(x.muscle) - order(y.muscle));
    const tendency = (t: string) => (t ? TENDENCY_LABELS[t as "tight" | "weak"] : "");
    for (const m of members)
      links.push({
        id: `auto-${pattern.id}-${m.muscle}`,
        a: { kind: MUSCLE_KIND, id: m.muscle },
        b: { kind: PATTERN_KIND, id: pattern.id },
        type: "same-posture",
        note: tendency(m.tendency) ? `在${pattern.name}中${tendency(m.tendency)}` : `屬於${pattern.name}`,
        derived: true,
      });
    for (let i = 0; i < members.length; i++)
      for (let j = i + 1; j < members.length; j++) {
        const x = members[i], y = members[j];
        const name = (k: string) => muscleByKey(k)?.name ?? k;
        links.push({
          id: `auto-${pattern.id}-${x.muscle}-${y.muscle}`,
          a: { kind: MUSCLE_KIND, id: x.muscle },
          b: { kind: MUSCLE_KIND, id: y.muscle },
          type: "same-posture",
          note: `${pattern.name}：${name(x.muscle)}${tendency(x.tendency)}、${name(y.muscle)}${tendency(y.tendency)}`,
          derived: true,
        });
      }
  }
  return links;
}

export function networkLinks(stored: DaoLink[], cards: MuscleCardRecord[], patterns: PatternCard[]): NetworkLink[] {
  return [...stored.map(asNetworkLink), ...postureLinks(cards, patterns)];
}
