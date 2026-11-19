"use client";
import { BookReadingOutcomes } from "../../ReadingOutcomes";
import { ReadingIcon } from "@/app/components/ReadingArt";

import Link from "next/link";
import { coverFor, markOpened, shelfAuthor, shelfTitle } from "../../readerShelf";
import "./workspace.css";
import BookFormSheet, { type FormMode } from "@/app/components/BookFormSheet";
import { shelfContext } from "@/lib/reading/shelf";
import {ManualCardEntry} from "@/app/components/ReadingManualCards";
import {originalHref} from "@/lib/reading/clips";
import {readingNoteContent, readingSelectionLabel} from "@/lib/reading/content";
import RelationsPanel from "@/app/components/readingKnowledge/RelationsPanel";
import {LocatedContent} from "@/app/components/readingKnowledge/LocatedContent";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import ReadingQuickCapture from "@/app/components/ReadingQuickCapture";
import ClaimCandidateComposer from "@/app/components/ClaimCandidateComposer";
import ReadingDiscussionWorkspace from "@/app/components/ReadingDiscussion";
import type { InsightCard, ReadingBook, ReadingNote, ReadingNoteKind, ReadingNoteMetadata } from "@/lib/reading/types";

async function readJson<T>(response: Response): Promise<T> {
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((json as { error?: string }).error ?? `操作失敗（${response.status}）`);
  return json as T;
}

type EditorNote = ReadingNote & { clientKey: string };
type ReadingStage = "before" | "during" | "discussion" | "after";

// A completed trial discussion has a linked child page and a short pointer paragraph.
function archivedExcerpt(note: ReadingNote): string | undefined {
  if (note.kind !== "free") return;
  const [heading, selection, counts, repeat] = note.text.trim().split(/\r?\n/);
  if (!heading.endsWith("｜已完成的閱讀討論") || repeat !== heading ||
      !/^\d+ 則發言，\d+ 則候選觀點、\d+ 張候選洞察卡。$/.test(counts || "")) return;
  return /^選段「(.+)」$/.exec(selection || "")?.[1];
}

function newNote(): EditorNote {
  return {
    id: "",
    clientKey: crypto.randomUUID(),
    text: "",
    editable: true,
    kind: "free",
    metadata: {},
    createdAt: "",
  };
}

async function saveStructuredNote(params: {
  bookId: string;
  noteId?: string;
  kind: Exclude<ReadingNoteKind, "free">;
  text: string;
  metadata: ReadingNoteMetadata;
}): Promise<ReadingNote> {
  const response = await fetch(`/api/dojo/reading/books/${params.bookId}/notes`, {
    method: params.noteId ? "PATCH" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ noteId: params.noteId, kind: params.kind, text: params.text, metadata: params.metadata }),
  });
  return (await readJson<{ note: ReadingNote }>(response)).note;
}

export default function ReadingBookPage() {
  return <Suspense fallback={<p className="screen">正在打開閱讀頁…</p>}><BookWorkspace /></Suspense>;
}

function BookWorkspace() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const bookId = params.id;
  const search = useSearchParams().toString();
  const [book, setBook] = useState<ReadingBook | null>(null);
  const [notes, setNotes] = useState<EditorNote[]>([]);
  const [cards, setCards] = useState<InsightCard[]>([]);
  const [stage, setStage] = useState<ReadingStage>("before");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [bookForm, setBookForm] = useState<FormMode | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [discussionTarget, setDiscussionTarget] = useState({ note: "", discussion: "", round: "" });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/dojo/reading/books/${bookId}`, { cache: "no-store" });
      const json = await readJson<{ book: ReadingBook; notes: ReadingNote[]; cards: InsightCard[] }>(response);
      setBook(json.book);
      const loaded = (json.notes ?? []).map((note) => ({ ...note, clientKey: note.id }));
      const editableNotes = loaded.filter(note => !archivedExcerpt(note));
      setNotes(editableNotes);
      setCards(json.cards ?? []);
      const hasReadingRecord = loaded.some((note) => note.kind !== "review");
      const query = new URLSearchParams(search);
      const wanted = query.get("note");
      const target = loaded.find(n => n.id === wanted);
      const archivedQuote = target && archivedExcerpt(target);
      const selected = archivedQuote ? editableNotes.find(n => n.text === archivedQuote) : target;
      if (!query.has("discussion") && archivedQuote) {
        if (selected) query.set("note", selected.id); else query.delete("note");
        router.replace("/reading/reader/" + encodeURIComponent(bookId) + "?" + query);
        return;
      }
      const openDiscussion = query.has("discussion");
      const recapComplete = loaded.filter(note => note.kind === "review").at(-1)?.metadata.reviewCompleted;
      setDiscussionTarget({ note: selected?.id ?? "", discussion: query.get("discussion") ?? "", round: query.get("round") ?? "" });
      setStage(openDiscussion ? "discussion" : selected ? selected.kind === "preview" ? "before" : selected.kind === "review" ? "after" : "during"
        : json.book.status === "閱讀中" && !recapComplete ? (hasReadingRecord ? "during" : "before") : "after");
      if (wanted && !selected && !openDiscussion) setNotice("指定的筆記已不可用；其餘閱讀紀錄仍保留。");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoading(false);
    }
  }, [bookId, router, search]);

  useEffect(() => {
    const query = new URLSearchParams(search);
    if (!["manage", "note", "discussion", "round"].some(key => query.has(key))) {
      router.replace("/reading/reader/" + encodeURIComponent(bookId) + window.location.search);
      return;
    }
    markOpened(bookId);
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [bookId, load, router, search]);

  function updateNote(clientKey: string, patch: Partial<EditorNote>) {
    setNotes((current) => current.map((note) => note.clientKey === clientKey ? { ...note, ...patch } : note));
  }

  function discuss(noteId: string) {
    setDiscussionTarget({ note: noteId, discussion: "", round: "" });
    setStage("discussion");
    requestAnimationFrame(() => document.getElementById("reading-discussion")?.scrollIntoView({ block: "start" }));
  }

  async function registerInsight(cardId: string) {
    try {
      const response = await fetch("/api/dojo/reading/cards/" + encodeURIComponent(cardId), { cache: "no-store" });
      const { card } = await readJson<{ card: InsightCard }>(response);
      if (card) setCards(current => current.some(item => item.id === card.id) ? current : [...current, card]);
    } catch {
      setNotice("洞察卡已保存，可從洞察卡片庫查看。");
    }
  }

  function addOrReplaceNote(note: ReadingNote) {
    setNotes((current) => {
      const index = current.findIndex((item) => item.id === note.id);
      if (index < 0) return [...current, { ...note, clientKey: note.id }];
      return current.map((item) => item.id === note.id ? { ...item, ...note } : item);
    });
  }

  async function removeNote(note: EditorNote) {
    if (note.id && !window.confirm("刪除這則閱讀紀錄？已建立的洞察卡仍會保留來源快照。")) return;
    setError(null);
    try {
      if (note.id) {
        const response = await fetch(`/api/dojo/reading/books/${bookId}/notes?noteId=${encodeURIComponent(note.id)}`, { method: "DELETE" });
        await readJson<{ ok: true }>(response);
      }
      setNotes((current) => current.filter((item) => item.clientKey !== note.clientKey));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  async function markFinished(finished: boolean) {
    setUpdatingStatus(true);
    setError(null);
    try {
      const response = await fetch("/api/dojo/reading/books/" + encodeURIComponent(bookId), {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ finished }),
      });
      const json = await readJson<{ book: ReadingBook }>(response);
      setBook(json.book);
      setNotice(finished ? "已標記讀完。" : "已取消讀完標記。");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally { setUpdatingStatus(false); }
  }

  async function abandonReading() {
    if (!window.confirm("確定放下這輪閱讀嗎？既有摘錄、想法與復盤都會保留。")) return;
    setUpdatingStatus(true);
    setError(null);
    try {
      const response = await fetch(`/api/dojo/reading/books/${bookId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "放棄" }),
      });
      const json = await readJson<{ book: ReadingBook }>(response);
      setBook(json.book);
      setNotice("這輪閱讀已放下，所有內容仍完整保留。");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setUpdatingStatus(false);
    }
  }

  const grouped = useMemo(() => ({
    preview: notes.filter((note) => note.kind === "preview"),
    reading: notes.filter((note) => note.kind === "excerpt" || note.kind === "thought"),
    free: notes.filter((note) => note.kind === "free"),
    review: notes.filter((note) => note.kind === "review"),
  }), [notes]);

  if (loading) return <section className="screen reading-screen"><div className="empty">正在打開閱讀頁…</div></section>;
  if (!book) return <section className="screen reading-screen"><p className="form-error">{error ?? "找不到這輪閱讀"}</p></section>;

  const latestPreview = grouped.preview.at(-1) ?? null;
  const latestReview = grouped.review.at(-1) ?? null;

  return (
    <section className="screen reading-screen reading-session-screen">
      <header className="rw-header">
        <div className="rw-topline"><small>修習所・心知</small><Link href={"/reading/reader/" + encodeURIComponent(book.id)}>看閱讀筆記</Link></div>
        <div className="rw-book">
          {coverFor(book) && <img alt="" src={coverFor(book)} />}
          <div><h1>{shelfTitle(book)}</h1><p>{[shelfAuthor(book), "第 " + (book.readCount || 1) + " 次閱讀"].filter(Boolean).join(" · ")}</p></div>
        </div>
      </header>
      <details className="rw-settings" open={book.status === "待讀" || undefined}>
        <summary>書籍設定與來源</summary>
        <p>{[book.subject, book.finished ? "已讀完" : book.status].filter(Boolean).join(" · ")}</p>
        <Link href={`/weaving?book=${encodeURIComponent(bookId)}`}>將已保存筆記選摘到織光堂</Link>
      <details className="reading-state-actions" open={book.status === "待讀" || undefined}>
        <summary>閱讀狀態</summary>
        {book.status === "待讀" ? <button onClick={() => setBookForm("start")}>開始這本書</button> :
          <button disabled={updatingStatus} onClick={() => void markFinished(!book.finished)}>
            {book.finished ? "取消已讀完標記" : "標記為已讀完"}
          </button>}
        {(book.finished || book.status === "已萃取" || book.status === "已製作成內容") &&
          <button onClick={() => setBookForm("reread")}>再讀一次</button>}
      </details>
      {bookForm && <BookFormSheet mode={bookForm} book={book} onClose={() => setBookForm(null)} onCreated={nextBook => {
        setBookForm(null);
        if (nextBook.id === book.id) { setBook(nextBook); setStage("before"); return; }
        const params = new URLSearchParams(window.location.search);
        const context = shelfContext(params);
        if (params.get("from") === "shelf") context.set("from", "shelf");
        context.set("manage", "1");
        const query = context.toString();
        router.push("/reading/books/" + encodeURIComponent(nextBook.id) + (query ? "?" + query : ""));
      }} />}
      <Link className="reading-capture-entry" href={"/reading/clips?book="+encodeURIComponent(book.id)}>從行光剪藏加入這一讀的書頁 →</Link>
      <RelationsPanel target={{kind:'book',recordId:book.id}} />
      </details>
      {notes.filter(n=>n.id===new URLSearchParams(typeof window==='undefined'?'':location.search).get('note')&&(n.kind==='preview'||n.kind==='review')).map(n=><LocatedContent key={n.id} parameter="note" id={n.id}><section className="ritual-card"><h2>指定的閱讀紀錄</h2><p style={{whiteSpace:'pre-wrap'}}>{readingNoteContent(n)}</p><RelationsPanel target={{kind:'reading_note',recordId:n.id,parentBookId:book.id}} /></section></LocatedContent>)}
      <details className="rw-question">
        <summary>這輪的閱讀問題</summary>
        <p>{book.question}</p>
        <ReadingQuestionEditor key={book.id} book={book} onSaved={setBook} />
      </details>

      <nav className="reading-stage-tabs" aria-label="閱讀筆記階段">
        <button className={stage === "before" ? "on" : ""} onClick={() => setStage("before")}>讀前預習</button>
        <button className={stage === "during" ? "on" : ""} onClick={() => setStage("during")}>摘錄與想法</button>
        <button className={stage === "discussion" ? "on" : ""} aria-current={stage === "discussion" ? "page" : undefined} onClick={() => setStage("discussion")}>GPT 討論</button>
        <button className={stage === "after" ? "on" : ""} onClick={() => setStage("after")}>讀後復盤</button>
      </nav>

      {error && <p className="form-error" role="alert">{error}</p>}
      {notice && <p className="save-notice" role="status">{notice}</p>}

      {stage === "before" && (
        <ReadingPreviewPanel
          book={book}
          note={latestPreview}
          onSaved={(note) => { addOrReplaceNote(note); setNotice("讀前預習已保存。"); }}
          onContinue={() => setStage("during")}
        />
      )}

      {stage === "during" && (
        <>
          <details className="rw-capture" open={!grouped.reading.length || undefined}><summary>新增摘錄或想法</summary>
          <ReadingQuickCapture fixedBook={book} embedded onSaved={(note) => { addOrReplaceNote(note); setNotice(note.kind === "excerpt" ? "摘錄已存入這本書。" : "想法已存入這本書。"); }} />

          </details>
          <section className="reading-notes-section">
            <div className="reading-section-heading">
              <h2>本輪選段</h2>
              <small>{grouped.reading.length} 則</small>
            </div>
            {grouped.reading.length === 0 ? <div className="reading-soft-empty">還沒有摘錄或零碎想法。從上方貼入第一段 Readmoo 文字即可。</div> : (
              <div className="reading-source-note-list">
                {grouped.reading.map((note) => (
                  <LocatedContent key={note.clientKey} parameter="note" id={note.id}><ReadingSourceNoteCard
                    key={note.clientKey}
                    initialOpen={discussionTarget.note === note.id}
                    book={book}
                    note={note}
                    onDelete={() => void removeNote(note)}
                    onInsightCreated={id=>void registerInsight(id)}
                    onDiscuss={() => discuss(note.id)}
                  /></LocatedContent>
                ))}
              </div>
            )}
          </section>

          <BookReadingOutcomes bookId={book.id} />
          <section className="reading-notes-section reading-free-notes">
            <div className="reading-section-heading"><div><h2>自由筆記</h2><p>這裡保持完全自由，不要求套用格式。</p></div></div>
            <div className="reading-note-list">
              {grouped.free.map((note) => (
                <LocatedContent key={note.clientKey} parameter="note" id={note.id}><ReadingNoteEditor
                  key={note.clientKey}
                  bookId={bookId}
                  note={note}
                  onText={(text) => updateNote(note.clientKey, { text })}
                  onSaved={(id) => updateNote(note.clientKey, { id })}
                  onDelete={() => setNotes((current) => current.filter((item) => item.clientKey !== note.clientKey))}
                  onInsightCreated={id=>void registerInsight(id)}
                  onDiscuss={() => discuss(note.id)}
                /></LocatedContent>
              ))}
            </div>
            <button className="reading-add-note" onClick={() => setNotes((current) => [...current, newNote()])}><ReadingIcon kind="plus" /> 新增自由筆記</button>
          </section>

          <button className="primary reading-go-review" onClick={() => setStage("after")}>前往讀後復盤</button>
        </>
      )}

      {stage === "discussion" && <div id="reading-discussion">
        <ReadingDiscussionWorkspace
          key={book.id + ":" + discussionTarget.note + ":" + discussionTarget.discussion}
          bookId={book.id} notes={notes}
          initialNoteId={discussionTarget.note}
          initialDiscussionId={discussionTarget.discussion}
          initialRoundId={discussionTarget.round}
          onInsightCreated={cardId => void registerInsight(cardId)}
        />
      </div>}

      {stage === "after" && (
        <>
          <BookReadingOutcomes bookId={book.id} />
          <ReadingReviewPanel
            book={book}
            note={latestReview}
            excerptCount={grouped.reading.filter((note) => note.kind === "excerpt").length}
            thoughtCount={grouped.reading.filter((note) => note.kind === "thought").length}
            onSaved={note => {
              addOrReplaceNote(note);
              setNotice(note.metadata.reviewCompleted ? "這輪讀後復盤已完成。" : "讀後復盤已保存，可繼續補充。");
            }}
          />

          <section className="reading-cards-section">
            <div className="reading-section-heading">
              <div><h2>已保留的洞察卡</h2><p>回看這一讀親自確認的洞察與行動。</p></div>
              <button onClick={() => router.push("/reading/cards")}>卡片庫</button>
            </div>
            {cards.length > 5 && <p className="reading-gentle-warning">已超過五張。可以回看哪些只是摘錄，哪些真的值得持續追蹤。</p>}
            {cards.length === 0 ? <div className="reading-soft-empty">這一讀還沒有保留的洞察卡。</div> : (
              <div className="reading-insight-list">
                {cards.map((card) => (
                  <article key={card.id} className="reading-insight-card">
                    <div><span>{card.actionType}</span><span>{card.status}</span></div>
                    <h3>{card.insight}</h3>
                    <p><b>接下來：</b>{card.action}</p>
                    {card.nextVisitAt && <small>{card.nextVisitAt} 回訪</small>}
                  </article>
                ))}
              </div>
            )}
            {grouped.reading.length > 0 && (
              <details className="reading-review-sources">
                <summary>從摘錄與想法中選擇來源</summary>
                <div className="reading-review-source-list">
                  {grouped.reading.map((note) => <button key={note.id} onClick={() => {
                    setStage("during");requestAnimationFrame(()=>{const fold=document.getElementById("manual-"+note.id) as HTMLDetailsElement|null;if(!fold)return;
                      const passage = fold.closest(".rw-passage");if (passage instanceof HTMLDetailsElement) passage.open = true;
                      fold.open=true;const inner=fold.querySelector("details");if(inner)inner.open=true;fold.scrollIntoView({block:"center"});});
                  }}><span>{note.kind === "excerpt" ? "摘錄" : "想法"}</span><b>{note.text.slice(0, 90)}</b></button>)}
                </div>
              </details>
            )}
          </section>
        </>
      )}

      {book.status === "閱讀中" && (
        <details className="reading-state-actions">
          <summary>這輪先不讀了</summary>
          <p>放下後仍會保留讀前、摘錄、想法、自由筆記與洞察。</p>
          <button className="danger" disabled={updatingStatus} onClick={() => void abandonReading()}>放棄這輪閱讀</button>
        </details>
      )}


    </section>
  );
}

function ReadingQuestionEditor({ book, onSaved }: { book: ReadingBook; onSaved: (book: ReadingBook) => void }) {
  const [question, setQuestion] = useState(book.question);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  async function save() {
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/dojo/reading/books/" + encodeURIComponent(book.id), {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: question.trim() }),
      });
      const value = await readJson<{ book: ReadingBook }>(response);
      onSaved(value.book);
      setMessage("讀前問題已保存。");
    } catch (error) { setMessage(error instanceof Error ? error.message : "讀前問題尚未保存。"); }
    finally { setSaving(false); }
  }
  return <details className="reading-discussion-fold">
    <summary>編輯讀前問題</summary>
    <label>這輪想弄懂什麼？
      <textarea className="field" rows={2} value={question} maxLength={2000} onChange={event => setQuestion(event.target.value)} />
    </label>
    <button type="button" disabled={saving || !question.trim()} onClick={() => void save()}>保存讀前問題</button>
    {message && <p role="status">{message}</p>}
  </details>;
}

function ReadingPreviewPanel({ book, note, onSaved, onContinue }: { book: ReadingBook; note: EditorNote | null; onSaved: (note: ReadingNote) => void; onContinue: () => void }) {
  const [understanding, setUnderstanding] = useState(note?.metadata.currentUnderstanding ?? "");
  const [focus, setFocus] = useState(note?.metadata.verificationFocus ?? "");
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const prompt = [
    `我準備閱讀《${book.title}》${book.author ? `，作者是${book.author}` : ""}。`,
    `這輪閱讀問題：${book.question}`,
    understanding.trim() ? `我目前的理解：${understanding.trim()}` : "",
    focus.trim() ? `我特別想確認：${focus.trim()}` : "",
    "請協助我做一份十分鐘內可以讀完的小預習：先說明必要背景，再提出 2–3 個閱讀時值得追問的問題，最後列出需要留意或查證的概念。不要替我總結整本書，也不要預先替我建立洞察。",
  ].filter(Boolean).join("\n\n");

  async function save() {
    if (!understanding.trim() && !focus.trim()) { setError("至少留下一項目前理解或想確認的內容"); return; }
    setSaving(true); setError(null);
    try {
      const saved = await saveStructuredNote({ bookId: book.id, noteId: note?.id, kind: "preview", text: understanding, metadata: { currentUnderstanding: understanding, verificationFocus: focus } });
      onSaved({ ...saved, createdAt: saved.createdAt || note?.createdAt || "" });
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
    finally { setSaving(false); }
  }

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("無法複製，請確認瀏覽器已允許剪貼簿權限");
    }
  }

  return <section className="reading-stage-panel reading-preview-panel">
    <div className="reading-stage-intro"><span>01</span><div><h2>先做一點小預習</h2><p>留下你現在站在哪裡；讀完後才看得見理解發生了什麼變化。</p></div></div>
    <label htmlFor="reading-current-understanding">我目前怎麼理解這個主題？</label>
    <textarea id="reading-current-understanding" className="field" rows={4} value={understanding} onChange={(event) => setUnderstanding(event.target.value)} placeholder="可以很零碎，也可以留白後直接請我協助預習。" />
    <label htmlFor="reading-verification-focus">最想確認或挑戰什麼？</label>
    <textarea id="reading-verification-focus" className="field" rows={3} value={focus} onChange={(event) => setFocus(event.target.value)} placeholder="例如：作者把交感神經與潛意識連在一起，依據是什麼？" />
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="reading-preview-actions">
      <button type="button" onClick={() => void copyPrompt()}>{copied ? "已複製，可貼給我" : "複製預習問題給我"}</button>
      <button type="button" disabled={saving || (!understanding.trim() && !focus.trim())} onClick={() => void save()}>{saving ? "儲存中…" : note ? "更新讀前筆記" : "保存讀前筆記"}</button>
      <button type="button" className="primary" onClick={onContinue}>進入閱讀中</button>
    </div>
    <p className="reading-stage-footnote">預習只處理背景與提問，不會匯入或拆解整本書。</p>
  </section>;
}

function ReadingReviewPanel({ book, note, excerptCount, thoughtCount, onSaved }: { book: ReadingBook; note: EditorNote | null; excerptCount: number; thoughtCount: number; onSaved: (note: ReadingNote) => void }) {
  const [changed, setChanged] = useState(note?.metadata.changedUnderstanding ?? "");
  const [question, setQuestion] = useState(note?.metadata.openQuestion ?? "");
  const [nextStep, setNextStep] = useState(note?.metadata.nextStep ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const completed = note?.metadata.reviewCompleted ?? Boolean(note && ["已萃取", "已製作成內容"].includes(book.status));

  async function save(finish: boolean) {
    if (!changed.trim() && !question.trim() && !nextStep.trim()) { setError("至少先留下一項讀後發現"); return; }
    setSaving(true); setError(null);
    try {
      const saved = await saveStructuredNote({ bookId: book.id, noteId: note?.id, kind: "review", text: changed,
        metadata: { changedUnderstanding: changed, openQuestion: question, nextStep, reviewCompleted: finish } });
      onSaved({ ...saved, createdAt: saved.createdAt || note?.createdAt || "" });
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
    finally { setSaving(false); }
  }

  return <section className="reading-stage-panel reading-review-panel">
    <div className="reading-stage-intro"><span>03</span><div><h2>收束這輪閱讀</h2><p>目前有 {excerptCount} 則摘錄、{thoughtCount} 則零碎想法。回到最初問題，整理真正留下來的東西。</p></div></div>
    <div className="reading-review-question"><small>最初的閱讀問題</small><p>{book.question}</p></div>
    <label htmlFor="reading-review-change">這本書改變或補充了我哪個理解？</label>
    <textarea id="reading-review-change" className="field" rows={5} value={changed} onChange={(event) => setChanged(event.target.value)} placeholder="用自己的話說明，不需要重述全書。" />
    <label htmlFor="reading-review-question">哪個觀點仍不同意或需要查證？</label>
    <textarea id="reading-review-question" className="field" rows={3} value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="留下尚未閉合的問題。" />
    <label htmlFor="reading-review-next">接下來值得觀察或實作什麼？</label>
    <textarea id="reading-review-next" className="field" rows={3} value={nextStep} onChange={(event) => setNextStep(event.target.value)} placeholder="這可以成為洞察卡的行動化，但不會自動立卡。" />
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="reading-review-actions">
      <button type="button" disabled={saving} onClick={() => void save(false)}>{saving ? "儲存中…" : completed ? "保存為待確認" : "先保存復盤"}</button>
      <button type="button" className="primary" disabled={saving} onClick={() => void save(true)}>{completed ? "更新已完成的復盤" : "完成讀後復盤"}</button>
    </div>
    {completed && <p className="reading-review-complete">讀後復盤已完成。</p>}
  </section>;
}

function ReadingSourceNoteCard({ book, note, initialOpen, onDelete, onInsightCreated, onDiscuss }: {
  book: ReadingBook; note: EditorNote; initialOpen: boolean; onDelete: () => void;
  onInsightCreated: (id: string) => void; onDiscuss: () => void;
}) {
  const [fragment, setFragment] = useState<"" | "reflection">(() => initialOpen &&
    new URLSearchParams(window.location.search).get("fragment") === "reflection" ? "reflection" : "");
  const m = note.metadata;
  const isExcerpt = note.kind === "excerpt";
  const title = readingSelectionLabel(book, note);
  const originalIds = [...new Set([...(m.clipSourceIds || []), m.clipPageId].filter((id): id is string => Boolean(id)))];
  return <article className="reading-source-note">
    <details className="rw-passage" open={initialOpen || undefined}>
      <summary><strong>{title}</strong><span className="rw-preview">{note.text}</span>
        {(m.highlightColor || m.reflection) && <small>{[m.highlightColor && m.highlightColor + "畫線", m.reflection && "有我的想法"].filter(Boolean).join(" · ")}</small>}
      </summary>
      <div className="rw-detail">
        <small>{[isExcerpt ? "書中原文" : "我的想法", m.source, m.chapter, m.location].filter(Boolean).join(" · ")}</small>
        {isExcerpt ? <blockquote data-ink={m.highlightColor}>{note.text}</blockquote> : <p>{note.text}</p>}
        {m.reflection && <LocatedContent parameter="note" id={note.id} fragment="reflection">
          <div className="reading-source-reflection"><small>我當時的想法</small><p>{m.reflection}</p></div>
        </LocatedContent>}
        {m.sourceFiles?.map((id,i) => <a className="rw-original" key={id} href={"https://chatgpt.com/library?file_id="+encodeURIComponent(id)+"&account_id=personal"} target="_blank" rel="noreferrer">來源截圖 {i+1} ↗</a>)}
        {originalIds.map((id,i) => <a className="rw-original" key={id} href={originalHref(id)} target="_blank" rel="noreferrer">剪藏原圖 {i+1} ↗</a>)}
        <div className="reading-source-note-actions">
          <button disabled={!note.id} onClick={onDiscuss}>和 GPT 討論</button>
          <ManualCardEntry bookId={book.id} note={note} disabled={!note.id} onInsightCreated={onInsightCreated}>
            {note.id && <details><summary>分類與來源</summary>
              {m.reflection && <label>管理對象
                <select value={fragment} onChange={event => setFragment(event.target.value === "reflection" ? "reflection" : "")}>
                  <option value="">原筆記</option><option value="reflection">我當時的想法</option>
                </select>
              </label>}
              <RelationsPanel key={fragment} target={{kind:"reading_note", recordId:note.id, parentBookId:book.id, fragment: fragment || undefined}} />
            </details>}
            {note.id && (!isExcerpt || m.reflection) && <ClaimCandidateComposer
              source={{sourceType:"reading_note",sourceId:note.id,label:book.title+"・閱讀筆記",locator:[m.chapter,m.location].filter(Boolean).join("・"),url:"",snapshot:[isExcerpt ? "來源摘錄："+note.text : "我的想法："+note.text,m.reflection && "當時理解："+m.reflection].filter(Boolean).join("\n")}}
              defaultStatement={isExcerpt ? m.reflection || "" : note.text} defaultType="understanding" buttonLabel="整理成知識候選" />}
            <button className="reading-delete-note" onClick={onDelete}>刪除這則筆記</button>
          </ManualCardEntry>
        </div>
      </div>
    </details>
  </article>;
}

function ReadingNoteEditor({ bookId, note, onText, onSaved, onDelete, onInsightCreated, onDiscuss }: { bookId: string; note: EditorNote; onText: (text: string) => void; onSaved: (id: string) => void; onDelete: () => void; onInsightCreated:(id:string)=>void; onDiscuss: () => void }) {
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [savedText, setSavedText] = useState(note.id ? note.text : "");
  const lastSaved = useRef(note.id ? note.text : "");
  const currentId = useRef(note.id);
  const latestText = useRef(note.text);
  const savingNow = useRef(false);

  useEffect(() => { currentId.current = note.id; }, [note.id]);
  useEffect(() => { latestText.current = note.text; }, [note.text]);

  const save = useCallback(async function persist(text: string) {
    if (!note.editable || savingNow.current || text === lastSaved.current || (!currentId.current && !text.trim())) return;
    savingNow.current = true;
    setSaveState("saving");
    let succeeded = false;
    try {
      const response = await fetch(`/api/dojo/reading/books/${bookId}/notes`, { method: currentId.current ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, keepalive: true, body: JSON.stringify(currentId.current ? { noteId: currentId.current, text } : { text }) });
      const json = await readJson<{ note?: ReadingNote }>(response);
      const id = json.note?.id ?? currentId.current;
      currentId.current = id;
      lastSaved.current = text;
      setSavedText(text);
      onSaved(id);
      setSaveState("saved");
      succeeded = true;
    } catch {
      setSaveState("error");
    } finally {
      savingNow.current = false;
      if (succeeded && latestText.current !== lastSaved.current) window.setTimeout(() => void persist(latestText.current), 0);
    }
  }, [bookId, note.editable, onSaved]);

  useEffect(() => {
    if (!note.editable || note.text === lastSaved.current || (!note.id && !note.text.trim())) return;
    setSaveState("idle");
    const timer = window.setTimeout(() => void save(note.text), 1000);
    return () => window.clearTimeout(timer);
  }, [note.editable, note.id, note.text, save]);

  async function remove() {
    if (note.id && !window.confirm("刪除這則自由筆記？已建立的洞察卡仍會保留來源快照。")) return;
    if (note.id) {
      setSaveState("saving");
      try {
        const response = await fetch(`/api/dojo/reading/books/${bookId}/notes?noteId=${encodeURIComponent(note.id)}`, { method: "DELETE" });
        await readJson<{ ok: true }>(response);
      } catch {
        setSaveState("error");
        return;
      }
    }
    onDelete();
  }

  return <article className={`reading-note-card ${!note.editable ? "is-readonly" : ""}`}>
    {note.editable ? <textarea value={note.text} onChange={(event) => onText(event.target.value)} onBlur={() => void save(note.text)} rows={4} placeholder="自由寫下摘要、連結或尚未整理的內容…" /> : <p>{note.text}</p>}
    <div className="reading-note-actions">
      <span className={`reading-save-state ${saveState}`}>{saveState === "saving" ? "儲存中…" : saveState === "saved" ? "已自動儲存" : saveState === "error" ? "尚未存入" : note.id ? "已存入 Notion" : "輸入後自動儲存"}</span>
      {saveState === "error" && <button onClick={() => void save(note.text)}>重試</button>}
      {note.editable && <button className="reading-delete-note" disabled={saveState === "saving"} onClick={() => void remove()}>刪除</button>}
      {note.id&&<RelationsPanel target={{kind:'reading_note',recordId:note.id,parentBookId:bookId}} />}
      <button disabled={!note.id || !note.text.trim() || note.text !== savedText || saveState === "saving"} onClick={onDiscuss}>和 GPT 討論</button>
      <ManualCardEntry bookId={bookId} note={note} disabled={!note.id || !note.text.trim() || note.text !== savedText || saveState === "saving"} onInsightCreated={onInsightCreated}/>
    </div>
  </article>;
}
