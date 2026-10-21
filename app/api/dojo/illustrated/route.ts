import { NextRequest, NextResponse } from 'next/server';
import { requireLearningOwner } from '@/lib/dojo/learningFoundation/access';
import { weavingRouteError } from '@/lib/dojo/weavingWorkflow/http';
import { bundle, createDeck, saveDeck, outputDeck, prepareDeck, handoffDeck, listDecks, readOutput } from '@/lib/dojo/illustrated/store';
import { readCompletion } from '@/lib/dojo/weavingWorkflow/completions';
import { WeavingError } from '@/lib/dojo/weavingWorkflow/model';
export const dynamic='force-dynamic';
const json=(value:unknown,status=200)=>NextResponse.json(value,{status,headers:{'Cache-Control':'private, no-store'}});
export async function GET(req:NextRequest){try{requireLearningOwner(req);const id=req.nextUrl.searchParams.get('id'),outputId=req.nextUrl.searchParams.get('outputId');if(outputId)return json({output:await readOutput(outputId)});if(id){const b=await bundle(id);return json({...b,source:await readCompletion(b.deck.completionId)});}return json({decks:await listDecks()});}catch(e){return weavingRouteError(e);}}
export async function POST(req:NextRequest){try{requireLearningOwner(req);return json(await createDeck(await req.json()),201);}catch(e){return weavingRouteError(e);}}
export async function PATCH(req:NextRequest){try{requireLearningOwner(req);const b=await req.json();if(b.action==='prepare')return json(await prepareDeck(b));if(b.action==='save')return json(await saveDeck(b));if(b.action==='output')return json(await outputDeck(b));if(b.action==='handoff')return json(await handoffDeck(b));throw new WeavingError('圖文操作不正確');}catch(e){return weavingRouteError(e);}}
