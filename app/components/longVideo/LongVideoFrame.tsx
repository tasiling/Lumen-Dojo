'use client';
import {memo} from 'react';
import {sceneSvg} from '@/lib/dojo/longVideo/composition';
import {duration,type LongVideoDraft} from '@/lib/dojo/longVideo/model';
export default memo(function LongVideoFrame({draft,time,images}:{draft:LongVideoDraft;time:number;images:Record<string,string>}){if(draft.scenes.some(s=>!Number.isFinite(s.duration)||s.duration<5||s.duration>300)||duration(draft)>3600)return <p role="alert">請先填妥各章節秒數，總長3600秒以內。</p>;const t=Math.max(0,Math.min(time,duration(draft)-.001));let start=0,index=draft.scenes.length-1;for(let i=0;i<draft.scenes.length;i++){if(t<start+draft.scenes[i].duration){index=i;break;}start+=draft.scenes[i].duration;}const scene=draft.scenes[index],progress=(t-start)/scene.duration;return <div className="video-frame"><p>第 {index+1} 章節</p><div dangerouslySetInnerHTML={{__html:sceneSvg(scene,draft.style,scene.image?images[scene.image.assetId]:undefined,progress)}}/></div>;});
