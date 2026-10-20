import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
const css=readFileSync('app/reference-colors.css','utf8').replace(/\/\*[\s\S]*?\*\//g,'');
const allowed=/^(--[\w-]+|color|background|background-color|border-color|outline-color|opacity)$/;
for(const block of css.matchAll(/\{([^}]+)\}/g))for(const d of block[1].split(';').filter(x=>x.trim()))assert(allowed.test(d.split(':')[0].trim()),'Non-color declaration: '+d);
function lum(c){return c.match(/../g).map(h=>parseInt(h,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0)}
const results=[['forage add','253C5C','E4A650'],['forage entry','253C5C','F2BF78'],['weekly CTA','253C5C','E79397'],['weaving CTA','253C5C','E494BF'],['liaojie CTA','FFFFFF','5676AA']].map(([name,fg,bg])=>{assert(css.includes('#'+bg));const ratio=(Math.max(lum(fg),lum(bg))+.05)/(Math.min(lum(fg),lum(bg))+.05);assert(ratio>=4.5,name);return {name,fg,bg,ratio}});
writeFileSync('artifacts/reference-colors/evidence/contrast.json',JSON.stringify(results,null,2));console.log('PASS color-only declaration contract; five primary CTA pairs ≥ 4.5:1',results);
