/** Native component geometry QA. Synthetic records; no external API/network access. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,readdirSync,mkdirSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import vm from 'node:vm';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {chromium} from 'playwright';
import {loader} from './weaving-test-harness.mjs';
const out=resolve('.superpowers/ui-alignment/after');mkdirSync(out,{recursive:true});
let route='/weaving',editorState=-1,desiredStep=null,desiredVersion='',injectSources=false,sourceItemsNext=false;
const stubs={react:{...React,useState(initial){
 if(initial?.work?.id==='alignment-work'&&Array.isArray(initial?.completions))editorState=0;
 else if(editorState>=0)editorState++;
 let value=editorState===1&&desiredStep!==null?desiredStep:editorState===5&&desiredVersion?desiredVersion:initial;
 if(injectSources&&initial==='reading_note')sourceItemsNext=true;else if(sourceItemsNext&&Array.isArray(initial)){value=[sourceCandidate];sourceItemsNext=false;}
 return React.useState(value);
}},'next/navigation':{usePathname:()=>route,useRouter:()=>({push(){},back(){},replace(){},refresh(){}}),useSearchParams:()=>new URLSearchParams(),useParams:()=>({})}};
function cssStubs(dir){for(const f of readdirSync(dir,{withFileTypes:true})){const p=dir+'/'+f.name;if(f.isDirectory())cssStubs(p);else if(/\.tsx?$/.test(f.name))for(const x of readFileSync(p,'utf8').matchAll(/import\s+['"]([^'"]+\.css)['"]/g))stubs[x[1]]={};}}cssStubs('app');
const load=loader(stubs),h=React.createElement;
const Shell=load('app/components/DojoShell.tsx').default,Dojo=load('lib/dojo/store.tsx').DojoProvider,Back=load('lib/dojo/backstack.tsx').BackStackProvider,Leave=load('app/components/weaving/LeaveDialog.tsx').default;
const Editor=load('app/components/creativeStudio/StudioWorkspace.tsx').Editor,Service=load('app/components/creativeStudio/ServiceWorkspace.tsx').EditService,Deck=load('app/components/illustrated/IllustratedWorkspace.tsx').DeckEditor,Legacy=load('app/components/LiaojiePublicationWorkbench.tsx').LegacyPublicationEditor;
const gm=load('lib/dojo/illustrated/model.ts'),sm=load('lib/dojo/creativeStudio/model.ts');
const cssPaths=new Set();
for(const p of ['weaving/works/[id]','weaving/illustrated','liaojie/services','liaojie/workbench','liaojie/tools']){
 const file='.next/server/app/'+p+'/page_client-reference-manifest.js';assert.ok(existsSync(file),'build the current app before layout QA');const ctx={};vm.runInNewContext(readFileSync(file,'utf8'),ctx);for(const m of Object.values(ctx.__RSC_MANIFEST))for(const x of Object.values(m.entryCSSFiles).flat())cssPaths.add(typeof x==='string'?x:x.path);
}
let css=[...cssPaths].map(x=>readFileSync('.next/'+x,'utf8')).join('\n');if(process.env.UI_CSS_BASELINE){const old=readFileSync(process.env.UI_CSS_BASELINE,'utf8').match(/<style>([\s\S]*?)<\/style>/);assert.ok(old,'baseline must contain actual rendered CSS');css=old[1];}
const sourceCandidate={sourceType:'reading_note',sourceId:'11111111-1111-4111-8111-111111111111',sourceVersion:'v1',contentKind:'understanding',label:'閱讀筆記｜數字之外，我們如何看見持續投入的意義',locator:'第二章・自己的理解',text:'這是一份可供探索的閱讀筆記，先保留原文與理解，再選取想要引用的片段。'};
const studio=sm.blankStudio();studio.source.raw='【隔離資料】放了十五刀，這筆錢源自客人給的小費。原稿與校訂各自保存。';studio.source.selected=studio.source.raw;studio.source.allowPublic=true;studio.body='數字沒有達標的時候，我會覺得努力白費，卻也想慢慢找回單純做事的快樂。\n\n這段文字保留感受，沒有替作者補造事件或結論。';studio.b=studio.body;studio.d='從這份完成的作品，繼續思考如何看待努力。';studio.module='B';
const work=load('lib/dojo/weavingShuttle.ts').createWorkDraft({id:'alignment-work',title:'數字沒有達標的時候，我們要如何看待已經付出的努力與時間？',shuttleId:'',coreVersionId:'unassigned',format:'text',studio});
const completion={id:'alignment-completion',workId:work.id,title:work.title,text:studio.body,createdAt:'2026-10-30T03:00:00Z',coreVersionId:'unassigned',state:'confirmed',studioSnapshot:studio};
const bundle={work,completions:[completion],previewDigest:'alignment-preview'};
const service={...load('lib/dojo/creativeStudio/serviceModel.ts').blankService('新月聚焦｜留一點空間給正在改變的自己'),id:'alignment-service',capacity:4,brief:'集體訊息與每人的解讀分開保存。',deadline:'2026-11-01T10:00:00Z',ritual:'2026-11-02T10:00:00Z',delivery:'2026-11-03T10:00:00Z',participants:[{id:'person-a',name:'隔離參加者 A',question:'',reading:'',zone:'Asia/Taipei',reviewed:false,delivered:false}]};
const page={...gm.newPage('alignment-page'),title:'數字沒有達標，努力就白費了嗎？',body:'我想慢慢找回，單純做事的快樂。'};
const deck={deck:{id:'alignment-deck',revision:1,completionId:completion.id},version:{id:'alignment-version',number:1,title:work.title,caption:'這次選用的配文。',pages:[page]},versions:[],outputs:[]};
const project={id:'alignment-publication',revision:1,brandAngle:'生活觀察',audience:'',platform:'threads',title:work.title,coverCopy:'',summary:studio.body,callToAction:'',themeGroup:'',scheduledOn:null,status:'received',publishedUrl:'',responseNote:'',nextStep:''};
const wm=load('lib/dojo/weavingShuttle.ts'),legacyShuttle=wm.createShuttleDraft({id:'legacy-alignment-shuttle',title:'保留的正式作品',sourceType:'manual',sourceSnapshot:'隔離來源',coreStatement:'保留不同理解與來源'}),legacyWork=wm.createWorkDraft({id:'legacy-alignment-work',title:'保留的文字作品',shuttleId:legacyShuttle.id,coreVersionId:legacyShuttle.coreVersions[0].id,format:'text'}),Text=load('app/components/weaving/TextWorkspace.tsx').default,legacyWorkflow=legacyWork.textWorkflow??load('lib/dojo/weavingWorkflow/model.ts').workflowFromLegacy(legacyWork);
const cases=[
 {name:'weaving-home',path:'/weaving',node:()=>h(load('app/weaving/page.tsx').default)},
 {name:'liaojie-home',path:'/liaojie',node:()=>h(load('app/liaojie/page.tsx').default)},
 ...[{name:'source',step:0},{name:'writing-a',step:2,module:'A'},{name:'writing-c',step:2,module:'C'},{name:'writing-b',step:2},{name:'writing-d',step:2,module:'D'},{name:'review',step:3},{name:'handoff',step:4}].map(x=>({name:'weaving-'+x.name,path:'/weaving/works/'+work.id,step:x.step,version:completion.id,node:()=>h(Editor,{initial:{...bundle,work:{...work,studio:{...studio,module:x.module||'B'}}}})})),
 {name:'retained-sources',source:true,path:'/weaving/legacy',node:()=>h('section',{className:'screen wf-workspace wf-clarity-workspace'},h(Text,{work:{...legacyWork,textWorkflow:{...legacyWorkflow,currentStep:'sources'}},shuttle:legacyShuttle,onSaved(){},onConverted(){}}))},
 {name:'retained-templates',path:'/weaving/legacy',node:()=>h('section',{className:'screen wf-workspace wf-clarity-workspace'},h(Text,{work:{...legacyWork,textWorkflow:{...legacyWorkflow,currentStep:'concept'}},shuttle:legacyShuttle,onSaved(){},onConverted(){}}))},
 {name:'graphic-editor',path:'/weaving/illustrated',node:()=>h('section',{className:'screen illustrated-workspace'},h(Deck,{initial:deck,onBundle(){}}))},
 {name:'owner-service',path:'/liaojie/services',node:()=>h('section',{className:'screen studio'},h('h1',null,'活動與私人交付'),h(Service,{initial:service,onSaved(){}}))},
 {name:'original-tools',path:'/liaojie/tools',node:()=>h(load('app/liaojie/tools/page.tsx').default)},
 {name:'publication-editor',path:'/liaojie/workbench',node:()=>h('section',{className:'screen wf-publication'},h('h1',null,'整理發布作品'),h(Legacy,{project,onUpdated(){}}))}
];
function render(c){route=c.path;injectSources=!!c.source;sourceItemsNext=false;editorState=-1;desiredStep=c.step??null;desiredVersion=c.version||'';return '<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style></head><body>'+renderToStaticMarkup(h(Dojo,null,h(Back,null,h(Shell,null,h(Leave,null,c.node())))))+'</body></html>';}
const browser=await chromium.launch({headless:true,executablePath:process.env.STUDIO_BROWSER_PATH,args:['--no-sandbox']}),results=[],failures=[];
try{
 const p=await browser.newPage();await p.route('http**/*',r=>r.abort());
 for(const c of cases.filter(c=>!process.env.UI_CASE||c.name===process.env.UI_CASE)){const file=out+'/'+c.name+'.html';writeFileSync(file,render(c));
 for(const [width,height,mode] of [[320,844],[375,844],[390,844],[430,844],[1024,768],[844,390],[390,844,'large-text']]){
  await p.setViewportSize({width,height});const rendered=mode?out+'/'+c.name+'-'+mode+'.html':file;if(mode)writeFileSync(rendered,readFileSync(file,'utf8').replace('</head>','<style>html{font-size:200%}</style></head>'));await p.goto('file://'+rendered);
  // Native disclosure behavior; no application state is manufactured in the browser.
  if(c.name==='graphic-editor')await p.locator('.graphic-controls summary').click();
  const metrics=await p.evaluate(()=>{
   const bounds=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}};
   const visible=e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(e).visibility!=='hidden'};
   const controls=[...document.querySelectorAll('#view button,#view summary,#view .button-link,#view .studio-tool-entry,#view input:not([type=checkbox]):not([type=radio]),#view select,#view textarea')].filter(visible);
   return {scroll:document.documentElement.scrollWidth,width:innerWidth,app:bounds(document.querySelector('.app')),tiny:controls.filter(e=>bounds(e).height<43.5).map(e=>({text:(e.textContent||e.getAttribute('aria-label')||e.tagName).trim().slice(0,30),...bounds(e)})),escaped:controls.filter(e=>bounds(e).x<-.5||bounds(e).x+bounds(e).width>innerWidth+.5).map(e=>e.tagName+':'+(e.getAttribute('aria-label')||e.textContent||'').slice(0,30)),smallFields:[...document.querySelectorAll('#view input:not([type=checkbox]):not([type=radio]):not([type=file]),#view select,#view textarea')].filter(visible).filter(e=>parseFloat(getComputedStyle(e).fontSize)<16).map(e=>e.tagName),active:[...document.querySelectorAll('.studio-steps .active,.wf-steps [aria-current=step]')].map(e=>getComputedStyle(e).backgroundColor),save:document.querySelector('.studio-save')?getComputedStyle(document.querySelector('.studio-save')).position:null,primaries:[...document.querySelectorAll('#view .primary')].filter(visible).map(e=>getComputedStyle(e).backgroundColor),formRows:[...document.querySelectorAll('.studio-form-grid,.graphic-controls fieldset')].flatMap(g=>{const fields=[...g.children].filter(e=>e.tagName==='LABEL').map(l=>l.querySelector('input,select')).filter(e=>e&&visible(e)),rows=[];let row=[],lastX=-Infinity;for(const e of fields){const r=bounds(e);if(row.length&&r.x<=lastX+.5){rows.push(row);row=[];}row.push(r.y);lastX=r.x;}if(row.length)rows.push(row);return rows;}),contentCards:[...document.querySelectorAll('.wf-source-list button,.wf-templates button')].filter(visible).map(e=>({width:bounds(e).width,children:[...e.children].filter(visible).map(x=>({tag:x.tagName,...bounds(x)}))})),retainedBar:document.querySelector('.wf-action-bar')?{...bounds(document.querySelector('.wf-action-bar')),position:getComputedStyle(document.querySelector('.wf-action-bar')).position}:null,stageLines:[...document.querySelectorAll('.wf-steps b,.studio-steps button>span')].filter(visible).map(e=>({height:bounds(e).height,line:parseFloat(getComputedStyle(e).lineHeight)})),nav:bounds(document.querySelector('.nav')),font:getComputedStyle(document.querySelector('#view')).fontFamily};
  });
  const errors=[];if(metrics.scroll>width+1)errors.push('horizontal overflow');if(metrics.tiny.length)errors.push('small hit area '+JSON.stringify(metrics.tiny));if(metrics.escaped.length)errors.push('control escapes viewport '+metrics.escaped.join(','));if(metrics.smallFields.length)errors.push('field text below 16px');if(width>=900&&metrics.app.width<900)errors.push('desktop shell still restricted to phone');if(metrics.active.some(x=>!['rgba(0, 0, 0, 0)','transparent'].includes(x)))errors.push('white current-step tile');if(height<=600&&metrics.save&&metrics.save!=='static')errors.push('low-height sticky save obscures content');
  if(metrics.formRows.some(row=>row.length>1&&Math.max(...row)-Math.min(...row)>1))errors.push('paired form inputs not aligned');
  if(metrics.contentCards.some(c=>c.children.some((x,i,a)=>i>0&&x.y<a[i-1].y+a[i-1].height-1)))errors.push('retained content card no longer stacks title/excerpt/action');
  if(metrics.retainedBar&&['fixed','sticky'].includes(metrics.retainedBar.position)&&metrics.retainedBar.y<metrics.nav.y+metrics.nav.height&&metrics.retainedBar.y+metrics.retainedBar.height>metrics.nav.y+1)errors.push('retained action bar overlaps global navigation');
  if(!mode&&metrics.stageLines.some(x=>x.height>x.line+1))errors.push('normal-size stage labels wrap from control padding');
  const expected=c.path.startsWith('/liaojie')?'rgb(69, 99, 143)':'rgb(139, 63, 104)';if(metrics.primaries.some(x=>x!==expected))errors.push('wrong realm action color '+metrics.primaries.join(','));
  await p.screenshot({path:out+'/'+c.name+'-'+width+'x'+height+(mode?'-'+mode:'')+'.png',fullPage:true});if(width===390&&height===844&&!mode)await p.screenshot({path:out+'/'+c.name+'-390-viewport.png'});results.push({name:c.name,width,height,mode:mode||'normal',metrics,errors});if(errors.length)failures.push(c.name+' '+width+'x'+height+': '+errors.join('; '));
 }
 }
 await p.emulateMedia({reducedMotion:'no-preference'});await p.setViewportSize({width:390,height:844});await p.goto('file://'+out+'/weaving-writing-b.html');const motionControl=p.locator('.studio-save button.primary');assert.ok((await motionControl.evaluate(e=>getComputedStyle(e).transitionDuration)).split(',').some(x=>parseFloat(x)>0),'normal controls should expose their actual transition');await p.emulateMedia({reducedMotion:'reduce'});assert.ok((await motionControl.evaluate(e=>getComputedStyle(e).transitionDuration)).split(',').every(x=>parseFloat(x)===0),'reduced motion must disable the actual button transition');
 writeFileSync(out+'/results.json',JSON.stringify({cases:results.length,passed:results.filter(x=>!x.errors.length).length,results,failures,note:'Actual production React components and compiled CSS. SSR hook fixtures select native editor screens; not hydrated API/save or physical Safari acceptance.'},null,2));
 console.log(`Native UI geometry: ${results.length-failures.length}/${results.length}; reduced motion passed`);if(failures.length)throw Error(failures.join('\n'));
}finally{await browser.close();}
