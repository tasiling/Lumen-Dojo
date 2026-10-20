import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { writeFile, unlink } from 'node:fs/promises';
import { isolatedServer } from './isolated-practice-server.mjs';
for(const file of ['.env.production','.env.production.local']) {
  assert(!existsSync(file),'Test will not overwrite an existing environment file');
  let app,error;
  try {
    await writeFile(file,'CREATIVE_ISOLATION_SENTINEL=synthetic-test-only\n',{flag:'wx'});
    try {app=await isolatedServer(3051,'weaving-fixture',{production:true});}catch(e){error=e;}
  } finally {app?.stop();await unlink(file);}
  assert(error,`Production isolation must reject ${file} before starting a server`);
  assert.match(error.message,new RegExp(file.replaceAll('.','\\.')));
}
console.log('PASS production preview rejects both production dotenv files before startup');
