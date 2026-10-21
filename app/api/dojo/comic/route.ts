import { NextRequest, NextResponse } from 'next/server';
import { requireLearningOwner } from '@/lib/dojo/learningFoundation/access';
import { weavingRouteError } from '@/lib/dojo/weavingWorkflow/http';
import { bundleComic, createComic, saveComic, outputComic, prepareComic, handoffComic, listComics, readComicOutput } from '@/lib/dojo/comic/store';
import { readCompletion } from '@/lib/dojo/weavingWorkflow/completions';
import { WeavingError } from '@/lib/dojo/weavingWorkflow/model';
export const dynamic='force-dynamic';
const json=(value:unknown,status=200)=>NextResponse.json(value,{status,headers:{'Cache-Control':'private, no-store'}});
export async function GET(req:NextRequest){try{requireLearningOwner(req);const id=req.nextUrl.searchParams.get('id'),outputId=req.nextUrl.searchParams.get('outputId');if(outputId)return json({output:await readComicOutput(outputId)});if(id){const b=await bundleComic(id);return json({...b,source:await readCompletion(b.project.completionId)});}return json({comics:await listComics()});}catch(e){return weavingRouteError(e);}}
export async function POST(req:NextRequest){try{requireLearningOwner(req);return json(await createComic(await req.json()),201);}catch(e){return weavingRouteError(e);}}
export async function PATCH(req:NextRequest){try{requireLearningOwner(req);const b=await req.json();if(b.action==='prepare')return json(await prepareComic(b));if(b.action==='save')return json(await saveComic(b));if(b.action==='output')return json(await outputComic(b));if(b.action==='handoff')return json(await handoffComic(b));throw new WeavingError('短漫操作不正確');}catch(e){return weavingRouteError(e);}}
