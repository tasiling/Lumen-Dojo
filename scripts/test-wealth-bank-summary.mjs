import test from 'node:test';
import assert from 'node:assert/strict';
import {bankSummary} from '../lib/dojo/wealthBankSummary.ts';
test('LINE summary distinguishes linked history from new recorded spending',()=>{
 const out=bankSummary({counts:{recorded:4,linked:2,skipped:1,review:0},totals:{expense:{AUD:'7252'},income:{}}});
 assert.match(out,/已記錄 4 筆/);assert.match(out,/已關聯 2 筆/);assert.match(out,/AUD 72.52/);assert.doesNotMatch(out,/45.05|50.00/);
 assert.doesNotMatch(bankSummary({counts:{review:1}}),/已記支出/);
});
