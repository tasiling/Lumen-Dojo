import {execFileSync} from "node:child_process";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
const dir=mkdtempSync(join(tmpdir(),"r25c-vocab-"));
try{execFileSync("node_modules/.bin/tsc",["--outDir",dir,"--module","commonjs","--moduleResolution","node","--target","es2022","--esModuleInterop","--skipLibCheck","tests/vocab-projection.test.ts"],{stdio:"inherit"});execFileSync("node",[join(dir,"tests/vocab-projection.test.js")],{stdio:"inherit"});}finally{rmSync(dir,{recursive:true,force:true});}
