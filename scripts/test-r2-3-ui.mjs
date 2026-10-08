import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import { isolatedServer } from "./isolated-practice-server.mjs";
const server=await isolatedServer(3023,"r2-3-ui-isolated"),output=process.env.R2_UI_OUTPUT_DIR??"/tmp/r2-3-ui";await mkdir(output,{recursive:true});
const items=[{id:"10000000-0000-4000-8000-000000000001",kind:"item",name:"心理學探索・長中文標題".repeat(4),status:"active"},{id:"10000000-0000-4000-8000-000000000002",kind:"item",name:"English for tarot interpretation and sustained interdisciplinary practice",status:"active"}];
let writes=0;let projected=false;const records=[];let browser;let diagnosticPage;
try{
 browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? {executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{}),args:["--no-sandbox"]});const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});await context.addCookies([{name:"dsc_access_key",value:"r2-3-ui-isolated",url:server.base}]);
 await context.route("**/*",async route=>{const req=route.request(),u=new URL(req.url());if(u.origin!==server.base)return route.abort();if(u.pathname==="/__r2-font"&&process.env.UI_CJK_FONT)return route.fulfill({contentType:"font/otf",body:readFileSync(process.env.UI_CJK_FONT)});if(!u.pathname.startsWith("/api/"))return route.continue();let body={},status=200;
 if(u.pathname==="/api/dojo/learning/foundation")body={entities:items,missing:[]};
 else if(u.pathname==="/api/dojo/practice-events"){
  const event={id:"a".repeat(64),eventVersion:1,eventType:"practice.completed",learningItemIds:[items[0].id],learningRecordId:records[0]?.id,sourceDate:"2026-09-20",practicedOn:"2026-10-01",quantity:1,unit:"段",projectionStatus:projected?"applied":"needs_retry",projections:{record:"applied",output:projected?"applied":"needs_retry",weekly:"unlinked"}};
  if(req.method()==="POST"){assert.deepEqual(req.postDataJSON(),{action:"retry",id:event.id});projected=true;event.projectionStatus="applied";event.projections.output="applied";writes++;body={event};}else body={events:[event],cursor:null};
 }
 else if(u.pathname==="/api/dojo/learning/records"){
  if(req.method()==="GET"){
   if(u.searchParams.get("id"))body={record:records.find(r=>r.id===u.searchParams.get("id"))};
   else{const offset=Number(u.searchParams.get("cursor")??0),limit=Number(u.searchParams.get("limit")??20),filtered=records.filter(r=>(!u.searchParams.get("status")||r.status===u.searchParams.get("status"))&&(!u.searchParams.get("learningItemId")||r.learningItemIds.includes(u.searchParams.get("learningItemId"))));body={records:filtered.slice(offset,offset+limit),cursor:offset+limit<filtered.length?String(offset+limit):null};}
  }else{const b=req.postDataJSON();if(req.method()==="PATCH"){const index=records.findIndex(r=>r.id===b.id);assert.equal(records[index].revision,b.revision);records[index]={...records[index],...b.input,revision:b.revision+1};body={record:records[index]};}else{assert.match(b.input.createRequestId,/^[0-9a-f-]{36}$/);const record={...b.input,id:crypto.randomUUID(),recordType:"learning-record/v1",revision:1};records.unshift(record);body={record};status=201;}writes++;}
 }else if(u.pathname==="/api/dojo/english-journal")body={practices:[],sources:[]};else if(u.pathname==="/api/dojo/entries")body={entries:[]};else{status=503;body={error:"隔離測試未提供此服務"};}
 return route.fulfill({status,contentType:"application/json",body:JSON.stringify(body)});
 });
 if(process.env.UI_CJK_FONT)await context.addInitScript(()=>{window.__r2FontReady=new FontFace("R2 CJK","url(/__r2-font)").load().then(f=>document.fonts.add(f)).catch(()=>null);document.addEventListener("DOMContentLoaded",()=>{const s=document.createElement("style");s.textContent="body,body *{font-family:'R2 CJK',Arial,sans-serif!important}";document.head.append(s);});});
 const page=await context.newPage();diagnosticPage=page;page.setDefaultTimeout(15000);const errors=[];page.on("pageerror",e=>errors.push(e.message));
 for(const width of [375,390,430]){
  console.log(`UI ${width}: create + refresh + edit + archive + guard`);await page.setViewportSize({width,height:844});await page.goto(`${server.base}/practice/records?new=1&learningItem=${items[0].id}`);await page.getByLabel("這次學了什麼？").waitFor();await page.getByLabel(items[1].name,{exact:true}).check();
  await page.getByLabel("這次學了什麼？").fill(`本次真正學習內容 ${width}：理解投射與解牌。`+"長中文與 English interpretation ".repeat(12));await page.getByLabel("我目前怎麼理解？").fill("先保留問題，不把一次練習視為掌握。");
  await page.getByRole("button",{name:"儲存草稿",exact:true}).click();await page.getByRole("status").filter({hasText:"已保存"}).waitFor();const id=records[0].id;assert.equal(records[0].learningItemIds.length,2);records[0].sourceRefs=[{type:"manual",id:"isolated-existing-source",label:"既有來源",status:"available"}];
  await page.reload();await page.getByLabel("這次學了什麼？").waitFor();assert.ok((await page.getByLabel("這次學了什麼？").inputValue()).includes(String(width)));
  await page.getByText("階段、主題與其他選填",{exact:true}).click();await page.getByLabel("來源網址（選填）").fill("https://example.test/learning");
  await page.getByRole("button",{name:"完成紀錄",exact:true}).click();await page.getByRole("status").filter({hasText:"已保存"}).waitFor();assert.equal(records.find(r=>r.id===id).status,"completed");assert.ok(records.find(r=>r.id===id).sourceRefs.some(r=>r.id==="isolated-existing-source"));
  await page.getByLabel("還有哪些問題？").fill("還沒保存的問題");let prompts=0;page.once("dialog",async d=>{prompts++;await d.dismiss();});await page.getByRole("link",{name:/返回學科工作空間/}).click();assert.equal(prompts,1);assert.ok((await page.getByLabel("還有哪些問題？").inputValue()).includes("還沒保存"));
  await page.setViewportSize({width,height:430});await page.getByRole("button",{name:"儲存草稿",exact:true}).scrollIntoViewIfNeeded();await page.getByRole("button",{name:"儲存草稿",exact:true}).click();await page.getByRole("status").filter({hasText:"已保存"}).waitFor();
  await page.setViewportSize({width,height:844});await page.getByRole("button",{name:"封存",exact:true}).click();await page.getByRole("button",{name:"恢復",exact:true}).waitFor();assert.equal(records.find(r=>r.id===id).status,"archived");await page.getByRole("button",{name:"恢復",exact:true}).click();await page.getByRole("button",{name:"封存",exact:true}).waitFor();
  await page.evaluate(()=>window.__r2FontReady);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:`${output}/record-${width}.png`,fullPage:true});
  await page.getByRole("link",{name:/返回學科工作空間/}).click();await page.getByRole("heading",{name:"心・知",exact:true}).waitFor();await page.getByRole("link",{name:"學習紀錄",exact:true}).click();await page.getByRole("link",{name:/完整歷程/}).click();await page.getByRole("heading",{name:"學習歷程",exact:true}).waitFor();console.log("list url",page.url());await page.getByLabel("狀態",{exact:true}).waitFor();await page.reload();await page.getByLabel("狀態",{exact:true}).selectOption("draft");await page.getByRole("link",{name:/本次真正學習內容/}).first().waitFor();if(!projected){const count=records.length;await page.getByRole("button",{name:"只重試投影",exact:true}).click();await page.getByText("光步：已套用 · 週盤：未連結",{exact:true}).waitFor();assert.equal(records.length,count);}
  const external={...records.find(r=>r.id===id),id:crypto.randomUUID(),originEventId:"b".repeat(64),practicedOn:null,learningItemIds:[],primaryLearningItemId:null,status:"draft",sourceRefs:[{type:"context",id:"source-session",label:"語境來源",url:"https://example.test/source-session",status:"available"}]};records.push(external);
  await page.goto(`${server.base}/practice/records?record=${external.id}`);
  await page.getByText(/來源日期未知/).waitFor();assert.equal(await page.locator('input[type="date"]').count(),0);
  await page.getByLabel("我目前怎麼理解？").fill(`語境筆記 ${width}`);await page.getByRole("button",{name:"儲存草稿",exact:true}).click();await page.getByRole("status").filter({hasText:"已保存"}).waitFor();
  await page.waitForFunction(()=>!history.state?.__practiceDraftGuard);
  await page.reload();await page.getByText(/來源日期未知/).waitFor();assert.equal(await page.getByLabel("我目前怎麼理解？").inputValue(),`語境筆記 ${width}`);
  assert.equal(records.find(r=>r.id===external.id).practicedOn,null);assert.equal(records.find(r=>r.id===external.id).learningItemIds.length,0);
  await page.goto(`${server.base}/practice/records`);await page.getByLabel("狀態",{exact:true}).waitFor();

 }
 const template=records[0];for(let i=0;i<181;i++)records.push({...template,id:crypto.randomUUID(),title:`早期歷程 ${i}`,whatIDid:`大量隔離紀錄 ${i}`,status:"completed"});
 await page.getByLabel("狀態",{exact:true}).selectOption("completed");await page.getByRole("link",{name:"早期歷程 0",exact:true}).waitFor();for(let i=0;i<9;i++){await page.getByRole("button",{name:"下一頁",exact:true}).click();await page.waitForFunction(n=>document.querySelectorAll(".learning-records article").length>=n,Math.min((i+2)*20,181));}await page.getByRole("link",{name:"早期歷程 180",exact:true}).waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:`${output}/history-430.png`,fullPage:false});
 assert.deepEqual(errors,[]);assert.ok(writes>=15);console.log("PASS R2-3 isolated UI 375/390/430: long bilingual text, one body/multi-item, draft/complete/edit/archive/restore, reload, discipline return/tab, pagination181, unsaved cancel, reduced keyboard viewport, safe-area CSS/no overflow");
}catch(e){console.error("failure URL",diagnosticPage?.url());console.error(await diagnosticPage?.locator(".practice-workspace").innerText());await diagnosticPage?.screenshot({path:`${output}/failure.png`,fullPage:true});throw e;}finally{await browser?.close();server.stop();}
