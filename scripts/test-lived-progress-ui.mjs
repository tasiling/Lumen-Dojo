// Exercise actual Today and weekly components at phone widths with isolated transport.
import assert from 'node:assert/strict';
import {readFileSync,existsSync,mkdirSync} from 'node:fs';
import {createRequire,Module} from 'node:module';
import {resolve,dirname} from 'node:path';
import ts from 'typescript';
import {isolatedServer} from './isolated-practice-server.mjs';
const require=createRequire(import.meta.url),{chromium}=require('playwright'),cache=new Map();
function load(file){file=resolve(file);if(cache.has(file))return cache.get(file).exports;const m=new Module(file);cache.set(file,m);m.filename=file;m.require=s=>{const p=s.startsWith('@/')?resolve(s.slice(2)):s.startsWith('.')?resolve(dirname(file),s):null;return p?load(['.ts','.tsx',''].map(e=>p+e).find(existsSync)):require(s);};m._compile(ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file);return m.exports;}
const f=load('lib/dojo/formal.ts'),d=load('lib/dojo/livedProgress.ts'),templates=load('lib/dojo/weeklyTemplates.ts');
const date=f.taipeiTodayISO(),week=f.mondayOf(date),records=new Map();let board=f.emptyWeeklyBoard(week),choices=d.emptyChoices(),writes=0,rejectNext=false;
let record=f.emptyDailyRecord(date);record.daytime.logs=[{id:'old',text:'我看到朋友提到情緒很受挫',time:'07:47',createdAt:date+'T00:00:00Z',context:d.BASE_CAPTURE_OPTIONS.find(o=>o.key==='emotion')}];records.set(date,record);
const errors=[],server=await isolatedServer(3031,'lived-ui-isolated'),browser=await chromium.launch({headless:true});
try{
 const context=await browser.newContext({viewport:{width:390,height:844}});await context.addCookies([{name:'dsc_access_key',value:'lived-ui-isolated',url:server.base}]);
 await context.route('**/api/**',async route=>{const req=route.request(),u=new URL(req.url());let b={};try{b=req.postDataJSON()||{};}catch{}let result={};
 if(req.method()!=='GET'){writes++;if(rejectNext){rejectNext=false;return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'測試儲存失敗，請重試'})});}}
 if(u.pathname.endsWith('/lived-progress')){if(req.method()==='PUT'){choices={...b.choices,revision:choices.revision+1};result={choices};}else if(u.searchParams.get('mode')==='catalog')result={options:[...d.BASE_CAPTURE_OPTIONS,{...d.BASE_CAPTURE_OPTIONS[1],key:'live-topic',label:'肌肉構造',path:'修習所／按摩進修／肌肉構造',group:'learning',learningItemId:'live-item',topicId:'live-topic'}]};else if(u.searchParams.get('mode')==='week')result={days:Array.from({length:7},(_,i)=>{const day=f.addCalendarDays(f.mondayOf(u.searchParams.get('week')),i);return records.get(day)||f.emptyDailyRecord(day);})};else result={choices};}
 else if(u.pathname.endsWith('/daily')){const day=b.date||u.searchParams.get('date')||date;if(req.method()==='PUT'){record=d.reconcileEnglishProgress(f.normalizeDailyRecord(b.record,day),records.get(day)||f.emptyDailyRecord(day));records.set(day,record);}result={record:records.get(day)||f.emptyDailyRecord(day),persisted:records.has(day)};}
 else if(u.pathname.endsWith('/bingo/templates'))result={library:templates.normalizeWeeklyTemplateLibrary(null),unavailableTemplateIds:[]};
 else if(u.pathname.endsWith('/bingo/continue'))result={links:[]};
 else if(u.pathname.endsWith('/bingo')){if(req.method()==='PUT')board=b.board;result=u.searchParams.has('archive')?{boards:[]}:{board};}
 else if(u.pathname.endsWith('/entries'))result={entries:[]};
 else if(u.pathname.endsWith('/reading/cards'))result={cards:[]};
 else if(u.pathname.endsWith('/roles'))result={roles:[]};
 await route.fulfill({contentType:'application/json',body:JSON.stringify(result)});
 });
 const page=await context.newPage();page.setDefaultTimeout(15000);page.setDefaultNavigationTimeout(120000);page.on('pageerror',e=>errors.push(e.message));
 await page.goto(server.base+'/');const capture=page.locator('#today-daytime');await capture.waitFor();
 const old=capture.locator('.day-log').filter({hasText:'我看到朋友提到情緒很受挫'});await old.waitFor();
 for(const width of [320,390,430]){await page.setViewportSize({width,height:844});const alignment=await old.evaluate(el=>{const content=el.querySelector('.lp-log-content > span').getBoundingClientRect(),label=el.querySelector('.lp-log-label').getBoundingClientRect();return {delta:Math.abs(content.x-label.x),overflow:document.documentElement.scrollWidth-innerWidth};});assert(alignment.delta<1,JSON.stringify(alignment));assert(alignment.overflow<=1);}
 await page.setViewportSize({width:390,height:844});
 const input=capture.locator('.quick-log input');await input.fill('不分類也能直接留一句');await capture.getByRole('button',{name:'記下',exact:true}).click();await capture.getByText('不分類也能直接留一句',{exact:true}).waitFor();assert.equal(record.daytime.logs.at(-1).context,null);
 const unclassified=capture.locator('.day-log').filter({hasText:'不分類也能直接留一句'});await unclassified.getByRole('button',{name:'補分類',exact:true}).click();let dialog=page.getByRole('dialog');await dialog.getByRole('button',{name:'生活',exact:true}).click();await unclassified.getByRole('button',{name:'生活',exact:true}).waitFor();assert.equal(record.daytime.logs.at(-1).context.scope,'life');
 await capture.locator('.lp-capture-controls').getByRole('button',{name:'修習所',exact:true}).click();dialog=page.getByRole('dialog');assert.equal(await capture.getByRole('dialog').count(),0,'picker must be portalled outside the log');await dialog.getByLabel('搜尋項目').fill('肌肉');await dialog.getByRole('button',{name:/肌肉構造/}).click();await input.fill('複習肌肉構造');await capture.getByRole('button',{name:'記下',exact:true}).click();await capture.getByText('複習肌肉構造',{exact:true}).waitFor();assert.equal(record.daytime.logs.at(-1).context.topicId,'live-topic');
 await capture.locator('.lp-capture-controls').getByRole('button',{name:'修習所',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'英文課堂',exact:true}).click();await input.fill('今天練習英文自我介紹');await capture.getByRole('button',{name:'記下',exact:true}).click();await capture.getByText('今天練習英文自我介紹',{exact:true}).waitFor();
 await page.locator('.english-rhythm-card > summary').click();const english=page.locator('.lp-english-details');await english.locator(':scope > summary').click();const log=english.locator('.lp-english-log');await log.getByRole('button',{name:f.ENGLISH_TOUCH_TYPES.input.label,exact:true}).click();await log.getByRole('button',{name:'確認這筆練習',exact:true}).click();await log.getByText(/已確認/).waitFor();assert(record.englishRhythm.touches.includes('input'));
 await log.getByRole('button',{name:f.ENGLISH_TOUCH_TYPES.input.label,exact:true}).click();await log.getByRole('button',{name:'確認這筆練習',exact:true}).click();await log.getByText(/待確認/).waitFor();assert.equal(record.englishRhythm.touches.length,0);assert.equal(record.daytime.logs.filter(l=>l.text==='今天練習英文自我介紹').length,1);
 await input.fill('失敗後保留草稿');rejectNext=true;await capture.getByRole('button',{name:'記下',exact:true}).click();await page.getByText(/測試儲存失敗/).waitFor();assert.equal(await input.inputValue(),'失敗後保留草稿');await capture.getByRole('button',{name:'記下',exact:true}).click();await capture.getByText('失敗後保留草稿',{exact:true}).waitFor();
 await page.reload();await page.locator('.day-log').filter({hasText:'不分類也能直接留一句'}).getByRole('button',{name:'生活',exact:true}).waitFor();
 mkdirSync('artifacts/lived-progress',{recursive:true});await page.locator('#today-daytime').scrollIntoViewIfNeeded();await page.screenshot({path:'artifacts/lived-progress/today-390.png'});
 await page.goto(server.base+'/bingo');const nav=page.getByRole('navigation',{name:'週盤功能'});await nav.waitFor();await page.locator('.bingo-grid').waitFor();assert.equal(await nav.getByRole('button').count(),4);assert.equal(await page.locator('[data-cell-index]').count(),25);
 await page.getByRole('button',{name:'實際紀錄',exact:true}).click();const fact=page.locator('.lp-actual-row').filter({hasText:'不分類也能直接留一句'});await fact.waitFor();await fact.getByRole('button',{name:'選入盤面',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'把這筆紀錄放進這格',exact:true}).click();await fact.getByRole('button',{name:'已在盤面',exact:true}).waitFor();assert.equal(board.cells.filter(c=>c.sourceId?.startsWith('log:')).length,1);
 await nav.getByRole('button',{name:'組盤',exact:true}).click();const flexible=page.locator('.lp-choices');await flexible.locator(':scope > summary').click();await flexible.getByLabel('加一件想做的事').fill('晚點散步');await flexible.getByRole('button',{name:'加入近期想做',exact:true}).click();await flexible.getByText('晚點散步',{exact:true}).waitFor();await flexible.getByRole('button',{name:'今天想做',exact:true}).click();await flexible.getByText(/今天想做/).last().waitFor();assert.equal(choices.ideas[0].pickedOn,date);
 await page.goto(server.base+'/');await page.locator('.lp-today-choices > summary').click();await page.locator('.lp-today-choices').getByText('晚點散步',{exact:true}).waitFor();
 assert.equal(errors.length,0,errors.join('\n'));console.log('PASS lived progress mobile UI: 320/390/430 widths, text alignment, optional capture, Life and live-topic classification, portal picker, confirmation undo, failed save recovery, reload, 25 cells/4 tabs, actual pin dedup and flexible choices; isolated writes='+writes);
}finally{await browser.close();server.stop();}
