import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Module,createRequire} from 'node:module';
import {dirname,resolve} from 'node:path';
import ts from 'typescript';
const require=createRequire(import.meta.url),cache=new Map(),rows=new Map();let boardWrites=0;
function load(file){file=resolve(file);if(cache.has(file))return cache.get(file).exports;const m=new Module(file);cache.set(file,m);m.require=s=>s==='server-only'?{}:s==='./notionStore'?{readJsonRecord:async title=>rows.has(title)?{value:rows.get(title)}:null,upsertJsonRecord:async(title,value)=>{boardWrites++;rows.set(title,value);}}:s==='./learningStore'?{syncLearningActivity:async()=>{}}:s.startsWith('.')?load(resolve(dirname(file),s)+'.ts'):require(s);m._compile(ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file);return m.exports;}
const f=load('lib/dojo/formal.ts'),p=load('lib/dojo/practiceEvents/projection.ts');
const week='2026-10-12';let board=f.emptyWeeklyBoard(week);board.cells[0]={...board.cells[0],text:'Existing VF weekly',learning:{trackKey:'english',templateKey:'vocabforge-scientific-week',skill:'words',path:'practice'}};rows.set(f.bingoRecordTitle(week),board);
for(let day=0;day<3;day++){const date=f.addCalendarDays(week,day);let record=f.emptyDailyRecord(date);for(let round=0;round<2;round++)record=p.addVocabulary(record,{id:`${day}-${round}`,practicedOn:date,occurredAt:`${date}T12:00:00Z`,standardRound:true});rows.set(f.dailyRecordTitle(date),record);}
const sync=load('lib/dojo/englishRhythm.ts').syncVocabForgeWeeklyBingo;
let result=await sync(week);assert.equal(result.summary.rounds,0,'unbound external VF facts must not leak into the legacy automatic weekly template');assert.equal(result.summary.completed,false);assert.equal(result.board.cells[0].completed,false);
for(let day=0;day<3;day++){const record=rows.get(f.dailyRecordTitle(f.addCalendarDays(week,day)));record.practiceEventVocabulary.manualRounds=2;}
result=await sync(week);assert.equal(result.summary.rounds,6,'existing deliberate manual VF progress retains its weekly behavior');assert.equal(result.summary.completed,true);assert.ok(boardWrites>0);
console.log('PASS actual legacy VF weekly boundary: unbound source facts excluded; existing manual counters and rules preserved');
