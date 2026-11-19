"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { ReadingNote } from "@/lib/reading/types";
import { manualCardText, type ManualReadingCard } from "@/lib/reading/manual";
import { noteHref } from "@/lib/reading/clips";
import { copyText } from "@/lib/dojo/weavingWorkflow/clientIdentity";

const url = "/api/dojo/reading/manual-cards";
async function run<T>(endpoint: string, data?: unknown): Promise<T> {
  const response = await fetch(
    endpoint,
    data
      ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }
      : { cache: "no-store" },
  );
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw Error(json.error || "無法讀取卡片。");
  return json;
}
export function ManualCardEntry({
  bookId,
  note,
  disabled,
  onInsightCreated,
}: {
  bookId: string;
  note: ReadingNote;
  disabled?: boolean;
  onInsightCreated: (id: string) => void;
}) {
  const [type, setType] = useState("觀點"),
    [text, setText] = useState(""),
    [action, setAction] = useState(""),
    [share, setShare] = useState(false);
  const [actionType, setActionType] = useState("觀察型"),
    [date, setDate] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false);
  const key = useRef("");
  async function save() {
    if (busy || disabled) return;
    setBusy(true);
    setError("");
    if (!key.current) key.current = crypto.randomUUID();
    try {
      const { card } = await run<{ card: ManualReadingCard }>(url, {
        action: "create",
        id: key.current,
        bookId,
        noteId: note.id,
        type,
        text,
        actionType,
        nextVisitAt: date || null,
        actionText: action,
        share,
      });
      setSaved(true);
      if (card.cardId) onInsightCreated(card.cardId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
      <details>
        <summary>手動留卡</summary>
        {saved ? (
          <div role="status">
            已存入卡片庫，可從卡片回看這個選段。{" "}
            <Link href="/reading/cards?view=confirmed">查看已確認卡片</Link>{" "}
            <button
              onClick={() => {
                key.current = crypto.randomUUID();
                setSaved(false);
                setText("");
                setAction("");
                setDate("");
                setShare(false);
              }}
            >
              再留一張
            </button>
          </div>
        ) : (
          <div className="clip-form">
            <label>
              卡片類型
              <select className="field" value={type} onChange={(e) => setType(e.target.value)}>
                <option value="觀點">我的觀點</option>
                <option>洞察卡</option>
              </select>
            </label>
            <label>
              我的理解
              <textarea
                className="field"
                rows={3}
                maxLength={6000}
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
            </label>
            {(note.metadata.reflection || note.kind === "thought") && (
              <button onClick={() => setText(note.metadata.reflection || note.text)}>帶入我原本的心得</button>
            )}
            {type === "洞察卡" && (
              <>
                <label>
                  我想觀察或執行的事
                  <textarea
                    className="field"
                    rows={2}
                    value={action}
                    maxLength={6000}
                    onChange={(e) => setAction(e.target.value)}
                  />
                </label>
                <label>
                  行動型態
                  <select
                    className="field"
                    value={actionType}
                    onChange={(e) => setActionType(e.target.value)}
                  >
                    <option>觀察型</option>
                    <option>執行型</option>
                  </select>
                </label>
                <label>
                  下次回訪（選填）
                  <input
                    type="date"
                    className="field"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </label>
              </>
            )}
            <label>
              <input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} />{" "}
              開放給其他場域取用
            </label>
            <button
              className="primary"
              disabled={busy || disabled || !text.trim() || (type === "洞察卡" && !action.trim())}
              onClick={() => void save()}
            >
              確認留卡
            </button>
          </div>
        )}
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
      </details>
  );
}
export function ManualCardLibrary() {
  const box = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (box.current && new URLSearchParams(location.search).get("view") === "confirmed")
      box.current.open = true;
  }, []);
  const [cards, setCards] = useState<ManualReadingCard[] | null>(null),
    [error, setError] = useState(""),
    [feedback, setFeedback] = useState("");
  const [fallback, setFallback] = useState(""),
    [busy, setBusy] = useState(false);
  async function load() {
    setError("");
    setBusy(true);
    try {
      setCards((await run<{ cards: ManualReadingCard[] }>(url)).cards);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function sharing(c: ManualReadingCard, share: boolean) {
    setError("");
    try {
      const { card } = await run<{ card: ManualReadingCard }>(url, {
        action: "sharing",
        id: c.id,
        noteId: c.noteId,
        bookId: c.bookId,
        share,
      });
      setCards((items) => (items || []).map((x) => (x.id === c.id ? card : x)));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <details
      className="ritual-card reading-manual-list"
      ref={box}
      onToggle={(event) => {
        if (event.currentTarget.open && cards === null && !busy && !error) void load();
      }}
    >
      <summary>手動留卡・已確認的觀點與洞察</summary>
      {busy && <p>正在讀取卡片…</p>}
      {cards?.length === 0 && <p>閱讀時遇到想留下的句子，可從選段的「更多」手動留卡。</p>}
      {cards?.map((c) => (
        <article key={c.id} className="reading-source-note">
          <small>{c.type === "觀點" ? "我的觀點" : "洞察卡"} · 手動留下</small>
          <p>{c.text}</p>
          {c.action && <p>待觀察／執行　{c.action}</p>}
          <small>
            《{c.bookTitle}》 · 第 {c.readCount} 讀{c.locator && " · " + c.locator}
          </small>
          <details>
            <summary>回看原句</summary>
            <small>{c.quoteLabel}</small>
            <blockquote>{c.quote}</blockquote>
            <Link href={noteHref(c)}>打開原始閱讀選段</Link>
          </details>
          <label>
            <input type="checkbox" checked={c.share} onChange={(e) => void sharing(c, e.target.checked)} />{" "}
            開放給其他場域取用
          </label>
          {c.share && (
            <button
              onClick={() => {
                const body = manualCardText(c) + "\n" + new URL(noteHref(c), location.origin).href;
                void copyText(body)
                  .then(() => setFeedback("已複製卡片與出處。"))
                  .catch(() => setFallback(body));
              }}
            >
              複製卡片與出處
            </button>
          )}
        </article>
      ))}
      {feedback && <p role="status">{feedback}</p>}
      {fallback && (
        <label>
          長按複製卡片與出處
          <textarea readOnly value={fallback} className="field" />
        </label>
      )}
      {error && (
        <p role="alert">
          {error} <button onClick={() => void load()}>重試</button>
        </p>
      )}
    </details>
  );
}
