import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NextRequest } from 'next/server.js';
import { loader } from './weaving-test-harness.mjs';
export async function fixture(){
 const dir=await mkdtemp(join(tmpdir(),'weaving-fixture-'));process.env.LEARNING_WRITE_LOCK_DIR=dir;process.env.ACCESS_KEY='weaving-fixture';
 const records=new Map(),claims=[];let writes=0,load;
 const dispatch=async fn=>load('lib/dojo/learningFoundation/writeOutcome.ts').trackLearningWrite(async()=>{writes++;return fn();});
 const queries={getKnowledgeEntry:async id=>{const row=records.get(id);if(!row)throw Error('missing row');return{id,標題:row.title,內容:JSON.stringify(row.value)};},listKnowledgeEntriesByPrefix:async prefix=>[...records].filter(([,r])=>r.title.startsWith(prefix)&&!r.archived).map(([id,r])=>({id,標題:r.title,內容:JSON.stringify(r.value)})),listInsightCards:async()=>[],listReadingBooks:async()=>[],listReadingNotes:async()=>[]};
 const mutations={createKnowledgeEntry:async row=>dispatch(()=>{const id=crypto.randomUUID();records.set(id,{title:row.標題,value:JSON.parse(row.內容)});return{id};}),updateKnowledgeEntry:async(id,row)=>dispatch(()=>{const old=records.get(id);records.set(id,{...old,title:row.標題??old.title,value:row.內容?JSON.parse(row.內容):old.value});return{id};}),archiveKnowledgeEntry:async id=>dispatch(()=>{records.get(id).archived=true;return{id};})};
 load=loader({'@/lib/notion/queries':queries,'@/lib/notion/mutations':mutations,'../knowledgeClaimStore':{listKnowledgeClaims:async()=>claims}});
 const req=(method,path,body,auth=true)=>new NextRequest('http://localhost'+path,{method,headers:{'content-type':'application/json',...(auth?{cookie:'dsc_access_key=weaving-fixture'}:{})},...(body?{body:JSON.stringify(body)}:{})});
 return {dir,claims,mutations,queries,records,load,req,writes:()=>writes,close:async()=>{await rm(dir,{recursive:true,force:true});delete process.env.LEARNING_WRITE_LOCK_DIR;delete process.env.ACCESS_KEY;}};
}
