import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const m={exports:{}};
new Function('require','module','exports',ts.transpileModule(readFileSync('lib/dojo/contextualAdd.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(require,m,m.exports);
const add=m.exports.contextualAdd;
assert.deepEqual(add('/practice',''),{type:'record',space:'practice',kind:'修習'});
assert.deepEqual(add('/dao/knowledge',''),{type:'record',space:'dao',kind:'入藏'});
assert.deepEqual(add('/practice/learning','?learningItem=x%26foreign%3Dy'),{type:'link',href:'/practice/records?new=1&learningItem=x%26foreign%3Dy'});
assert.deepEqual(add('/reading/books/book',''),{type:'link',href:'/add?mode=reading'});
assert.deepEqual(add('/practice-foreign','?learningItem=x'),{type:'link',href:'/add'});
assert.deepEqual(add('/',''),{type:'link',href:'/add'});
console.log('PASS contextual add: realm boundaries, primary item encoding, reading, generic preservation');

// Actual React markup with isolated navigation/store boundaries. No browser or backend claim.
const React=require('react'),{renderToStaticMarkup:render}=require('react-dom/server');
const {resolve,dirname}=require('node:path'),{existsSync}=require('node:fs');
let query='',testPath='/practice';const navigationCalls=[],shellButtons=[],quickCalls=[];const modules=new Map();let recordSeeds=null,recordSeedIndex=0;
function load(filename){
 const path=resolve(filename);if(modules.has(path))return modules.get(path).exports;
 const mod={exports:{}};modules.set(path,mod);
 function localRequire(id){
  if(id==='react' && path.endsWith('/LearningRecordWorkspace.tsx') && recordSeeds)return {...React,useState:initial=>React.useState(recordSeeds[recordSeedIndex++] ?? initial)};
  if(id==='next/navigation')return {useRouter:()=>({replace(x){navigationCalls.push(x)},push(x){navigationCalls.push(x)}}),useSearchParams:()=>new URLSearchParams(query),usePathname:()=>testPath};
  if(id==='@/lib/dojo/backstack')return {useBackStack:()=>({depth:()=>0}),useBackableState(){}};
  if(id==='react/jsx-runtime' && path.endsWith('/DojoShell.tsx')){const runtime=require(id);const capture=fn=>(type,props,key)=>{if(type==='button')shellButtons.push(props);return fn(type,props,key)};return {...runtime,jsx:capture(runtime.jsx),jsxs:capture(runtime.jsxs)};}
  if(id==='next/link')return {__esModule:true,default:({children,onNavigate,...props})=>React.createElement('a',props,children)};
  if(id==='@/lib/dojo/store')return {useDojo:()=>({entries:[],entriesLoading:false,entriesError:'',openQuickAdd(options){quickCalls.push(options)}})};
  if(id==='@/lib/dojo/formal')return {taipeiTodayISO:()=>'2026-10-23'};
  if(id==='@/app/components/ForageCaptureForm')return {CaptureForm:()=>React.createElement('div',{'data-capture':true},'capture fixture')};
  if(id==='@/app/components/ReadingQuickCapture')return {__esModule:true,default:()=>React.createElement('div',{'data-reading':true},'reading fixture')};
  if(id.startsWith('.')||id.startsWith('@/')){
    const target=id.startsWith('@/')?resolve(id.slice(2)):resolve(dirname(path),id);
    const f=[target,target+'.tsx',target+'.ts'].find(x=>existsSync(x));if(!f)throw Error(target);
    return load(f);
  }
  return require(id);
 }
 const compiled=ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 new Function('require','module','exports',compiled)(localRequire,mod,mod.exports);return mod.exports;
}
const Recent=load('app/components/PracticeRecentRecords.tsx').default;
let html=render(React.createElement(Recent,{records:[],ready:true,error:''}));
assert.match(html,/practice-panel practice-recent-records/);assert.match(html,/這裡還沒有學習紀錄/);
assert.match(html,/<a[^>]*class="primary practice-record-create"/);assert.match(html,/<details[^>]*practice-event-details/);
assert.doesNotMatch(html,/<details[^>]*practice-event-details[^>]*\sopen/);assert.doesNotMatch(html,/activityLog|投影/);
html=render(React.createElement(Recent,{records:[],ready:true,error:'保存資料讀取失敗'}));
assert.match(html,/role="alert"/);assert.doesNotMatch(html,/這裡還沒有學習紀錄/);
html=render(React.createElement(Recent,{records:[],ready:false,error:''}));assert.match(html,/role="status"/);assert.doesNotMatch(html,/這裡還沒有學習紀錄/);
const record={id:'stable-id',title:'<script>bad</script>',whatIDid:'長文'.repeat(2000),practicedOn:'2026-10-20',status:'draft'};
html=render(React.createElement(Recent,{records:[record],ready:true,error:'',itemId:'item&owner=x'}));
assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>/);assert.match(html,/草稿/);assert.match(html,/record=stable-id/);assert.match(html,/learningItem=item%26owner%3Dx/);assert.match(html,/長文長文/);
const Home=load('app/components/PracticeHome.tsx').default;
html=render(React.createElement(Home));assert(html.indexOf('practice-realms-title')<html.indexOf('practice-tools-title'));assert(html.indexOf('practice-tools-title')<html.indexOf('practice-recent-records'));
assert.doesNotMatch(html,/目前沒有未完成的自譯|最近真實紀錄|activityLog/);
const Dao=load('app/dao/page.tsx').default;html=render(React.createElement(Dao));assert.match(html,/dao-entry/);assert.match(html,/dao-empty/);assert.match(html,/practice-entry-icon/);assert.match(html,/href="\/dao\/knowledge"/);
const Add=load('app/components/AddWorkspace.tsx').default;
html=render(React.createElement(Add,{initialMode:'reading'}));assert.match(html,/<h1>閱讀摘錄<\/h1>/);assert.match(html,/data-reading="true"/);assert.doesNotMatch(html,/capture fixture/);
html=render(React.createElement(Add,{initialMode:'capture'}));assert.match(html,/<h1>擷取<\/h1>/);assert.match(html,/data-capture="true"/);
console.log('PASS real React SSR: recent empty/loading/failure/long/stable-ID/escaped state, homepage hierarchy, Dao entries, initial add modes');
const postcss=require('postcss'),css=postcss.parse(readFileSync('app/practice-dao.css','utf8'));
let background=false,linkButton=false,solidNav=false;
css.walkRules(r=>{if(r.selector==='.dojo.practice-dao-shell')r.walkDecls('--bg',d=>background=d.value==='#f2fbf8');if(r.selector.includes('a.primary'))r.walkDecls('display',d=>linkButton=d.value==='flex');if(r.selector.endsWith('.nav.consistent-nav'))r.walkDecls('background',d=>solidNav=d.value==='#fff')});
assert(background,'the actual --bg consumed by .app is overridden');assert(linkButton,'anchor CTA has a layout box');assert(solidNav,'navigation uses opaque background');
console.log('PASS CSS parses and root-cause guards: actual background token, anchor layout, opaque nav (not browser layout tests)');

const canonical=m.exports.newRecordItemId;
const graph=[{id:'uuid-stable',kind:'item',status:'active',legacyKey:'english'},{id:'archived',kind:'item',status:'archived',legacyKey:'old'}];
assert.equal(canonical(graph,'english'),'uuid-stable');assert.equal(canonical(graph,'uuid-stable'),'uuid-stable');assert.equal(canonical(graph,'foreign'),null);assert.equal(canonical(graph,'old'),null);assert.equal(canonical(graph,''),'');
console.log('PASS canonical new-record context: legacy alias, stable ID, invalid/archived rejection, no context');

// Reproduce a retained editor during same-mounted URL transition to an invalid item.
query='new=1&learningItem=archived';
recordSeeds=[graph,true,[],{id:'previous-record',whatIDid:'previous body',learningItemIds:['archived'],primaryLearningItemId:'archived',status:'draft'},'',true,JSON.stringify(['previous-record','archived']),'',false,'',null,'',''];
modules.delete(resolve('app/components/LearningRecordWorkspace.tsx'));
const Editor=load('app/components/LearningRecordWorkspace.tsx').default;
html=render(React.createElement(Editor));
assert.doesNotMatch(html,/<form/,'invalid new context must never expose retained old editor/save actions');
console.log('PASS same-mounted invalid new-item context hides previous-record editor');

query='new=1&learningItem=uuid-stable';recordSeedIndex=0;
html=render(React.createElement(Editor));assert.doesNotMatch(html,/<form/,'valid but newly selected context must not show previous editor before initialization');
query='record=previous-record&learningItem=archived';recordSeedIndex=0;
html=render(React.createElement(Editor));assert.match(html,/<form/,'loaded existing archived-associated record remains editable without resetting data');
console.log('PASS context identity: pending valid transition hides previous editor; existing archived record stays editable');

html=render(React.createElement(Recent,{records:[record],ready:true,error:'項目資料讀取失敗'}));assert.match(html,/role="alert"/);assert.match(html,/record=stable-id/);assert.doesNotMatch(html,/這裡還沒有學習紀錄/);
console.log('PASS available history remains visible alongside metadata/read error');

testPath='/add';query='mode=reading';
const Shell=load('app/components/DojoShell.tsx').default;render(React.createElement(Shell,null,React.createElement('p',null,'editor')));
let leaveEvents=0;globalThis.window={dispatchEvent(){leaveEvents++;return true},location:{search:'?mode=reading'}};
shellButtons.find(b=>b['data-nav']==='add').onClick();assert.equal(navigationCalls.length,0);assert.equal(leaveEvents,0);delete globalThis.window;
console.log('PASS actual shell handler: active Add preserves its existing mode and unsaved editor without navigation');

for(const [path,search,expected] of [
 ['/practice','','practice'],['/dao/knowledge','','dao'],['/practice/learning','?learningItem=uuid-stable','/practice/records?new=1&learningItem=uuid-stable'],['/reading','','/add?mode=reading']
]){
 testPath=path;shellButtons.length=0;navigationCalls.length=0;quickCalls.length=0;
 render(React.createElement(Shell,null,React.createElement('p',null,'content')));
 globalThis.window={dispatchEvent:()=>true,location:{search}};shellButtons.find(b=>b['data-nav']==='add').onClick();
 if(expected.startsWith('/'))assert.deepEqual(navigationCalls,[expected]);else assert.equal(quickCalls[0].presetSpace,expected);
 navigationCalls.length=0;quickCalls.length=0;globalThis.window.dispatchEvent=()=>false;
 shellButtons.find(b=>b['data-nav']==='add').onClick();assert.equal(navigationCalls.length,0);assert.equal(quickCalls.length,0);
}
delete globalThis.window;
console.log('PASS actual shell handlers: practice/Dao editors, selected-item/reading routes, cancelled leave causes no navigation or modal');
testPath='/add';shellButtons.length=0;navigationCalls.length=0;
render(React.createElement(Shell,null,React.createElement('p',null,'editor')));
globalThis.window={dispatchEvent:()=>true,location:{search:'?mode=reading'}};
shellButtons.find(b=>b['aria-label']==='返回上一頁').onClick();assert.deepEqual(navigationCalls,['/reading']);delete globalThis.window;
console.log('PASS actual Back handler: direct reading-add URL without prior history returns to reading');
for(const [path,search,expected] of [
 ['/practice/manage','?learningItem=drawing%26stable','/practice/learning?learningItem=drawing%26stable'],
 ['/practice/records','?new=1&learningItem=drawing-stable','/practice/learning?learningItem=drawing-stable'],
 ['/practice/records','','/practice/learning'],
 ['/practice/manage','?learningItem=x&returnTo=%2Fpractice%2Flearning%3FlearningItem%3Dy%26tab%3Dtools','/practice/learning?learningItem=y&tab=tools']
]){
 testPath=path;shellButtons.length=0;navigationCalls.length=0;
 render(React.createElement(Shell,null,React.createElement('p',null,'content')));
 globalThis.window={dispatchEvent:()=>true,location:{search}};
 shellButtons.find(b=>b.className==='backbtn').onClick();assert.deepEqual(navigationCalls,[expected]);
}
delete globalThis.window;
console.log('PASS single shell return preserves selected learning item, explicit source tab, and learning index');
