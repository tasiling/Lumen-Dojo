import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Module,createRequire} from 'node:module';
import {resolve,dirname} from 'node:path';
import ts from 'typescript';
const require=createRequire(import.meta.url),cache=new Map(),slots=[],effects=[];let position=0,queue=[],guard=false,allow=true,prompt='',fetches=0;
const react={useState(initial){const n=position++;if(!slots[n])slots[n]={value:typeof initial==='function'?initial():initial,set:value=>{slots[n].value=typeof value==='function'?value(slots[n].value):value}};return [slots[n].value,slots[n].set]},useRef(initial){const n=position++;if(!slots[n])slots[n]={current:initial};return slots[n]},useEffect(fn,deps){const n=position++;if(!effects[n]||JSON.stringify(effects[n].deps)!==JSON.stringify(deps)){queue.push(fn);effects[n]={deps}}}};
function load(file){file=resolve(file);if(cache.has(file))return cache.get(file).exports;const m=new Module(file);cache.set(file,m);m.require=s=>s==='react'?react:s==='@/lib/dojo/usePracticeLeaveGuard'?{usePracticeLeaveGuard:dirty=>{guard=dirty}}:s.startsWith('./')&&s!== './editor'?{__esModule:true,default:function Stub(){return null}}:s.startsWith('@/')?load(s.slice(2)+'.ts'):s.startsWith('.')?load(resolve(dirname(file),s)+'.ts'):require(s);m._compile(ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,file);return m.exports}
const Component=load('app/components/AssessmentAttempt.tsx').default;
const attempt={id:crypto.randomUUID(),revision:1,status:'draft',verdict:'pending',answer:'',evidence:[],confirmedAt:null,definitionVersion:1,definitionSnapshot:{name:'Fixture',scope:{learningItemId:crypto.randomUUID()},objective:'Test',tasks:[],aids:[],criteria:[],confirmationMethods:['self']}};
const priorFetch=globalThis.fetch,priorConfirm=globalThis.confirm;
globalThis.fetch=async()=>{fetches++;return new Response(JSON.stringify({attempt,evidenceAvailability:[],proofs:[]}),{headers:{'content-type':'application/json'}})};globalThis.confirm=message=>{prompt=message;return allow};
function nodes(value,result=[]){if(Array.isArray(value))for(const x of value)nodes(x,result);else if(value&&typeof value==='object'&&value.props){result.push(value);nodes(value.props.children,result)}return result}
function render(){position=0;const tree=Component({id:attempt.id});const work=queue;queue=[];for(const fn of work)fn();return nodes(tree)}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
try{
 render();await tick();let tree=render();const picker=tree.find(n=>n.props.onPendingChange);assert.ok(picker);
 picker.props.onPendingChange(true);tree=render();assert.equal(guard,true);assert.equal(tree.find(n=>n.props.children==='保存作答草稿').props.disabled,true);assert.equal(tree.find(n=>n.props.children==='提交已保存作品').props.disabled,true);
 allow=false;const before=fetches;tree.find(n=>n.props.children==='重新讀取保存版本').props.onClick();await tick();tree=render();assert.equal(guard,true);assert.equal(fetches,before);assert.equal(tree.find(n=>n.props.onPendingChange).key,picker.key,'cancelled discard retains selected file subtree');
 allow=true;tree.find(n=>n.props.children==='重新讀取保存版本').props.onClick();await tick();tree=render();assert.equal(guard,false);const next=tree.find(n=>n.props.onPendingChange);assert.notEqual(next.key,picker.key,'confirmed draft reload must remount the picker so pending file/result is discarded consistently with the cleared guard');assert.ok(prompt.includes('選檔'));
 next.props.onPendingChange(true);tree=render();assert.equal(guard,true,'new selections after reload reinstate guards');
 console.log('PASS actual attempt reload handlers with isolated hook boundary: pending save/submit/leave gates, cancelled reload retains picker, confirmed discard resets keyed subtree, fresh selection reasserts guard');
}finally{globalThis.fetch=priorFetch;globalThis.confirm=priorConfirm}
