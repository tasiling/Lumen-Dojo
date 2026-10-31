import assert from 'node:assert/strict';
import {loader} from './weaving-test-harness.mjs';
const m=loader()('lib/dojo/illustrated/model.ts');let n=0;const check=(name,f)=>{f();n++;console.log('PASS',name)};
const p={...m.newPage('p1'),title:'可以調整的標題',body:'正文保留全文',layout:'text'};
check('native graphic layout accepts independent title/body controls and story dimensions',()=>{const typography={schema:1,size:'story',title:{x:90,y:200,width:850,fontSize:56,lineHeight:1.4,align:'center'},body:{x:120,y:520,width:800,fontSize:36,lineHeight:1.6,align:'left'}};const d=m.parseDeckDraft({title:'圖文',caption:'',pages:[{...p,typography}]});assert.deepEqual(d.pages[0].typography,typography);const l=m.layoutPage(d.pages[0]);assert.equal(l.height,1920);assert.equal(l.titleX,515);assert.equal(l.bodyX,120);});
check('legacy deck retains original layout before explicit adjustment',()=>{const l=m.layoutPage(p);assert.equal(l.titleY,195);assert.equal(l.bodyY,560);});
check('overlapping title/body blocks and off-canvas text are blocked',()=>{const t=m.defaultTypography(p);t.title.y=200;t.body.y=205;assert.ok(m.layoutPage({...p,typography:t}).overflow);t.title.y=1320;assert.ok(m.layoutPage({...p,typography:t}).overflow);});
check('invalid numeric settings and unknown control properties fail without truncation',()=>{const t=m.defaultTypography(p);t.title.fontSize=NaN;assert.throws(()=>m.parseDeckDraft({title:'圖文',caption:'',pages:[{...p,typography:t}]}));});
console.log(`PASS graphic v2 ${n}/${n}`);
