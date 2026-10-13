import {BridgeError,compareTime,timestamp} from "./model";
import {VOCAB_CONTRACT,validateVocab,type VocabResult} from "./vocabModel";
// VF's SQL query contract requires six fractional UTC digits. Pad text only;
// Date conversion would discard a real microsecond lower bound.
export function vocabQueryTime(value:string):string {
 const valid=timestamp(value);const [main,fraction=""]=valid.slice(0,-1).split(".");
 return `${main}.${fraction.padEnd(6,"0")}Z`;
}
export type VocabPage={results:VocabResult[];nextCursor:string|null;windowUpper:string};
export type VocabAdapter={configured:boolean;page(after:string,cursor:string|null,upper?:string|null):Promise<VocabPage>};
export function vocabAdapter(config:{origin:string;secret:string;sourceOwner:string;fetch?:typeof fetch}|null):VocabAdapter {
 return {configured:!!config,async page(after,cursor,upper){
  if(!config)throw new BridgeError("SOURCE_NOT_CONNECTED",503);
  const url=new URL("/api/integrations/vocabforge/results",config.origin);url.searchParams.set("limit","50");url.searchParams.set("after",vocabQueryTime(after));if(cursor)url.searchParams.set("cursor",cursor);if(upper)url.searchParams.set("windowUpper",vocabQueryTime(upper));
  try{
   const response=await (config.fetch??fetch)(url,{headers:{Authorization:`Bearer ${config.secret}`},cache:"no-store",redirect:"error",signal:AbortSignal.timeout(8000)});
   if(!response.ok)throw new BridgeError(response.status===401?"SOURCE_AUTHORIZATION_FAILED":"SOURCE_TEMPORARILY_UNAVAILABLE",503);
   const reader=response.body?.getReader();if(!reader)throw new BridgeError("SOURCE_INVALID",422);const chunks:Uint8Array[]=[];let size=0;while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>512000){await reader.cancel();throw new BridgeError("SOURCE_RESPONSE_TOO_LARGE",422);}chunks.push(part.value);}
   const body=JSON.parse(Buffer.concat(chunks).toString("utf8"));
   if(body.sourceOwner!==config.sourceOwner)throw new BridgeError("SOURCE_OWNER_MISMATCH",403);
   if(body.contractVersion!==VOCAB_CONTRACT || body.eventVersion!==1 || body.sourceSystem!=="vocabforge" || body.availability!=="available" || !Array.isArray(body.events) || body.events.length>50 || !(body.nextCursor===null || (typeof body.nextCursor==="string" && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(body.nextCursor) && body.nextCursor.length<=2000)))throw new BridgeError("SOURCE_CONTRACT_INVALID",422);
   const windowUpper=timestamp(body.windowUpper);if(upper && compareTime(upper,windowUpper)!==0)throw new BridgeError("SOURCE_WINDOW_CHANGED",409);
   const results=body.events.map((r:unknown)=>validateVocab(r,config.origin));let previous:VocabResult|null=null;
   for(const r of results){if(compareTime(r.updatedAt,after)<0 || compareTime(r.updatedAt,windowUpper)>0 || (previous && (compareTime(r.updatedAt,previous.updatedAt)<0 || (compareTime(r.updatedAt,previous.updatedAt)===0 && r.sourceId<=previous.sourceId))))throw new BridgeError("SOURCE_PAGE_ORDER_INVALID",422);previous=r;}
   if(body.nextCursor && (!results.length || body.nextCursor===cursor))throw new BridgeError("SOURCE_CURSOR_INVALID",422);
   return {results,nextCursor:body.nextCursor,windowUpper};
  }catch(e){if(e instanceof BridgeError)throw e;throw new BridgeError("SOURCE_TEMPORARILY_UNAVAILABLE",503);}
 }};
}
