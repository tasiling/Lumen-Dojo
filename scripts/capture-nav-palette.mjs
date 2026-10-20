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
const phase=process.argv[2]||'after',out=resolve('artifacts/nav-palette/'+phase);mkdirSync(out,{recursive:true});
const server=await isolatedServer(3032,'design-v2-local');const browser=await chromium.launch({headless:true});
const results=[];
try { const context=await browser.newContext({viewport:{width:390,height:844}});
await context.addCookies([{name:'dsc_access_key',value:process.env.UI_ACCESS_KEY||'design-v2-local',url:server.base}]);
await context.route('**/api/**',async route=>{const u=new URL(route.request().url());let result={entries:[],cards:[],count:0,links:[],bundles:[],captures:[],calendar:[],completion:{total:0,done:0},today:f.taipeiTodayISO(),items:[],daily:[]};
if(u.pathname.endsWith('/bingo/templates'))result={library:t.normalizeWeeklyTemplateLibrary(null),unavailableTemplateIds:[]};
if(u.pathname.endsWith('/daily'))result={record:f.emptyDailyRecord(f.taipeiTodayISO())};
if(u.pathname.endsWith('/bingo')){const board=f.emptyWeeklyBoard(f.mondayOf(f.taipeiTodayISO()));for(let i=0;i<6;i++)Object.assign(board.cells[i],{text:['英文閱讀','伸展放鬆','安心玩耍'][i%3],category:['important','health','hobby'][i%3]});result={board};}
if(u.pathname.endsWith('/forage-overview'))result={english:{pending:0,classification:0,dispatch:0,errors:0},captures:{pending:0,adopted:0,faded:0},recent:[]};
await route.fulfill({contentType:'application/json',body:JSON.stringify(result)});});
const page=await context.newPage();page.setDefaultNavigationTimeout(120000);page.setDefaultTimeout(15000);page.on('pageerror',e=>results.push({error:e.message}));
for(const [name,path] of [['today','/'],['calendar','/calendar'],['weekly','/bingo']]){
await page.goto(server.base+path);await page.waitForTimeout(1800);if(name==='weekly')await page.locator('.bingo-grid').waitFor();if(name==='weaving')await page.getByRole('button',{name:'開始第一件作品',exact:true}).waitFor();await page.addStyleTag({content:'nextjs-portal{display:none!important}'});
for(const width of [390,430]){await page.setViewportSize({width,height:844});await page.screenshot({path:out+'/'+name+'-'+width+'.png',fullPage:true});const measure=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,glass:document.querySelector('.tc-glass-motif')?.getBoundingClientRect().width}));const boxes=await page.locator('.dojo').evaluate(el=>Array.from(el.querySelectorAll('*')).filter(e=>e.getBoundingClientRect().width).map(e=>{const r=e.getBoundingClientRect();return {tag:e.tagName,cls:e.getAttribute('class'),x:r.x,y:r.y,w:r.width,h:r.height}}));const nav=await page.locator('.nav').evaluate(el=>{const props=['fontSize','lineHeight','paddingTop','paddingRight','paddingBottom','paddingLeft','gap','minHeight','display'];return [el,...el.querySelectorAll('button,.nav-icon,svg')].map(e=>{const r=e.getBoundingClientRect(),c=getComputedStyle(e);return {tag:e.tagName,rect:{x:r.x,y:r.y,w:r.width,h:r.height},style:Object.fromEntries(props.map(k=>[k,c[k]])),svg:e.tagName==='svg'?e.innerHTML:null}})});results.push({page:name,...measure,boxes,nav});assert(measure.scroll<=width, name+' overflow '+width);}
}
writeFileSync(out+'/measurements.json',JSON.stringify(results,null,2));console.log(results.map(({boxes,...r})=>({...r,elements:boxes?.length})));assert(!results.some(r=>r.error&&!r.error.includes('Hydration')&&!r.error.includes('React error #418')),'Unexpected browser page error');
}finally{await browser.close();server.stop();}
