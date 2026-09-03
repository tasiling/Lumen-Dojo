"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import ReadingQuickCapture from "@/app/components/ReadingQuickCapture";
import type { InsightActionType, InsightCard, ReadingBook, ReadingNote, ReadingNoteKind, ReadingNoteMetadata } from "@/lib/reading/types";

async function readJson<T>(response: Response): Promise<T> {
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((json as { error?: string }).error ?? `操作失敗（${response.status}）`);
  return json as T;
}

type EditorNote = ReadingNote & { clientKey: string };
type ReadingStage = "before" | "during" | "after";
type CardDraft = { noteId: string; text: string };

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
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const bookId = params.id;
  const [book, setBook] = useState<ReadingBook | null>(null);
  const [notes, setNotes] = useState<EditorNote[]>([]);
  const [cards, setCards] = useState<InsightCard[]>([]);
  const [stage, setStage] = useState<ReadingStage>("before");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cardDraft, setCardDraft] = useState<CardDraft | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/dojo/reading/books/${bookId}`, { cache: "no-store" });
      const json = await readJson<{ book: ReadingBook; notes: ReadingNote[]; cards: InsightCard[] }>(response);
      setBook(json.book);
      const loaded = (json.notes ?? []).map((note) => ({ ...note, clientKey: note.id }));
      setNotes(loaded);
      setCards(json.cards ?? []);
      const hasReadingRecord = loaded.some((note) => note.kind !== "review");
      setStage(json.book.status === "閱讀中" ? (hasReadingRecord ? "during" : "before") : "after");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoading(false);
    }
  }, [bookId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  function updateNote(clientKey: string, patch: Partial<EditorNote>) {
    setNotes((current) => current.map((note) => note.clientKey === clientKey ? { ...note, ...patch } : note));
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

  const executionCount = cards.filter((card) => card.actionType === "執行型" && card.status !== "放棄").length;
  const latestPreview = grouped.preview.at(-1) ?? null;
  const latestReview = grouped.review.at(-1) ?? null;

  return (
    <section className="screen reading-screen reading-session-screen">
      <div className="reading-session-head">
        <div className="reading-book-meta">
          {book.subject && <span>{book.subject}</span>}
          {book.readCount > 1 && <span>第 {book.readCount} 讀</span>}
          <span>{book.status}</span>
        </div>
        <h1>{book.title}</h1>
        {book.author && <p>{book.author}</p>}
      </div>

      <aside className="reading-question-anchor">
        <span>這輪帶著什麼問題讀</span>
        <p>{book.question}</p>
      </aside>

      <nav className="reading-stage-tabs" aria-label="閱讀筆記階段">
        <button className={stage === "before" ? "on" : ""} onClick={() => setStage("before")}><span>讀前</span><small>小預習</small></button>
        <button className={stage === "during" ? "on" : ""} onClick={() => setStage("during")}><span>閱讀中</span><small>摘錄與想法</small></button>
        <button className={stage === "after" ? "on" : ""} onClick={() => setStage("after")}><span>讀後</span><small>復盤與洞察</small></button>
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
          <ReadingQuickCapture fixedBook={book} embedded onSaved={(note) => { addOrReplaceNote(note); setNotice(note.kind === "excerpt" ? "摘錄已存入這本書。" : "想法已存入這本書。"); }} />

          <section className="reading-notes-section">
            <div className="reading-section-heading">
              <div><h2>這輪留下的內容</h2><p>作者原文與你的想法會清楚分開，之後仍能回到來源。</p></div>
              <span>{grouped.reading.length}</span>
            </div>
            {grouped.reading.length === 0 ? <div className="reading-soft-empty">還沒有摘錄或零碎想法。從上方貼入第一段 Readmoo 文字即可。</div> : (
              <div className="reading-source-note-list">
                {grouped.reading.map((note) => (
                  <ReadingSourceNoteCard
                    key={note.clientKey}
                    note={note}
                    onDelete={() => void removeNote(note)}
                    onMakeCard={() => setCardDraft({ noteId: note.id, text: note.text })}
                  />
                ))}
              </div>
            )}
          </section>

          <section className="reading-notes-section reading-free-notes">
            <div className="reading-section-heading"><div><h2>自由筆記</h2><p>這裡保持完全自由，不要求套用格式。</p></div></div>
            <div className="reading-note-list">
              {grouped.free.map((note) => (
                <ReadingNoteEditor
                  key={note.clientKey}
                  bookId={bookId}
                  note={note}
                  onText={(text) => updateNote(note.clientKey, { text })}
                  onSaved={(id) => updateNote(note.clientKey, { id })}
                  onDelete={() => setNotes((current) => current.filter((item) => item.clientKey !== note.clientKey))}
                  onMakeCard={(text) => setCardDraft({ noteId: note.id, text })}
                />
              ))}
            </div>
            <button className="reading-add-note" onClick={() => setNotes((current) => [...current, newNote()])}>＋ 新增自由筆記</button>
          </section>

          <button className="primary reading-go-review" onClick={() => setStage("after")}>前往讀後復盤</button>
        </>
      )}

      {stage === "after" && (
        <>
          <ReadingReviewPanel
            book={book}
            note={latestReview}
            excerptCount={grouped.reading.filter((note) => note.kind === "excerpt").length}
            thoughtCount={grouped.reading.filter((note) => note.kind === "thought").length}
            onSaved={(note, nextBook) => {
              addOrReplaceNote(note);
              if (nextBook) setBook(nextBook);
              setNotice(nextBook ? "讀後復盤已完成，這輪閱讀已收束。" : "讀後復盤已保存。");
            }}
          />

          <section className="reading-cards-section">
            <div className="reading-section-heading">
              <div><h2>本輪洞察卡</h2><p>由你親自寫下與確認；每輪保留 3–5 張，執行型最多一張。</p></div>
              <button onClick={() => router.push("/reading/cards")}>卡片庫</button>
            </div>
            {cards.length > 5 && <p className="reading-gentle-warning">已超過五張。可以回看哪些只是摘錄，哪些真的值得持續追蹤。</p>}
            {cards.length === 0 ? <div className="reading-soft-empty">回到上方摘錄，選擇真正改變你理解的一則，再按「提煉洞察」。</div> : (
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
                  {grouped.reading.map((note) => <button key={note.id} onClick={() => setCardDraft({ noteId: note.id, text: note.text })}><span>{note.kind === "excerpt" ? "摘錄" : "想法"}</span><b>{note.text.slice(0, 90)}</b></button>)}
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

      {cardDraft && (
        <InsightCardSheet
          bookId={bookId}
          sourceNoteId={cardDraft.noteId}
          sourceText={cardDraft.text}
          executionCount={executionCount}
          onClose={() => setCardDraft(null)}
          onCreated={(card) => { setCards((current) => [...current, card]); setCardDraft(null); setNotice("洞察卡已建立，來源摘錄與回訪日都保存好了。"); }}
        />
      )}
    </section>
  );
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

function ReadingReviewPanel({ book, note, excerptCount, thoughtCount, onSaved }: { book: ReadingBook; note: EditorNote | null; excerptCount: number; thoughtCount: number; onSaved: (note: ReadingNote, book?: ReadingBook) => void }) {
  const [changed, setChanged] = useState(note?.metadata.changedUnderstanding ?? "");
  const [question, setQuestion] = useState(note?.metadata.openQuestion ?? "");
  const [nextStep, setNextStep] = useState(note?.metadata.nextStep ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(finish: boolean) {
    if (!changed.trim() && !question.trim() && !nextStep.trim()) { setError("至少先留下一項讀後發現"); return; }
    setSaving(true); setError(null);
    try {
      const saved = await saveStructuredNote({ bookId: book.id, noteId: note?.id, kind: "review", text: changed, metadata: { changedUnderstanding: changed, openQuestion: question, nextStep } });
      let nextBook: ReadingBook | undefined;
      if (finish && book.status === "閱讀中") {
        const response = await fetch(`/api/dojo/reading/books/${book.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "已萃取" }) });
        nextBook = (await readJson<{ book: ReadingBook }>(response)).book;
      }
      onSaved({ ...saved, createdAt: saved.createdAt || note?.createdAt || "" }, nextBook);
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
      <button type="button" disabled={saving} onClick={() => void save(false)}>{saving ? "儲存中…" : note ? "更新復盤" : "先保存復盤"}</button>
      {book.status === "閱讀中" && <button type="button" className="primary" disabled={saving} onClick={() => void save(true)}>完成讀後復盤</button>}
    </div>
    {book.status !== "閱讀中" && <p className="reading-review-complete">這輪已收束；復盤仍可繼續修改。</p>}
  </section>;
}

function ReadingSourceNoteCard({ note, onDelete, onMakeCard }: { note: EditorNote; onDelete: () => void; onMakeCard: () => void }) {
  return <article className={`reading-source-note kind-${note.kind}`}>
    <div className="reading-source-note-meta">
      <span>{note.kind === "excerpt" ? note.metadata.source || "摘錄" : "我的想法"}</span>
      {note.metadata.chapter && <span>{note.metadata.chapter}</span>}
      {note.metadata.location && <span>{note.metadata.location}</span>}
    </div>
    {note.kind === "excerpt" ? <blockquote>{note.text}</blockquote> : <p className="reading-thought-text">{note.text}</p>}
    {note.metadata.reflection && <div className="reading-source-reflection"><small>我當時想到</small><p>{note.metadata.reflection}</p></div>}
    <div className="reading-source-note-actions"><button className="reading-delete-note" onClick={onDelete}>刪除</button><button className="reading-make-card" disabled={!note.id} onClick={onMakeCard}>提煉洞察</button></div>
  </article>;
}

function ReadingNoteEditor({ bookId, note, onText, onSaved, onDelete, onMakeCard }: { bookId: string; note: EditorNote; onText: (text: string) => void; onSaved: (id: string) => void; onDelete: () => void; onMakeCard: (text: string) => void }) {
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
      <button className="reading-make-card" disabled={!note.id || !note.text.trim() || note.text !== savedText || saveState === "saving"} onClick={() => onMakeCard(note.text)}>提煉洞察</button>
    </div>
  </article>;
}

function InsightCardSheet({ bookId, sourceNoteId, sourceText, executionCount, onClose, onCreated }: { bookId: string; sourceNoteId: string; sourceText: string; executionCount: number; onClose: () => void; onCreated: (card: InsightCard) => void }) {
  const [insight, setInsight] = useState("");
  const [action, setAction] = useState("");
  const [actionType, setActionType] = useState<InsightActionType>("觀察型");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!insight.trim()) { setError("先用自己的話寫下：這段內容讓你想到什麼？"); return; }
    if (!action.trim()) { setError("暫時寫不出行動，就先留在閱讀紀錄"); return; }
    if (actionType === "執行型" && executionCount >= 1) { setError("這輪已經有一張執行型洞察；這張可以先改為觀察型"); return; }
    setSaving(true); setError(null);
    try {
      const response = await fetch("/api/dojo/reading/cards", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bookId, sourceNoteId, insight, action, actionType }) });
      const json = await readJson<{ card: InsightCard }>(response);
      onCreated(json.card);
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
    finally { setSaving(false); }
  }

  return <div className="modal show" onClick={(event) => event.target === event.currentTarget && !saving && onClose()}>
    <div className="sheet reading-card-sheet" role="dialog" aria-modal="true" aria-labelledby="insight-form-title">
      <div className="toolbar"><div><span className="eyebrow">從來源紀錄提煉</span><h2 id="insight-form-title">這段讓我想到什麼？</h2></div><button onClick={onClose} disabled={saving}>關閉</button></div>
      <details className="reading-card-source"><summary><span>來源紀錄</span><small>會隨卡片保存</small></summary><p>{sourceText}</p></details>
      <label>我的洞察 *</label>
      <textarea className="field" rows={4} value={insight} onChange={(event) => setInsight(event.target.value)} placeholder="我如何理解這段內容？我同意、質疑，或連結到哪些經驗？" autoFocus />
      <p className="reading-field-help">請用自己的話留下想法；來源內容只作為依據。</p>
      <label>我能拿它做什麼？ *</label>
      <textarea className="field" rows={3} value={action} onChange={(event) => setAction(event.target.value)} placeholder="接下來要觀察什麼，或實際做出什麼改變？" />
      <p className="reading-field-help">暫時寫不出行動，就先留在閱讀紀錄。</p>
      <label>行動型態</label>
      <div className="segmented">
        <button className={actionType === "觀察型" ? "on" : ""} onClick={() => setActionType("觀察型")}>觀察型<small>兩週後回訪</small></button>
        <button disabled={executionCount >= 1} className={actionType === "執行型" ? "on" : ""} onClick={() => setActionType("執行型")}>執行型<small>{executionCount >= 1 ? "本輪已有一張" : "一週後回訪"}</small></button>
      </div>
      {executionCount >= 1 && <p className="reading-gentle-warning">每輪只保留一張執行型洞察，避免同時增加太多行動。</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="primary" disabled={saving || !insight.trim() || !action.trim()} onClick={() => void submit()}>{saving ? "正在立卡…" : "建立洞察卡"}</button>
    </div>
  </div>;
}
