"use client";

import Link from "next/link";
import { useDojo } from "@/lib/dojo/store";
import EntryCard from "../components/EntryCard";

export default function DaoPage() {
  const { entries, entriesLoading, entriesError, openQuickAdd } = useDojo();
  const archived = entries.filter((entry) =>
    entry.space === "dao" || entry.traceLevel === "permanent" || entry.traceLevel === "accumulated" || entry.traceStatus === "收納"
  );

  return (
    <section className="screen">
      <div className="hero da">
        <span className="eyebrow">六個場域</span>
        <h1>道藏</h1>
        <p>主動選擇值得長久留下的作品、洞見與生活痕跡。</p>
      </div>
      <Link href="/dao/knowledge" className="knowledge-entry-link"><span>可重用的理解</span><b>打開知識主張庫（暫名）</b><small>審閱候選 Claim、適用邊界與版本歷史</small></Link>
      <button className="primary" onClick={() => openQuickAdd({ presetSpace: "dao", presetKind: "入藏" })}>＋ 新增入藏紀錄</button>
      <h2 className="section-title">已留下的內容</h2>
      {entriesLoading && <div className="empty">正在讀取道藏…</div>}
      {entriesError && <p className="form-error">{entriesError}</p>}
      {!entriesLoading && archived.length === 0 && <div className="empty">尚未有主動入藏的紀錄。</div>}
      {archived.map((entry) => <EntryCard key={entry.id} entry={entry} />)}
    </section>
  );
}
