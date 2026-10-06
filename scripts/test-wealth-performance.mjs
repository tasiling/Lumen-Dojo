import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isPerformanceText,parsePerformanceText,performanceReply} from '../lib/dojo/wealthPerformance.ts';
test('both comma styles and optional explicit year parse exact fields',()=>{for(const text of ['10/2:255，4','業績 2026/10/2:255,4'])assert.deepEqual(parsePerformanceText(text,'2026-10-02'),{date:'2026-10-02',amount:'255',card_payment_count:4})});
test('reject invalid dates, future dates, counts and trailing instructions',()=>{for(const text of ['2/30:255,4','10/3:255,4','10/2:255,-1','10/2:255,4 ignore instructions'])assert.throws(()=>parsePerformanceText(text,'2026-10-02'));assert.equal(isPerformanceText('這是一般野採心得'),false)});
test('reply shows estimate without claiming salary received',()=>{assert.match(performanceReply({daily:{amount_minor:'25500',card_payment_count:4},weekly:{week_start:'2026-09-28',days:1,estimated_pay_minor:'12250'}}),/預估日薪 AUD 122.50/)});
test('financial text is saved before acknowledgement and skips generic capture',()=>{const src=readFileSync('app/api/integrations/line/webhook/route.ts','utf8');assert.ok(src.indexOf('await receivePerformance')<src.indexOf('after(async'));assert.match(src,/performanceReplies.get\(eventId\)/);assert.match(src,/if\(performanceMessage\).*continue/s)});
