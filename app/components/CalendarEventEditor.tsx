"use client";

import { useEffect, useRef, useState } from "react";
import { SPACES, type SpaceKey } from "@/lib/dojo/constants";
import type { PersonalCalendarItem } from "@/lib/dojo/formal";
import { calendarEditError } from "@/lib/dojo/todayCalendarUi";

export default function CalendarEventEditor({ item, onClose, onSaved }: { item: PersonalCalendarItem; onClose: () => void; onSaved: (item: PersonalCalendarItem) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const inFlight = useRef(false);
  const [draft, setDraft] = useState(item);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const node = dialog.current;
    node?.showModal();
    return () => node?.close();
  }, []);

  async function save() {
    if (inFlight.current) return;
    const issue = calendarEditError(draft);
    if (issue) { setError(issue); return; }
    inFlight.current = true;
    setSaving(true); setError(null);
    try {
      const response = await fetch("/api/dojo/calendar", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, item: { ...draft, title: draft.title.trim() } }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.item) throw new Error(json.error ?? `儲存失敗（${response.status}）`);
      onSaved(json.item);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally { inFlight.current = false; setSaving(false); }
  }

  return (
    <dialog ref={dialog} className="tc-event-editor" aria-labelledby="tc-event-editor-title" onCancel={event => { event.preventDefault(); if (!saving) onClose(); }}>
      <form onSubmit={event => { event.preventDefault(); if (!saving) void save(); }}>
        <fieldset disabled={saving}>
        <div className="section-heading"><h2 id="tc-event-editor-title">編輯行程</h2><button type="button" onClick={onClose} disabled={saving}>關閉</button></div>
        <label htmlFor="tc-event-title">行程名稱</label><input id="tc-event-title" className="field" value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} required autoFocus />
        <label htmlFor="tc-event-date">日期</label><input id="tc-event-date" className="field" type="date" value={draft.date} onChange={e => setDraft({ ...draft, date: e.target.value })} required />
        <div className="tc-event-times">
          <div><label htmlFor="tc-event-start">開始</label><input id="tc-event-start" className="field" type="time" value={draft.startTime} onChange={e => setDraft({ ...draft, startTime: e.target.value })} /></div>
          <div><label htmlFor="tc-event-end">結束</label><input id="tc-event-end" className="field" type="time" value={draft.endTime} onChange={e => setDraft({ ...draft, endTime: e.target.value })} /></div>
        </div>
        <label htmlFor="tc-event-note">說明</label><textarea id="tc-event-note" className="field" rows={3} value={draft.note} onChange={e => setDraft({ ...draft, note: e.target.value })} />
        <label htmlFor="tc-event-space">場域</label><select id="tc-event-space" className="field" value={draft.space} onChange={e => setDraft({ ...draft, space: e.target.value as SpaceKey })}>{Object.entries(SPACES).map(([key, value]) => <option key={key} value={key}>{value[0]}</option>)}</select>
        <label htmlFor="tc-event-kind">類型</label><input id="tc-event-kind" className="field" value={draft.kind} onChange={e => setDraft({ ...draft, kind: e.target.value })} />
        {error && <p className="form-error" role="alert">{error}</p>}
        <button type="submit" className="primary" disabled={saving}>{saving ? "儲存中…" : "儲存修改"}</button>
        </fieldset>
      </form>
    </dialog>
  );
}
