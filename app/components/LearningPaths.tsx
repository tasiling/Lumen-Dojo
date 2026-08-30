"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useDojo } from "@/lib/dojo/store";
import { mondayOf, taipeiTodayISO, type CaptureEntry, type LearningTrackKey } from "@/lib/dojo/formal";
import {
  ENGLISH_SKILLS,
  LEARNING_TRACKS,
  type CefrLevel,
  type EnglishSkill,
  type LearningTrackRecord,
} from "@/lib/dojo/learning";

async function responseJson<T>(response: Response): Promise<T> {
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((json as { error?: string }).error ?? `讀取失敗（${response.status}）`);
  return json as T;
}

export default function LearningPaths() {
  const router = useRouter();
  const { openQuickAdd, startTimerWith, entries } = useDojo();
  const [tracks, setTracks] = useState<LearningTrackRecord[]>([]);
  const [materials, setMaterials] = useState<CaptureEntry[]>([]);
  const [selected, setSelected] = useState<LearningTrackKey>("english");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<LearningTrackRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [learningResponse, captureResponse] = await Promise.all([
        fetch("/api/dojo/learning", { cache: "no-store" }),
        fetch("/api/dojo/captures", { cache: "no-store" }),
      ]);
      const learning = await responseJson<{ tracks: LearningTrackRecord[] }>(learningResponse);
      const captures = await responseJson<{ captures: CaptureEntry[] }>(captureResponse);
      setTracks(learning.tracks ?? []);
      setMaterials((captures.captures ?? []).filter((capture) => capture.status === "adopted" && capture.destinations.includes("practice")));
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load]);
  const active = tracks.find((track) => track.key === selected) ?? null;
  const trackMaterials = materials.filter((material) => material.learningTracks.includes(selected));
  const recentEntries = useMemo(() => entries.filter((entry) => entry.space === "practice" && entry.kind === `學習／${LEARNING_TRACKS[selected].title}`).slice(0, 3), [entries, selected]);
  const currentWeek = useMemo(() => mondayOf(taipeiTodayISO()), []);
  const weeklyActivities = active?.activityLog.filter((activity) => activity.weekStart === currentWeek) ?? [];

  function selectTrack(key: LearningTrackKey) { setSelected(key); setEditing(false); setDraft(null); }
  function beginEdit() { if (active) { setDraft(structuredClone(active)); setEditing(true); } }
  function startLearning() {
    const config = LEARNING_TRACKS[selected];
    startTimerWith({ space: "practice", title: `${config.title}・${active?.currentFocus || active?.currentStage || "一段修習"}`, kind: `學習／${config.title}` });
    router.push("/timer");
  }
  async function save() {
    if (!draft) return; setSaving(true); setError(null);
    try {
      const response = await fetch("/api/dojo/learning", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: selected, track: draft }) });
      const result = await responseJson<{ track: LearningTrackRecord }>(response);
      setTracks((previous) => previous.map((track) => track.key === selected ? result.track : track)); setEditing(false); setDraft(null);
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
    finally { setSaving(false); }
  }

  if (loading) return <div className="empty">正在打開學習路徑…</div>;
  if (error && tracks.length === 0) return <p className="form-error">{error}<button className="text-link" onClick={() => void load()}>重新讀取</button></p>;

  return <section className="learning-paths">
    <div className="learning-heading"><div><span className="eyebrow">心・知</span><h2>學習路徑</h2><p>知道正在學什麼、下一步做什麼，也能接住野採送來的材料。</p></div></div>
    <div className="reading-module-entry">
      <div><span className="eyebrow">獨立閱讀流程</span><h3>閱讀萃取</h3><p>先留下文獻紀錄，再把自己的理解提煉成可行動的洞察。</p></div>
      <div><Link className="primary" href="/reading">打開書架</Link><Link href="/reading/visits">今日回訪</Link></div>
    </div>
    <div className="learning-track-grid">{(Object.keys(LEARNING_TRACKS) as LearningTrackKey[]).map((key) => {
      const config = LEARNING_TRACKS[key]; const track = tracks.find((item) => item.key === key); const materialCount = materials.filter((item) => item.learningTracks.includes(key)).length;
      return <button type="button" key={key} className={selected === key ? "on" : ""} onClick={() => selectTrack(key)} style={{ "--track-color": config.color } as React.CSSProperties}><span>{config.short}</span><b>{config.title}</b><small>{track?.currentStage || config.defaultStage}</small>{materialCount > 0 && <em>{materialCount} 份待學素材</em>}</button>;
    })}</div>

    {active && <article className="learning-detail" style={{ "--track-color": LEARNING_TRACKS[selected].color } as React.CSSProperties}>
      <div className="learning-detail-head"><div><span className="label">目前路徑</span><h3>{LEARNING_TRACKS[selected].title}</h3></div><button className="text-link" onClick={beginEdit}>調整路徑</button></div>
      {!editing ? <>
        <div className="learning-facts"><div><small>長期目標</small><p>{active.goal}</p></div><div><small>目前階段</small><p>{active.currentStage}</p></div><div><small>現在專注</small><p>{active.currentFocus || "還沒指定本次專注內容"}</p></div><div className="next"><small>下一步</small><p>{active.nextAction || "先選一個能立刻開始的小練習"}</p></div></div>
        {selected === "english" && active.english && <div className="english-pilot"><div className="cefr-route"><span>{active.english.currentLevel}</span><i>→</i><span>{active.english.targetLevel}</span></div><div><small>目前週盤模式</small><p>{active.english.weeklyMode === "vocabulary-growth" ? "後三個月・詞彙擴充" : "前三個月・書面習慣建立"}</p><small>目前加強</small><p>{active.english.focusSkills.join("、") || "尚未選擇"}</p><small>下一個檢核</small><p>{active.english.checkpoint}</p></div></div>}
      </> : draft && <div className="learning-editor">
        <label>長期目標</label><textarea className="field" rows={2} value={draft.goal} onChange={(event) => setDraft({ ...draft, goal: event.target.value })} />
        <label>目前階段</label><input className="field" value={draft.currentStage} onChange={(event) => setDraft({ ...draft, currentStage: event.target.value })} />
        <label>現在專注</label><input className="field" value={draft.currentFocus} onChange={(event) => setDraft({ ...draft, currentFocus: event.target.value })} placeholder="這一輪正在學什麼？" />
        <label>下一步</label><input className="field" value={draft.nextAction} onChange={(event) => setDraft({ ...draft, nextAction: event.target.value })} placeholder="下一個可以直接開始的動作" />
        {selected === "english" && draft.english && <div className="english-editor"><label>週盤學習階段</label><select className="field" value={draft.english.weeklyMode} onChange={(event) => setDraft({ ...draft, english: { ...draft.english!, weeklyMode: event.target.value === "vocabulary-growth" ? "vocabulary-growth" : "foundation-writing" } })}><option value="foundation-writing">前三個月・書面習慣建立</option><option value="vocabulary-growth">後三個月・詞彙擴充</option></select><div className="two"><div><label>目前 CEFR</label><select className="field" value={draft.english.currentLevel} onChange={(event) => setDraft({ ...draft, english: { ...draft.english!, currentLevel: event.target.value as CefrLevel } })}>{["A1","A2","B1","B2","C1"].map((level) => <option key={level}>{level}</option>)}</select></div><div><label>目標</label><select className="field" value={draft.english.targetLevel} onChange={(event) => setDraft({ ...draft, english: { ...draft.english!, targetLevel: event.target.value as CefrLevel } })}>{["A1","A2","B1","B2","C1"].map((level) => <option key={level}>{level}</option>)}</select></div></div><label>目前加強面向</label><div className="learning-chip-row">{ENGLISH_SKILLS.map((skill) => <button type="button" key={skill} className={draft.english!.focusSkills.includes(skill) ? "on" : ""} onClick={() => setDraft({ ...draft, english: { ...draft.english!, focusSkills: draft.english!.focusSkills.includes(skill) ? draft.english!.focusSkills.filter((item) => item !== skill) : [...draft.english!.focusSkills, skill as EnglishSkill] } })}>{skill}</button>)}</div><label>下一個檢核</label><textarea className="field" rows={2} value={draft.english.checkpoint} onChange={(event) => setDraft({ ...draft, english: { ...draft.english!, checkpoint: event.target.value } })} /></div>}
        {error && <p className="form-error">{error}</p>}<div className="learning-editor-actions"><button onClick={() => { setEditing(false); setDraft(null); }}>取消</button><button className="primary" onClick={() => void save()} disabled={saving}>{saving ? "儲存中…" : "儲存路徑"}</button></div>
      </div>}

      {!editing && <div className="learning-actions"><button className="primary" onClick={startLearning}>◷ 開始這次修習</button><button onClick={() => openQuickAdd({ presetSpace: "practice", presetKind: `學習／${LEARNING_TRACKS[selected].title}` })}>留下修習紀錄</button></div>}
      {!editing && selected === "english" && <div className="learning-resources weekly-learning-progress"><div className="subsection-title"><h4>本週週盤進度</h4><Link href="/bingo">前往週盤 →</Link></div>{weeklyActivities.length === 0 ? <p className="muted-note">本週英文格尚未開始；可從週盤加入英文五格。</p> : weeklyActivities.map((activity) => <div className="learning-material" key={activity.id}><div><b>{activity.skill}・{activity.progress}/{activity.target} {activity.unit}</b><small>{activity.evidenceNote || (activity.completedAt ? "已完成" : "進行中")}</small></div><span>{activity.completedAt ? "✓" : ""}</span></div>)}</div>}
      {!editing && <div className="learning-resources"><div className="subsection-title"><h4>從野採送來的素材</h4><span>{trackMaterials.length}</span></div>{trackMaterials.length === 0 ? <p className="muted-note">目前沒有待學素材；可在野採將材料連到這條路徑。</p> : trackMaterials.map((material) => <div className="learning-material" key={material.id}><div><b>{material.title}</b><small>{material.forageSummary || material.excerpt || "尚未留下摘要"}</small></div>{material.sourceUrl && <a href={material.sourceUrl} target="_blank" rel="noreferrer">來源 ↗</a>}</div>)}</div>}
      {!editing && recentEntries.length > 0 && <div className="learning-resources"><div className="subsection-title"><h4>最近修習</h4></div>{recentEntries.map((entry) => <div className="learning-material" key={entry.id}><div><b>{entry.title}</b><small>{entry.date}{entry.note ? `・${entry.note}` : ""}</small></div></div>)}</div>}
    </article>}
  </section>;
}
