// Exercise the actual Next.js weekly UI with isolated transport; never writes production data.
import assert from 'node:assert/strict';
import {readFileSync,existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {createRequire,Module} from 'node:module';
import {resolve,dirname} from 'node:path';
import ts from 'typescript';
import {isolatedServer} from './isolated-practice-server.mjs';
const require=createRequire(import.meta.url),{chromium}=require('playwright'),cache=new Map();
function load(file){file=resolve(file);if(cache.has(file))return cache.get(file).exports;const m=new Module(file);cache.set(file,m);m.filename=file;m.require=s=>{const p=s.startsWith('@/')?resolve(s.slice(2)):s.startsWith('.')?resolve(dirname(file),s):null;return p?load(['.ts','.tsx',''].map(e=>p+e).find(existsSync)):require(s)};m._compile(ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file);return m.exports;}
const f=load('lib/dojo/formal.ts'),t=load('lib/dojo/weeklyTemplates.ts');
const week=f.mondayOf(f.taipeiTodayISO()),previous=f.addCalendarDays(week,-7),boards=new Map(),links=new Map();
const board=f.emptyWeeklyBoard(week);
const names=['主題理解','伸展放鬆','好好玩耍','英文閱讀','中文解說','詞彙複習','外出探索','自己做飯','英文話題','主題表達','影視時光','完整休息','','繼續閱讀','自由創作','提早睡覺','工作實戰','詞彙複習','伸展放鬆','安心玩耍'];
for(let i=0;i<20;i++){if(i===12)continue;Object.assign(board.cells[i],{text:names[i],shortLabel:names[i],taskInstanceId:`fixture-${i}`,category:['important','hobby','health'][i%3],completed:i<5||i===8||i===14});board.cells[i].completion.progress=board.cells[i].completed?1:0;}
board.colorsConfirmedAt=new Date().toISOString();boards.set(week,board);
const archived=structuredClone(board);archived.weekStart=previous;archived.title='封存測試週盤';archived.archivedAt=new Date().toISOString();boards.set(previous,archived);
links.set(previous,[{weekStart:previous,targetWeek:week,taskInstanceId:'fixture-16',status:'complete'}]);
const calls=[],errors=[],output=resolve('artifacts/weekly-ui');mkdirSync(output,{recursive:true});
let rejectNextBoardWrite=false;
const server=await isolatedServer(3029,'weekly-ui-isolated',{fontResponses:process.env.NEXT_FONT_GOOGLE_MOCKED_RESPONSES}),browser=await chromium.launch({headless:true});
try{
 const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1});
 await context.addCookies([{name:'dsc_access_key',value:'weekly-ui-isolated',url:server.base}]);
 await context.route('**/api/**',async route=>{
  const req=route.request(),u=new URL(req.url());let body={};try{body=req.postDataJSON()||{};}catch{}
  calls.push({path:u.pathname,method:req.method(),body});let result={};
  if(u.pathname.endsWith('/bingo/templates'))result={library:t.normalizeWeeklyTemplateLibrary(null),unavailableTemplateIds:[]};
  else if(u.pathname.endsWith('/bingo/continue')){
   if(req.method()==='POST'){const link={weekStart:body.weekStart,targetWeek:body.targetWeek,taskInstanceId:body.taskInstanceId,status:'complete'};links.set(body.weekStart,[link]);const target=f.emptyWeeklyBoard(body.targetWeek);target.cells[0]={...structuredClone(boards.get(body.weekStart).cells.find(c=>c.taskInstanceId===body.taskInstanceId)),index:0,assignedDate:null,assignedCategory:null};boards.set(body.targetWeek,target);result={link};}
   else result={links:links.get(u.searchParams.get('week'))||[]};
  }
  else if(u.pathname.endsWith('/bingo')){
   if(req.method()==='PUT'){if(rejectNextBoardWrite){rejectNextBoardWrite=false;return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'暫時無法儲存，請重試。'})});}boards.set(body.weekStart,{...body.board,updatedAt:new Date().toISOString()});result={board:boards.get(body.weekStart)};}
   else result=u.searchParams.has('archive')?{boards:[archived]}:{board:boards.get(u.searchParams.get('week'))||f.emptyWeeklyBoard(u.searchParams.get('week'))};
  }else if(u.pathname.endsWith('/flow')){
   const current=structuredClone(boards.get(body.weekStart)),cell=current.cells[body.cellIndex];
   if(body.action==='progress-bingo'){cell.completion.progress=Math.min(cell.completion.target,cell.completion.progress+body.direction);cell.completed=cell.completion.progress>=cell.completion.target;}
   if(body.action==='assign-bingo'){cell.assignedDate=body.date;cell.assignedCategory=body.category;}
   boards.set(body.weekStart,current);result={board:current};
  }else if(u.pathname.endsWith('/daily'))result={record:f.emptyDailyRecord(u.searchParams.get('date'))};
  else if(u.pathname.endsWith('/entries'))result={entries:[]};
  else if(u.pathname.endsWith('/reading/cards'))result={cards:[]};
  await route.fulfill({contentType:'application/json',body:JSON.stringify(result)});
 });
 const page=await context.newPage();page.setDefaultTimeout(12000);page.setDefaultNavigationTimeout(120000);page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 await page.goto(server.base+'/bingo');
 await page.addStyleTag({content:'nextjs-portal{display:none!important}'});
 const nav=page.getByRole('navigation',{name:'週盤功能'});
 await nav.waitFor(); // RED on the former page: approved four-view navigation is absent.
 for(const label of ['本週','組盤','回望','封存'])assert.equal(await nav.getByRole('button',{name:label,exact:true}).count(),1);
 await page.locator('.weekly-summary').waitFor();
 assert.match(await page.locator('.weekly-summary').innerText(),/7\s*\/\s*24/);
 assert.match(await page.locator('.weekly-summary').innerText(),/已安排 19 格/);
 assert.equal(await page.getByRole('heading',{name:'週盤',exact:true}).count(),1);
 const order=await page.evaluate(()=>({summary:document.querySelector('.weekly-summary').getBoundingClientRect().bottom,board:document.querySelector('.board-card').getBoundingClientRect().top,color:document.querySelector('.weekly-color-plan').getBoundingClientRect().top}));
 assert(order.summary<order.board&&order.board<order.color,'approved summary and board must precede color setup');
 for(const width of [320,375,390,430,1024]){
  await page.setViewportSize({width,height:844});
  const bounds=await page.evaluate(()=>({vw:innerWidth,sw:document.documentElement.scrollWidth,grid:(()=>{const r=document.querySelector('.bingo-grid').getBoundingClientRect();return {w:r.width,h:r.height}})()}));
  assert(bounds.sw<=bounds.vw+1,`overflow at ${width}: ${JSON.stringify(bounds)}`);assert(Math.abs(bounds.grid.w-bounds.grid.h)<2);
  await page.screenshot({path:output+`/board-${width}.png`,fullPage:width===390});
 }
 await page.setViewportSize({width:390,height:844});
 const initialWrites=calls.filter(c=>c.method!=='GET').length;
 await nav.getByRole('button',{name:'組盤',exact:true}).click();await page.getByRole('button',{name:'階段專案',exact:true}).waitFor();
 await page.getByRole('button',{name:'階段專案',exact:true}).click();await page.getByText('確認野採單字能送入VF',{exact:true}).first().waitFor();
 await page.getByRole('button',{name:'閱讀洞察',exact:true}).click();await page.getByRole('heading',{name:'還沒有待行動的執行型洞察'}).waitFor();assert.equal(await page.getByRole('link',{name:'前往閱讀萃取'}).getAttribute('href'),'/reading/cards');await page.getByRole('button',{name:'階段專案',exact:true}).click();
 assert((await page.locator('.template-pick-list article').count())>=36);
 assert(await page.locator('.template-pick-list').evaluate(el=>el.scrollHeight<=el.clientHeight+1),'task list must use the page scroll, without clipping candidates');
 const picked=page.locator('.template-pick-list article').filter({has:page.getByText('確認野採單字能送入VF',{exact:true})});
 await picked.locator('.template-pick-main').click();await page.getByLabel('確認野採單字能送入VF本週名稱').fill('本週野採驗收');
 const reason=picked.getByRole('group',{name:'這週為什麼做？',exact:true});await reason.waitFor();
 assert.equal(await reason.getByRole('button').count(),3);
 for(const width of [320,375,390,430]){
  await page.setViewportSize({width,height:844});
  const rects=await reason.getByRole('button').evaluateAll(buttons=>buttons.map(b=>{const r=b.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height,sw:b.scrollWidth,cw:b.clientWidth}}));
  assert(rects.every(r=>r.h>=44&&r.sw<=r.cw+1),'compact reason buttons must remain readable and tappable');
  assert(rects.every(r=>Math.abs(r.y-rects[0].y)<1),'all three reasons must share one horizontal row');
  assert(rects[1].x>=rects[0].x+rects[0].w+7&&rects[2].x>=rects[1].x+rects[1].w+7);
 }
 await page.setViewportSize({width:390,height:844});
 await reason.getByRole('button',{name:'照顧自己',exact:true}).click();assert.equal(await reason.getByRole('button',{pressed:true}).count(),1);
 await reason.evaluate(el=>el.scrollIntoView({block:'center'}));await page.screenshot({path:output+'/reason-buttons-390.png'});
 await reason.getByRole('button',{name:'照顧自己',exact:true}).click();assert.equal(await reason.getByRole('button',{pressed:true}).count(),0,'reselecting a reason can leave it undecided');
 await page.getByRole('button',{name:'閱讀洞察',exact:true}).click();assert.equal(await page.locator('.template-selection-bar').count(),0,'reading must not offer actions for hidden template selections');await page.getByRole('button',{name:'階段專案',exact:true}).click();assert.equal(await page.getByLabel('確認野採單字能送入VF本週名稱').inputValue(),'本週野採驗收');
 await nav.getByRole('button',{name:'本週',exact:true}).click();await page.goBack();await page.getByRole('button',{name:'階段專案',exact:true}).waitFor();assert.equal(await page.getByLabel('確認野採單字能送入VF本週名稱').inputValue(),'本週野採驗收');
 assert.equal(await page.locator('.template-selection-bar').isVisible(),true);
 await picked.locator('.template-pick-main').click();await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:output+'/library-390.png',fullPage:false});
 await nav.getByRole('button',{name:'回望',exact:true}).click();await page.getByLabel('這週值得記下的一件事').fill('保留分頁切換前的回望草稿');
 await nav.getByRole('button',{name:'本週',exact:true}).click();await nav.getByRole('button',{name:'回望',exact:true}).click();assert.equal(await page.getByLabel('這週值得記下的一件事').inputValue(),'保留分頁切換前的回望草稿');
 assert.equal(calls.filter(c=>c.method!=='GET').length,initialWrites,'switching tabs must not save or mutate tasks');
 await page.getByRole('button',{name:'儲存回望',exact:true}).click();await page.getByRole('status').filter({hasText:'每週回望已儲存'}).waitFor();assert.equal(boards.get(week).reflection.brightSpot,'保留分頁切換前的回望草稿');
 await nav.getByRole('button',{name:'本週',exact:true}).click();await page.getByRole('button',{name:'清單',exact:true}).click();await page.locator('.weekly-task-list').first().waitFor();await page.getByRole('button',{name:'盤面',exact:true}).click();
 assert.equal(await page.locator('.bingo-lines .line-thread').count(),1,'line geometry must return after switching views');
 await page.locator('[data-cell-index="5"]').click();await page.getByRole('button',{name:'完成這格',exact:true}).click();await page.getByRole('status').filter({hasText:'這一格已完成'}).first().waitFor();assert(boards.get(week).cells[5].completed);
 await page.getByRole('button',{name:'關閉',exact:true}).click();
 await page.getByRole('button',{name:'週盤設定',exact:true}).click();await page.goBack();await page.getByRole('dialog').waitFor({state:'hidden'});assert.equal(new URL(page.url()).hash,'#board');
 await page.locator('[data-cell-index="6"]').click();await page.getByRole('button',{name:/排入今天・/}).click();await page.getByRole('status').filter({hasText:'已排入今天'}).first().waitFor();assert.equal(boards.get(week).cells[6].assignedDate,f.taipeiTodayISO());
 const sourceBefore=JSON.stringify(boards.get(week).cells[6]);await page.getByRole('button',{name:'保留進度續排',exact:true}).click();await page.getByRole('button',{name:/已續排至/}).waitFor();assert.equal(JSON.stringify(boards.get(week).cells[6]),sourceBefore);await page.getByRole('button',{name:'關閉',exact:true}).click();
 await page.getByRole('button',{name:'選擇週盤日期',exact:true}).click();await page.getByLabel('這一週的任一天').fill('2026-12-31');await page.getByRole('button',{name:'查看這一週',exact:true}).click();await page.getByRole('button',{name:'選擇週盤日期',exact:true}).filter({hasText:'2026 年 · 第 53 週'}).waitFor();
 await page.getByRole('button',{name:'查看下一週',exact:true}).click();await page.getByRole('button',{name:'選擇週盤日期',exact:true}).filter({hasText:'2027 年 · 第 1 週'}).waitFor();
 await page.getByRole('button',{name:'選擇週盤日期',exact:true}).click();await page.getByRole('button',{name:'回到本週',exact:true}).click();await page.locator('.weekly-summary').filter({hasText:'已安排 19 格'}).waitFor();
 await nav.getByRole('button',{name:'組盤',exact:true}).click();await page.getByRole('button',{name:'階段專案',exact:true}).click();await picked.locator('.template-pick-main').click();await page.getByLabel('確認野採單字能送入VF本週名稱').fill('本週野採驗收');await reason.getByRole('button',{name:'照顧自己',exact:true}).click();
 rejectNextBoardWrite=true;await page.getByRole('button',{name:'加入空白格',exact:true}).click();
 const inlineError=page.locator('.weekly-template-body > .form-error');await inlineError.waitFor();
 const gap=await inlineError.evaluate(el=>el.getBoundingClientRect().top-el.parentElement.querySelector('.template-manage-toggle').getBoundingClientRect().bottom);assert(gap>=15,'management control and error must have a visible section gap');
 assert.equal(await page.getByLabel('確認野採單字能送入VF本週名稱').inputValue(),'本週野採驗收','a rejected save must retain the edited task');
 await inlineError.scrollIntoViewIfNeeded();await page.screenshot({path:output+'/task-error-spacing-390.png'});
 await page.getByRole('button',{name:'加入空白格',exact:true}).click();await page.getByRole('status').filter({hasText:'已加入 1 個本週任務'}).waitFor();await inlineError.waitFor({state:'hidden'});await nav.getByRole('button',{name:'本週',exact:true}).click();
 assert.equal(boards.get(week).cells.filter(c=>c.text==='本週野採驗收').length,1);assert.equal(boards.get(week).cells.find(c=>c.text==='本週野採驗收').category,'health');
 await page.reload();await page.locator('.weekly-summary').filter({hasText:'已安排 20 格'}).waitFor();
 await nav.getByRole('button',{name:'封存',exact:true}).click();await page.getByRole('button',{name:/封存測試週盤/}).click();await page.locator('.weekly-summary').filter({hasText:'已封存'}).waitFor();assert.equal(await page.getByRole('button',{name:'編輯格子',exact:true}).count(),0);
 await page.locator('[data-cell-index="13"]').click();assert.equal(await page.getByRole('button',{name:'保留進度續排',exact:true}).count(),0,'archive must not offer continuation writes');await page.getByRole('button',{name:'關閉',exact:true}).click();
 await page.locator('[data-cell-index="16"]').click();assert.equal(await page.getByRole('button',{name:/已續排至.*前往週盤/}).count(),1,'archived carried tasks must retain their readonly target navigation');assert.equal(await page.getByRole('button',{name:'保留進度續排',exact:true}).count(),0);await page.getByRole('button',{name:'關閉',exact:true}).click();
 await nav.getByRole('button',{name:'回望',exact:true}).click();assert(await page.getByLabel('這週值得記下的一件事').isDisabled());
 assert.equal(errors.length,0,errors.join('\n'));
 writeFileSync(output+'/browser-report.json',JSON.stringify({widths:[320,375,390,430,1024],checks:['four views','summary before board','square cells','no horizontal overflow','all task candidates scroll in page','library selection draft across browser back','reflection draft preservation','explicit persistence','completion flow','restored line geometry','modal browser back','assign today','carry keeps source snapshot','date picker year boundary','archived readonly and carried target navigation'],productionWrites:0,requests:calls.length,errors},null,2));
 console.log('weekly-mobile: actual UI flow and viewport checks passed');
}finally{await browser.close();server.stop();}
