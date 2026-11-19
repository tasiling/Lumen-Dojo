"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { noteHref, originalHref, type ClipBatchDetail, type ClipLayout } from "@/lib/reading/clips";
import type { ReadingBook } from "@/lib/reading/types";
import { regionKey, type Selection } from "@/lib/reading/highlights";
import { scanHighlights } from "@/lib/reading/scanHighlights";

type Draft = Selection & { label: string; keep: boolean };
function draft(group: Selection): Draft {
  return { ...group, label: "", keep: true };
}
export default function ReadingHighlightReview({
  batch,
  books,
  initialBook,
  onSaved,
}: {
  batch: ClipBatchDetail;
  books: ReadingBook[];
  initialBook: string;
  onSaved: (batch: ClipBatchDetail) => void;
}) {
  const cache = "reading.highlights.v1." + batch.id + "." + batch.pages.map((p) => p.id).join(".");
  const [items, setItems] = useState<Draft[]>([]),
    [layout, setLayout] = useState<ClipLayout>("vertical"),
    [book, setBook] = useState(initialBook);
  const [busy, setBusy] = useState(false),
    [status, setStatus] = useState(""),
    [error, setError] = useState("");
  const ready = useRef(false),
    controller = useRef<AbortController | null>(null);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(cache);
      if (raw) {
        const s = JSON.parse(raw);
        setItems(s.items);
        setBook(s.book);
        setLayout(s.layout);
      }
    } catch {}
    ready.current = true;
    return () => {
      ready.current = false;
      controller.current?.abort();
    };
  }, [cache]);
  function persist(data: Draft[], b = book, l = layout) {
    try {
      localStorage.setItem(cache, JSON.stringify({ items: data, book: b, layout: l }));
    } catch {}
  }
  function update(data: Draft[]) {
    setItems(data);
    persist(data);
  }
  async function scan() {
    const c = new AbortController();
    controller.current = c;
    setBusy(true);
    setError("");
    try {
      const groups = await scanHighlights(batch.pages, layout, c.signal, (s) => {
        if (!c.signal.aborted) setStatus(s);
      });
      if (c.signal.aborted) return;
      const saved = new Set(
        Object.values(batch.highlightNotes ?? {})
          .filter((r) => r.bookId === book)
          .flatMap((r) => r.parts),
      );
      const fresh = groups.flatMap((g) => {
        const parts = g.parts.filter((p) => !saved.has(regionKey(p)));
        return parts.length ? [draft({ parts, text: parts.map((p) => p.text).join("") })] : [];
      });
      update(fresh);
      setStatus(
        fresh.length
          ? "請對照來源圖，核對各段原文與跨圖接句。"
          : groups.length
            ? "這批畫線已存入選段。"
            : "未辨識到色筆，可切換排版重試或使用整頁摘錄。",
      );
    } catch (e) {
      if (!c.signal.aborted) setError(e instanceof Error ? e.message : "辨識失敗，可重試。");
    } finally {
      if (!c.signal.aborted) setBusy(false);
    }
  }
  async function save() {
    setBusy(true);
    setError("");
    try {
      const selections = items
        .filter((i) => i.keep)
        .map((i) => ({
          color: i.parts[0].color,
          parts: i.parts.map(regionKey),
          text: i.text,
          label: i.label,
        }));
      const res = await fetch("/api/dojo/reading/clips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "highlights", batchId: batch.id, bookId: book, selections }),
      });
      const result = await res.json();
      if (!res.ok) throw Error(result.error || "儲存失敗，請重試。");
      if (ready.current) {
        update(items.filter((i) => !i.keep));
        onSaved(result.batch);
        setStatus("已將 " + selections.length + " 筆畫線分別存成閱讀選段。");
      }
    } catch (e) {
      if (ready.current) setError(e instanceof Error ? e.message : "儲存失敗。");
    } finally {
      if (ready.current) setBusy(false);
    }
  }
  function patch(i: number, p: Partial<Draft>) {
    update(items.map((v, j) => (i === j ? { ...v, ...p } : v)));
  }
  function separate(i: number, at: number) {
    const s = items[i],
      chunks = [s.parts.slice(0, at), s.parts.slice(at)];
    update([
      ...items.slice(0, i),
      ...chunks.map((parts) => draft({ parts, text: parts.map((p) => p.text).join("") })),
      ...items.slice(i + 1),
    ]);
  }
  function merge(i: number) {
    const a = items[i],
      b = items[i + 1];
    update([
      ...items.slice(0, i),
      { ...a, parts: [...a.parts, ...b.parts], text: a.text + b.text },
      ...items.slice(i + 2),
    ]);
  }
  const kept = items.filter((x) => x.keep);
  return (
    <section className="ritual-card clip-form">
      <h2>色筆選段</h2>
      <label>
        書名與讀次
        <select
          className="field"
          value={book}
          disabled={busy}
          onChange={(e) => {
            setBook(e.target.value);
            persist(items, e.target.value);
          }}
        >
          <option value="">選擇這一讀</option>
          {books.map((b) => (
            <option key={b.id} value={b.id}>
              {b.title} · 第 {b.readCount} 讀
            </option>
          ))}
        </select>
      </label>
      {!items.length && (
        <>
          <label>
            書頁排版
            <select
              className="field"
              value={layout}
              disabled={busy}
              onChange={(e) => setLayout(e.target.value as ClipLayout)}
            >
              <option value="vertical">中文直排</option>
              <option value="horizontal">橫排</option>
            </select>
          </label>
          <button disabled={busy} onClick={() => void scan()}>
            辨識這批色筆畫線
          </button>
        </>
      )}
      {status && <p role="status">{status}</p>}
      {error && <p role="alert">{error}</p>}
      {items.map((s, i) => {
        const pages = [...new Set(s.parts.map((p) => p.page))];
        return (
          <details key={regionKey(s.parts[0])} className="reading-highlight-note">
            <summary>
              <strong>
                {s.parts[0].color} · 選段 {i + 1}
              </strong>
              　圖 {pages.map((p) => p + 1).join("、")}
              {pages.length > 1 ? " · 跨圖待核對" : ""}
              <small>{s.text || "請對照原圖補上原文"}</small>
            </summary>
            <label>
              <input
                type="checkbox"
                checked={s.keep}
                disabled={busy}
                onChange={(e) => patch(i, { keep: e.target.checked })}
              />{" "}
              存入這段
            </label>
            <label>
              選段名稱（選填）
              <input
                className="field"
                value={s.label}
                maxLength={120}
                disabled={busy}
                onChange={(e) => patch(i, { label: e.target.value })}
              />
            </label>
            <label>
              核對原文
              <textarea
                className="field"
                rows={4}
                value={s.text}
                maxLength={40000}
                disabled={busy}
                onChange={(e) => patch(i, { text: e.target.value })}
              />
            </label>
            {pages.map((p) => (
              <a key={p} href={originalHref(batch.pages[p].id)} target="_blank" rel="noreferrer">
                對照圖 {p + 1} ↗　
              </a>
            ))}
            {s.parts.map((p, k) =>
              k > 0 && p.page !== s.parts[k - 1].page ? (
                <button
                  key={k}
                  disabled={busy || s.text !== s.parts.map((p) => p.text).join("")}
                  onClick={() => separate(i, k)}
                >
                  在圖 {p.page + 1} 前拆開
                </button>
              ) : null,
            )}
            {items[i + 1]?.parts[0].color === s.parts[0].color && (
              <button disabled={busy} onClick={() => merge(i)}>
                與下一段接起來
              </button>
            )}
          </details>
        );
      })}
      {items.length > 0 && (
        <button
          className="primary"
          disabled={busy || !book || !kept.length || kept.some((x) => !x.text.trim())}
          onClick={() => void save()}
        >
          核對並存入 {kept.length} 筆選段
        </button>
      )}
      {Object.values(batch.highlightNotes ?? {}).map((r) => (
        <Link key={r.noteId} href={noteHref(r)}>
          已存 · {r.label}
        </Link>
      ))}
    </section>
  );
}
