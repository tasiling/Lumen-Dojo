"use client";
import { RealmArt, PracticeIcon } from "./PracticeArt";
import LearningRecordWorkspace from "./LearningRecordWorkspace";
import Link from "./PracticeRouteLink";
import { useEffect, useState } from "react";
import { useDojo } from "@/lib/dojo/store";
import type { EnglishJournalPractice } from "@/lib/dojo/englishJournal";
export function PracticeLink({
  href,
  title,
  detail,
}: {
  href: string;
  title: string;
  detail?: string;
}) {
  return (
    <Link className="practice-link card" href={href}>
      <span className="practice-entry-icon"><PracticeIcon name={href.split("/").pop()?.split("?")[0] || "default"} /></span><span className="practice-entry-copy"><b>{title}</b>
      {detail && <small>{detail}</small>}</span><span aria-hidden="true">›</span>
    </Link>
  );
}
export default function PracticeHome() {
  const { entries, entriesError, entriesLoading, openQuickAdd } = useDojo();
  const [resume, setResume] = useState<EnglishJournalPractice | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let live = true;
    fetch("/api/dojo/english-journal", { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw Error(j.error ?? "日記暫時不可用");
        if (live)
          setResume(
            j.practices
              .filter((x: EnglishJournalPractice) => x.status !== "completed")
              .sort((a: EnglishJournalPractice, b: EnglishJournalPractice) =>
                b.updatedAt.localeCompare(a.updatedAt),
              )[0] ?? null,
          );
      })
      .catch((e) => {
        if (live) setError(e.message);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, []);
  return (
    <section className="screen practice-workspace practice-home">
      <div className="practice-realm-hero"><RealmArt /><span>修習所</span><h1>給此刻的自己，<br />一點照顧。</h1><p>一段練習、一個理解，或此刻的感受。</p><button className="primary" onClick={()=>openQuickAdd({presetSpace:"practice",presetKind:"修習"})}>留下修習紀錄</button></div>
      <h2>繼續上次</h2>
      {loading ? (
        <p>正在讀取已保存的自譯…</p>
      ) : error ? (
        <p role="alert">{error}</p>
      ) : resume ? (
        <PracticeLink
          href={`/practice/journal?journal=${resume.date}`}
          title={`續寫 ${resume.date} 的日記`}
          detail="回到已保存的分段與初稿"
        />
      ) : (
        <p>目前沒有未完成的自譯。可從日記頁選擇來源。</p>
      )}
      <LearningRecordWorkspace recent />
      <h2>常用工具</h2>
      <div className="practice-shortcuts">
        {[
          ["journal", "日記自譯"],
          ["learning", "學習項目與本期專注"],
          ["context", "語境修習室"],
          ["vocabulary", "VocabForge"],
          ["grammar", "句型與語法"],
        ].map(([key, label]) => (
          <PracticeLink key={key} href={`/practice/${key}`} title={label} />
        ))}
        <PracticeLink href="/reading" title="閱讀筆記" />
      </div>
      <details>
        <summary>這次會走過（可略過）</summary>
        <p>選擇工作空間 → 練習或留下紀錄。計時是選用輔助。</p>
      </details>
      <h2>身心靈入口</h2>
      {[
        ["body", "身", "活動、睡眠、飲食與恢復紀錄"],
        ["learning", "心・知", "跨項目學習"],
        ["emotion", "心・情", "情緒覺察、感恩與心裡小語"],
        ["intention", "心・意", "創現角色、里程碑與狂A肯定句"],
        ["spirit", "靈", "Vision、冥想與祈願"],
      ].map(([key, title, detail]) => (
        <PracticeLink
          key={key}
          href={`/practice/${key}`}
          title={title}
          detail={detail}
        />
      ))}
      <h2>最近真實紀錄</h2>
      {entriesError ? (
        <p role="alert">{entriesError}</p>
      ) : entriesLoading ? (
        <p>讀取紀錄中…</p>
      ) : entries.filter((e) => e.space === "practice").length ? (
        entries
          .filter((e) => e.space === "practice")
          .sort((a, b) => b.date.localeCompare(a.date))
          .slice(0, 4)
          .map((e) => (
            <button
              className="card practice-link"
              key={e.id}
              onClick={() => openQuickAdd({ editId: e.id })}
            >
              <b>{e.title}</b>
              <small>
                {e.date} · {e.kind}
              </small>
            </button>
          ))
      ) : (
        <p>尚無修習紀錄。可從身心靈入口留下第一筆。</p>
      )}
      <PracticeLink
        href="/practice/atlas"
        title="光之圖鑑"
        detail="光行與光法，保留各自語意"
      />
      <PracticeLink href="/practice/logs" title="修習與計時歷史" />
      <Link href="/timer">輔助計時（選用）</Link>
    </section>
  );
}
