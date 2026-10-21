import { WeavingError } from '../weavingWorkflow/model';

export const LIAOJIE_TEXT_VARIANT_PREFIX = '行光聊解文字版本-v1-';
export const LIAOJIE_TEXT_VERSION_PREFIX = '行光聊解文字稿-v1-';
export const TEXT_PLATFORMS = {
  plurk: { label: '噗浪樓層', limit: 360 },
  threads: { label: 'Threads 貼文串', limit: 500 },
  instagram_post: { label: 'Instagram 配文', limit: null },
} as const;
export type TextPlatform = keyof typeof TEXT_PLATFORMS;
export type TextBlockRole = 'main' | 'floor' | 'post' | 'caption';
export type TextBlock = { id: string; role: TextBlockRole; text: string };
export type LiaojieTextStatus = 'draft' | 'ready' | 'scheduled' | 'published';
export type LiaojieTextVariant = {
  schema: 1;
  owner: string;
  id: string;
  revision: number;
  publicationId: string;
  sourceCompletionVersionId: string;
  sourceDigest: string;
  platform: TextPlatform;
  currentVersionId: string;
  versionRefs: string[];
  status: LiaojieTextStatus;
  scheduledOn: string | null;
  publishedUrl: string;
  plurkDraftId: string | null;
  plurkSourceVersionId: string | null;
  createdAt: string;
  updatedAt: string;
};
export type LiaojieTextVersion = {
  schema: 1;
  owner: string;
  id: string;
  variantId: string;
  platform: TextPlatform;
  number: number;
  title: string;
  voiceNote: string;
  changeNote: string;
  blocks: TextBlock[];
  createdAt: string;
};
export type LiaojieTextBundle = { variant: LiaojieTextVariant; currentVersion: LiaojieTextVersion; versions: LiaojieTextVersion[] };

const ROLES: TextBlockRole[] = ['main', 'floor', 'post', 'caption'];
const STATUSES: LiaojieTextStatus[] = ['draft', 'ready', 'scheduled', 'published'];
function object(value: unknown, message = '平台稿件格式不正確') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new WeavingError(message);
  return value as Record<string, unknown>;
}
function text(value: unknown, max: number, label: string, allowEmpty = false) {
  if (typeof value !== 'string' || value.length > max || (!allowEmpty && !value.trim())) throw new WeavingError(`${label}不能為空或超過 ${max} 字`);
  return value.trim();
}
function rawText(value: unknown, max: number, label: string) {
  if (typeof value !== 'string' || value.length > max || !value.trim()) throw new WeavingError(`${label}不能為空或超過 ${max} 字`);
  return value;
}
function platform(value: unknown): TextPlatform {
  if (typeof value !== 'string' || !(value in TEXT_PLATFORMS)) throw new WeavingError('平台不正確');
  return value as TextPlatform;
}
function date(value: unknown, allowNull = true) {
  if (value === null && allowNull) return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) throw new WeavingError('日期格式不正確');
  return value;
}
function boundary(textValue: string, start: number, max: number) {
  const end = Math.min(textValue.length, start + max);
  if (end === textValue.length) return end;
  for (let i = end; i > start + Math.floor(max * 0.55); i -= 1) {
    if ('\n。！？；，,.!?;'.includes(textValue[i - 1])) return i;
  }
  return end;
}
function splitExact(value: string, max: number) {
  const parts: string[] = [];
  for (let start = 0; start < value.length;) {
    const end = boundary(value, start, max);
    parts.push(value.slice(start, end));
    start = end;
  }
  return parts;
}
export function stableTextDigest(value: string) {
  let a = 2166136261;
  for (let i = 0; i < value.length; i += 1) a = Math.imul(a ^ value.charCodeAt(i), 16777619);
  return `${(a >>> 0).toString(16)}-${value.length}`;
}
export function adaptSource(target: TextPlatform, source: string): TextBlock[] {
  const p = platform(target);
  const value = rawText(source, 80000, '固定原稿');
  if (p === 'instagram_post') return [{ id: 'caption-1', role: 'caption', text: value }];
  const limit = TEXT_PLATFORMS[p].limit!;
  const parts = splitExact(value, limit);
  if (parts.length > 80) throw new WeavingError(`${TEXT_PLATFORMS[p].label}最多 80 段；請先縮短原稿或另選較短的固定成品`);
  return parts.map((part, index) => ({
    id: `${p}-${index + 1}`,
    role: p === 'plurk' ? (index === 0 ? 'main' : 'floor') : 'post',
    text: part,
  }));
}
export function parseVariantPatch(value: unknown, target: TextPlatform) {
  const v = object(value);
  if (Object.keys(v).some(key => !['title', 'voiceNote', 'changeNote', 'blocks'].includes(key))) throw new WeavingError('平台稿件含有受保護或未知欄位');
  const p = platform(target);
  if (!Array.isArray(v.blocks) || v.blocks.length < 1 || v.blocks.length > 80) throw new WeavingError('平台稿件至少需要一個文字區塊');
  const inputBlocks = v.blocks;
  const ids = new Set<string>();
  const blocks = inputBlocks.map((item, index) => {
    const b = object(item, '文字區塊格式不正確');
    if (Object.keys(b).some(key => !['id', 'role', 'text'].includes(key))) throw new WeavingError('文字區塊含有未知欄位');
    const id = text(b.id, 120, '區塊識別');
    if (ids.has(id)) throw new WeavingError('文字區塊識別重複');
    ids.add(id);
    if (!ROLES.includes(b.role as TextBlockRole)) throw new WeavingError('文字區塊角色不正確');
    const role = b.role as TextBlockRole;
    const expected = p === 'plurk' ? (index === 0 ? 'main' : 'floor') : p === 'threads' ? 'post' : 'caption';
    if (role !== expected || (p === 'instagram_post' && inputBlocks.length !== 1)) throw new WeavingError(p === 'plurk' ? '噗浪稿必須先有主噗，再接樓層' : '文字區塊與平台不符');
    const content = rawText(b.text, 80000, '文字內容');
    const limit = TEXT_PLATFORMS[p].limit;
    if (limit && content.length > limit) throw new WeavingError(`${TEXT_PLATFORMS[p].label}每段不能超過 ${limit} 字`);
    return { id, role, text: content };
  });
  return {
    title: text(v.title, 300, '標題'),
    voiceNote: text(v.voiceNote, 2000, '語氣註記', true),
    changeNote: text(v.changeNote, 2000, '修改註記', true),
    blocks,
  };
}
export function normalizeVariant(value: unknown, options: { id: string }): LiaojieTextVariant {
  const v = object(value);
  const refs = Array.isArray(v.versionRefs) ? v.versionRefs.map(item => text(item, 300, '稿件版本識別')) : [];
  const currentVersionId = text(v.currentVersionId, 300, '目前稿件版本');
  if (!refs.length || new Set(refs).size !== refs.length || !refs.includes(currentVersionId)) throw new WeavingError('稿件版本歷史不正確');
  const status = STATUSES.includes(v.status as LiaojieTextStatus) ? v.status as LiaojieTextStatus : 'draft';
  return {
    schema: 1,
    owner: text(v.owner, 120, '擁有者'), id: options.id,
    revision: typeof v.revision === 'number' && Number.isInteger(v.revision) && v.revision >= 1 ? v.revision : 1,
    publicationId: text(v.publicationId, 300, '聊解企劃'),
    sourceCompletionVersionId: text(v.sourceCompletionVersionId, 300, '來源成品版本'),
    sourceDigest: text(v.sourceDigest, 200, '來源摘要'),
    platform: platform(v.platform), currentVersionId, versionRefs: refs, status,
    scheduledOn: v.scheduledOn ? date(v.scheduledOn, false) : null,
    publishedUrl: text(v.publishedUrl ?? '', 2000, '發布連結', true),
    plurkDraftId: v.plurkDraftId === null || v.plurkDraftId === undefined ? null : text(v.plurkDraftId, 300, '噗浪草稿'),
    plurkSourceVersionId: v.plurkSourceVersionId === null || v.plurkSourceVersionId === undefined ? null : text(v.plurkSourceVersionId, 300, '噗浪來源版本'),
    createdAt: text(v.createdAt, 50, '建立時間'), updatedAt: text(v.updatedAt, 50, '更新時間'),
  };
}
export function normalizeVersion(value: unknown, options: { id: string }): LiaojieTextVersion {
  const v = object(value);
  const p = platform(v.platform ?? 'instagram_post');
  const patch = parseVariantPatch({ title: v.title, voiceNote: v.voiceNote ?? '', changeNote: v.changeNote ?? '', blocks: v.blocks }, p);
  return { schema: 1, owner: text(v.owner, 120, '擁有者'), id: options.id, variantId: text(v.variantId, 300, '平台版本'), platform: p, number: typeof v.number === 'number' && Number.isInteger(v.number) && v.number >= 1 ? v.number : 1, ...patch, createdAt: text(v.createdAt, 50, '建立時間') };
}
export function validateStatusChange(current: LiaojieTextVariant, patchValue: unknown) {
  const patch = object(patchValue);
  if (Object.keys(patch).some(key => !['status', 'scheduledOn', 'publishedUrl'].includes(key))) throw new WeavingError('發布狀態含有未知欄位');
  const status = STATUSES.includes(patch.status as LiaojieTextStatus) ? patch.status as LiaojieTextStatus : current.status;
  const scheduledOn = patch.scheduledOn === undefined ? current.scheduledOn : (patch.scheduledOn ? date(patch.scheduledOn, false) : null);
  const publishedUrl = patch.publishedUrl === undefined ? current.publishedUrl : text(patch.publishedUrl, 2000, '發布連結', true);
  if (status === 'scheduled' && !scheduledOn) throw new WeavingError('安排發布前請選日期');
  if (status === 'published' && !/^https?:\/\//.test(publishedUrl)) throw new WeavingError('標記已發布前請填入 http(s) 發布連結');
  return { status, scheduledOn, publishedUrl };
}
