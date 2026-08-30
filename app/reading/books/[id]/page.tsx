"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { InsightActionType, InsightCard, ReadingBook, ReadingNote } from "@/lib/reading/types";

async function readJson<T>(response: Response): Promise<T> {
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((json as { error?: string }).error ?? `操作失敗（${response.status}）`);
  return json as T;
}

type EditorNote = ReadingNote & { clientKey: string };

function newNote(): EditorNote {
  return { id: "", clientKey: crypto.randomUUID(), text: "", editable: true };
}

export default function ReadingBookPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const bookId = params.id;
  const [book, setBook] = useState<ReadingBook | null>(null);
  const [notes, setNotes] = useState<EditorNote[]>([]);
  const [cards, setCards] = useState<InsightCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cardDraft, setCardDraft] = useState<string | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/dojo/reading/books/${bookId}`, { cache: "no-store" });
      const json = await readJson<{ book: ReadingBook; notes: ReadingNote[]; cards: InsightCard[] }>(response);
      setBook(json.book);
      const loaded = (json.notes ?? []).map((note) => ({ ...note, clientKey: note.id }));
      setNotes(loaded.length ? loaded : [newNote()]);
      setCards(json.cards ?? []);
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

  async function updateBookStatus(status: "已萃取" | "放棄") {
    if (status === "已萃取" && !window.confirm("要把這輪閱讀收進「已完成」嗎？筆記與卡片仍可繼續查看。")) return;
    if (status === "放棄" && !window.confirm("確定放棄這輪閱讀嗎？既有筆記不會被刪除。")) return;
    setUpdatingStatus(true);
    setError(null);
    try {
      const response = await fetch(`/api/dojo/reading/books/${bookId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const json = await readJson<{ book: ReadingBook }>(response);
      setBook(json.book);
      setNotice(status === "已萃取" ? "這輪閱讀已完成萃取。" : "這輪閱讀已放下，筆記仍完整保留。");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setUpdatingStatus(false);
    }
  }

  if (loading) return <section className="screen reading-screen"><div className="empty">正在打開閱讀頁…</div></section>;
  if (!book) return <section className="screen reading-screen"><p className="form-error">{error ?? "找不到這輪閱讀"}</p></section>;

  const executionCount = cards.filter((card) => card.actionType === "執行型").length;
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

      {error && <p className="form-error" role="alert">{error}</p>}
      {notice && <p className="save-notice" role="status">{notice}</p>}

      <section className="reading-notes-section">
        <div className="reading-section-heading">
          <div><h2>閱讀筆記</h2><p>自由寫下章節重點、疑問或聯想，不需要先整理。</p></div>
        </div>
        <div className="reading-note-list">
          {notes.map((note) => (
            <ReadingNoteEditor
              key={note.clientKey}
              bookId={bookId}
              note={note}
              onText={(text) => updateNote(note.clientKey, { text })}
              onSaved={(id) => updateNote(note.clientKey, { id })}
              onDelete={() => setNotes((current) => current.filter((item) => item.clientKey !== note.clientKey))}
              onMakeCard={(text) => setCardDraft(text)}
            />
          ))}
        </div>
        <button className="reading-add-note" onClick={() => setNotes((current) => [...current, newNote()])}>＋ 新增一則筆記</button>
      </section>

      <section className="reading-cards-section">
        <div className="reading-section-heading">
          <div><h2>本輪洞察卡</h2><p>已立 {cards.length} 張・建議 3–5 張</p></div>
          <button onClick={() => router.push("/reading/cards")}>卡片庫</button>
        </div>
        {cards.length > 5 && <p className="reading-gentle-warning">已超過建議張數。可以保留，但先確認每張都真的寫得出行動。</p>}
        {cards.length === 0 ? <div className="reading-soft-empty">筆記寫得出「我能拿它做什麼」時，再按旁邊的「立成卡片」。</div> : (
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
      </section>

      {book.status === "閱讀中" && (
        <details className="reading-state-actions">
          <summary>結束這輪閱讀</summary>
          <p>完成萃取只代表這輪告一段落，不會計算完成率，也不會鎖住筆記。</p>
          <button className="primary" disabled={updatingStatus} onClick={() => void updateBookStatus("已萃取")}>完成本輪萃取</button>
          <button className="danger" disabled={updatingStatus} onClick={() => void updateBookStatus("放棄")}>放棄這輪閱讀</button>
        </details>
      )}

      {cardDraft !== null && (
        <InsightCardSheet
          bookId={bookId}
          initialInsight={cardDraft}
          executionCount={executionCount}
          onClose={() => setCardDraft(null)}
          onCreated={(card) => { setCards((current) => [...current, card]); setCardDraft(null); setNotice("洞察卡已建立，回訪日也排好了。"); }}
        />
      )}
    </section>
  );
}

function ReadingNoteEditor({
  bookId,
  note,
  onText,
  onSaved,
  onDelete,
  onMakeCard,
}: {
  bookId: string;
  note: EditorNote;
  onText: (text: string) => void;
  onSaved: (id: string) => void;
  onDelete: () => void;
  onMakeCard: (text: string) => void;
}) {
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
      const response = await fetch(`/api/dojo/reading/books/${bookId}/notes`, {
        method: currentId.current ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        keepalive: true,
        body: JSON.stringify(currentId.current ? { noteId: currentId.current, text } : { text }),
      });
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
      if (succeeded && latestText.current !== lastSaved.current) {
        window.setTimeout(() => void persist(latestText.current), 0);
      }
    }
  }, [bookId, note.editable, onSaved]);

  useEffect(() => {
    if (!note.editable || note.text === lastSaved.current || (!note.id && !note.text.trim())) return;
    setSaveState("idle");
    const timer = window.setTimeout(() => void save(note.text), 1000);
    return () => window.clearTimeout(timer);
  }, [note.editable, note.id, note.text, save]);

  async function remove() {
    if (note.id && !window.confirm("刪除這則筆記？這不會刪除已立成的卡片。")) return;
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

  return (
    <article className={`reading-note-card ${!note.editable ? "is-readonly" : ""}`}>
      {note.editable ? (
        <textarea
          value={note.text}
          onChange={(event) => onText(event.target.value)}
          onBlur={() => void save(note.text)}
          rows={4}
          placeholder="這一段讓你想到什麼？可以先從一句話開始。"
        />
      ) : <p>{note.text}</p>}
      <div className="reading-note-actions">
        <span className={`reading-save-state ${saveState}`}>
          {saveState === "saving" ? "儲存中…" : saveState === "saved" ? "已自動儲存" : saveState === "error" ? "尚未存入" : note.id ? "已存入 Notion" : "輸入後自動儲存"}
        </span>
        {saveState === "error" && <button onClick={() => void save(note.text)}>重試</button>}
        {note.editable && <button className="reading-delete-note" disabled={saveState === "saving"} onClick={() => void remove()}>刪除</button>}
        <button className="reading-make-card" disabled={!note.id || !note.text.trim() || note.text !== savedText || saveState === "saving"} onClick={() => onMakeCard(note.text)}>立成卡片</button>
      </div>
    </article>
  );
}

function InsightCardSheet({
  bookId,
  initialInsight,
  executionCount,
  onClose,
  onCreated,
}: {
  bookId: string;
  initialInsight: string;
  executionCount: number;
  onClose: () => void;
  onCreated: (card: InsightCard) => void;
}) {
  const [insight, setInsight] = useState(initialInsight);
  const [action, setAction] = useState("");
  const [actionType, setActionType] = useState<InsightActionType>("觀察型");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!action.trim()) { setError("寫不出行動的洞察，先留在筆記層就好"); return; }
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/dojo/reading/cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookId, insight, action, actionType }),
      });
      const json = await readJson<{ card: InsightCard }>(response);
      onCreated(json.card);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal show" onClick={(event) => event.target === event.currentTarget && !saving && onClose()}>
      <div className="sheet reading-card-sheet" role="dialog" aria-modal="true" aria-labelledby="insight-form-title">
        <div className="toolbar"><div><span className="eyebrow">從筆記立卡</span><h2 id="insight-form-title">我能拿它做什麼？</h2></div><button onClick={onClose} disabled={saving}>關閉</button></div>
        <label>洞察</label>
        <textarea className="field" rows={4} value={insight} onChange={(event) => setInsight(event.target.value)} />
        <label>行動化 *</label>
        <textarea className="field" rows={3} value={action} onChange={(event) => setAction(event.target.value)} placeholder="接下來要觀察什麼，或實際做出什麼改變？" />
        <p className="reading-field-help">寫不出行動的洞察，留在筆記層就好，不必勉強立卡。</p>
        <label>行動型態</label>
        <div className="segmented">
          <button className={actionType === "觀察型" ? "on" : ""} onClick={() => setActionType("觀察型")}>觀察型<small>兩週後回訪</small></button>
          <button className={actionType === "執行型" ? "on" : ""} onClick={() => setActionType("執行型")}>執行型<small>一週後回訪</small></button>
        </div>
        {actionType === "執行型" && executionCount >= 1 && <p className="reading-gentle-warning">這輪已經有 {executionCount} 張執行型卡片。可以繼續建立，但先確認它真的排得進生活。</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="primary" disabled={saving || !insight.trim() || !action.trim()} onClick={() => void submit()}>{saving ? "正在立卡…" : "建立洞察卡"}</button>
      </div>
    </div>
  );
}
