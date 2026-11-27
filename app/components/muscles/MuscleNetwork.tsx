"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { practiceCardHref, readSnapshot, type MuscleSnapshot } from "./muscleApi";
import { MUSCLES, REGION_PATHS } from "@/lib/dojo/muscleCards/catalog";
import { LINK_TYPES, neighbors, refKey, type CardRef, type LinkType, type NetworkLink } from "@/lib/dojo/daoLinks/model";
import { MUSCLE_KIND, PATTERN_KIND, cardLabel } from "@/lib/dojo/muscleCards/network";

/** 道藏肌肉知識網絡：全部肌肉卡、型態卡與連結。卡片內容在修習所編輯，連結資料在道藏。 */
export default function MuscleNetwork() {
  const [snapshot, setSnapshot] = useState<MuscleSnapshot | null>(null);
  const [error, setError] = useState("");
  const [focus, setFocus] = useState("");
  useEffect(() => {
    let live = true;
    readSnapshot().then((s) => { if (live) setSnapshot(s); }).catch((e) => { if (live) setError(e.message); });
    return () => { live = false; };
  }, []);
  const card = (ref: CardRef) => snapshot ? <Link href={practiceCardHref(ref, null)}>{cardLabel(ref, snapshot.patterns)}</Link> : null;
  const focusRef: CardRef | null = focus ? { kind: focus.split(":")[0], id: focus.slice(focus.indexOf(":") + 1) } : null;
  const shown: NetworkLink[] = snapshot ? (focusRef ? neighbors(snapshot.links, focusRef).map((n) => n.link) : snapshot.links) : [];
  return <section className="screen dao-workspace muscle-network">
    <Link className="dao-link" href="/dao">‹ 回道藏</Link>
    <div className="hero da"><span className="eyebrow">道藏</span><h1>肌肉知識網絡</h1>
      <p>全部的肌肉卡、姿勢型態卡與它們之間的連結。卡片內容在修習所的按摩知識裡編輯；點卡片名稱會打開那張卡。</p></div>
    {error && <p className="form-error" role="alert">{error}</p>}
    {!snapshot && !error && <div className="dao-empty">正在讀取…</div>}
    {snapshot && <>
      <section className="card">
        <h2>連結</h2>
        <label className="muscle-network-filter">只看和這張卡直接相連的
          <select value={focus} onChange={(e) => setFocus(e.target.value)}>
            <option value="">全部連結</option>
            {REGION_PATHS.map((r) => <optgroup key={r.key} label={r.name}>
              {MUSCLES.filter((m) => m.region === r.key).map((m) => <option key={m.key} value={refKey({ kind: MUSCLE_KIND, id: m.key })}>{m.name}</option>)}
            </optgroup>)}
            <optgroup label="姿勢型態">
              {snapshot.patterns.map((p) => <option key={p.id} value={refKey({ kind: PATTERN_KIND, id: p.id })}>{p.name}</option>)}
            </optgroup>
          </select>
        </label>
        {!shown.length && <p className="muscle-muted">{focusRef ? "這張卡還沒有連結。" : "還沒有連結。可以在修習所的肌肉卡上新增；姿勢評估選了型態會自動連上。"}</p>}
        {(Object.keys(LINK_TYPES) as LinkType[]).map((type) => {
          const group = shown.filter((l) => l.type === type);
          if (!group.length) return null;
          return <div className="muscle-link-group muscle-network-links" key={type}>
            <h3>{LINK_TYPES[type]}</h3>
            <ul>{group.map((l) => <li key={l.id}>
              {card(l.a)}<span aria-hidden="true">—</span>{card(l.b)}
              {l.note && <span className="muscle-link-note">{l.note}</span>}
              {l.derived && <small className="muscle-muted">由姿勢評估自動產生</small>}
            </li>)}</ul>
          </div>;
        })}
      </section>
      <section className="card">
        <h2>肌肉卡</h2>
        {REGION_PATHS.map((r) => <div key={r.key} className="muscle-link-group">
          <h3>{r.name}</h3>
          <ul className="muscle-path-list">{MUSCLES.filter((m) => m.region === r.key).map((m) => <li key={m.key}>{card({ kind: MUSCLE_KIND, id: m.key })}</li>)}</ul>
        </div>)}
      </section>
      <section className="card">
        <h2>姿勢型態卡</h2>
        <ul className="muscle-path-list">{snapshot.patterns.map((p) => <li key={p.id}>{card({ kind: PATTERN_KIND, id: p.id })}</li>)}</ul>
      </section>
    </>}
  </section>;
}
