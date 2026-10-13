import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {isolatedServer} from './isolated-practice-server.mjs';
const server=await isolatedServer(3107,'r26-ui-isolated');let browser;
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{})});
 for(const width of [375,390,430]){
 const context=await browser.newContext({viewport:{width,height:844},isMobile:true,hasTouch:true});await context.addCookies([{name:'dsc_access_key',value:'r26-ui-isolated',url:server.base}]);
 const itemId='10000000-0000-4000-8000-000000000001',definitions=[],attempts=[];let writes=0;
 await context.route('**/api/**',async route=>{const req=route.request(),path=new URL(req.url()).pathname;let body={};if(path==='/api/dojo/learning/foundation')body={entities:[{id:itemId,kind:'item',name:'英文與生活探索',status:'active'}]};else if(path==='/api/dojo/assessments'){if(req.method()==='GET')body={definitions,attempts};else{const input=req.postDataJSON();writes++;const d={...input.definition,id:crypto.randomUUID(),capabilityId:input.capabilityId??crypto.randomUUID(),definitionVersion:(input.previousVersion??0)+1};definitions.push(d);body={definition:d}}}else if(path==='/api/dojo/entries')body={entries:[]};await route.fulfill({json:body})});
 const page=await context.newPage();await page.goto(server.base+'/practice/assessments');await page.getByRole('button',{name:'建立英文表達規準'}).click();assert.equal(writes,0);const aids=page.getByLabel('可用輔助（每行一項）',{exact:true});await aids.fill('筆記');await aids.press('End');await aids.press('Enter');assert.equal(await aids.inputValue(),'筆記\n');await aids.press('A');assert.equal(await aids.inputValue(),'筆記\na');await page.getByLabel('能力名稱',{exact:true}).fill('真實經驗表達');await page.getByRole('button',{name:'保存規準',exact:true}).click();await page.getByRole('heading',{name:'真實經驗表達 · 規準 v1'}).waitFor();assert.equal(writes,1);attempts.push({id:'old',capabilityId:definitions[0].capabilityId,definitionVersion:1,status:'assessed',verdict:'meets',confirmedAt:'2026-10-13'});
 await page.reload();await page.getByText('已確認掌握',{exact:true}).waitFor();await page.getByRole('button',{name:'編輯為新版規準'}).click();await page.getByLabel('能力目標',{exact:true}).fill('在新情境說明事件');await page.getByRole('button',{name:'保存規準',exact:true}).click();await page.getByRole('heading',{name:'真實經驗表達 · 規準 v2'}).waitFor();await page.getByText('尚未開始',{exact:true}).waitFor();await page.getByText('本版嘗試 0 次；舊版已確認成果 1 份。',{exact:true}).waitFor();assert.equal(writes,2);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await context.close();
 }
 console.log('PASS mobile Chromium 375/390/430: editable example has zero writes, explicit rubric save, new version retains old mastery without claiming current mastery, no horizontal overflow');
}finally{await browser?.close();server.stop()}
