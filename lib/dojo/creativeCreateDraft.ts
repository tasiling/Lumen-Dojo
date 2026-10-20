import type { SelectionRequest } from './weavingWorkflow/sources';

export const CREATE_DRAFT_KEY = 'weaving-buffer:create-shuttle';
export type CreateDraft = {
  schema: 1; sourceMode: 'manual' | 'sources'; sourceSnapshot: string; coreStatement: string;
  templateKey: string; step: 'sources' | 'concept'; manualContentKind: string;
  selectionRequests: SelectionRequest[]; selectedPreviews: string[]; updatedAt: string;
};
export function emptyCreativeCreateDraft(): CreateDraft {
  return { schema: 1, sourceMode: 'manual', sourceSnapshot: '', coreStatement: '', templateKey: 'article', step: 'sources', manualContentKind: 'insight', selectionRequests: [], selectedPreviews: [], updatedAt: '' };
}
export function readCreativeCreateDraft(): CreateDraft | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = JSON.parse(sessionStorage.getItem(CREATE_DRAFT_KEY) ?? 'null');
    if (!raw) return null;
    // Also recover the earlier useWeavingDraft buffer; selected IDs/versions stay intact.
    const value = raw.value ?? raw;
    if (typeof value.sourceSnapshot !== 'string' || typeof value.coreStatement !== 'string') return null;
    const base = emptyCreativeCreateDraft();
    return { ...base, sourceSnapshot: value.sourceSnapshot, coreStatement: value.coreStatement,
      sourceMode: value.sourceMode === 'sources' || (!value.sourceMode && value.selectionRequests?.length) ? 'sources' : 'manual',
      step: value.step === 'concept' ? 'concept' : 'sources',
      templateKey: typeof value.templateKey === 'string' ? value.templateKey : base.templateKey,
      manualContentKind: typeof value.manualContentKind === 'string' ? value.manualContentKind : base.manualContentKind,
      selectionRequests: Array.isArray(value.selectionRequests) ? value.selectionRequests : [],
      selectedPreviews: Array.isArray(value.selectedPreviews) ? value.selectedPreviews.filter((v: unknown) => typeof v === 'string') : [],
      updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : '' };
  } catch { return null; }
}
export function saveCreativeCreateDraft(value: CreateDraft) { sessionStorage.setItem(CREATE_DRAFT_KEY, JSON.stringify(value)); }
export function clearCreativeCreateDraft() { sessionStorage.removeItem(CREATE_DRAFT_KEY); }
