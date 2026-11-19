"use client";

import { useState } from "react";
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

export type FormMode = "start" | "wait" | "reread";

export default function BookFormSheet({
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
  const [subtitle, setSubtitle] = useState(book?.subtitle ?? "");
  const [category, setCategory] = useState(book?.category ?? "");
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
            : { mode, title, subject: subject || null, reason: reason || null, question, author, subtitle, category }),
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
            <label htmlFor="shelf-author">作者</label>
            <input className="field" id="shelf-author" value={author} onChange={(event) => setAuthor(event.target.value)} placeholder="可稍後再補" />
            <label htmlFor="shelf-subtitle">副標題</label>
            <input id="shelf-subtitle" className="field" value={subtitle} onChange={event => setSubtitle(event.target.value)} />
            <label htmlFor="shelf-category">電子書分類</label>
            <input id="shelf-category" className="field" value={category} onChange={event => setCategory(event.target.value)} />
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
