import type { NativeCandidate } from "./nativeCatalog";
export const attachmentMaxBytes = 20 * 1024 * 1024;
export const attachmentAccept = ".pdf,.png,.jpg,.jpeg,.mp3,.wav,.ogg,.m4a,.mp4,.webm";
const types: Record<string, string> = { pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", m4a: "audio/mp4", mp4: "audio/mp4", webm: "audio/webm" };
export function attachmentMetadata(file: Pick<File, "name" | "type" | "size">) {
 if (!file.size || file.size > attachmentMaxBytes) throw Error("請選取非空白、20 MB 以內的檔案或錄音");
 if (!file.name || file.name.length > 180 || /[\/\\\x00-\x1f\x7f]/.test(file.name)) throw Error("檔案名稱不正確，請使用簡短名稱");
 const ext = file.name.split(".").at(-1)?.toLowerCase() ?? "", mime = types[ext];
 const aliases: Record<string,string> = { "audio/x-m4a":"audio/mp4", "audio/x-wav":"audio/wav", "audio/wave":"audio/wav", "audio/mp3":"audio/mpeg" };
 const actual = aliases[file.type.toLowerCase()] ?? file.type.toLowerCase();
 if (!mime || (actual && actual !== "application/octet-stream" && actual !== mime)) throw Error("請使用 PDF、PNG、JPEG 或 MP3／WAV／OGG／M4A／WebM 音訊");
 return { filename:file.name, mime };
}

export async function sendAttachmentUpload(pageId:string,requestId:string,file:File):Promise<NativeCandidate> {
 const form=new FormData();form.append("page",pageId);form.append("requestId",requestId);form.append("file",file);
 const r=await fetch("/api/dojo/assessments/upload",{method:"POST",body:form,cache:"no-store"});const j=await r.json();
 if(!r.ok)throw Error(j.error??"附件上傳未確認完成，請保留原檔案重試");
 const c=j.attachment as NativeCandidate;
 if(!c||c.referenceId!==pageId||typeof c.fileBlockId!=="string"||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(c.fileBlockId)||typeof c.label!=="string"||!["file","image","audio"].includes(c.blockType))throw Error("附件回應不完整，請保留原檔案重試");
 return c;
}
