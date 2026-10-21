import 'server-only';
import {runDue,backgroundReady} from './store';
const globalWorker=globalThis as typeof globalThis&{creativeProposalTimer?:ReturnType<typeof setInterval>};
export function startProposalWorker(){
 if(!backgroundReady()||globalWorker.creativeProposalTimer)return;
 let busy=false;
 const tick=async()=>{if(busy)return;busy=true;try{await runDue();}catch{console.warn('Creative proposal background check did not complete; retry on next tick.');}finally{busy=false;}};
 globalWorker.creativeProposalTimer=setInterval(()=>void tick(),15*60*1000);globalWorker.creativeProposalTimer.unref();
}
