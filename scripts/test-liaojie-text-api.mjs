import assert from 'node:assert/strict';
import { fixture } from './weaving-fixture.mjs';

const f = await fixture();
try {
  const weaving = f.load('lib/dojo/weavingWorkflow/store.ts');
  const completionModel = f.load('lib/dojo/weavingWorkflow/completions.ts');
  const api = f.load('app/api/dojo/liaojie-text-variants/route.ts');

  let bundle = await weaving.createPair({ operationId: 'text-platform-pair', sourceType: 'manual', sourceSnapshot: '雨停以後，我才發現自己一直把休息當成退步。\n\n也許慢下來不是放棄，而是讓感受有時間長出名字。', coreStatement: '休息不是退步', format: 'text' });
  let work = bundle.works[0];
  work = await weaving.patchWork({ id: work.id, operationId: 'text-platform-draft', expectedRevision: work.revision, work: { title: '慢下來以後', draftText: '雨停以後，我才發現自己一直把休息當成退步。\n\n也許慢下來不是放棄，而是讓感受有時間長出名字。' } });
  const completed = await weaving.completeWork({ operationId: 'text-platform-complete', workId: work.id, expectedRevision: work.revision, previewDigest: completionModel.completionDigest(work) });
  const publication = await weaving.handoffWork({ operationId: 'text-platform-handoff', publicationConfirmed: true, weavingWorkId: work.id, completionVersionId: completed.completion.id });
  assert.equal(publication.sourceFormat, 'text');

  assert.equal((await api.GET(f.req('GET', `/api/dojo/liaojie-text-variants?publicationId=${publication.id}`, null, false))).status, 401);
  const createBody = { operationId: 'text-platform-create-plurk', publicationId: publication.id, platform: 'plurk' };
  const createdResponse = await api.POST(f.req('POST', '/api/dojo/liaojie-text-variants', createBody));
  assert.equal(createdResponse.status, 201);
  const created = await createdResponse.json();
  assert.equal(created.variant.platform, 'plurk');
  assert.equal(created.version.blocks[0].role, 'main');
  assert.equal(created.variant.versionRefs.length, 1);

  const writes = f.writes();
  const replay = await (await api.POST(f.req('POST', '/api/dojo/liaojie-text-variants', createBody))).json();
  assert.equal(replay.variant.id, created.variant.id);
  assert.equal(f.writes(), writes);
  const duplicate = await (await api.POST(f.req('POST', '/api/dojo/liaojie-text-variants', { ...createBody, operationId: 'text-platform-create-again' }))).json();
  assert.equal(duplicate.variant.id, created.variant.id);
  assert.equal(f.writes(), writes);

  const saveBody = { operationId: 'text-platform-save-v2', action: 'save', variantId: created.variant.id, expectedRevision: created.variant.revision, draft: { title: '慢下來，才聽見自己', voiceNote: '像日記，不要說教', changeNote: '把開頭改成自己的停頓', scheduledOn: '2026-10-30', publishedUrl: 'https://example.com/draft', blocks: [{ ...created.version.blocks[0], text: '雨停之後，我沒有立刻往前走。' }, { id: 'plurk-floor-2', role: 'floor', text: '以前我總把休息誤認成退步。現在比較願意問：是不是有些感受，只在慢下來時才會長出名字？' }] } };
  const saved = await (await api.PATCH(f.req('PATCH', '/api/dojo/liaojie-text-variants', saveBody))).json();
  assert.equal(saved.variant.versionRefs.length, 2);
  assert.equal(saved.version.voiceNote, '像日記，不要說教');
  assert.equal(saved.variant.scheduledOn, '2026-10-30');
  assert.equal(saved.variant.publishedUrl, 'https://example.com/draft');
  assert.equal(created.version.blocks[0].text, publication.sourceDraftSnapshot);
  const saveWrites = f.writes();
  const saveReplay = await (await api.PATCH(f.req('PATCH', '/api/dojo/liaojie-text-variants', saveBody))).json();
  assert.equal(saveReplay.version.id, saved.version.id);
  assert.equal(f.writes(), saveWrites);

  const stale = await api.PATCH(f.req('PATCH', '/api/dojo/liaojie-text-variants', { ...saveBody, operationId: 'text-platform-stale', draft: { ...saveBody.draft, title: '另一版' } }));
  assert.equal(stale.status, 409);

  const restored = await (await api.PATCH(f.req('PATCH', '/api/dojo/liaojie-text-variants', { operationId: 'text-platform-restore', action: 'restore', variantId: created.variant.id, expectedRevision: saved.variant.revision, versionId: created.version.id }))).json();
  assert.equal(restored.variant.versionRefs.length, 3);
  assert.equal(restored.version.blocks[0].text, created.version.blocks[0].text);
  assert.match(restored.version.changeNote, /回復/);

  const ready = await (await api.PATCH(f.req('PATCH', '/api/dojo/liaojie-text-variants', { operationId: 'text-platform-ready', action: 'status', variantId: created.variant.id, expectedRevision: restored.variant.revision, publicationConfirmed: true, status: 'ready', scheduledOn: null, publishedUrl: '' }))).json();
  assert.equal(ready.variant.status, 'ready');
  const readyWrites = f.writes();
  const readyReplay = await (await api.PATCH(f.req('PATCH', '/api/dojo/liaojie-text-variants', { operationId: 'text-platform-ready', action: 'status', variantId: created.variant.id, expectedRevision: restored.variant.revision, publicationConfirmed: true, status: 'ready', scheduledOn: null, publishedUrl: '' }))).json();
  assert.equal(readyReplay.variant.revision, ready.variant.revision);
  assert.equal(f.writes(), readyWrites);
  const plurkHandoffBody = { operationId: 'text-platform-plurk-handoff', action: 'plurk', variantId: created.variant.id, expectedRevision: ready.variant.revision, publicationConfirmed: true };
  const plurkHandoff = await (await api.PATCH(f.req('PATCH', '/api/dojo/liaojie-text-variants', plurkHandoffBody))).json();
  assert(plurkHandoff.plurkDraftId);
  assert.equal(plurkHandoff.variant.plurkDraftId, plurkHandoff.plurkDraftId);
  assert.equal(plurkHandoff.variant.plurkSourceVersionId, restored.version.id);
  const draftRows = await f.queries.listPlurkDrafts();
  assert.equal(draftRows.length, 1);
  const plurkFormat = f.load('lib/plurk/notionFormat.ts');
  const decoded = plurkFormat.decodePlurkContent(draftRows[0].內容);
  assert.equal(decoded.meta.sourceVariantId, created.variant.id);
  assert.equal(decoded.meta.sourceVersionId, restored.version.id);
  assert.equal(decoded.main, created.version.blocks[0].text);
  const plurkWrites = f.writes();
  const plurkReplay = await (await api.PATCH(f.req('PATCH', '/api/dojo/liaojie-text-variants', plurkHandoffBody))).json();
  assert.equal(plurkReplay.plurkDraftId, plurkHandoff.plurkDraftId);
  assert.equal(f.writes(), plurkWrites);
  const plurkDraftRoute = f.load('app/api/plurk/drafts/[id]/route.ts');
  await plurkDraftRoute.PATCH(f.req('PATCH', `/api/plurk/drafts/${plurkHandoff.plurkDraftId}`, { method: decoded.meta.method, tplName: decoded.meta.tplName, main: `${decoded.main}（蓋樓台修改）`, floors: decoded.floors, at: decoded.meta.at, status: decoded.meta.status, createdAt: decoded.meta.createdAt }), { params: Promise.resolve({ id: plurkHandoff.plurkDraftId }) });
  const afterTowerEdit = plurkFormat.decodePlurkContent((await f.queries.listPlurkDrafts())[0].內容);
  assert.equal(afterTowerEdit.meta.sourceVariantId, created.variant.id);
  assert.equal(afterTowerEdit.meta.sourceVersionId, restored.version.id);
  const afterTowerBridge = await (await api.PATCH(f.req('PATCH', '/api/dojo/liaojie-text-variants', { ...plurkHandoffBody, operationId: 'text-platform-plurk-after-tower-edit', expectedRevision: plurkHandoff.variant.revision }))).json();
  assert.equal(afterTowerBridge.plurkDraftId, plurkHandoff.plurkDraftId);
  assert.equal((await f.queries.listPlurkDrafts()).length, 1);
  const reconciledBridge = await weaving.reconcileOperation('text-platform-plurk-after-tower-edit');
  assert.equal(reconciledBridge.observations.plurkDraft.state, 'confirmed');
  const publishedWithoutUrl = await api.PATCH(f.req('PATCH', '/api/dojo/liaojie-text-variants', { operationId: 'text-platform-publish-no-url', action: 'status', variantId: created.variant.id, expectedRevision: afterTowerBridge.variant.revision, publicationConfirmed: true, status: 'published', publishedUrl: '' }));
  assert.equal(publishedWithoutUrl.status, 400);

  const listed = await (await api.GET(f.req('GET', `/api/dojo/liaojie-text-variants?publicationId=${publication.id}`, null))).json();
  assert.equal(listed.variants.length, 1);
  assert.equal(listed.variants[0].versions.length, 3);
  assert.equal(listed.variants[0].currentVersion.id, restored.version.id);
  const originalGet = f.queries.getKnowledgeEntry; let blocked = false, releasePublication;
  f.queries.getKnowledgeEntry = async id => { if (id === publication.id && !blocked) { blocked = true; await new Promise(resolve => { releasePublication = resolve; }); } return originalGet(id); };
  const firstThreadsPromise = api.POST(f.req('POST', '/api/dojo/liaojie-text-variants', { operationId: 'text-platform-create-threads-a', publicationId: publication.id, platform: 'threads' }));
  while (!releasePublication) await new Promise(resolve => setTimeout(resolve, 5));
  const secondThreads = await (await api.POST(f.req('POST', '/api/dojo/liaojie-text-variants', { operationId: 'text-platform-create-threads-b', publicationId: publication.id, platform: 'threads' }))).json(); releasePublication();
  const firstThreads = await (await firstThreadsPromise).json(); f.queries.getKnowledgeEntry = originalGet;
  assert.equal(firstThreads.variant.id, secondThreads.variant.id);
  assert.equal((await f.load('lib/dojo/liaojieText/store.ts').listTextVariants(publication.id)).filter(value => value.platform === 'threads').length, 1);
  const threads = secondThreads;
  assert.equal(threads.variant.platform, 'threads');
  assert(threads.version.blocks.every(block => block.role === 'post' && block.text.length <= 500));
  const unknownBody = { operationId: 'text-platform-true-unknown', action: 'save', variantId: threads.variant.id, expectedRevision: threads.variant.revision, draft: { title: '未知回應仍可恢復', voiceNote: '', changeNote: '模擬遠端已寫入但回應遺失', blocks: threads.version.blocks } };
  const originalUpdate = f.mutations.updateKnowledgeEntry; let loseOnce = true;
  f.mutations.updateKnowledgeEntry = async (...args) => { const result = await originalUpdate(...args); if (loseOnce && f.records.get(args[0])?.title.startsWith('行光聊解文字版本-v1-')) { loseOnce = false; throw new Error('模擬真正遠端未知回應'); } return result; };
  await assert.rejects(() => f.load('lib/dojo/liaojieText/store.ts').saveTextVariant(unknownBody), /失敗|未知/); f.mutations.updateKnowledgeEntry = originalUpdate;
  const recovered = await f.load('lib/dojo/liaojieText/store.ts').saveTextVariant(unknownBody); assert.equal(recovered.currentVersion.title, '未知回應仍可恢復'); assert.equal(recovered.variant.versionRefs.length, 2);
  const instagram = await (await api.POST(f.req('POST', '/api/dojo/liaojie-text-variants', { operationId: 'text-platform-create-instagram', publicationId: publication.id, platform: 'instagram_post' }))).json();
  assert.equal(instagram.version.blocks.length, 1);
  assert.equal(instagram.version.blocks[0].role, 'caption');
  assert.equal((await (await api.GET(f.req('GET', `/api/dojo/liaojie-text-variants?publicationId=${publication.id}`, null))).json()).variants.length, 3);
  console.log('PASS actual API single-platform create/replay/deduplicate/save/stale/immutable restore/status/list');
} finally {
  await f.close();
}
