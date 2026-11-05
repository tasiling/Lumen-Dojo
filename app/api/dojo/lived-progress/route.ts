import {NextRequest,NextResponse} from 'next/server';
import {requireLearningOwner} from '@/lib/dojo/learningFoundation/access';
import {LearningError} from '@/lib/dojo/learningFoundation/model';
import {captureCatalog,readChoices,saveChoices,readDays} from '@/lib/dojo/livedProgressStore';
export const dynamic='force-dynamic';
function failure(e:unknown){return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:e instanceof LearningError?e.status:503});}
export async function GET(req:NextRequest){try{requireLearningOwner(req);const mode=req.nextUrl.searchParams.get('mode');if(mode==='catalog')return NextResponse.json({options:await captureCatalog()});if(mode==='week'){const week=req.nextUrl.searchParams.get('week')||'';if(!/^\d{4}-\d{2}-\d{2}$/.test(week)||!Number.isFinite(Date.parse(week)))throw new LearningError('日期格式不正確');return NextResponse.json({days:await readDays(week)});}return NextResponse.json({choices:await readChoices()});}catch(e){return failure(e);}}
export async function PUT(req:NextRequest){try{requireLearningOwner(req);const body=await req.json();return NextResponse.json({choices:await saveChoices(body.choices)});}catch(e){return failure(e);}}
