import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { loader } from './weaving-test-harness.mjs';

assert(existsSync('lib/dojo/liaojieText/model.ts'), 'text platform domain must exist');
const m = loader()('lib/dojo/liaojieText/model.ts');

const source = '第一段是在雨天散步時想到的事。\n\n第二段比較長，想提醒自己不必立刻把每個感受變成答案。\n\n最後，我想邀請有相似經驗的人說說看。';
const plurk = m.adaptSource('plurk', source);
assert.equal(plurk[0].role, 'main');
assert(plurk.every(block => block.text.length <= 360));
assert.equal(plurk.map(block => block.text).join('\n\n'), source);

const threads = m.adaptSource('threads', `${'甲'.repeat(490)}。${'乙'.repeat(490)}。`);
assert(threads.length >= 2);
assert(threads.every(block => block.text.length <= 500));
assert.equal(threads.map(block => block.text).join(''), `${'甲'.repeat(490)}。${'乙'.repeat(490)}。`);

const instagram = m.adaptSource('instagram_post', source);
assert.deepEqual(instagram.map(block => block.role), ['caption']);
assert.equal(instagram[0].text, source);
assert.throws(() => m.adaptSource('plurk', '長'.repeat(30000)), /80|過長|縮短/);

assert.throws(() => m.adaptSource('threads', ''), /原稿/);
assert.throws(() => m.parseVariantPatch({ title: '', voiceNote: '', changeNote: '', blocks: [] }, 'instagram_post'), /至少/);
assert.throws(() => m.parseVariantPatch({ title: '標題', voiceNote: '', changeNote: '', blocks: [{ id: 'x', role: 'post', text: '甲'.repeat(501) }] }, 'threads'), /500/);
assert.throws(() => m.parseVariantPatch({ title: '標題', voiceNote: '', changeNote: '', blocks: [{ id: 'x', role: 'floor', text: '一樓' }] }, 'plurk'), /主噗/);
assert.equal(m.parseVariantPatch({ title: '標題', voiceNote: '保留停頓', changeNote: '縮短開頭', blocks: [{ id: 'a', role: 'post', text: '內容' }] }, 'threads').voiceNote, '保留停頓');

const variant = m.normalizeVariant({ schema: 1, owner: 'dojo-private-owner', publicationId: 'p1', sourceCompletionVersionId: 'c1', sourceDigest: 'digest', platform: 'plurk', revision: 2, currentVersionId: 'v2', versionRefs: ['v1', 'v2'], status: 'ready', scheduledOn: null, publishedUrl: '', plurkDraftId: null, plurkSourceVersionId: null, createdAt: '2026-10-21T00:00:00Z', updatedAt: '2026-10-21T00:00:00Z' }, { id: 'variant-1' });
assert.equal(variant.currentVersionId, 'v2');
assert.throws(() => m.normalizeVariant({ ...variant, currentVersionId: 'unknown' }, { id: 'variant-1' }), /版本/);
assert.throws(() => m.validateStatusChange(variant, { status: 'published', publishedUrl: '' }), /連結/);
assert.equal(m.validateStatusChange(variant, { status: 'scheduled', scheduledOn: '2026-10-31' }).status, 'scheduled');

console.log('PASS single-platform adaptation, per-platform bounds/long-source rejection, protected patch, immutable history pointer and status validation');
