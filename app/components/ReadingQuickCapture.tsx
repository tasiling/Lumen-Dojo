"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { parseReadmooShare } from "@/lib/reading/readmoo";
import type { ReadingBook, ReadingNote } from "@/lib/reading/types";

async function responseJson<T>(response: Response): Promise<T> {
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((json as { error?: string }).error ?? `操作失敗（${response.status}）`);
  return json as T;
}

type CaptureMode = "excerpt" | "thought";

export default function ReadingQuickCapture({
  fixedBook,
  onSaved,
  embedded = false,
}: {
  fixedBook?: Pick<ReadingBook, "id" | "title">;
  onSaved?: (note: ReadingNote) => void;
  embedded?: boolean;
}) {
  const [books, setBooks] = useState<ReadingBook[]>([]);
  const [bookId, setBookId] = useState(fixedBook?.id ?? "");
  const [mode, setMode] = useState<CaptureMode>("excerpt");
  const [rawText, setRawText] = useState("");
  const [chapter, setChapter] = useState("");
  const [location, setLocation] = useState("");
  const [reflection, setReflection] = useState("");
  const [thought, setThought] = useState("");
  const [loading, setLoading] = useState(!fixedBook);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<ReadingNote | null>(null);

  useEffect(() => {
    if (fixedBook) return;
    let cancelled = false;
    async function loadBooks() {
      setLoading(true);
      try {
        const response = await fetch("/api/dojo/reading/books", { cache: "no-store" });
        const json = await responseJson<{ books: ReadingBook[] }>(response);
        if (cancelled) return;
        const active = (json.books ?? []).filter((book) => book.status === "閱讀中");
        setBooks(active);
        setBookId((current) => current || active[0]?.id || "");
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : String(caught));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadBooks();
    return () => { cancelled = true; };
  }, [fixedBook]);

  const selectedBook = fixedBook ?? books.find((book) => book.id === bookId) ?? null;
  const parsed = useMemo(() => parseReadmooShare(rawText), [rawText]);
  const differentBook = Boolean(
    parsed.bookTitle && selectedBook && parsed.bookTitle.trim() !== selectedBook.title.trim()
  );

  function clear() {
    setRawText("");
    setChapter("");
    setLocation("");
    setReflection("");
    setThought("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!bookId) { setError("請先選擇正在閱讀的書"); return; }
    const text = mode === "excerpt" ? parsed.excerpt.trim() : thought.trim();
    if (!text) { setError(mode === "excerpt" ? "請先貼上摘錄文字" : "請先寫下想法"); return; }
    setSaving(true);
    setError(null);
    setSaved(null);
    try {
      const response = await fetch(`/api/dojo/reading/books/${bookId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mode === "excerpt" ? {
          kind: "excerpt",
          text,
          metadata: {
            source: parsed.isReadmoo ? "Readmoo" : "手動貼上",
            sourceBookTitle: parsed.bookTitle || selectedBook?.title || "",
            chapter,
            location,
            reflection,
          },
        } : {
          kind: "thought",
          text,
        }),
      });
      const json = await responseJson<{ note: ReadingNote }>(response);
      setSaved(json.note);
      clear();
      onSaved?.(json.note);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className={`reading-quick-capture ${embedded ? "is-embedded" : ""}`} onSubmit={submit}>
      <div className="reading-capture-heading">
        <div><span className="eyebrow">閱讀中快速記錄</span><h2>接住這一段</h2></div>
        {!fixedBook && <Link href="/reading">打開書架</Link>}
      </div>

      {!fixedBook && (
        <>
          <label htmlFor="reading-capture-book">存到哪一本書？</label>
          {loading ? <p className="muted-note">正在打開閱讀中的書…</p> : books.length ? (
            <select id="reading-capture-book" className="field" value={bookId} onChange={(event) => setBookId(event.target.value)}>
              {books.map((book) => <option key={book.id} value={book.id}>{book.title}{book.readCount > 1 ? `・第 ${book.readCount} 讀` : ""}</option>)}
            </select>
          ) : (
            <div className="reading-capture-empty"><p>目前沒有「閱讀中」的書。</p><Link href="/reading">先開始一本書 →</Link></div>
          )}
        </>
      )}

      {fixedBook && <div className="reading-capture-book-chip"><span>存入</span><b>{fixedBook.title}</b></div>}

      <div className="segmented reading-capture-modes" aria-label="記錄類型">
        <button type="button" className={mode === "excerpt" ? "on" : ""} onClick={() => { setMode("excerpt"); setSaved(null); }}>貼上摘錄</button>
        <button type="button" className={mode === "thought" ? "on" : ""} onClick={() => { setMode("thought"); setSaved(null); }}>只記想法</button>
      </div>

      {mode === "excerpt" ? (
        <>
          <label htmlFor="readmoo-share-text">Readmoo 分享／複製文字</label>
          <textarea
            id="readmoo-share-text"
            className="field reading-raw-paste"
            rows={7}
            value={rawText}
            onChange={(event) => setRawText(event.target.value)}
            placeholder={'貼上包含「——《書名》\nReadmoo讀墨電子書」的文字；系統會把署名和原文分開。'}
            maxLength={16000}
          />
          {rawText.trim() && (
            <div className="reading-parse-preview">
              <div><span>{parsed.isReadmoo ? "已辨識 Readmoo" : "一般文字摘錄"}</span>{parsed.bookTitle && <b>《{parsed.bookTitle}》</b>}</div>
              <p>{parsed.excerpt || "還沒有辨識到原文"}</p>
            </div>
          )}
          {differentBook && <p className="reading-source-warning">分享文字顯示《{parsed.bookTitle}》，目前選的是《{selectedBook?.title}》。請確認是否存對書。</p>}
          <div className="two reading-source-fields">
            <div><label htmlFor="reading-chapter">章節（選填）</label><input id="reading-chapter" className="field" value={chapter} onChange={(event) => setChapter(event.target.value)} placeholder="例如：引言" maxLength={300} /></div>
            <div><label htmlFor="reading-location">位置（選填）</label><input id="reading-location" className="field" value={location} onChange={(event) => setLocation(event.target.value)} placeholder="例如：#201" maxLength={100} /></div>
          </div>
          <label htmlFor="reading-reflection">我當時想到（選填）</label>
          <textarea id="reading-reflection" className="field" rows={3} value={reflection} onChange={(event) => setReflection(event.target.value)} placeholder="Readmoo 不會把個人註記一起輸出，想法在這裡另外留下。" maxLength={4000} />
          <details className="reading-screenshot-note"><summary>手上只有截圖？</summary><p>先用 iPhone 的「複製文字」取得反白段落，再貼到上方確認。圖片不會上傳或保存。</p></details>
        </>
      ) : (
        <>
          <label htmlFor="reading-thought">剛才想到什麼？</label>
          <textarea id="reading-thought" className="field" rows={7} value={thought} onChange={(event) => setThought(event.target.value)} placeholder="先留下零碎想法，不需要立刻整理成洞察。" maxLength={8000} />
        </>
      )}

      {saved && <div className="capture-success" role="status"><div><b>已存入閱讀紀錄</b><span>{mode === "excerpt" ? "原文與你的想法已分開保存。" : "這個想法已經接住了。"}</span></div>{!fixedBook && <Link href={`/reading/books/${bookId}`}>前往這本書 →</Link>}</div>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="primary reading-capture-submit" type="submit" disabled={saving || loading || !bookId || (mode === "excerpt" ? !parsed.excerpt.trim() : !thought.trim())}>
        {saving ? "正在存入…" : mode === "excerpt" ? "存入摘錄" : "記下想法"}
      </button>
      <p className="reading-capture-footnote">只保存你選取的文字與自己寫下的內容，不會匯入整本電子書。</p>
    </form>
  );
}
