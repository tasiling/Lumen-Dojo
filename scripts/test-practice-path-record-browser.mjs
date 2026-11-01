import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {isolatedServer} from './isolated-practice-server.mjs';
const out='docs/practice-path-record-evidence';await mkdir(out,{recursive:true});
const server=await isolatedServer(3086,'practice-path-record-fixture',{production:true});
const base={schema:1,owner:'fixture',legacyKey:null,stageId:null,itemId:null,status:'active',order:0,revision:1,description:'',vision:'',goal:'',expectedOutcome:''};
const item={...base,id:'drawing-stable',kind:'item',name:'繪圖'};
const stages=Array.from({length:4},(_,i)=>({...base,id:`stage-${i}`,kind:'stage',itemId:item.id,order:i,name:`Level ${i+1}｜${['控筆與手部協調','觀察與抓型','三維構造','形體操作'][i]}`,description:'寫字暖身、平行線、圓與橢圓、方形轉向與中心、立體絲帶、形狀擠出。',goal:'讓下筆更穩定，練習一筆完成的直線、曲線與簡單形體。',expectedOutcome:'回看線條抖動、間距與形狀是否較一致。'}));
const topics=Array.from({length:20},(_,i)=>({...base,id:`topic-${i}`,kind:'topic',itemId:item.id,stageId:stages[Math.min(3,Math.floor(i/6))].id,order:i,name:`${String(i+1).padStart(2,'0')}｜${['寫字暖身','平行線疊畫','圓與橢圓','轉向與中心','立體絲帶','形狀擠出'][i%6]}`,description:'Writing 做法：寫一行字母、自己的名字或一段短句，先讓手熟悉紙筆或繪圖板。\n來源：Marc Brunet（見原影片）。'+(i===0?'練習說明。'.repeat(60):''),goal:'用熟悉的精細動作暖身。',expectedOutcome:'留一小段字跡，注意手是否比較順；不以字漂亮作為過關條件。'}));
let entities=[item,...stages,...topics],failSave=true,writes=0;
const errors=[],results=[];let browser;
try{
 browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:390,height:844}});
 await context.addCookies([{name:'dsc_access_key',value:'practice-path-record-fixture',url:server.base}]);
 await context.route('**/*',async route=>{const req=route.request(),u=new URL(req.url());if(u.origin!==server.base)return route.abort();if(!u.pathname.startsWith('/api/'))return route.continue();
  if(req.method()!=='GET'){writes++;assert.equal(u.pathname,'/api/dojo/learning/records');if(failSave)return route.fulfill({status:503,json:{error:'隔離測試：儲存失敗，請重試'}});const input=req.postDataJSON().input;return route.fulfill({json:{record:{...input,id:'saved-fixture',revision:1}}});}
  if(u.pathname==='/api/dojo/learning/foundation')return route.fulfill({json:{entities,missing:[]}});
  return route.fulfill({json:{entries:[],records:[],events:[],tracks:[],practices:[],sources:[],cursor:null}});
 });
 const page=await context.newPage();page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));
 async function widthCheck(){assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'horizontal overflow');}
 async function datesFit(){for(const id of ['record-date','record-created'])assert(await page.locator('#'+id).evaluate(el=>{const r=el.getBoundingClientRect(),p=el.closest('.practice-field').getBoundingClientRect();return r.right<=p.right+1&&r.left>=p.left-1&&r.width<=p.width+1}),'date outside field');}
 for(const width of [375,390,430,1024]){
  await page.setViewportSize({width,height:844});
  await page.goto(server.base+'/practice/learning?learningItem='+item.id+'&tab=path');await page.locator('.practice-stage-card').first().waitFor();
  assert.equal(await page.locator('.practice-stage-card').count(),4);assert.equal(await page.locator('.practice-topic-card[open]').count(),0);await widthCheck();
  await page.locator('.practice-stage-card>summary').first().click();
  const summary=page.locator('.practice-topic-card>summary').first();await summary.focus();await page.keyboard.press('Enter');assert.equal(await page.locator('.practice-topic-card[open]').count(),1);await widthCheck();
  await summary.click();await page.locator('.practice-stage-card>summary').first().click();await page.evaluate(()=>scrollTo(0,0));
  if(width===390){await page.screenshot({path:'/tmp/practice-path-390.png',fullPage:true});await page.screenshot({path:out+'/path-390-viewport.png'});}
  await page.goto(server.base+'/practice/records?new=1&learningItem='+item.id);const body=page.getByLabel('這次學了什麼？',{exact:true});await body.waitFor();
  assert.equal(await page.locator('h1').count(),1);await widthCheck();await datesFit();
  if(width===390){await page.screenshot({path:'/tmp/practice-record-390.png',fullPage:true});await page.screenshot({path:out+'/record-390-viewport.png'});}
  const dates=await page.locator('.practice-record-dates .practice-field').evaluateAll(els=>els.map(e=>({top:e.getBoundingClientRect().top,left:e.getBoundingClientRect().left})));
  assert(width<=650?dates[1].top>dates[0].top:dates[1].left>dates[0].left);
  await body.fill('今天練習平行線與絲帶，保留這份尚未保存的正文。');const help=page.getByRole('button',{name:'這次學了什麼？的填寫說明',exact:true});await help.focus();await page.keyboard.press('Space');assert.equal(await help.getAttribute('aria-expanded'),'true');assert.match(await body.inputValue(),/保留/);await page.keyboard.press('Space');
  await page.getByRole('button',{name:'儲存草稿',exact:true}).click();await page.getByRole('alert').filter({hasText:'儲存失敗'}).waitFor();assert.match(await body.inputValue(),/保留/);
  await page.getByRole('button',{name:'儲存草稿',exact:true}).scrollIntoViewIfNeeded();assert(await page.getByRole('button',{name:'儲存草稿',exact:true}).evaluate(el=>{const r=el.getBoundingClientRect(),n=document.querySelector('nav[aria-label="主要導覽"]').getBoundingClientRect();return r.bottom<=n.top+1}),'save obscured');
  await page.setViewportSize({width,height:430});await body.focus();await widthCheck();await datesFit();
  await page.setViewportSize({width,height:844});
  results.push({width,pathTopics:20,noOverflow:true,dateFieldsFit:true,helpKeepsBody:true,failedSaveKeepsBody:true});
 }
 failSave=false;await page.getByRole('button',{name:'儲存草稿',exact:true}).click();await page.getByRole('status').filter({hasText:'已保存'}).waitFor();assert.match(page.url(),/record=saved-fixture/);
 entities=[item];await page.goto(server.base+'/practice/learning?learningItem='+item.id+'&tab=path');await page.getByText('學習路徑還留著空間').waitFor();await widthCheck();
 assert.deepEqual(errors,[]);await writeFile(out+'/results.json',JSON.stringify({browser:'Chromium',fixtureOnly:true,realBackendWrites:0,interceptedWrites:writes,results,emptyPath:true,saveRetry:true,pageErrors:errors,safari:false},null,2));
 console.log('PASS native Next Chromium: four widths, 20 topics, keyboard disclosures/help, date fit, failure retention, save retry, empty path; zero real API writes');
}finally{await browser?.close();server.stop();}
