"use client";

import Link from "next/link";
import { useDojo } from "@/lib/dojo/store";
import { RealmArt, PracticeIcon } from "../components/PracticeArt";
import EntryCard from "../components/EntryCard";

export default function DaoPage() {
  const { entries, entriesLoading, entriesError, openQuickAdd } = useDojo();
  const archived = entries.filter((entry) =>
    entry.space === "dao" || entry.traceLevel === "permanent" || entry.traceLevel === "accumulated" || entry.traceStatus === "收納"
  );

  return (
    <section className="screen dao-workspace">
      <div className="hero da practice-realm-hero"><RealmArt dao />
        <span className="eyebrow">道藏</span>
        <h1>道藏</h1><h2>珍藏、回望</h2>
        <p>主動選擇值得長久留下的作品、洞見與生活痕跡。</p>
      </div>
      <Link href="/dao/explore" className="knowledge-entry-link dao-entry"><span className="practice-entry-icon"><PracticeIcon name="learning" /></span><span className="practice-entry-copy"><b>閱讀與知識總覽</b><small>跨筆記、洞察與知識查找內容</small></span><span aria-hidden="true">›</span></Link>
      <Link href="/dao/knowledge" className="knowledge-entry-link dao-entry"><span className="practice-entry-icon"><PracticeIcon name="default" /></span><span className="practice-entry-copy"><small>可重用的理解</small><b>打開知識庫</b><small>審閱知識候選、適用邊界與版本歷史</small></span><span aria-hidden="true">›</span></Link>
      <button className="primary" onClick={() => openQuickAdd({ presetSpace: "dao", presetKind: "入藏" })}>＋ 新增入藏紀錄</button>
      <h2 className="section-title dao-content-heading">已留下的內容</h2>
      {entriesLoading && <div className="empty">正在讀取道藏…</div>}
      {entriesError && <p className="form-error">{entriesError}</p>}
      {!entriesLoading && !entriesError && archived.length === 0 && <div className="practice-empty dao-empty"><span className="practice-empty-icon"><PracticeIcon name="default" /></span><b>尚未有主動入藏的紀錄。</b><p>選擇值得留下的內容，慢慢累積自己的道藏。</p></div>}
      {archived.map((entry) => <EntryCard key={entry.id} entry={entry} />)}
    </section>
  );
}
