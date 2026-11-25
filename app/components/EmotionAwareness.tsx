"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useDojo } from "@/lib/dojo/store";
import {
  AWARENESS_METHODS, AWARENESS_METHOD_KEYS, awarenessMethodName, awarenessVersions,
  type AwarenessChecks, type AwarenessMethodChoice, type AwarenessRecord, type AwarenessSummary,
} from "@/lib/dojo/emotionAwareness";

type View = { record: AwarenessRecord; package: string; previous: AwarenessSummary | null };
type ReturnResult = { saved: boolean; checks: AwarenessChecks; rescue: string; view: View };
type Listing = { rounds: AwarenessSummary[]; all: AwarenessSummary[] };
type Choice = { from: "原話" | "整理版" | "改寫" | "略過"; text: string };

const API = "/api/dojo/emotion-awareness";
const EMOTION_KIND = "心／情";

async function readJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(body.error || `操作沒有完成（${response.status}）`);
  return body;
}
const post = <T,>(body: unknown) => fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(readJson<T>);

async function copy(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

function statusLabel(item: Pick<AwarenessSummary, "status" | "paused" | "archived">): string {
  if (item.archived) return "已封存";
  if (item.status === "open") return "還沒貼回";
  if (item.status === "returned") return item.paused ? "暫停中・待確認" : "已貼回・待確認";
  return item.paused ? "已存・當時暫停" : "已存成正式紀錄";
}

/**
 * 心・情覺察。多輪對話在 GPT 進行；道場產生討論包、核對貼回的紀錄，並只保存擁有者逐條確認過的內容。
 * 畫面只呈現單筆紀錄與彼此的連結，不做次數、趨勢或分數。
 */
export default function EmotionAwareness() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const mode = params.get("a") ?? "";
  const go = useCallback((query: Record<string, string>) => {
    const next = new URLSearchParams(query).toString();
    router.push(next ? `${pathname}?${next}` : pathname);
  }, [router, pathname]);

  if (mode === "new") return <Compose from={params.get("from") ?? ""} previousId={params.get("prev") ?? ""} go={go}/>;
  if (mode === "review") return <Review go={go}/>;
  if (mode) return <Round key={mode} id={mode} go={go}/>;
  return <Home go={go}/>;
}

function Home({ go }: { go: (query: Record<string, string>) => void }) {
  const { openQuickAdd } = useDojo();
  const [waiting, setWaiting] = useState<AwarenessSummary[]>([]);
  useEffect(() => {
    let live = true;
    fetch(API, { cache: "no-store" }).then(readJson<Listing>)
      .then((list) => { if (live) setWaiting(list.rounds.filter((item) => item.status !== "confirmed").slice(0, 3)); })
      .catch(() => undefined);
    return () => { live = false; };
  }, []);
  return <div className="awareness">
    <p>情緒覺察、感恩與心裡小語。</p>
    <div className="awareness-entries">
      <button className="card practice-link" onClick={() => openQuickAdd({ presetSpace: "practice", presetKind: EMOTION_KIND })}>
        <b>留下心／情紀錄</b><small>先把此刻記下來，之後想談再談。</small>
      </button>
      <button className="card practice-link" onClick={() => go({ a: "new" })}>
        <b>開始內在覺察</b><small>寫下來，帶著討論包去和 GPT 談，再把你確認的理解存回來。</small>
      </button>
      <button className="card practice-link" onClick={() => go({ a: "review" })}>
        <b>回顧覺察紀錄</b><small>依日期或關鍵字找回先前的覺察與原始書寫。</small>
      </button>
    </div>
    {waiting.length > 0 && <section className="awareness-block">
      <h2>還沒收尾的覺察</h2>
      {waiting.map((item) => <button className="card practice-link" key={item.id} onClick={() => go({ a: item.id })}>
        <b>{item.opening || "（沒有內容）"}</b><small>{item.date}・{statusLabel(item)}</small>
      </button>)}
    </section>}
  </div>;
}

function MethodPicker({ value, onChange }: { value: AwarenessMethodChoice; onChange: (value: AwarenessMethodChoice) => void }) {
  return <fieldset className="awareness-methods">
    <legend>覺察方式</legend>
    <label className={value === "auto" ? "on" : ""}>
      <input type="radio" name="awareness-method" checked={value === "auto"} onChange={() => onChange("auto")}/>
      <span><b>請 GPT 推薦</b><small>它讀完你的書寫後會建議一種，你可以接受、換一種，或自由聊。</small></span>
    </label>
    {AWARENESS_METHOD_KEYS.map((key) => {
      const method = AWARENESS_METHODS[key];
      return <label key={key} className={value === key ? "on" : ""}>
        <input type="radio" name="awareness-method" checked={value === key} onChange={() => onChange(key)}/>
        <span><b>{method.name}</b><small>適合：{method.fits}</small><small className="awareness-term">{method.term}</small></span>
      </label>;
    })}
  </fieldset>;
}

function Compose({ from, previousId, go }: { from: string; previousId: string; go: (query: Record<string, string>) => void }) {
  const { entries } = useDojo();
  const emotionEntries = useMemo(() => entries.filter((entry) => entry.space === "practice" && entry.kind === EMOTION_KIND).slice(0, 8), [entries]);
  const [writing, setWriting] = useState("");
  const [sourceEntryId, setSourceEntryId] = useState("");
  const [method, setMethod] = useState<AwarenessMethodChoice>("auto");
  const [previous, setPrevious] = useState<View | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const startFromEntry = useCallback((id: string) => {
    const entry = entries.find((item) => item.id === id);
    if (!entry) return;
    setSourceEntryId(id);
    setWriting([entry.title, entry.note].filter(Boolean).join("\n"));
  }, [entries]);
  // Arriving with ?from=<entry id> starts from that entry once the entries have loaded.
  useEffect(() => {
    if (!from || sourceEntryId || writing) return;
    const timer = window.setTimeout(() => startFromEntry(from), 0);
    return () => window.clearTimeout(timer);
  }, [from, sourceEntryId, writing, startFromEntry]);
  useEffect(() => {
    if (!previousId) return;
    let live = true;
    fetch(`${API}?id=${encodeURIComponent(previousId)}`, { cache: "no-store" }).then(readJson<View>)
      .then((loaded) => { if (live) { setPrevious(loaded); setWriting((current) => current || loaded.record.writing); } })
      .catch((caught) => { if (live) setError(caught instanceof Error ? caught.message : String(caught)); });
    return () => { live = false; };
  }, [previousId]);

  async function start() {
    setBusy(true); setError("");
    try {
      const created = await post<View>({ action: "create", writing, method, sourceEntryId, previousId });
      go({ a: created.record.id });
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); setBusy(false); }
  }

  return <div className="awareness">
    <button className="awareness-back" onClick={() => go({})}>← 回心・情</button>
    <h2>開始內在覺察</h2>
    {previous && <p className="awareness-note">這一輪接續 {previous.record.date} 的覺察。上次你說過的話與還沒回答的問題會放進討論包，GPT 不會重問。</p>}
    {!previous && emotionEntries.length > 0 && <details className="awareness-block">
      <summary>從最近的心／情紀錄開始</summary>
      {emotionEntries.map((entry) => <button className={`card practice-link ${sourceEntryId === entry.id ? "on" : ""}`} key={entry.id} onClick={() => startFromEntry(entry.id)}>
        <b>{entry.title}</b><small>{entry.date}</small>
      </button>)}
    </details>}
    <label className="awareness-field">想寫什麼就寫什麼
      <textarea className="field" rows={9} value={writing} onChange={(event) => { setWriting(event.target.value); }} placeholder="發生了什麼、現在的感受、腦中一直轉的那句話……不用整理，照你想到的寫。"/>
    </label>
    <p className="awareness-hint">這段文字會逐字保存，也會原封不動放進討論包。{sourceEntryId ? "原本的心／情紀錄不會被更動。" : ""}</p>
    <MethodPicker value={method} onChange={setMethod}/>
    {error && <p role="alert" className="awareness-problem">{error}</p>}
    <div className="awareness-actions">
      <button className="primary" disabled={busy || !writing.trim()} onClick={() => void start()}>{busy ? "儲存中…" : "存下來，產生討論包"}</button>
    </div>
  </div>;
}

function Round({ id, go }: { id: string; go: (query: Record<string, string>) => void }) {
  const [view, setView] = useState<View | null>(null);
  const [all, setAll] = useState<AwarenessSummary[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPackage, setShowPackage] = useState(false);
  const [pasted, setPasted] = useState("");
  const [result, setResult] = useState<ReturnResult | null>(null);
  const [choices, setChoices] = useState<Record<number, Choice>>({});
  const [facts, setFacts] = useState<number[]>([]);
  const [rewrites, setRewrites] = useState<Record<number, string>>({});
  const [showTalk, setShowTalk] = useState(false);
  const [linkTarget, setLinkTarget] = useState("");

  const adopt = useCallback((loaded: View) => {
    setView(loaded);
    const record = loaded.record;
    const failed = new Set(record.checks.words.filter((check) => !check.ok).map((check) => check.n));
    setChoices(Object.fromEntries(record.understandings.map((item) => {
      const taken = record.confirmed?.understandings.find((entry) => entry.sourceN === item.n);
      if (taken) return [item.n, { from: taken.from === "改寫自GPT假設" ? "改寫" : taken.from, text: taken.from === "改寫" ? taken.text : "" } as Choice];
      // Words that failed the verbatim check start as skipped; GPT's wording is never the default.
      return [item.n, { from: record.confirmed || failed.has(item.n) ? "略過" : "原話", text: "" } as Choice];
    })));
    setFacts(record.confirmed ? record.facts.flatMap((fact, index) => record.confirmed!.facts.includes(fact.text) ? [index] : []) : []);
    setRewrites({});
  }, []);

  useEffect(() => {
    let live = true;
    Promise.all([
      fetch(`${API}?id=${encodeURIComponent(id)}`, { cache: "no-store" }).then(readJson<View>),
      fetch(API, { cache: "no-store" }).then(readJson<Listing>).catch(() => ({ rounds: [], all: [] })),
    ]).then(([loaded, list]) => { if (live) { adopt(loaded); setAll(list.all); } })
      .catch((caught) => { if (live) setError(caught instanceof Error ? caught.message : String(caught)); });
    return () => { live = false; };
  }, [id, adopt]);

  async function run<T>(task: () => Promise<T>, done?: (value: T) => void) {
    setBusy(true); setError(""); setNotice("");
    try { const value = await task(); done?.(value); }
    catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
    finally { setBusy(false); }
  }

  if (!view) return <div className="awareness">
    <button className="awareness-back" onClick={() => go({})}>← 回心・情</button>
    {error ? <p role="alert" className="awareness-problem">{error}</p> : <p>讀取中…</p>}
  </div>;

  const record = view.record;
  const versions = awarenessVersions(record.id, all);
  const linked = all.filter((item) => record.linkedIds.includes(item.id));
  const linkable = all.filter((item) => item.id !== record.id && !record.linkedIds.includes(item.id) && !item.archived).slice(0, 30);
  const wordsCheck = (n: number) => record.checks.words.find((check) => check.n === n);

  const copyPackage = () => void copy(view.package).then((ok) => {
    setShowPackage(true);
    setNotice(ok ? "討論包已複製。貼到 GPT 開始；想結束時說「可以收尾」，想中斷時說「先暫停」，再把它輸出的紀錄貼回這裡。" : "這個瀏覽器不允許自動複製，請在下方長按全選後複製。");
  });
  const pasteBack = () => void run(() => post<ReturnResult>({ action: "return", id: record.id, raw: pasted }), (value) => {
    setResult(value);
    if (value.saved) { adopt(value.view); setPasted(""); setNotice("已收到討論紀錄。下面每一條都要你決定，沒有按「存成正式紀錄」之前不會成為正式內容。"); }
  });
  const confirm = () => void run(() => post<View>({
    action: "confirm", id: record.id,
    decision: {
      understandings: (Object.entries(choices) as [string, Choice][]).flatMap(([n, choice]) => choice.from === "略過" ? [] : [{ n: Number(n), from: choice.from, text: choice.text }]),
      facts,
      rewrites: (Object.entries(rewrites) as [string, string][]).map(([index, text]) => ({ index: Number(index), text })),
    },
  }), (value) => { adopt(value); setNotice("已存成正式紀錄。"); });
  const simple = (body: Record<string, unknown>, message: string) => void run(() => post<View>({ ...body, id: record.id }), (value) => { adopt(value); setNotice(message); });
  const remove = () => {
    if (!window.confirm("刪除後這筆覺察會從行光道場移除，Notion 的垃圾桶仍會暫時保留。要刪除嗎？")) return;
    void run(() => post<{ ok: boolean }>({ action: "delete", id: record.id }), () => go({ a: "review" }));
  };

  return <div className="awareness">
    <button className="awareness-back" onClick={() => go({ a: "review" })}>← 回顧覺察紀錄</button>
    <h2>{record.date} 的覺察</h2>
    <p className="awareness-status"><span>{statusLabel(record)}</span><span>{awarenessMethodName(record)}</span></p>
    {view.previous && <button className="awareness-inline" onClick={() => go({ a: view.previous!.id })}>接續自 {view.previous.date} 的覺察 →</button>}
    {notice && <p role="status" className="awareness-note">{notice}</p>}
    {error && <p role="alert" className="awareness-problem">{error}</p>}

    <section className="awareness-block">
      <h3>你的書寫</h3>
      <p className="awareness-writing">{record.writing}</p>
      {record.sourceEntryId && <small>起點是一筆心／情紀錄，原紀錄沒有被更動。</small>}
    </section>

    {record.status === "open" && <section className="awareness-block is-package">
      <h3>帶著討論包去和 GPT 談</h3>
      <p>討論包只包含上面這段書寫{view.previous ? "、上一次你說過的話與還沒回答的問題" : ""}，以及討論規則。複製前可以先看全文。</p>
      <div className="awareness-actions">
        <button className="primary" disabled={!view.package} onClick={copyPackage}>複製討論包</button>
        <button onClick={() => setShowPackage((open) => !open)}>{showPackage ? "收起全文" : "先看全文"}</button>
      </div>
      {showPackage && <textarea className="field awareness-package" readOnly rows={12} value={view.package}/>}
    </section>}

    {record.status !== "confirmed" && <section className="awareness-block is-return">
      <h3>{record.status === "open" ? "把 GPT 輸出的紀錄貼回來" : "重新貼回（會取代目前的討論紀錄）"}</h3>
      <textarea className="field" rows={6} value={pasted} onChange={(event) => setPasted(event.target.value)} placeholder="說「可以收尾」或「先暫停」後，把 GPT 輸出的整段紀錄貼在這裡。"/>
      <div className="awareness-actions"><button className="primary" disabled={busy || !pasted.trim()} onClick={pasteBack}>{busy ? "核對中…" : "貼回並核對"}</button></div>
      {result && !result.saved && <div className="awareness-problem">
        <b>這份紀錄還沒有存進來，你貼的文字仍保留在上方。</b>
        {!result.checks.idOk && <p>討論包 ID 對不上，這可能是另一輪的紀錄。</p>}
        {result.checks.missing.length > 0 && <p>缺少：{result.checks.missing.join("、")}</p>}
        {result.rescue && <><p>可以把下面這段話貼給 GPT，請它重新輸出：</p><textarea className="field" readOnly rows={3} value={result.rescue}/><button onClick={() => void copy(result.rescue)}>複製這段話</button></>}
      </div>}
    </section>}

    {record.status !== "open" && <>
      {record.paused && record.unanswered.length > 0 && <section className="awareness-block is-open">
        <h3>還沒回答的問題</h3>
        <ul>{record.unanswered.map((question, index) => <li key={index}>{question}</li>)}</ul>
        <button onClick={() => go({ a: "new", prev: record.id })}>接續這一輪，再談一次</button>
      </section>}

      <section className="awareness-block is-mine">
        <h3>你親口說的理解</h3>
        {record.understandings.length === 0 && <p>這次沒有整理出你的理解。</p>}
        {record.understandings.map((item) => {
          const check = wordsCheck(item.n);
          const choice = choices[item.n] ?? { from: "略過", text: "" };
          const locked = record.status === "confirmed";
          const set = (from: Choice["from"]) => setChoices((current) => ({ ...current, [item.n]: { from, text: current[item.n]?.text ?? "" } }));
          return <article className="awareness-item" key={item.n}>
            <blockquote>{item.words}</blockquote>
            <small className={check?.ok === false ? "is-fail" : "is-ok"}>{check?.ok === false ? `逐字核對沒有通過：${check.note}` : check?.note || `逐字出自你在 T${item.turn} 說的話`}</small>
            {item.tidy && <p className="awareness-tidy"><span>GPT 整理版</span>{item.tidy}</p>}
            <div className="row" role="group" aria-label={`第 ${item.n} 則理解要怎麼處理`}>
              <button disabled={locked || check?.ok === false} className={choice.from === "原話" ? "on" : ""} onClick={() => set("原話")}>用我的原話</button>
              {item.tidy && <button disabled={locked} className={choice.from === "整理版" ? "on" : ""} onClick={() => set("整理版")}>用整理版</button>}
              <button disabled={locked} className={choice.from === "改寫" ? "on" : ""} onClick={() => set("改寫")}>我自己改寫</button>
              <button disabled={locked} className={choice.from === "略過" ? "on" : ""} onClick={() => set("略過")}>略過</button>
            </div>
            {choice.from === "改寫" && <textarea className="field" rows={2} disabled={locked} value={choice.text} onChange={(event) => setChoices((current) => ({ ...current, [item.n]: { from: "改寫", text: event.target.value } }))} placeholder="用你自己的話寫下這個理解"/>}
          </article>;
        })}
      </section>

      {record.facts.length > 0 && <section className="awareness-block is-fact">
        <h3>客觀事實</h3>
        <p>只勾選你確定是事實的。</p>
        {record.facts.map((fact, index) => <label className="awareness-check" key={index}>
          <input type="checkbox" disabled={record.status === "confirmed"} checked={facts.includes(index)} onChange={(event) => setFacts((current) => event.target.checked ? [...current, index] : current.filter((item) => item !== index))}/>
          <span>{fact.text}{record.checks.looseFacts.includes(index) && <small>（GPT 沒有標明出自你的哪一句話）</small>}</span>
        </label>)}
      </section>}

      {record.assumptions.length > 0 && <section className="awareness-block is-guess">
        <h3>GPT 的假設</h3>
        <p>這些是 GPT 自己的推測，不是你說的，也不會自動變成你的理解。覺得有道理的，請用自己的話改寫。</p>
        {record.assumptions.map((guess, index) => <article className="awareness-item" key={index}>
          <p>{guess}</p>
          {record.status !== "confirmed" && <textarea className="field" rows={2} value={rewrites[index] ?? ""} onChange={(event) => setRewrites((current) => ({ ...current, [index]: event.target.value }))} placeholder="如果這說中了什麼，用你自己的話寫下來；沒有就留空"/>}
        </article>)}
      </section>}

      {record.status === "returned" && <div className="awareness-actions is-sticky">
        <button className="primary" disabled={busy} onClick={confirm}>{busy ? "儲存中…" : "存成正式紀錄"}</button>
      </div>}

      {record.confirmed && <section className="awareness-block is-saved">
        <h3>正式紀錄</h3>
        <ul>{record.confirmed.understandings.map((item, index) => <li key={index}>{item.text}<small>（{item.from}）</small>
          <a className="awareness-weave" href={`/weaving/studio#card/awareness:${record.id}:${index}`}>帶去織光堂，做成織光杼</a></li>)}</ul>
        {record.confirmed.facts.length > 0 && <><h4>事實</h4><ul>{record.confirmed.facts.map((fact, index) => <li key={index}>{fact}</li>)}</ul></>}
      </section>}

      <section className="awareness-block">
        <button className="awareness-inline" onClick={() => setShowTalk((open) => !open)}>{showTalk ? "收起完整討論紀錄" : "看完整討論紀錄"}</button>
        {showTalk && <div className="awareness-talk">
          {record.gptTurnsOmitted && <p className="awareness-hint">這次討論太長，GPT 的發言沒有保存；你的發言都在。</p>}
          {record.turns.map((turn) => <p key={turn.n} className={turn.who === "我" ? "is-me" : "is-gpt"}><b>T{turn.n}・{turn.who}</b>{turn.text || "（未保存）"}</p>)}
        </div>}
      </section>
    </>}

    {versions.length > 1 && <section className="awareness-block">
      <h3>這個覺察的前後版本</h3>
      {versions.map((item) => <button className={`card practice-link ${item.id === record.id ? "on" : ""}`} key={item.id} disabled={item.id === record.id} onClick={() => go({ a: item.id })}>
        <b>{item.date}{item.id === record.id ? "（目前這一筆）" : ""}</b><small>{item.opening}</small>
      </button>)}
    </section>}

    <section className="awareness-block">
      <h3>連結到其他覺察</h3>
      {linked.map((item) => <div className="awareness-linked" key={item.id}>
        <button className="awareness-inline" onClick={() => go({ a: item.id })}>{item.date}・{item.opening}</button>
        <button disabled={busy} onClick={() => simple({ action: "link", otherId: item.id, linked: false }, "已取消連結。")}>取消</button>
      </div>)}
      {linkable.length > 0 && <div className="awareness-link-add">
        <select className="field" value={linkTarget} onChange={(event) => setLinkTarget(event.target.value)}>
          <option value="">選一筆覺察</option>
          {linkable.map((item) => <option key={item.id} value={item.id}>{item.date}・{item.opening.slice(0, 24)}</option>)}
        </select>
        <button disabled={busy || !linkTarget} onClick={() => { simple({ action: "link", otherId: linkTarget, linked: true }, "已連結。"); setLinkTarget(""); }}>連結</button>
      </div>}
    </section>

    <section className="awareness-block awareness-manage">
      {record.status !== "open" && <button disabled={busy} onClick={() => go({ a: "new", prev: record.id })}>用這筆再開一輪</button>}
      {record.status === "confirmed" && <button disabled={busy} onClick={() => simple({ action: "reopen" }, "已回到確認畫面，可以重新選擇後再存。")}>重新確認</button>}
      <button disabled={busy} onClick={() => simple({ action: "archive", archived: !record.archived }, record.archived ? "已重新開啟。" : "已封存，可在回顧的「已封存」找到。")}>{record.archived ? "重新開啟" : "封存"}</button>
      <button disabled={busy} className="is-danger" onClick={remove}>刪除</button>
    </section>
  </div>;
}

function Review({ go }: { go: (query: Record<string, string>) => void }) {
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [archived, setArchived] = useState(false);
  const [list, setList] = useState<AwarenessSummary[] | null>(null);
  const [error, setError] = useState("");

  // The keyword applies when the form is submitted; dates and the archive switch apply at once.
  const [applied, setApplied] = useState("");
  const load = useCallback(() => {
    const query = new URLSearchParams({ q: applied, ...(from ? { from } : {}), ...(to ? { to } : {}), ...(archived ? { archived: "1" } : {}) });
    setError("");
    fetch(`${API}?${query}`, { cache: "no-store" }).then(readJson<Listing>)
      .then((loaded) => setList([...loaded.rounds].sort((a, b) => Number(a.status === "confirmed") - Number(b.status === "confirmed") || b.date.localeCompare(a.date))))
      .catch((caught) => setError(caught instanceof Error ? caught.message : String(caught)));
  }, [applied, from, to, archived]);
  useEffect(() => { const timer = window.setTimeout(load, 0); return () => window.clearTimeout(timer); }, [load]);

  return <div className="awareness">
    <button className="awareness-back" onClick={() => go({})}>← 回心・情</button>
    <h2>回顧覺察紀錄</h2>
    <form className="awareness-filter" onSubmit={(event) => { event.preventDefault(); if (applied === q.trim()) load(); else setApplied(q.trim()); }}>
      <label>關鍵字<input className="field" value={q} onChange={(event) => setQ(event.target.value)} placeholder="找你寫過或確認過的話"/></label>
      <div className="awareness-dates">
        <label>從<input className="field" type="date" value={from} onChange={(event) => setFrom(event.target.value)}/></label>
        <label>到<input className="field" type="date" value={to} onChange={(event) => setTo(event.target.value)}/></label>
      </div>
      <div className="awareness-actions">
        <button className="primary" type="submit">尋找</button>
        <button type="button" className={archived ? "on" : ""} onClick={() => setArchived((value) => !value)}>{archived ? "看未封存的" : "看已封存的"}</button>
      </div>
    </form>
    {error && <p role="alert" className="awareness-problem">{error}</p>}
    {list === null && !error && <p>讀取中…</p>}
    {list?.length === 0 && <p>{archived ? "沒有封存的覺察。" : "還沒有符合的覺察紀錄。"}</p>}
    {list?.map((item) => <button className="card practice-link" key={item.id} onClick={() => go({ a: item.id })}>
      <b>{item.opening || "（沒有內容）"}</b>
      <small>{item.date}・{item.method}・{statusLabel(item)}</small>
    </button>)}
  </div>;
}
