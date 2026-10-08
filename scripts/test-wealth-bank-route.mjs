import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { pathToFileURL } from 'node:url';

test('OCR endpoint sends date context and preserves the two visible date sections',async t=>{
 const source=await readFile(new URL('../app/api/integrations/wealth-bank/ocr/route.ts',import.meta.url),'utf8');
 const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText.replace('"next/server"',JSON.stringify(pathToFileURL(process.cwd()+'/node_modules/next/server.js').href)).replace('"@/lib/dojo/wealthBankOcr"',JSON.stringify(new URL('../lib/dojo/wealthBankOcr.ts',import.meta.url).href));
 const {POST}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
 const originalFetch=globalThis.fetch,secret=process.env.LUMINARA_WEALTH_OCR_SECRET,key=process.env.OPENAI_API_KEY;
 process.env.LUMINARA_WEALTH_OCR_SECRET='t'.repeat(32);process.env.OPENAI_API_KEY='test';
 t.after(()=>{globalThis.fetch=originalFetch;if(secret===undefined)delete process.env.LUMINARA_WEALTH_OCR_SECRET;else process.env.LUMINARA_WEALTH_OCR_SECRET=secret;if(key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=key});
 const evidence={date_visible:true,amount_visible:true,direction_visible:true,description_visible:true,account_visible:true};let instruction='';
 globalThis.fetch=async (url,init)=>{assert.equal(url,'https://api.openai.com/v1/responses');instruction=JSON.parse(init.body).input[0].content[0].text;return Response.json({output:[{content:[{type:'output_text',text:JSON.stringify({transactions:[{date_header:'Wed 07 Oct Today',description:'Coles',amount:'8.09',currency:'AUD',direction:'outflow',status:'pending',kind:'merchant',account_hint:'Smart Access',evidence},{date_header:'Tue 06 Oct Yesterday',description:'Medibank',amount:'45.05',currency:'AUD',direction:'inflow',status:'completed',kind:'unknown',account_hint:'Smart Access',evidence}]})}]}]})};
 const response=await POST(new Request('http://localhost/api/integrations/wealth-bank/ocr',{method:'POST',headers:{authorization:'Bearer '+'t'.repeat(32),'Content-Type':'application/json'},body:JSON.stringify({mimeType:'image/png',imageBase64:'YWJj',referenceDate:'2026-10-07'})}));
 assert.equal(response.status,200);assert.deepEqual((await response.json()).transactions.map(x=>x.date),['2026-10-07','2026-10-06']);assert.match(instruction,/2026-10-07/);
});
