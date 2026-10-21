import {NextRequest,NextResponse} from 'next/server';
import {requireLearningOwner} from '@/lib/dojo/learningFoundation/access';
import {weavingRouteError} from '@/lib/dojo/weavingWorkflow/http';
import {readCompletion} from '@/lib/dojo/weavingWorkflow/completions';
import {WeavingError} from '@/lib/dojo/weavingWorkflow/model';
import {bundleVideo,listVideos,readVideoOutput,createVideo,saveVideo,outputVideo,handoffVideo} from '@/lib/dojo/shortVideo/store';
export const runtime='nodejs';export const dynamic='force-dynamic';
const json=(v:unknown)=>NextResponse.json(v,{headers:{'Cache-Control':'private, no-store'}});
export async function GET(req:NextRequest){try{requireLearningOwner(req);const p=req.nextUrl.searchParams;if(p.has('outputId'))return json({output:await readVideoOutput(p.get('outputId')!)});if(p.has('id')){const b=await bundleVideo(p.get('id')!);return json({...b,source:await readCompletion(b.project.completionId)});}return json({projects:await listVideos()});}catch(e){return weavingRouteError(e);}}
export async function POST(req:NextRequest){try{requireLearningOwner(req);return json(await createVideo(await req.json()));}catch(e){return weavingRouteError(e);}}
export async function PATCH(req:NextRequest){try{requireLearningOwner(req);const b=await req.json();if(b.action==='save')return json(await saveVideo(b));if(b.action==='output')return json(await outputVideo(b));if(b.action==='handoff')return json(await handoffVideo(b));throw new WeavingError('短片操作不正確');}catch(e){return weavingRouteError(e);}}
