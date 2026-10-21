import {wrapCardText} from '../illustrated/model';
import type {PodcastDraft} from './model';
const esc=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function coverSvg(d:PodcastDraft,imageData?:string){
 const image=imageData&&/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(imageData)?`<image href="${imageData}" x="120" y="150" width="840" height="560" preserveAspectRatio="xMidYMid meet"/>`:'<rect x="120" y="150" width="840" height="560" rx="24" fill="#dbe8e9"/>';
 return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080" role="img" aria-label="Podcast封面"><rect width="1080" height="1080" fill="#edf3f7"/><path d="M80 115 Q540 65 1000 115 L980 735 L100 740Z" fill="#fffdf8"/>${image}<g fill="#253c5c" font-family="inherit"><text xml:space="preserve" x="100" y="85" font-size="32">${esc(d.recording?.kind==='test'?'隔離測試音訊':d.showName)}</text>${wrapCardText(d.title,13).map((s,i)=>`<text xml:space="preserve" x="100" y="${815+75*i}" font-size="60" font-weight="600">${esc(s)}</text>`).join('')}</g></svg>`;
}
