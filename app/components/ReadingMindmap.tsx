"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReadingDiscussion } from "@/lib/reading/discussion";
import { mindmapCount, mindmapMarkdown, readingMindmap, type MindNode } from "@/lib/reading/mindmap";
import type { InsightCard, ReadingBook, ReadingNote } from "@/lib/reading/types";
import { discussionRequest } from "./ReadingDiscussion";

function Branch({ item, depth }: { item: MindNode; depth: number }) {
  const label = <span className={"reading-map-node is-" + item.kind}>
    {item.tag && <small>{item.tag}</small>}
    <span>{item.text}</span>
  </span>;
  if (!item.children.length) return <li>{label}</li>;
  return <li>
    <details open={depth < 2}>
      <summary>{label}<i aria-hidden="true">{item.children.length}</i></summary>
      <ul>{item.children.map((child, index) => <Branch key={index} item={child} depth={depth + 1} />)}</ul>
    </details>
  </li>;
}

/** 讀後復盤的心智圖：把這一讀已經寫下的問題、摘錄、想法、觀點與洞察排成一張圖。 */
export default function ReadingMindmap({ book, notes, cards }: { book: ReadingBook; notes: ReadingNote[]; cards: InsightCard[] }) {
  const [discussions, setDiscussions] = useState<ReadingDiscussion[]>([]);
  const [notice, setNotice] = useState("");
  const [manual, setManual] = useState("");

  useEffect(() => {
    let active = true;
    discussionRequest<{ discussions: ReadingDiscussion[] }>(undefined, "?bookId=" + encodeURIComponent(book.id))
      .then(value => { if (active) setDiscussions(value.discussions ?? []); })
      .catch(() => { /* 沒有討論紀錄時，心智圖照樣用筆記畫出來。 */ });
    return () => { active = false; };
  }, [book.id]);

  const root = useMemo(() => readingMindmap({ book, notes, cards, discussions }), [book, notes, cards, discussions]);
  const total = mindmapCount(root);

  async function copy() {
    const text = mindmapMarkdown(root);
    setManual("");
    try { await navigator.clipboard.writeText(text); setNotice("已複製大綱，可以貼到 Markmap 或任何心智圖工具。"); }
    catch { setManual(text); setNotice("長按下方文字，選取全部後複製。"); }
  }

  return <section className="reading-stage-panel reading-map-panel" aria-label="這一讀的心智圖">
    <div className="reading-section-heading">
      <div><h2>這一讀的心智圖</h2><p>只排列你已經寫下的內容，不會新增任何文字。</p></div>
      {total > 0 && <button type="button" onClick={() => void copy()}>複製大綱</button>}
    </div>
    {total === 0 ? <div className="reading-soft-empty">留下摘錄、想法或復盤後，這裡會長出這本書的心智圖。</div> : <>
      <p className="reading-map-legend">
        <span className="reading-map-node is-author"><small>作者原文</small></span>
        <span className="reading-map-node is-mine"><small>我寫的</small></span>
        <span className="reading-map-node is-question"><small>問題</small></span>
        <span className="reading-map-node is-card"><small>洞察卡</small></span>
      </p>
      <div className="reading-map">
        <span className="reading-map-root">{root.text}{root.tag && <small>{root.tag}</small>}</span>
        <ul>{root.children.map((child, index) => <Branch key={index} item={child} depth={0} />)}</ul>
      </div>
    </>}
    {notice && <p className="save-notice" role="status">{notice}</p>}
    {manual && <label>手動複製<textarea className="field" readOnly rows={8} value={manual} onFocus={event => event.target.select()} /></label>}
  </section>;
}
