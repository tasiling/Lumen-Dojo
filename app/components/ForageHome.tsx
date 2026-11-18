"use client";

import Link from "next/link";
import ForageIcon, {ForageMotif} from "./ForageIcon";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ForageOverview } from "@/lib/dojo/forageOverview";

async function responseJson<T>(response: Response): Promise<T> {
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((json as { error?: string }).error ?? `讀取失敗（${response.status}）`);
  return json as T;
}

function capturedDate(value: string): string {
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei", year: "numeric", month: "numeric", day: "numeric",
  }).format(new Date(value));
}

function CountItem({ value, label, tone = "" }: { value: number; label: string; tone?: string }) {
  return <div className={tone}><strong>{value}</strong><span>{label}</span></div>;
}

type CollectionItem = ForageOverview["recent"][number] & {
  topic: string; purpose: string; original: string; note: string;
  c?: "C0" | "C1" | "C2" | "C3"; k?: "K0" | "K1";
};
type CollectionOverview = Omit<ForageOverview, "recent"> & { recent: CollectionItem[] };
const creativity = { C0: "原始採集", C1: "有感素材", C2: "有方向", C3: "創作就緒" };

export default function ForageHome() {
  const [overview, setOverview] = useState<CollectionOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      setOverview(await responseJson<CollectionOverview>(await fetch("/api/dojo/forage-overview?view=collection", { cache: "no-store" })));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);

  const [query, setQuery] = useState("");
  const [topic, setTopic] = useState("");
  const [purpose, setPurpose] = useState("");
  const [rediscover, setRediscover] = useState(true);
  const [limit, setLimit] = useState(24);
  const results = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const rows = (overview?.recent || []).filter(item => {
      const body = [item.title, item.original, item.note, item.summary, item.topic, item.purpose].join(" ").toLowerCase();
      return (!topic || item.topic === topic) && (!purpose || item.purpose === purpose) && words.every(word => body.includes(word));
    });
    if (!rediscover) return rows;
    const mixed: CollectionItem[] = [];
    for (let i = 0; i < Math.ceil(rows.length / 2); i++) {
      mixed.push(rows[rows.length - 1 - i]);
      if (i < rows.length - 1 - i) mixed.push(rows[i]);
    }
    return mixed;
  }, [overview, query, topic, purpose, rediscover]);
  const english = overview?.english ?? { pending: 0, classification: 0, dispatch: 0, errors: 0 };
  const captures = overview?.captures ?? { pending: 0, adopted: 0, faded: 0 };

  return (
    <section className="screen forage-home">
      <div className="forage-home-intro"><ForageMotif />
        <div><span className="eyebrow">好奇、探索</span><h1>回看所拾</h1><p>往下滑，重新遇見以前收過的素材。</p></div>
        <Link href="/forage/new" className="forage-add-entry"><ForageIcon name="i-plus" />新增素材</Link>
      </div>

      {loading && <div className="forage-overview-state">正在整理採集概況…</div>}
      {error && <div className="forage-overview-state is-error"><span>{error}</span><button onClick={() => void load()}>重新讀取</button></div>}
      {!loading && !error && english.errors > 0 && (
        <div className="forage-alert" role="status"><ForageIcon name="alert" /><div><b>有 {english.errors} 筆英文素材需要確認</b><p>分析或同步發生異常，紀錄仍完整保留。</p></div><Link href="/forage/english?stage=error">前往確認</Link></div>
      )}

      <section className="forage-recent" aria-label="收藏素材">
        <div style={{display:"flex", flexWrap:"wrap", gap:8, alignItems:"center"}}>
          <label>搜尋收藏 <input type="search" placeholder="標題、節錄或筆記" value={query} onChange={e=>{setQuery(e.target.value);setLimit(24)}} /></label>
          <label>主題 <select value={topic} onChange={e=>{setTopic(e.target.value);setLimit(24)}}><option value="">全部主題</option>{Array.from(new Set(overview?.recent.map(i=>i.topic))).sort().map(t=><option key={t}>{t}</option>)}</select></label>
          <label>用途 <select value={purpose} onChange={e=>{setPurpose(e.target.value);setLimit(24)}}><option value="">所有用途</option>{Array.from(new Set(overview?.recent.map(i=>i.purpose))).sort().map(t=><option key={t}>{t}</option>)}</select></label>
          <button aria-pressed={rediscover} onClick={()=>setRediscover(true)}>重新發現</button>
          <button aria-pressed={!rediscover} onClick={()=>setRediscover(false)}>最近收錄</button>
        </div>
        <details><summary>C 值與 K 值怎麼看？</summary><p>C 值看創作成熟度。C0 剛收下，C1 知道為何想留，C2 已有切角，C3 已準備好創作。</p><p>K 值看來源處理進度。K0 待整理出處，K1 可回查來源。引用前請核對原文是否支持你的說法。</p></details>
        {overview && <p role="status">{results.length} 筆收藏</p>}
        <div className="forage-entry-grid">{results.slice(0,limit).map(item=><article className="forage-entry-card" key={item.kind+item.id} style={{minWidth:0,overflowWrap:"anywhere"}}>
          <small>{item.topic} · {item.purpose} · {capturedDate(item.capturedAt)}</small>
          <h2><Link href={item.href}>{item.title}</Link></h2>
          {item.c && item.k && <small>{item.c} {creativity[item.c]}　{item.k} {item.k === "K1" ? "可追溯來源" : "未處理來源"}</small>}
          <p>{item.summary}</p>
          {item.original && <details><summary>查看原文節錄</summary><p style={{whiteSpace:"pre-wrap"}}>{item.original}</p></details>}
          <Link href={item.href}>查看素材與筆記 ↗</Link>
        </article>)}</div>
        {results.length>limit && <button onClick={()=>setLimit(limit+24)}>顯示更多收藏</button>}
        {overview && !results.length && <p>目前沒有符合的收藏。</p>}
      </section>
      <details><summary>整理採集匣</summary>
      <div className="forage-entry-grid" aria-label="採集匣入口">
        <article className="forage-entry-card is-english">
          <div className="forage-entry-title"><span aria-hidden="true"><ForageIcon name="image" /></span><div><small>學習素材</small><h2>英文影像</h2></div></div>
          <div className="forage-primary-count"><strong>{english.pending}</strong><span>待處理</span></div>
          <div className="forage-count-grid">
            <CountItem value={english.classification} label="待分類" />
            <CountItem value={english.dispatch} label="待挑選／派送" />
            <CountItem value={english.errors} label="處理異常" tone={english.errors ? "is-error" : ""} />
          </div>
          <p>AI 分析、單字與語境派送皆在影像詳情中處理。</p>
          <Link href="/forage/english" className="forage-card-action">前往英文影像匣 <ForageIcon name="i-arrow" /></Link>
        </article>

        <article className="forage-entry-card is-capture">
          <div className="forage-entry-title"><span aria-hidden="true"><ForageIcon name="i-leaf" /></span><div><small>原始材料</small><h2>一般素材</h2></div></div>
          <div className="forage-primary-count"><strong>{captures.pending}</strong><span>待處理</span></div>
          <div className="forage-count-grid capture-counts">
            <CountItem value={captures.pending} label="待處理" />
            <CountItem value={captures.adopted} label="已採用" />
            <CountItem value={captures.faded} label="已淡出" />
          </div>
          <p>補上收藏用途、成熟度、使用去向與知識關聯。</p>
          <Link href="/forage/captures" className="forage-card-action">前往一般採集匣 <ForageIcon name="i-arrow" /></Link>
        </article>
      </div>

      </details>
      <div className="forage-secondary-entry">
        <div><b>其他野採紀錄</b><span>保留既有場域紀錄、新增紀錄與計時入口。</span></div>
        <Link href="/forage/records">查看紀錄 <ForageIcon name="i-arrow" /></Link>
      </div>


    </section>
  );
}
