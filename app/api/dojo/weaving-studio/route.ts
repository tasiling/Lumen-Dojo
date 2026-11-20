import { NextRequest, NextResponse } from "next/server";
import { requireLearningOwner } from "@/lib/dojo/learningFoundation/access";
import { LearningError } from "@/lib/dojo/learningFoundation/model";
import { weavingRouteError } from "@/lib/dojo/weavingWorkflow/http";
import { changeStudio, readStudio } from "@/lib/dojo/weavingStudio/store";
import { studioCards, studioCatalog, studioMediaCatalog } from "@/lib/dojo/weavingStudio/catalog";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const json=(value:unknown)=>NextResponse.json(value,{headers:{"Cache-Control":"private, no-store"}});
export async function GET(req:NextRequest){
  try {
    requireLearningOwner(req);
    switch(req.nextUrl.searchParams.get("list")){
      case "cards":return json(await studioCards());
      case "catalog":return json(await studioCatalog());
      case "media":return json(await studioMediaCatalog());
      case null:return json(await readStudio());
      default:throw new LearningError("找不到指定清單。",404);
    }
  } catch(error){return weavingRouteError(error);}
}
export async function PATCH(req:NextRequest){
  try {
    requireLearningOwner(req);
    const limit=16*1024*1024, reader=req.body?.getReader();
    if(!reader)throw new LearningError("沒有要儲存的內容。");
    const chunks:Buffer[]=[]; let count=0;
    while(true){const {done,value}=await reader.read();if(done)break;count+=value.length;
      if(count>limit){await reader.cancel();throw new LearningError("本次內容過大，請分次保存。",413);}chunks.push(Buffer.from(value));}
    let body:unknown;try{body=JSON.parse(Buffer.concat(chunks).toString("utf8"));}catch{throw new LearningError("無法辨識儲存內容。");}
    return json(await changeStudio(body));
  }catch(error){return weavingRouteError(error);}
}
