import {NextRequest,NextResponse} from 'next/server';
import {requireLearningOwner} from '@/lib/dojo/learningFoundation/access';
import {weavingRouteError} from '@/lib/dojo/weavingWorkflow/http';
import {readCompletion} from '@/lib/dojo/weavingWorkflow/completions';
import {WeavingError} from '@/lib/dojo/weavingWorkflow/model';
import {prepareLongVideoPackage,prepareLongVideo,bundleLongVideo,listLongVideos,readLongVideoOutput,createLongVideo,saveLongVideo,outputLongVideo,handoffLongVideo} from '@/lib/dojo/longVideo/store';
export const runtime='nodejs';export const dynamic='force-dynamic';
const json=(v:unknown)=>NextResponse.json(v,{headers:{'Cache-Control':'private, no-store'}});
export async function GET(req:NextRequest){try{requireLearningOwner(req);const p=req.nextUrl.searchParams;if(p.has('outputId'))return json({output:await readLongVideoOutput(p.get('outputId')!)});if(p.has('id')){if(p.has('packageVersionId'))return json(await prepareLongVideoPackage({projectId:p.get('id'),versionId:p.get('packageVersionId'),kind:p.get('packageKind')??'json',expectedRevision:Number(p.get('expectedRevision'))}));if(p.has('renderVersionId'))return json(await prepareLongVideo({projectId:p.get('id'),versionId:p.get('renderVersionId'),expectedRevision:Number(p.get('expectedRevision'))}));const b=await bundleLongVideo(p.get('id')!);return json({...b,source:await readCompletion(b.project.completionId)});}return json({projects:await listLongVideos()});}catch(e){return weavingRouteError(e);}}
export async function POST(req:NextRequest){try{requireLearningOwner(req);return json(await createLongVideo(await req.json()));}catch(e){return weavingRouteError(e);}}
export async function PATCH(req:NextRequest){try{requireLearningOwner(req);const b=await req.json();if(b.action==='save')return json(await saveLongVideo(b));if(b.action==='output')return json(await outputLongVideo(b));if(b.action==='handoff')return json(await handoffLongVideo(b));throw new WeavingError('長影片操作不正確');}catch(e){return weavingRouteError(e);}}
