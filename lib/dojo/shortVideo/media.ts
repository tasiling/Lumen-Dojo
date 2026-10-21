import 'server-only';
import {createHash,randomUUID} from 'node:crypto';
import {mkdir,open,readFile,rename,unlink} from 'node:fs/promises';
import {join,isAbsolute} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {assetId} from '../illustrated/model';
import {WeavingError} from '../weavingWorkflow/model';
const execute=promisify(execFile);
export type MediaInfo={id:string;kind:'audio'|'video';mime:string;duration:number;width:number;height:number;codec:string;audioCodec:string;hasAudio:boolean};
export type MediaProfile='short-video'|'podcast'|'long-video';
const limits={ 'short-video':{bytes:64*1024*1024,seconds:181},podcast:{bytes:128*1024*1024,seconds:3600},'long-video':{bytes:256*1024*1024,seconds:3600}};
function directory(profile:MediaProfile){const p=process.env.LEARNING_WRITE_LOCK_DIR;if(!p||!isAbsolute(p))throw new WeavingError('媒體保存需要持久目錄',503);return join(p,profile==='podcast'?'podcast-media':profile==='long-video'?'long-video-media':'short-video-media');}
async function inspect(path:string,bytes:Buffer,profile:MediaProfile):Promise<Omit<MediaInfo,'id'>>{
 const mp4=bytes.subarray(4,8).toString()==='ftyp',wav=bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WAVE',mp3=bytes.subarray(0,3).toString()==='ID3'||(bytes[0]===255&&(bytes[1]&224)===224);
 if(!mp4&&!wav&&!mp3)throw new WeavingError('僅接受WAV、MP3、M4A或MP4');
 let result;try{const r=await execute('ffprobe',['-v','error','-protocol_whitelist','file','-show_format','-show_streams','-of','json',path],{timeout:10000,maxBuffer:1024*1024});result=JSON.parse(r.stdout);}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')throw new WeavingError('媒體驗證尚未啟用：伺服器需要ffprobe',503);throw new WeavingError('無法讀取媒體，請匯出完整音訊或影片後重試');}
 const streams=result.streams??[],v=streams.find((s:Record<string,unknown>)=>s.codec_type==='video'&&!(s.disposition as {attached_pic?:number})?.attached_pic),a=streams.find((s:Record<string,unknown>)=>s.codec_type==='audio'),seconds=Number(result.format?.duration);
 if(!a||!Number.isFinite(seconds)||seconds<=0||seconds>limits[profile].seconds||streams.length>3)throw new WeavingError(profile==='short-video'?'媒體需要有效音軌，長度在180秒以內':'媒體需要有效音軌，長度在60分鐘以內');
 if(profile==='podcast'&&v)throw new WeavingError('Podcast只接受音訊，請先匯出WAV、MP3或M4A');
 if(v&&(!mp4||v.codec_name!=='h264'||a.codec_name!=='aac'||v.width>2160||v.height>3840))throw new WeavingError('影片請匯出H.264／AAC MP4');
 return{kind:v?'video':'audio',mime:v?'video/mp4':wav?'audio/wav':mp3?'audio/mpeg':'audio/mp4',duration:seconds,width:v?.width??0,height:v?.height??0,codec:v?.codec_name??a.codec_name,audioCodec:a.codec_name,hasAudio:true};
}
async function validatePayload(path:string,profile:MediaProfile){
 try{await execute('ffmpeg',['-v','error','-xerror','-err_detect','explode','-protocol_whitelist','file','-threads','2','-i',path,'-map','0:a:0','-map','0:v:0?','-f','null','-'],{timeout:profile==='long-video'?300000:60000,maxBuffer:1024*1024});}
 catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')throw new WeavingError('媒體驗證尚未啟用：伺服器需要ffmpeg解碼器',503);throw new WeavingError('媒體解碼失敗或檔案損毀，請重新匯出完整檔案');}
}
export async function saveMedia(bytes:Buffer,profile:MediaProfile='short-video'):Promise<MediaInfo>{if(!bytes.length||bytes.length>limits[profile].bytes)throw new WeavingError(profile==='podcast'?'音訊需要在128MiB以內':profile==='long-video'?'媒體需要在256MiB以內':'媒體需要在64MiB以內',413);const dir=directory(profile);await mkdir(dir,{recursive:true});const id=createHash('sha256').update(bytes).digest('hex'),temp=join(dir,`.${randomUUID()}.tmp`),target=join(dir,id+'.bin');try{const h=await open(temp,'wx',0o600);try{await h.writeFile(bytes);await h.sync();}finally{await h.close();}const info=await inspect(temp,bytes,profile);await validatePayload(temp,profile);await rename(temp,target);const directoryHandle=await open(dir,'r');try{await directoryHandle.sync();}finally{await directoryHandle.close();}return{id,...info};}finally{await unlink(temp).catch(()=>{});}}
export async function readMedia(id:string,profile:MediaProfile='short-video'){assetId(id);const path=join(directory(profile),id+'.bin');let bytes;try{bytes=await readFile(path);}catch{throw new WeavingError('找不到已保存媒體',404);}if(createHash('sha256').update(bytes).digest('hex')!==id)throw new WeavingError('媒體核對失敗',409);return{id,...await inspect(path,bytes,profile),bytes};}
