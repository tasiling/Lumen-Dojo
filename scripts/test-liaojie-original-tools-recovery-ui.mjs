import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {isolatedServer} from './isolated-practice-server.mjs';
const server=await isolatedServer(3080,'original-tools-fixture');const browser=await chromium.launch({args:['--no-sandbox']});
const failures=[];
try{
 const ctx=await browser.newContext({viewport:{width:390,height:844},acceptDownloads:true});
 await ctx.addCookies([{name:'dsc_access_key',value:'original-tools-fixture',url:server.base}]);
 await ctx.route('**/api/**',route=>route.fulfill({json:{entries:[],captures:[]}}));
 const page=await ctx.newPage();page.setDefaultTimeout(15000);const f=page.frameLocator('iframe');
 async function check(name,fn){try{await fn();console.log('PASS '+name)}catch(e){failures.push(name+': '+e.message);console.error('FAIL '+name+': '+e.message)}}
 await check('diamond treats node HTML as literal text',async()=>{
  await page.goto(server.base+'/liaojie/tools/diamond');await f.locator('[data-stage=D]').click();
  await f.locator('#node-desc').fill('<img src=x onerror="window.__injected=1">');await f.getByRole('button',{name:'加入清單',exact:true}).click();
  assert.equal(await f.locator('#node-list img').count(),0);
  assert.match(await f.locator('#node-list').innerText(),/<img/);
 });
 await check('magazine restores selected page and edits the matching page',async()=>{
  await page.goto(server.base+'/liaojie/tools/magazine');await f.locator('#generateBtn').click();await f.locator('#nextBtn').click();
  const counter=await f.locator('#pageCounter').innerText(),title=await f.locator('#pageTitle').inputValue();assert.match(counter,/2/);
  await page.waitForTimeout(1400);await page.reload();await page.getByRole('button',{name:'下載備份',exact:true}).waitFor();await f.locator('#pageTitle').waitFor();
  assert.equal(await f.locator('#pageCounter').innerText(),counter);assert.equal(await f.locator('#pageTitle').inputValue(),title);
  await f.locator('#pageTitle').fill('第二頁的新標題');
  const dl=page.waitForEvent('download');await f.locator('#saveProjectBtn').click();const stream=await(await dl).createReadStream();const pieces=[];for await(const b of stream)pieces.push(b);const project=JSON.parse(Buffer.concat(pieces));
  assert.equal(project.pages[1].title,'第二頁的新標題');assert.notEqual(project.pages[0].title,'第二頁的新標題');
 });
 await check('backup captures latest keystroke and restores portable draft',async()=>{
  await page.goto(server.base+'/liaojie/tools/diamond');await f.locator('#global-draft').fill('剛輸入的最新稿 </script> 仍是文字');
  const dl=page.waitForEvent('download');await page.getByRole('button',{name:'下載備份',exact:true}).click();const stream=await(await dl).createReadStream();const pieces=[];for await(const b of stream)pieces.push(b);const bytes=Buffer.concat(pieces),snapshot=JSON.parse(bytes);
  assert.equal(snapshot.fields['global-draft'].value,'剛輸入的最新稿 </script> 仍是文字');
  await f.locator('#global-draft').fill('稍後修改');await page.waitForTimeout(1400);await page.getByRole('status').filter({hasText:'已保存到這個裝置'}).waitFor();
  page.once('dialog',d=>d.accept());await page.getByLabel('匯入工具備份').setInputFiles({name:'diamond.json',mimeType:'application/json',buffer:bytes});
  await page.waitForTimeout(500);assert.equal(await f.locator('#global-draft').inputValue(),snapshot.fields['global-draft'].value);
  await f.locator('#global-draft').fill(snapshot.fields['global-draft'].value);
  const same=page.waitForEvent('download');await page.getByRole('button',{name:'下載備份',exact:true}).click();await same;
  await page.getByRole('status').filter({hasText:'已保存到這個裝置'}).waitFor({timeout:2500});
 });
 await check('save failure preserves draft and still allows latest backup',async()=>{
  await page.goto(server.base+'/liaojie/tools/sanko-prompt');await page.getByRole('button',{name:'下載備份',exact:true}).waitFor();await page.getByRole('status').filter({hasText:'已保存到這個裝置'}).waitFor();
  await page.evaluate(()=>{IDBObjectStore.prototype.put=function(){throw new Error('isolated quota failure')}});
  await f.locator('#cards').fill('保存失敗仍保留的抽牌');await page.getByRole('alert').filter({hasText:'保存失敗'}).waitFor();assert.equal(await f.locator('#cards').inputValue(),'保存失敗仍保留的抽牌');
  const dl=page.waitForEvent('download');await page.getByRole('button',{name:'下載備份',exact:true}).click();const stream=await(await dl).createReadStream();const pieces=[];for await(const b of stream)pieces.push(b);assert.equal(JSON.parse(Buffer.concat(pieces)).fields.cards.value,'保存失敗仍保留的抽牌');
 });
 assert.deepEqual(failures,[]);
}finally{await browser.close();server.stop()}
