/** Browser and fixture server share the same isolated network; no production credentials. */
import {spawn} from 'node:child_process';

for (const script of ['test-studio-research-recovery-ui.mjs','test-studio-natural-handoff-ui.mjs','test-studio-discussion-entry-ui.mjs','test-studio-discussion-ui.mjs','test-studio-research-ui.mjs','test-studio-copy-ui.mjs','test-studio-b-repair-ui.mjs','test-studio-integration-ui.mjs','test-creative-studio-ui.mjs','test-studio-entry-ui.mjs']) {
 const server=spawn(process.execPath,['scripts/creative-studio-preview.mjs'],{stdio:['ignore','pipe','pipe']});
 try {
  await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(Error('Fixture preview startup exceeded 50 seconds')),50000);
   server.once('exit',code=>{clearTimeout(timer);reject(Error('Fixture preview exited '+code));});
   server.stderr.on('data',b=>process.stderr.write(b));
   server.stdout.on('data',b=>{process.stdout.write(b);if(b.toString().includes('Isolated creative studio preview listening')){clearTimeout(timer);resolve();}});
  });
  const child=spawn(process.execPath,['scripts/'+script],{env:{...process.env,STUDIO_UI_URL:'http://127.0.0.1:4173'},stdio:'inherit'});
  const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});
  if(code!==0)throw Error(script+' failed with exit '+code);
 } finally {
  server.kill('SIGTERM');
  await new Promise(resolve=>server.exitCode!==null?resolve():server.once('exit',resolve));
 }
}
