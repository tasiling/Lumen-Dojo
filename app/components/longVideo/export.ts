'use client';
export async function rasterizeFrame(svg:SVGSVGElement):Promise<Blob>{
 await document.fonts.ready;
 if(!svg.isConnected)throw Error('預覽已更新，請重新下載本章畫面');
 const texts=[...svg.querySelectorAll('text')].filter(n=>n.textContent).map(node=>{
  const b=node.getBBox();if(b.x<60||b.x+b.width>1220||b.y+b.height>690)throw Error('目前字型文字超出章節畫面，請縮短或分章');
  const style=getComputedStyle(node),position=node.getStartPositionOfChar(0);
  return {text:node.textContent!,font:`${style.fontWeight} ${style.fontSize} ${style.fontFamily}`,fill:style.fill,x:position.x,y:position.y};
 });
 const copy=svg.cloneNode(true) as SVGSVGElement;copy.querySelectorAll('text').forEach(n=>n.remove());
 const url=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(copy)],{type:'image/svg+xml'}));
 try{const image=new Image();image.src=url;await image.decode();const canvas=document.createElement('canvas');canvas.width=1280;canvas.height=720;const c=canvas.getContext('2d');if(!c)throw Error('瀏覽器無法匯出章節畫面');c.drawImage(image,0,0);
  for(const node of texts){c.font=node.font;c.fillStyle=node.fill;c.fillText(node.text,node.x,node.y);}
  return await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('章節畫面匯出失敗')),'image/png'));
 }finally{URL.revokeObjectURL(url);}
}
