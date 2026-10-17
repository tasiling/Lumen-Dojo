import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {loader} from './weaving-test-harness.mjs';
if(process.argv[2]==='child'){
 const {runWeavingOperation}=loader()('lib/dojo/weavingWorkflow/operations.ts');const dir=process.env.LEARNING_WRITE_LOCK_DIR;
 try{await runWeavingOperation('owner',process.argv[3],'create_work',{},[{key:'create',findConfirmed:async()=>null,execute:async()=>{await writeFile(join(dir,'ready'),'ready');if(process.argv[3]==='lock-first')while(true){try{await readFile(join(dir,'release'));break;}catch{await new Promise(r=>setTimeout(r,10));}}return{id:'one'};}}]);console.log('confirmed');}catch(e){console.log(`status:${e.status}`);}process.exit(0);
}
const dir=await mkdtemp(join(tmpdir(),'weaving-process-'));
function run(op){const child=spawn(process.execPath,[import.meta.filename,'child',op],{env:{...process.env,LEARNING_WRITE_LOCK_DIR:dir}});let text='';child.stdout.on('data',b=>text+=b);child.stderr.on('data',b=>text+=b);return{child,done:new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',code=>code===0?resolve(text):reject(Error(text)));})};}
let first;
try{first=run('lock-first');for(let i=0;i<300;i++){try{await readFile(join(dir,'ready'));break;}catch{await new Promise(r=>setTimeout(r,10));}}const second=run('lock-second');assert.match(await second.done,/status:409/);await writeFile(join(dir,'release'),'release');assert.match(await first.done,/confirmed/);const retry=run('lock-second');assert.match(await retry.done,/confirmed/);console.log('PASS cross-process writer exclusion and confirmed retry, shared durable filesystem');}finally{first?.child.kill();await rm(dir,{recursive:true,force:true});}
