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
f.queries.listReadingBooks=async()=>[{id:'fixture-book',title:'隔離測試書'}];
f.queries.listReadingNotes=async()=>[{id:'fixture-note',kind:'excerpt',text:'隔離測試的書中原文。',metadata:{chapter:'第一章',location:'第 1 頁'}}];
const pair = await store.createPair({operationId:'creative-ui-pair-01',sourceType:'manual',sourceSnapshot:'自己的生活觀察',coreStatement:'休息不必等到所有事情完成',format:'text'});
const handlers = Object.fromEntries(['weaving-shuttles','weaving-works','weaving-sources','liaojie-projects'].map(k=>['/api/dojo/'+k,f.load('app/api/dojo/'+k+'/route.ts')]));
let browser, page;
const writes=[];
let createFailure=null;
try {
  browser = await chromium.launch({headless:true,args:['--no-sandbox']});
  const context = await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  await context.addCookies([{name:'dsc_access_key',value:'weaving-fixture',url:server.base}]);
  await context.route('**/*', async route => {
    const q=route.request(), u=new URL(q.url());
    if(u.origin!==server.base) return route.abort();
    if(!u.pathname.startsWith('/api/')) return route.continue();
    if(q.method()!=='GET') writes.push({method:q.method(),path:u.pathname,body:q.postDataJSON()});
    if(u.pathname==='/api/dojo/weaving-shuttles'&&q.method()==='POST'&&createFailure==='before') { createFailure=null; return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'測試建立失敗，草稿保留'})}); }
    const h=handlers[u.pathname];
    if(!h) return route.fulfill({contentType:'application/json',body:JSON.stringify({entries:[],claims:[],captures:[],entities:[],missing:[]})});
    const res=await h[q.method()](f.req(q.method(),u.pathname+u.search,q.method()==='GET'?null:q.postDataJSON()));
    if(u.pathname==='/api/dojo/weaving-shuttles'&&q.method()==='POST'&&createFailure==='after') { createFailure=null; return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'測試回應遺失，請以原資料重試'})}); }
    return route.fulfill({status:res.status,contentType:'application/json',body:await res.text()});
  });
  page=await context.newPage(); page.setDefaultTimeout(15000);page.setDefaultNavigationTimeout(60000);
  if(mode==='create'||mode==='all') {
    await page.goto(server.base+'/weaving');
    await page.getByRole('button',{name:/開始新作品/}).click();
    assert.equal(await page.getByLabel('自己最想說的一句話',{exact:true}).count(),0,'source step does not demand a core statement');
    const next=page.getByRole('button',{name:'前往定觀點',exact:true});
    assert(await next.isDisabled());
    await page.getByLabel('整理好的成熟題材',{exact:true}).fill('隔離測試：忙碌時也想休息');
    await next.click();
    assert.equal(writes.filter(w=>w.method==='POST').length,0,'moving through local draft does not write a work');
    await page.getByLabel('自己最想說的一句話',{exact:true}).fill('隔離測試：休息不用等待');
    await page.reload();
    await page.getByLabel('自己最想說的一句話',{exact:true}).waitFor();
    assert.equal(await page.getByLabel('自己最想說的一句話',{exact:true}).inputValue(),'隔離測試：休息不用等待');
    await page.getByRole('button',{name:'返回選素材',exact:true}).click();
    assert.equal(await page.getByLabel('整理好的成熟題材',{exact:true}).inputValue(),'隔離測試：忙碌時也想休息');
    await next.click();
    createFailure='before';
    await page.getByRole('button',{name:'建立第一件作品',exact:true}).click();
    await page.getByRole('alert').filter({hasText:'測試建立失敗'}).waitFor();
    assert.equal(await page.getByLabel('自己最想說的一句話',{exact:true}).inputValue(),'隔離測試：休息不用等待');
    const before=(await (await handlers['/api/dojo/weaving-shuttles'].GET(f.req('GET','/api/dojo/weaving-shuttles'))).json()).bundles.length;
    createFailure='after';
    await page.getByRole('button',{name:'建立第一件作品',exact:true}).click();
    await page.getByRole('alert').filter({hasText:'測試回應遺失'}).waitFor();
    await page.reload();
    await page.getByRole('button',{name:'建立第一件作品',exact:true}).click();
    await page.getByLabel('作品名稱',{exact:true}).waitFor();
    assert.equal((await (await handlers['/api/dojo/weaving-shuttles'].GET(f.req('GET','/api/dojo/weaving-shuttles'))).json()).bundles.length,before+1,'unknown success retries must not create duplicate work');
    const attempts=writes.filter(w=>w.method==='POST'&&w.path==='/api/dojo/weaving-shuttles');
    assert.equal(new Set(attempts.map(w=>w.body.operationId)).size,1,'recovery retains operation receipt');
    assert.equal(await page.evaluate(()=>sessionStorage.getItem('weaving-buffer:create-shuttle')),null,'clear local draft only after known success');
    await page.goto(server.base+'/weaving');
    await page.getByRole('button',{name:/開始新作品/}).click();
    await page.getByRole('button',{name:'從閱讀與筆記開始',exact:true}).click();
    await page.getByText('隔離測試的書中原文。',{exact:true}).click();
    await page.getByRole('button',{name:'選取這份素材全文',exact:true}).click();
    await page.getByRole('button',{name:'加入選摘',exact:true}).click();
    await next.click();
    await page.getByLabel('自己最想說的一句話',{exact:true}).fill('我自己的閱讀理解');
    await page.reload();
    await page.getByRole('button',{name:'返回選素材',exact:true}).click();
    assert.equal(await page.getByRole('button',{name:'從閱讀與筆記開始',exact:true}).getAttribute('aria-pressed'),'true');
    await next.click();
    const pending=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('weaving-buffer:create-shuttle')).selectionRequests);
    await page.getByRole('button',{name:'建立第一件作品',exact:true}).click();
    await page.getByLabel('作品名稱',{exact:true}).waitFor();
    const selectedAttempt=writes.filter(w=>w.method==='POST'&&w.path==='/api/dojo/weaving-shuttles').at(-1);
    assert.deepEqual(selectedAttempt.body.selectionRequests,pending,'source IDs, versions and ranges survive reload');
    assert.equal(selectedAttempt.body.sourceType,undefined,'reading selections are never silently converted to manual input');
    console.log('PASS source-first local draft restores, retains failed inputs and retries unknown success without duplicates');
  }
  if(mode==='publication'||mode==='all') {
    const original=await store.readWork(pair.works[0].id);
    const written=await store.patchWork({operationId:'creative-publication-draft',id:original.id,expectedRevision:original.revision,work:{draftText:'隔離驗收的固定文字成品。'}});
    const complete=await store.completeWork({operationId:'creative-publication-complete',workId:written.id,expectedRevision:written.revision,previewDigest:f.load('lib/dojo/weavingWorkflow/completions.ts').completionDigest(written)});
    const project=await store.handoffWork({operationId:'creative-publication-handoff',weavingWorkId:written.id,completionVersionId:complete.completion.id});
    await page.goto(`${server.base}/liaojie/workbench?id=${project.id}`);
    await page.getByRole('heading',{name:'接收作品',exact:true}).waitFor();
    for(const name of ['編排首發版本','預覽首發版本','發布紀錄']) assert.equal(await page.getByRole('heading',{name,exact:true}).count(),1);
    await page.getByRole('button',{name:'Threads',exact:true}).click();
    await page.getByLabel('簡介／首發版本摘要',{exact:true}).fill('為 Threads 編排的內容');
    await page.getByLabel('發布日期',{exact:true}).fill('2026-11-15');
    await page.getByRole('button',{name:'預覽首發版本',exact:true}).click();
    await page.getByRole('button',{name:'安排發布',exact:true}).click();
    await page.getByText('發布日期已安排；請於外站手動發布。',{exact:true}).waitFor();
    const result=await (await handlers['/api/dojo/liaojie-projects'].GET(f.req('GET','/api/dojo/liaojie-projects?id='+project.id))).json();
    assert.equal(result.project.platform,'threads');assert.equal(result.project.status,'scheduled');assert.equal(result.project.publishedUrl,'');
    assert.equal(result.project.sourceDraftSnapshot,complete.completion.text);assert.equal(result.project.sourceCompletionVersionId,complete.completion.id);
    await page.reload();
    await page.getByRole('button',{name:'Threads',exact:true}).waitFor();
    assert.equal(await page.getByRole('button',{name:'Threads',exact:true}).getAttribute('aria-pressed'),'true');
    assert.equal(await page.getByLabel('發布日期',{exact:true}).inputValue(),'2026-11-15');
    for(const width of [320,375,390,430,1024]) {
      await page.setViewportSize({width,height:844});
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`publication overflow ${width}`);
      await page.screenshot({path:`${out}/publication-${width}.png`,fullPage:true});
    }
    console.log('PASS sectional publication editor preserves fixed source, restores Threads and distinguishes scheduling from external publication');
  }
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
