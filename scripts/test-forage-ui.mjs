import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire, Module } from 'node:module';
import { resolve, dirname } from 'node:path';
import ts from 'typescript';
import {createHash} from 'node:crypto';
const require=createRequire(import.meta.url),cache=new Map();
function load(file){file=resolve(file);if(cache.has(file))return cache.get(file).exports;const m=new Module(file);cache.set(file,m);m.filename=file;m.require=s=>{if(s.endsWith('.css'))return {};if(s==='next/link')return {__esModule:true,default:({children,...props})=>require('react').createElement('a',props,children)};const p=s.startsWith('@/')?resolve(s.slice(2)):s.startsWith('.')?resolve(dirname(file),s):null;return p?load(['.ts','.tsx',''].map(e=>p+e).find(existsSync)):require(s)};m._compile(ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,file);return m.exports;}
const ui=load('lib/dojo/forageUi.ts');
assert.equal(ui.ENGLISH_DETAIL_TABS.length,5);
assert.equal(ui.CAPTURE_DETAIL_TABS.length,4);
assert.deepEqual(ui.forageLaunch('?englishImageId=completed-1&dispatch=context&stage=error'),{id:'completed-1',target:'context',stage:'error'});
assert.equal(ui.forageLaunch('?stage=not-a-stage').stage,'all');
assert.equal(ui.arrangementStage(null),0);assert.equal(ui.arrangementStage('packed'),1);assert.equal(ui.arrangementStage('previewed'),2);assert.equal(ui.arrangementStage('approved'),2);assert.equal(ui.arrangementStage('partial'),3);
assert.equal(ui.wordSlots(['a','a','b']),3);
const {renderToStaticMarkup}=require('react-dom/server'),React=require('react');
const Home=load('app/components/ForageHome.tsx').default;
const html=renderToStaticMarkup(React.createElement(Home));
assert(html.includes('/forage/new'));assert(html.includes('/forage/english?stage=error')||readFileSync('app/components/ForageHome.tsx','utf8').includes('/forage/english?stage=error'));
assert(!html.includes('>Aa<'));assert(html.includes('<svg'));
const Layout=load('app/forage/layout.tsx').default;
const layout=renderToStaticMarkup(React.createElement(Layout,{children:'test'}));assert(layout.includes('forage-ui'));assert(layout.includes('data-realm="orange"'));
assert.equal(createHash('sha256').update(readFileSync('app/forage/forage-tokens.css')).digest('hex'),'ec973f72e6ce86a0449a395487be05e9bd33bc749fc8c06043f1e52d17541433');
if(!process.argv.includes('--shell')){for(const f of ['EnglishImageInbox.tsx','ForageCaptureInbox.tsx']){const s=readFileSync('app/components/'+f,'utf8');assert(s.includes('ForageTabs'));assert(!s.includes('wild-preview'));}
assert(readFileSync('app/components/UnitArrangementDialog.tsx','utf8').includes('unit-arrangement-page'));
}
const {manualLearningUsagePatch}=load('lib/dojo/manualEnglishUsage.ts');
const entry={vocabularyCandidates:[],vocabForgeExports:[],vocabForgeSyncStates:[{key:'notice',status:'failed'}],contextRoomLinks:[{status:'synced'}],ocrText:'Original remains.'};
const candidates=[{key:'notice',expression:'notice',meaning:'注意到',usage:{sentence:'',translation:'',provenance:'unknown'},origin:'source',cefrLevel:'A2',suggestedFocusDecks:[],recommendationReason:''},{key:'learn',expression:'learn',meaning:'學習',usage:{sentence:'I learn a new word.',translation:'我學到一個新單字。',provenance:'generated'},origin:'source',cefrLevel:'A2',suggestedFocusDecks:[],recommendationReason:''}];
assert.throws(()=>manualLearningUsagePatch(entry,candidates,'missing','I notice a bird.','我注意到一隻鳥。'),/候選/);
assert.throws(()=>manualLearningUsagePatch(entry,candidates,'notice','bad',''),/例句|翻譯/);
const patch=manualLearningUsagePatch(entry,candidates,'notice','I notice a small bird.','我注意到一隻小鳥。');assert.equal(patch.vocabularyCandidates.length,2);assert.equal(patch.vocabularyCandidates[0].usageProvenance,'unknown');assert.equal(patch.vocabularyCandidates[1].usage,'I learn a new word.');assert.equal(entry.ocrText,'Original remains.');assert.equal(entry.vocabForgeSyncStates[0].status,'failed');
assert.throws(()=>manualLearningUsagePatch({...entry,vocabForgeExports:[{key:'notice'}]},candidates,'notice','I notice a small bird.','我注意到一隻小鳥。'),/已同步/);
let exportCalls=0,rewriteCalls=0,stored=structuredClone(entry);
const file=resolve('app/api/dojo/english-images/vocabforge/route.ts'),handler=new Module(file);handler.filename=file;handler.require=s=>s==='@/lib/dojo/englishImageDispatch'?{englishImageVocabCandidates:()=>candidates,exportEnglishImageVocabs:()=>{exportCalls++;},listVocabForgeBooks:()=>[],recommendedFocusDecks:()=>[]}:s==='@/lib/dojo/englishImageStore'?{getEnglishImageEntry:async()=>({entry:stored}),updateEnglishImageEntry:async(id,update)=>{stored={...stored,...update(stored)};return stored;}}:s==='@/lib/dojo/englishImageAnalysis'?{rewriteEnglishImageLearningUsages:()=>{rewriteCalls++;}}:s.startsWith('@/')?load(s.slice(2)+'.ts'):require(s);handler._compile(ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file);
const request=body=>new Request('http://localhost/api/dojo/english-images/vocabforge',{method:'POST',body:JSON.stringify(body)});
let response=await handler.exports.POST(request({id:'entry',action:'saveUsage',key:'notice',usage:'I notice a small bird.',translation:'我注意到一隻小鳥。'}));assert.equal(response.status,200);assert.equal(stored.vocabularyCandidates.length,2);assert.equal(stored.vocabForgeSyncStates[0].status,'failed');assert.equal(stored.contextRoomLinks[0].status,'synced');assert.equal(exportCalls,0);assert.equal(rewriteCalls,0);
response=await handler.exports.POST(request({id:'entry',action:'saveUsage',key:'invalid',usage:'bad',translation:''}));assert.equal(response.status,400);
console.log('forage-ui: route, SSR, navigation, scope and manual-usage assertions passed');
