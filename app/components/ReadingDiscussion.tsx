"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { readingNoteContent } from "@/lib/reading/content";
import {
  CONVERGENCE_GUIDE, DISCUSSION_SCOPES, discussionCitation, discussionHref, discussionProductText, discussionPrompt,
  evidenceFor, methodLabel, READING_METHODS, returnInstructions,
  type DiscussionCandidate, type DiscussionResult, type DiscussionReturn, type DiscussionRound, type DiscussionScope,
  type DiscussionShortcut, type ReadingDiscussion, type ReadingMethodKey,
} from "@/lib/reading/discussion";
import type { ReadingNote } from "@/lib/reading/types";

export const discussionEndpoint = "/api/dojo/reading/discussions";

type NotebookData = { discussions: ReadingDiscussion[]; pinnedRoundId: string | null };
type ReturnPreview = { ref: DiscussionShortcut; source: DiscussionRound["source"]; parsed: DiscussionReturn; saved: boolean };
type Change = { discussion?: ReadingDiscussion; roundId?: string; pinnedRoundId?: string | null; ref?: DiscussionShortcut };

export async function discussionRequest<T>(body?: object, query = ""): Promise<T> {
  const response = await fetch(discussionEndpoint + query, {
    cache: "no-store",
    ...(body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Error(data.error || "閱讀討論暫時無法讀取。");
  return data;
}

function noteLabel(note: ReadingNote) {
  return (note.text || readingNoteContent(note)).replace(/\s+/g, " ").slice(0, 48);
}

function scopesFor(note: ReadingNote | undefined): DiscussionScope[] {
  if (!note) return [];
  if (note.kind !== "excerpt") return ["reflection"];
  return note.metadata.reflection?.trim() ? ["both", "excerpt", "reflection"] : ["excerpt"];
}

function Turns({ result }: { result: DiscussionReturn }) {
  return <ol className="reading-discussion-turns">
    {result.turns.map((turn, index) => <li key={index}><b>T{index + 1} · {turn.role}</b><p>{turn.text}</p></li>)}
  </ol>;
}

type Props = {
  bookId: string;
  notes: ReadingNote[];
  initialNoteId: string;
  initialDiscussionId: string;
  initialRoundId: string;
  onInsightCreated: (cardId: string) => void;
};

export default function ReadingDiscussionWorkspace({ bookId, notes, initialNoteId, initialDiscussionId, initialRoundId, onInsightCreated }: Props) {
  const available = notes.filter(note => note.id && readingNoteContent(note).trim());
  const [data, setData] = useState<NotebookData | null>(null);
  const [noteId, setNoteId] = useState(initialNoteId);
  const [selection, setSelection] = useState({ discussionId: initialDiscussionId, roundId: initialRoundId });
  const [scope, setScope] = useState<DiscussionScope>("both");
  const [starter, setStarter] = useState<"me" | "gpt">("gpt");
  const [method, setMethod] = useState<ReadingMethodKey>("open");
  const [compareId, setCompareId] = useState("");
  // 對照的筆記可以從另一本書選：空字串代表這本書。
  const [compareBookId, setCompareBookId] = useState("");
  const [books, setBooks] = useState<{ id: string; title: string; readCount: number }[] | null>(null);
  const [otherNotes, setOtherNotes] = useState<{ bookId: string; notes: ReadingNote[] } | null>(null);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [preview, setPreview] = useState<ReturnPreview | null>(null);
  const [manual, setManual] = useState("");
  const draftKey = "dojo.reading.return." + bookId;
  const [raw, setRaw] = useState(() => {
    try { return typeof window === "undefined" ? "" : localStorage.getItem(draftKey) ?? ""; }
    catch { return ""; }
  });

  useEffect(() => {
    let active = true;
    discussionRequest<NotebookData>(undefined, "?bookId=" + encodeURIComponent(bookId))
      .then(value => { if (active) setData(value); })
      .catch(value => { if (active) setError(value.message); });
    return () => { active = false; };
  }, [bookId]);

  const wantsBooks = READING_METHODS[method].compare !== "none";
  useEffect(() => {
    if (!wantsBooks || books) return;
    let active = true;
    fetch("/api/dojo/reading/books", { cache: "no-store" }).then(response => response.json())
      .then(value => { if (active) setBooks(Array.isArray(value.books) ? value.books : []); })
      .catch(() => { if (active) setBooks([]); });
    return () => { active = false; };
  }, [wantsBooks, books]);
  useEffect(() => {
    if (!compareBookId) return;
    let active = true;
    fetch("/api/dojo/reading/books/" + encodeURIComponent(compareBookId), { cache: "no-store" }).then(response => response.json())
      .then(value => { if (active) setOtherNotes({ bookId: compareBookId, notes: Array.isArray(value.notes) ? value.notes : [] }); })
      .catch(() => { if (active) setOtherNotes({ bookId: compareBookId, notes: [] }); });
    return () => { active = false; };
  }, [compareBookId]);

  const selectedDiscussion = data?.discussions.find(value => value.id === selection.discussionId);
  const selected = available.find(note => note.id === (selectedDiscussion?.rounds[0]?.source.noteId || noteId)) ?? available[0];
  const selectedScopes = scopesFor(selected);
  const selectedScope = selectedScopes.includes(scope) ? scope : selectedScopes[0];
  const discussions = data?.discussions.filter(value => value.rounds[0]?.source.noteId === selected?.id || value === selectedDiscussion) ?? [];
  const current = selectedDiscussion ?? discussions.find(value => value.scope === selectedScope);
  const latest = current?.rounds.at(-1);
  const shown = current?.rounds.find(round => round.id === selection.roundId) ?? latest;
  const reading = READING_METHODS[method];
  // 對照的筆記只從同一本書裡選；需要對照的讀法只列有作者原文的摘錄。
  const otherLoaded = compareBookId ? otherNotes?.bookId === compareBookId : true;
  const pool = compareBookId ? (otherLoaded ? otherNotes!.notes.filter(note => note.id && (note.kind === "excerpt" || note.kind === "thought") && readingNoteContent(note).trim()) : []) : available;
  const others = pool.filter(note => note.id !== selected?.id && (reading.compare !== "required" || (note.kind === "excerpt" && note.text.trim())));
  const otherBooks = (books ?? []).filter(book => book.id !== bookId);
  const compare = reading.compare === "none" ? undefined : others.find(note => note.id === compareId);
  const needsCompare = reading.compare === "required" && !compare;

  async function copy(value: string, name: string) {
    setManual("");
    try { await navigator.clipboard.writeText(value); setNotice("已複製" + name + "。"); }
    catch { setManual(value); setNotice("長按下方文字，選取全部後複製。"); }
  }

  function changeRaw(value: string) {
    setRaw(value);
    setPreview(null);
    setError("");
    try { if (value) localStorage.setItem(draftKey, value); else localStorage.removeItem(draftKey); }
    catch { /* Keep the editable text available in memory. */ }
  }

  async function act<T>(body: object, apply: (value: T) => void) {
    setBusy(true); setError(""); setNotice("");
    try { apply(await discussionRequest<T>({ bookId, ...body })); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "操作未完成，請保留原文再試。"); }
    finally { setBusy(false); }
  }

  function show(discussion: ReadingDiscussion, roundId: string) {
    const note = discussion.rounds[0]?.source.noteId;
    if (note) setNoteId(note);
    setScope(discussion.scope);
    setSelection({ discussionId: discussion.id, roundId });
    setManual("");
  }

  function receive(change: Change) {
    const { discussion, roundId } = change;
    if (discussion && roundId) {
      setData(prior => {
        const all = prior?.discussions ?? [];
        const discussions = all.some(value => value.id === discussion.id)
          ? all.map(value => value.id === discussion.id ? discussion : value) : [...all, discussion];
        const round = discussion.rounds.find(value => value.id === roundId);
        const pinnedRoundId = change.pinnedRoundId !== undefined ? change.pinnedRoundId
          : round?.result?.status === "暫存" ? roundId : prior?.pinnedRoundId ?? null;
        return { discussions, pinnedRoundId };
      });
      show(discussion, roundId);
    } else if (change.pinnedRoundId !== undefined) {
      setData(prior => prior && { ...prior, pinnedRoundId: change.pinnedRoundId ?? null });
    }
  }

  const begin = () => {
    if (!selected || !selectedScope) return;
    void act<Change>({ action: "prepare", noteId: selected.id, scope: selectedScope, starter, question, method, compareNoteId: compare?.id ?? "", compareBookId: compare ? compareBookId : "" }, receive);
  };

  // A card discussed without a package from here is stored on the note selected above.
  const checkCard = () => void act<ReturnPreview>({ action: "preview", raw, noteId: selected?.id ?? "", scope: selectedScope }, setPreview);
  function saveCard() {
    if (!preview) return;
    const target = preview.ref.bookId;
    if (preview.saved) {
      if (target !== bookId) window.location.assign(discussionHref(preview.ref, preview.source.noteId));
      else {
        const existing = data?.discussions.find(value => value.id === preview.ref.discussionId);
        if (existing) show(existing, preview.ref.roundId);
        changeRaw("");
      }
      return;
    }
    void act<Change>({ action: "save", raw, noteId: selected?.id ?? "", scope: selectedScope }, change => {
      changeRaw("");
      if (change.ref && change.ref.bookId !== bookId) window.location.assign(discussionHref(change.ref, preview.source.noteId));
      else receive(change);
      setNotice(preview.parsed.status === "完成" ? "本輪已完成，問答已保存。你可以稍後挑選成果。" : "問答已暫存，已把續談點放在「接著上次」。");
    });
  }

  function candidateAction(candidate: DiscussionCandidate, action: "confirm" | "skip" | "restore", result?: DiscussionResult, nextVisitAt?: string) {
    if (!current || !shown) return;
    void act<Change>({ action, discussionId: current.id, roundId: shown.id, candidateId: candidate.id, result, nextVisitAt: nextVisitAt || null }, change => {
      receive(change);
      const saved = change.discussion?.rounds.find(round => round.id === shown.id)?.result?.candidates.find(value => value.id === candidate.id);
      if (action === "confirm" && saved?.cardId) onInsightCreated(saved.cardId);
      setNotice(action === "confirm" ? "已保存確認的成果。" : action === "skip" ? "已略過這筆候選。" : "已放回待挑選。");
    });
  }

  const hasActivePacket = current && shown && !shown.result;
  const ready = data !== null;
  return <section className="reading-stage-panel reading-discussion" aria-label="GPT 討論區">
    <h2>GPT 討論區</h2>
    {!!available.length && <label>選擇閱讀筆記
      <select className="field" value={selected?.id ?? ""} onChange={event => {
        setNoteId(event.target.value);
        setSelection({ discussionId: "", roundId: "" });
        setQuestion("");
        setCompareId("");
      }}>
        {available.map(note => <option key={note.id} value={note.id}>{noteLabel(note)}</option>)}
      </select>
    </label>}
    {!available.length && <p>保存一則摘錄、想法或自由筆記，就可以選進討論。</p>}
    {discussions.length > 0 && <details className="reading-discussion-fold">
      <summary>這段的問答與成果</summary>
      {discussions.map(value => <div className="reading-discussion-history" key={value.id}>
        <b>{DISCUSSION_SCOPES[value.scope]}</b>
        {value.rounds.map((round, index) => <button key={round.id} type="button" onClick={() => show(value, round.id)}>
          第 {index + 1} 輪 · {round.result?.status ?? "已準備"}{round.method ? " · " + READING_METHODS[round.method].from : ""}
        </button>)}
      </div>)}
    </details>}
    {ready && selected && !hasActivePacket && <details className="reading-discussion-fold" open={!shown}>
      <summary>{latest?.result?.status === "暫存" ? "準備續談包" : "準備新一輪討論"}</summary>
      {latest?.result?.status === "暫存" && <p>下次從這裡　{latest.result.next}</p>}
      <label>這次想帶哪一部分？
        <select className="field" value={selectedScope} onChange={event => {
          setScope(event.target.value as DiscussionScope);
          setSelection({ discussionId: "", roundId: "" });
        }}>{selectedScopes.map(key => <option value={key} key={key}>{DISCUSSION_SCOPES[key]}</option>)}</select>
      </label>
      <fieldset className="reading-method-picker">
        <legend>這輪的讀法</legend>
        {(Object.keys(READING_METHODS) as ReadingMethodKey[]).map(key => <label key={key} className={"reading-method" + (method === key ? " on" : "")} data-method={key}>
          <input type="radio" name="reading-method" value={key} checked={method === key} onChange={() => setMethod(key)} />
          <span><b>{READING_METHODS[key].name}</b>{READING_METHODS[key].from && <small>{READING_METHODS[key].from}</small>}</span>
        </label>)}
        <p className="reading-method-hint">{reading.hint}</p>
      </fieldset>
      {reading.compare !== "none" && otherBooks.length > 0 && <label>對照的筆記出自哪一本書
        <select className="field" value={compareBookId} onChange={event => { setCompareBookId(event.target.value); setCompareId(""); }}>
          <option value="">這本書</option>
          {otherBooks.map(book => <option key={book.id} value={book.id}>{book.title}{book.readCount > 1 ? "（第 " + book.readCount + " 次閱讀）" : ""}</option>)}
        </select>
      </label>}
      {reading.compare !== "none" && <label>{reading.compare === "required" ? "對照的另一則摘錄" : "對照的另一則筆記（選填）"}
        <select className="field" value={compare?.id ?? ""} onChange={event => setCompareId(event.target.value)}>
          <option value="">{reading.compare === "required" ? "請選擇" : "不對照，只談這一則"}</option>
          {others.map(note => <option key={note.id} value={note.id}>{noteLabel(note)}</option>)}
        </select>
        {!otherLoaded && <small>正在讀取那本書的筆記…</small>}
        {otherLoaded && !others.length && (reading.compare === "required" || compareBookId) && <small>{compareBookId ? "那本書還沒有可以對照的" + (reading.compare === "required" ? "摘錄" : "筆記") + "。" : "這本書還需要另一則有作者原文的摘錄；也可以改選另一本書。"}</small>}
      </label>}
      <label>怎麼開始？
        <select className="field" value={starter} onChange={event => setStarter(event.target.value === "me" ? "me" : "gpt")}>
          <option value="gpt">讓 GPT 先問我</option><option value="me">我想先提問</option>
        </select>
      </label>
      <label>{starter === "me" ? "我這次的問題" : "我想談的方向（選填）"}
        <textarea className="field" rows={2} maxLength={4000} value={question} onChange={event => setQuestion(event.target.value)} />
      </label>
      <button className="primary" type="button" disabled={busy || needsCompare || (starter === "me" && !question.trim())} onClick={begin}>
        {latest?.result?.status === "暫存" ? "產生續談包" : "產生討論包"}
      </button>
    </details>}
    {hasActivePacket && <div className="reading-discussion-block">
      <h3>把這輪帶到 ChatGPT</h3>
      <p>{discussionCitation(shown, current.rounds.indexOf(shown) + 1)}</p>
      <p className="reading-method-used"><b>這輪的讀法</b>{methodLabel(shown.method)}{shown.source.compare && "　對照　" + (shown.source.compare.bookTitle ? "《" + shown.source.compare.bookTitle + "》" : "") + shown.source.compare.label}</p>
      <div className="reading-discussion-actions">
        <button className="primary" onClick={() => void copy(discussionPrompt(current, shown), "討論包")}>複製討論包</button>
        <a href="https://chatgpt.com/" target="_blank" rel="noreferrer">開啟 ChatGPT ↗</a>
      </div>
      <details className="reading-discussion-fold"><summary>GPT 何時會收斂？</summary><p>{CONVERGENCE_GUIDE}</p>
        <button onClick={() => void copy("請沿用這串對話原有的討論包與回傳格式。\n\n" + CONVERGENCE_GUIDE, "收斂提示")}>複製收斂提示</button>
      </details>
      <div className="reading-discussion-actions">
        <button onClick={() => void copy(returnInstructions(current, shown, "暫存"), "暫存指令")}>複製暫存指令</button>
        <button onClick={() => void copy(returnInstructions(current, shown, "完成"), "整理指令")}>複製整理指令</button>
      </div>
    </div>}
    {current && shown === latest && shown && shown.result?.status !== "完成" && <button type="button" disabled={busy} onClick={() => {
      const pinned = data?.pinnedRoundId === shown.id;
      void act<Change>({ action: pinned ? "hide" : "pin", discussionId: current.id, roundId: shown.id }, receive);
    }}>{data?.pinnedRoundId === shown.id ? "從首頁收起" : "下次接著談"}</button>}
    <details className="reading-discussion-fold" open={hasActivePacket || !!raw}>
      <summary>貼回問答</summary>
      <p className="reading-method-hint">直接和 GPT 討論完、回傳卡裡沒有討論識別的，會存到上方選擇的閱讀筆記。</p>
      <label>GPT 回傳卡<textarea className="field" rows={5} value={raw} onChange={event => changeRaw(event.target.value)} /></label>
      <button type="button" disabled={busy || !raw.trim()} onClick={checkCard}>核對回傳卡</button>
      {preview && <div className="reading-discussion-block">
        <h3>{preview.saved ? "這輪已保存" : "將存回原選段"}</h3>
        <p>{preview.source.bookTitle} · {preview.source.label} · {preview.parsed.status}卡</p>
        <details className="reading-discussion-fold"><summary>查看本輪問答（{preview.parsed.turns.length} 則）</summary><Turns result={preview.parsed} /></details>
        {preview.parsed.next && preview.parsed.status === "暫存" && <p>下次從這裡　{preview.parsed.next}</p>}
        {preview.parsed.status === "完成" && <p>{preview.parsed.candidates.length} 筆候選可供挑選。</p>}
        <button className="primary" type="button" disabled={busy} onClick={saveCard}>{preview.saved ? "回看原紀錄" : "保存" + preview.parsed.status + "卡"}</button>
      </div>}
    </details>
    {error && <p className="form-error" role="alert">{error}</p>}
    {notice && <p className="save-notice" role="status">{notice}</p>}
    {manual && <label>手動複製<textarea className="field" readOnly rows={6} value={manual} onFocus={event => event.target.select()} /></label>}
    {current && shown?.result && <div className="reading-discussion-block">
      <h3>{shown.result.status === "完成" ? "本輪已完成" : "本輪已暫存"}</h3>
      <details className="reading-discussion-fold"><summary>回看本輪問答與來源</summary>
        {shown.source.excerpt && <div><b>作者原文</b><blockquote>{shown.source.excerpt}</blockquote></div>}
        {shown.source.reflection && <div><b>我當時的想法</b><p>{shown.source.reflection}</p></div>}
        {shown.source.compare?.excerpt && <div><b>對照的作者原文{shown.source.compare.bookTitle ? "（《" + shown.source.compare.bookTitle + "》）" : ""}</b><blockquote>{shown.source.compare.excerpt}</blockquote></div>}
        {shown.source.compare?.reflection && <div><b>我對對照段的想法</b><p>{shown.source.compare.reflection}</p></div>}
        {shown.method && <p className="reading-method-used"><b>這輪的讀法</b>{methodLabel(shown.method)}</p>}
        <Turns result={shown.result} />
      </details>
      {shown.result.next && shown.result.status === "暫存" && <p>下次從這裡　{shown.result.next}</p>}
      {shown.result.candidates.filter(candidate => candidate.state === "pending").map(candidate =>
        <Candidate key={shown.id + "-" + candidate.id} candidate={candidate} round={shown} busy={busy}
          onSkip={() => candidateAction(candidate, "skip")}
          onConfirm={(result, visit) => candidateAction(candidate, "confirm", result, visit)} />)}
      {shown.result.candidates.filter(candidate => candidate.state === "confirmed").map(candidate => <article className="reading-discussion-block" key={candidate.id}>
        <h4>{candidate.type === "觀點" ? "我的觀點" : "洞察卡"}</h4>
        <p>{candidate.text}</p>
        {candidate.action && <p>{candidate.action}</p>}
        <details className="reading-discussion-fold"><summary>出處與依據</summary>
          <p>{discussionCitation(shown, current.rounds.indexOf(shown) + 1)} · v1</p>
          <p>{evidenceFor(shown)[candidate.anchor]?.label}　{candidate.quote}</p>
        </details>
        <div className="reading-discussion-actions">
          <a href={`/weaving/studio#card/discussion:${encodeURIComponent(shown.id)}:${encodeURIComponent(candidate.id)}`}>查看連結的織光杼</a>
          <button onClick={() => {
            const href = discussionHref({ bookId, discussionId: current.id, roundId: shown.id }, shown.source.noteId);
            const text = discussionProductText(shown, current.rounds.indexOf(shown) + 1, candidate);
            void copy(text + "\n" + new URL(href, window.location.origin).href, "成果與出處");
          }}>複製成果與出處</button>
          {candidate.cardId && <Link href={"/reading/cards?card=" + encodeURIComponent(candidate.cardId)}>開啟洞察卡</Link>}
        </div>
      </article>)}
      {shown.result.candidates.some(candidate => candidate.state === "skipped") && <details className="reading-discussion-fold"><summary>已略過的候選</summary>
        {shown.result.candidates.filter(candidate => candidate.state === "skipped").map(candidate => <div key={candidate.id}><p>{candidate.text}</p>
          <button disabled={busy} onClick={() => candidateAction(candidate, "restore")}>重新挑選</button></div>)}
      </details>}
    </div>}
  </section>;
}

function Candidate({ candidate, round, busy, onSkip, onConfirm }: {
  candidate: DiscussionCandidate;
  round: DiscussionRound;
  busy: boolean;
  onSkip: () => void;
  onConfirm: (result: DiscussionResult, visit: string) => void;
}) {
  const [draft, setDraft] = useState<DiscussionResult>(candidate);
  const [visit, setVisit] = useState("");
  const refs = evidenceFor(round);
  const evidence = Object.hasOwn(refs, draft.anchor) ? refs[draft.anchor] : undefined;
  const supported = !!draft.quote.trim() && evidence?.text.includes(draft.quote.trim());
  return <article className="reading-discussion-block">
    <h4>待你挑選 · {candidate.type}</h4>
    {candidate.evidenceError && <p>{candidate.evidenceError}</p>}
    <label>成果類型<select className="field" value={draft.type} onChange={event => setDraft({ ...draft, type: event.target.value === "洞察卡" ? "洞察卡" : "觀點" })}>
      <option>觀點</option><option>洞察卡</option>
    </select></label>
    <label>想留下的文字<textarea className="field" rows={2} maxLength={1800} value={draft.text} onChange={event => setDraft({ ...draft, text: event.target.value })} /></label>
    {draft.type === "洞察卡" && <>
      <label>我想觀察或執行的事<textarea className="field" rows={2} maxLength={6000} value={draft.action} onChange={event => setDraft({ ...draft, action: event.target.value })} /></label>
      <label>回訪日期（選填）<input className="field" type="date" value={visit} onChange={event => setVisit(event.target.value)} /></label>
    </>}
    <details className="reading-discussion-fold" open={!supported}>
      <summary>核對依據{evidence ? " · " + evidence.label : ""}</summary>
      <label>這筆成果的依據<select className="field" value={evidence ? draft.anchor : ""} onChange={event => setDraft({ ...draft, anchor: event.target.value, quote: "" })}>
        <option value="">選擇來源</option>
        {Object.entries(refs).map(([key, value]) => <option key={key} value={key}>{key} · {value.label} · {value.text.slice(0, 35)}</option>)}
      </select></label>
      {evidence && <p>{evidence.text}</p>}
      <label>依據原句<textarea className="field" rows={2} value={draft.quote} onChange={event => setDraft({ ...draft, quote: event.target.value })} /></label>
      {evidence && <button type="button" onClick={() => setDraft({ ...draft, quote: evidence.text })}>帶入整則原文</button>}
    </details>
    <div className="reading-discussion-actions">
      <button className="primary" type="button" disabled={busy || !supported || !draft.text.trim() || (draft.type === "洞察卡" && !draft.action.trim())} onClick={() => onConfirm(draft, visit)}>
        確認存成{draft.type === "觀點" ? "我的觀點" : "洞察卡"}
      </button>
      <button type="button" disabled={busy} onClick={onSkip}>略過</button>
    </div>
  </article>;
}
