/** Local synthetic preview only. This file is never imported by the Next app. */
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { fixture } from './weaving-fixture.mjs';
import { isolatedServer } from './isolated-practice-server.mjs';

export async function startCreativePreview({port=3045,appPort=3047,empty=false}={}) {
  if(!existsSync('.next/BUILD_ID')) throw new Error('Run npm run build before npm run preview:creative.');
  const f=await fixture();
  const app=await isolatedServer(appPort,'weaving-fixture',{production:true});
  const handlers=Object.fromEntries(['weaving-shuttles','weaving-works','weaving-sources','liaojie-projects'].map(k=>['/api/dojo/'+k,f.load('app/api/dojo/'+k+'/route.ts')]));
  f.queries.listReadingBooks=async()=>[{id:'preview-book',title:'隔離示範書'}];
  f.queries.listReadingNotes=async()=>[{id:'preview-note',kind:'excerpt',text:'這是隔離示範素材，不是你的私人紀錄。',metadata:{chapter:'示範章節',location:'第 1 頁'}}];
  if(!empty) {
    const s=f.load('lib/dojo/weavingWorkflow/store.ts');
    const pair=await s.createPair({operationId:'preview-source-pair',sourceType:'manual',sourceSnapshot:'隔離示範：忙碌時仍想練習休息。',coreStatement:'休息不必等到所有事情完成。',format:'text'});
    const written=await s.patchWork({operationId:'preview-draft-text',id:pair.works[0].id,expectedRevision:pair.works[0].revision,work:{title:'給忙碌的自己一點空間',draftText:'今天的待辦還沒做完，我先替自己留了十分鐘。\n\n休息不必等到所有事情完成。'}});
    const done=await s.completeWork({operationId:'preview-fixed-completion',workId:written.id,expectedRevision:written.revision,previewDigest:f.load('lib/dojo/weavingWorkflow/completions.ts').completionDigest(written)});
    await s.handoffWork({operationId:'preview-publication-handoff',weavingWorkId:written.id,completionVersionId:done.completion.id});
    const latest=await s.readWork(written.id);
    await s.patchWork({operationId:'preview-next-draft',id:latest.id,expectedRevision:latest.revision,work:{status:'drafting',nextAction:'補充一個自己的生活例子'}});
  }
  const base=`http://127.0.0.1:${port}`;
  const server=createServer(async(req,res)=>{
    try {
      if(req.headers.host!==`127.0.0.1:${port}` || (req.headers.origin && req.headers.origin!==base)) {
        res.writeHead(403);res.end('Loopback preview only');return;
      }
      const url=new URL(req.url,base);
      const chunks=[];for await(const chunk of req)chunks.push(chunk);
      const payload=Buffer.concat(chunks).toString();
      if(url.pathname.startsWith('/api/')) {
        const handler=handlers[url.pathname]?.[req.method];
        if(!handler) {res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({entries:[],claims:[],captures:[],entities:[],missing:[]}));return;}
        const result=await handler(f.req(req.method,url.pathname+url.search,payload?JSON.parse(payload):null));
        res.writeHead(result.status,{'content-type':'application/json','cache-control':'no-store'});res.end(await result.text());return;
      }
      if(!/^\/(weaving|liaojie|_next|favicon\.ico)(\/|\?|$)/.test(url.pathname)) {
        if(url.pathname==='/') {res.writeHead(302,{location:'/weaving'});res.end();return;}
        res.writeHead(404);res.end('This preview includes /weaving and /liaojie only.');return;
      }
      const headers={...req.headers,cookie:'dsc_access_key=weaving-fixture'};delete headers.host;delete headers.connection;
      const upstream=await fetch(app.base+url.pathname+url.search,{method:req.method,headers,redirect:'manual',...(payload?{body:payload}:{})});
      const responseHeaders=Object.fromEntries(upstream.headers);
      for(const name of ['content-encoding','content-length','transfer-encoding','connection'])delete responseHeaders[name];
      responseHeaders['cache-control']='no-store';
      responseHeaders['set-cookie']='dsc_access_key=weaving-fixture; Path=/; HttpOnly; SameSite=Strict';
      res.writeHead(upstream.status,responseHeaders);res.end(Buffer.from(await upstream.arrayBuffer()));
    } catch(error) {res.writeHead(500,{'content-type':'application/json'});res.end(JSON.stringify({error:error.message}));}
  });
  try {await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});}
  catch(error) {app.stop();await f.close();throw error;}
  return {base,close:async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));app.stop();await f.close();}};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  const preview=await startCreativePreview({empty:process.argv.includes('--empty')});
  console.log(`Creative preview: ${preview.base}/weaving and ${preview.base}/liaojie`);
  console.log('Synthetic in-memory records only. Stop with Ctrl-C; no production Notion writes.');
  const stop=async()=>{await preview.close();process.exit(0);};
  process.once('SIGINT',stop);process.once('SIGTERM',stop);
}
