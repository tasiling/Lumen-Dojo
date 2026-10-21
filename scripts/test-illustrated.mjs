import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fixture } from './weaving-fixture.mjs';
const f = await fixture();
try {
  const m = f.load('lib/dojo/illustrated/model.ts');
  const page = m.newPage('page-a');
  const draft = { title: '雨停以後', caption: '', pages: [{ ...page, title: '慢慢長出名字', body: '休息的時候，也有事情正在發生。' }] };
  assert.equal(m.parseDeckDraft(draft).pages[0].id, 'page-a');
  assert.throws(() => m.parseDeckDraft({ ...draft, owner: 'other' }), /欄位/);
  assert.throws(() => m.parseDeckDraft({ ...draft, pages: Array(13).fill(page) }), /12/);
  assert.throws(() => m.parseDeckDraft({ ...draft, pages: [page, page] }), /重複/);
  assert.throws(() => m.parseDeckDraft({ ...draft, pages: [{ ...page, image: { assetId: '../file', publicConfirmed: true } }] }), /圖片/);
  assert.throws(() => m.parseDeckDraft({ ...draft, pages: [{ ...page, body: '長'.repeat(601) }] }), /600/);
  assert(m.layoutPage({ ...page, title: '很長'.repeat(100) }).overflow, 'overflow must block output');
  assert(m.wrapCardText('m'.repeat(23),15).length>=2,'wide Latin title must wrap');
  assert.equal(m.wrapCardText('a\t  b',24)[0],'a      b','tabs have fixed shared whitespace semantics');
  const assets = f.load('lib/dojo/illustrated/assets.ts');
  const bytes = await readFile('docs/creative-illustrated-evidence/assets/rain-sprout.png');
  const a = await assets.saveAsset(bytes); const b = await assets.saveAsset(bytes);
  assert.equal(a.id, b.id); assert.equal(a.mime, 'image/png'); assert(a.width > 1000);
  assert.deepEqual((await assets.readAsset(a.id)).bytes, bytes);
  await assert.rejects(() => assets.readAsset('../escape'), /圖片/);
  await assert.rejects(() => assets.saveAsset(Buffer.from('<svg><script/></svg>')), /圖片/);
  await assert.rejects(() => assets.saveAsset(Buffer.alloc(8 * 1024 * 1024 + 1)), /8/);
  console.log('PASS illustrated domain limits/identity/layout overflow + durable raster assets/dedupe/no paths');
} finally { await f.close(); }
