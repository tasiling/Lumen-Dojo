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
  row = false,
}: {
  href: string;
  title: string;
  detail?: string;
  row?: boolean;
}) {
  return (
    <Link className={row ? "practice-link practice-row" : "practice-link card"} href={href}>
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
      <section className="practice-panel" aria-labelledby="practice-realms-title">
        <h2 id="practice-realms-title">身心靈修習</h2><p className="practice-panel-caption">今天，想從哪裡開始？</p>
        {[
          ["body", "身", "活動、睡眠、飲食與恢復"],
          ["learning", "心・知", "各學習項目的理解與練習"],
          ["emotion", "心・情", "情緒覺察、感恩與心裡小語"],
          ["intention", "心・意", "創現角色、里程碑與狂 A 肯定句"],
          ["spirit", "靈", "Vision、冥想與祈願"],
        ].map(([key,title,detail])=><PracticeLink row key={key} href={`/practice/${key}`} title={title} detail={detail} />)}
      </section>
      <section className="practice-panel" aria-labelledby="practice-tools-title">
        <div className="practice-panel-head"><h2 id="practice-tools-title">常用工具</h2><Link href="/practice/learning?tab=tools" className="practice-text-link">學習項目</Link></div>
        <PracticeLink row href="/practice/context" title="語境修習室" detail="從真實素材練習表達" />
        <PracticeLink row href="/practice/vocabulary" title="VocabForge" detail="回到詞庫，五字複習" />
        <details className="practice-more-tools"><summary>其他工具</summary>
          <PracticeLink row href="/practice/journal" title="日記自譯" detail="從日記內容練習英文" />
          <PracticeLink row href="/practice/grammar" title="句型與語法" />
          <PracticeLink row href="/reading" title="閱讀筆記" />
        </details>
      </section>
      {(loading || error || resume) && <section className="practice-panel practice-resume" aria-labelledby="practice-resume-title"><h2 id="practice-resume-title">繼續日記自譯</h2>
        {loading ? <p role="status">正在讀取已保存的自譯…</p> : error ? <p role="alert">{error}</p> : resume ? <PracticeLink row href={`/practice/journal?journal=${resume.date}`} title={`續寫 ${resume.date} 的日記`} detail="回到已保存的分段與初稿" /> : null}
      </section>}
      <LearningRecordWorkspace recent>
        {entriesError ? <p role="alert">其他修習紀錄暫時無法讀取：{entriesError}</p> : entriesLoading ? <p role="status">正在讀取其他修習紀錄…</p> : entries.some(e=>e.space==='practice') && <div className="practice-legacy-recent"><h3>其他修習紀錄</h3>{entries.filter(e=>e.space==='practice').slice().sort((a,b)=>b.date.localeCompare(a.date)).slice(0,4).map(e=><button className="practice-history-entry" key={e.id} onClick={()=>openQuickAdd({editId:e.id})}><span><b>{e.title}</b><small>{e.date}・{e.kind}</small></span><span aria-hidden="true">›</span></button>)}</div>}
      </LearningRecordWorkspace>
      <section className="practice-panel" aria-label="圖鑑與歷史">
        <PracticeLink row href="/practice/atlas" title="光之圖鑑" detail="光行與光法，保留各自語意" />
        <PracticeLink row href="/practice/logs" title="修習與計時歷史" detail="回看投入過的每一段時間" />
        <Link href="/timer" className="practice-text-link">輔助計時（選用）</Link>
      </section>
    </section>
  );
}
