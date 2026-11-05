import assert from 'node:assert/strict';
import {loader} from './weaving-test-harness.mjs';
const m=loader()('lib/dojo/weavingWorkflow/clientIdentity.ts');
assert.equal(typeof m.copyAfterPreparing,'function','async preparation must retain the original copy gesture');
const descriptors=Object.fromEntries(['navigator','document','ClipboardItem'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
const set=(k,value)=>Object.defineProperty(globalThis,k,{configurable:true,value});
let clipboard='原有剪貼簿',gesture=true,writeCalls=0,fallback=true,removed=0,selected='';
class Item{constructor(data){this.data=data;}async getType(type){return await this.data[type];}}
set('ClipboardItem',Item);
set('document',{createElement:()=>({value:'',style:{},focus(){},select(){selected=this.value;},setSelectionRange(){},remove(){removed++;}}),body:{append(){}},execCommand:()=>{if(!fallback)return false;clipboard=selected;return true;}});
set('navigator',{clipboard:{write(items){writeCalls++;const allowed=gesture;return Promise.resolve().then(async()=>{if(!allowed)throw Error('gesture expired');clipboard=await(await items[0].getType('text/plain')).text();});},writeText:async text=>{if(!gesture)throw Error('gesture expired');clipboard=text;}}});
try{
 let release;const ready=new Promise(resolve=>{release=resolve;});const result=m.copyAfterPreparing(()=>ready);assert.equal(writeCalls,1);assert.equal(clipboard,'原有剪貼簿');gesture=false;release('完整\nB 指令與中文。');assert.equal(await result,true);assert.equal(clipboard,'完整\nB 指令與中文。');console.log('PASS clipboard write starts inside click; asynchronous saved text is copied exactly after preparation');
 clipboard='不得覆蓋';gesture=true;let reject;const failed=m.copyAfterPreparing(()=>new Promise((_,r)=>{reject=r;}));gesture=false;reject(Error('保存失敗'));await assert.rejects(()=>failed,/保存失敗/);await new Promise(r=>setTimeout(r,0));assert.equal(clipboard,'不得覆蓋');console.log('PASS preparation/save failure never writes unsaved text or creates an unhandled rejection');
 set('navigator',{clipboard:{write:async()=>{throw Error('denied');},writeText:async()=>{throw Error('denied');}}});fallback=false;assert.equal(await m.copyAfterPreparing(async()=>'可手動複製的內容'),false);assert.equal(clipboard,'不得覆蓋');assert.ok(removed>0);console.log('PASS rejected modern and legacy clipboard returns explicit manual-copy result, keeping prior clipboard');
 set('navigator',{});fallback=true;assert.equal(await m.copyAfterPreparing(async()=>'無現代API的指令'),true);assert.equal(clipboard,'無現代API的指令');console.log('PASS environments without ClipboardItem/clipboard use focused selection fallback');
}finally{for(const [k,d]of Object.entries(descriptors))if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k];}
