import {WeavingError} from '../weavingWorkflow/model';
// Encoded JSON/HTML budget, separate from accepted media/project capacity.
// Base64 expands originals by 4/3; reserve keys, MIME prefixes and the envelope.
export const LONG_VIDEO_PACKAGE_MAX_BYTES=256*1024*1024;
export function assertPackageBudget(sizes:number[],draftBytes:number){
 if(!Number.isSafeInteger(draftBytes)||draftBytes<0||sizes.some(n=>!Number.isSafeInteger(n)||n<0))throw new WeavingError('製作包大小無法核對');
 const encodedUpperBound=draftBytes+4096+sizes.reduce((n,size)=>n+4*Math.ceil(size/3)+256,0);
 if(encodedUpperBound>LONG_VIDEO_PACKAGE_MAX_BYTES)throw new WeavingError('可修改製作包上限為256MiB（含base64）；請改用分章原音、畫面、字幕及腳本下載，或在外部壓縮素材後另存版本',413);
 return{encodedUpperBound,mediaCount:sizes.length,maxBytes:LONG_VIDEO_PACKAGE_MAX_BYTES};
}
