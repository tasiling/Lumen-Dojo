import {NextRequest,NextResponse} from 'next/server';
import {requireLearningOwner} from '@/lib/dojo/learningFoundation/access';
import {weavingRouteError} from '@/lib/dojo/weavingWorkflow/http';
import {readCompletion} from '@/lib/dojo/weavingWorkflow/completions';
import {WeavingError} from '@/lib/dojo/weavingWorkflow/model';
import {bundlePodcast,listPodcasts,readPodcastOutput,createPodcast,savePodcast,outputPodcast,handoffPodcast} from '@/lib/dojo/podcast/store';
export const runtime='nodejs';export const dynamic='force-dynamic';
const json=(v:unknown)=>NextResponse.json(v,{headers:{'Cache-Control':'private, no-store'}});
export async function GET(req:NextRequest){try{requireLearningOwner(req);const p=req.nextUrl.searchParams;if(p.has('outputId'))return json({output:await readPodcastOutput(p.get('outputId')!)});if(p.has('id')){const b=await bundlePodcast(p.get('id')!);return json({...b,source:await readCompletion(b.project.completionId)});}return json({projects:await listPodcasts()});}catch(e){return weavingRouteError(e);}}
export async function POST(req:NextRequest){try{requireLearningOwner(req);return json(await createPodcast(await req.json()));}catch(e){return weavingRouteError(e);}}
export async function PATCH(req:NextRequest){try{requireLearningOwner(req);const b=await req.json();if(b.action==='save')return json(await savePodcast(b));if(b.action==='output')return json(await outputPodcast(b));if(b.action==='handoff')return json(await handoffPodcast(b));throw new WeavingError('Podcast操作不正確');}catch(e){return weavingRouteError(e);}}
