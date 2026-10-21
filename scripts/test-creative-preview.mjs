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
  const projects=await (await page.request.get(preview.base+'/api/dojo/liaojie-projects')).json();const publication=projects.projects[0];
  const catalog=await (await page.request.get(preview.base+'/api/dojo/creative-releases?publicationId='+publication.id)).json();assert(Array.isArray(catalog.sources),'preview serves real creative release API');
  await page.goto(preview.base+'/liaojie/workbench?id='+publication.id);
  const workspace=page.getByRole('region',{name:'作品發布紀錄',exact:true});await workspace.waitFor();await workspace.getByLabel('紀錄的固定成品').selectOption({index:1});await workspace.getByLabel('紀錄的平台').selectOption('plurk');await workspace.getByRole('button',{name:'建立這個版本的平台紀錄',exact:true}).click();await workspace.getByRole('region',{name:'編輯發布紀錄',exact:true}).waitFor();await workspace.getByLabel('交流與回看').fill('可操作預覽');await workspace.getByRole('button',{name:'保存這筆發布紀錄',exact:true}).click();await workspace.getByText('發布紀錄已保存',{exact:true}).waitFor();await page.getByRole('link',{name:'回看所有發布紀錄',exact:true}).click();await page.locator('.release-history-card').getByText('可操作預覽',{exact:true}).waitFor();
  console.log('PASS operable loopback preview renders real routes, accepts fixture writes and rejects foreign origins');
} catch(error) { console.error(await page?.locator('body').innerText()); console.error(await (await fetch(preview.base+'/api/dojo/weaving-shuttles')).text()); throw error; } finally {await browser?.close();await preview.close();}
