import { NextRequest, NextResponse } from 'next/server';
import { requireLearningOwner } from '@/lib/dojo/learningFoundation/access';
import { weavingRouteError } from '@/lib/dojo/weavingWorkflow/http';
import { readAsset, saveAsset } from '@/lib/dojo/illustrated/assets';
import { WeavingError } from '@/lib/dojo/weavingWorkflow/model';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(req:NextRequest){try{requireLearningOwner(req);const a=await readAsset(req.nextUrl.searchParams.get('id')??'');return new Response(new Uint8Array(a.bytes),{headers:{'Content-Type':a.mime,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Disposition':`inline; filename="${a.id}.${a.mime==='image/jpeg'?'jpg':a.mime.split('/')[1]}"`}});}catch(e){return weavingRouteError(e);}}
export async function POST(req:NextRequest){try{requireLearningOwner(req);const length=Number(req.headers.get('content-length'));if(length>8*1024*1024)throw new WeavingError('圖片大小須在 8 MiB 以內',413);if(!/^image\/(png|jpeg|webp)$/.test(req.headers.get('content-type')??''))throw new WeavingError('請選 PNG、JPEG 或 WebP 圖片');
 const reader=req.body?.getReader();if(!reader)throw new WeavingError('沒有圖片內容');const parts:Uint8Array[]=[];let total=0;while(true){const chunk=await reader.read();if(chunk.done)break;total+=chunk.value.length;if(total>8*1024*1024){await reader.cancel();throw new WeavingError('圖片大小須在 8 MiB 以內',413);}parts.push(chunk.value);}return NextResponse.json(await saveAsset(Buffer.concat(parts)),{headers:{'Cache-Control':'private, no-store'}});}catch(e){return weavingRouteError(e);}}
