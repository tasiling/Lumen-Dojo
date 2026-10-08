import assert from 'node:assert/strict';
import { learningUsageIssues } from '../lib/dojo/englishImageLearningUsage';
import { normalizeRoutingSelection, dispatchSelectedDestinations, routingEntryUrl } from '../lib/dojo/englishImageRouting';

async function main() {
  const selection = normalizeRoutingSelection({ sourceName: ' Dave the Diver ', focusDecks: ['JRPG／冒險遊戲', '故事閱讀'], selectedKeys: ['coral', 'reef', 'coral'] });
  assert.equal(selection.sourceName, 'Dave the Diver');
  assert.deepEqual(selection.focusDecks, ['JRPG／冒險遊戲', '故事閱讀']);
  assert.deepEqual(selection.selectedKeys, ['coral', 'reef']);
  assert.throws(() => normalizeRoutingSelection({ sourceName: 'Game', focusDecks: ['JRPG／冒險遊戲', '故事閱讀', '日常啟動'], selectedKeys: ['reef'] }), /兩個/);
  assert.throws(() => normalizeRoutingSelection({ sourceName: 'Game', focusDecks: ['作品名稱'], selectedKeys: ['reef'] }), /常駐/);
  assert.throws(() => normalizeRoutingSelection({ sourceName: 'Game', focusDecks: ['故事閱讀'], selectedKeys: ['a','b','c','d','e','f'] }), /五個/);
  assert.throws(() => normalizeRoutingSelection({ sourceName: '', focusDecks: ['故事閱讀'], selectedKeys: ['reef'] }), /來源/);
  const good = { expression: 'reef', usage: 'We saw a reef beneath the boat.', usageTranslation: '我們看見船底下有一座珊瑚礁。' };
  assert.deepEqual(learningUsageIssues(good), []);
  assert.ok(learningUsageIssues({ ...good, usage: 'Reef beneath the boat' }).some(issue => issue.includes('完整')));
  assert.ok(learningUsageIssues({ ...good, usage: 'We saw a fish beneath the boat.' }).some(issue => issue.includes('目標')));
  assert.ok(learningUsageIssues({ ...good, usage: 'We saw a reef. We saw some fish.' }).some(issue => issue.includes('單句')));
  assert.ok(learningUsageIssues({ ...good, usageTranslation: '' }).some(issue => issue.includes('翻譯')));
  assert.ok(learningUsageIssues({ ...good, usageTranslation: '劇情摘要：我們看到了珊瑚礁。' }).some(issue => issue.includes('摘要')));
  assert.deepEqual(learningUsageIssues({ expression: 'find', usage: 'We found a reef beneath the boat.', usageTranslation: '我們在船下發現一座珊瑚礁。' }), []);
  const calls: string[] = [];
  const result = await dispatchSelectedDestinations({ context: async () => { calls.push('context'); throw new Error('receiver unavailable'); }, vocab: async () => { calls.push('vocab'); return { failures: [] }; } });
  assert.deepEqual(calls, ['context', 'vocab']);
  assert.equal(result.context.status, 'failed');
  assert.equal(result.vocab.status, 'received');
  const retry = await dispatchSelectedDestinations({ context: async () => { calls.push('retry-context'); } });
  assert.equal(retry.context.status, 'received');
  assert.equal(retry.vocab.status, 'not-selected');
  assert.deepEqual(calls, ['context','vocab','retry-context']);
  const partial = await dispatchSelectedDestinations({ vocab: async () => ({ failures: [{ expression: 'reef' }] }) });
  assert.equal(partial.vocab.status, 'partial');
  const url = new URL(routingEntryUrl('https://dojo.example/forage', 'a/b', 'both'));
  assert.equal(url.pathname, '/forage/english');
  assert.equal(url.searchParams.get('englishImageId'), 'a/b');
  assert.equal(url.searchParams.get('dispatch'), 'both');
  console.log('Unified routing: selection, independent outcomes, failed-only retry and LINE handoff PASS');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
