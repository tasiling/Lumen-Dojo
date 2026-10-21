'use client';
import {useEffect,useState} from 'react';
import {chapters} from '@/lib/dojo/longVideo/model';
import {get} from '../weaving/client';
import type {LongVideoOutput} from '@/lib/dojo/longVideo/model';
import './long-video.css';
export default function LongVideoDelivery({ids}:{ids:string[]}){const [outputs,setOutputs]=useState<LongVideoOutput[]>([]),[error,setError]=useState(''),key=ids.join(',');useEffect(()=>{let active=true;Promise.all(key.split(',').filter(Boolean).map(id=>get<{output:LongVideoOutput}>(`/api/dojo/long-video?outputId=${encodeURIComponent(id)}`))).then(rows=>{if(active)setOutputs(rows.map(r=>r.output));}).catch(e=>{if(active)setError(String(e));});return()=>{active=false;};},[key]);if(!ids.length)return null;return <section className="ritual-card video-delivery long-video-delivery"><h2>長影片成品</h2>{error&&<p role="alert">{error}</p>}{outputs.map(o=><details key={o.id}><summary>{o.title}</summary><video onError={()=>setError('此瀏覽器無法播放影片，請下載檔案以相容播放器開啟')} controls playsInline src={`/api/dojo/long-video/media?id=${o.assetId}`}/><ol>{chapters(o.draft).map(c=><li key={c.sceneId}>{c.start}秒：{c.title}</li>)}</ol><p>{o.tool}：{o.returnNote}</p>{o.draft.scenes.some(s=>s.voice?.kind==='test')&&<p>使用隔離測試音訊，非本人錄音。</p>}<a href={`/api/dojo/long-video/media?id=${o.assetId}`} download="long-video.mp4">下載固定影片</a></details>)}</section>;}
