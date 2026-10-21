'use client';
export function downloadBlob(blob:Blob,name:string){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
export async function rasterize(svg:SVGSVGElement):Promise<Blob>{
 await document.fonts.ready;
 const clone=svg.cloneNode(true) as SVGSVGElement;clone.setAttribute('width','1080');clone.setAttribute('height','1350');clone.removeAttribute('class');
 // SVG-as-image cannot use the page's loaded web fonts. Paint its actual text
 // nodes at their SVG coordinates with the same computed font on the canvas.
 clone.querySelectorAll('text').forEach(node=>node.remove());
 const data=new XMLSerializer().serializeToString(clone),blob=new Blob([data],{type:'image/svg+xml;charset=utf-8'}),url=URL.createObjectURL(blob);
 try{const image=new Image();image.src=url;await image.decode();const canvas=document.createElement('canvas');canvas.width=1080;canvas.height=1350;const ctx=canvas.getContext('2d');if(!ctx)throw Error('瀏覽器無法匯出圖片');ctx.drawImage(image,0,0);
  for(const text of svg.querySelectorAll('text')){const style=getComputedStyle(text);ctx.font=`${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;ctx.fillStyle=style.fill;ctx.textAlign='left';ctx.textBaseline='alphabetic';const spans=[...text.querySelectorAll('tspan')];for(const node of spans.length?spans:[text]){if(!node.textContent)continue;const position=node.getStartPositionOfChar(0);ctx.fillText(node.textContent,position.x,position.y);}}
  return await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('圖片匯出失敗')),'image/png'));}finally{URL.revokeObjectURL(url);}
}
export async function imageData(id:string){const r=await fetch(`/api/dojo/illustrated/assets?id=${id}`,{cache:'no-store'});if(!r.ok)throw Error('配圖載入失敗，請重新讀取');const blob=await r.blob();return new Promise<string>((resolve,reject)=>{const f=new FileReader();f.onload=()=>resolve(String(f.result));f.onerror=()=>reject(Error('配圖讀取失敗'));f.readAsDataURL(blob);});}
export async function uploadImage(blob:Blob){const r=await fetch('/api/dojo/illustrated/assets',{method:'POST',headers:{'Content-Type':blob.type},body:blob}),v=await r.json();if(!r.ok)throw Error(v.error??'圖片保存失敗');return v as {id:string;mime:string;width:number;height:number};}
