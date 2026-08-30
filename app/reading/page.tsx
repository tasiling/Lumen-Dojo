"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BOOK_REASONS,
  READING_SUBJECTS,
  type BookReason,
  type ReadingBook,
  type ReadingSubject,
} from "@/lib/reading/types";

async function readJson<T>(response: Response): Promise<T> {
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((json as { error?: string }).error ?? `操作失敗（${response.status}）`);
  return json as T;
}

type FormMode = "start" | "wait" | "reread";

export default function ReadingShelfPage() {
  const router = useRouter();
  const [books, setBooks] = useState<ReadingBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<{ mode: FormMode; book?: ReadingBook } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/dojo/reading/books", { cache: "no-store" });
      const json = await readJson<{ books: ReadingBook[] }>(response);
      setBooks(json.books ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const groups = useMemo(() => ({
    reading: books.filter((book) => book.status === "閱讀中"),
    waiting: books.filter((book) => book.status === "待讀"),
    completed: books.filter((book) => book.status === "已萃取" || book.status === "已製作成內容"),
    abandoned: books.filter((book) => book.status === "放棄"),
  }), [books]);

  return (
    <section className="screen reading-screen">
      <div className="reading-hero">
        <span className="eyebrow">修習所・心知</span>
        <h1>閱讀萃取</h1>
        <p>帶著問題閱讀，先自由留下筆記，再把能行動的洞察立成卡片。</p>
        <div className="reading-hero-actions">
          <button className="primary" onClick={() => setForm({ mode: "start" })}>開始一本書</button>
          <button onClick={() => setForm({ mode: "wait" })}>先放入待讀</button>
        </div>
        <div className="reading-shortcuts">
          <button onClick={() => router.push("/reading/visits")}>今日回訪</button>
          <button onClick={() => router.push("/reading/cards")}>洞察卡片庫</button>
        </div>
      </div>

      {loading && <div className="empty">正在打開書架…</div>}
      {error && <p className="form-error" role="alert">{error}<button className="text-link" onClick={() => void load()}>重新讀取</button></p>}

      {!loading && (
        <>
          <ShelfSection
            title="閱讀中"
            hint="回到你正在追問的問題"
            books={groups.reading}
            empty="目前沒有正在閱讀的書。"
            actionLabel="繼續閱讀"
            onAction={(book) => router.push(`/reading/books/${book.id}`)}
          />
          <ShelfSection
            title="待讀"
            hint="只有真正開始時才需要寫閱讀問題"
            books={groups.waiting}
            empty="待讀書架還是空的。"
            actionLabel="開始這本書"
            onAction={(book) => setForm({ mode: "start", book })}
          />
          <ShelfSection
            title="已完成"
            hint="已萃取與已製作成內容"
            books={groups.completed}
            empty="完成第一輪萃取後，會收在這裡。"
            actionLabel="再讀一次"
            onAction={(book) => setForm({ mode: "reread", book })}
            secondaryLabel="查看筆記"
            onSecondary={(book) => router.push(`/reading/books/${book.id}`)}
          />
          {groups.abandoned.length > 0 && (
            <details className="reading-shelf-section reading-abandoned">
              <summary>已放棄的閱讀 <span>{groups.abandoned.length}</span></summary>
              <div className="reading-book-list">
                {groups.abandoned.map((book) => <BookCard key={book.id} book={book} secondaryLabel="查看筆記" onSecondary={(item) => router.push(`/reading/books/${item.id}`)} />)}
              </div>
            </details>
          )}
        </>
      )}

      {form && (
        <BookFormSheet
          mode={form.mode}
          book={form.book}
          onClose={() => setForm(null)}
          onCreated={(book) => {
            setForm(null);
            if (book.status === "待讀") void load();
            else router.push(`/reading/books/${book.id}`);
          }}
        />
      )}
    </section>
  );
}

function ShelfSection({
  title,
  hint,
  books,
  empty,
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondary,
}: {
  title: string;
  hint: string;
  books: ReadingBook[];
  empty: string;
  actionLabel: string;
  onAction: (book: ReadingBook) => void;
  secondaryLabel?: string;
  onSecondary?: (book: ReadingBook) => void;
}) {
  return (
    <section className="reading-shelf-section">
      <div className="reading-section-heading">
        <div><h2>{title}</h2><p>{hint}</p></div><span>{books.length}</span>
      </div>
      {books.length === 0 ? <div className="reading-soft-empty">{empty}</div> : (
        <div className="reading-book-list">
          {books.map((book) => <BookCard key={book.id} book={book} actionLabel={actionLabel} onAction={onAction} secondaryLabel={secondaryLabel} onSecondary={onSecondary} />)}
        </div>
      )}
    </section>
  );
}

function BookCard({ book, actionLabel, onAction, secondaryLabel, onSecondary }: { book: ReadingBook; actionLabel?: string; onAction?: (book: ReadingBook) => void; secondaryLabel?: string; onSecondary?: (book: ReadingBook) => void }) {
  return (
    <article className="reading-book-card">
      <div className="reading-book-meta">
        {book.subject && <span>{book.subject}</span>}
        {book.readCount > 1 && <span>第 {book.readCount} 讀</span>}
        <span>{book.status}</span>
      </div>
      <h3>{book.title}</h3>
      {book.author && <p className="reading-author">{book.author}</p>}
      <p className="reading-question">{book.question || "開始時，再寫下這輪想找的問題。"}</p>
      <div className="reading-book-foot">
        <span>已立 {book.insightCardIds.length} 張洞察卡・建議 3–5 張</span>
        <div>
          {secondaryLabel && onSecondary && <button onClick={() => onSecondary(book)}>{secondaryLabel}</button>}
          {actionLabel && onAction && <button onClick={() => onAction(book)}>{actionLabel}</button>}
        </div>
      </div>
    </article>
  );
}

function BookFormSheet({
  mode,
  book,
  onClose,
  onCreated,
}: {
  mode: FormMode;
  book?: ReadingBook;
  onClose: () => void;
  onCreated: (book: ReadingBook) => void;
}) {
  const [title, setTitle] = useState(book?.title ?? "");
  const [subject, setSubject] = useState<ReadingSubject | "">(book?.subject ?? "");
  const [reason, setReason] = useState<BookReason | "">(mode === "reread" ? "" : (book?.reason ?? ""));
  const [question, setQuestion] = useState("");
  const [author, setAuthor] = useState(book?.author ?? "");
  const [showOptional, setShowOptional] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reread = mode === "reread";
  const activateWaiting = mode === "start" && book?.status === "待讀";
  const needsQuestion = mode !== "wait";

  async function submit() {
    if (!title.trim()) { setError("請先填寫書名"); return; }
    if (needsQuestion && !question.trim()) { setError("讀前先問：我想從這本書找到什麼"); return; }
    setSaving(true);
    setError(null);
    try {
      let response: Response;
      if (activateWaiting && book) {
        response = await fetch(`/api/dojo/reading/books/${book.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "閱讀中", question, subject: subject || null, reason: reason || null }),
        });
      } else {
        response = await fetch("/api/dojo/reading/books", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(reread
            ? { mode: "reread", sourceBookId: book?.id, question, reason: reason || null }
            : { mode, title, subject: subject || null, reason: reason || null, question, author }),
        });
      }
      const json = await readJson<{ book: ReadingBook }>(response);
      onCreated(json.book);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal show" onClick={(event) => event.target === event.currentTarget && !saving && onClose()}>
      <div className="sheet reading-form-sheet" role="dialog" aria-modal="true" aria-labelledby="book-form-title">
        <div className="toolbar">
          <div><span className="eyebrow">{mode === "wait" ? "待讀書架" : reread ? "重新閱讀" : "開始閱讀"}</span><h2 id="book-form-title">{reread ? book?.title : mode === "wait" ? "先留下書名" : "帶著一個問題開始"}</h2></div>
          <button onClick={onClose} disabled={saving}>關閉</button>
        </div>

        {!reread && !activateWaiting && (
          <>
            <label>書名 *</label>
            <input className="field" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="這次想讀什麼？" autoFocus />
            {mode === "start" && <div className="two reading-two-selects">
              <div><label>學科</label><select className="field" value={subject} onChange={(event) => setSubject(event.target.value as ReadingSubject | "")}><option value="">暫不分類</option>{READING_SUBJECTS.map((item) => <option key={item}>{item}</option>)}</select></div>
              <div><label>選書理由</label><select className="field" value={reason} onChange={(event) => setReason(event.target.value as BookReason | "")}><option value="">暫不選擇</option>{BOOK_REASONS.map((item) => <option key={item}>{item}</option>)}</select></div>
            </div>}
          </>
        )}

        {activateWaiting && (
          <div className="reading-selected-book">
            <span>準備開始</span>
            <strong>{title}</strong>
          </div>
        )}

        {activateWaiting && (
          <div className="two reading-two-selects">
            <div><label>學科</label><select className="field" value={subject} onChange={(event) => setSubject(event.target.value as ReadingSubject | "")}><option value="">暫不分類</option>{READING_SUBJECTS.map((item) => <option key={item}>{item}</option>)}</select></div>
            <div><label>選書理由</label><select className="field" value={reason} onChange={(event) => setReason(event.target.value as BookReason | "")}><option value="">暫不選擇</option>{BOOK_REASONS.map((item) => <option key={item}>{item}</option>)}</select></div>
          </div>
        )}

        {reread && (
          <div>
            <label>這次重讀的理由</label>
            <select className="field" value={reason} onChange={(event) => setReason(event.target.value as BookReason | "")}><option value="">暫不選擇</option>{BOOK_REASONS.map((item) => <option key={item}>{item}</option>)}</select>
          </div>
        )}

        {needsQuestion && (
          <>
            <label>帶著什麼問題讀 *</label>
            <textarea className="field reading-question-input" rows={3} value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="我想從這本書找到什麼？" autoFocus={reread || activateWaiting} />
            <p className="reading-field-help">問題會固定在閱讀頁上方，陪你判斷哪些內容真正值得留下。</p>
          </>
        )}

        {!reread && !activateWaiting && (
          <details open={showOptional} onToggle={(event) => setShowOptional(event.currentTarget.open)} className="reading-optional-fields">
            <summary>選填資料</summary>
            <label>作者</label>
            <input className="field" value={author} onChange={(event) => setAuthor(event.target.value)} placeholder="可稍後再補" />
            {mode === "wait" && <><label>學科</label><select className="field" value={subject} onChange={(event) => setSubject(event.target.value as ReadingSubject | "")}><option value="">暫不分類</option>{READING_SUBJECTS.map((item) => <option key={item}>{item}</option>)}</select></>}
          </details>
        )}

        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="primary reading-submit" disabled={saving || !title.trim() || (needsQuestion && !question.trim())} onClick={() => void submit()}>
          {saving ? "正在放進書架…" : mode === "wait" ? "放入待讀" : reread ? "開始新一讀" : "開始閱讀"}
        </button>
      </div>
    </div>
  );
}
