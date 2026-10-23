import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {isolatedServer} from './isolated-practice-server.mjs';
const server=await isolatedServer(3077,'original-tools-fixture');
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const out='/tmp/liaojie-original-tools';await mkdir(out,{recursive:true});
try {
 const unauth=await browser.newPage();await unauth.goto(server.base+'/liaojie/tools');assert.match(unauth.url(),/unlock/);await unauth.close();
 const ctx=await browser.newContext({viewport:{width:390,height:844},acceptDownloads:true});
 await ctx.addCookies([{name:'dsc_access_key',value:'original-tools-fixture',url:server.base}]);
 await ctx.route('**/api/**',route=>route.fulfill({json:{entries:[],captures:[],missing:[]}}));
 const page=await ctx.newPage();page.setDefaultTimeout(25000);
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto(server.base+'/liaojie/tools');await page.getByRole('heading',{name:'聊解室創作工具',exact:true}).waitFor();
 for(const name of ['知識鑽石框架','日上三更・指令產生器','日上三更・批次出題產生器','雜誌對話紀錄模板','IG 輪播圖文產生器'])assert.equal(await page.getByRole('link',{name:'開啟'+name,exact:true}).count(),1);
 console.log('PASS authenticated hub with all five original tools');
 await page.goto(server.base+'/liaojie/tools/diamond');
 const frame=page.frameLocator('iframe');await page.getByRole('button',{name:'下載備份',exact:true}).waitFor();
 await frame.locator('#global-draft').fill('【隔離測試】我發現休息也能讓想法慢慢成形。');
 await frame.getByRole('button',{name:'生成A模組指令',exact:true}).click();
 assert.match(await frame.locator('#a-output').innerText(),/我發現休息/);
 await frame.locator('[data-stage=D]').click();await frame.locator('#node-desc').fill('隔離測試節點');await frame.getByRole('button',{name:'加入清單',exact:true}).click();
 await frame.getByRole('button',{name:'產出待寫清單（勾選項目）',exact:true}).click();
 assert.match(await frame.locator('#node-output').innerText(),/隔離測試節點/);
 await page.getByRole('status').filter({hasText:'已保存到這個裝置'}).waitFor();await page.waitForTimeout(1100);
 await page.reload();await frame.locator('#node-list').getByText('隔離測試節點',{exact:true}).waitFor();
 assert.match(await frame.locator('#global-draft').inputValue(),/隔離測試/);
 const other=await ctx.newPage();await other.goto(server.base+'/liaojie/tools/diamond');const otherFrame=other.frameLocator('iframe');await otherFrame.locator('#global-draft').waitFor();
 await frame.locator('#global-draft').fill('視窗A的新稿');await page.waitForTimeout(1600);await page.getByRole('status').filter({hasText:'已保存到這個裝置'}).waitFor();
 await otherFrame.locator('#global-draft').fill('視窗B的保留稿');await other.getByRole('alert').filter({hasText:'另一個視窗'}).waitFor();assert.equal(await otherFrame.locator('#global-draft').inputValue(),'視窗B的保留稿');
 await other.close();
 assert.equal(await frame.locator('body').evaluate(()=>{try{return parent.document.body.textContent}catch{return 'blocked'}}),'blocked','original script cannot access authenticated parent DOM');
 const backupWait=page.waitForEvent('download');await page.getByRole('button',{name:'下載備份',exact:true}).click();const backup=await backupWait;assert.match(backup.suggestedFilename(),/diamond/);
 await page.getByLabel('匯入工具備份').setInputFiles({name:'wrong.json',mimeType:'application/json',buffer:Buffer.from('{"version":1,"tool":"carousel"}')});
 await page.getByRole('alert').filter({hasText:'有效備份'}).waitFor();assert.equal(await frame.locator('#global-draft').inputValue(),'視窗A的新稿');
 for(const width of [320,375,390,430,1024]){
  await page.setViewportSize({width,height:844});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`parent overflow ${width}`);
  assert(await frame.locator('html').evaluate(el=>el.scrollWidth<=innerWidth+1),`diamond overflow ${width}`);
  await page.screenshot({path:`${out}/diamond-${width}.png`,fullPage:true});
 }
 console.log('PASS diamond original instructions + nodes + refresh + invalid import + isolated frame + five sizes');
 for(const [tool,canvas,button] of [['magazine','#previewCanvas','#downloadCurrentBtn'],['carousel','#cv','#btnPng']]){
  await page.goto(server.base+'/liaojie/tools/'+tool);await frame.locator(canvas).waitFor();await page.getByRole('button',{name:'下載備份',exact:true}).isEnabled();
  if(tool==='carousel'){
   const before=await frame.locator('.tab').count();
   await frame.locator('#btnAddMag').click();await frame.locator('#btnAddArch').click();
   assert.equal(await frame.locator('.tab').count(),before+2,'all original page types work');
  }
  const dl=page.waitForEvent('download');await frame.locator(button).click();const png=await dl;
  assert.match(png.suggestedFilename(),/\.png$/);
  const stream=await png.createReadStream();let parts=[];for await(const chunk of stream)parts.push(chunk);const bytes=Buffer.concat(parts);
  assert.equal(bytes.readUInt32BE(16),1080);assert.equal(bytes.readUInt32BE(20),1350);
  for(const width of [320,375,390,430,1024]){
   await page.setViewportSize({width,height:844});assert(await frame.locator('html').evaluate(el=>el.scrollWidth<=innerWidth+1),`${tool} overflow ${width}`);
   await page.screenshot({path:`${out}/${tool}-${width}.png`,fullPage:true});
  }
  console.log(`PASS ${tool} original canvas + real 1080x1350 PNG + five sizes`);
 }
 await page.goto(server.base+'/liaojie/tools/sanko-prompt');await frame.locator('#methods button').first().click();await frame.locator('#cards').fill('隔離測試抽牌');await frame.getByRole('button',{name:'產生指令',exact:true}).click();assert.match(await frame.locator('#out').innerText(),/隔離測試抽牌/);
 await page.goto(server.base+'/liaojie/tools/sanko-batch');await frame.getByRole('heading',{name:'日上三更｜出題產生器 v1.3',exact:true}).waitFor();
 await frame.locator('#startDate').fill('2026-10-23');await frame.getByRole('button',{name:'建立 / 重建逐日排程',exact:true}).click();
 assert.equal(await frame.locator('.simple-day').count(),3);
 for(const width of [320,375,390,430,1024]){await page.setViewportSize({width,height:844});assert(await frame.locator('html').evaluate(el=>el.scrollWidth<=innerWidth+1),`batch overflow ${width}`);await page.screenshot({path:`${out}/sanko-batch-${width}.png`,fullPage:true});}
 console.log('PASS original sanko single instruction and batch schedule + five sizes');
 assert.deepEqual(errors,[],'no unhandled original-tool or wrapper runtime errors');
} finally {await browser.close();server.stop();}
