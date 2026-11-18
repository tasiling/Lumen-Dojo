"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { discussionHref, type DiscussionSummary } from "@/lib/reading/discussion";

export default function ReadingDiscussionQueue() {
  const [summary, setSummary] = useState<DiscussionSummary | null>(null);
  useEffect(() => {
    let active = true;
    fetch("/api/dojo/reading/discussions", { cache: "no-store" }).then(async res => {
      if (res.ok && active) setSummary(await res.json());
    }).catch(() => { /* The reading notes entry remains available. */ });
    return () => { active = false; };
  }, []);
  async function hide() {
    if (!summary?.resume) return;
    const response = await fetch("/api/dojo/reading/discussions", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...summary.resume, action: "hide" }),
    }).catch(() => null);
    if (response?.ok) setSummary(value => value && { ...value, resume: null });
  }
  return <section className="practice-panel" aria-labelledby="mind-reading">
    {summary?.resume && <article className="card">
      <h2>接著上次</h2>
      <p>{summary.resume.bookTitle} · {summary.resume.noteLabel}</p>
      {summary.resume.next && <p>{summary.resume.next}</p>}
      <div className="practice-shortcuts">
        <Link className="primary" href={discussionHref(summary.resume)}>回到 GPT 討論</Link>
        <button onClick={() => void hide()}>先收起來</button>
      </div>
    </article>}
    <h2 id="mind-reading">閱讀與內化</h2>
    <div className="practice-shortcuts">
      <Link className="card practice-link" href="/reading">閱讀筆記</Link>
      <Link className="card practice-link" href="/reading/cards">洞察卡片庫</Link>
      <Link className="card practice-link" href="/reading/visits">今日回訪</Link>
    </div>
    {!!summary?.pending.length && <details className="practice-item-picker">
      <summary>待挑選的成果（{summary.pending.reduce((sum, entry) => sum + entry.count, 0)}）</summary>
      <div className="practice-shortcuts">{summary.pending.map(entry => <Link className="card practice-link" href={discussionHref(entry)} key={entry.roundId}>
        <span className="practice-entry-copy"><b>{entry.bookTitle}</b><small>{entry.noteLabel} · {entry.count} 筆待挑選</small></span>
      </Link>)}</div>
    </details>}
  </section>;
}
