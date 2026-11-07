/** Read-only reproduction of feedback against an exact delivered HTML. No app fixes. */
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import { loader } from './weaving-test-harness.mjs';

const html=process.env.STUDIO_AUDIT_HTML||process.argv[2];
if(!html)throw Error('Supply the delivered HTML path as the first argument');
const out=resolve(process.env.STUDIO_AUDIT_OUTPUT||'/tmp/studio-b-feedback-audit');
await mkdir(out,{recursive:true});
const bytes=await readFile(html),text=bytes.toString(),load=loader();
const model=load('lib/dojo/creativeStudio/model.ts'),collab=load('lib/dojo/creativeStudio/collaboration.ts'),reply=load('lib/dojo/creativeStudio/reply.ts'),tasks=load('lib/dojo/creativeStudio/tasks.ts');
const result={date:'2026-11-05',source:{bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),code:text.match(/name="lumen-preview-source" content="([^"]+)"/)?.[1]},pure:{},realms:[],browserErrors:[],httpRequests:[],productionModified:false};
const sample='散步時，我留意到一個平常忽略的細節。我想先留下這個觀察，之後再回來整理。';
const raw='先把觀察留下\n\n有些想法還沒有完整答案，也可以先寫下來，給下一次理解一個起點。';
const s=model.blankStudio();s.module='B';s.source.selected=sample;s.source.allowAI=true;s.b=raw;
result.pure.plainReply={sections:Object.keys(reply.previewReply(s).sections),warnings:reply.previewReply(s).warnings,manuscript:s.collaboration.manuscript,canAdopt:false};
assert.throws(()=>collab.manuscriptForAdoption(s,'B'),/候選主文/);
result.pure.headingVariants=['## 候選主文','## 主文調整版','第三部分：主文調整版'].map(h=>({heading:h,recognizedMain:!!collab.parseReply(h+'\n'+raw)['候選主文']}));
const pIG=collab.instructionsForSource({...s,platform:'IG'}),pThreads=collab.instructionsForSource({...s,platform:'Threads'}),pPlurk=collab.instructionsForSource({...s,platform:'噗浪'});
result.pure.platforms={IGequalsThreads:pIG===pThreads,ThreadsEqualsPlurk:pThreads===pPlurk,selectedPlatformAppearsInInstruction:pIG.includes('目標平台：IG'),sameTaskSignature:tasks.taskSignature({...s,platform:'IG'},{text:sample,versionId:'original'},pIG)===tasks.taskSignature({...s,platform:'Threads'},{text:sample,versionId:'original'},pThreads),storageType:typeof s.platform};
assert.equal(pIG,pThreads);assert.equal(pThreads,pPlurk);
result.pure.research={count:s.collaboration.research.length,text:s.research,use:s.researchUse,searchStatePresent:'researchStatus' in s.collaboration,explicitActiveResearchTask:/主動提出有幫助的研究|查找研究|檢索文獻|找出3-5個可用於主文的理論候選/.test(pIG)};
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try{
 for(const realm of ['weaving','liaojie']){
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const page=await context.newPage();page.setDefaultTimeout(15000);
  page.on('pageerror',e=>result.browserErrors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))result.httpRequests.push(r.url())});
  const button=name=>page.getByRole('button',{name,exact:true}),field=name=>page.getByRole('textbox',{name,exact:true});
  await page.goto(pathToFileURL(resolve(html)).href+'#/'+realm);
  await button('帶草稿進 B').click();await field('交給 B 的草稿／素材').fill(sample);
  const workId=page.url().split('/').at(-1).split('?')[0],r={realm,layout:[],paste:{},platforms:{},structuredRecovery:{}};
  for(const width of [320,390,430]){
   await page.setViewportSize({width,height:844});
   const rects=await page.evaluate(()=>{
    const group=label=>{const g=document.querySelector('.studio-actions[aria-label="'+label+'"]'),style=getComputedStyle(g);return{justify:style.justifyContent,rowGap:style.rowGap,buttons:[...g.querySelectorAll('button')].map(b=>{const r=b.getBoundingClientRect();return{label:b.textContent,x:r.x,y:r.y+scrollY,width:r.width,height:r.height}})}};
    const kind=group('內容類型'),platform=group('目標平台');return{kind,platform,betweenGroups:platform.buttons[0].y-Math.max(...kind.buttons.map(b=>b.y+b.height)),overflow:document.documentElement.scrollWidth>innerWidth+1};
   });r.layout.push({width,...rects});
   if(width===390){await page.locator('.studio-actions[aria-label="內容類型"]').scrollIntoViewIfNeeded();await page.screenshot({path:join(out,realm+'-controls.png')});}
  }
  await page.setViewportSize({width:390,height:844});
  await field('B 完整 AI 回覆（含研究與編輯說明）').fill(raw);
  r.paste={rawLength:(await field('B 完整 AI 回覆（含研究與編輯說明）').inputValue()).length,candidateLength:(await field('候選主文（只放文章，採用才更新正文）').inputValue()).length,adoptDisabled:await button('採用 B 為可編寫稿').isDisabled(),visibleDisabledReason:await button('採用 B 為可編寫稿').getAttribute('aria-describedby')};
  assert.equal(r.paste.adoptDisabled,true);
  await button('辨識回覆段落，先預覽').click();await page.getByText('沒有辨識到固定段落標題；完整回覆仍可保存，不會自動改動主稿。',{exact:true}).waitFor();
  await button('確認分欄，保留完整回覆').click();
  r.paste.disabledAfterPlainParse=await button('採用 B 為可編寫稿').isDisabled();assert.equal(r.paste.disabledAfterPlainParse,true);
  const positions=await Promise.all(['B 完整 AI 回覆（含研究與編輯說明）','候選主文（只放文章，採用才更新正文）'].map(async label=>({label,y:await field(label).evaluate(el=>el.closest('label').getBoundingClientRect().y+scrollY)})));
  r.paste.fieldPositions=positions;
  await page.getByRole('checkbox',{name:'本次選摘可交給外部 AI／製作工具',exact:true}).check();
  const prompts=[];
  for(const platform of ['IG','Threads']){
   await button(platform).click();await button('複製 B 協作指令').click();await page.getByRole('status').filter({hasText:'已複製本次'}).waitFor();
   const saved=await page.evaluate(id=>window.__PREVIEW__.snapshot().works.find(w=>w.id===id),workId);
   prompts.push(saved.studio.collaboration.tasks.at(-1).prompt);
  }
  r.platforms={IGselectedAfterThreads:await button('IG').getAttribute('aria-pressed'),ThreadsSelected:await button('Threads').getAttribute('aria-pressed'),savedValue:await page.evaluate(id=>window.__PREVIEW__.snapshot().works.find(w=>w.id===id).studio.platform,workId),promptHashes:prompts.map(p=>createHash('sha256').update(p).digest('hex')),generatedPromptsIdentical:prompts[0]===prompts[1],explicitResearchSearchInGeneratedPrompt:/主動提出有幫助的研究|查找研究|檢索文獻|找出3-5個可用於主文的理論候選/.test(prompts[0])};
  assert.equal(r.platforms.generatedPromptsIdentical,true);assert.equal(r.platforms.IGselectedAfterThreads,'false');
  const structured='## 候選主文\n'+raw+'\n## 編輯說明\n保留作者已提供的意思。';
  await field('B 完整 AI 回覆（含研究與編輯說明）').fill(structured);
  r.structuredRecovery.disabledBeforeSplit=await button('採用 B 為可編寫稿').isDisabled();
  await button('辨識回覆段落，先預覽').click();await button('確認分欄，保留完整回覆').click();
  r.structuredRecovery.enabledAfterSplit=await button('採用 B 為可編寫稿').isEnabled();assert.equal(r.structuredRecovery.enabledAfterSplit,true);
  await button('採用 B 為可編寫稿').click();await page.getByRole('status').filter({hasText:'已採用候選主文'}).waitFor();
  r.structuredRecovery.bodyMatches=await field('目前可編寫的作品正文').inputValue()===raw;assert.equal(r.structuredRecovery.bodyMatches,true);
  result.realms.push(r);await context.close();console.log('Reproduced B feedback:',realm);
 }
}finally{await browser.close();await writeFile(join(out,'results.json'),JSON.stringify(result,null,2)+'\n');}
assert.deepEqual(result.browserErrors,[]);assert.deepEqual(result.httpRequests,[]);
console.log('Audit evidence:',join(out,'results.json'));
