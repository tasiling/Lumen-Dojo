"use client";
import { useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "../PracticeRouteLink";
import { LINK_TYPES, MANUAL_LINK_TYPES, neighbors, type CardRef, type LinkType } from "@/lib/dojo/daoLinks/model";
import { MUSCLES, REGION_PATHS } from "@/lib/dojo/muscleCards/catalog";
import { MUSCLE_KIND, cardLabel } from "@/lib/dojo/muscleCards/network";
import { muscleFetch, practiceCardHref, type MuscleSnapshot } from "./muscleApi";

/** 局部視窗：只顯示和這張卡直接相連的卡。資料在道藏，這裡可以新增手動連結。 */
export default function LocalWindow({ self, snapshot, onChanged, allowAdd }: {
  self: CardRef; snapshot: MuscleSnapshot; onChanged: () => Promise<void>; allowAdd: boolean;
}) {
  const params = useSearchParams();
  const near = neighbors(snapshot.links, self);
  const [type, setType] = useState<LinkType>("synergist");
  const [target, setTarget] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const request = useRef("");
  async function add() {
    if (!target) return;
    setBusy(true);
    setNotice("");
    request.current ||= crypto.randomUUID();
    try {
      await muscleFetch("/api/dojo/dao/links", {
        method: "POST",
        body: { createRequestId: request.current, input: { a: self, b: { kind: MUSCLE_KIND, id: target }, type, note } },
      });
      request.current = "";
      setTarget("");
      setNote("");
      await onChanged();
      setNotice("連結已存進道藏。");
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "連結尚未保存。");
    } finally {
      setBusy(false);
    }
  }
  async function remove(id: string, label: string) {
    if (!window.confirm(`刪除和「${label}」的這條連結？`)) return;
    setBusy(true);
    setNotice("");
    try {
      await muscleFetch("/api/dojo/dao/links", { method: "DELETE", body: { id } });
      await onChanged();
      setNotice("連結已刪除。");
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "連結尚未刪除。");
    } finally {
      setBusy(false);
    }
  }
  return <section className="muscle-local-window" aria-labelledby="muscle-local-title">
    <h3 id="muscle-local-title">直接相連的卡</h3>
    {!near.length && <p className="muscle-muted">還沒有連結。</p>}
    {(Object.keys(LINK_TYPES) as LinkType[]).map((linkType) => {
      const group = near.filter((n) => n.link.type === linkType);
      if (!group.length) return null;
      return <div className="muscle-link-group" key={linkType}>
        <h4>{LINK_TYPES[linkType]}</h4>
        <ul>{group.map(({ link, other }) => {
          const label = cardLabel(other, snapshot.patterns);
          return <li key={link.id}>
            <Link href={practiceCardHref(other, params)}>{label}</Link>
            {link.note && <span className="muscle-link-note">{link.note}</span>}
            {link.derived
              ? <small className="muscle-muted">由姿勢評估自動產生</small>
              : <button type="button" className="muscle-text-button" disabled={busy} onClick={() => void remove(link.id, label)}>刪除連結</button>}
          </li>;
        })}</ul>
      </div>;
    })}
    {allowAdd && <details className="muscle-add-link">
      <summary>新增連結</summary>
      <div className="muscle-form-grid">
        <label>連結類型
          <select value={type} onChange={(e) => setType(e.target.value as LinkType)}>
            {MANUAL_LINK_TYPES.map((t) => <option key={t} value={t}>{LINK_TYPES[t]}</option>)}
          </select>
        </label>
        <label>連到哪一張卡
          <select value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">請選擇肌肉卡</option>
            {REGION_PATHS.map((r) => <optgroup key={r.key} label={r.name}>
              {MUSCLES.filter((m) => m.region === r.key && m.key !== self.id).map((m) => <option key={m.key} value={m.key}>{m.name}</option>)}
            </optgroup>)}
          </select>
        </label>
        <label>說明
          <input value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} placeholder="例如：哪一個動作、哪一個測試" />
        </label>
        <button type="button" disabled={busy || !target} onClick={() => void add()}>{busy ? "保存中…" : "存進道藏"}</button>
      </div>
      <p className="muscle-muted">「同一個姿勢型態」不用手動建：在姿勢評估分頁選了型態就會自動連上。</p>
    </details>}
    {notice && <p role="status">{notice}</p>}
  </section>;
}
