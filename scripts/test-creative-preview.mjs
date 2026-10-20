import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { startCreativePreview } from './creative-interface-preview.mjs';
const preview=await startCreativePreview({port:3048,appPort:3049});
let browser,page;
try {
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  page=await browser.newPage({viewport:{width:390,height:844}});
  page.on('pageerror',error=>console.error('PAGEERROR',error.message));
  page.on('response',r=>{if(r.status()>=400)console.error('HTTP',r.status(),r.url());});
  page.setDefaultNavigationTimeout(60000);page.setDefaultTimeout(15000);
  // No Playwright route overrides: the operable local preview serves the real product routes.
  await page.goto(preview.base+'/weaving');
  await page.getByRole('list',{name:'創作流程'}).waitFor();
  await page.getByRole('link',{name:/繼續創作/}).waitFor();
  const response=await page.request.get(preview.base+'/api/dojo/weaving-shuttles');
  const data=await response.json();assert.equal(data.bundles.length,1);
  const work=data.bundles[0].works[0];
  const saved=await page.request.patch(preview.base+'/api/dojo/weaving-works',{data:{id:work.id,operationId:'preview-smoke-update',expectedRevision:work.revision,work:{title:'預覽可操作的隔離作品'}}});
  assert.equal(saved.status(),200);
  assert.equal((await saved.json()).work.title,'預覽可操作的隔離作品');
  const forbidden=await page.request.get(preview.base+'/api/dojo/weaving-shuttles',{headers:{origin:'https://example.invalid'}});
  assert.equal(forbidden.status(),403);
  await page.goto(preview.base+'/liaojie/workbench');
  await page.getByRole('heading',{name:'接收作品',exact:true}).waitFor();
  console.log('PASS operable loopback preview renders real routes, accepts fixture writes and rejects foreign origins');
} catch(error) { console.error(await page?.locator('body').innerText()); console.error(await (await fetch(preview.base+'/api/dojo/weaving-shuttles')).text()); throw error; } finally {await browser?.close();await preview.close();}
