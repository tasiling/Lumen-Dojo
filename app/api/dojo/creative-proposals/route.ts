import {NextRequest,NextResponse} from 'next/server';
import {requireLearningOwner} from '@/lib/dojo/learningFoundation/access';
import {snapshot,scan,saveSettings,patchProposal,acceptProposal,runDue} from '@/lib/dojo/creativeProposals/store';
import {inspectWeavingOperation} from '@/lib/dojo/weavingWorkflow/operations';
import {WEAVING_OWNER} from '@/lib/dojo/weavingWorkflow/store';
import {weavingRouteError} from '@/lib/dojo/weavingWorkflow/http';
import {LearningError} from '@/lib/dojo/learningFoundation/model';
export const dynamic='force-dynamic';
const json=(v:unknown)=>NextResponse.json(v,{headers:{'Cache-Control':'no-store'}});
function error(e:unknown){const r=weavingRouteError(e);r.headers.set('Cache-Control','no-store');return r;}
export async function GET(req:NextRequest){try{requireLearningOwner(req);const id=req.nextUrl.searchParams.get('operationId');return json(id?{receipt:await inspectWeavingOperation(WEAVING_OWNER,id)}:await snapshot());}catch(e){return error(e);}}
export async function POST(req:NextRequest){try{requireLearningOwner(req);const b=await req.json();switch(b.action){case'scan':return json(await scan(b));case'settings':return json({settings:await saveSettings(b)});case'edit':return json({proposal:await patchProposal(b)});case'skip':return json({proposal:await patchProposal({...b,skip:true})});case'accept':return json(await acceptProposal(b));case'run_due':return json(await runDue());default:throw new LearningError('提案操作不正確');}}catch(e){return error(e);}}
