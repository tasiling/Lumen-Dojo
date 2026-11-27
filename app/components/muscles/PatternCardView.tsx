"use client";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "../PracticeRouteLink";
import LocalWindow from "./LocalWindow";
import { muscleFetch, practiceCardHref, type MuscleSnapshot } from "./muscleApi";
import { muscleByKey } from "@/lib/dojo/muscleCards/catalog";
import { PATTERN_FIELDS, TENDENCY_LABELS, patternMembers, type PatternCard, type Tendency } from "@/lib/dojo/muscleCards/model";
import { MUSCLE_KIND, PATTERN_KIND } from "@/lib/dojo/muscleCards/network";

type Draft = Pick<PatternCard, "name" | "description" | "observation" | "source">;
const draftOf = (p: PatternCard): Draft => ({ name: p.name, description: p.description, observation: p.observation, source: p.source });

/** 姿勢型態卡：名稱、說明、觀察重點、出處，加上從肌肉卡自動列出的偏緊與偏弱肌肉。 */
export default function PatternCardView({ pattern, snapshot, refresh }: { pattern: PatternCard; snapshot: MuscleSnapshot; refresh: () => Promise<void> }) {
  const params = useSearchParams();
  const [draft, setDraft] = useState<Draft>(draftOf(pattern));
  const [seenRevision, setSeenRevision] = useState(pattern.revision);
  if (seenRevision !== pattern.revision) {
    setSeenRevision(pattern.revision);
    setDraft(draftOf(pattern));
  }
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const dirty = JSON.stringify(draft) !== JSON.stringify(draftOf(pattern));
  const members = patternMembers(snapshot.cards, pattern.id);
  async function save() {
    setBusy(true);
    setNotice("");
    try {
      await muscleFetch("/api/dojo/muscles", { method: "POST", body: { action: "edit-pattern", id: pattern.id, revision: pattern.revision, input: draft } });
      await refresh();
      setNotice("型態卡已保存。");
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "尚未保存。");
    } finally {
      setBusy(false);
    }
  }
  const list = (tendency: Tendency, title: string) => {
    const group = members.filter((m) => m.tendency === tendency);
    if (!group.length && tendency === "") return null;
    return <div className="muscle-link-group">
      <h4>{title}</h4>
      {group.length ? <ul>{group.map((m) => <li key={m.muscle}>
        <Link href={practiceCardHref({ kind: MUSCLE_KIND, id: m.muscle }, params)}>{muscleByKey(m.muscle)?.name ?? m.muscle}</Link>
      </li>)}</ul> : <p className="muscle-muted">還沒有肌肉卡標記{title}。</p>}
    </div>;
  };
  return <article className="card muscle-card" aria-labelledby={`pattern-title-${pattern.id}`}>
    <header className="muscle-card-header">
      <p className="muscle-kicker">姿勢型態卡</p>
      <h2 id={`pattern-title-${pattern.id}`}>{pattern.name}</h2>
    </header>
    <form className="muscle-section-form" onSubmit={(e) => { e.preventDefault(); void save(); }}>
      <div className="muscle-field">
        <label htmlFor={`pattern-${pattern.id}-name`}>名稱</label>
        <input id={`pattern-${pattern.id}-name`} value={draft.name} maxLength={120} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} />
      </div>
      {PATTERN_FIELDS.map((f) => <div className="muscle-field" key={f.key}>
        <label htmlFor={`pattern-${pattern.id}-${f.key}`}>{f.label}</label>
        <textarea id={`pattern-${pattern.id}-${f.key}`} rows={3} maxLength={4000} value={draft[f.key]} onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))} />
      </div>)}
      <div className="muscle-form-actions">
        <button type="submit" className="primary" disabled={busy || !dirty || !draft.name.trim()}>{busy ? "保存中…" : "保存型態卡"}</button>
      </div>
      {notice && <p role="status">{notice}</p>}
    </form>
    <section className="muscle-layer" aria-label="在這個型態中的肌肉">
      <h3>在這個型態中的肌肉</h3>
      <p className="muscle-muted">從各張肌肉卡的姿勢評估分頁自動列出；要調整，請到肌肉卡修改。</p>
      {list("tight", TENDENCY_LABELS.tight)}
      {list("weak", TENDENCY_LABELS.weak)}
      {list("", "尚未填偏緊或偏弱")}
    </section>
    <LocalWindow self={{ kind: PATTERN_KIND, id: pattern.id }} snapshot={snapshot} onChanged={refresh} allowAdd={false} />
  </article>;
}
