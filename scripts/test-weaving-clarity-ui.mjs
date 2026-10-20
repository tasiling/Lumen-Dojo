import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {isolatedServer} from './isolated-practice-server.mjs';
import {fixture} from './weaving-fixture.mjs';

const mode=process.argv[2]??'flow',out='/tmp/weaving-clarity-ui';
await mkdir(out,{recursive:true});
const f=await fixture(),server=await isolatedServer(3038,'weaving-fixture');
const store=f.load('lib/dojo/weavingWorkflow/store.ts');
f.queries.listReadingBooks=async()=>[{id:'book-a',title:'同一本書'}];
f.queries.listReadingNotes=async()=>[
 {id:'note-a',kind:'excerpt',text:'第一段談論休息的素材',metadata:{chapter:'第一章',location:'第 10 頁'}},
 {id:'note-b',kind:'excerpt',text:'第二段談論自我要求的素材',metadata:{chapter:'第二章',location:'第 20 頁'}}
];
const handlers=Object.fromEntries(['weaving-shuttles','weaving-works','weaving-sources','liaojie-projects'].map(k=>['/api/dojo/'+k,f.load('app/api/dojo/'+k+'/route.ts')]));
let browser,page,failSave=false;
try{
 const pair=mode==='empty'?null:await store.createPair({operationId:'clarity-ui-pair-01',sourceType:'manual',sourceSnapshot:'自己的成熟素材',coreStatement:'休息不必等到所有事情完成',format:'text'});
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 await context.addCookies([{name:'dsc_access_key',value:'weaving-fixture',url:server.base}]);
 await context.route('**/*',async route=>{
  const q=route.request(),u=new URL(q.url());if(u.origin!==server.base)return route.abort();if(!u.pathname.startsWith('/api/'))return route.continue();
  if(failSave&&q.method()==='PATCH'&&u.pathname==='/api/dojo/weaving-works'){failSave=false;return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'測試保存暫時失敗，請重試'})});}
  const h=handlers[u.pathname];if(!h)return route.fulfill({contentType:'application/json',body:JSON.stringify({entries:[],claims:[],captures:[],entities:[],missing:[]})});
  const r=await h[q.method()](f.req(q.method(),u.pathname+u.search,q.method()==='GET'?null:q.postDataJSON()));return route.fulfill({status:r.status,contentType:'application/json',body:await r.text()});
 });
 page=await context.newPage();page.setDefaultTimeout(20000);page.setDefaultNavigationTimeout(60000);
 if(mode==='empty'){
  await page.goto(server.base+'/weaving');const start=page.getByRole('button',{name:'開始第一件作品',exact:true});await start.waitFor();
  assert((await start.boundingBox()).y<650,'new-user start action must be visible in first mobile screen');
  await page.screenshot({path:out+'/home-empty-390.png',fullPage:true});
  await start.click();await page.getByLabel('整理好的成熟題材',{exact:true}).fill('自己的實際經驗');
  await page.getByRole('button',{name:'前往定觀點',exact:true}).click();
  await page.getByLabel('自己最想說的一句話',{exact:true}).fill('第一件作品的觀點');
  await page.getByRole('button',{name:'建立第一件作品',exact:true}).click();await page.getByLabel('作品名稱',{exact:true}).waitFor();
  console.log('PASS first-screen start action creates a real first work');
 }else{
  await page.goto(server.base+'/weaving');await page.getByRole('link',{name:/繼續創作/}).waitFor();
  await page.goto(`${server.base}/weaving/${pair.shuttle.id}?work=${pair.works[0].id}`);await page.getByLabel('作品名稱',{exact:true}).waitFor();
  assert((await page.locator('.wf-steps').boundingBox()).y<600,'work steps must be visible in first mobile screen');
  const bar=await page.locator('.wf-action-bar').boundingBox();assert(bar.y>=0 && bar.y+bar.height<770,'save/next controls remain visible above mobile navigation');
  await page.evaluate(()=>window.scrollTo(0,600));const movedBar=await page.locator('.wf-action-bar').boundingBox();assert(Math.abs(movedBar.y-bar.y)<2,'save controls follow viewport while scrolling');await page.evaluate(()=>window.scrollTo(0,0));
  assert.equal(await page.getByLabel('這張杼想讓誰理解？',{exact:true}).isVisible(),false,'topic settings start collapsed');await page.screenshot({path:out+'/work-sources-390.png',fullPage:true});
  await page.getByText('第一段談論休息的素材',{exact:true}).waitFor();await page.getByText('第二段談論自我要求的素材',{exact:true}).waitFor();
  await page.getByLabel('作品名稱',{exact:true}).fill('保存後接續的作品');failSave=true;
  await page.getByRole('button',{name:'保存並前往構思',exact:true}).click();await page.locator('.wf-save-state [role=alert]').waitFor();
  assert.match(await page.locator('.wf-steps [aria-current=step]').innerText(),/選材|選素材/,'failed save stays in same step');
  assert.equal(await page.getByLabel('作品名稱',{exact:true}).inputValue(),'保存後接續的作品');
  await page.getByRole('button',{name:'保存並前往構思',exact:true}).click();await page.getByLabel('構思／段落方向',{exact:true}).waitFor();
  assert.equal((await store.readWork(pair.works[0].id)).title,'保存後接續的作品');
  assert.equal((await store.readWork(pair.works[0].id)).textWorkflow.currentStep,'concept');
  await page.getByLabel('構思／段落方向',{exact:true}).fill('用一個生活例子帶出觀點');await page.getByRole('button',{name:'保存並前往製作',exact:true}).click();await page.getByLabel('開頭文字',{exact:true}).fill('先停下來，也是一個選擇。');
  await page.getByRole('button',{name:'保存並前往確認',exact:true}).click();await page.getByRole('button',{name:'保存並預覽目前版本',exact:true}).click();await page.getByRole('button',{name:'確認這件作品已織成',exact:true}).click();
  await page.getByRole('button',{name:'準備發布這個成品',exact:true}).click();await page.getByRole('button',{name:'手動送往聊解室',exact:true}).waitFor();
  assert(await page.getByRole('button',{name:'手動送往聊解室',exact:true}).isEnabled(),'switching to handoff must not create unsaved edits');
  for(const width of [320,375,390,430,1024]){await page.setViewportSize({width,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`overflow at ${width}`);await page.screenshot({path:`${out}/handoff-${width}.png`,fullPage:true});}
  await page.getByRole('button',{name:'手動送往聊解室',exact:true}).click();await page.getByRole('heading',{name:'聊解室工作台',exact:true}).waitFor();
  const finalized=await store.readWork(pair.works[0].id);await page.goto(`${server.base}/weaving/${pair.shuttle.id}?work=${finalized.id}&completion=${finalized.currentCompletionVersionId}#completion-${finalized.currentCompletionVersionId}`);await page.locator(`#completion-${finalized.currentCompletionVersionId}[open]`).waitFor();
  console.log('PASS discoverable work + distinguishable sources + failed-save recovery + saved next step + fixed completion handoff');
 }
}catch(error){console.error(await page?.locator('body').innerText());await page?.screenshot({path:out+'/failure.png',fullPage:true});throw error;}finally{await browser?.close();server.stop();await f.close();}
