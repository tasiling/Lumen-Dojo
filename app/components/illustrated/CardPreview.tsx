'use client';
import { forwardRef } from 'react';
import { layoutPage, type CardPage } from '@/lib/dojo/illustrated/model';
export const CardPreview=forwardRef<SVGSVGElement,{page:CardPage;index:number;total:number;imageData?:string}>(function CardPreview({page,index,total,imageData},ref){
 const layout=layoutPage(page),blue=page.palette==='blue',ink='#253c5c';
 return <svg ref={ref} xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 1080 ${layout.height}`} width="1080" height={layout.height} role="img" aria-label={`第 ${index+1} 頁圖卡預覽`} className="illustrated-card-svg" style={{whiteSpace:'pre'}}>
  <rect width="1080" height={layout.height} fill={blue?'#edf3fb':'#edf4ee'}/><rect x="36" y="36" width="1008" height={layout.height-72} rx="8" fill="#fffdf8"/>
  {page.layout==='image'&&<><rect x="72" y="72" width="936" height="600" fill={blue?'#e3ecf7':'#dce9df'}/>{imageData?<image href={imageData} x="72" y="72" width="936" height="600" preserveAspectRatio={`xMidY${page.position<34?'Min':page.position>66?'Max':'Mid'} ${page.fit==='cover'?'slice':'meet'}`}/>:<text xmlSpace="preserve" x="540" y="390" textAnchor="middle" fill={ink} fontFamily="sans-serif" fontSize="36">加入配圖</text>}</>}
  <g fill={ink} fontFamily="'Noto Sans TC','PingFang TC','Microsoft JhengHei',sans-serif"><text xmlSpace="preserve" x={layout.titleX} y={layout.titleY} textAnchor={layout.titleFrame.align==='left'?'start':layout.titleFrame.align==='right'?'end':'middle'} fontSize={layout.titleFrame.fontSize} fontWeight="600">{layout.title.map((line,i)=><tspan key={i} x={layout.titleX} dy={i===0?0:layout.titleFrame.fontSize*layout.titleFrame.lineHeight}>{line}</tspan>)}</text><text xmlSpace="preserve" x={layout.bodyX} y={layout.bodyY} textAnchor={layout.bodyFrame.align==='left'?'start':layout.bodyFrame.align==='right'?'end':'middle'} fontSize={layout.bodyFrame.fontSize} fontWeight="400">{layout.body.map((line,i)=><tspan key={i} x={layout.bodyX} dy={i===0?0:layout.bodyFrame.fontSize*layout.bodyFrame.lineHeight}>{line}</tspan>)}</text><text xmlSpace="preserve" x="72" y={layout.height-70} fontSize="26" fill="#45638f">{String(index+1).padStart(2,'0')} / {String(total).padStart(2,'0')}</text></g>
 </svg>;
});
