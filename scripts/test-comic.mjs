import assert from 'node:assert/strict';
import {fixture} from './weaving-fixture.mjs';
const f=await fixture();
try{
 const m=f.load('lib/dojo/comic/model.ts'),svg=f.load('lib/dojo/comic/svg.ts');
 const image={assetId:'a'.repeat(64),kind:'generated',tool:'imagegen',prompt:'fictional',sourceNote:'隔離原創',publicConfirmed:true};
 const d={title:'慢慢長',caption:'虛構測試',characters:[{id:'bird',name:'雲豆',description:'白鳥藍圍巾',reference:image}],panels:[{...m.newPanel('p1'),scene:'看小芽',dialogue:'怎麼還沒有長出來？',speaker:'雲豆',characterIds:['bird'],image,confirmed:true}]};
 assert.equal(m.parseComicDraft(d).panels[0].id,'p1');
 for(const invalid of [{...d,owner:'x'},{...d,panels:Array(13).fill(d.panels[0])},{...d,panels:[d.panels[0],d.panels[0]]},{...d,characters:[]},{...d,panels:[{...d.panels[0],dialogue:'長'.repeat(161)}]}])assert.throws(()=>m.parseComicDraft(invalid));
 assert.doesNotThrow(()=>m.assertComicReady(d));
 assert.throws(()=>m.assertComicTransition(d,{...d,panels:[{...d.panels[0],dialogue:'偷改'}]}),/確認/);
 assert.throws(()=>m.assertComicTransition(d,{...d,panels:[m.newPanel('other')]}),/確認/);
 assert.throws(()=>m.assertComicTransition(d,{...d,characters:[{...d.characters[0],description:'紅圍巾'}]}),/角色/);
 const unlocked={...d,panels:[{...d.panels[0],confirmed:false}]};assert.doesNotThrow(()=>m.assertComicTransition(d,unlocked));
 const next={...unlocked,panels:[...unlocked.panels,{...m.newPanel('p2'),image,dialogue:'先喝杯茶。'}]};
 const changed={...next,panels:next.panels.map(p=>p.id==='p2'?{...p,image:{...image,assetId:'b'.repeat(64)}}:p)};
 m.assertComicTransition(next,changed);assert.deepEqual(changed.panels[0],next.panels[0]);
 assert.equal(m.comicSheets({...d,panels:Array.from({length:5},(_,i)=>({...d.panels[0],id:`p${i}`}))}).length,2);
 assert.throws(()=>m.assertComicReady({...d,panels:[{...d.panels[0],confirmed:false}]}),/確認/);
 assert.throws(()=>m.assertComicReady({...d,panels:[{...d.panels[0],dialogue:'a\n'.repeat(8)}]}),/版面/);
 assert(!svg.comicSvg({...d,panels:[{...d.panels[0],speaker:'',dialogue:''}]},0,{}).includes('<text xml:space="preserve" x="84"'),'silent panels must not create zero-width text that blocks rasterization');
 const s=svg.comicSvg({...d,title:'<script>字&'},0,{});assert(!s.includes('<script>'));assert(s.includes('&lt;script&gt;'));assert(!s.includes('href="javascript:'));
 assert.throws(()=>svg.comicSvg(d,0,{[image.assetId]:'javascript:alert(1)'}),/圖片/);
 console.log('PASS comic strict limits/refs/confirmed panel and character guard/local replacement/sheets/overflow/escaped SVG');
}finally{await f.close();}
