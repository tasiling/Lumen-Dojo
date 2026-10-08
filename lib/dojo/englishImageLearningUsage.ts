export const LEARNING_USAGE_PROMPT = "英文學習例句以 6–16 字為目標，最多 18 個英文單字、140 字元，只寫一句有完整意思的自然英文，包含目標單字（可用正常詞形變化），大寫開頭並以句號、問號或驚嘆號結尾。不得放遊戲劇情摘要、標題、名詞片段、列點或截斷原文。中文翻譯只翻譯這一句，最多 100 字元，不得混入其他事件。原始 OCR 與遇見句另行保留；重寫句標為 generated。";

type LearningUsage = { expression: string; usage: string; usageTranslation: string };
const tokens = (text: string) => text.normalize("NFKC").replace(/[’‘]/g, "'").toLowerCase().match(/[a-z]+(?:['-][a-z]+)*/g) || [];

export function containsLearningWord(word: string, sentence: string): boolean {
  const target = tokens(word).join("");
  if (!target) return false;
  const forms = new Set([target, `${target}s`, `${target}es`, `${target}ed`, `${target}ing`]);
  if (target.endsWith("e")) { forms.add(`${target}d`); forms.add(`${target.slice(0, -1)}ing`); }
  if (/[^aeiou]y$/.test(target)) { forms.add(`${target.slice(0, -1)}ies`); forms.add(`${target.slice(0, -1)}ied`); }
  if (/[^aeiouwxy][aeiou][^aeiouwxy]$/.test(target)) { forms.add(`${target}${target.at(-1)}ed`); forms.add(`${target}${target.at(-1)}ing`); }
  const irregular: Record<string, string[]> = { seek: ["sought"], go: ["went", "gone"], put: ["putting"], feel: ["felt"], find: ["found"], blow: ["blew", "blown"], spend: ["spent"], take: ["took", "taken"], swim: ["swam", "swum"], see: ["saw", "seen"], have: ["has", "had"], be: ["am", "is", "are", "was", "were", "been"] };
  for (const form of irregular[target] || []) forms.add(form);
  return tokens(sentence).some(token => forms.has(token));
}

// These are structural checks, not a claim to certify grammar or translation
// meaning. AI instructions and the visible sentence/translation pair supplement them.
export function learningUsageIssues(value: LearningUsage): string[] {
  const sentence = value.usage?.normalize("NFKC").trim() || "";
  const translation = value.usageTranslation?.normalize("NFKC").trim() || "";
  const issues: string[] = [];
  if (!sentence) issues.push("缺少學習例句");
  else {
    if (tokens(sentence).length > 18 || sentence.length > 140) issues.push("學習例句過長（最多 18 字、140 字元）");
    if (tokens(sentence).length < 3 || !/^["'([]?[A-Z]/.test(sentence) || !/[.!?]["')\]]?$/.test(sentence) || /[\r\n\u3400-\u9fff]/.test(sentence) || (sentence.match(/[^.!?]+[.!?]?/g)?.filter(part => part.replace(/["')\]]/g, "").trim()).length || 0) !== 1 || /^\s*(?:example|sentence|meaning|translation)\s*:/i.test(sentence) || /\s\/\s/.test(sentence)) issues.push("學習例句需為完整的單句英文");
    if (!containsLearningWord(value.expression, sentence)) issues.push("學習例句未包含目標單字");
  }
  if (!translation || !/[\u3400-\u9fff]/.test(translation)) issues.push("缺少對應中文翻譯");
  if (translation.length > 100 || /[\r\n]/.test(translation) || (translation.match(/[^。！？.!?]+[。！？.!?]?/g)?.filter(part => part.trim()).length || 0) > 1) issues.push("中文翻譯需為精簡單句（最多 100 字元）");
  if (/劇情摘要|事件摘要|來源摘要|截圖(?:中|顯示)|the screenshot|in this material/i.test(`${sentence} ${translation}`)) issues.push("學習例句與翻譯不能放素材摘要");
  return issues;
}
