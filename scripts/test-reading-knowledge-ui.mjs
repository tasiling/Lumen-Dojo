import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {chromium} from 'playwright';
import {isolatedServer} from './isolated-practice-server.mjs';
import {loader} from './weaving-test-harness.mjs';
assert.ok(existsSync('app/dao/explore/page.tsx'),'reading knowledge explorer page must exist');
const server=await isolatedServer(3047,'rk-fixture');
const id='11111111-1111-4111-8111-111111111111',book='22222222-2222-4222-8222-222222222222',subject='33333333-3333-4333-8333-333333333333',cardId='44444444-4444-4444-8444-444444444444',claimId='55555555-5555-4555-8555-555555555555';
const item={ref:{kind:'reading_note',recordId:id,parentBookId:book},title:'按摩閱讀',text:'肩膀放鬆的理解',status:'thought',locator:'第一章・第3頁',href:`/reading/books/${book}?note=${id}`,originalTopics:['身體'],sourceVersion:'v1',bookId:book};
const bookData={id:book,title:'按摩閱讀',author:'測試作者',readCount:1,subject:null,reason:null,question:'如何理解肩膀',status:'閱讀中',startedAt:null,extractedAt:null,insightCardIds:[],createdAt:'2026-10-01'};
const note={id,text:item.text,kind:'thought',metadata:{chapter:'第一章',reflection:'這是獨立的理解片段'},editable:true,createdAt:'2026-10-01'};
const oldReview={...note,id:'66666666-6666-4666-8666-666666666666',kind:'review',text:'',metadata:{openQuestion:'舊輪次保留的追問',nextStep:'舊輪次的下一步'}};const newerReview={...oldReview,id:'77777777-7777-4777-8777-777777777777',text:'新的回顧',metadata:{openQuestion:'新的追問'}};
const card={id:cardId,insight:'練習後的洞察',sourceBookId:book,sourceBookTitle:'按摩閱讀',actionType:'觀察型',action:'觀察自己的感受',status:'已驗證',nextVisitAt:null,result:'我注意到了變化',programApplication:'未定',topics:[],extractedAt:null,postponementCount:0,createdAt:'2026-10-01'};
const claim=loader()('lib/dojo/knowledgeClaims.ts').newKnowledgeClaim({id:claimId,statement:'放慢速度可以幫助我觀察自己的感受。',claimant:'crystal',sources:[]});
let browser,page;
try{
 browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:390,height:844}});await context.addCookies([{name:'dsc_access_key',value:process.env.UI_TEST_KEY??'rk-fixture',url:server.base}]);let writes=0,requestCount=0,annotation=null,conflict=true;const mutations=[];const annotations=new Map();const refKey=r=>JSON.stringify(r);
 await context.route('**/api/**',async route=>{const req=route.request(),u=new URL(req.url());if(req.method()!=='GET'){writes++;mutations.push(u.pathname);}
 if(u.pathname==='/api/dojo/reading-knowledge'){
  if(u.searchParams.get('mode')==='books')return route.fulfill({json:{items:[{id:book,title:'按摩・第1讀'}],cursor:null}});
  requestCount++;const q=u.searchParams.get('q')??'';if(q==='慢')await new Promise(r=>setTimeout(r,700));const topic=u.searchParams.get('topic');return route.fulfill({json:{items:q==='無結果'||(topic&&!annotation?.topics.includes(topic))?[]:[{...item,text:q==='新'?'新搜尋的內容':item.text}],cursor:null,complete:q!=='部分',sourceStates:{reading_note:q==='部分'?'failed':'complete',reading_insight:'complete',knowledge_claim:'complete'},readAt:new Date().toISOString()}});
 }
 if(u.pathname.endsWith('/annotations')){
  if(req.method()==='POST'){const input=req.postDataJSON();if(conflict){conflict=false;return route.fulfill({status:409,json:{error:'分類已被更新，請重新讀取並保留你的修改'}});}annotation={...input,schema:1,owner:'fixture',revision:input.expectedRevision+1,createdAt:'now',updatedAt:'now'};annotations.set(refKey(input.ref),annotation);return route.fulfill({json:{annotation}});}
  const selectedAnnotation=u.searchParams.get('ref')?annotations.get(refKey(JSON.parse(u.searchParams.get('ref'))))??null:null;return route.fulfill({json:{annotation:selectedAnnotation,subjects:[{id:subject,name:'按摩',status:'active'}],effective:{topics:annotation?.topics??[],learningItemIds:annotation?.learningItemIds??[],inheritedLearningItemIds:[]}}});
 }
 if(u.pathname.endsWith('/relations'))return route.fulfill({json:{items:[],warnings:[],complete:true,cursor:null}});
 if(u.pathname===`/api/dojo/reading/books/${book}`)return route.fulfill({json:{book:bookData,notes:[note,oldReview,newerReview],cards:[card]}});
 if(u.pathname==='/api/dojo/reading/cards')return route.fulfill({json:{cards:[card],todayISO:'2026-10-19'}});
 if(u.pathname==='/api/dojo/knowledge-claims')return route.fulfill({json:{claims:[claim]}});
 return route.fulfill({json:{entries:[],claims:[],entities:[],missing:[],bundles:[],books:[bookData]}});
 });
 page=await context.newPage();page.on('pageerror',e=>console.error('PAGE ERROR',e.message));page.setDefaultTimeout(12000);page.setDefaultNavigationTimeout(60000);await page.goto(server.base+'/dao/explore');await page.getByText(item.text,{exact:true}).waitFor();
 await page.getByLabel('搜尋內容',{exact:true}).fill('慢');await page.waitForTimeout(300);await page.getByLabel('搜尋內容',{exact:true}).fill('新');await page.getByText('新搜尋的內容',{exact:true}).waitFor();await page.waitForTimeout(800);assert.equal(await page.getByText('新搜尋的內容',{exact:true}).count(),1);
 for(const width of [320,375,390,430,1024]){await page.setViewportSize({width,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`overflow at ${width}`);}
 await page.setViewportSize({width:390,height:844});await page.getByLabel('搜尋內容',{exact:true}).fill('無結果');await page.getByText('沒有符合條件的內容。',{exact:true}).waitFor();assert.equal(writes,0);assert(requestCount>=3);
 await page.getByLabel('搜尋內容',{exact:true}).fill('部分');await page.getByText('已搜尋部分資料，可繼續載入。',{exact:true}).waitFor();assert.equal(await page.getByText('沒有符合條件的內容。',{exact:true}).count(),0);
 await page.getByLabel('搜尋內容',{exact:true}).fill('');await page.getByText('已搜尋所有可讀取內容。',{exact:true}).waitFor();await page.getByText(item.text,{exact:true}).waitFor();
 await page.getByRole('button',{name:'主題與學科',exact:true}).click();await page.getByLabel('自訂主題',{exact:true}).fill('肩頸');await page.getByRole('checkbox',{name:'按摩',exact:true}).check();await page.getByRole('button',{name:'儲存主題與學科',exact:true}).click();await page.getByRole('alert').filter({hasText:'分類已被更新'}).waitFor();assert.equal(await page.getByLabel('自訂主題',{exact:true}).inputValue(),'肩頸');await page.getByRole('button',{name:'重新讀取目前分類，保留我的輸入',exact:true}).click();await page.getByRole('button',{name:'儲存主題與學科',exact:true}).click();await page.getByText(item.text,{exact:true}).waitFor();assert.equal(writes,2);assert.deepEqual(annotation.topics,['肩頸']);assert.deepEqual(annotation.learningItemIds,[subject]);assert(mutations.every(p=>p.endsWith('/annotations')));
 await page.locator('.rk-search summary').click();const filtered=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/dojo/reading-knowledge'&&new URL(r.url()).searchParams.get('topic')==='肩頸');await page.getByLabel('主題',{exact:true}).fill('肩頸');await filtered;await page.getByText('已搜尋所有可讀取內容。',{exact:true}).waitFor();await page.getByText(item.text,{exact:true}).waitFor();await page.screenshot({path:'/tmp/reading-knowledge-explore.png',fullPage:true});
 await page.goto(server.base+item.href);await page.locator(`[data-rk-id="${id}"]`).waitFor();assert.equal(await page.locator('.reading-source-note').getByText(item.text,{exact:true}).count(),1);await page.getByRole('button',{name:'主題與學科',exact:true}).first().waitFor();
 await page.goto(server.base+item.href+'&fragment=reflection');const reflection=page.locator('[data-rk-fragment=reflection]');await reflection.waitFor();await reflection.getByRole('button',{name:'主題與學科',exact:true}).click();await reflection.getByLabel('自訂主題',{exact:true}).fill('獨立理解');await reflection.getByRole('button',{name:'儲存主題與學科',exact:true}).click();await reflection.getByText('主題與學科已儲存。',{exact:true}).waitFor();assert.equal(annotation.ref.fragment,'reflection');assert.deepEqual(annotations.get(refKey(item.ref)).topics,['肩頸']);
 await page.goto(`${server.base}/reading/books/${book}?note=${oldReview.id}`);const historical=page.locator(`[data-rk-id="${oldReview.id}"]`);await historical.waitFor();assert.match(await historical.innerText(),/舊輪次保留的追問/);assert.match(await historical.innerText(),/舊輪次的下一步/);
 await page.goto(`${server.base}/reading/cards?card=${cardId}`);await page.getByRole('heading',{name:'指定的洞察',exact:true}).waitFor();await page.getByRole('heading',{name:card.insight,exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'查看來源',exact:true}).count(),1);
 await page.goto(`${server.base}/reading/cards?card=99999999-9999-4999-8999-999999999999`);await page.getByText('指定的洞察已不可用；可以切換下方分區查看其他內容。',{exact:true}).waitFor();
 await page.goto(`${server.base}/dao/knowledge?claim=${claimId}`);await page.locator(`[data-rk-id="${claimId}"]`).waitFor();assert(await page.getByRole('tab',{name:/待理解/}).getAttribute('aria-selected')==='true');
 await page.goto(server.base+'/dao');await page.getByRole('link',{name:/閱讀與知識總覽/}).waitFor();await page.getByRole('link',{name:/打開知識庫/}).waitFor();
 assert.equal(writes,3);console.log('PASS mobile widths320–1024, stale search, partial/empty state, conflict preserves input, classification save/filter, original note/card/claim locators, unavailable locator, Dao links; no content writes');
}catch(e){console.error(e);if(page){console.error((await page.locator('body').innerText()).slice(-7000));await page.screenshot({path:'/tmp/rk-ui-failure.png',fullPage:true});}throw e;}finally{await browser?.close();server.stop();}
