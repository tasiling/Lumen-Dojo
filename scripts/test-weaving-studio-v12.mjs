import assert from "node:assert/strict";
import { fixture } from "./weaving-fixture.mjs";

const source = { bookId:"book", noteId:"note", bookTitle:"fixture", label:"§1" };
const manual = { id:"shared", cardId:"canonical-shared", ...source, share:true, text:"照護", quote:"我的原句", locator:"§1", type:"觀點" };
const round = {id:"round", source, result:{
  turns:[{role:"我",text:"願意停一下"},{role:"GPT",text:"停一下嗎？"}],
  candidates:[
    {id:"1",type:"觀點",anchor:"T1",text:"停一下",quote:"願意停一下",state:"confirmed"},
    {id:"2",type:"洞察",anchor:"T2",text:"再問一次",quote:"停一下嗎？",state:"pending"},
    {id:"3",type:"洞察",anchor:"T1",text:"略",quote:"停一下",state:"skipped"},
    {id:"4",type:"觀點",anchor:"T1",text:"另一個角度",quote:"願意停一下",state:"confirmed"}
  ]
}};
const f = await fixture({
  "@/lib/reading/discussionStore":{listManualCards:async()=>[manual,{...manual,id:"secret",share:false,cardId:"canonical-secret"}],listStudioDiscussions:async()=>[{id:"thread",rounds:[round]}]},
  "@/lib/notion/queries":{listKnowledgeEntriesByPrefix:async()=>[],listReadingBooks:async()=>[],listInsightCards:async()=>[{id:"canonical-secret",insight:"未分享"},{id:"hidden",insight:"私人"},{id:"c10bf0f2-bc1f-474c-bbdd-35be14b926b1",insight:"已確認"}]},
  "../creativeSources/store":{sourcePolicies:{list:async()=>[{discovery:"private",ref:{sourceType:"reading_insight",sourceId:"hidden"}}]}}
});
try {
  const {studioCards}=f.load("lib/dojo/weavingStudio/catalog.ts");
  const {cards}=await studioCards();
  assert.deepEqual(cards.map(c=>c.id),["manual:shared","discussion:round:1","discussion:round:2","discussion:round:4","insight:c10bf0f2-bc1f-474c-bbdd-35be14b926b1"]);
  assert.match(cards[2].author,/GPT/);
  assert.match(cards[1].url,/discussion=thread.*round=round/);
  assert.equal(cards[1].sourceKey,cards[3].sourceKey);
  const store=f.load("lib/dojo/weavingStudio/store.ts");
  const update=(key,before,after)=>({key,before,after});
  const save=(...changes)=>store.changeStudio({changes});
  const topic="topicExtras:origin", key="work:test";
  const first={title:"稿件",body:"原稿"}, a={cardId:"a"}, b={cardId:"b"};
  await save(update(key,null,first),update(topic,null,{cardUses:[a]}));
  await save(update(topic,null,{cardUses:[b]}));
  let state=await store.readStudio();
  assert.deepEqual(state.records[topic].cardUses.map(x=>x.cardId).sort(),["a","b"]);
  const renamed={...first,title:"改名"};
  await save(update(key,first,renamed));
  await save(update(key,first,{...first,body:"改稿"}));
  state=await store.readStudio();
  assert.deepEqual(state.records[key],{title:"改名",body:"改稿"});
  const revision=state.revision;
  await assert.rejects(save(update("work:must-not-commit",null,{id:"extra"}),update(key,first,{...first,body:"衝突"})), e=>e.status===409);
  assert.deepEqual(await store.readStudio(),state);
  await save(update(key,first,{...first,body:"改稿"}));
  assert.equal((await store.readStudio()).revision,revision);
  console.log("PASS source visibility, quote identity, atomic multi-record updates, independent client edits, batch link merge and idempotent retries");
} finally {await f.close();}
