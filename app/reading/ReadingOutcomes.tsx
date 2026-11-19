"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { discussionHref, evidenceFor, type ReadingDiscussion } from "@/lib/reading/discussion";
import "./outcomes.css";

export function ReadingOutcomes({ discussions }: { discussions: ReadingDiscussion[] }) {
  const rounds = discussions.flatMap(thread => thread.rounds
    .filter(round => round.result?.candidates.length)
    .map(round => ({ round, thread })));
  if (!rounds.length) return null;
  return <section id="reading-outcomes" className="reading-outcomes" aria-label="討論觀點與洞察">
    <h2>討論觀點與洞察</h2>
    {rounds.map(({ thread, round }) => {
      const result = round.result!;
      const evidence = evidenceFor(round);
      return <div className="outcome-round" key={round.id}>
        <h3>{round.source.label}</h3>
        {(["觀點", "洞察卡"] as const).map(type => {
          const candidates = result.candidates.filter(candidate => candidate.type === type);
          if (!candidates.length) return null;
          return <details className="outcome-group" key={type} open={type === "觀點"}>
            <summary>{type} {candidates.length} {type === "觀點" ? "則" : "張"}</summary>
            <ul>{candidates.map(candidate => {
              const source = evidence[candidate.anchor];
              const gpt = source?.label === "GPT 發言";
              const status = { confirmed: "已保留", skipped: "已略過", pending: gpt ? "待本人確認" : "待挑選" }[candidate.state];
              return <li key={candidate.id}>
                <small>{gpt && "GPT 延伸 · "}{status}</small>
                <p>{candidate.text}</p>
                {candidate.action && <p className="outcome-action">可試的行動　{candidate.action}</p>}
                <details className="outcome-evidence"><summary>依據原句 · {candidate.anchor} · {source?.label || "來源待核對"}</summary>
                  <blockquote>{candidate.quote}</blockquote>
                </details>
              </li>;
            })}</ul>
          </details>;
        })}
        <Link href={discussionHref({ bookId: round.source.bookId, discussionId: thread.id, roundId: round.id }, round.source.noteId)}>
          查看 {result.turns.length} 則問答與挑選成果 →
        </Link>
      </div>;
    })}
  </section>;
}

// Reload on each visit to the reading/review tab so newly retained items are reflected.
export function BookReadingOutcomes({ bookId }: { bookId: string }) {
  const [discussions, setDiscussions] = useState<ReadingDiscussion[]>([]);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setDiscussions([]); setFailed(false);
    fetch("/api/dojo/reading/reader/" + encodeURIComponent(bookId), { signal: controller.signal, cache: "no-store" })
      .then(async response => {
        if (!response.ok) throw Error();
        const data = await response.json();
        if (!controller.signal.aborted) { setDiscussions(data.discussions); setFailed(data.discussionUnavailable); }
      })
      .catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [bookId, attempt]);
  return <><ReadingOutcomes discussions={discussions}/>{failed && <p role="status">部分討論暫時無法讀取。 <button onClick={() => setAttempt(value => value + 1)}>重試</button></p>}</>;
}
