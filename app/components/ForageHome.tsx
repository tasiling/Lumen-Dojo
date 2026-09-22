"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
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

export default function ForageHome() {
  const [overview, setOverview] = useState<ForageOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      setOverview(await responseJson<ForageOverview>(await fetch("/api/dojo/forage-overview", { cache: "no-store" })));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);

  const english = overview?.english ?? { pending: 0, classification: 0, dispatch: 0, errors: 0 };
  const captures = overview?.captures ?? { pending: 0, adopted: 0, faded: 0 };

  return (
    <section className="screen forage-home">
      <div className="forage-home-intro">
        <div><span className="eyebrow">六個場域・野採</span><h1>今天要整理哪一匣？</h1><p>先看工作概況，再進入需要處理的素材；首頁不再展開完整清單。</p></div>
        <Link href="/add" className="forage-add-entry">＋ 新增素材</Link>
      </div>

      {loading && <div className="forage-overview-state">正在整理採集概況…</div>}
      {error && <div className="forage-overview-state is-error"><span>{error}</span><button onClick={() => void load()}>重新讀取</button></div>}
      {!loading && !error && english.errors > 0 && (
        <div className="forage-alert" role="status"><span>!</span><div><b>有 {english.errors} 筆英文素材需要確認</b><p>分析或同步發生異常，紀錄仍完整保留。</p></div><Link href="/forage/english">前往查看</Link></div>
      )}

      <div className="forage-entry-grid" aria-label="採集匣入口">
        <article className="forage-entry-card is-english">
          <div className="forage-entry-title"><span aria-hidden="true">Aa</span><div><small>學習素材</small><h2>英文影像</h2></div></div>
          <div className="forage-primary-count"><strong>{english.pending}</strong><span>待處理</span></div>
          <div className="forage-count-grid">
            <CountItem value={english.classification} label="待分類" />
            <CountItem value={english.dispatch} label="待挑選／派送" />
            <CountItem value={english.errors} label="處理異常" tone={english.errors ? "is-error" : ""} />
          </div>
          <p>AI 分析、單字與語境派送皆在影像詳情中處理。</p>
          <Link href="/forage/english" className="forage-card-action">前往英文影像匣 <span>→</span></Link>
        </article>

        <article className="forage-entry-card is-capture">
          <div className="forage-entry-title"><span aria-hidden="true">✦</span><div><small>原始材料</small><h2>一般素材</h2></div></div>
          <div className="forage-primary-count"><strong>{captures.pending}</strong><span>待處理</span></div>
          <div className="forage-count-grid capture-counts">
            <CountItem value={captures.pending} label="待處理" />
            <CountItem value={captures.adopted} label="已採用" />
            <CountItem value={captures.faded} label="已淡出" />
          </div>
          <p>補上收藏用途、成熟度、使用去向與知識關聯。</p>
          <Link href="/forage/captures" className="forage-card-action">前往一般採集匣 <span>→</span></Link>
        </article>
      </div>

      <div className="forage-secondary-entry">
        <div><b>其他野採紀錄</b><span>保留既有場域紀錄、新增紀錄與計時入口。</span></div>
        <Link href="/forage/records">查看紀錄 →</Link>
      </div>

      <section className="forage-recent" aria-labelledby="forage-recent-title">
        <div className="forage-recent-heading"><div><span className="eyebrow">快速回訪</span><h2 id="forage-recent-title">最近留下的素材</h2></div><span>最多 3 筆</span></div>
        {!loading && !error && overview?.recent.length === 0 && <p className="forage-recent-empty">尚未留下素材；可以從「新增素材」開始。</p>}
        <div className="forage-recent-list">
          {overview?.recent.map((item) => (
            <Link className="forage-recent-item" href={item.href} key={`${item.kind}-${item.id}`}>
              <div><span>{item.kind === "english" ? "英文影像" : "一般素材"}</span><time dateTime={item.capturedAt}>{capturedDate(item.capturedAt)}</time></div>
              <h3>{item.title}</h3><small>{item.sourceLabel}</small><p>{item.summary}</p><b>查看素材 →</b>
            </Link>
          ))}
        </div>
      </section>
    </section>
  );
}
