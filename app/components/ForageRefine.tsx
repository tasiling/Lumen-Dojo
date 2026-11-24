"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { REFINE_ANGLES, REFINE_MAX_SOURCES, type RefineAngleKey, type RefineCardType, type RefineChecks } from "@/lib/dojo/captureRefine";
import type { CaptureEntry } from "@/lib/dojo/formal";
import {
  captureOriginal, originalStateLabel, refineCardTypes, refineDefaultCardType, refineLeftOut, refineOwnTurn,
  type RefinePick, type RefineRecord, type RefineTitleFrom,
} from "@/lib/dojo/refineRecord";

type RefineView = { record: RefineRecord; package: string; changed: string[]; unsegmented: string[]; missing: string[] };
type ReturnResult = { saved: boolean; checks: RefineChecks; rescue: string; view: RefineView };

const API = "/api/dojo/refine";
const STATUS_LABELS: Record<RefineRecord["status"], string> = { open: "討論中", returned: "已貼回", closed: "已結束" };

async function readJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(body.error || `操作沒有完成（${response.status}）`);
  return body;
}
const post = <T,>(body: unknown) => fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(readJson<T>);

async function copy(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

/**
 * 一輪淬鍊：設定、討論包、貼回與檢查、候選。道場不呼叫 AI；它產生討論包、核對貼回的紀錄，並保存擁有者的挑選。
 * 挑選後的候選存成 DB-22 洞察卡片庫的卡片，由織光堂與道藏取用。
 */
export default function ForageRefine({ roundId, captureIds }: { roundId: string; captureIds: string[] }) {
  const router = useRouter();
  const [captures, setCaptures] = useState<CaptureEntry[]>([]);
  const [view, setView] = useState<RefineView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [topic, setTopic] = useState("");
  const [angle, setAngle] = useState<RefineAngleKey>("understand");
  const [chosen, setChosen] = useState<string[]>(captureIds.slice(0, REFINE_MAX_SOURCES));
  const [offered, setOffered] = useState<string[]>(captureIds);
  const [packageFallback, setPackageFallback] = useState(false);
  const [pasted, setPasted] = useState("");
  const [result, setResult] = useState<ReturnResult | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const list = await readJson<{ captures: CaptureEntry[] }>(await fetch("/api/dojo/captures", { cache: "no-store" }));
      setCaptures(list.captures ?? []);
      if (roundId) {
        const loaded = await readJson<RefineView>(await fetch(`${API}?id=${encodeURIComponent(roundId)}`, { cache: "no-store" }));
        setView(loaded);
        setTopic(loaded.record.topic); setAngle(loaded.record.angle);
        setChosen(loaded.record.sources.map((source) => source.captureId));
        setOffered(loaded.record.offeredCaptureIds);
      }
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
    finally { setLoading(false); }
  }, [roundId]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);

  const byId = useMemo(() => new Map(captures.map((capture) => [capture.id, capture])), [captures]);
  const record = view?.record ?? null;
  const editable = !record || record.status === "open";
  const addable = captures.filter((capture) => !chosen.includes(capture.id) && capture.status !== "faded");

  async function run(task: () => Promise<void>) {
    setBusy(true); setError(""); setNotice("");
    try { await task(); } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
    finally { setBusy(false); }
  }

  function saveSetup() {
    void run(async () => {
      if (record) {
        setView(await post<RefineView>({ action: "configure", id: record.id, topic, angle, captureIds: chosen }));
        setNotice("已更新這一輪的設定。請重新複製討論包。");
      } else {
        const created = await post<RefineView>({ action: "create", topic, angle, captureIds: chosen, offeredCaptureIds: offered });
        setView(created);
        router.replace(`/forage/refine?id=${encodeURIComponent(created.record.id)}`, { scroll: false });
        setNotice("已建立這一輪。下一步：複製討論包到 GPT。");
      }
    });
  }

  async function copyPackage() {
    if (!view) return;
    const ok = await copy(view.package);
    setPackageFallback(!ok);
    setNotice(ok ? "討論包已複製。貼到 GPT 開始討論；說「可以收尾」時 GPT 會輸出紀錄。" : "");
    if (!ok) setError("瀏覽器無法直接複製，請在下方文字框全選複製。");
  }

  function submitReturn() {
    if (!record) return;
    if (record.picks.length && !window.confirm("重新貼回會清除目前挑選的候選，要繼續嗎？")) return;
    void run(async () => {
      const returned = await post<ReturnResult>({ action: "return", id: record.id, raw: pasted });
      setResult(returned); setView(returned.view);
      if (returned.saved) { setPasted(""); setNotice("已保存這份討論紀錄。下方可以挑選候選。"); }
    });
  }

  function pick(candidateN: number, titleFrom: RefineTitleFrom | null, title = "", cardType?: RefineCardType) {
    if (!record) return;
    void run(async () => { setView(await post<RefineView>({ action: "pick", id: record.id, candidateN, titleFrom, title, cardType })); });
  }

  /** Saves picked candidates as cards one at a time, so a failure keeps the ones already saved. */
  function adopt(candidateNs: number[]) {
    if (!record) return;
    void run(async () => {
      let saved = 0;
      for (const candidateN of candidateNs) {
        setView(await post<RefineView>({ action: "adopt", id: record.id, candidateN }));
        saved++;
      }
      setNotice(`已存成 ${saved} 張卡片，在 Notion 的 DB-22 洞察卡片庫。`);
    });
  }

  function close() {
    const unsaved = record ? record.picks.filter((p) => !record.adopted.some((a) => a.candidateN === p.candidateN)).length : 0;
    if (!record || !window.confirm(unsaved
      ? `還有 ${unsaved} 則挑選了但沒有存成卡片，結束後就不能再存。要結束嗎？`
      : "結束後這一輪就不能再貼回或更改挑選。要結束嗎？")) return;
    void run(async () => { setView(await post<RefineView>({ action: "close", id: record.id })); setNotice("這一輪已結束。"); });
  }

  if (loading) return <div className="empty">正在打開淬鍊…</div>;

  const checks = result?.checks ?? (record?.status !== "open" ? record?.checks : undefined);
  const failedQuotes = checks?.quotes.filter((check) => !check.ok || check.note) ?? [];
  const failedWords = checks?.words.filter((check) => !check.ok || check.note) ?? [];
  const allMatch = (list: { ok: boolean }[]) => list.every((check) => check.ok);
  // The four stops of a round. A stop is a link once its section is on the page.
  const steps = [
    { id: "refine-setup", name: "設定", ready: true, current: !record },
    { id: "refine-package", name: "討論包", ready: Boolean(view), current: record?.status === "open" },
    { id: "refine-return", name: "貼回", ready: Boolean(record && record.status !== "closed" && !record.adopted.length), current: false },
    { id: "refine-candidates", name: "候選", ready: Boolean(record && record.status !== "open"), current: Boolean(record && record.status !== "open") },
  ];

  return (
    <section className="forage-refine" aria-label="野採淬鍊">
      <div className="forage-refine-nav">
        <Link href="/forage/captures">返回採集匣</Link>
        {record && <span>{record.id}・{STATUS_LABELS[record.status]}</span>}
      </div>
      <nav className="refine-steps" aria-label="淬鍊步驟">
        {steps.map((step) => step.ready
          ? <a key={step.id} href={`#${step.id}`} aria-current={step.current ? "step" : undefined}>{step.name}</a>
          : <span key={step.id} aria-disabled="true">{step.name}</span>)}
      </nav>
      {error && <p className="form-error" role="alert">{error}</p>}
      {notice && <p className="form-success" role="status">{notice}</p>}

      <section className="refine-step is-setup" aria-labelledby="refine-setup">
        <span className="refine-eyebrow">所拾</span>
        <h2 id="refine-setup">設定這一輪</h2>
        <label htmlFor="refine-topic">本輪題目</label>
        <textarea id="refine-topic" className="field" rows={2} value={topic} disabled={!editable} onChange={(event) => setTopic(event.target.value)} placeholder="例如：焦慮能不能幫助一個人努力？" />
        {!editable && <p className="refine-note">出題角度：{REFINE_ANGLES[angle].name}</p>}
        {editable && <fieldset>
          <legend>出題角度</legend>
          <div className="refine-angles">
            {(Object.keys(REFINE_ANGLES) as RefineAngleKey[]).map((key) => <button type="button" key={key} className={angle === key ? "on" : ""} aria-pressed={angle === key} onClick={() => setAngle(key)}>
              <b>{REFINE_ANGLES[key].name}</b><small>{REFINE_ANGLES[key].text}</small>
            </button>)}
          </div>
        </fieldset>}
        <fieldset disabled={!editable}>
          <legend>帶入的採集（{chosen.length}／{REFINE_MAX_SOURCES}）</legend>
          <ol className="refine-sources">
            {chosen.map((id, index) => {
              const capture = byId.get(id);
              const original = capture ? captureOriginal(capture) : null;
              return <li key={id}>
                <span className="refine-label">C{index + 1}</span>
                <span><b>{capture?.title ?? "找不到這則採集"}</b>{original && <small className={`refine-original is-${original.state}`}>{original.kind || "—"}・{originalStateLabel(original.state)}</small>}</span>
                {editable && <button type="button" onClick={() => setChosen(chosen.filter((item) => item !== id))} aria-label={`移除 C${index + 1}`}>移除</button>}
              </li>;
            })}
          </ol>
          {editable && chosen.length < REFINE_MAX_SOURCES && addable.length > 0 && <select className="field" value="" aria-label="加入其他採集" onChange={(event) => {
            const id = event.target.value;
            if (!id) return;
            setChosen([...chosen, id]); setOffered([...new Set([...offered, id])]);
          }}>
            <option value="">加入其他採集…</option>
            {addable.map((capture) => {
              const original = captureOriginal(capture);
              return <option key={capture.id} value={capture.id} disabled={original.state === "none"}>{capture.title.slice(0, 40)}{original.state === "none" ? "（沒有原文，請先補全文）" : original.state === "ok" ? "" : `（${originalStateLabel(original.state)}）`}</option>;
            })}
          </select>}
          {chosen.some((id) => byId.get(id) && captureOriginal(byId.get(id)!).state === "none") && <p className="form-error">有採集沒有原文，不能帶入。請先在素材頁補上全文，或移除它。</p>}
        </fieldset>
        {editable && <button type="button" className="primary" disabled={busy || !topic.trim() || !chosen.length} onClick={saveSetup}>{busy ? "保存中…" : record ? "更新設定" : "建立這一輪"}</button>}
        {!editable && <p className="field-help">已經貼回討論紀錄，設定不能再改。要換題目或素材，請另開一輪。</p>}
      </section>

      {view && <section className="refine-step is-package" aria-labelledby="refine-package">
        <span className="refine-eyebrow">帶去討論</span>
        <h2 id="refine-package">討論包</h2>
        {view.unsegmented.length > 0 && <p className="refine-note">{view.unsegmented.join("、")} 的原文存成一整行，這裡暫時依句號切段；段落編號只在這一輪有效。</p>}
        {view.changed.length > 0 && <p className="refine-note">{view.changed.join("、")} 的原文在這一輪設定之後變動過，討論包與檢查都用目前的原文。</p>}
        {view.missing.length > 0 && <p className="form-error">{view.missing.join("、")} 的採集已被移除或沒有原文了，討論包裡不含它。</p>}
        <p>複製後貼到 GPT 開始討論。討論完說「可以收尾」，GPT 會依格式輸出整場紀錄。</p>
        <button type="button" className="primary" disabled={!view.package} onClick={() => void copyPackage()}>複製討論包</button>
        <details open={packageFallback}><summary>查看討論包全文</summary><textarea className="field" rows={10} readOnly value={view.package} aria-label="討論包全文" /></details>
      </section>}

      {record && record.status !== "closed" && !record.adopted.length && <section className="refine-step is-return" aria-labelledby="refine-return">
        <span className="refine-eyebrow">貼回</span>
        <h2 id="refine-return">貼回與檢查</h2>
        <p>把 GPT 收尾時輸出的整段紀錄貼在這裡。道場只檢查、不修改內容。</p>
        <label htmlFor="refine-paste">GPT 的收尾紀錄</label>
        <textarea id="refine-paste" className="field" rows={8} value={pasted} onChange={(event) => setPasted(event.target.value)} placeholder="從 ===野採討論/v2=== 開始，到 ===結束=== 為止" />
        <button type="button" className="primary" disabled={busy || !pasted.trim()} onClick={submitReturn}>{busy ? "檢查中…" : "檢查並保存"}</button>
      </section>}

      {checks && <section className="refine-step refine-checks" aria-labelledby="refine-checks">
        <span className="refine-eyebrow">核對</span>
        <h2 id="refine-checks">檢查結果</h2>
        {result && !result.checks.idOk && <p className="form-error" role="alert">這份紀錄不屬於這一輪，沒有保存。{result.checks.idNote}</p>}
        {checks.missing.length > 0 && <div className="refine-problem">
          <b>回傳不完整，沒有保存</b>
          <p>缺少：{checks.missing.join("、")}</p>
          {result?.rescue && <><textarea className="field" rows={4} readOnly value={result.rescue} aria-label="補救指令" /><button type="button" onClick={() => void copy(result.rescue).then((ok) => setNotice(ok ? "補救指令已複製，貼回 GPT 請它重新輸出。" : "請手動複製補救指令。"))}>複製補救指令</button></>}
        </div>}
        {checks.turnGaps.length > 0 && <p className="refine-note">逐字問答的編號不連續：{checks.turnGaps.join("；")}</p>}
        <p className="refine-summary">
          <span className={allMatch(checks.quotes) ? "is-pass" : "is-fail"}>原文引用 {checks.quotes.filter((check) => check.ok).length}／{checks.quotes.length} 逐字相符</span>
          <span className={allMatch(checks.words) ? "is-pass" : "is-fail"}>本人原話 {checks.words.filter((check) => check.ok).length}／{checks.words.length} 逐字相符</span>
        </p>
        {failedQuotes.length > 0 && <ul className="refine-check-list">{failedQuotes.map((check, index) => <li key={index} className={check.ok ? "is-note" : "is-fail"}>
          <b>{check.ok ? "位置不同" : "對不上"}｜{check.ref}</b><q>{check.text}</q><small>{check.note}</small>
          {check.nearest && <blockquote>{check.nearest}</blockquote>}
        </li>)}</ul>}
        {failedWords.length > 0 && <ul className="refine-check-list">{failedWords.map((check) => <li key={check.n} className={check.ok ? "is-note" : "is-fail"}>
          <b>候選 #{check.n}</b><small>{check.note}{!check.ok && "這一則只能由你自己改寫標題。"}</small>
        </li>)}</ul>}
      </section>}

      {record && record.status !== "open" && <section className="refine-step is-candidates" aria-labelledby="refine-candidates">
        <span className="refine-eyebrow">留下的</span>
        <h2 id="refine-candidates">候選</h2>
        <p className="refine-note">先挑選、決定標題與類型，再按「存成卡片」。卡片存進 Notion 的 DB-22 洞察卡片庫，連回這一輪帶入的採集；存成卡片後，這則的挑選就不能再改，這一輪也不能再重新貼回。</p>
        {(() => {
          const pending = record.picks.filter((p) => !record.adopted.some((a) => a.candidateN === p.candidateN)).map((p) => p.candidateN);
          return <p className="refine-summary">
            <span>已挑選 {record.picks.length} 則</span><span>已存成卡片 {record.adopted.length} 張</span>
            {record.status === "returned" && pending.length > 1 && <button type="button" className="primary" disabled={busy} onClick={() => adopt(pending)}>把已挑選的 {pending.length} 則都存成卡片</button>}
          </p>;
        })()}
        {record.omitted && <p className="refine-note">這場討論太長，為了放進 Notion，{record.omitted.gptTurns ? "GPT 的發言" : ""}{record.omitted.ownerTurns.length ? `與 T${record.omitted.ownerTurns.join("、T")}` : ""}沒有逐字保存；候選與檢查結果完整保存。</p>}
        {!record.candidates.length && <p>這份紀錄沒有候選。</p>}
        <div className="refine-candidates">
          {record.candidates.map((candidate) => <RefineCandidateCard key={candidate.n} candidate={candidate} record={record} pick={record.picks.find((item) => item.candidateN === candidate.n)} cardId={record.adopted.find((item) => item.candidateN === candidate.n)?.cardId} busy={busy} onPick={pick} onAdopt={(n) => adopt([n])} />)}
        </div>
        <details><summary>GPT 延伸（{record.extensions.length}）</summary><ul>{record.extensions.map((item, index) => <li key={index}>{item}</li>)}</ul></details>
        <details className="refine-verify" open={record.toVerify.length > 0}><summary>待查證（{record.toVerify.length}）</summary>
          <ul>{record.toVerify.map((item, index) => <li key={index}>{item}</li>)}</ul>
          {record.toVerify.length > 0 && <>
            <p className="field-help">這些說法還不能當成事實。複製清單後貼給 Claude 並說「查證」，它會逐則找來源、給出判定。</p>
            <button type="button" onClick={() => void copy(["【野採待查清單】", `討論包ID：${record.id}`, ...record.toVerify.map((item, index) => `${index + 1}. ${item}`)].join("\n")).then((ok) => setNotice(ok ? "待查清單已複製。" : "這個瀏覽器不能自動複製，請手動選取上面的清單。"))}>複製待查清單</button>
          </>}
        </details>
        <details><summary>未回答（{record.unanswered.length}）</summary><ul>{record.unanswered.map((item, index) => <li key={index}>{item}</li>)}</ul></details>
        <details><summary>逐字問答（{record.turns.length} 則）</summary><ol className="refine-turns">{record.turns.map((turn) => <li key={turn.n}><b>T{turn.n}｜{turn.who}</b><p>{turn.text || "（未逐字保存）"}</p></li>)}</ol></details>
      </section>}

      {record && <section className="refine-step is-end" aria-labelledby="refine-end">
        <span className="refine-eyebrow">歸類</span>
        <h2 id="refine-end">{record.status === "closed" ? "這一輪的歸類紀錄" : "結束這一輪"}</h2>
        <p>帶入：{record.sources.map((source) => `${source.label} ${source.title}`).join("、")}</p>
        <p>考慮過但沒有帶入：{refineLeftOut(record).map((id) => byId.get(id)?.title ?? id).join("、") || "無"}</p>
        {record.status !== "closed" && <button type="button" disabled={busy} onClick={close}>結束這一輪</button>}
      </section>}

      <RefineRules />
    </section>
  );
}

function RefineCandidateCard({ candidate, record, pick, cardId, busy, onPick, onAdopt }: {
  candidate: RefineRecord["candidates"][number]; record: RefineRecord; pick?: RefinePick; cardId?: string; busy: boolean;
  onPick: (n: number, from: RefineTitleFrom | null, title?: string, cardType?: RefineCardType) => void;
  onAdopt: (n: number) => void;
}) {
  const check = record.checks.words.find((item) => item.n === candidate.n);
  const verified = Boolean(check?.ok);
  const [from, setFrom] = useState<RefineTitleFrom>(pick?.titleFrom ?? (verified ? "原話" : "改寫"));
  const [rewrite, setRewrite] = useState(pick?.titleFrom === "改寫" ? pick.title : "");
  const [cardType, setCardType] = useState<RefineCardType>(pick?.cardType ?? refineDefaultCardType(record.angle, candidate.type));
  const editable = record.status === "returned" && !cardId;
  const choices: RefineTitleFrom[] = verified ? ["原話", "整理版", "改寫"] : ["改寫"];
  return <article className={`refine-candidate ${pick ? "is-picked" : ""} ${cardId ? "is-adopted" : ""}`}>
    <div className="refine-candidate-meta"><b>#{candidate.n}｜{candidate.type}</b><span>T{candidate.turn}{candidate.reply ? `・回應 ${candidate.reply}` : ""}</span><span className={verified ? "is-ok" : "is-fail"}>{verified ? "原話逐字相符" : "原話未通過檢查"}</span></div>
    <p className="refine-mine"><strong>我的原話</strong>{candidate.words || "（沒有附上原話）"}</p>
    {candidate.tidy && <p className="refine-tidy"><strong>GPT 的整理版</strong>{candidate.tidy}</p>}
    {!verified && candidate.words && (refineOwnTurn(record, candidate.turn)
      ? <p className="refine-note">原話和 T{candidate.turn} 對不上，存成卡片時「我的原話」會改存你在 T{candidate.turn} 的完整發言：{refineOwnTurn(record, candidate.turn)}</p>
      : <p className="refine-note">原話和 T{candidate.turn} 對不上，而 T{candidate.turn} 不是你的發言或沒有逐字保存，這則不能存成卡片。</p>)}
    {pick && <p className="refine-picked"><strong>{cardId ? "已存成卡片" : "已挑選"}・{pick.cardType}・標題用{pick.titleFrom}</strong>{pick.title}</p>}
    {cardId && <a className="refine-card-link is-weave" href={`/weaving/studio#card/insight:${cardId}`}>帶去織光堂，做成織光杼</a>}
    {cardId && <a className="refine-card-link" href={`https://www.notion.so/${cardId.replaceAll("-", "")}`} target="_blank" rel="noreferrer">在 Notion 打開這張卡片 ↗</a>}
    {editable && candidate.words && <div className="refine-pick">
      <div role="radiogroup" aria-label={`候選 #${candidate.n} 的標題`}>{choices.map((choice) => <button type="button" key={choice} role="radio" aria-checked={from === choice} className={from === choice ? "on" : ""} disabled={choice === "整理版" && !candidate.tidy} onClick={() => setFrom(choice)}>{choice === "改寫" ? "自己改寫" : `用${choice}`}</button>)}</div>
      {from === "改寫" && <textarea className="field" rows={2} value={rewrite} onChange={(event) => setRewrite(event.target.value)} aria-label={`候選 #${candidate.n} 改寫的標題`} placeholder="用自己的話寫成一句能獨立閱讀的標題" />}
      <div role="radiogroup" aria-label={`候選 #${candidate.n} 的卡片類型`}>{refineCardTypes(record.angle).map((type) => <button type="button" key={type} role="radio" aria-checked={cardType === type} className={cardType === type ? "on" : ""} onClick={() => setCardType(type)}>{type}</button>)}</div>
      <div className="refine-pick-actions">
        <button type="button" className={pick ? "" : "primary"} disabled={busy || (from === "改寫" && !rewrite.trim())} onClick={() => onPick(candidate.n, from, rewrite, cardType)}>{pick ? "更新挑選" : "挑選這則"}</button>
        {pick && <button type="button" className="primary" disabled={busy} onClick={() => onAdopt(candidate.n)}>存成卡片</button>}
        {pick && <button type="button" disabled={busy} onClick={() => onPick(candidate.n, null)}>取消挑選</button>}
      </div>
    </div>}
  </article>;
}

/** The owner's discussion rules, one per line. Saved once and used by every new package. */
function RefineRules() {
  const [rules, setRules] = useState<string[] | null>(null);
  const [draft, setDraft] = useState("");
  const [message, setMessage] = useState("");
  async function open() {
    if (rules) return;
    try {
      const loaded = await readJson<{ rules: string[] }>(await fetch(API, { cache: "no-store" }));
      setRules(loaded.rules); setDraft(loaded.rules.join("\n"));
    } catch (caught) { setMessage(caught instanceof Error ? caught.message : String(caught)); }
  }
  async function save(next: string[]) {
    setMessage("");
    try {
      const saved = await post<{ rules: string[] }>({ action: "rules", rules: next });
      setRules(saved.rules); setDraft(saved.rules.join("\n")); setMessage("已保存。之後複製的討論包會用這份規則。");
    } catch (caught) { setMessage(caught instanceof Error ? caught.message : String(caught)); }
  }
  return <details className="refine-step refine-rules" onToggle={(event) => { if (event.currentTarget.open) void open(); }}>
    <summary>討論規則</summary>
    <p>每行一條，會放進每一份討論包。改完按保存；清空後保存會回到預設的規則。</p>
    <textarea className="field" rows={10} value={draft} onChange={(event) => setDraft(event.target.value)} aria-label="討論規則，每行一條" disabled={!rules} />
    <div className="refine-pick-actions">
      <button type="button" className="primary" disabled={!rules} onClick={() => void save(draft.split("\n"))}>保存規則</button>
      <button type="button" disabled={!rules} onClick={() => void save([])}>回到預設</button>
    </div>
    {message && <p role="status">{message}</p>}
  </details>;
}
