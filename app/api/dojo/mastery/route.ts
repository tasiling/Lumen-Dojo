import {NextRequest,NextResponse} from 'next/server';
import {requireLearningOwner} from '@/lib/dojo/learningFoundation/access';
import {LearningError,uuidPattern} from '@/lib/dojo/learningFoundation/model';
import {mastery} from '@/lib/dojo/mastery/store';
import {assessments,assessmentRepository} from '@/lib/dojo/assessments/store';
import type {MasteryCard} from '@/lib/dojo/mastery/model';
export const dynamic='force-dynamic';export const runtime='nodejs';
const headers={'Cache-Control':'private, no-store'};
const respond=(body:unknown,status=200)=>NextResponse.json(body,{status,headers});
function fail(e:unknown){return respond({error:e instanceof LearningError?e.message:'學成資料暫時不可用，尚未確認成功'},e instanceof LearningError?e.status:503);}
function summary(card:MasteryCard){const {personalGoal,...value}=card;void personalGoal;return value;}
async function body(req:NextRequest){const text=await req.text();if(Buffer.byteLength(text,'utf8')>15000)throw new LearningError('學成操作內容超過上限',413);try{const b=JSON.parse(text);if(!b||typeof b!=='object'||Array.isArray(b))throw Error();return b;}catch{throw new LearningError('學成操作格式不正確');}}
export async function GET(req:NextRequest){try{requireLearningOwner(req);const q=req.nextUrl.searchParams;
 if(q.get('event')){const event=await mastery.detail(q.get('event')!);let evidenceAvailability=null,availabilityError=null;if(event.kind==='grant'){try{evidenceAvailability=await assessments.evidenceAvailability(event.attempt.id);}catch(e){availabilityError=e instanceof LearningError?e.message:'目前無法核對來源，以下為取得時保存的歷史快照';}}return respond({event,evidenceAvailability,availabilityError});}
 if(q.get('card')){const card=await mastery.get(q.get('card')!),cursor=q.get('cursor');if(cursor!==null&&(!/^\d+$/.test(cursor)||!Number.isSafeInteger(Number(cursor))||Number(cursor)<1))throw new LearningError('歷程游標不正確');const remaining=(await mastery.history(card.id)).filter(e=>cursor===null||e.revision<Number(cursor)),history=remaining.slice(0,20);const attempts=(await assessmentRepository.attempts()).filter(a=>a.owner===card.owner&&a.capabilityId===card.capabilityId).map(a=>({id:a.id,definitionVersion:a.definitionVersion,status:a.status,verdict:a.verdict,confirmedAt:a.confirmedAt,revisitOf:a.revisitOf,updatedAt:a.updatedAt}));return respond({card:summary(card),history,cursor:remaining.length>20?String(history.at(-1)!.revision):null,attempts});}
 const cursor=q.get('cursor');if(cursor!==null&&!uuidPattern.test(cursor))throw new LearningError('學成列表游標不正確');const remaining=(await mastery.list()).filter(c=>!cursor||c.id>cursor),cards=remaining.slice(0,20).map(summary);return respond({cards,cursor:remaining.length>20?cards.at(-1)!.id:null});
 }catch(e){return fail(e);}}
export async function POST(req:NextRequest){try{requireLearningOwner(req);const b=await body(req);return respond({card:summary(await mastery.collect(b.attemptId))},201);}catch(e){return fail(e);}}
export async function PATCH(req:NextRequest){try{requireLearningOwner(req);return respond({card:summary(await mastery.change(await body(req)))});}catch(e){return fail(e);}}
