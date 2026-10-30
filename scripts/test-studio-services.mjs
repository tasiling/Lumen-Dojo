import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {fixture} from './weaving-fixture.mjs';
const f=await fixture();let n=0;const check=async(name,fn)=>{await fn();n++;console.log('PASS',name)};
try{
 assert.ok(existsSync('lib/dojo/creativeStudio/services.ts'),'owner service workflow must exist');
 const svc=f.load('lib/dojo/creativeStudio/services.ts'),model=f.load('lib/dojo/creativeStudio/serviceModel.ts');
 await check('Melbourne wall time uses correct date and UTC offset',async()=>{assert.equal(model.localToISO('2026-10-30T18:00','Australia/Melbourne'),'2026-10-30T07:00:00.000Z');assert.throws(()=>model.localToISO('2026-10-04T02:30','Australia/Melbourne'),/不存在|重複/);});
 let s=await svc.createService({operationId:'service-create-001',title:'隔離新月儀式'});
 s=await svc.saveService({operationId:'service-save-001',id:s.id,expectedRevision:s.revision,service:{...s,capacity:1,deadline:'2026-10-30T05:00:00.000Z',ritual:'2026-10-31T07:00:00.000Z',delivery:'2026-11-01T07:00:00.000Z',participants:[{id:'person-a',name:'隔離參加者A',question:'',reading:'只給A的內容',zone:'Asia/Taipei',reviewed:true,delivered:false}],collective:'集體訊息'}});
 await check('blank question accepted; capacity enforced before write',async()=>{await assert.rejects(()=>svc.saveService({operationId:'service-overflow-001',id:s.id,expectedRevision:s.revision,service:{...s,participants:[...s.participants,{...s.participants[0],id:'person-b',name:'B'}]}}),/名額/);});
 const synced=await svc.syncServiceCalendar({operationId:'service-calendar-001',id:s.id,expectedRevision:s.revision});
 await check('sync creates three distinct milestones and retries same event IDs',async()=>{assert.equal(Object.values(synced.calendarIds).length,3);assert.deepEqual((await svc.syncServiceCalendar({operationId:'service-calendar-001',id:s.id,expectedRevision:s.revision})).calendarIds,synced.calendarIds);});
 let changed=await svc.saveService({operationId:'service-save-002',id:s.id,expectedRevision:synced.revision,service:{...synced,ritual:'2026-11-02T07:00:00.000Z'}});
 changed=await svc.syncServiceCalendar({operationId:'service-calendar-002',id:s.id,expectedRevision:changed.revision});
 await check('reschedule moves same calendar record into new month without duplicate',async()=>{assert.equal(changed.calendarIds.ritual,synced.calendarIds.ritual);const row=f.records.get(changed.calendarIds.ritual);assert.ok(row.title.includes('20261102'));assert.equal(row.value.date,'2026-11-02');assert.equal(row.value.space,'liaojie');});
 await check('private delivery contains collective and exactly one recipient',async()=>{const text=svc.privateDelivery(changed,'person-a');assert.ok(text.includes('只給A的內容'));assert.ok(text.includes('集體訊息'));assert.throws(()=>svc.privateDelivery(changed,'person-b'));});
 const w=await svc.serviceWork({operationId:'service-work-001',id:s.id});
 await check('activity work resumes same native draft without customer question leakage',async()=>{assert.equal((await svc.serviceWork({operationId:'service-work-002',id:s.id})).id,w.id);assert.ok(!JSON.stringify(w.studio.source).includes('只給A的內容'));assert.equal(w.studio.serviceId,s.id);});
 await check('service API blocks unauthenticated recipient reads',async()=>{const route=f.load('app/api/dojo/liaojie-services/route.ts');assert.equal((await route.GET(f.req('GET','/api/dojo/liaojie-services',null,false))).status,401);});
 console.log(`PASS service integration ${n}/${n}`);
}finally{await f.close()}
