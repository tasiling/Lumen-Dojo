import cp from "node:child_process";
import {syncBuiltinESMExports} from "node:module";
const spawn=cp.spawn;cp.spawn=(cmd,args,opts)=>{if(args?.includes("dev")&&args.some(a=>a.includes("next/dist/bin/next"))){args=args.map(a=>a==="dev"?"start":a).filter(a=>a!=="--webpack");}return spawn(cmd,args,opts);};syncBuiltinESMExports();
import { chromium } from "/workspace/scratch/3c8ef09c40b7/dojo-routing/node_modules/playwright/index.mjs";
const launch=chromium.launch.bind(chromium);chromium.launch=opts=>launch({...opts,executablePath:"/root/.cache/ms-playwright/chromium_headless_shell-1194/chrome-linux/headless_shell"});
