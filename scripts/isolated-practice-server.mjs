import assert from 'node:assert/strict';
import {existsSync,createWriteStream} from 'node:fs';
import {spawn} from 'node:child_process';
export async function isolatedServer(port,key){
 for(const file of ['.env','.env.local','.env.development','.env.development.local']) assert(!existsSync(file),`Remove credential-bearing ${file} before isolated UI tests`);
 const base=process.env.UI_BASE_URL??`http://127.0.0.1:${port}`;
 assert.match(base,/^http:\/\/(127\.0\.0\.1|localhost):\d+$/);
 if(process.env.UI_BASE_URL)return{base,stop:()=>{}};
 const log=createWriteStream(`/tmp/r2-ui-server-${port}.log`);
 const child=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--webpack','--hostname','127.0.0.1','--port',String(port)],{env:{PATH:process.env.PATH,ACCESS_KEY:key,NEXT_TELEMETRY_DISABLED:'1'},stdio:['ignore','pipe','pipe']});
 const stop=()=>{child.kill('SIGTERM');log.end();};
 process.once('exit',stop);
 await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>{stop();reject(Error('Isolated server startup exceeded 45 seconds; inspect log'));},45000);child.once('exit',code=>{clearTimeout(timeout);reject(Error(`Isolated server exited ${code}`));});child.stdout.on('data',b=>{log.write(b);if(b.toString().includes('Ready')){clearTimeout(timeout);console.log(`READY isolated UI server ${port}`);resolve();}});child.stderr.on('data',b=>log.write(b));});
 return{base,stop};
}
