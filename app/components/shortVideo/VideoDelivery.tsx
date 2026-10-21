'use client';
import {useEffect,useState} from 'react';
import {get} from '../weaving/client';
import type {VideoOutput} from '@/lib/dojo/shortVideo/model';
import './video.css';
export default function VideoDelivery({ids}:{ids:string[]}){const [outputs,setOutputs]=useState<VideoOutput[]>([]),[error,setError]=useState(''),key=ids.join(',');useEffect(()=>{let active=true;Promise.all(key.split(',').filter(Boolean).map(id=>get<{output:VideoOutput}>(`/api/dojo/short-video?outputId=${encodeURIComponent(id)}`))).then(rows=>{if(active)setOutputs(rows.map(r=>r.output));}).catch(e=>{if(active)setError(String(e));});return()=>{active=false;};},[key]);if(!ids.length)return null;return <section className="ritual-card video-delivery"><h2>短影音成品</h2>{error&&<p role="alert">{error}</p>}{outputs.map(o=><details key={o.id}><summary>{o.title}</summary><video onError={()=>setError('此瀏覽器無法播放影片，請下載檔案以相容播放器開啟')} controls playsInline src={`/api/dojo/short-video/media?id=${o.assetId}`}/><p>{o.tool}：{o.returnNote}</p>{o.draft.voice?.kind==='test'&&<p>使用隔離測試音訊，非本人錄音。</p>}<a href={`/api/dojo/short-video/media?id=${o.assetId}`} download="short-video.mp4">下載固定影片</a></details>)}</section>;}
