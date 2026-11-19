import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHmac,randomBytes } from 'node:crypto';
import { Queue } from '../store.mjs';
import { application } from '../server.mjs';

test('verified LINE webhook → durable offline capture → paired worker → same private mobile card',async()=>{
  const q=new Queue(':memory:');let base,handle;const replies=[];
  const key=randomBytes(24).toString('hex'), secret=randomBytes(24).toString('hex');
  const s=createServer((req,res)=>handle(req,res));
  await new Promise(resolve=>s.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+s.address().port;
  handle=application({queue:q,origin:base,accessKey:key,secret,channelToken:'test-only',
    reply:async(token,receipt,msg)=>{replies.push(msg);}});
  const post=(path,data,headers={})=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(data)});
  const line=(data,valid=true)=>post('/api/integrations/line/webhook',data,{'x-line-signature':valid?
    createHmac('sha256',secret).update(JSON.stringify(data)).digest('base64'):'bad'});
  const message=(uid,id,text)=>({type:'message',replyToken:'test-'+id,webhookEventId:id,source:{type:'user',userId:uid},message:{id,type:'text',text}});
  try {
    assert.equal((await fetch(base+'/healthz')).status,200);
    assert.equal((await fetch(base+'/api/inbox')).status,401);
    assert.equal((await post('/api/login',{key},{origin:'https://other.example'})).status,403);
    const logged=await post('/api/login',{key},{origin:base}),owner={origin:base,cookie:logged.headers.get('set-cookie').split(';')[0]};
    assert.equal((await line({events:[]})).status,200);
    assert.equal((await line({events:[]},false)).status,403);
    const pairLine=(await (await post('/api/line/pair',{},owner)).json()).command;
    assert.equal((await line({events:[message('owner','pair',pairLine)]})).status,200);
    const vid='7221000000000000001',url='https://www.douyin.com/video/'+vid;
    await line({events:[message('other','ignored',url)]});assert.equal(q.list().length,0);
    const body={events:[message('owner','clip','复制打开抖音 '+url)]};
    const sent=await Promise.all([line(body),line(body)]);
    assert.ok(sent.every(r=>r.status===200));assert.equal(q.list().length,1);assert.equal(replies.length,2);
    const id=q.list()[0].id;
    assert.equal(replies[1].quickReply.items[0].action.uri,base+'/forage/captures?captureId='+id);
    assert.equal(q.publicCard(id).note,'');
    const download=await post('/api/mac/install',{},owner);assert.ok(download.headers.get('content-disposition').includes('.command'));
    const file=await download.text();const encoded=file.match(/BUNDLE = '([A-Za-z0-9+/=]+)'/)[1];
    const bundle=JSON.parse(Buffer.from(encoded,'base64'));assert.ok(bundle.files['worker.py'].includes('class Work:'));
    const exchange=await post('/api/worker/pair',{ticket:bundle.ticket});
    const worker={authorization:'Bearer '+(await exchange.json()).token};
    assert.equal((await post('/api/worker/pair',{ticket:bundle.ticket})).status,403);
    assert.equal((await post('/api/worker/claim',{ready:true})).status,401);
    assert.equal((await post('/api/worker/claim',{ready:true},{...worker,origin:base})).status,403);
    assert.equal((await (await post('/api/worker/claim',{ready:false},worker)).json()).job,null);
    const {job}=await (await post('/api/worker/claim',{ready:true},worker)).json();
    const op=(action,extra={})=>post('/api/worker/update',{id,lease:job.lease,action,...extra},worker);
    await op('identify',{videoId:vid,title:'第二支測試影片'});
    await post('/api/captures/'+id+'/note',{note:'手機上補寫',previous:''},owner);
    const text='保留換行。\n'.repeat(1800);
    assert.equal((await op('finish',{videoId:vid,text,segments:[{start:0,end:11,text:'實際回傳欄位示例'}]})).status,200);
    const item=await (await fetch(base+'/api/captures/'+id,{headers:owner})).json();
    assert.equal(item.text,text.trim());assert.equal(item.title,'第二支測試影片');assert.equal(item.note,'手機上補寫');
    const duplicate=await (await post('/api/captures',{share:url,note:'',requestId:'another-test-event'},owner)).json();
    assert.equal(duplicate.id,id);assert.equal(q.list().length,1);
  } finally {await new Promise(resolve=>s.close(resolve));q.db.close();}
});
