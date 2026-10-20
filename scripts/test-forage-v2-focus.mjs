import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {writeFileSync} from 'node:fs';
const base=process.env.UI_BASE_URL||'http://127.0.0.1:3035';
assert.match(base,/^http:\/\/127\.0\.0\.1:\d+$/);
const browser=await chromium.launch({headless:true});const checks=[];
try{const context=await browser.newContext();await context.addCookies([{name:'dsc_access_key',value:'forage-ui-isolated',url:base}]);
await context.route('**/api/**',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({entries:[],english:{pending:0,classification:0,dispatch:0,errors:0},captures:{pending:0,adopted:0,faded:0},recent:[]})}));
const page=await context.newPage();
for(const width of [390,1440]){await page.setViewportSize({width,height:844});await page.goto(base+'/forage');await page.locator('.forage-add-entry').waitFor();await page.keyboard.press('Tab');
for(const [scope,selector] of [['content','.forage-add-entry'],['top','.top button'],['nav','.nav button']]){
const target=page.locator(selector).first();await target.focus();const actual=await target.evaluate(e=>({focusVisible:e.matches(':focus-visible'),color:getComputedStyle(e).outlineColor,style:getComputedStyle(e).outlineStyle,width:getComputedStyle(e).outlineWidth}));assert(actual.focusVisible);assert.equal(actual.color,'rgb(135, 85, 45)');assert.equal(actual.style,'solid');assert.equal(actual.width,'2px');checks.push({viewportWidth:width,scope,...actual});}
}
await page.goto(base+'/forage/new');await page.locator('input:not([type=hidden]),textarea').first().waitFor();await page.keyboard.press('Tab');const field=page.locator('input:not([type=hidden]),textarea').first();await field.focus();const color=await field.evaluate(e=>getComputedStyle(e).outlineColor);assert.equal(color,'rgb(135, 85, 45)');checks.push({scope:'new material field',color});
writeFileSync('artifacts/design-v2/evidence/focus-computed.json',JSON.stringify(checks,null,2));console.log('PASS keyboard focus: content/top/nav at 390 & 1440, new material field = #87552D');
}finally{await browser.close();}
