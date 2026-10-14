import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { open, readFile, rename, unlink } from "node:fs/promises";
import { join } from "node:path";
import { notion, withNotionRateLimit } from "@/lib/notion/client";
import { DATA_SOURCES } from "@/lib/notion/schema";
import { LearningError, uuidPattern } from "../learningFoundation/model";
import { withLearningWriteLock } from "../learningFoundation/fileLock";
import { createPracticeOnce } from "../learningFoundation/practiceWrite";
import { requireNativeSource, type NativeCandidate } from "./nativeCatalog";
import { nativeMediaKind } from "./nativeEvidence";
import { attachmentMetadata } from "./attachmentUpload";
type Receipt = { schema:1; fingerprint:string; uploadId?:string; uploaded?:true; attachment?:NativeCandidate };
const hash=(v:unknown)=>createHash("sha256").update(JSON.stringify(v)).digest("hex");
async function save(path:string,value:Receipt) {
 const temp=path+"."+randomUUID()+".tmp", handle=await open(temp,"wx",0o600);
 try { try { await handle.writeFile(JSON.stringify(value));await handle.sync(); } finally { await handle.close(); }
  await rename(temp,path);const parent=await open(process.env.LEARNING_WRITE_LOCK_DIR!,"r");try { await parent.sync(); }finally { await parent.close(); }
 }finally { await unlink(temp).catch(e=>{if(e.code!=="ENOENT")throw e}); }
}
export async function uploadNativeAttachment(pageId:string, requestId:string, file:File):Promise<NativeCandidate> {
 if (!uuidPattern.test(pageId)||!uuidPattern.test(requestId))throw new LearningError("上傳來源或請求 ID 不正確");
 let meta:ReturnType<typeof attachmentMetadata>;try {meta=attachmentMetadata(file);}catch(e){throw new LearningError((e as Error).message);}
 const bytes=new Uint8Array(await file.arrayBuffer()),media=nativeMediaKind(bytes.subarray(0,64),meta.mime);
 if(!media)throw new LearningError("檔案內容與格式不符，不能作為原生附件");
 const blockType=media==="audio"?"audio":meta.mime.startsWith("image/")?"image":"file";
 const key=hash([DATA_SOURCES.DB14_知識庫,"attachment-upload",requestId]),fingerprint=hash([pageId,meta.filename,meta.mime,bytes.length,createHash("sha256").update(bytes).digest("hex")]);
 return withLearningWriteLock(async()=>{
  await requireNativeSource(pageId);
  const path=join(process.env.LEARNING_WRITE_LOCK_DIR!,`attachment-${key}.json`);let receipt:Receipt;
  try {receipt=JSON.parse(await readFile(path,"utf8"));if(receipt.schema!==1||receipt.fingerprint!==fingerprint||(receipt.uploadId&&!uuidPattern.test(receipt.uploadId)))throw new LearningError("這個上傳請求已用於其他內容，請核對原檔案",409);}
  catch(e){if((e as NodeJS.ErrnoException).code!=="ENOENT")throw e;receipt={schema:1,fingerprint};await save(path,receipt);}
  if(receipt.attachment)return receipt.attachment;
  if(!receipt.uploadId){
   const uploaded=await createPracticeOnce(hash([key,"create"]),()=>withNotionRateLimit(()=>notion().fileUploads.create({mode:"single_part",filename:meta.filename,content_type:meta.mime}),{retry:false}));
   if(!uuidPattern.test(uploaded.id))throw new LearningError("上傳來源回應不完整，請管理者核對",503);
   receipt.uploadId=uploaded.id;await save(path,receipt);
  }
  if(!receipt.uploaded){
   const sent=await createPracticeOnce(hash([key,"send"]),()=>withNotionRateLimit(()=>notion().fileUploads.send({file_upload_id:receipt.uploadId!,file:{filename:meta.filename,data:new Blob([bytes],{type:meta.mime})}}),{retry:false}));
   if(sent.id!==receipt.uploadId||sent.status!=="uploaded"||Number(sent.content_length)!==bytes.length||sent.content_type!==meta.mime)throw new LearningError("附件內容尚未確認保存，請管理者核對",503);
   receipt.uploaded=true;await save(path,receipt);
  }
  // Source may have been archived while bytes were uploading; check again before append.
  await requireNativeSource(pageId);
  const status=await withNotionRateLimit(()=>notion().fileUploads.retrieve({file_upload_id:receipt.uploadId!}));
  if(status.status!=="uploaded"||status.id!==receipt.uploadId||Number(status.content_length)!==bytes.length||status.content_type!==meta.mime)throw new LearningError("上傳已失效或內容不符，請核對後重新選檔",409);
  const payload={type:"file_upload" as const,file_upload:{id:receipt.uploadId},caption:[{type:"text" as const,text:{content:meta.filename}}]};
  const child=blockType==="audio"?{object:"block" as const,type:"audio" as const,audio:payload}:blockType==="image"?{object:"block" as const,type:"image" as const,image:payload}:{object:"block" as const,type:"file" as const,file:{...payload,name:meta.filename}};
  const result=await createPracticeOnce(hash([key,"append"]),()=>withNotionRateLimit(()=>notion().blocks.children.append({block_id:pageId,children:[child]}),{retry:false}));
  const b=result.results[0];if(result.results.length!==1||!b||!uuidPattern.test(b.id)||!("type" in b)||b.type!==blockType)throw new LearningError("附件已派送但回應不完整，請管理者核對",503);
  receipt.attachment={referenceId:pageId,fileBlockId:b.id,label:meta.filename,blockType};await save(path,receipt);
  return receipt.attachment;
 });
}
