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
let query='',testPath='/practice';const navigationCalls=[],shellButtons=[],quickCalls=[];const modules=new Map();let recordSeeds=null,recordSeedIndex=0,itemSeeds=null,itemSeedIndex=0;
function load(filename){
 const path=resolve(filename);if(modules.has(path))return modules.get(path).exports;
 const mod={exports:{}};modules.set(path,mod);
 function localRequire(id){
  if(id==='react' && path.endsWith('/PracticeLearning.tsx') && itemSeeds)return {...React,useState:initial=>React.useState(itemSeeds[itemSeedIndex++] ?? initial)};
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

const description='基本功練習 | Marc Brunet 20個練習\n來源：https://www.youtube.com/watch?v=AyN8RawHlJQ\n'+('保留原始練習說明，不改變課程與關聯。'.repeat(30))+'<script>unsafe</script>';
const item={id:'drawing-stable',kind:'item',name:'繪圖',description,vision:'畫出景物速寫',goal:'觀察與抓型',expectedOutcome:'留下觀察練習',order:0,status:'active',focused:true,legacyKey:null,revision:7};
query='learningItem=drawing-stable';itemSeeds=[{entities:[item]},[],'',''];
const Learning=load('app/components/PracticeLearning.tsx').default;
let html=render(React.createElement(Learning));
assert.match(html,/<h1>繪圖<\/h1>/,'selected learning item is the page title');assert.doesNotMatch(html,/<h1>心・知<\/h1>/);
assert.match(html,/practice-item-overview/);assert.match(html,/practice-manage-link/);
assert.equal((html.match(/aria-current="page"/g)||[]).length,1);
assert.match(html,/項目說明與來源/);assert.match(html,/href="https:\/\/www.youtube.com/);assert.match(html,/&lt;script&gt;/);
assert.doesNotMatch(html,/<details[^>]*practice-item-description[^>]*\sopen/,'long description initially collapsed');
assert.match(html,/long-description/);assert.match(html,/畫出景物速寫/);
query='';itemSeedIndex=0;html=render(React.createElement(Learning));assert.match(html,/<h1>心・知<\/h1>/);assert.match(html,/繪圖/);
console.log('PASS actual learning view SSR: selected title/management/tabs, preserved escaped long source, collapsed reading, index retained');
