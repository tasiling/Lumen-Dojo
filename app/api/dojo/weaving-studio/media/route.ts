import { NextRequest } from "next/server";
import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, open, rename, stat, unlink } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { Readable } from "node:stream";
import { requireLearningOwner } from "@/lib/dojo/learningFoundation/access";
import { LearningError } from "@/lib/dojo/learningFoundation/model";
import { weavingRouteError } from "@/lib/dojo/weavingWorkflow/http";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const types:Record<string,string>={"audio/webm":"awebm","video/webm":"vwebm","audio/mp4":"m4a","audio/x-m4a":"m4a","video/mp4":"mp4","video/quicktime":"mov","audio/wav":"wav","audio/x-wav":"wav","audio/mpeg":"mp3","audio/ogg":"ogg","video/ogg":"ogv"};
function directory(){
  const root=process.env.LEARNING_WRITE_LOCK_DIR;
  if(!root||!isAbsolute(root))throw new LearningError("媒體儲存尚未就緒。",503);
  return join(root,"weaving-studio-media");
}
function matches(header:Buffer,ext:string){
  switch(ext){
    case "m4a":case "mp4":case "mov":return header.toString("ascii",4,8)==="ftyp";
    case "awebm":case "vwebm":return header.subarray(0,4).toString("hex")==="1a45dfa3";
    case "ogg":case "ogv":return header.toString("ascii",0,4)==="OggS";
    case "wav":return header.toString("ascii",0,4)==="RIFF"&&header.toString("ascii",8,12)==="WAVE";
    case "mp3":return header.toString("ascii",0,3)==="ID3"||(header[0]===255&&(header[1]&224)===224);
    default:return false;
  }
}
export async function POST(req:NextRequest){
  try{
    requireLearningOwner(req);
    const mime=(req.headers.get("content-type")||"").split(";")[0].toLowerCase(),ext=types[mime];
    if(!ext)throw new LearningError("請選 MP4、MOV、WebM、MP3、WAV、Ogg 或 M4A 檔案。");
    const limit=256*1024*1024, reader=req.body?.getReader();
    if(Number(req.headers.get("content-length"))>limit)throw new LearningError("音檔或影片上限為 256 MiB。",413);
    if(!reader)throw new LearningError("沒有檔案內容。");
    const dir=directory();await mkdir(dir,{recursive:true,mode:0o700});
    const temp=join(dir,"."+randomUUID()+".tmp"),hash=createHash("sha256");
    let size=0,header=Buffer.alloc(0);
    try{
      const f=await open(temp,"wx",0o600);
      try{
        while(true){const {done,value}=await reader.read();if(done)break;
          size+=value.length;if(size>limit){await reader.cancel();throw new LearningError("音檔或影片上限為 256 MiB。",413);}
          if(header.length<16)header=Buffer.concat([header,Buffer.from(value.subarray(0,16-header.length))]);
          hash.update(value);await f.writeFile(value);
        }
        if(!size||!matches(header,ext))throw new LearningError("檔案內容與媒體格式不符。");
        await f.sync();
      }finally{await f.close();}
      const id=hash.digest("hex")+"."+ext;
      await rename(temp,join(dir,id));const parent=await open(dir,"r");try{await parent.sync();}finally{await parent.close();}
      return Response.json({id},{headers:{"Cache-Control":"private, no-store"}});
    }finally{await unlink(temp).catch(()=>{});}
  }catch(error){return weavingRouteError(error);}
}
export async function GET(req:NextRequest){
  try{
    requireLearningOwner(req);
    const id=req.nextUrl.searchParams.get("id")||"";
    if(!/^[a-f0-9]{64}\.[a-z0-9]+$/.test(id))throw new LearningError("媒體識別不正確。",404);
    const mime=Object.keys(types).find(k=>types[k]===id.split(".")[1]);
    if(!mime)throw new LearningError("找不到這個媒體。",404);
    const file=join(directory(),id);
    const info=await stat(file).catch((e:NodeJS.ErrnoException)=>{if(e.code==="ENOENT")throw new LearningError("找不到這個媒體。",404);throw e;});
    const headers=new Headers({"Content-Type":mime,"Accept-Ranges":"bytes","X-Content-Type-Options":"nosniff","Content-Security-Policy":"default-src 'none'; sandbox","Cache-Control":"private, no-cache"});
    const range=req.headers.get("range");
    let start=0,end=info.size-1;
    if(range){const m=/^bytes=(\d*)-(\d*)$/.exec(range);
      if(!m||(!m[1]&&!m[2]))return new Response(null,{status:416,headers:{"Content-Range":"bytes */"+info.size}});
      start=m[1]?Number(m[1]):Math.max(0,info.size-Number(m[2]));
      end=m[1]&&m[2]?Math.min(end,Number(m[2])):end;
      if(start>end||start<0||!Number.isSafeInteger(start))return new Response(null,{status:416,headers:{"Content-Range":"bytes */"+info.size}});
      headers.set("Content-Range",`bytes ${start}-${end}/${info.size}`);
    }
    headers.set("Content-Length",String(end-start+1));
    return new Response(Readable.toWeb(createReadStream(file,{start,end})) as ReadableStream,{status:range?206:200,headers});
  }catch(error){return weavingRouteError(error);}
}
