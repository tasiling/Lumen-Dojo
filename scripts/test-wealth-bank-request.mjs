import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';

test('LINE processing can wait for the OCR first pass plus recovery before returning recorded counts',async t=>{
 const raw=await readFile(new URL('../lib/dojo/wealthBank.ts',import.meta.url),'utf8');
 const js=ts.transpileModule(raw,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText.replace('import "server-only";','').replaceAll('"./wealthBankRouting"',JSON.stringify(new URL('../lib/dojo/wealthBankRouting.ts',import.meta.url).href)).replaceAll('"./wealthBankSummary"',JSON.stringify(new URL('../lib/dojo/wealthBankSummary.ts',import.meta.url).href));
 const {processBankImage}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
 const originalFetch=globalThis.fetch,originalTimeout=AbortSignal.timeout,previous={url:process.env.LUMINARA_WEALTH_URL,secret:process.env.LUMINARA_WEALTH_S2S_SECRET};
 process.env.LUMINARA_WEALTH_URL='https://wealth.test';process.env.LUMINARA_WEALTH_S2S_SECRET='t'.repeat(32);
 t.after(()=>{globalThis.fetch=originalFetch;AbortSignal.timeout=originalTimeout;if(previous.url===undefined)delete process.env.LUMINARA_WEALTH_URL;else process.env.LUMINARA_WEALTH_URL=previous.url;if(previous.secret===undefined)delete process.env.LUMINARA_WEALTH_S2S_SECRET;else process.env.LUMINARA_WEALTH_S2S_SECRET=previous.secret});
 // Accelerate the real timeout and the external service together by 20x.
 AbortSignal.timeout=ms=>originalTimeout(Math.ceil(ms/20));
 globalThis.fetch=(url,init)=>new Promise((resolve,reject)=>{
  assert.equal(url,'https://wealth.test/api/integrations/lumen/bank/batches/batch-test/process');
  const timer=setTimeout(()=>resolve(Response.json({batchId:'batch-test',status:'completed',counts:{recorded:4}})),1900);
  init.signal.addEventListener('abort',()=>{clearTimeout(timer);reject(init.signal.reason)},{once:true});
 });
 assert.equal((await processBankImage('owner','batch-test')).counts.recorded,4);
});
