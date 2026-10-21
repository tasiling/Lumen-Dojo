import {NextRequest,NextResponse} from 'next/server';
import {requireLearningOwner} from '@/lib/dojo/learningFoundation/access';
import {weavingRouteError} from '@/lib/dojo/weavingWorkflow/http';
import {WeavingError} from '@/lib/dojo/weavingWorkflow/model';
import {releaseObject} from '@/lib/dojo/creativeReleases/model';
import {listReleases,readRelease,createRelease,saveRelease,releaseSources,legacyReleaseLinks} from '@/lib/dojo/creativeReleases/store';
export const dynamic='force-dynamic';export const runtime='nodejs';
const json=(v:unknown)=>NextResponse.json(v,{headers:{'Cache-Control':'private, no-store'}});
async function body(req:NextRequest){try{return releaseObject(await req.json());}catch{throw new WeavingError('發布紀錄資料格式不正確');}}
export async function GET(req:NextRequest){try{requireLearningOwner(req);const p=req.nextUrl.searchParams;if(p.has('id'))return json({release:await readRelease(p.get('id')!)});const publicationId=p.get('publicationId')??undefined,releases=await listReleases(publicationId);let sources:Awaited<ReturnType<typeof releaseSources>>={sources:[],missing:[]};if(publicationId)try{sources=await releaseSources(publicationId);}catch(e){sources.missing=[e instanceof Error?e.message:'來源暫時無法讀取'];}let legacy:Awaited<ReturnType<typeof legacyReleaseLinks>>=[],legacyWarning='';try{legacy=await legacyReleaseLinks(publicationId);}catch{legacyWarning='既有發布紀錄暫時無法讀取，請重試';}return json({releases,...sources,legacy,legacyWarning});}catch(e){return weavingRouteError(e);}}
export async function POST(req:NextRequest){try{requireLearningOwner(req);return json({release:await createRelease(await body(req))});}catch(e){return weavingRouteError(e);}}
export async function PATCH(req:NextRequest){try{requireLearningOwner(req);return json({release:await saveRelease(await body(req))});}catch(e){return weavingRouteError(e);}}
