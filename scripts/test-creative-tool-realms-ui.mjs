import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {isolatedServer} from './isolated-practice-server.mjs';
const server=await isolatedServer(3079,'creative-tool-realms');
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox']});
const out='/tmp/creative-tool-realms';await mkdir(out,{recursive:true});
try {
 const context=await browser.newContext({viewport:{width:390,height:844}});
 await context.addCookies([{name:'dsc_access_key',value:'creative-tool-realms',url:server.base}]);
 await context.route('**/api/**',route=>route.fulfill({json:{entries:[],captures:[],missing:[],works:[],templates:[],drafts:[{id:'realm-fixture',method:'test',tplName:'隔離範本',main:'隔離示例：今日文章',floors:['測試第一樓'],status:'draft',createdAt:'2026-11-03T00:00:00Z',updatedAt:'2026-11-03T00:00:00Z',at:''}]}}));
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const ids=['diamond','sanko-prompt','sanko-batch','magazine','carousel'];
 for(const realm of ['weaving','liaojie']) {
  await page.goto(server.base+'/'+realm);
  assert.equal(await page.locator(`a[href="/${realm}/tools"]`).count(),1,`${realm} home needs a visible tool entrance`);
  await Promise.all([page.waitForURL(server.base+'/'+realm+'/tools'),page.locator(`a[href="/${realm}/tools"]`).click()]);await page.getByRole('heading',{name:'創作工具',exact:true}).waitFor();
  for(const id of ids)assert.equal(await page.locator(`a[href="/${realm}/tools/${id}"]`).count(),1,`${realm} ${id} entrance`);
  assert.equal(await page.locator(`a[href="/${realm}/plurk"]`).count(),1);
  await page.screenshot({path:`${out}/${realm}-hub-390.png`,fullPage:true});
  const color=realm==='weaving'?'rgb(252, 245, 251)':'rgb(243, 247, 253)';
  for(const id of ids) {
   await page.goto(`${server.base}/${realm}/tools/${id}`);
   const frame=page.frameLocator('iframe');await frame.locator('body').waitFor();
   assert.equal(await frame.locator('body').evaluate(el=>getComputedStyle(el).backgroundColor),color,`${realm} ${id} internal theme`);
   assert.equal(await page.locator('.original-workspace-back').getAttribute('href'),`/${realm}/tools`);
   assert.equal(await page.locator('.dojo').evaluate(el=>el.classList.contains('creative-'+location.pathname.split('/')[1])),true);
   for(const width of [320,375,390,430,1024]) {
    await page.setViewportSize({width,height:844});
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${realm} ${id} parent overflow ${width}`);
    assert(await frame.locator('html').evaluate(el=>el.scrollWidth<=innerWidth+1),`${realm} ${id} frame overflow ${width}`);
   }
   await page.setViewportSize({width:390,height:844});
   if(id==='diamond'&&realm==='weaving') {
    await frame.locator('#global-draft').fill('跨場域共用的隔離草稿');
    await page.getByRole('status').filter({hasText:'已保存到這個裝置'}).waitFor();
   }
   if(id==='diamond'&&realm==='liaojie')assert.equal(await frame.locator('#global-draft').inputValue(),'跨場域共用的隔離草稿');
   await page.screenshot({path:`${out}/${realm}-${id}-390.png`,fullPage:true});
  }
  await page.goto(`${server.base}/${realm}/plurk`);await page.getByRole('heading',{name:'噗浪・蓋樓台',exact:true}).waitFor();
  assert.equal(await page.locator('.creative-tool-heading a').getAttribute('href'),`/${realm}/tools`);
  assert(await page.locator('.dojo').evaluate((el,r)=>el.classList.contains('creative-'+r),realm));
  assert.equal(await page.locator('.dojo').evaluate(el=>getComputedStyle(el).backgroundColor),color);
  await page.getByRole('button',{name:/隔離示例：今日文章/}).waitFor();
  assert.equal(await page.locator('.plurk .note').first().evaluate(el=>getComputedStyle(el).backgroundColor),realm==='weaving'?'rgb(248, 231, 244)':'rgb(234, 241, 252)');
  assert.equal(await page.locator('.plurk .go').first().evaluate(el=>getComputedStyle(el).backgroundColor),realm==='weaving'?'rgb(139, 63, 104)':'rgb(69, 99, 143)');
  for(const width of [320,375,390,430,1024]){await page.setViewportSize({width,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${realm} plurk overflow ${width}`);}
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:`${out}/${realm}-plurk-390.png`,fullPage:true});
 }
 await page.goto(server.base+'/plurk');assert(await page.locator('.dojo').evaluate(el=>el.classList.contains('creative-liaojie')),'old Plurk URL themed too');
 assert.deepEqual(errors,[]);console.log('PASS both realm home entrances, 12 tool routes, inner/outer palettes, back links, shared draft, 5 viewport widths and legacy Plurk URL');
} finally {await browser.close();server.stop();}
