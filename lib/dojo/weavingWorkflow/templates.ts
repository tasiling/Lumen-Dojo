import { normalizeWorkflow, type TextWorkflow, type OutputKind } from './model';
export const TEXT_TEMPLATES: Record<string, {
    label: string;
    outputKind: OutputKind;
    roles: string[];
    note: string;
}> = {
    article: { label: '長文／文章', outputKind: 'article', roles: ['開頭', '主要觀點', '例子與引用', '收尾'], note: '把一個觀點說完整。' },
    plurk: { label: '短貼文／噗浪串文', outputKind: 'thread', roles: ['開頭', '例子或感受', '收尾'], note: '可合成單篇，或保留逐樓順序。' },
    instagram_carousel: { label: 'IG 輪播文案', outputKind: 'carousel_copy', roles: ['封面', '第 2 頁', '第 3 頁', '結尾'], note: '此件交付逐頁文案；圖卡製作另行接續。' },
    instagram_story: { label: 'IG 限動文字', outputKind: 'story_copy', roles: ['第 1 張', '第 2 張', '互動或收尾'], note: '保留連續畫面、短句與配圖備註。' },
    spoken_script: { label: '口播稿', outputKind: 'spoken_script', roles: ['開場', '主要講述', '例子', '收尾'], note: '此件交付可試讀腳本；錄音或影片另行接續。' },
};
export function createTextWorkflow(templateKey: string): TextWorkflow {
    const template = TEXT_TEMPLATES[templateKey];
    if (!template)
        throw new Error('文字模板不存在');
    return normalizeWorkflow({ schemaVersion: 1, templateKey, currentStep: 'sources', outputKind: template.outputKind, blocks: template.roles.map(role => ({ id: crypto.randomUUID(), role, text: '', mediaNote: '' })), sourceSelections: [], audience: '', outline: '' })!;
}

/** Previewable conversion. Original block IDs, text and media notes are retained. */
export function convertWorkflow(original:TextWorkflow,templateKey:string):TextWorkflow {
 if(templateKey===original.templateKey)return structuredClone(original);
 const target=createTextWorkflow(templateKey);
 const hasContent=original.blocks.some(b=>b.text.trim()||b.mediaNote.trim());
 return normalizeWorkflow({...original,templateKey,outputKind:target.outputKind,currentStep:'production',blocks:hasContent?[...original.blocks.map(b=>({...b})),...target.blocks]:target.blocks})!;
}
