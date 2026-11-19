import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readShare,sourceUrl } from '../share.mjs';
import { Queue,LEASE } from '../store.mjs';

const vid='7000000000000000001', alt='7110000000000000000';
const short='https://v.douyin.com/trialClipA/';
const full='https://www.douyin.com/video/'+vid;
const native='1.23 复制打开抖音，看看【示例作者的作品】示例影片 '+short+' abc:/ 附加文字';
const result={text:'第一句。\n第二句。',segments:[{start:0,end:2,text:'第一句。'},{start:2,end:9,text:'第二句。'}]};
test('native share remains separate from a reflection, direct URLs identify their source',()=>{
  assert.equal(readShare(native).note,'');
  assert.equal(readShare(native+'\n筆記：我想比較這個說法。').note,'我想比較這個說法。');
  assert.equal(readShare('留給文章\n'+full+'?share_source=copy').note,'留給文章');
  assert.equal(readShare(native,'自己的筆記').raw,native);
  assert.equal(readShare(full+'/?x=1').videoId,vid);
  for(const u of ['http://www.douyin.com/video/'+vid,'https://v.douyin.com.bad.test/abc','https://user@v.douyin.com/abc','https://www.douyin.com/note/'+vid]) assert.equal(sourceUrl(u),null);
  assert.throws(()=>readShare(short+' '+full));
});
test('durable queue survives restart and sleep, stale deliveries cannot overwrite the card',()=>{
  const dir=mkdtempSync(join(tmpdir(),'yecai-test-'));let q;let now=10000;
  try{
    const db=join(dir,'trial.sqlite');q=new Queue(db,()=>now);
    const a=q.ingest(readShare(native,'我想保留的內容'),'LINE','event-a');
    assert.equal(q.ingest(readShare(native),'LINE','event-a').id,a.id);
    assert.equal(q.claim(false),null);
    q.db.close();q=new Queue(db,()=>now);
    const one=q.claim(true);assert.equal(one.id,a.id);assert.equal(q.claim(true),null);
    q.workerUpdate(a.id,{lease:one.lease,action:'identify',videoId:vid,title:'這支影片'});
    q.note(a.id,'我修改過的筆記','我想保留的內容');
    now+=LEASE+1;assert.equal(q.publicCard(a.id).status,'queued');
    const two=q.claim(true);assert.equal(two.video,vid);assert.notEqual(two.lease,one.lease);
    assert.throws(()=>q.workerUpdate(a.id,{lease:one.lease,action:'fail',phase:'audio',message:'舊工作'}));
    assert.throws(()=>q.workerUpdate(a.id,{lease:two.lease,action:'finish',videoId:alt,...result}));
    assert.throws(()=>q.workerUpdate(a.id,{lease:two.lease,action:'finish',videoId:vid,text:'',segments:[]}));
    q.workerUpdate(a.id,{lease:two.lease,action:'finish',videoId:vid,...result});
    const done=q.publicCard(a.id);
    assert.equal(done.status,'done');assert.equal(done.note,'我修改過的筆記');assert.equal(done.share,native);
    assert.deepEqual(done.segments,result.segments);assert.equal(q.claim(true),null);
    assert.equal(q.ingest(readShare(full),'LINE','event-b').id,a.id);
    assert.equal(q.list().length,1);
  }finally{q?.db.close();rmSync(dir,{recursive:true,force:true});}
});
test('two short links to the same work retain both notes, both deep links, and one completed transcript',()=>{
  const q=new Queue(':memory:');
  try{
    const a=q.ingest(readShare(full,'筆記 A'),'LINE','a');
    const job=q.claim(true);q.workerUpdate(a.id,{lease:job.lease,action:'finish',videoId:vid,...result});
    const b=q.ingest(readShare('https://v.douyin.com/otherShort/','筆記 B'),'LINE','b');
    const j=q.claim(true);assert.equal(j.id,b.id);
    assert.deepEqual(q.workerUpdate(b.id,{lease:j.lease,action:'identify',videoId:vid,title:'範例'}),{merged:true,id:a.id});
    assert.equal(q.publicCard(b.id).id,a.id);assert.equal(q.publicCard(b.id).text,result.text);
    assert.equal(q.publicCard(a.id).note,'筆記 A\n\n筆記 B');assert.equal(q.list().length,1);
  }finally{q.db.close();}
});
test('failure is actionable; explicit retry uses same card and a new attempt, edits protected',()=>{
  const q=new Queue(':memory:');
  try{
    const {id}=q.ingest(readShare(short),'測試頁','c');const job=q.claim(true);
    q.workerUpdate(id,{lease:job.lease,action:'fail',phase:'download',message:'HTTP 403'});
    assert.equal(q.publicCard(id).error,'HTTP 403');assert.equal(q.claim(true),null);
    q.note(id,'新筆記','');assert.throws(()=>q.note(id,'其他筆記',''));
    q.retry(id);assert.throws(()=>q.retry(id));const retry=q.claim(true);
    assert.equal(retry.id,id);assert.equal(retry.attempt,2);assert.equal(q.publicCard(id).note,'新筆記');
  }finally{q.db.close();}
});
test('Mac and LINE pairing tickets have distinct scopes, expiry and single use',()=>{
  let now=10000;const q=new Queue(':memory:',()=>now);
  try{const a=q.issue('mac');assert.throws(()=>q.redeem('line',a,'someone'));
    assert.ok(q.redeem('mac',a));assert.throws(()=>q.redeem('mac',a));
    const b=q.issue('line');now+=601000;assert.throws(()=>q.redeem('line',b,'someone'));
  }finally{q.db.close();}
});
