import { NextRequest, NextResponse } from "next/server";
import { requireLearningOwner } from "@/lib/dojo/learningFoundation/access";
import { LearningError } from "@/lib/dojo/learningFoundation/model";
import { uploadNativeAttachment } from "@/lib/dojo/assessments/nativeUpload";
import { attachmentMaxBytes } from "@/lib/dojo/assessments/attachmentUpload";
export const dynamic="force-dynamic";
export const runtime="nodejs";
const headers={"Cache-Control":"private, no-store"};
async function form(req:NextRequest) {
 const type=req.headers.get("content-type")??"",max=attachmentMaxBytes+65536;
 if(!type.startsWith("multipart/form-data;")||type.length>300)throw new LearningError("請用檔案表單上傳");
 const length=req.headers.get("content-length");if(length&&(Number(length)>max||!/^\d+$/.test(length)))throw new LearningError("上傳超過 20 MB 限制",413);
 const reader=req.body?.getReader();if(!reader)throw new LearningError("上傳內容空白");const chunks:Uint8Array[]=[];let size=0;
 try {for(;;){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>max)throw new LearningError("上傳超過 20 MB 限制",413);chunks.push(part.value);}}finally{await reader.cancel().catch(()=>{});}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 try{return await new Request(req.url,{method:"POST",headers:{"content-type":type},body:bytes}).formData();}catch{throw new LearningError("上傳表單不完整，請重新選檔");}
}
export async function POST(req:NextRequest) {
 try{requireLearningOwner(req);const f=await form(req);
  if([...f.keys()].length!==3||f.getAll("file").length!==1||f.getAll("page").length!==1||f.getAll("requestId").length!==1)throw new LearningError("上傳表單欄位不正確");
  const file=f.get("file"),page=f.get("page"),requestId=f.get("requestId");
  if(!(file instanceof File)||typeof page!=="string"||typeof requestId!=="string")throw new LearningError("需選取檔案與來源頁面");
  return NextResponse.json({attachment:await uploadNativeAttachment(page,requestId,file)},{status:201,headers});
 }catch(e){return NextResponse.json({error:e instanceof LearningError?e.message:"附件上傳未確認完成，請保留原檔案並重試"},{status:e instanceof LearningError?e.status:503,headers});}
}
