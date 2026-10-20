import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
const root='artifacts/reference-colors/';
const before=JSON.parse(readFileSync(root+'before/measurements.json'));
const after=JSON.parse(readFileSync(root+'after/measurements.json'));
assert.equal(before.length,8);assert.equal(after.length,8);
const results=before.map((b,i)=>{const a=after[i];assert.equal(a.page,b.page);assert.equal(a.width,b.width);assert.deepEqual(a.boxes,b.boxes,`${b.page} ${b.width}: layout changed`);return {page:b.page,width:b.width,elements:b.boxes.length,changed:0}});
writeFileSync(root+'evidence/layout-comparison.json',JSON.stringify(results,null,2));console.log('PASS all element rectangles unchanged',results);
