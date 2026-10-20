'use client';
import {useEffect} from 'react';
import type { CompletionVersion } from '@/lib/dojo/weavingWorkflow/completions';
const OUTPUT_LABELS: Record<string,string> = {article:'文章',post:'短貼文',thread:'串文',carousel_copy:'IG 輪播文案',story_copy:'IG 限動文字',spoken_script:'口播稿'};
export default function CompletionHistory({ versions, legacy, onSelect }: {
    versions: CompletionVersion[];
    legacy: string;
    onSelect: (id: string) => void;
}) { useEffect(()=>{const wanted=location.hash.slice(1);if(!versions.some(v=>`completion-${v.id}`===wanted))return;const node=document.getElementById(wanted);if(node instanceof HTMLDetailsElement){node.open=true;node.scrollIntoView({block:'center'});}},[versions]); return <section className="ritual-card wf-history"><h2>已確認的成品版本</h2>{!versions.length && <p>{legacy ? '舊版成品快照保留如下；再次確認完成時才建立新版本。' : '尚未確認成品。先保存草稿，再預覽目前保存版本。'}</p>}{!versions.length && legacy && <div className="full-text-preview">{legacy}</div>}{versions.map((v, i) => <details key={v.id} id={`completion-${v.id}`} style={{scrollMarginBlock:"100px"}}><summary>{v.title} · {new Date(v.createdAt).toLocaleString('zh-TW')} · {OUTPUT_LABELS[v.outputKind] ?? '文字作品'}</summary><p>保留定稿時的核心觀點與 {v.sourceSelections.length} 段素材。</p><div className="full-text-preview">{v.text}</div>{v.outputUrl && <a href={v.outputUrl} target="_blank" rel="noreferrer">開啟成品連結</a>}<button onClick={() => onSelect(v.id)}>選擇這個成品版本交接</button>{i === 0 && <small>最新版本</small>}</details>)}</section>; }
