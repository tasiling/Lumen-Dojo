/** Exercise the new review boundary and compact default view with synthetic text. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {fixture} from './weaving-fixture.mjs';
import {proseJsonResearch} from './fixtures/studio-natural-b.mjs';
const f=await fixture(),m=f.load('lib/dojo/creativeStudio/model.ts'),reply=f.load('lib/dojo/creativeStudio/reply.ts');
const file=process.env.STUDIO_HTML_PATH,base=process.env.STUDIO_UI_URL||'http://127.0.0.1:4173';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']}),ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
await ctx.addInitScript(()=>{Object.defineProperty(navigator,'clipboard',{configurable:true,value:{write:async items=>{window.__copied=await(await items[0].getType('text/plain')).text();},writeText:async text=>{window.__copied=text;}}});});
const p=await ctx.newPage(),errors=[];p.setDefaultTimeout(20000);p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());
const go=path=>p.goto(file?'file://'+file+'#'+path:base+path),btn=name=>p.getByRole('button',{name,exact:true}),body=()=>p.getByRole('textbox',{name:'正在編輯的文章',exact:true});
const read=id=>p.evaluate(async id=>(await(await fetch('/api/dojo/creative-studio?id='+id)).json()).work,id);
let checks=0;const pass=n=>{checks++;console.log('PASS',n);};
try{for(const realm of ['weaving','liaojie']){
 await go('/'+realm);await p.getByRole('heading',{name:realm==='weaving'?'織光堂':'聊解室',exact:true}).waitFor();
 const s=m.blankStudio();s.module='B';s.source.selected='一段生活觀察。';s.source.allowAI=true;s.body='原本正在編輯的文章。';s.b=proseJsonResearch;Object.assign(s,reply.confirmBReply(s,reply.previewReply(s),{research:true,examples:true,candidates:true},'準備換用的文章。'));
 const w=await p.evaluate(async studio=>(await(await fetch('/api/dojo/creative-studio',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'create',operationId:crypto.randomUUID(),title:'易用性測試',studio})})).json()).work,s);
 await go('/'+realm+'/works/'+w.id+'?entry=write');
 await btn('選用這份文章來編輯').waitFor();assert.equal(await p.getByRole('button',{name:'選用這份文章來編輯',exact:true}).count(),1);
 await btn('選用這份文章來編輯').click();await p.getByRole('region',{name:'B 候選文章預覽',exact:true}).waitFor();assert.equal(await body().inputValue(),s.body);assert.equal((await read(w.id)).studio.body,s.body);await btn('關閉預覽').click();assert.equal(await body().inputValue(),s.body);pass(realm+' even an already reviewed article opens preview; cancel preserves the current body');
 await btn('選用這份文章來編輯').click();await btn('確認，替換編輯中的文章').click();await p.getByRole('status').filter({hasText:'已採用候選主文'}).waitFor();const after=await read(w.id);assert.equal(after.studio.body,'準備換用的文章。');assert.equal(after.studio.history.at(-1).text,s.body);assert.equal(after.studio.b,s.b);pass(realm+' explicit final confirmation replaces the body and keeps old text and raw reply');
 const later=p.locator('.studio-later-step');assert.equal(await later.count(),2);for(const el of await later.all())assert.equal(await el.evaluate(n=>n.open),false);
 assert.equal(await p.locator('.studio-work-state details').evaluate(el=>el.open),false);
 await btn('複製 B 寫作指令').click();const transfer=p.getByRole('region',{name:'寫作指令操作',exact:true});await transfer.getByRole('status').filter({hasText:'已複製'}).waitFor();assert.equal(await transfer.locator('details').evaluate(el=>el.open),false);await transfer.locator('summary').click();const copied=await transfer.getByRole('textbox',{name:'寫作指令（可手動複製）',exact:true}).inputValue();assert.equal(await p.evaluate(()=>window.__copied),copied);assert.match(copied,/準備換用的文章/);assert.equal((await read(w.id)).studio.body,after.studio.body);pass(realm+' secondary steps start collapsed; copying sends the current writing task without changing article text');
 for(const width of [320,390,430]){await p.setViewportSize({width,height:844});assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}
 await p.setViewportSize({width:390,height:844});await p.locator('.studio-modules').scrollIntoViewIfNeeded();await p.screenshot({path:'/tmp/usability-'+realm+'-'+(file?'html':'native')+'.png'});pass(realm+' compact view remains usable at phone widths');
 }assert.deepEqual(errors,[]);await fs.writeFile('/tmp/studio-usability-'+(file?'html':'native')+'-results.json',JSON.stringify({checks,errors},null,2));console.log(`PASS usability UI ${checks}/${checks}`);
}finally{await browser.close();await f.close();}
