import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const tokens=JSON.parse(readFileSync('lib/dojo/design-v2/color-tokens.json','utf8'));
const css=readFileSync('app/design-v2-tokens.css','utf8');
const today=readFileSync('lib/dojo/todayCalendarUi.ts','utf8');
for(const key of ['bingo','forage']){const t=tokens.themes[key];for(const value of [t.gradient.css,t.background,t.surface,t.surfaceTint,t.decorativeBorder,t.accent,t.ink,t.mutedInk])assert(css.includes(value),key+': '+value);}
for(const key of ['practice','forage','weaving','liaojie','dao','closing'])assert(today.includes(tokens.themes[key].gradient.css),key+' entry');
const tc=readFileSync('app/today-calendar.css','utf8');assert(tc.includes('width:230px;height:230px'));assert(tc.includes('width:285px;height:285px'));assert(tc.includes('linear-gradient(135deg,#F2C8D1 0%,#DDD9EF 48%,#B9CCE8 100%)'));
const luminance=hex=>{const c=hex.match(/[\da-f]{2}/gi).map(n=>parseInt(n,16)/255).map(n=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4);return c[0]*.2126+c[1]*.7152+c[2]*.0722};
for(const key of ['bingo','forage']){const ratio=1.05/(luminance(tokens.themes[key].accent)+.05);assert(ratio>=4.5);console.log(key+' white-on-accent contrast: '+ratio.toFixed(2)+':1');}
console.log('PASS v2 token parity, destination gradients, original today hero/glass dimensions and primary text contrast');
