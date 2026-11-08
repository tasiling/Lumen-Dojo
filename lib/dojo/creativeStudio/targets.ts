/** Editorial tasks, not a promise of automatic publishing or external platform limits. */
export const writingPlatforms = ['IG', 'Threads', '噗浪'] as const;
export type WritingPlatform = typeof writingPlatforms[number];
export function normalizeTargets(value: unknown, legacy = ''): WritingPlatform[] {
    if (value === undefined) {
        const name = ({ ig: 'IG', instagram: 'IG', instagram_post: 'IG', threads: 'Threads', plurk: '噗浪' } as Record<string, string>)[legacy] || legacy;
        return writingPlatforms.filter(p => p === name);
    }
    if (!Array.isArray(value) || value.some(p => !writingPlatforms.includes(p))) throw Error('目標平台不正確');
    return writingPlatforms.filter(p => value.includes(p));
}
export function togglePlatform(values: WritingPlatform[], platform: WritingPlatform) {
    return writingPlatforms.filter(p => p === platform ? !values.includes(p) : values.includes(p));
}
export function targetInstructions(s: { contentKind?: string; platform?: string; targetPlatforms?: WritingPlatform[] }) {
    const platforms = normalizeTargets(s.targetPlatforms, s.platform);
    const rules: Record<WritingPlatform, string> = {
        IG: 'IG：以可獨立閱讀的開頭、短段落及自然收尾整理配文；圖文時區分各頁文字與貼文配文，限動時列出頁次。',
        Threads: 'Threads：首則先提出這份作品的核心，需拆串時用編號逐則列出；每則能接續前後，不擅自新增主張。',
        噗浪: '噗浪：區分起噗與後續回噗；起噗能帶出情境，長文按意思分則，保留作者語氣。'
    };
    return `內容類型：${({ article: '文章', story: '限動', illustrated: '圖文' } as Record<string,string>)[s.contentKind || 'article'] || s.contentKind}。\n` + (platforms.length
        ? `本輪目標平台可複選：${platforms.join('、')}。先在「## 候選主文」提供共用主稿，再按各平台的編輯用途分別輸出，不把不同平台內容混進主稿。這些是本工作台的編輯規範，不宣稱已核對平台最新硬性限制。\n${platforms.map(p => rules[p] + `\n使用獨立標題「## 平台稿：${p}」。`).join('\n')}\n尚未獲本人採用的研究與案例，不可寫入任何平台稿；平台稿只作草稿，不代表已發布。`
        : '本輪先整理共用主稿，未指定平台；不必生成平台稿。');
}
