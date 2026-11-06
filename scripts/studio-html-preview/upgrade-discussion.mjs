/** Upgrade the authoritative media HTML without rebuilding or replacing unrelated modules. */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import ts from 'typescript';
const base=process.env.STUDIO_DISCUSSION_BASE,out=process.env.STUDIO_DISCUSSION_OUT,source=process.env.STUDIO_DISCUSSION_SOURCE||'local-review';
if(!base||!out)throw Error('Set STUDIO_DISCUSSION_BASE and STUDIO_DISCUSSION_OUT');
let html=fs.readFileSync(base,'utf8');const baseHash=createHash('sha256').update(html).digest('hex');
const baseVersion=baseHash==='3d332753dfb099e10f504be7c91094a76a4b698bfc6d135836869fd18bea792b'?9:8;if(baseVersion!==9&&baseHash!=='05e6e8d5c78df984a070fd685b16d15b5a328fce43e5402cc999e0b2bb24d5d9')throw Error('Media base differs from reviewed Library version 8; review the newer file first');
const targets=[{id:46,path:'app/components/creativeStudio/StudioWorkspace.tsx',marker:'function Editor('},{id:7,path:'lib/dojo/creativeStudio/researchWorkflow.ts',marker:'function jsonBlock('},{id:62,path:'app/components/creativeStudio/ResearchWorkbench.tsx',marker:'function ResearchWorkbench('}];
const before=html;const changed=[];
for(const t of targets){
 const pattern=new RegExp('(^'+t.id+':\\[function\\(require,module,exports\\)\\{\\n)([\\s\\S]*?)(\\n\\},(\\{[^\\n]*\\})\\])','m'),m=html.match(pattern);
 if(!m||!m[2].includes(t.marker))throw Error('Bundled module identity mismatch '+t.path);
 const code=ts.transpileModule(fs.readFileSync(t.path,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 const map=JSON.parse(m[4]);for(const r of code.matchAll(/\brequire\(["']([^"']+)["']\)/g))if(!(r[1] in map))throw Error('New dependency requires explicit media bundle merge: '+r[1]);
 html=html.slice(0,m.index)+m[1]+code+m[3]+html.slice(m.index+m[0].length);changed.push({id:t.id,file:t.path,oldHash:createHash('sha256').update(m[2]).digest('hex'),newHash:createHash('sha256').update(code).digest('hex')});
}
const css=fs.readFileSync('app/components/creativeStudio/studio.css','utf8').split('/* Research dialogue:')[1];if(!css)throw Error('Missing discussion styles');
html=html.replace(/<meta name="lumen-discussion-source"[^>]*>/g,'');
html=html.replace('</head>','<meta name="lumen-discussion-source" content="'+source+'"><style id="research-discussion-update">/* Research dialogue:'+css+'</style></head>');
html=html.replace(/草稿第 (?:6|9) 版 · 2026.11.06｜(?:媒體討論與完成區|研究多輪討論與媒體製作)/,'草稿第 10 版 · 2026.11.06｜直接接續 B 回覆與研究討論');
// Verify every unrelated compiled module byte-for-byte, including media and local storage adapters.
const modules=s=>new Map([...s.matchAll(/^(\d+):\[function\(require,module,exports\)\{\n([\s\S]*?)\n\},(\{[^\n]*\})\]/gm)].map(m=>[m[1],m[2]+m[3]]));
const oldModules=modules(before),newModules=modules(html);for(const [id,text] of oldModules)if(!targets.some(t=>String(t.id)===id)&&newModules.get(id)!==text)throw Error('Unrelated module changed '+id);
fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,html);
const report={baseHash,baseVersion,source,changed,preservedModules:oldModules.size-targets.length,bytes:Buffer.byteLength(html),sha256:createHash('sha256').update(html).digest('hex')};fs.writeFileSync('/tmp/discussion-bundle-results.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
