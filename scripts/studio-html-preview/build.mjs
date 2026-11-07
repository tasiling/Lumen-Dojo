import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
const here=path.dirname(new URL(import.meta.url).pathname),root=path.resolve(here,'../..'),req=createRequire(root+'/package.json'),ts=req('typescript');
const sourceSha=process.env.STUDIO_PREVIEW_SOURCE || execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
if(!/^[0-9a-f]{40}$/.test(sourceSha))throw Error('Provide the exact source commit SHA');
const files=[],ids=new Map(),styles=new Set();
const production={react:'react/cjs/react.production.js','react/jsx-runtime':'react/cjs/react-jsx-runtime.production.js','react-dom':'react-dom/cjs/react-dom.production.js','react-dom/client':'react-dom/cjs/react-dom-client.production.js',scheduler:'scheduler/cjs/scheduler.production.js'};
const virtual={
 'next/image':"const React=require('react');const{previewAssetURL}=require('./local-api.ts');const Image=({src,unoptimized,priority,fill,...p})=>{const m=String(src).match(/[?&]id=([^&]+)/);return React.createElement('img',{...p,src:m?previewAssetURL(decodeURIComponent(m[1])):src})};module.exports=Image;module.exports.__esModule=true;module.exports.default=Image;",
 'next/link':"module.exports=require('./router.tsx').Link;module.exports.__esModule=true;module.exports.default=module.exports;",
 'next/navigation':"module.exports=require('./router.tsx');",
 'server-only':'module.exports={};',
 'node:crypto':"const {sha256Text}=require('@/lib/dojo/weavingWorkflow/clientIdentity');exports.createHash=()=>{let text='';return{update(v){text+=v;return this},digest(){return sha256Text(text)}}};",
};
function resolve(name,from){
 if(Object.hasOwn(virtual,name))return '@virtual/'+name;
 if(production[name]){const [pkg,...rest]=production[name].split('/');return path.join(path.dirname(req.resolve(pkg+'/package.json')),...rest);}
 const base=name.startsWith('@/')?path.join(root,name.slice(2)):name.startsWith('.')?path.resolve(from.startsWith('@virtual/')?here:path.dirname(from),name):req.resolve(name);
 for(const p of [base,base+'.ts',base+'.tsx',base+'.js',base+'/index.ts',base+'.in',base+'.ts.in',base+'.tsx.in'])if(fs.existsSync(p)&&fs.statSync(p).isFile())return p;
 throw Error('Cannot resolve '+name+' from '+from);
}
function add(file){
 if(ids.has(file))return ids.get(file);const id=files.length;ids.set(file,id);files.push(null);
 if(/\.css$/.test(file)){styles.add(file);files[id]={code:'module.exports={};',map:{}};return id;}
 let text=file.startsWith('@virtual/')?virtual[file.slice(9)]:fs.readFileSync(file,'utf8');
 if(file.endsWith('/lib/liaojieTools/snapshot.ts'))text=text.replaceAll('lumen-original-tools-v1','lumen-original-tools-preview-pr114');
 const code=/\.(ts|tsx)(\.in)?$/.test(file)?ts.transpileModule(text,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText:text;
 const map={};for(const m of code.matchAll(/\brequire\(["']([^"']+)["']\)/g)){const name=m[1];if(name.startsWith('node:')&&!virtual[name])throw Error('Server dependency '+name+' in '+file);map[name]=add(resolve(name,file));}
 files[id]={code,map};return id;
}
const entry=add(here+'/entry.tsx.in');
const chunks=fs.readdirSync(root+'/.next/static/chunks').filter(p=>p.endsWith('.css')).map(p=>fs.readFileSync(root+'/.next/static/chunks/'+p,'utf8'));
let css=chunks.join('\n');for(const p of styles)css+='\n'+fs.readFileSync(p,'utf8');css+='\n'+fs.readFileSync(here+'/preview.css','utf8');
css=css.replace(/@import\s+[^;]+;/g,'').replace(/url\([^)]*\)/g,'none');
const legacy={};for(const id of ['diamond','sanko-prompt','sanko-batch','magazine','carousel']){
 const html=fs.readFileSync(root+'/lib/liaojieTools/originals/'+id+'.html','utf8').replace(/<link[^>]*(?:href=["']https?:|rel=["']preconnect)[^>]*>/gi,'');
 legacy[id]=html.replace('</head>','<style>'+fs.readFileSync(root+'/lib/liaojieTools/field-theme.css','utf8')+'</style></head>');
}
const bridge=fs.readFileSync(root+'/lib/liaojieTools/frame-bridge.js','utf8');
const json=v=>JSON.stringify(v).replaceAll('<','\\u003c');
const runtime=`const process={env:{NODE_ENV:'production'}};const modules={${files.map((m,i)=>`${i}:[function(require,module,exports){\n${m.code}\n},${JSON.stringify(m.map)}]`).join(',\n')}};const cache={};function requireModule(id){if(cache[id])return cache[id].exports;const m=cache[id]={exports:{}};const [run,map]=modules[id];run(name=>{if(!(name in map))throw Error('Missing bundled dependency '+name);return requireModule(map[name])},m,m.exports);return m.exports;}requireModule(${entry});`;
const html='<!doctype html>\n<html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="color-scheme" content="light"><meta name="lumen-preview-source" content="tasiling/Lumen-Dojo PR114@'+sourceSha+'"><title>行光道場｜織光堂・聊解室 草稿操作預覽</title><style>'+css.replaceAll('</style','<\\/style')+'</style></head><body><div id="root"><p style="padding:32px">正在開啟創作工作台…</p></div><script>window.__LEGACY_TOOLS__='+json(legacy)+';window.__LEGACY_BRIDGE__='+json(bridge)+';</script><script>'+runtime.replaceAll('</script','<\\/script')+'</script></body></html>';
const out=process.env.STUDIO_PREVIEW_OUT || here+'/Lumen-Creative-Studio-Draft-PR114.html';fs.writeFileSync(out,html);console.log(JSON.stringify({file:out,modules:files.length,bytes:Buffer.byteLength(html)}));
