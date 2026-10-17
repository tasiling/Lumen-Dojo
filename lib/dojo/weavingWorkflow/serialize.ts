import { normalizeWorkflow, type TextWorkflow, type WorkflowStep } from './model';
export function serializeWorkflow(workflow: TextWorkflow): string {
    const wf = normalizeWorkflow(workflow)!;
    return wf.blocks.filter(b => b.text.trim()).map(b => b.text).join('\n\n');
}
const kinds = { quote: '來源原文', understanding: '我的理解', experience: '我的經驗', insight: '洞察' };
const goals: Record<WorkflowStep, string> = { sources: '核對選中的素材與自己的觀點', concept: '整理本件作品的結構與例子', production: '協助完成本件文字草稿', review: '檢查引用、論述與文字，提供修改建議', handoff: '整理適合首發平台的文字版本' };
export function workflowPrompt(workflow: TextWorkflow, step: WorkflowStep, core: string, audience: string): string {
    const wf = normalizeWorkflow(workflow)!;
    return `這次的目標：${goals[step]}。\n作品形式：${wf.outputKind}\n核心觀點：${core}\n受眾：${wf.audience || audience || '一般讀者'}\n\n【我明確選中的素材】\n${wf.sourceSelections.map(r => `${kinds[r.contentKind]}｜${r.sourceId}｜${r.locator}${r.sourceVersion ? `｜版本 ${r.sourceVersion}` : ''}\n${r.selectedText}`).join('\n\n') || '目前未選摘來源；素材不足時請指出缺口。'}\n\n【構思】\n${wf.outline}\n\n【本件草稿】\n${serializeWorkflow(wf)}\n\n請保留來源原文與我的理解的區別，不把引用當成我的主張，不捏造事實。只協助目前這件作品。我會預覽後再決定保存。`;
}
