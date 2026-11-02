import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {isolatedServer} from './isolated-practice-server.mjs';
const server=await isolatedServer(3078,'liaojie-field-fixture');
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox']});
const out='/tmp/liaojie-field';await mkdir(out,{recursive:true});
try {
 const context=await browser.newContext();
 await context.addCookies([{name:'dsc_access_key',value:'liaojie-field-fixture',url:server.base}]);
 await context.route('**/api/**',route=>route.fulfill({json:{entries:[],captures:[],missing:[]}}));
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 for(const width of [320,375,390,430,1024]) {
  await page.setViewportSize({width,height:844});
  for(const route of ['sanko','tools/sanko-prompt','tools/sanko-batch']) {
   await page.goto(server.base+'/liaojie/'+route);
   if(route==='sanko') {
    assert.equal(await page.locator('.sanko-entry').count(),3);
    assert(await page.locator('.sanko-home').evaluate(el=>parseFloat(getComputedStyle(el).paddingBottom)>=110),'reserve bottom navigation space');
    assert.equal(await page.locator('.sanko-entry').evaluateAll(nodes=>nodes.every((n,i)=>i===0||n.getBoundingClientRect().top-nodes[i-1].getBoundingClientRect().bottom>=8)),true);
   } else {
    const frame=page.frameLocator('iframe');await frame.locator('body').waitFor();
    assert.equal(await frame.locator('body').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(243, 247, 253)');
    assert.equal(await frame.locator('html').evaluate(el=>el.scrollWidth<=innerWidth+1),true,route+' frame overflow '+width);
    const field=frame.locator(route.endsWith('prompt')?'#cards':'#startDate');
    assert.equal(await field.evaluate(el=>getComputedStyle(el).fontSize),'16px');
    // The whole tool grows with its content; the app navigation stays outside its editing area.
    for(let attempt=0;attempt<20;attempt++) {
     const body=await frame.locator('body').evaluate(el=>el.getBoundingClientRect().height);
     const host=await page.locator('iframe').evaluate(el=>el.getBoundingClientRect().height);
     if(host>=Math.ceil(body)&&host<=Math.max(300,Math.ceil(body))+1)break;
     if(attempt===19)assert.fail(`${route} height ${host} does not fit content ${body}`);
     await page.waitForTimeout(100);
    }
    if(route.endsWith('prompt')) {
     assert.equal(await frame.locator('#methods button').count(),8);
     assert.equal(await frame.locator('#methods button').evaluateAll(nodes=>nodes.every(n=>n.getBoundingClientRect().height>=44)),true);
    }
   }
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'parent overflow '+width);
   await page.screenshot({path:`${out}/${route.replaceAll('/','-')}-${width}.png`,fullPage:true});
  }
 }
 await page.setViewportSize({width:390,height:844});await page.goto(server.base+'/liaojie/tools/sanko-prompt');
 const frame=page.frameLocator('iframe');await frame.locator('#methods button').first().click();
 const before=await page.locator('iframe').evaluate(el=>el.offsetHeight);
 await frame.locator('#toggleStations').click();await frame.getByText('01 七脈輪光譜檢測',{exact:true}).waitFor();
 await page.waitForFunction(h=>document.querySelector('iframe').offsetHeight>h,before);
 await frame.locator('#cards').fill('手機版檢查：月亮');await frame.getByRole('button',{name:'產生指令',exact:true}).click();
 assert.match(await frame.locator('#out').innerText(),/手機版檢查：月亮/);
 await page.screenshot({path:`${out}/sanko-prompt-open-390.png`,fullPage:true});
 assert.deepEqual(errors,[]);
 console.log('PASS 15 field views: 320/375/390/430/1024px, theme, touch spacing, font size, content height, no horizontal overflow; expanded stations and generated output');
} finally {await browser.close();server.stop();}
