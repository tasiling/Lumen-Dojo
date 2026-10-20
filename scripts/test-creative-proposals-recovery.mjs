import assert from 'node:assert/strict';
import {fixture} from './weaving-fixture.mjs';

async function isolated(run){
 const sources=new Map();let readFailure=null;
 const resolvePolicySource=async ref=>{if(readFailure===ref.sourceId){readFailure=null;throw Error('isolated source read failure');}return sources.get(ref.sourceId)??null;};
 const f=await fixture({'../creativeSources/resolver':{resolvePolicySource},'./resolver':{resolvePolicySource}});
 try{
  const store=f.load('lib/dojo/creativeProposals/store.ts'),ops=f.load('lib/dojo/weavingWorkflow/operations.ts'),owner=f.load('lib/dojo/weavingWorkflow/store.ts').WEAVING_OWNER;
  const add=i=>{const id=`00000000-0000-4000-8000-${String(i).padStart(12,'0')}`,ref={sourceType:'reading_insight',sourceId:id};sources.set(id,{ref,label:`隔離洞察 ${i}`,href:'/reading/cards?card='+id,text:`第 ${i} 個隔離生活觀察。`,version:'v1',contentKind:'insight'});f.records.set('policy-'+i,{title:'行光創作來源設定-v1-'+i,value:{schema:1,owner:f.load('lib/dojo/learningFoundation/store.ts').learningOwner,ref,discovery:'allow',publication:'ask',revision:1,createdAt:'now',updatedAt:'now'}});return id;};
  await run({f,store,sources,add,receipt:id=>ops.inspectWeavingOperation(owner,id),failRead:id=>{readFailure=id;}});
 }finally{await f.close();}
}

const cases={
 async rejection(){await isolated(async({f,store,sources,add,receipt})=>{
  const id=add(1);await store.scan({operationId:'recovery-initial-scan'});const p=(await store.snapshot()).proposals[0];
  sources.set(id,{...sources.get(id),version:'v2'});
  await assert.rejects(()=>store.acceptProposal({id:p.id,expectedRevision:1,operationId:'recovery-stale-accept'}),e=>e.status===409);
  assert.equal((await receipt('recovery-stale-accept')).state,'rejected','pre-dispatch validation must be terminal, not permanently pending');
  f.records.get('policy-1').value.discovery='private';
  await assert.rejects(()=>store.acceptProposal({id:p.id,expectedRevision:1,operationId:'recovery-revoked-accept'}),e=>e.status===403);
  assert.equal((await receipt('recovery-revoked-accept')).state,'rejected');
  f.records.get('policy-1').value.discovery='allow';await store.scan({operationId:'recovery-fresh-scan'});
  assert.equal((await store.snapshot()).proposals.length,2);
 });},
 async scan(){await isolated(async({store,add,failRead,receipt})=>{
  for(let i=1;i<=20;i++)add(i);failRead('00000000-0000-4000-8000-000000000006');
  await assert.rejects(()=>store.scan({operationId:'recovery-scan-operation-a'}));
  assert.equal((await store.snapshot()).proposals.length,5);
  await store.scan({operationId:'recovery-scan-operation-b'});
  assert.equal((await store.snapshot()).proposals.length,10);
  await store.scan({operationId:'recovery-scan-operation-a'});
  assert.equal((await store.snapshot()).proposals.length,10,'retry must finish its original first ten, not reinterpret confirmed indices against a new batch');
  assert.equal((await receipt('recovery-scan-operation-a')).state,'confirmed');
  await store.scan({operationId:'recovery-scan-operation-c'});
  assert.equal((await store.snapshot()).proposals.length,20,'next scan must cover every remaining source');
 });},
 async acceptance(){await isolated(async({f,store,sources,add,receipt})=>{
  const id=add(1);await store.scan({operationId:'recovery-partial-scan'});const p=(await store.snapshot()).proposals[0],input={id:p.id,expectedRevision:1,operationId:'recovery-same-accept'};
  const update=f.mutations.updateKnowledgeEntry;let fail=true;
  f.mutations.updateKnowledgeEntry=async(id,row)=>{if(id===p.id&&fail){fail=false;throw Error('isolated final update failure');}return update(id,row);};
  await assert.rejects(()=>store.acceptProposal(input));const size=f.records.size;
  assert.equal((await receipt(input.operationId)).steps.work,'confirmed');
  f.records.get('policy-1').value.discovery='private';
  await assert.rejects(()=>store.acceptProposal(input),e=>e.status===403);
  assert.equal((await store.snapshot()).proposals[0].status,'pending');
  assert.notEqual((await receipt(input.operationId)).state,'rejected','partial work must retain its operation identity');
  f.records.get('policy-1').value.discovery='allow';const original=sources.get(id);sources.set(id,{...original,version:'v2'});
  await assert.rejects(()=>store.acceptProposal(input),e=>e.status===409);
  sources.set(id,original);await store.acceptProposal(input);
  assert.equal(f.records.size,size,'same-operation recovery reuses the pair');
  assert.equal((await store.snapshot()).proposals[0].status,'accepted');
 });}
};
for(const name of process.argv[2]?[process.argv[2]]:Object.keys(cases)){await cases[name]();console.log('PASS proposal recovery:',name);}
