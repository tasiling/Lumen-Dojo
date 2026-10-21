import {mkdir,copyFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
const skill=process.env.FFMPEG_SKILL_DIR??'/root/.codex/skills/remote-skills/skill-6ad7fefb94d8819181925e49fe15ae3e',out=process.argv[2]??('/tmp/lumen-podcast-trial-'+process.pid);await mkdir(out,{recursive:true});await copyFile('docs/creative-short-video-evidence/test-tone.wav',out+'/original.wav');
async function run(name,args,file){const result=execFileSync('python3',[skill+'/scripts/'+name+'.py',...args],{timeout:60000,encoding:'utf8'});await writeFile(out+'/'+file,result);return JSON.parse(result);}
await run('probe',[out+'/original.wav','--json'],'original-probe.json');
const cut=[out+'/original.wav','--start','1','--end','11','--accurate','-o',out+'/edited.wav'];await run('cut',[...cut,'--dry-run','--json'],'cut-plan.json');await run('cut',[...cut,'--json-brief'],'cut-result.json');
const loud=[out+'/edited.wav','-I','-16','--tp','-1.5','-o',out+'/final.wav'];await run('loudness',[...loud,'--dry-run','--json'],'loudness-plan.json');const final=await run('loudness',[...loud,'--json-brief'],'loudness-result.json');const check=await run('check',[out+'/final.wav','--platform','podcast','--json'],'podcast-check.json');console.log(JSON.stringify({out,summary:final.summary,ok:check.ok,warnings:check.warnings}));
