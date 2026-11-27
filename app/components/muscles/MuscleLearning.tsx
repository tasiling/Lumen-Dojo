"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "../PracticeRouteLink";
import PracticeLearningPath from "../PracticeLearningPath";
import MuscleCard from "./MuscleCard";
import PatternCardView from "./PatternCardView";
import { muscleFetch, practiceCardHref, readSnapshot, type MuscleSnapshot } from "./muscleApi";
import { LEARNING_PATHS, isPathKey, muscleByKey, pathMuscles, type PathKey } from "@/lib/dojo/muscleCards/catalog";
import { MUSCLE_KIND, PATTERN_KIND } from "@/lib/dojo/muscleCards/network";
import type { LearningEntity } from "@/lib/dojo/learningFoundation/model";

/** 按摩知識的學習路徑：十條路徑、肌肉卡、姿勢型態卡，以及原有的既有主題。 */
export default function MuscleLearning({ item, stages, topics, readingReturn, busy, onChangeStatus }: {
  item: LearningEntity; stages: LearningEntity[]; topics: LearningEntity[]; readingReturn: string; busy: boolean;
  onChangeStatus: (topic: LearningEntity) => void;
}) {
  const params = useSearchParams();
  const requestedPath = params.get("path") ?? "";
  const path: PathKey = isPathKey(requestedPath) ? requestedPath : "head";
  const muscle = params.get("muscle");
  const patternId = params.get("pattern");
  const [snapshot, setSnapshot] = useState<MuscleSnapshot | null>(null);
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    const next = await readSnapshot();
    setSnapshot(next);
    setError("");
  }, []);
  useEffect(() => {
    let live = true;
    readSnapshot().then((s) => { if (live) setSnapshot(s); }).catch((e) => { if (live) setError(e.message); });
    return () => { live = false; };
  }, []);
  const href = (changes: Record<string, string | null>) => {
    const q = new URLSearchParams(params.toString());
    q.set("learningItem", item.id);
    q.set("tab", "path");
    for (const [k, v] of Object.entries(changes)) {
      if (v === null) q.delete(k);
      else q.set(k, v);
    }
    return `/practice/learning?${q}`;
  };
  const pathName = LEARNING_PATHS.find((p) => p.key === path)!.name;
  const openMuscle = muscle && muscleByKey(muscle) ? muscle : null;
  const openPattern = !openMuscle && patternId ? snapshot?.patterns.find((p) => p.id === patternId) : undefined;

  return <div className="muscle-learning">
    <nav className="muscle-path-nav" aria-label="學習路徑">
      {LEARNING_PATHS.map((p) => <Link key={p.key} aria-current={p.key === path ? "page" : undefined} href={href({ path: p.key, muscle: null, pattern: null })}>{p.name}</Link>)}
    </nav>
    {error && <p role="alert">{error}</p>}
    {!snapshot && !error && <p>讀取肌肉卡中…</p>}
    {snapshot && (openMuscle
      ? <>
        <Link className="muscle-back" href={href({ muscle: null })}>‹ 回到「{pathName}」路徑</Link>
        <MuscleCard key={openMuscle} muscle={openMuscle} snapshot={snapshot} refresh={refresh} massageItemId={item.id} topics={topics} />
      </>
      : openPattern
        ? <>
          <Link className="muscle-back" href={href({ pattern: null })}>‹ 回到「{pathName}」路徑</Link>
          <PatternCardView key={openPattern.id} pattern={openPattern} snapshot={snapshot} refresh={refresh} />
        </>
        : <>
          {patternId && <p role="alert">找不到這張型態卡。</p>}
          <section className="card muscle-path" aria-labelledby="muscle-path-title">
            <h2 id="muscle-path-title">{pathName}</h2>
            <ul className="muscle-path-list">
              {pathMuscles(path).map(({ muscle: m, label, meridian }) => <li key={m.key}>
                <Link href={practiceCardHref({ kind: MUSCLE_KIND, id: m.key }, params)}>
                  <b>{label}</b>{meridian && <small>{meridian}</small>}
                </Link>
              </li>)}
            </ul>
          </section>
          <PatternList snapshot={snapshot} refresh={refresh} />
        </>)}
    <section className="muscle-legacy-topics" aria-labelledby="muscle-legacy-title">
      <h2 id="muscle-legacy-title">既有主題</h2>
      <PracticeLearningPath key={item.id} stages={stages} topics={topics} readingReturn={readingReturn} busy={busy} onChangeStatus={onChangeStatus} />
    </section>
  </div>;
}

function PatternList({ snapshot, refresh }: { snapshot: MuscleSnapshot; refresh: () => Promise<void> }) {
  const params = useSearchParams();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const request = useRef("");
  async function create() {
    setSaving(true);
    setNotice("");
    request.current ||= crypto.randomUUID();
    try {
      await muscleFetch("/api/dojo/muscles", { method: "POST", body: { action: "create-pattern", createRequestId: request.current, input: { name } } });
      request.current = "";
      setName("");
      await refresh();
      setNotice("型態卡已新增。");
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "型態卡尚未新增。");
    } finally {
      setSaving(false);
    }
  }
  return <section className="card muscle-patterns" aria-labelledby="muscle-patterns-title">
    <h2 id="muscle-patterns-title">姿勢型態卡</h2>
    <ul className="muscle-path-list">
      {snapshot.patterns.map((p) => <li key={p.id}><Link href={practiceCardHref({ kind: PATTERN_KIND, id: p.id }, params)}><b>{p.name}</b></Link></li>)}
    </ul>
    <form className="muscle-form-actions" onSubmit={(e) => { e.preventDefault(); if (name.trim()) void create(); }}>
      <label className="muscle-inline-label">新的型態名稱 <input value={name} maxLength={120} onChange={(e) => setName(e.target.value)} /></label>
      <button type="submit" disabled={saving || !name.trim()}>{saving ? "新增中…" : "新增型態卡"}</button>
    </form>
    {notice && <p role="status">{notice}</p>}
  </section>;
}
