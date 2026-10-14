"use client";
import { useEffect, useRef, useState } from "react";
import { attachmentAccept, attachmentMetadata, sendAttachmentUpload } from "@/lib/dojo/assessments/attachmentUpload";
import type { NativeCandidate } from "@/lib/dojo/assessments/nativeCatalog";
type FormProps = { file:File|null; attachment:NativeCandidate|null; busy:boolean; error:string; onFile:(file:File|null)=>void; onUpload:()=>void; onCancel:()=>void; onSelect:()=>void };
export function AttachmentUploadForm({file,attachment,busy,error,onFile,onUpload,onCancel,onSelect}:FormProps) {
 return <section><h4>上傳新檔案／錄音</h4><p>可選取手機中的 PDF、圖片或已錄好的音訊，每份最多 20 MB；實際上限也受你的 Notion 方案限制。檔案會加到目前選定的來源頁面。</p>
 {error&&<p role="alert">{error}</p>}<fieldset disabled={busy} style={{border:0,padding:0,minWidth:0}}>
 <label>選擇檔案或錄音<input type="file" accept={attachmentAccept} disabled={Boolean(file)} onChange={e=>onFile(e.target.files?.[0]??null)} style={{display:"block",maxWidth:"100%"}} /></label>
 {file&&<p role="status">{file.name} · {Math.ceil(file.size/1024)} KB · {busy?"上傳中，請保留這個頁面":attachment?"已上傳，尚未選入":"尚未上傳／尚未保存"}</p>}
 {!attachment&&<button type="button" disabled={!file||busy} onClick={onUpload}>{busy?"上傳中…":error?"重試同一份上傳":"上傳到所選來源"}</button>}
 {attachment&&<><p>上傳成功。選入後仍需再保存作答草稿；不會自動提交或通過。</p><button type="button" onClick={onSelect}>選入本次草稿</button></>}
 {file&&<button type="button" onClick={onCancel}>{attachment?"取消選入（保留來源附件）":"取消這份選檔"}</button>}
 <p>尚未選入或保存時，離開會提醒。重新整理後無法自動恢復手機原檔；若已上傳，可從來源頁面重新選取。</p>
 </fieldset></section>;
}
export default function AssessmentAttachmentUpload({pageId,onSelect,onUploaded,onPendingChange}:{pageId:string;onSelect:(candidate:NativeCandidate)=>boolean;onUploaded:(candidate:NativeCandidate)=>void;onPendingChange:(pending:boolean)=>void}) {
 const [file,setFile]=useState<File|null>(null),[attachment,setAttachment]=useState<NativeCandidate|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const requestId=useRef<string|null>(null),lock=useRef(false),alive=useRef(true);
 const [inputEpoch,setInputEpoch]=useState(0);
 useEffect(()=>{onPendingChange(Boolean(file)||busy);},[file,busy,onPendingChange]);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;onPendingChange(false);};},[onPendingChange]);
 function reset(){setFile(null);setAttachment(null);setError("");requestId.current=null;setInputEpoch(old=>old+1);}
 function selectFile(value:File|null){if(lock.current||file)return;try{if(value)attachmentMetadata(value);setFile(value);requestId.current=value?crypto.randomUUID():null;setError("");}catch(e){setError((e as Error).message);setInputEpoch(old=>old+1);}}
 async function upload(){if(lock.current||!file||!requestId.current)return;lock.current=true;setBusy(true);setError("");
  try{const c=await sendAttachmentUpload(pageId,requestId.current,file);
   if(alive.current){setAttachment(c);onUploaded(c);}
  }catch(e){if(alive.current)setError(e instanceof Error?e.message:"附件上傳未確認完成，請重試");}
  finally{lock.current=false;if(alive.current)setBusy(false);}
 }
 return <AttachmentUploadForm key={inputEpoch} file={file} attachment={attachment} busy={busy} error={error} onFile={selectFile} onUpload={()=>void upload()} onCancel={()=>{if(!lock.current)reset();}} onSelect={()=>{if(attachment&&onSelect(attachment))reset();}} />;
}
