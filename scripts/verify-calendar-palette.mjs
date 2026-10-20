// Local browser regression for the approved calendar. All API traffic is intercepted.
import assert from 'node:assert/strict';
import {readFileSync, existsSync, mkdirSync, writeFileSync} from 'node:fs';
import {createRequire, Module} from 'node:module';
import {resolve, dirname} from 'node:path';
import ts from 'typescript';
import {isolatedServer} from './isolated-practice-server.mjs';
const require=createRequire(import.meta.url),{chromium}=require('playwright'),cache=new Map();
function load(file){file=resolve(file);if(cache.has(file))return cache.get(file).exports;const m=new Module(file);cache.set(file,m);m.filename=file;m.require=s=>{const p=s.startsWith('@/')?resolve(s.slice(2)):s.startsWith('.')?resolve(dirname(file),s):null;return p?load(['.ts','.tsx',''].map(e=>p+e).find(existsSync)):require(s)};m._compile(ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file);return m.exports;}
const formal=load('lib/dojo/formal.ts');
const records=[['2026-10-01','medium','light',1,['input','vocabulary']],['2026-10-07','light','light',0,['input']],['2026-10-14','deep','medium',2,['input','output','vocabulary']]].map(([date,am,pm,done,touches])=>{const r=formal.emptyDailyRecord(date);r.morning.startedAt=date+'T00:00:00Z';r.morning.depth=am;r.evening.closedAt=date+'T12:00:00Z';r.evening.depth=pm;Object.values(r.tasks).forEach((t,i)=>{t.text='Isolated calendar fixture';t.completed=i<done;});r.englishRhythm.touches=touches;return r;});
const out=resolve(process.env.UI_ARTIFACT_DIR||'/tmp/lumen-calendar-palette-qa');mkdirSync(out,{recursive:true});
const server=await isolatedServer(3034,'calendar-palette-local');
const browser=await chromium.launch({headless:true});
const measures=[],errors=[];let writes=0;
try{
 const context=await browser.newContext({viewport:{width:390,height:844}});
 await context.addCookies([{name:'dsc_access_key',value:'calendar-palette-local',url:server.base}]);
 await context.route('**/api/**',async route=>{if(route.request().method()!=='GET')writes++;const u=new URL(route.request().url());let data={entries:[],cards:[],links:[],bundles:[],items:[],daily:[],calendar:[],completion:{total:0,done:0},today:'2026-10-20'};if(u.pathname==='/api/dojo/calendar')data={items:[],daily:records};if(u.pathname==='/api/dojo/daily')data={record:formal.emptyDailyRecord('2026-10-20')};await route.fulfill({contentType:'application/json',body:JSON.stringify(data)});});
 const page=await context.newPage();page.setDefaultNavigationTimeout(120000);page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
 await page.clock.install({time:new Date('2026-10-20T03:00:00Z')});
 await page.goto(server.base+'/calendar');await page.locator('.calendar-grid button').first().waitFor();
 await page.addStyleTag({content:'nextjs-portal{display:none!important}'});
 for(const width of [320,390,430,768,1440]){
  await page.setViewportSize({width,height:844});
  const m=await page.evaluate(()=>{const grid=document.querySelector('.calendar-grid'),cells=[...grid.children],selected=grid.querySelector('.selected'),ring=grid.querySelector('.calendar-review-mark');const r=selected.getBoundingClientRect();return {width:innerWidth,scroll:document.documentElement.scrollWidth,cells:cells.length,cellHeights:cells.map(c=>c.getBoundingClientRect().height),selectedHeight:r.height,selectedShadow:getComputedStyle(selected).boxShadow,filtersHaveIcons:!!document.querySelector('.source-filter svg'),dateCenterOffsets:cells.map(c=>{const a=c.getBoundingClientRect(),b=c.querySelector('.calendar-date-row>b').getBoundingClientRect();return Math.abs((a.left+a.width/2)-(b.left+b.width/2))}),ringRatio:ring.getBoundingClientRect().width/ring.closest('button').getBoundingClientRect().width,navAdd:getComputedStyle(document.querySelector('[data-nav=add] .nav-icon')).backgroundColor,morning:getComputedStyle(document.querySelector('.calendar-review-mark .morning')).stroke,evening:getComputedStyle(document.querySelector('.calendar-review-mark .evening')).stroke};});
  writeFileSync(out+'/latest-measurement.json',JSON.stringify(m,null,2));
  if(Math.max(...m.dateCenterOffsets)>=1){await page.screenshot({path:out+'/alignment-debug-'+width+'.png',fullPage:true});console.log(await page.locator('.calendar-grid button').first().evaluate(e=>[e,...e.querySelectorAll('.calendar-date-row,.calendar-date-row>b')].map(x=>({tag:x.tagName,cls:x.className,rect:x.getBoundingClientRect().toJSON(),style:{width:getComputedStyle(x).width,justifyContent:getComputedStyle(x).justifyContent,display:getComputedStyle(x).display,gridTemplateColumns:getComputedStyle(x).gridTemplateColumns,padding:getComputedStyle(x).padding,margin:getComputedStyle(x).margin}}))));}
  assert(m.scroll<=width,'No horizontal overflow at '+width);assert.equal(m.cells,42);assert(!m.filtersHaveIcons);assert(Math.max(...m.cellHeights)-Math.min(...m.cellHeights)<1,'Whole date cells have equal height');assert(Math.max(...m.dateCenterOffsets)<1,'Dates remain centered');assert(m.ringRatio>.43&&m.ringRatio<.51,'Approved ring proportion');assert.equal(m.navAdd,'rgb(73, 109, 80)');assert.equal(m.morning,'rgb(195, 137, 5)');assert.equal(m.evening,'rgb(44, 135, 211)');assert(m.selectedShadow.includes('185, 204, 232'));measures.push(m);
  if([390,1440].includes(width))await page.screenshot({path:out+'/calendar-'+width+'.png',fullPage:true});
 }
 await page.setViewportSize({width:390,height:844});
 await page.locator('.calendar-grid button[aria-label^="2026-10-14"]').click();
 assert.equal(await page.locator('.calendar-grid button[aria-label^="2026-10-14"] .morning').count(),3);assert.equal(await page.locator('.calendar-grid button[aria-label^="2026-10-14"] .evening').count(),2);assert.equal(await page.locator('.calendar-english-marks').first().locator('i').count(),4);assert((await page.locator('.calendar-day-review').innerText()).includes('2 / 3 已完成'));
 for(const label of ['週','日','月'])await page.getByRole('button',{name:label,exact:true}).click();
 await page.getByRole('button',{name:'私人行程',exact:true}).click();assert.equal(await page.locator('.calendar-review-cell').count(),0);
 await page.getByRole('button',{name:'個人追蹤',exact:true}).click();assert.equal(await page.locator('.source-filter button').count(),4);
 await page.locator('.calendar-hero button').click();await page.locator('.modal').waitFor();assert.equal(await page.locator('.modal input[type=date]').inputValue(),'2026-10-14');await page.keyboard.press('Escape');
 await page.goto(server.base+'/');await page.locator('.today-hero').waitFor();assert.equal(await page.locator('.tc-glass-motif').count(),1);assert.equal(await page.locator('.calendar-hero').count(),0);assert.equal(await page.locator('.nav [data-nav]').count(),5);
 assert.equal(writes,0,'Read-only QA must not submit data');assert.equal(errors.length,0,'No browser errors: '+errors.join('; '));
 writeFileSync(out+'/verification.json',JSON.stringify({measures,writes,errors},null,2));console.log('PASS calendar palette: 5 viewport widths; whole-cell outlines; date alignment; 3-layer depth; four steps; filters; modal preset; unchanged homepage; zero data writes.');console.log('Artifacts:',out);
}finally{await browser.close();server.stop();}
