"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  canCompleteTopicStudy,
  sevenDaysAfter,
  topicStudyCandidates,
  topicStudyStage,
  type TopicStudyRound,
} from "@/lib/dojo/topicStudy";

async function responseJson<T>(response: Response): Promise<T> {
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((json as { error?: string }).error ?? `讀取失敗（${response.status}）`);
  return json as T;
}

function taipeiToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

const STAGE_LABELS = {
  finding: "找影片",
  absorbing: "看完留重點",
  discussing: "準備對談",
  completed: "已完成",
} as const;

export default function EnglishTopicStudy({ onCompleted }: { onCompleted?: () => void | Promise<void> }) {
  const [rounds, setRounds] = useState<TopicStudyRound[]>([]);
  const [draft, setDraft] = useState<TopicStudyRound | null>(null);
  const [creating, setCreating] = useState(false);
  const [topicTitle, setTopicTitle] = useState("");
  const [classDate, setClassDate] = useState(taipeiToday());
  const [initialUrl, setInitialUrl] = useState("");
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/dojo/topic-study", { cache: "no-store" });
      const result = await responseJson<{ rounds: TopicStudyRound[] }>(response);
      setRounds(result.rounds ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load]);

  const pending = useMemo(() => rounds.filter((round) => !round.completedAt), [rounds]);
  const completed = useMemo(() => rounds.filter((round) => round.completedAt).slice(0, 6), [rounds]);
  const candidates = useMemo(() => draft ? topicStudyCandidates(draft) : [], [draft]);
  const exportedKeys = useMemo(() => new Set(draft?.vocabForgeExports.map((item) => item.key) ?? []), [draft]);
  const stage = draft ? topicStudyStage(draft) : null;

  function selectRound(round: TopicStudyRound) {
    setDraft(structuredClone(round));
    setSelectedKeys([]);
    setCreating(false);
    setError(null);
    setNotice(null);
  }

  async function createRound() {
    if (!topicTitle.trim()) { setError("請先填寫這次的課堂主題。"); return; }
    setSaving(true); setError(null); setNotice(null);
    try {
      const response = await fetch("/api/dojo/topic-study", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topicTitle, classDate, videoUrl: initialUrl }),
      });
      const result = await responseJson<{ round: TopicStudyRound }>(response);
      setRounds((current) => [result.round, ...current]);
      selectRound(result.round);
      setTopicTitle(""); setInitialUrl("");
      setNotice(result.round.videoUrl ? "主題卡已建立，接著看影片並留下一個重點。" : "主題卡已建立，先去找一支 VoiceTube 影片。");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally { setSaving(false); }
  }

  async function saveRound(options?: { complete?: boolean }, override?: TopicStudyRound) {
    const round = override ?? draft;
    if (!round) return null;
    setSaving(true); setError(null); setNotice(null);
    try {
      const response = await fetch("/api/dojo/topic-study", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: round.id, round, complete: options?.complete === true }),
      });
      const result = await responseJson<{ round: TopicStudyRound; weeklySynced: boolean }>(response);
      setDraft(structuredClone(result.round));
      setRounds((current) => current.map((item) => item.id === result.round.id ? result.round : item));
      setNotice(options?.complete
        ? result.weeklySynced ? "主題修習已完成，也已同步本週口說格。" : "主題修習已完成；本週沒有對應口說格。"
        : "這一階段已儲存。");
      if (options?.complete) await onCompleted?.();
      return result.round;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      return null;
    } finally { setSaving(false); }
  }

  function toggleCandidate(key: string) {
    if (exportedKeys.has(key)) return;
    setError(null);
    setSelectedKeys((current) => {
      if (current.includes(key)) return current.filter((item) => item !== key);
      if (current.length >= 3) { setError("每次最多選 3 個真正想留下的表達。"); return current; }
      return [...current, key];
    });
  }

  async function sendToVocabForge() {
    if (!draft || !selectedKeys.length) return;
    setSending(true); setError(null); setNotice(null);
    try {
      const saved = await saveRound(undefined, draft);
      if (!saved) return;
      const response = await fetch("/api/dojo/topic-study/vocabforge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: saved.id, keys: selectedKeys }),
      });
      const result = await responseJson<{ round: TopicStudyRound; created: number; existing: number }>(response);
      setDraft(structuredClone(result.round));
      setRounds((current) => current.map((item) => item.id === result.round.id ? result.round : item));
      setSelectedKeys([]);
      setNotice(`已送往「課堂主題」豆倉：新增 ${result.created} 個、補充既有情境 ${result.existing} 個。`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally { setSending(false); }
  }

  function setRespeak(enabled: boolean) {
    if (!draft) return;
    setDraft({ ...draft, respeakDate: enabled ? sevenDaysAfter(taipeiToday()) : null });
  }

  return (
    <section className="topic-study-workbench">
      <div className="topic-study-head">
        <div><span className="eyebrow">VoiceTube 主題輸入</span><h4>主題修習</h4><p>一支影片、一個重點、0–3 個表達，再完成一次對談。</p></div>
        <button type="button" onClick={() => { setCreating((value) => !value); setDraft(null); setError(null); setNotice(null); }}>＋ 新主題</button>
      </div>

      {creating && (
        <div className="topic-study-create">
          <label>這次的課堂主題 *</label>
          <input className="field" value={topicTitle} onChange={(event) => setTopicTitle(event.target.value)} placeholder="例如：Cost of Living" />
          <div className="topic-study-create-row">
            <div><label>上課日期</label><input className="field" type="date" value={classDate} onChange={(event) => setClassDate(event.target.value)} /></div>
            <div><label>VoiceTube 網址（可稍後補）</label><input className="field" inputMode="url" value={initialUrl} onChange={(event) => setInitialUrl(event.target.value)} placeholder="https://..." /></div>
          </div>
          <button type="button" className="primary" disabled={saving || !topicTitle.trim()} onClick={() => void createRound()}>{saving ? "建立中…" : "建立主題卡"}</button>
        </div>
      )}

      {loading ? <p className="muted-note">正在讀取主題修習…</p> : (
        <>
          {pending.length > 0 && <div className="topic-study-queue">{pending.map((round) => <button type="button" key={round.id} className={draft?.id === round.id ? "on" : ""} onClick={() => selectRound(round)}><small>{round.classDate}・{STAGE_LABELS[topicStudyStage(round)]}</small><b>{round.topicTitle}</b></button>)}</div>}
          {!creating && pending.length === 0 && !draft && <p className="muted-note">目前沒有進行中的主題；上課後可以先建立一張。</p>}
        </>
      )}

      {draft && stage && (
        <article className="topic-study-editor">
          <div className="topic-study-title"><div><small>{draft.classDate}・{draft.courseTitle}</small><b>{draft.topicTitle}</b></div><span>{STAGE_LABELS[stage]}</span></div>
          <div className="topic-study-steps" aria-label="主題修習階段"><span className={stage === "finding" ? "on" : "done"}>1 找影片</span><span className={stage === "absorbing" ? "on" : stage === "finding" ? "" : "done"}>2 留重點</span><span className={stage === "discussing" ? "on" : stage === "completed" ? "done" : ""}>3 對談</span></div>

          {stage === "finding" && <section className="topic-stage-panel">
            <h5>先找到一支相關影片</h5><p>影片留在 VoiceTube，這裡只保存連結。</p>
            <a className="topic-study-external" href={`https://tw.voicetube.com/search?query=${encodeURIComponent(draft.topicTitle)}`} target="_blank" rel="noreferrer">前往 VoiceTube 搜尋「{draft.topicTitle}」 ↗</a>
            <label>貼上影片網址 *</label><input className="field" inputMode="url" value={draft.videoUrl} onChange={(event) => setDraft({ ...draft, videoUrl: event.target.value })} placeholder="https://tw.voicetube.com/..." />
            <label>影片名稱（選填）</label><input className="field" value={draft.videoTitle} onChange={(event) => setDraft({ ...draft, videoTitle: event.target.value })} placeholder="不填也可以繼續" />
            <button type="button" className="primary" disabled={saving || !draft.videoUrl.trim()} onClick={() => void saveRound()}>{saving ? "儲存中…" : "儲存並去看影片"}</button>
          </section>}

          {stage === "absorbing" && <section className="topic-stage-panel">
            <div className="topic-video-link"><div><small>本次影片</small><b>{draft.videoTitle || draft.topicTitle}</b></div><a href={draft.videoUrl} target="_blank" rel="noreferrer">打開影片 ↗</a></div>
            <label>用自己的話留下一個重點 *</label>
            <textarea className="field" rows={5} value={draft.summary} onChange={(event) => setDraft({ ...draft, summary: event.target.value })} placeholder="影片在說什麼？哪一點和我的生活、工作或台灣有關？寫兩三句就好。" />
            <label>想帶走的表達（選填，0–3 個）</label>
            <textarea className="field" rows={4} value={draft.expressions} onChange={(event) => setDraft({ ...draft, expressions: event.target.value })} placeholder={'struggle to make ends meet｜勉強維持收支平衡\nOne of the main reasons is that...｜其中一個主要原因是……'} />
            <small className="field-help">一行一個；沒有想留下的表達也可以完成主題。</small>
            <button type="button" className="primary" disabled={saving || !draft.summary.trim()} onClick={() => void saveRound()}>{saving ? "儲存中…" : "儲存重點，準備對談"}</button>
          </section>}

          {(stage === "discussing" || stage === "completed") && <section className="topic-stage-panel">
            <div className="topic-study-summary"><small>我留下的重點</small><p>{draft.summary}</p></div>
            {candidates.length > 0 && <div className="topic-vocab-tray"><div><b>送往 VocabForge</b><small>你在這裡勾選，就視為已確認；不會再多一次收件匣。</small></div>{candidates.map((candidate) => { const exported = exportedKeys.has(candidate.key); return <button type="button" key={candidate.key} className={exported ? "exported" : selectedKeys.includes(candidate.key) ? "on" : ""} onClick={() => toggleCandidate(candidate.key)} disabled={exported}><span>{exported ? "✓" : selectedKeys.includes(candidate.key) ? "✓" : ""}</span><div><b>{candidate.expression}</b><small>{candidate.meaning || "尚未填中文意思"}</small></div><em>{exported ? "已送出" : ""}</em></button>; })}<button type="button" className="primary topic-vocab-send" disabled={sending || selectedKeys.length === 0} onClick={() => void sendToVocabForge()}>{sending ? "傳送中…" : `送出已選 ${selectedKeys.length} 個`}</button></div>}
            {stage === "completed" ? <div className="topic-study-completed"><b>這次對談已完成</b><p>{draft.discussionNote}</p>{draft.respeakDate && <small>{draft.respeakDate} 再說一次</small>}</div> : <>
              <label>簡單記下這次說得怎麼樣 *</label>
              <div className="topic-prompt-chips"><span>我成功說出的重點</span><span>我卡住的地方</span><span>下次想補強什麼</span></div>
              <textarea className="field" rows={5} value={draft.discussionNote} onChange={(event) => setDraft({ ...draft, discussionNote: event.target.value, discussionDate: taipeiToday() })} placeholder="留下一兩句就可以，不必逐題回答。" />
              <label className="topic-respeak"><input type="checkbox" checked={Boolean(draft.respeakDate)} onChange={(event) => setRespeak(event.target.checked)} /><span><b>七天後再說一次</b><small>{draft.respeakDate ?? "選填，不影響本回合完成"}</small></span></label>
              <button type="button" className="primary" disabled={saving || !canCompleteTopicStudy(draft)} onClick={() => void saveRound({ complete: true })}>{saving ? "完成中…" : "完成這次主題修習"}</button>
            </>}
          </section>}
          {error && <p className="form-error">{error}</p>}
          {notice && <p className="save-notice">{notice}</p>}
        </article>
      )}

      {completed.length > 0 && <details className="topic-study-history"><summary>最近完成的主題</summary><div>{completed.map((round) => <button type="button" key={round.id} onClick={() => selectRound(round)}><span><small>{round.classDate}</small><b>{round.topicTitle}</b></span><em>查看</em></button>)}</div></details>}
      {!draft && error && <p className="form-error">{error}</p>}
      {!draft && notice && <p className="save-notice">{notice}</p>}
    </section>
  );
}
