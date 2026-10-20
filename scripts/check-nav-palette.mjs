import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
const root='artifacts/nav-palette/';
const phase=process.argv[2]||'after';
const rows=JSON.parse(readFileSync(root+phase+'/measurements.json')).filter(r=>r.page);
const before=JSON.parse(readFileSync(root+'before/measurements.json')).filter(r=>r.page);
const results=[];
for(const width of [390,430]){
 const same=rows.filter(r=>r.width===width),standard=same.find(r=>r.page==='today');
 for(const r of same){assert.deepEqual(r.nav,standard.nav,`${r.page} nav at ${width}`);const b=before.find(b=>b.page===r.page&&b.width===width);const content=x=>x.boxes.slice(0,x.boxes.findLastIndex(e=>e.tag==='NAV'));assert.deepEqual(content(r),content(b),`${r.page} content changed`);results.push({page:r.page,width,navHeight:r.nav[0].rect.h,contentElements:content(r).length,contentChanges:0});}
}
writeFileSync(root+'verification.json',JSON.stringify(results,null,2));console.log('PASS shared nav geometry/icons/styles and unchanged non-nav layout',results);
