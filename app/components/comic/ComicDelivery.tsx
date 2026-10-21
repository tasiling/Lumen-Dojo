'use client';
import { useEffect,useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { get } from '../weaving/client';
import type { ComicOutput } from '@/lib/dojo/comic/model';
import './comic.css';
export default function ComicDelivery({ids}:{ids:string[]}){const [outputs,setOutputs]=useState<ComicOutput[]>([]),[error,setError]=useState('');const key=ids.join(',');useEffect(()=>{let active=true;Promise.all(key.split(',').filter(Boolean).map(id=>get<{output:ComicOutput}>(`/api/dojo/comic?outputId=${encodeURIComponent(id)}`))).then(rows=>{if(active)setOutputs(rows.map(r=>r.output));}).catch(e=>{if(active)setError(String(e));});return()=>{active=false;};},[key]);if(!ids.length)return null;return <section className="ritual-card comic-delivery"><h2>短漫成品</h2><p>已交接的固定圖片版本，修改稿件不會覆蓋這裡的成品。</p>{error&&<p role="alert">{error}</p>}{outputs.map(o=><details key={o.id}><summary>{o.title}・{o.renders.length} 頁</summary>{o.renders.map((r,i)=><figure key={r.pageId}><Image unoptimized width={1080} height={1350} src={`/api/dojo/illustrated/assets?id=${r.assetId}`} alt={`${o.title} 第 ${i+1} 頁`}/><a href={`/api/dojo/illustrated/assets?id=${r.assetId}`} download={`comic-${i+1}.png`}>下載第 {i+1} 頁</a></figure>)}<p className="full-text-preview">{o.caption}</p><Link href="/weaving/comic">回到短漫製作</Link></details>)}</section>;}
