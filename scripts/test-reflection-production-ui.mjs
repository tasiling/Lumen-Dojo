import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {spawn} from 'node:child_process';
for(const f of ['.env','.env.local','.env.production','.env.production.local'])assert.ok(!existsSync(f),'Credential-bearing environment file blocks isolated production test');
assert.ok(existsSync('.next/BUILD_ID'),'Run npm run build first');
const env={PATH:process.env.PATH,NEXT_TELEMETRY_DISABLED:'1',ACCESS_KEY:'r24-ui-isolated'};
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3035'],{env,stdio:['ignore','pipe','pipe']});
try {
 await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('Isolated production server startup exceeded 45 seconds')),45000);server.once('exit',c=>{clearTimeout(timeout);reject(Error('Production server exited '+c))});server.stdout.on('data',b=>{if(b.toString().includes('Ready')){clearTimeout(timeout);resolve()}});server.stderr.on('data',b=>process.stderr.write(b));});
 const child=spawn(process.execPath,['scripts/test-reflection-ui.mjs'],{env:{PATH:process.env.PATH,UI_BASE_URL:'http://127.0.0.1:3035'},stdio:'inherit'});
 const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve)});assert.equal(code,0,'Production reflection UI failed');
 console.log('PASS production-mode reflection mobile and daily handoff');
}finally{server.kill('SIGTERM');}
