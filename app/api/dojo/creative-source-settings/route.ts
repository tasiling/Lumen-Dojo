import { NextRequest, NextResponse } from 'next/server';
import { requireLearningOwner } from '@/lib/dojo/learningFoundation/access';
import { learningOwner } from '@/lib/dojo/learningFoundation/store';
import { parseSourceRef,defaultPolicy } from '@/lib/dojo/creativeSources/model';
import { sourcePolicies } from '@/lib/dojo/creativeSources/store';
import { resolvePolicySource } from '@/lib/dojo/creativeSources/resolver';
import { inspectPolicyOperation } from '@/lib/dojo/creativeSources/operations';
import { weavingRouteError } from '@/lib/dojo/weavingWorkflow/http';
import { LearningError } from '@/lib/dojo/learningFoundation/model';
export const dynamic='force-dynamic';
const json=(v:unknown)=>NextResponse.json(v,{headers:{'Cache-Control':'no-store'}});
export async function GET(req:NextRequest){try{
  requireLearningOwner(req);const p=req.nextUrl.searchParams;
  if(p.get('operationId'))return json({receipt:await inspectPolicyOperation(learningOwner,p.get('operationId')!)});
  let raw:unknown;try{raw=JSON.parse(p.get('ref')??'null');}catch{throw new LearningError('來源識別不正確');}
  const ref=parseSourceRef(raw),source=await resolvePolicySource(ref);if(!source)throw new LearningError('來源不存在、尚未可用或無法存取',404);
  return json({policy:await sourcePolicies.read(ref),defaults:defaultPolicy(),source:{ref:source.ref,label:source.label,href:source.href}});
}catch(e){return weavingRouteError(e);}}
export async function POST(req:NextRequest){try{requireLearningOwner(req);return json({policy:await sourcePolicies.save(await req.json())});}catch(e){return weavingRouteError(e);}}
