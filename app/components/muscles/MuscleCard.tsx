"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "../PracticeRouteLink";
import LocalWindow from "./LocalWindow";
import { copyText, muscleFetch, practiceCardHref, type MuscleSnapshot } from "./muscleApi";
import { LEGACY_TOPIC_CARDS, MMT_GRADING, muscleByKey, tfhEntry } from "@/lib/dojo/muscleCards/catalog";
import {
  SECTIONS, TENDENCY_LABELS, TEST_TABS, TFH_NOT_LISTED, builtLabel, sectionApplies, sectionBuilt, sectionView,
  type AnswerRecord, type PatternMembership, type SectionKey, type Tendency,
} from "@/lib/dojo/muscleCards/model";
import { buildDiscussionPackage, parseAnswerReturn, type ParsedAnswer } from "@/lib/dojo/muscleCards/discussion";
import { MUSCLE_KIND, PATTERN_KIND } from "@/lib/dojo/muscleCards/network";
import type { LearningEntity } from "@/lib/dojo/learningFoundation/model";
import type { LearningRecord } from "@/lib/dojo/learningRecords/model";
import { taipeiTodayISO } from "@/lib/dojo/formal";

type Refresh = () => Promise<void>;

function SectionForm({ muscle, section, snapshot, refresh }: { muscle: string; section: SectionKey; snapshot: MuscleSnapshot; refresh: Refresh }) {
  const params = useSearchParams();
  const card = snapshot.cards.find((c) => c.key === muscle) ?? null;
  const view = sectionView(card, muscle, section);
  const [fields, setFields] = useState(view.fields);
  const [patterns, setPatterns] = useState<PatternMembership[]>(view.patterns ?? []);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  // 保存後（或別處更新後）版本變了，就以保存下來的內容為準。
  const [seenRevision, setSeenRevision] = useState(view.revision);
  if (seenRevision !== view.revision) {
    setSeenRevision(view.revision);
    setFields(view.fields);
    setPatterns(view.patterns ?? []);
  }
  const dirty = JSON.stringify(fields) !== JSON.stringify(view.fields) || (section === "posture" && JSON.stringify(patterns) !== JSON.stringify(view.patterns ?? []));
  async function save() {
    setBusy(true);
    setNotice("");
    try {
      await muscleFetch("/api/dojo/muscles", {
        method: "PATCH",
        body: { key: muscle, section, revision: view.revision, content: { fields, ...(section === "posture" ? { patterns } : {}) } },
      });
      await refresh();
      setNotice(`${SECTIONS[section].label}已保存。`);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "尚未保存。");
    } finally {
      setBusy(false);
    }
  }
  function togglePattern(id: string, on: boolean) {
    setPatterns((list) => on ? [...list, { patternId: id, tendency: "" }] : list.filter((p) => p.patternId !== id));
  }
  function setTendency(id: string, tendency: Tendency) {
    setPatterns((list) => list.map((p) => p.patternId === id ? { ...p, tendency } : p));
  }
  const id = (f: string) => `muscle-${muscle}-${section}-${f}`;
  return <form className="muscle-section-form" onSubmit={(e) => { e.preventDefault(); void save(); }}>
    {section === "posture" && <fieldset className="muscle-pattern-picker">
      <legend>相關的姿勢型態</legend>
      {snapshot.patterns.map((p) => {
        const member = patterns.find((m) => m.patternId === p.id);
        return <div className="muscle-pattern-row" key={p.id}>
          <label><input type="checkbox" checked={Boolean(member)} onChange={(e) => togglePattern(p.id, e.target.checked)} />{p.name}</label>
          {member && <select aria-label={`在${p.name}中偏緊還是偏弱`} value={member.tendency} onChange={(e) => setTendency(p.id, e.target.value as Tendency)}>
            <option value="">尚未填</option><option value="tight">{TENDENCY_LABELS.tight}</option><option value="weak">{TENDENCY_LABELS.weak}</option>
          </select>}
          <Link className="muscle-text-link" href={practiceCardHref({ kind: PATTERN_KIND, id: p.id }, params)}>看型態卡</Link>
        </div>;
      })}
    </fieldset>}
    {section === "mmt" && <p className="muscle-fixed-field"><span>採用的分級</span>{MMT_GRADING}</p>}
    {SECTIONS[section].fields.map((f) => <div className="muscle-field" key={f.key}>
      <label htmlFor={id(f.key)}>{f.label}</label>
      <textarea id={id(f.key)} value={fields[f.key] ?? ""} maxLength={4000} rows={f.key === "englishScript" ? 4 : 2}
        lang={f.key === "englishScript" ? "en" : undefined}
        onChange={(e) => setFields((v) => ({ ...v, [f.key]: e.target.value }))} />
    </div>)}
    <div className="muscle-form-actions">
      <button type="submit" className="primary" disabled={busy || !dirty}>{busy ? "保存中…" : `保存${SECTIONS[section].label}`}</button>
      {dirty && !busy && <small className="muscle-muted">有尚未保存的修改</small>}
    </div>
    {notice && <p role="status">{notice}</p>}
  </form>;
}

function AnswerList({ muscle, section, answers, onChanged }: { muscle: string; section: SectionKey; answers: AnswerRecord[]; onChanged: Refresh }) {
  const mine = answers.filter((a) => a.section === section);
  const [notice, setNotice] = useState("");
  async function remove(answer: AnswerRecord) {
    if (!window.confirm("刪除這筆答題紀錄？")) return;
    try {
      await muscleFetch("/api/dojo/muscles/answers", { method: "DELETE", body: { card: muscle, id: answer.id } });
      await onChanged();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "尚未刪除。");
    }
  }
  return <details className="muscle-answers">
    <summary>這一層的答題紀錄</summary>
    {!mine.length && <p className="muscle-muted">還沒有答題紀錄。</p>}
    {mine.map((a) => <article key={a.id} className="muscle-answer">
      <p className="muscle-muted">{a.practicedOn}</p>
      <dl>
        <dt>題目</dt><dd>{a.question}</dd>
        <dt>我的答案</dt><dd>{a.answer || "（空白）"}</dd>
        <dt>和卡片不一致的地方</dt><dd>{a.mismatch || "（空白）"}</dd>
      </dl>
      <details><summary>貼回的原文</summary><pre>{a.raw}</pre></details>
      <button type="button" className="muscle-text-button" onClick={() => void remove(a)}>刪除這筆</button>
    </article>)}
    {notice && <p role="alert">{notice}</p>}
  </details>;
}

function DiscussionPanel({ muscle, snapshot, onSaved }: { muscle: string; snapshot: MuscleSnapshot; onSaved: Refresh }) {
  const card = snapshot.cards.find((c) => c.key === muscle) ?? null;
  const pack = buildDiscussionPackage(muscle, card, snapshot.patterns);
  const [pasted, setPasted] = useState("");
  const [date, setDate] = useState(taipeiTodayISO());
  const [parsed, setParsed] = useState<{ entries: ParsedAnswer[]; problems: string[] } | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const request = useRef("");
  async function copy() {
    if (!pack) return;
    setNotice(await copyText(pack) ? "討論包已複製。貼到外部 AI 開始；說「結束」時，把它輸出的成果貼回下面。" : "這個瀏覽器不允許自動複製，請展開討論包內容後手動複製。");
  }
  async function save() {
    if (!parsed?.entries.length) return;
    setBusy(true);
    request.current ||= crypto.randomUUID();
    try {
      await muscleFetch("/api/dojo/muscles/answers", {
        method: "POST",
        body: { card: muscle, createRequestId: request.current, entries: parsed.entries.map((e) => ({ ...e, practicedOn: date })) },
      });
      request.current = "";
      setPasted("");
      setParsed(null);
      await onSaved();
      setNotice(`已保存 ${parsed.entries.length} 筆答題紀錄，各記在所屬的層。`);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "尚未保存。");
    } finally {
      setBusy(false);
    }
  }
  return <section className="muscle-discussion" aria-labelledby={`muscle-discussion-${muscle}`}>
    <h3 id={`muscle-discussion-${muscle}`}>和外部 AI 討論</h3>
    <p className="muscle-muted">討論包包含整張卡與規則：一次只出一題、只用卡片內容、指出和卡片不一致之處；留空的欄位不出題。</p>
    {pack
      ? <>
        <button type="button" onClick={() => void copy()}>複製討論包</button>
        <details><summary>查看討論包內容</summary><pre className="muscle-pack">{pack}</pre></details>
      </>
      : <p className="muscle-muted">這張卡還沒有內容，沒有可以出題的欄位。</p>}
    <div className="muscle-field">
      <label htmlFor={`muscle-paste-${muscle}`}>貼回成果</label>
      <textarea id={`muscle-paste-${muscle}`} rows={5} value={pasted} onChange={(e) => { setPasted(e.target.value); setParsed(null); }} />
    </div>
    <div className="muscle-form-actions">
      <label className="muscle-inline-label">答題日期 <input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
      <button type="button" disabled={!pasted.trim()} onClick={() => setParsed(parseAnswerReturn(pasted, muscle))}>核對貼回內容</button>
    </div>
    {parsed && <div className="muscle-parsed">
      {parsed.problems.map((p) => <p role="alert" key={p}>{p}</p>)}
      {parsed.entries.map((e, i) => <article className="muscle-answer" key={i}>
        <p className="muscle-muted">{SECTIONS[e.section].label}</p>
        <dl><dt>題目</dt><dd>{e.question}</dd><dt>我的答案</dt><dd>{e.answer || "（空白）"}</dd><dt>和卡片不一致的地方</dt><dd>{e.mismatch || "（空白）"}</dd></dl>
      </article>)}
      {parsed.entries.length > 0 && <button type="button" className="primary" disabled={busy || !date} onClick={() => void save()}>{busy ? "保存中…" : `保存 ${parsed.entries.length} 筆答題紀錄`}</button>}
    </div>}
    {notice && <p role="status">{notice}</p>}
  </section>;
}

/** 原有按摩主題的舊紀錄：只讀列出，不搬動、不改寫。 */
function LegacyRecords({ muscle, massageItemId, topics }: { muscle: string; massageItemId: string; topics: LearningEntity[] }) {
  const legacy = LEGACY_TOPIC_CARDS.find((l) => l.muscle === muscle);
  const topic = legacy ? topics.find((t) => t.curriculumKey === legacy.curriculumKey) ?? topics.find((t) => t.name === legacy.topicName) : undefined;
  const [records, setRecords] = useState<LearningRecord[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!topic) return;
    let live = true;
    const q = new URLSearchParams({ learningItemId: massageItemId, topicId: topic.id, limit: "100" });
    muscleFetch<{ records: LearningRecord[] }>(`/api/dojo/learning/records?${q}`)
      .then((r) => { if (live) setRecords(r.records); })
      .catch((e) => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [topic, massageItemId]);
  if (!legacy || !topic) return null;
  return <section className="muscle-legacy" aria-label={`既有主題「${topic.name}」的紀錄`}>
    <h3>既有主題「{topic.name}」的紀錄</h3>
    <p className="muscle-muted">這些是原有主題留下的紀錄，在這裡只讀顯示。</p>
    {error && <p role="alert">{error}</p>}
    {!records && !error && <p className="muscle-muted">讀取中…</p>}
    {records?.length === 0 && <p className="muscle-muted">這個主題還沒有紀錄。</p>}
    <ul>{records?.map((r) => <li key={r.id}>
      <Link href={`/practice/records?record=${r.id}`}>{r.title || r.whatIDid.slice(0, 40)}</Link>
      <small className="muscle-muted">{r.practicedOn}</small>
    </li>)}</ul>
  </section>;
}

export default function MuscleCard({ muscle, snapshot, refresh, massageItemId, topics }: {
  muscle: string; snapshot: MuscleSnapshot; refresh: Refresh; massageItemId: string; topics: LearningEntity[];
}) {
  const entry = muscleByKey(muscle)!;
  const tfh = tfhEntry(muscle);
  const card = snapshot.cards.find((c) => c.key === muscle) ?? null;
  const [tab, setTab] = useState<SectionKey>("mmt");
  const [answers, setAnswers] = useState<AnswerRecord[]>([]);
  const [answerError, setAnswerError] = useState("");
  const loadAnswers = useCallback(async () => {
    try {
      const r = await muscleFetch<{ answers: AnswerRecord[] }>(`/api/dojo/muscles/answers?card=${encodeURIComponent(muscle)}`);
      setAnswers(r.answers);
      setAnswerError("");
    } catch (e) {
      setAnswerError(e instanceof Error ? e.message : "答題紀錄暫時讀不到。");
    }
  }, [muscle]);
  useEffect(() => {
    let live = true;
    muscleFetch<{ answers: AnswerRecord[] }>(`/api/dojo/muscles/answers?card=${encodeURIComponent(muscle)}`)
      .then((r) => { if (live) setAnswers(r.answers); })
      .catch((e) => { if (live) setAnswerError(e.message); });
    return () => { live = false; };
  }, [muscle]);
  const status = (s: SectionKey) => builtLabel(sectionBuilt(card, muscle, s));
  const layer = (s: SectionKey) => <>
    <SectionForm key={`${muscle}-${s}`} muscle={muscle} section={s} snapshot={snapshot} refresh={refresh} />
    <AnswerList muscle={muscle} section={s} answers={answers} onChanged={loadAnswers} />
  </>;
  return <article className="card muscle-card" aria-labelledby={`muscle-title-${muscle}`}>
    <header className="muscle-card-header">
      <h2 id={`muscle-title-${muscle}`}>{entry.name}</h2>
      {tfh && <p className="muscle-muted">觸康健：{tfh.label ?? entry.name}・{tfh.meridian}</p>}
      <ul className="muscle-status" aria-label="各層狀態">
        <li>認識 <b>{status("know")}</b></li>
        <li>徒手肌力測試 <b>{status("mmt")}</b></li>
        <li>姿勢評估 <b>{status("posture")}</b></li>
        {tfh && <li>觸康健檢測 <b>{status("tfh")}</b></li>}
        <li>運用 <b>{status("use")}</b></li>
      </ul>
    </header>
    {answerError && <p role="alert">答題紀錄暫時讀不到：{answerError}</p>}
    <section className="muscle-layer" aria-labelledby={`muscle-know-${muscle}`}>
      <h3 id={`muscle-know-${muscle}`}>認識</h3>
      {layer("know")}
    </section>
    <section className="muscle-layer" aria-labelledby={`muscle-test-${muscle}`}>
      <h3 id={`muscle-test-${muscle}`}>測試</h3>
      <div className="muscle-test-tabs" role="tablist" aria-label="測試方式">
        {TEST_TABS.map((s) => <button key={s} type="button" role="tab" id={`muscle-tab-${muscle}-${s}`} aria-selected={tab === s}
          aria-controls={`muscle-panel-${muscle}-${s}`} onClick={() => setTab(s)}>
          {SECTIONS[s].label}<small>{sectionApplies(muscle, s) ? status(s) : "不在十四肌內"}</small>
        </button>)}
      </div>
      {TEST_TABS.map((s) => <div key={s} role="tabpanel" id={`muscle-panel-${muscle}-${s}`} aria-labelledby={`muscle-tab-${muscle}-${s}`} hidden={tab !== s}>
        {sectionApplies(muscle, s) ? layer(s) : <p className="muscle-note">{TFH_NOT_LISTED}</p>}
      </div>)}
    </section>
    <section className="muscle-layer" aria-labelledby={`muscle-use-${muscle}`}>
      <h3 id={`muscle-use-${muscle}`}>運用</h3>
      {layer("use")}
    </section>
    <LocalWindow self={{ kind: MUSCLE_KIND, id: muscle }} snapshot={snapshot} onChanged={refresh} allowAdd />
    <DiscussionPanel muscle={muscle} snapshot={snapshot} onSaved={loadAnswers} />
    <LegacyRecords muscle={muscle} massageItemId={massageItemId} topics={topics} />
  </article>;
}
