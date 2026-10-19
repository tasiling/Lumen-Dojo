import {execFileSync} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const out=mkdtempSync(join(tmpdir(),'weekly-personalized-'));
try{execFileSync(process.execPath,['node_modules/typescript/bin/tsc','--outDir',out,'--module','commonjs','--moduleResolution','node','--target','es2022','--esModuleInterop','--skipLibCheck','tests/weekly-personalized.test.ts'],{stdio:'inherit'});execFileSync(process.execPath,[join(out,'tests/weekly-personalized.test.js')],{stdio:'inherit'});execFileSync(process.execPath,['scripts/test-weekly-personalized-api.mjs'],{stdio:'inherit'});}finally{rmSync(out,{recursive:true,force:true})}
