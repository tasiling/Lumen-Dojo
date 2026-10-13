import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {Module,createRequire} from 'node:module';
import {resolve,dirname} from 'node:path';
import ts from 'typescript';
const require=createRequire(import.meta.url),cache=new Map();
function load(file){file=resolve(file);if(cache.has(file))return cache.get(file).exports;const m=new Module(file);cache.set(file,m);m.filename=file;m.require=s=>s==='server-only'?{}:s.startsWith('@/')?load(resolve(s.slice(2))+'.ts'):s.startsWith('.')?load(resolve(dirname(file),s)+'.ts'):require(s);m._compile(ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file);return m.exports;}
const {practiceFlowLinks,assessmentScope,assessmentStartItem,resolvePracticeItem}=load('lib/dojo/practiceNavigation.ts');
const item='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002';
const links=practiceFlowLinks(item);assert.equal(links.find(l=>l.id==='assessments').href,'/practice/assessments?learningItem='+item);assert.equal(links.find(l=>l.id==='mastery').href,'/dao/mastery?learningItem='+item);assert.equal(links.find(l=>l.id==='external').href,'/practice/records','source inbox must include not-yet-associated results');assert.equal(links.find(l=>l.id==='emotion').href,'/practice/emotion');assert.ok(links.find(l=>l.id==='emotion').detail.includes('不自動'));
const defs=[{id:'old',capabilityId:'cap',definitionVersion:1,scope:{learningItemId:item}},{id:'new',capabilityId:'cap',definitionVersion:2,scope:{learningItemId:item}},{id:'other',capabilityId:'other',definitionVersion:1,scope:{learningItemId:other}}],attempts=[{id:'history',capabilityId:'cap',definitionVersion:1},{id:'foreign',capabilityId:'other',definitionVersion:1}];
assert.deepEqual(assessmentScope(defs,attempts,item).latest.map(d=>d.id),['new']);assert.deepEqual(assessmentScope(defs,attempts,item).attempts.map(a=>a.id),['history']);assert.equal(assessmentScope(defs,attempts,undefined).latest.length,2);assert.equal(assessmentScope(defs,attempts,'missing').attempts.length,0,'unknown scope must not silently reveal another item as selected');
const entities=[{id:other,kind:'item',status:'active'},{id:item,kind:'item',status:'active'}];assert.equal(assessmentStartItem(entities,item),item);assert.equal(assessmentStartItem(entities,'missing'),'');entities[1].status='archived';assert.equal(assessmentStartItem(entities,item),'','archived selected item cannot silently fall back to first');assert.equal(assessmentStartItem(entities,undefined),other);
console.log('PASS R2 navigation: scope preserved, latest rubrics and historical attempts correctly selected, unknown/archive scope does not fall back, private reflection and global external inbox remain distinct');

entities[0].legacyKey='english';assert.equal(resolvePracticeItem(entities,'english'),other,'legacy link resolves to its stable item ID');assert.equal(assessmentStartItem(entities,'english'),other);assert.equal(resolvePracticeItem(entities,'missing'),'missing','unknown context remains explicit');
