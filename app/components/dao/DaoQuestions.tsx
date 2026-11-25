"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DAO_FORMAT, DAO_METHODS, buildDaoPackage, daoCandidateIsOwn, daoMindmapMarkdown, daoSourceKind, latestUnderstanding, parseDaoReturn,
  type DaoMethod, type DaoQuestion, type DaoReturn, type DaoSource,
} from "@/lib/dojo/daoQuestions";
import "@/app/dao/dao-questions.css";

const API = "/api/dojo/dao-questions";
async function readJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(body.error || `操作沒有完成（${response.status}）`);
  return body;
}
const get = <T,>(query = "") => fetch(API + query, { cache: "no-store" }).then(readJson<T>);
const post = <T,>(body: unknown) => fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(readJson<T>);
async function copy(text: string) { try { await navigator.clipboard.writeText(text); return true; } catch { return false; } }
const day = (iso: string) => iso.slice(5, 10).replace("-", "/");
const message = (caught: unknown) => caught instanceof Error ? caught.message : String(caught);

function useSources() {
  const [sources, setSources] = useState<DaoSource[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { let live = true; get<{ sources: DaoSource[] }>("?sources=1").then((r) => live && setSources(r.sources)).catch((e) => live && setError(message(e))); return () => { live = false; }; }, []);
  const byId = useMemo(() => new Map((sources ?? []).map((s) => [s.id, s])), [sources]);
  return { sources, byId, error };
}

function Kind({ s }: { s: DaoSource }) {
  const kind = daoSourceKind(s);
  return <span className="dao-tag" data-k={kind}>{kind}</span>;
}

/* ---------- 心智圖 ---------- */
type MapPick = { kind: "source"; source: DaoSource } | { kind: "version"; q: DaoQuestion; n: number } | null;
function DaoMap({ questions, byId, compact, open, setOpen, pick, setPick }: {
  questions: DaoQuestion[]; byId: Map<string, DaoSource>; compact: boolean;
  open: Record<string, boolean>; setOpen: (next: Record<string, boolean>) => void; pick?: MapPick; setPick?: (p: MapPick) => void;
}) {
  if (!questions.length) return <div className="dao-empty">留下第一個長期問題後，心智圖會從這裡長出來。</div>;
  const leaf = (key: string, text: string, p: MapPick) => <button type="button" key={key} className="dao-node leaf" aria-current={pick && JSON.stringify(pick) === JSON.stringify(p) ? "true" : undefined} onClick={() => setPick?.(p)} disabled={!setPick}>{text}</button>;
  return <div className="dao-map"><span className="dao-root">道藏</span><ul>
    {questions.map((q) => {
      const isOpen = Boolean(open[q.id]), v = latestUnderstanding(q);
      const groups = new Map<string, DaoSource[]>();
      q.sources.map((id) => byId.get(id)).forEach((s) => { if (s) groups.set(daoSourceKind(s), [...(groups.get(daoSourceKind(s)) ?? []), s]); });
      return <li key={q.id}>
        <button type="button" className="dao-node q" aria-expanded={isOpen} onClick={() => setOpen({ ...open, [q.id]: !isOpen })}><span className="tw">{isOpen ? "－" : "＋"}</span>{q.title}</button>
        {!isOpen && !compact && v && <ul><li><span className="dao-node leaf">{v.text}</span></li></ul>}
        {isOpen && <ul>
          {v && <li><span className="dao-node branch">我現在怎麼看</span><ul><li>{leaf("v" + v.n, v.text, { kind: "version", q, n: v.n })}</li></ul></li>}
          {q.versions.length > 1 && <li><span className="dao-node branch">理解的變化</span><ul>{q.versions.slice(0, -1).map((x) => <li key={x.n}>{leaf("v" + x.n, `第 ${x.n} 次｜${x.text}`, { kind: "version", q, n: x.n })}</li>)}</ul></li>}
          {groups.size > 0 && <li><span className="dao-node branch">來源</span><ul>{[...groups].map(([kind, list]) => <li key={kind}><span className="dao-node branch"><span className="dao-tag" data-k={kind}>{kind}</span></span>
            <ul>{list.map((s) => <li key={s.id}>{leaf(s.id, s.idea || s.title, { kind: "source", source: s })}</li>)}</ul></li>)}</ul></li>}
          {(q.shuttles.length > 0 || q.knowledge) && <li><span className="dao-node branch">去處</span><ul>
            {q.shuttles.map((s) => <li key={s.id}><a className="dao-node leaf" href={`/weaving/studio#shuttle/${encodeURIComponent(s.id)}`}>織光杼｜{s.title}</a></li>)}
            {q.knowledge && <li><Link className="dao-node leaf" href="/dao/knowledge">知識｜{q.knowledge.statement}</Link></li>}
          </ul></li>}
        </ul>}
      </li>;
    })}
  </ul></div>;
}
function PickDetail({ pick, onClose }: { pick: MapPick; onClose: () => void }) {
  if (!pick) return null;
  if (pick.kind === "source") {
    const s = pick.source;
    return <div className="card dao-detail"><span className="dao-meta"><Kind s={s} /><span>{[s.source, s.location].filter(Boolean).join(" · ")}</span></span><b>{s.idea || s.title}</b>
      {s.quote && s.quote !== s.idea && <div className="dao-quote"><small>{s.quoteLabel || "原文"}</small>{s.quote}</div>}
      {s.basis && <p className="dao-hint">回應的原文：{s.basis}</p>}
      <div className="dao-row">{s.url && <a className="dao-link" href={s.url}>回到原紀錄 ›</a>}<button type="button" className="dao-link" onClick={onClose}>收起</button></div></div>;
  }
  const v = pick.q.versions.find((x) => x.n === pick.n);
  return v ? <div className="card dao-detail"><span className="dao-meta"><span>{pick.q.title}</span><span>第 {v.n} 次 · {v.from}</span></span><b>{v.text}</b>{v.note && <p className="dao-hint">{v.note}</p>}
    <div className="dao-row"><button type="button" className="dao-link" onClick={onClose}>收起</button></div></div> : null;
}

/* ---------- 道藏首頁的區塊 ---------- */
export function DaoHomeSections() {
  const [questions, setQuestions] = useState<DaoQuestion[] | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [composing, setComposing] = useState(false);
  const { byId } = useSources();
  const load = useCallback(() => get<{ questions: DaoQuestion[] }>().then((r) => setQuestions(r.questions)).catch((e) => setError(message(e))), []);
  useEffect(() => { void load(); }, [load]);
  return <>
    <section className="card dao-section">
      <div className="dao-row dao-between"><h2>知識心智圖</h2><Link className="dao-link" href="/dao/map">打開完整的圖 ›</Link></div>
      <p className="dao-hint">所有長期問題與你現在的理解。點一個問題，展開它的來源與去處。</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      {questions ? <DaoMap questions={questions} byId={byId} compact open={open} setOpen={setOpen} /> : !error && <div className="dao-empty">正在讀取長期問題…</div>}
    </section>
    <section className="card dao-section">
      <div className="dao-row dao-between"><h2>長期問題</h2><button type="button" className="dao-soft" onClick={() => setComposing(!composing)}>{composing ? "收起" : "＋ 留下一個問題"}</button></div>
      {composing && <NewQuestion onCreated={(q) => { window.location.href = `/dao/question?id=${encodeURIComponent(q.id)}`; }} />}
      {questions && !questions.length && !composing && <div className="dao-empty">還沒有長期問題。從一則覺察、一張閱讀卡，或一個你一直在想的問題開始。</div>}
      {questions?.map((q) => { const v = latestUnderstanding(q);
        return <Link key={q.id} className="dao-question" href={`/dao/question?id=${encodeURIComponent(q.id)}`}><b>{q.title}</b>
          {v ? <p>{v.text}</p> : <p className="dao-hint">還沒有寫下理解</p>}
          <span className="dao-meta"><span>{q.sources.length} 段來源</span><span>{q.versions.length} 次理解</span>{q.shuttles.length > 0 && <span className="dao-tag" data-k="織光杼">已開成織光杼</span>}{q.knowledge && <span className="dao-tag" data-k="知識">知識候選</span>}</span></Link>; })}
    </section>
  </>;
}

function SourcePicker({ exclude, name }: { exclude: string[]; name: string }) {
  const { sources, error } = useSources();
  const [q, setQ] = useState("");
  if (error) return <p className="form-error">{error}</p>;
  if (!sources) return <div className="dao-empty">正在讀取來源…</div>;
  const list = sources.filter((s) => !exclude.includes(s.id) && (!q || [s.idea, s.title, s.quote, s.source, s.location].join(" ").includes(q))).slice(0, 40);
  return <div className="dao-picker">
    <label>搜尋來源<input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="覺察、閱讀卡、野採卡片" /></label>
    {!sources.length && <div className="dao-empty">還沒有可以連結的來源。覺察存成正式紀錄、閱讀留下卡片、野採存成卡片後，會出現在這裡。</div>}
    {list.map((s) => <label key={s.id} className="dao-check"><input type="checkbox" name={name} value={s.id} /><span><span className="dao-meta"><Kind s={s} /><span>{[s.source, s.location].filter(Boolean).join(" · ")}</span></span><b>{s.idea || s.title}</b></span></label>)}
  </div>;
}
const checked = (name: string) => [...document.querySelectorAll<HTMLInputElement>(`input[name="${name}"]:checked`)].map((n) => n.value);

function NewQuestion({ onCreated }: { onCreated: (q: DaoQuestion) => void }) {
  const [title, setTitle] = useState(""), [understanding, setUnderstanding] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function save() {
    setBusy(true); setError("");
    try { onCreated((await post<{ question: DaoQuestion }>({ action: "create", title, understanding, sources: checked("dao-new-source") })).question); }
    catch (e) { setError(message(e)); setBusy(false); }
  }
  return <div className="dao-compose">
    <label>想繼續追問的事<textarea value={title} onChange={(e) => setTitle(e.target.value)} rows={2} placeholder="寫成一個問題，例如：努力什麼時候會變成逼迫自己？" /></label>
    <label>現在怎麼看（選填）<textarea value={understanding} onChange={(e) => setUnderstanding(e.target.value)} rows={3} placeholder="可以先留白，之後再寫" /></label>
    <details><summary>從哪些來源開始（選填）</summary><SourcePicker exclude={[]} name="dao-new-source" /></details>
    {error && <p className="form-error" role="alert">{error}</p>}
    <button type="button" className="primary" disabled={busy || !title.trim()} onClick={() => void save()}>{busy ? "保存中…" : "保存問題"}</button>
  </div>;
}

/* ---------- 長期問題頁 ---------- */
type Panel = "" | "understand" | "gpt" | "link" | "knowledge";
export function DaoQuestionPage({ id }: { id: string }) {
  const [q, setQ] = useState<DaoQuestion | null>(null);
  const [error, setError] = useState(""), [notice, setNotice] = useState(""), [busy, setBusy] = useState(false);
  const [panel, setPanel] = useState<Panel>("");
  const { byId, error: sourceError } = useSources();
  useEffect(() => { get<{ question: DaoQuestion }>(`?id=${encodeURIComponent(id)}`).then((r) => setQ(r.question)).catch((e) => setError(message(e))); }, [id]);
  const run = async (body: Record<string, unknown>, done: string) => {
    setBusy(true); setError(""); setNotice("");
    try { const r = await post<{ question: DaoQuestion }>({ ...body, id }); setQ(r.question); setPanel(""); setNotice(done); }
    catch (e) { setError(message(e)); } finally { setBusy(false); }
  };
  if (!q) return <section className="screen dao-workspace"><Link className="dao-link" href="/dao">‹ 回道藏</Link>{error ? <p className="form-error" role="alert">{error}</p> : <div className="dao-empty">正在讀取…</div>}</section>;
  const v = latestUnderstanding(q);
  const linked = q.sources.map((sid) => byId.get(sid) ?? null);
  return <section className="screen dao-workspace dao-question-page">
    <Link className="dao-link" href="/dao">‹ 回道藏</Link>
    <header className="card dao-section"><span className="dao-meta"><span className="dao-tag">長期問題</span><span>留下於 {day(q.createdAt)}</span></span><h1>{q.title}</h1>
      <div className="dao-row"><button type="button" className="primary" onClick={() => setPanel(panel === "gpt" ? "" : "gpt")}>接著和 GPT 想</button><button type="button" className="dao-soft" onClick={() => setPanel(panel === "understand" ? "" : "understand")}>記下新理解</button></div></header>
    {error && <p className="form-error" role="alert">{error}</p>}
    {notice && <p className="form-success" role="status">{notice}</p>}
    {panel === "understand" && <Understand q={q} busy={busy} onSave={(text, note) => run({ action: "version", text, note, from: "本人寫下" }, `已保存第 ${q.versions.length + 1} 次理解。`)} />}
    {panel === "gpt" && <ThinkWithGpt q={q} sources={q.sources.map((sid) => byId.get(sid)).filter((s): s is DaoSource => Boolean(s))} busy={busy}
      onSave={(text, note, from) => run({ action: "version", text, note, from }, `已保存第 ${q.versions.length + 1} 次理解。`)} />}
    <section className="card dao-section"><h2>我現在怎麼看</h2>
      {v ? <div className="dao-now"><span className="dao-meta"><span>第 {v.n} 次理解 · {day(v.at)}</span><span>{v.from}</span></span><p>{v.text}</p>{v.note && <p className="dao-hint">{v.note}</p>}</div>
        : <div className="dao-empty">還沒有寫下理解。可以先接著和 GPT 想，或直接記下你現在的看法。</div>}
      {q.versions.length > 1 && <details><summary>理解怎麼變過來的（{q.versions.length} 次）</summary>{q.versions.slice().reverse().map((x) =>
        <div key={x.n} className="dao-ver"><span className="dao-meta"><span>第 {x.n} 次 · {day(x.at)}</span><span>{x.from}</span></span><p>{x.text}</p>{x.note && <p className="dao-hint">{x.note}</p>}</div>)}</details>}
    </section>
    <section className="card dao-section">
      <div className="dao-row dao-between"><h2>有關的來源</h2><button type="button" className="dao-soft" onClick={() => setPanel(panel === "link" ? "" : "link")}>連結來源</button></div>
      {sourceError && <p className="form-error">{sourceError}</p>}
      {panel === "link" && <div className="dao-compose"><SourcePicker exclude={q.sources} name="dao-link-source" />
        <button type="button" className="primary" disabled={busy} onClick={() => { const ids = checked("dao-link-source"); if (ids.length) void run({ action: "link", sources: ids }, `已連結 ${ids.length} 段來源。`); }}>連結勾選的來源</button></div>}
      {!q.sources.length && <div className="dao-empty">還沒有連結來源。覺察、閱讀卡、野採卡片都可以連進來。</div>}
      {linked.map((s, i) => s ? <div key={s.id} className="dao-source"><span className="dao-meta"><Kind s={s} /><span>{[s.source, s.location].filter(Boolean).join(" · ")}</span></span><b>{s.idea || s.title}</b>
        {s.quote && s.quote !== s.idea && <div className={s.quoteLabel === "我的原話" ? "dao-mine" : "dao-quote"}><small>{s.quoteLabel || "原文"}</small>{s.quote}</div>}
        {s.basis && <p className="dao-hint">由來：回應「{s.basis}」</p>}
        <div className="dao-row">{s.url && <a className="dao-link" href={s.url}>回到原紀錄 ›</a>}<button type="button" className="dao-link" disabled={busy} onClick={() => void run({ action: "unlink", source: s.id }, "已取消連結。")}>取消連結</button></div></div>
        : <div key={q.sources[i]} className="dao-source dao-hint">這段來源目前讀不到，可能已被移除或設為私人。<button type="button" className="dao-link" onClick={() => void run({ action: "unlink", source: q.sources[i] }, "已取消連結。")}>取消連結</button></div>)}
    </section>
    <section className="card dao-section"><h2>去處</h2>
      <p className="dao-hint">理解想拿來創作，就開成織光杼；反覆驗證過、想長久使用，就升級成知識。兩者都保留回到這個問題的連結。</p>
      {q.shuttles.map((s) => <a key={s.id} className="dao-done" href={`/weaving/studio#shuttle/${encodeURIComponent(s.id)}`}>已開成織光杼「{s.title}」，打開這把杼 ›</a>)}
      {!q.shuttles.length && (v
        ? <a className="dao-wide" href={`/weaving/studio#dao/${encodeURIComponent(q.id)}`}>開成織光杼</a>
        : <p className="dao-hint">寫下至少一次理解後，就可以開成織光杼。</p>)}
      {q.knowledge ? <Link className="dao-done" href="/dao/knowledge">已升級成知識候選：{q.knowledge.statement} ›</Link>
        : v && <button type="button" className="dao-wide" onClick={() => setPanel(panel === "knowledge" ? "" : "knowledge")}>升級成知識</button>}
      {panel === "knowledge" && v && <ToKnowledge q={q} busy={busy} onSave={async (statement, boundary) => {
        setBusy(true); setError("");
        try { const r = await post<{ question: DaoQuestion }>({ action: "knowledge", id, statement, boundary }); setQ(r.question); setPanel(""); setNotice("已升級成知識候選，正式採用請到知識庫決定。"); }
        catch (e) { setError(message(e)); } finally { setBusy(false); }
      }} />}
    </section>
  </section>;
}

function Understand({ q, busy, onSave }: { q: DaoQuestion; busy: boolean; onSave: (text: string, note: string) => void }) {
  const [text, setText] = useState(""), [note, setNote] = useState("");
  const v = latestUnderstanding(q);
  return <section className="card dao-section dao-compose"><h2>記下新理解</h2><p className="dao-hint">舊的理解會保留，看得到它怎麼變過來。</p>
    {v && <div className="dao-now"><small>上一次的理解</small><p>{v.text}</p></div>}
    <label>我現在怎麼看<textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} /></label>
    <label>這次為什麼改變（選填）<textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></label>
    <button type="button" className="primary" disabled={busy || !text.trim()} onClick={() => onSave(text, note)}>保存這次理解</button></section>;
}

function ThinkWithGpt({ q, sources, busy, onSave }: { q: DaoQuestion; sources: DaoSource[]; busy: boolean; onSave: (text: string, note: string, from: string) => void }) {
  const [method, setMethod] = useState<DaoMethod>("ask");
  const [raw, setRaw] = useState(""), [parsed, setParsed] = useState<DaoReturn | null>(null), [pick, setPick] = useState(""), [own, setOwn] = useState(""), [tip, setTip] = useState("");
  const pkg = buildDaoPackage(q, sources, method);
  function save() {
    if (!parsed) return;
    if (pick === "own") { if (own.trim()) onSave(own, parsed.why.join(" "), "和 GPT 討論後，本人改寫"); return; }
    const [kind, index] = [pick[0], Number(pick.slice(1))];
    if (kind === "c" && parsed.candidates[index]) onSave(parsed.candidates[index].text, parsed.why.join(" "), "和 GPT 討論，採用候選（全為本人原話）");
    if (kind === "s" && parsed.said[index]) onSave(parsed.said[index].text, parsed.why.join(" "), "和 GPT 討論，採用本人原話");
  }
  return <section className="card dao-section dao-compose"><h2>接著和 GPT 想</h2>
    <label>這輪的問法<select value={method} onChange={(e) => setMethod(e.target.value as DaoMethod)}>{(Object.keys(DAO_METHODS) as DaoMethod[]).map((k) => <option key={k} value={k}>{DAO_METHODS[k].name}</option>)}</select></label>
    <p className="dao-hint">指令會帶上這個問題、你歷次的理解，以及 {sources.length} 段來源的出處與由來。</p>
    <button type="button" className="primary" onClick={() => void copy(pkg).then((ok) => setTip(ok ? "已複製。討論完說「可以收尾」，把結果貼回來。" : "這個瀏覽器不能自動複製，請展開全文手動複製。"))}>複製給 GPT 的指令</button>
    {tip && <p className="dao-hint" role="status">{tip}</p>}
    <details><summary>查看指令全文</summary><textarea className="dao-code" readOnly rows={10} value={pkg} /></details>
    <label>貼回 GPT 的收尾結果<textarea className="dao-code" rows={6} value={raw} onChange={(e) => setRaw(e.target.value)} placeholder={`從 ===${DAO_FORMAT}=== 開始，到 ===結束=== 為止`} /></label>
    <button type="button" className="dao-soft" disabled={!raw.trim()} onClick={() => { setParsed(parseDaoReturn(raw)); setPick(""); }}>檢查並列出候選</button>
    {parsed && (parsed.id && parsed.id !== q.id
      ? <p className="form-error">這份結果屬於另一個問題（{parsed.id}），沒有列出候選。</p>
      : !parsed.candidates.length && !parsed.said.length
        ? <p className="form-error">找不到候選理解。請確認 GPT 有照回傳格式輸出，標記行要照抄。</p>
        : <div className="dao-picks"><h3>挑一句成為新的理解</h3><p className="dao-hint">只有完全由你說過的話組成的候選，才能直接採用；其他的可以自己改寫。</p>
          {parsed.candidates.map((c, i) => { const ok = daoCandidateIsOwn(c.text, parsed.said);
            return <label key={"c" + i} className="dao-check"><input type="radio" name="dao-pick" disabled={!ok} checked={pick === "c" + i} onChange={() => setPick("c" + i)} /><span><span className="dao-meta"><span className="dao-tag">候選 #{c.n}</span>{c.uses && <span>{c.uses}</span>}<span className={ok ? "is-ok" : "is-bad"}>{ok ? "都是你說過的話" : "有你沒說過的字詞"}</span></span><b>{c.text}</b></span></label>; })}
          {parsed.said.map((s, i) => <label key={"s" + i} className="dao-check"><input type="radio" name="dao-pick" checked={pick === "s" + i} onChange={() => setPick("s" + i)} /><span><span className="dao-meta"><span className="dao-tag">我的原話 T{s.n}</span></span><b>{s.text}</b></span></label>)}
          <label className="dao-check"><input type="radio" name="dao-pick" checked={pick === "own"} onChange={() => setPick("own")} /><span><b>我自己改寫</b><textarea rows={2} value={own} onChange={(e) => { setOwn(e.target.value); setPick("own"); }} /></span></label>
          {parsed.gpt.length > 0 && <details><summary>GPT 的推論（{parsed.gpt.length}），尚未由你確認</summary><ul>{parsed.gpt.map((x, i) => <li key={i}>{x}</li>)}</ul></details>}
          <button type="button" className="primary" disabled={busy || !pick || (pick === "own" && !own.trim())} onClick={save}>保存成新的理解</button></div>)}
  </section>;
}

function ToKnowledge({ q, busy, onSave }: { q: DaoQuestion; busy: boolean; onSave: (statement: string, boundary: string) => void }) {
  const [statement, setStatement] = useState(latestUnderstanding(q)?.text ?? ""), [boundary, setBoundary] = useState("");
  return <div className="dao-compose"><p className="dao-hint">升級後成為知識庫裡的一條知識候選，正式採用仍由你在知識庫決定。{q.versions.length < 2 && "目前只有一次理解，建議回頭驗證過、理解至少更新一次後再升級。"}</p>
    <label>知識的說法<textarea rows={3} value={statement} onChange={(e) => setStatement(e.target.value)} /></label>
    <label>適用邊界：什麼情況下不成立、或還沒驗證<textarea rows={2} value={boundary} onChange={(e) => setBoundary(e.target.value)} /></label>
    <p className="dao-hint">依據會自動帶上：{q.versions.length} 次理解、{q.sources.length} 段來源。</p>
    <button type="button" className="primary" disabled={busy || !statement.trim()} onClick={() => onSave(statement, boundary)}>升級成知識候選</button></div>;
}

/* ---------- 完整心智圖 ---------- */
export function DaoMapPage() {
  const [questions, setQuestions] = useState<DaoQuestion[] | null>(null);
  const [error, setError] = useState(""), [tip, setTip] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [pick, setPick] = useState<MapPick>(null);
  const { byId } = useSources();
  useEffect(() => { get<{ questions: DaoQuestion[] }>().then((r) => setQuestions(r.questions)).catch((e) => setError(message(e))); }, []);
  const markdown = questions ? daoMindmapMarkdown(questions, byId) : "";
  return <section className="screen dao-workspace dao-map-page">
    <Link className="dao-link" href="/dao">‹ 回道藏</Link>
    <section className="card dao-section"><h1>知識心智圖</h1><p className="dao-hint">每個節點都能點開，看到原文、出處與由來。</p>
      <div className="dao-row"><button type="button" onClick={() => setOpen(Object.fromEntries((questions ?? []).map((q) => [q.id, true])))}>全部展開</button><button type="button" onClick={() => { setOpen({}); setPick(null); }}>全部收合</button></div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {questions ? <DaoMap questions={questions} byId={byId} compact={false} open={open} setOpen={setOpen} pick={pick} setPick={(p) => setPick(pick && JSON.stringify(pick) === JSON.stringify(p) ? null : p)} /> : !error && <div className="dao-empty">正在讀取…</div>}
    </section>
    <PickDetail pick={pick} onClose={() => setPick(null)} />
    <section className="card dao-section"><h2>帶走這張圖</h2><div className="dao-row">
      <button type="button" disabled={!markdown} onClick={() => void copy(markdown).then((ok) => setTip(ok ? "已複製 Markmap 格式。" : "請手動複製。"))}>複製大綱（Markmap 格式）</button>
      <button type="button" disabled={!markdown} onClick={() => void copy("/mindmap-zh --lang zh-Hant --render\n請把下面這份大綱畫成可互動的心智圖，保持原有層級與文字，不要增刪內容，使用繁體中文。\n\n" + markdown).then((ok) => setTip(ok ? "已複製給心智圖 Skill 的指令。" : "請手動複製。"))}>複製給心智圖 Skill 的指令</button>
    </div>{tip && <p className="dao-hint" role="status">{tip}</p>}</section>
  </section>;
}
