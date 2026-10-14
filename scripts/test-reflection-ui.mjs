import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mkdtemp,rm} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {Module,createRequire} from 'node:module';
import ts from 'typescript';
import {isolatedServer} from './isolated-practice-server.mjs';
const require=createRequire(import.meta.url),cache=new Map();
function load(file){file=resolve(file);if(cache.has(file))return cache.get(file).exports;const m=new Module(file);cache.set(file,m);m.filename=file;m.require=s=>s==='server-only'?{}:s.startsWith('@/')?load(resolve(s.slice(2))+'.ts'):s.startsWith('.')?load(resolve(dirname(file),s)+'.ts'):require(s);m._compile(ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file);return m.exports;}
const dir=await mkdtemp(join(tmpdir(),'r24-ui-'));process.env.LEARNING_WRITE_LOCK_DIR=dir;
const {reflectionService}=load('lib/dojo/reflection/service.ts'),{fileReflectionRepository}=load('lib/dojo/reflection/store.ts'),{REFLECTION_TOOLS}=load('lib/dojo/reflection/templates.ts');
const {emptyDailyRecord,emptyWeeklyBoard,taipeiTodayISO,mondayOf}=load('lib/dojo/formal.ts');
let daily=emptyDailyRecord(taipeiTodayISO()),dailyWrites=0,holdDaily=false,releaseDaily=null,dailyStarted=null,failCreationAfterCommit=false;
daily.evening.depth='deep';daily.evening.disposition='journal';daily.evening.highlight='來源片段';
const svc=reflectionService({owner:'synthetic-ui-owner',repository:fileReflectionRepository(),source:async s=>{assert.equal(s.id,'daily-fixture');assert.equal(s.revision,daily.updatedAt);assert.ok(daily.evening[s.field].includes(s.excerpt));return s}});
const server=await isolatedServer(3034,'r24-ui-isolated');let browser;const external=[],errors=[];
let holdSave=false,releaseSave=null,saveStarted=null;
try {
 browser=await require('playwright').chromium.launch({headless:true,args:['--no-sandbox']});
 for(const width of [375,390,430]){
  const context=await browser.newContext({viewport:{width,height:844},isMobile:true,hasTouch:true});
  await context.addCookies([{name:'dsc_access_key',value:'r24-ui-isolated',url:server.base}]);
  await context.route('**/*',async route=>{
   const req=route.request(),u=new URL(req.url());if(u.origin!==server.base){external.push(u.origin);return route.abort()}
   if(!u.pathname.startsWith('/api/'))return route.continue();let body={},status=200;
   try {
    if(u.pathname==='/api/dojo/reflections'){
     if(req.method()==='POST'){body={note:await svc.create(req.postDataJSON())};if(failCreationAfterCommit){status=503;body={error:'結果未確認，已保留寫入鎖'}}}
     else if(req.method()==='PATCH'){const b=req.postDataJSON();if(holdSave){saveStarted?.();await new Promise(resolve=>{releaseSave=resolve})}body={note:await svc.update(b.id,b.revision,b.patch)}}
     else if(u.searchParams.has('id'))body={note:await svc.get(u.searchParams.get('id'))};
     else if(u.searchParams.has('role'))body={role:null};else body={notes:await svc.list()};
    }else if(u.pathname==='/api/dojo/daily'){
     if(req.method()==='PUT'){if(holdDaily){dailyStarted?.();await new Promise(resolve=>{releaseDaily=resolve})}daily={...req.postDataJSON().record,updatedAt:'v'+(++dailyWrites)}}
     body={record:daily,id:'daily-fixture',persisted:true};
    }else if(u.pathname==='/api/dojo/bingo')body={board:emptyWeeklyBoard(mondayOf(daily.date))};
    else if(u.pathname==='/api/dojo/continuations')body={cards:[]};
    else if(u.pathname==='/api/dojo/entries')body={entries:[]};else{status=503;body={error:'隔離測試未提供此服務'}}
   }catch(e){status=e.status??503;body={error:e.message}}
   return route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(server.base+'/practice/emotion');
  for(const tool of REFLECTION_TOOLS){
   await page.locator('#reflection-tool').selectOption(tool.id);await page.getByRole('button',{name:'開始新的整理',exact:true}).click();
   await page.locator('[id="'+tool.questions[0].id+'"]').waitFor();
   await page.getByRole('radio',{name:'深入',exact:true}).check();
   const last=tool.questions.at(-1).id,text='仍然難過，也可以完成私人整理。longEnglishText'.repeat(12);
   await page.locator('[id="'+last+'"]').fill(text);
   await page.getByRole('radio',{name:'輕',exact:true}).check();assert.equal(await page.locator('[id="'+last+'"]').count(),tool.modes.light.includes(last)?1:0);
   if(width===375&&tool===REFLECTION_TOOLS[0]){
    holdSave=true;const started=new Promise(resolve=>{saveStarted=resolve});await page.getByRole('button',{name:'保存草稿',exact:true}).click();await started;
    try{assert.equal(await page.locator('#reflection-title').isDisabled(),true,'editing during in-flight save can lose typed content');}finally{holdSave=false;releaseSave?.()}
   }else await page.getByRole('button',{name:'保存草稿',exact:true}).click();
   await page.getByRole('status').filter({hasText:'已保存草稿'}).waitFor();
   await page.reload();await page.locator('#reflection-title').waitFor();await page.getByRole('radio',{name:'深入',exact:true}).check();assert.equal(await page.locator('[id="'+last+'"]').inputValue(),text);
   await page.getByRole('button',{name:'完成這次整理',exact:true}).click();await page.getByRole('status').filter({hasText:'完成這次私人整理'}).waitFor();
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'mobile overflow '+width+' '+tool.id);
  }
  await page.goto(server.base+'/practice/atlas');await page.getByText('凝光 · 先回到此刻',{exact:true}).waitFor();
  await page.getByText('凝光的說明與比較',{exact:true}).click();assert.ok(await page.getByText('原始定義：',{exact:true}).first().isVisible());
  if(width===375){
   await page.goto(server.base+'/');const field=page.locator('#evening-highlight');await field.waitFor();
   await field.evaluate(el=>el.setSelectionRange(0,el.value.length));holdDaily=true;const started=new Promise(resolve=>{dailyStarted=resolve});
   await field.locator('..').getByRole('button',{name:'帶到心・情繼續整理',exact:true}).click();await started;
   try{assert.equal(await field.isDisabled(),true,'editing during handoff preparation loses the current daily draft')}finally{holdDaily=false;releaseDaily?.()}
   await page.getByRole('button',{name:'先存為待修習',exact:true}).first().waitFor();await field.fill('來源片段 加上準備後的新文字');
   await page.getByRole('button',{name:'直接開啟整理',exact:true}).first().click();await page.waitForURL(u=>u.pathname==='/practice/emotion');
   assert.equal(daily.evening.highlight,'來源片段 加上準備後的新文字','navigation must save edits made after preparation');
   await page.goto(server.base+'/');await field.waitFor();await field.evaluate(el=>el.setSelectionRange(0,4));
   await field.locator('..').getByRole('button',{name:'帶到心・情繼續整理',exact:true}).click();
   failCreationAfterCommit=true;await page.getByRole('button',{name:'先存為待修習',exact:true}).first().click();
   const inspect=page.getByRole('button',{name:'唯讀核對這次建立結果',exact:true});await inspect.waitFor();
   await field.fill('尚未保存的新文字');const before=dailyWrites;
   page.once('dialog',d=>d.dismiss());await inspect.click();assert.equal(await field.inputValue(),'尚未保存的新文字');
   page.once('dialog',d=>d.accept());await inspect.click();await page.waitForURL(u=>u.pathname==='/practice/emotion');assert.equal(dailyWrites,before,'read-only recovery must not attempt daily writes');failCreationAfterCommit=false;
  }
  await context.close();
 }
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);console.log('PASS reflection mobile 375/390/430: all six tools, hidden answers, draft/reload/completion, long text, codex, no external requests');
} finally {await browser?.close();server.stop();await rm(dir,{recursive:true,force:true});delete process.env.LEARNING_WRITE_LOCK_DIR;}
