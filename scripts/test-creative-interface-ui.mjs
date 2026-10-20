import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { fixture } from './weaving-fixture.mjs';
import { isolatedServer } from './isolated-practice-server.mjs';

const mode = process.argv[2] ?? 'all';
const out = '/tmp/creative-interface-ui';
await mkdir(out, {recursive:true});
const f = await fixture();
const server = await isolatedServer(3046, 'weaving-fixture');
const store = f.load('lib/dojo/weavingWorkflow/store.ts');
const pair = await store.createPair({operationId:'creative-ui-pair-01',sourceType:'manual',sourceSnapshot:'自己的生活觀察',coreStatement:'休息不必等到所有事情完成',format:'text'});
const handlers = Object.fromEntries(['weaving-shuttles','weaving-works','weaving-sources','liaojie-projects'].map(k=>['/api/dojo/'+k,f.load('app/api/dojo/'+k+'/route.ts')]));
let browser, page;
const writes=[];
try {
  browser = await chromium.launch({headless:true,args:['--no-sandbox']});
  const context = await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  await context.addCookies([{name:'dsc_access_key',value:'weaving-fixture',url:server.base}]);
  await context.route('**/*', async route => {
    const q=route.request(), u=new URL(q.url());
    if(u.origin!==server.base) return route.abort();
    if(!u.pathname.startsWith('/api/')) return route.continue();
    if(q.method()!=='GET') writes.push({method:q.method(),path:u.pathname,body:q.postDataJSON()});
    const h=handlers[u.pathname];
    if(!h) return route.fulfill({contentType:'application/json',body:JSON.stringify({entries:[],claims:[],captures:[],entities:[],missing:[]})});
    const res=await h[q.method()](f.req(q.method(),u.pathname+u.search,q.method()==='GET'?null:q.postDataJSON()));
    return route.fulfill({status:res.status,contentType:'application/json',body:await res.text()});
  });
  page=await context.newPage(); page.setDefaultTimeout(15000);page.setDefaultNavigationTimeout(60000);
  if(mode==='steps'||mode==='all') {
    await page.goto(server.base+'/weaving');
    await page.getByRole('link',{name:/繼續創作/}).waitFor();
    // Catches a homepage guide that is missing, lacks visual cues, or diverges from the actual editor.
    const guide=page.getByRole('list',{name:'創作流程'});
    assert.equal(await guide.count(),1,'homepage needs the illustrated five-step guide');
    assert.deepEqual(await guide.getByRole('listitem').allTextContents(),['選素材','定觀點','製作內容','預覽定稿','準備發布']);
    assert.equal(await guide.locator('svg').count(),5);
    await page.screenshot({path:out+'/weaving-home-390.png',fullPage:true});
    await page.goto(`${server.base}/weaving/${pair.shuttle.id}?work=${pair.works[0].id}`);
    await page.getByLabel('作品名稱',{exact:true}).waitFor();
    const steps=page.getByRole('navigation',{name:'文字創作步驟'});
    assert.equal(await steps.locator('svg').count(),5);
    await steps.getByRole('button',{name:/製作內容/}).click();
    assert.match(await steps.locator('[aria-current=step]').innerText(),/製作內容/);
    await page.getByLabel('開頭文字',{exact:true}).waitFor();
    assert.equal(await steps.locator('[data-completed=true]').count(),0,'visiting a step is not completion');
    await page.getByLabel('作品名稱',{exact:true}).fill('很長的作品名稱'.repeat(12));
    for(const width of [320,375,390,430,1024]) {
      await page.setViewportSize({width,height:844});
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`overflow ${width}`);
    }
    console.log('PASS illustrated homepage and actual editor share meaningful five-step navigation');
  }
} catch(error) {
  await page?.screenshot({path:out+'/failure.png',fullPage:true});
  console.error((await page?.locator('body').innerText())?.slice(0,1800));
  throw error;
} finally { await browser?.close();server.stop();await f.close(); }
