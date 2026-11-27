// 肌肉卡討論包：複製到外部 AI 討論，成果貼回。站內不呼叫 AI。
// 討論包只放卡片上有內容的欄位，留空的欄位不出現，也不出題。
import { MMT_GRADING, muscleByKey } from "./catalog";
import {
  SECTIONS, SECTION_KEYS, TENDENCY_LABELS, sectionApplies, sectionView,
  type MuscleCardRecord, type PatternCard, type SectionKey,
} from "./model";

export const ANSWER_FORMAT = "肌肉卡答題/v1";
const BLOCK_START = `===${ANSWER_FORMAT}===`;
const BLOCK_END = "===題目結束===";

/** 卡片上有內容的部分，依層整理。觸康健分頁只在十四肌內才有。 */
export function cardContentLines(key: string, card: MuscleCardRecord | null, patterns: PatternCard[]): { section: SectionKey; lines: string[] }[] {
  return SECTION_KEYS.filter((s) => sectionApplies(key, s)).flatMap((section) => {
    const view = sectionView(card, key, section);
    const lines = SECTIONS[section].fields
      .filter((f) => view.fields[f.key]?.trim())
      .map((f) => `${f.label}：${view.fields[f.key].trim()}`);
    if (section === "posture")
      for (const m of view.patterns ?? []) {
        const name = patterns.find((p) => p.id === m.patternId)?.name;
        if (name) lines.unshift(`相關的姿勢型態：${name}${m.tendency ? `（在其中${TENDENCY_LABELS[m.tendency]}）` : ""}`);
      }
    // 分級是全站設定；只有這個分頁本身有內容時才放進來，避免對空分頁出題。
    if (section === "mmt" && lines.length) lines.push(`採用的分級：${MMT_GRADING}`);
    return lines.length ? [{ section, lines }] : [];
  });
}

/** 卡片完全沒有內容時回傳 null：沒有可以出題的欄位。 */
export function buildDiscussionPackage(key: string, card: MuscleCardRecord | null, patterns: PatternCard[]): string | null {
  const muscle = muscleByKey(key);
  const content = cardContentLines(key, card, patterns);
  if (!muscle || !content.length) return null;
  const layers = content.map((c) => SECTIONS[c.section].label).join("、");
  return [
    `【肌肉卡討論包｜${ANSWER_FORMAT}】`,
    `卡片：${muscle.name}`,
    "",
    "請依下面的卡片考我。規則：",
    "1. 一次只出一題，等我回答之後再出下一題。",
    "2. 出題與核對只能使用下面卡片裡的內容，不得自己補充任何解剖事實或卡片以外的知識。",
    "3. 我作答後，逐點指出我的答案和卡片哪裡不一致；完全一致就說一致。不要另外補充卡片沒有的內容。",
    "4. 卡片上沒有列出的欄位是留空的，不要針對它們出題。",
    `5. 每一題都要標明出自哪一層：${layers}。`,
    "6. 我說「結束」時，依最後的回傳格式，把每一題各輸出一段，全部放在同一個程式碼區塊裡，標記行照抄。",
    "",
    "===卡片內容===",
    ...content.flatMap((c) => [`【${SECTIONS[c.section].label}】`, ...c.lines, ""]),
    "===回傳格式（每一題一段）===",
    BLOCK_START,
    `卡片：${muscle.name}`,
    `層：（${layers} 其中之一）`,
    "題目：",
    "我的答案：（我當時的回答，照抄）",
    "不一致：（我的答案和卡片不一致的地方；一致就寫「無」）",
    BLOCK_END,
  ].join("\n");
}

export type ParsedAnswer = { section: SectionKey; question: string; answer: string; mismatch: string; raw: string };

/** 解析貼回的成果。每一段各自成為一筆答題紀錄；有問題的段落列出原因，不猜。 */
export function parseAnswerReturn(raw: string, key: string): { entries: ParsedAnswer[]; problems: string[] } {
  const muscle = muscleByKey(key);
  const entries: ParsedAnswer[] = [];
  const problems: string[] = [];
  if (!muscle) return { entries, problems: ["找不到這張肌肉卡。"] };
  const blocks = raw.replace(/\r\n?/g, "\n").split(BLOCK_START).slice(1);
  if (!blocks.length) return { entries, problems: [`沒有找到「${BLOCK_START}」標記行，請要 AI 依討論包最後的回傳格式重新輸出。`] };
  blocks.forEach((block, index) => {
    const body = block.split(BLOCK_END)[0].replace(/\n?```\s*$/, "");
    const fields: Record<string, string> = {};
    let current = "";
    for (const line of body.split("\n")) {
      const m = line.match(/^\s*(卡片|層|題目|我的答案|不一致)\s*[:：]\s*(.*)$/);
      if (m) {
        current = m[1];
        fields[current] = m[2];
      } else if (current) fields[current] += `\n${line}`;
    }
    const value = (k: string) => (fields[k] ?? "").trim();
    const label = `第 ${index + 1} 題`;
    if (value("卡片") && value("卡片") !== muscle.name) return void problems.push(`${label}寫的是「${value("卡片")}」，不是這張卡，沒有收進來。`);
    const section = SECTION_KEYS.find((s) => SECTIONS[s].label === value("層").replace(/[（）()]/g, ""));
    if (!section || !sectionApplies(key, section)) return void problems.push(`${label}的「層」無法對應到這張卡（寫的是「${value("層") || "空白"}」）。`);
    if (!value("題目")) return void problems.push(`${label}沒有題目。`);
    entries.push({
      section,
      question: value("題目"),
      answer: value("我的答案"),
      mismatch: value("不一致"),
      raw: `${BLOCK_START}${body}${BLOCK_END}`.trim(),
    });
  });
  return { entries, problems };
}
