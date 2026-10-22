import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'playwright';
import {isolatedServer} from './isolated-practice-server.mjs';

const server=await isolatedServer(3061,'reading-visual-fixture');
const bookId='22222222-2222-4222-8222-222222222222';
const book={id:bookId,title:'帶著問題閱讀：觀察與理解',author:'測試作者',readCount:1,subject:null,reason:null,question:'我如何把觀察變成自己的理解？',status:'閱讀中',insightCardIds:[],createdAt:'2026-10-01'};
const note={id:'11111111-1111-4111-8111-111111111111',text:'先停下來觀察，再用自己的話描述。',kind:'thought',metadata:{},editable:true,createdAt:'2026-10-01'};
const card={id:'44444444-4444-4444-8444-444444444444',insight:'留意每天讓我放慢腳步的時刻',sourceBookId:bookId,sourceBookTitle:book.title,sourceNoteId:note.id,actionType:'觀察型',action:'每天記下一個觀察',status:'觀察中',nextVisitAt:'2026-10-22',result:'',programApplication:'未定',topics:[],postponementCount:0};
const out=process.env.READING_VISUAL_EVIDENCE_DIR??'/tmp/reading-visual-evidence';mkdirSync(out,{recursive:true});
let browser,page;const errors=[];let writes=0;
try {
 browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:390,height:844}});
 await context.addCookies([{name:'dsc_access_key',value:'reading-visual-fixture',url:server.base}]);
 await context.route('**/api/**',async route=>{
  const req=route.request(),p=new URL(req.url()).pathname;
  assert.equal(req.method(),'GET',`Visual check must not write: ${p}`);
  if(req.method()!=='GET')writes++;
  if(p===`/api/dojo/reading/books/${bookId}`)return route.fulfill({json:{book,notes:[note],cards:[card]}});
  if(p==='/api/dojo/reading/books')return route.fulfill({json:{books:[book]}});
  if(p==='/api/dojo/reading/cards')return route.fulfill({json:{cards:[card],todayISO:'2026-10-22'}});
  if(p.endsWith('/annotations'))return route.fulfill({json:{annotation:null,subjects:[],effective:{topics:[],learningItemIds:[],inheritedLearningItemIds:[]}}});
  return route.fulfill({json:{entries:[],books:[],cards:[],bundles:[],items:[],warnings:[],complete:true,cursor:null}});
 });
 page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(12000);
 for(const [path,heading] of [['/reading','閱讀筆記'],[`/reading/books/${bookId}`,book.title],['/reading/cards','洞察卡片庫'],['/reading/visits','今日回訪']]) {
  await page.goto(server.base+path);await page.getByRole('heading',{name:heading,exact:true}).waitFor();
  await page.locator(path==='/reading'?'.reading-book-card':path==='/reading/cards'?'.reading-library-card':path==='/reading/visits'?'.reading-visit-card':'.reading-source-note').first().waitFor();
  for(const width of [320,375,390,430,1024]) {
   await page.setViewportSize({width,height:844});
   const result=await page.evaluate(()=>{
    const hero=document.querySelector('.reading-hero,.reading-page-intro,.reading-session-head');
    const nav=document.querySelector('.nav'),r=nav.getBoundingClientRect();
    return {overflow:document.documentElement.scrollWidth>innerWidth+1,gradient:getComputedStyle(hero).backgroundImage,color:getComputedStyle(hero.querySelector('h1')).color,navCentered:Math.abs(r.x+r.width/2-innerWidth/2)<2,navWidth:r.width,smallButtons:[...document.querySelectorAll('.reading-ui button')].filter(b=>b.getBoundingClientRect().height>0&&b.getBoundingClientRect().height<43).map(b=>b.textContent)};
   });
   assert.equal(result.overflow,false,`${path} overflows ${width}`);assert.match(result.gradient,/linear-gradient/);assert.equal(result.color,'rgb(37, 60, 92)');assert(result.navCentered);assert(result.navWidth<=560);assert.deepEqual(result.smallButtons,[],`${path} small targets at ${width}`);
  }
  await page.setViewportSize({width:390,height:844});
  if(path==='/reading'||path.includes('/books/')) await page.screenshot({path:`${out}/${path==='/reading'?'shelf':'book'}-preview.jpg`,type:'jpeg',quality:80});
  await page.screenshot({path:`${out}/${path==='/reading'?'shelf':path.split('/').at(-1)===bookId?'book':path.split('/').at(-1)}-390.png`,fullPage:true});
 }
 await page.goto(server.base+'/reading');await page.getByRole('button',{name:'開始一本書',exact:true}).click();await page.getByRole('dialog').waitFor();
 assert.equal(await page.getByRole('button',{name:'開始閱讀',exact:true}).isDisabled(),true);
 await page.locator('.reading-form-sheet input').first().fill('新的測試書');await page.locator('.reading-question-input').fill('我想理解什麼？');assert.equal(await page.getByRole('button',{name:'開始閱讀',exact:true}).isEnabled(),true);
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:`${out}/book-form-390.png`,fullPage:true});await page.getByRole('button',{name:'關閉',exact:true}).click();
 await page.getByRole('button',{name:'繼續閱讀',exact:true}).click();await page.getByRole('heading',{name:book.title,exact:true}).waitFor();
 await page.getByRole('button',{name:/讀前/}).click();await page.getByRole('heading',{name:'先做一點小預習'}).waitFor();await page.getByRole('button',{name:'進入閱讀中',exact:true}).click();await page.getByRole('heading',{name:'自由筆記',exact:true}).waitFor();
 await page.getByRole('button',{name:'提煉洞察',exact:true}).first().click();await page.getByRole('dialog').waitFor();await page.screenshot({path:`${out}/insight-form-390.png`,fullPage:true});await page.getByRole('button',{name:'關閉',exact:true}).click();
 await page.getByRole('button',{name:'前往讀後復盤',exact:true}).click();await page.getByRole('heading',{name:'收束這輪閱讀',exact:true}).waitFor();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 await page.goto(server.base+'/reading/visits');await page.getByRole('button',{name:'留下本次觀察',exact:true}).click();await page.getByText('這一輪觀察到什麼？',{exact:true}).waitFor();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:`${out}/visit-observation-390.png`,fullPage:true});
 await page.goto(server.base+'/forage/records');await page.locator('.forage-shell').waitFor();assert.equal(await page.locator('.reading-shell').count(),0);assert.equal(await page.locator('.forage-shell').count(),1);
 assert.equal(writes,0);assert.deepEqual(errors,[]);console.log('PASS reading routes × widths 320/375/390/430/1024; honey hero, centered navigation, 44px buttons, book form validation, all reading stages, insight modal, visit panel, route isolation; zero data writes/page errors');
} catch(error) {if(page)console.error(page.url(),(await page.locator('body').innerText()).slice(0,1200));throw error;} finally {await browser?.close();server.stop();}
