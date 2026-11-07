/** Upgrade the authoritative media HTML without rebuilding or replacing unrelated modules. */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import ts from 'typescript';
const base=process.env.STUDIO_DISCUSSION_BASE,out=process.env.STUDIO_DISCUSSION_OUT,source=process.env.STUDIO_DISCUSSION_SOURCE||'local-review';
if(!base||!out)throw Error('Set STUDIO_DISCUSSION_BASE and STUDIO_DISCUSSION_OUT');
let html=fs.readFileSync(base,'utf8');const baseHash=createHash('sha256').update(html).digest('hex');
const reviewed=new Map([['05e6e8d5c78df984a070fd685b16d15b5a328fce43e5402cc999e0b2bb24d5d9',8],['3d332753dfb099e10f504be7c91094a76a4b698bfc6d135836869fd18bea792b',9],['2a9a02b07418f0b53e17140064157202b61d4055e5586043e861fe288a5bf35a',10],['e3f823c45ed430b685106de3f63992b0559305a3bf52884d189f1bf132ac806b',11],['45827299c57bf1b2f468ea6d775a9f8e42dd2d8acd782294ddec15e04ab82e93',12],['3784d11f5bb1fd5040b0dcc26c0a4c8260eef8f2d5141a15d5f39245cc79624d',13],['04c28bcb3ce16dee4442bba7ca2d6a886fdd9f18b775b18a3dd9e82feba29f38',14],['6ff21046ac1263589fb83136d325fc8f2a7e8f517f680ca1c86779d08c7f839b',15]]),baseVersion=reviewed.get(baseHash);
if(baseVersion!==15)throw Error('This research failure-message repair requires reviewed authoritative media version 15; review a newer base before patching');
const targets=[{id:61,path:'app/components/creativeStudio/ResearchCandidates.tsx',marker:'function ResearchCandidates('},{id:46,path:'app/components/creativeStudio/StudioWorkspace.tsx',marker:'function Editor('},{id:7,path:'lib/dojo/creativeStudio/researchWorkflow.ts',marker:'function jsonBlock('},{id:62,path:'app/components/creativeStudio/ResearchWorkbench.tsx',marker:'function ResearchWorkbench('},{id:10,path:'lib/dojo/creativeStudio/collaboration.ts',marker:'function collaborationInstructions('},{id:57,path:'lib/dojo/creativeStudio/reply.ts',marker:'function previewReply('},{id:58,path:'app/components/creativeStudio/CollaborationPanel.tsx',marker:'function CollaborationPanel('},{id:60,path:'app/components/creativeStudio/BReplyIntake.tsx',marker:'function BReplyIntake('}];
const before=html;const changed=[];
for(const t of targets){
 const pattern=new RegExp('(^'+t.id+':\\[function\\(require,module,exports\\)\\{\\n)([\\s\\S]*?)(\\n\\},(\\{[^\\n]*\\})\\])','m'),m=html.match(pattern);
 if(!m||!m[2].includes(t.marker))throw Error('Bundled module identity mismatch '+t.path);
 const code=ts.transpileModule(fs.readFileSync(t.path,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 const map=JSON.parse(m[4]);let suffix=m[3];if(t.id===62&&code.includes('require("@/lib/dojo/creativeStudio/reply")')){if(!html.match(/^57:\[function[\s\S]*?function previewReply\(/m))throw Error('Reply dependency identity changed');map['@/lib/dojo/creativeStudio/reply']=57;suffix='\n},'+JSON.stringify(map)+']';}for(const r of code.matchAll(/\brequire\(["']([^"']+)["']\)/g))if(!(r[1] in map))throw Error('New dependency requires explicit media bundle merge: '+r[1]);
 html=html.slice(0,m.index)+m[1]+code+suffix+html.slice(m.index+m[0].length);changed.push({id:t.id,file:t.path,oldHash:createHash('sha256').update(m[2]).digest('hex'),newHash:createHash('sha256').update(code).digest('hex')});
}
// Adapter also contains newer media work: patch only the adoption transition, never rebuild it.
const adapterPattern=/(^6:\[function\(require,module,exports\)\{\n)([\s\S]*?)(\n\},(\{[^\n]*\})\])/m,adapter=html.match(adapterPattern);
if(!adapter||!adapter[2].includes("rw.articleSource = 'current';"))throw Error('Expected version 11 adoption transition missing; preserve media adapter');
const css=fs.readFileSync('app/components/creativeStudio/studio.css','utf8').split('/* Research dialogue:')[1];if(!css)throw Error('Missing discussion styles');
html=html.replace(/<meta name="lumen-discussion-source"[^>]*>/g,'');
html=html.replace(/<style id="research-discussion-update">[\s\S]*?<\/style>/g,'');
html=html.replace('</head>','<meta name="lumen-discussion-source" content="'+source+'"><style id="research-discussion-update">/* Research dialogue:'+css+'</style></head>');
html=html.replace(/草稿第 15 版 · 2026.11.07｜研究格式與接收同步修復/,'草稿第 16 版 · 2026.11.07｜研究辨識錯誤與恢復操作');
// Verify every unrelated compiled module byte-for-byte, including media and local storage adapters.
const modules=s=>new Map([...s.matchAll(/^(\d+):\[function\(require,module,exports\)\{\n([\s\S]*?)\n\},(\{[^\n]*\})\]/gm)].map(m=>[m[1],m[2]+m[3]]));
const oldModules=modules(before),newModules=modules(html);for(const [id,text] of oldModules)if(!changed.some(t=>String(t.id)===id)&&newModules.get(id)!==text)throw Error('Unrelated module changed '+id);
fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,html);
const report={baseHash,baseVersion,source,changed,preservedModules:oldModules.size-changed.length,bytes:Buffer.byteLength(html),sha256:createHash('sha256').update(html).digest('hex')};fs.writeFileSync('/tmp/discussion-bundle-results.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
