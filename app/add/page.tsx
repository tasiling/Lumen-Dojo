"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import {CaptureForm} from "@/app/components/ForageCaptureForm";
import ReadingQuickCapture from "@/app/components/ReadingQuickCapture";
import { SPACES, type SpaceKey } from "@/lib/dojo/constants";
import {
  taipeiTodayISO,
} from "@/lib/dojo/formal";

async function responseJson<T>(response: Response): Promise<T> {
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((json as { error?: string }).error ?? `儲存失敗（${response.status}）`);
  }
  return json as T;
}

export default function AddPage() {
  const [mode, setMode] = useState<"capture" | "reading" | "calendar">("capture");

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("mode") !== "reading") return;
    const timer = window.setTimeout(() => setMode("reading"), 0);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <section className="screen add-screen">
      <div className="capture-hero">
        <span className="capture-spark" aria-hidden="true">✦</span>
        <div>
          <span className="eyebrow">新增</span>
          <h1>{mode === "capture" ? "擷取" : mode === "reading" ? "閱讀摘錄" : "排入行程"}</h1>
          <p>
            {mode === "capture"
              ? "先把一閃而過的素材接住，分類與關聯留到野採。"
              : mode === "reading"
                ? "把 Readmoo 的原文與自己的想法分開，直接存回正在閱讀的書。"
                : "把已經確定時間的事情，放進行事曆。"}
          </p>
        </div>
      </div>

      <div className="segmented add-mode-tabs" aria-label="新增方式">
        <button type="button" className={mode === "capture" ? "on" : ""} onClick={() => setMode("capture")}>
          ✦ 擷取
        </button>
        <button type="button" className={mode === "reading" ? "on" : ""} onClick={() => setMode("reading")}>
          閱讀摘錄
        </button>
        <button type="button" className={mode === "calendar" ? "on" : ""} onClick={() => setMode("calendar")}>
          ◷ 排入行程
        </button>
      </div>

      {mode === "capture" ? <CaptureForm /> : mode === "reading" ? <ReadingQuickCapture /> : <CalendarForm />}
    </section>
  );
}

function CalendarForm() {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(taipeiTodayISO());
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [space, setSpace] = useState<SpaceKey>("practice");
  const [kind, setKind] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedTitle, setSavedTitle] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim() || !date) {
      setError("請填寫行程名稱與日期。");
      return;
    }

    setSaving(true);
    setError(null);
    setSavedTitle(null);
    try {
      const response = await fetch("/api/dojo/calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          note: note.trim(),
          date,
          startTime,
          endTime,
          space,
          kind: kind.trim() || "行程",
        }),
      });
      await responseJson(response);
      setSavedTitle(title.trim());
      setTitle("");
      setStartTime("");
      setEndTime("");
      setKind("");
      setNote("");
      window.dispatchEvent(new CustomEvent("dojo:calendar-changed"));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="capture-form-card calendar-form-card" onSubmit={submit}>
      <div className="capture-card-heading">
        <div>
          <span className="label">時間安排</span>
          <h2>新增一段行程</h2>
        </div>
        <Link href="/calendar" className="capture-calendar-link">查看行事曆</Link>
      </div>
      <p className="capture-guidance">只有已經確定日期的事情才需要放在這裡。</p>

      {savedTitle && (
        <div className="capture-success" role="status">
          <div>
            <b>已加入行事曆</b>
            <span>「{savedTitle}」已保存。</span>
          </div>
          <Link href="/calendar">前往查看 →</Link>
        </div>
      )}

      <label htmlFor="calendar-title">行程名稱 <span aria-hidden="true">＊</span></label>
      <input
        id="calendar-title"
        className="field"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="要安排什麼？"
        maxLength={300}
        required
      />

      <label htmlFor="calendar-date">日期 <span aria-hidden="true">＊</span></label>
      <input id="calendar-date" className="field" type="date" value={date} onChange={(event) => setDate(event.target.value)} required />

      <div className="two capture-time-row">
        <div>
          <label htmlFor="calendar-start">開始</label>
          <input id="calendar-start" className="field" type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} />
        </div>
        <div>
          <label htmlFor="calendar-end">結束</label>
          <input id="calendar-end" className="field" type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} />
        </div>
      </div>

      <label htmlFor="calendar-space">場域</label>
      <select id="calendar-space" className="field" value={space} onChange={(event) => setSpace(event.target.value as SpaceKey)}>
        {Object.entries(SPACES).map(([key, value]) => (
          <option key={key} value={key}>{value[0]} · {value[2]}</option>
        ))}
      </select>

      <label htmlFor="calendar-kind">行程類型</label>
      <input
        id="calendar-kind"
        className="field"
        value={kind}
        onChange={(event) => setKind(event.target.value)}
        placeholder="例如：約定、修習、活動"
        maxLength={100}
      />

      <label htmlFor="calendar-note">說明</label>
      <textarea
        id="calendar-note"
        className="field"
        rows={4}
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder="地點、準備事項或其他補充"
        maxLength={3000}
      />

      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="primary capture-submit" type="submit" disabled={saving}>
        {saving ? "正在加入…" : "加入行事曆"}
      </button>
    </form>
  );
}
