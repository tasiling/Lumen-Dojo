"use client";

import Image from "next/image";
import Link from "next/link";
import ForageIcon, {ForageMotif} from "./ForageIcon";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  /** First original picture, the card's cover; "" when there is none. */
  cover?: string; images?: number; platform?: string; lede?: string; form?: string;
};

const TINTS = ["peach", "honey", "mint", "sky", "lilac"] as const;
function tintOf(key: string): string {
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TINTS[h % TINTS.length];
}

/** A fixed shuffle for one seed, so the feed stays put while scrolling and changes only on 再洗一次. */
function shuffled<T>(rows: T[], seed: number): T[] {
  const out = [...rows];
  let x = seed || 1;
  for (let i = out.length - 1; i > 0; i--) {
    x = (x * 1103515245 + 12345) & 0x7fffffff;
    const j = x % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Rough card height, used only to keep the columns even: a picture is tall, text grows with its length. */
function weight(item: CollectionItem, failed: Set<string>): number {
  const pic = item.cover && !failed.has(item.cover) ? 230 : 0;
  const words = pic ? 0 : Math.min(item.lede?.length || item.summary.length, 90);
  return 96 + pic + Math.ceil(item.title.length / 11) * 22 + Math.ceil(words / 12) * 22;
}

/** Each card goes to the column that is shortest so far, in feed order, so the feed reads left, right, left… */
function columnsOf(items: CollectionItem[], count: number, failed: Set<string>): CollectionItem[][] {
  const cols = Array.from({ length: count }, () => [] as CollectionItem[]);
  const height = new Array(count).fill(0);
  for (const item of items) {
    const at = height.indexOf(Math.min(...height));
    cols[at].push(item);
    height[at] += weight(item, failed);
  }
  return cols;
}

function FeedCard({ item, failed, onFail }: { item: CollectionItem; failed: boolean; onFail: () => void }) {
  const pic = item.cover && !failed;
  return <Link href={item.href} className={"forage-pin" + (pic ? " has-pic" : " is-note")} data-tint={tintOf(item.topic || item.kind)}>
    {pic && <span className="forage-pin-pic">
      <Image src={item.cover!} alt="" width={600} height={760} unoptimized loading="lazy" onError={onFail} />
      {(item.images ?? 0) > 1 && <span className="forage-pin-count">{item.images} 張</span>}
    </span>}
    <span className="forage-pin-body">
      <span className="forage-pin-tags">
        {item.form && <span>{item.form}</span>}
        {item.platform && <span>{item.platform}</span>}
      </span>
      {!pic && item.lede && <span className="forage-pin-lede">{item.lede}</span>}
      <b className="forage-pin-title">{item.title}</b>
      {!pic && !item.lede && item.summary && <span className="forage-pin-lede is-summary">{item.summary}</span>}
      <small className="forage-pin-meta">{item.topic} · {capturedDate(item.capturedAt)}{item.c ? ` · ${item.c}` : ""}</small>
    </span>
  </Link>;
}
type CollectionOverview = Omit<ForageOverview, "recent"> & { recent: CollectionItem[] };

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
  const [seed, setSeed] = useState(() => Math.floor(Date.now() / 86_400_000));
  const [limit, setLimit] = useState(24);
  const [failed, setFailed] = useState<Set<string>>(() => new Set());
  const [columns, setColumns] = useState(2);
  const more = useRef<HTMLDivElement | null>(null);
  const results = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const rows = (overview?.recent || []).filter(item => {
      const body = [item.title, item.original, item.note, item.summary, item.topic, item.purpose].join(" ").toLowerCase();
      return (!topic || item.topic === topic) && (!purpose || item.purpose === purpose) && words.every(word => body.includes(word));
    });
    return rediscover ? shuffled(rows, seed) : rows;
  }, [overview, query, topic, purpose, rediscover, seed]);
  const shown = results.slice(0, limit);
  const feed = useMemo(() => columnsOf(shown, columns, failed), [shown, columns, failed]);

  // Two columns on a phone or tablet, three on a wide screen.
  useEffect(() => {
    const wide = window.matchMedia("(min-width: 1000px)");
    const apply = () => setColumns(wide.matches ? 3 : 2);
    apply();
    wide.addEventListener("change", apply);
    return () => wide.removeEventListener("change", apply);
  }, []);
  // More cards load on their own as the end of the feed comes near.
  useEffect(() => {
    const end = more.current;
    if (!end || results.length <= limit) return;
    const watch = new IntersectionObserver((seen) => { if (seen.some((entry) => entry.isIntersecting)) setLimit((n) => n + 20); }, { rootMargin: "600px 0px" });
    watch.observe(end);
    return () => watch.disconnect();
  }, [results.length, limit]);
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

      <section className="forage-recent forage-feed" aria-label="收藏素材">
        <div className="forage-feed-bar">
          <input type="search" aria-label="搜尋收藏" placeholder="搜尋標題、原文或筆記" value={query} onChange={e=>{setQuery(e.target.value);setLimit(24)}} />
          <div className="forage-feed-modes" role="group" aria-label="排序">
            <button type="button" aria-pressed={rediscover} onClick={()=>{if(rediscover)setSeed(n=>n+1);setRediscover(true);setLimit(24);window.scrollTo({top:0,behavior:"smooth"});}}>{rediscover ? "再洗一次" : "重新發現"}</button>
            <button type="button" aria-pressed={!rediscover} onClick={()=>{setRediscover(false);setLimit(24)}}>最近收錄</button>
          </div>
        </div>
        <details className="forage-feed-filter"><summary>篩選{topic || purpose ? `：${[topic, purpose].filter(Boolean).join("、")}` : ""}</summary>
          <div className="forage-feed-filter-row">
            <label>主題 <select value={topic} onChange={e=>{setTopic(e.target.value);setLimit(24)}}><option value="">全部主題</option>{Array.from(new Set(overview?.recent.map(i=>i.topic))).sort().map(t=><option key={t}>{t}</option>)}</select></label>
            <label>用途 <select value={purpose} onChange={e=>{setPurpose(e.target.value);setLimit(24)}}><option value="">所有用途</option>{Array.from(new Set(overview?.recent.map(i=>i.purpose))).sort().map(t=><option key={t}>{t}</option>)}</select></label>
          </div>
          <p>C 值看創作成熟度：C0 剛收下，C1 知道為何想留，C2 已有切角，C3 已準備好創作。K 值看來源處理進度：K0 待整理出處，K1 可回查來源。</p>
        </details>
        {overview && <p className="forage-feed-count" role="status">{results.length} 筆收藏{rediscover ? "，隨機排列" : "，由新到舊"}</p>}
        <div className="forage-masonry" style={{gridTemplateColumns:`repeat(${columns},minmax(0,1fr))`}}>
          {feed.map((col, index) => <div className="forage-masonry-col" key={index}>
            {col.map(item => <FeedCard key={item.kind+item.id} item={item} failed={Boolean(item.cover && failed.has(item.cover))}
              onFail={() => item.cover && setFailed(prev => new Set(prev).add(item.cover!))} />)}
          </div>)}
        </div>
        <div ref={more} aria-hidden="true" />
        {results.length>limit && <button type="button" className="forage-feed-more" onClick={()=>setLimit(limit+20)}>再看更多</button>}
        {overview && results.length > 0 && results.length <= limit && <p className="forage-feed-end">都看完了。{rediscover ? "按「再洗一次」換個順序重新遇見。" : ""}</p>}
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
