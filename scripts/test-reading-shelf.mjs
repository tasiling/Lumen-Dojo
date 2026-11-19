import assert from 'node:assert/strict';
import { defaultShelf, facetOptions, matchBooks, readShelfView, shelfContext, shelfValue, toggleFacet, writeShelfView } from '../lib/reading/shelf.ts';

const base = { id: '1', title: '提問練習', author: 'Alice 江', category: '教育', subtitle: '從觀察開始', subject: '其他',
  status: '閱讀中', createdAt: '2026-01-01', readCount: 1 };
const books = [base, { ...base, id: '2', title: '另一種觀察', category: '創作', subject: null, createdAt: '2026-01-02', finished: true },
  { ...base, id: '3', title: '遇見時間', author: '葉一', subtitle: '', category: undefined, subject: null, status: '已萃取' }];
function ids(view) { return matchBooks(books, { ...defaultShelf, ...view }).map(book => book.id); }

assert.deepEqual(ids({ q: 'ＡＬＩＣＥ 觀察', category: ['創作'] }), ['2']);
assert.deepEqual(ids({ q: '江', category: ['創作', '教育'], subject: ['其他'] }), ['1']);
assert.deepEqual(ids({ category: ['未分類'], subject: ['未設定學科'] }), ['3']);
assert.deepEqual(ids({ progress: ['已讀完'] }), ['2']);
assert.equal(shelfValue(books[2], 'progress'), '閱讀中');
assert.equal(shelfValue({ ...base, status: '待讀' }, 'progress'), '待讀');
assert.equal(shelfValue({ ...base, status: '放棄' }, 'progress'), '已放下');
assert.deepEqual(ids({ q: '無符合' }), []);
assert.deepEqual(facetOptions(books,'category',['未知']).find(([name]) => name === '未知'),['未知',0]);
const view = { ...defaultShelf, q: '觀察', sort: 'name', category: ['教育', '創作'] };
assert.deepEqual(readShelfView(writeShelfView(view)), view);
assert.deepEqual(toggleFacet(view, 'category', '教育').category, ['創作']);
const query = writeShelfView(view);
query.set('note','internal-note'); query.set('focus','anxiety-effort'); query.set('returnTo','/practice/learning?learningItem=example');
assert.equal(shelfContext(query).has('note'), false);
assert.equal(shelfContext(query).has('focus'), false);
assert.equal(shelfContext(query).get('returnTo'), '/practice/learning?learningItem=example');
query.set('returnTo','//other.example'); assert.equal(shelfContext(query).has('returnTo'), false);
console.log('PASS reading shelf search, facets, progress, sorting parameters and navigation context');
