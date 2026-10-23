import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {isolatedServer} from './isolated-practice-server.mjs';

const server = await isolatedServer(3078, 'practice-v34-fixture');
const out = '/tmp/practice-v34-ui';
await mkdir(out, {recursive:true});
const itemA = '10000000-0000-4000-8000-000000000001';
const itemB = '10000000-0000-4000-8000-000000000002';
const entities = [
  {id:itemA,kind:'item',name:'隔離測試甲',status:'active'},
  {id:itemB,kind:'item',name:'隔離測試乙',status:'active'},
  {id:'stage-a',kind:'stage',name:'甲階段',itemId:itemA,status:'active'},
  {id:'stage-a2',kind:'stage',name:'甲第二階段',itemId:itemA,status:'active'},
  {id:'stage-b',kind:'stage',name:'乙階段',itemId:itemB,status:'active'},
  {id:'topic-a',kind:'topic',name:'甲主題',itemId:itemA,stageId:'stage-a',status:'active'},
  {id:'topic-a2',kind:'topic',name:'甲第二主題',itemId:itemA,stageId:'stage-a2',status:'active'},
  {id:'topic-b',kind:'topic',name:'乙主題',itemId:itemB,stageId:'stage-b',status:'active'},
];
let browser, page;
const errors = [], writes = [];
async function noOverflow() {
  assert(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth + 1), `overflow: ${page.url()}`);
}
async function unobscured(locator) {
  await locator.scrollIntoViewIfNeeded();
  assert(await locator.evaluate(el=>{
    const r=el.getBoundingClientRect(), nav=document.querySelector('nav[aria-label="主要導覽"]')?.getBoundingClientRect();
    const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
    return r.top>=0 && r.bottom<=innerHeight && (!nav || r.bottom<=nav.top) && (hit===el || el.contains(hit));
  }), `control obscured: ${await locator.textContent()}`);
}
try {
  browser = await chromium.launch({headless:true});
  const context = await browser.newContext({viewport:{width:390,height:844}});
  await context.addCookies([{name:'dsc_access_key',value:'practice-v34-fixture',url:server.base}]);
  await context.route('**/*', async route=>{
    const req=route.request(), u=new URL(req.url());
    if(u.origin!==server.base) return route.abort();
    if(!u.pathname.startsWith('/api/')) return route.continue();
    if(req.method()!=='GET') { writes.push(u.pathname); return route.fulfill({status:500,json:{error:'unexpected write'}}); }
    if(u.pathname==='/api/dojo/learning/foundation') return route.fulfill({json:{entities,missing:[]}});
    return route.fulfill({json:{entries:[],records:[],events:[],practices:[],sources:[],cursor:null}});
  });
  page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
  for(const width of [375,390,430,1024]) {
    await page.setViewportSize({width,height:844});
    for(const [path,shell] of [['/practice','practice-shell'],['/dao','dao-shell']]) {
      await page.goto(server.base+path);await page.locator('.'+shell).waitFor();
      await noOverflow();
      const hero=page.locator('.practice-realm-hero');
      assert.match(await hero.evaluate(el=>getComputedStyle(el).backgroundImage),/linear-gradient/);
      assert.equal(await page.locator('.reading-shell').count(),0);
      await page.screenshot({path:`${out}/${shell}-${width}.png`,fullPage:true});
    }
    await page.goto(`${server.base}/practice/records?new=1&learningItem=${itemA}`);
    await page.getByLabel('這次學了什麼？',{exact:true}).waitFor();
    await page.getByLabel('這次學了什麼？',{exact:true}).fill('保留尚未保存的測試內容');
    const help=page.getByRole('button',{name:'這次學了什麼？的填寫說明',exact:true});
    await help.focus();await page.keyboard.press('Enter');
    assert.equal(await help.getAttribute('aria-expanded'),'true');
    assert(await page.locator('#record-whatIDid-help').isVisible());
    await page.keyboard.press('Space');assert.equal(await help.getAttribute('aria-expanded'),'false');
    assert.equal(await page.getByLabel('這次學了什麼？',{exact:true}).inputValue(),'保留尚未保存的測試內容');
    assert(await page.getByLabel('記錄日期',{exact:true}).evaluate(el=>el.readOnly));
    await page.getByText('階段、主題與其他選填',{exact:true}).click();
    await page.getByLabel('階段',{exact:true}).selectOption('stage-a');
    await page.getByLabel('主題',{exact:true}).selectOption('topic-a');
    await page.getByLabel('階段',{exact:true}).selectOption('stage-a2');
    assert.equal(await page.getByLabel('主題',{exact:true}).inputValue(),'');
    assert.equal(await page.locator('#record-learningTopicId option[value="topic-a"]').count(),0);
    await page.getByLabel('主題',{exact:true}).selectOption('topic-a2');
    await page.getByLabel('隔離測試乙',{exact:true}).check();
    await page.getByLabel('主要學習項目',{exact:true}).selectOption(itemB);
    assert.equal(await page.getByLabel('階段',{exact:true}).inputValue(),'');
    assert.equal(await page.getByLabel('主題',{exact:true}).inputValue(),'');
    assert.equal(await page.locator('#record-learningStageId option[value="stage-a"]').count(),0);
    await noOverflow();
    for(const height of [844,430]) {
      await page.setViewportSize({width,height});
      await page.getByLabel('來源網址（選填）',{exact:true}).focus();
      await unobscured(page.getByRole('button',{name:'儲存草稿',exact:true}));
      await unobscured(page.getByRole('button',{name:'正文完成',exact:true}));
    }
    await page.setViewportSize({width,height:844});
    await page.screenshot({path:`${out}/record-${width}.png`,fullPage:true});
  }
  await page.goto(server.base+'/dao');
  await page.getByRole('button',{name:'＋ 新增入藏紀錄',exact:true}).click();
  const quick=page.getByRole('button',{name:'光行（選填）的填寫說明',exact:true});
  await quick.click();assert.equal(await quick.getAttribute('aria-expanded'),'true');
  assert(await page.locator('#quick-guangxing-help').isVisible());
  assert.deepEqual(writes,[]);assert.deepEqual(errors,[]);
  console.log('PASS v34 realms, 375/390/430/1024px, keyboard help preserves draft, read-only recorded date, dependent stage/topic reset, save controls unobscured at 844/430px height, quick-add help; zero API writes/errors');
} catch(error) {
  await page?.screenshot({path:`${out}/failure.png`,fullPage:true});throw error;
} finally {await browser?.close();server.stop();}
