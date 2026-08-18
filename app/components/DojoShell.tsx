"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useDojo } from "@/lib/dojo/store";
import {
  GUANGFA,
  GUANGXING,
  SPACES,
  SPACE_TO_SOURCE_TYPE,
  type DojoEntry,
  type GuangfaKey,
  type GuangxingKey,
  type Privacy,
  type SpaceKey,
} from "@/lib/dojo/constants";
import { taipeiTodayISO } from "@/lib/dojo/formal";
import { useBackStack, useBackableState } from "@/lib/dojo/backstack";
import { NO_BACK_BUTTON, PARENT_ROUTE, ROUTE_LABEL, USE_BROWSER_BACK } from "@/lib/dojo/backroutes";

function currentSpaceFromPath(pathname: string): SpaceKey {
  const key = pathname.replace(/^\//, "") as SpaceKey;
  return key in SPACES ? key : "practice";
}

function BackButton({ pathname }: { pathname: string }) {
  const router = useRouter();
  const { depth } = useBackStack();
  if (NO_BACK_BUTTON.has(pathname)) return null;

  const useBrowserBack = USE_BROWSER_BACK.has(pathname);
  const parent = PARENT_ROUTE[pathname] ?? "/";
  const label = useBrowserBack ? "返回" : (ROUTE_LABEL[parent] ?? "今天");

  function handleClick() {
    if (depth() > 0 || useBrowserBack) {
      router.back();
      return;
    }
    router.push(parent);
  }

  return (
    <button className="backbtn" onClick={handleClick} aria-label={`返回${label}`}>
      ‹ {label}
    </button>
  );
}

const NAV_ITEMS = [
  { key: "today", icon: "☀", label: "今天", href: "/" },
  { key: "calendar", icon: "▦", label: "行事曆", href: "/calendar" },
  { key: "add", icon: "＋", label: "新增" },
  { key: "bingo", icon: "◇", label: "週盤", href: "/bingo" },
  { key: "review", icon: "◷", label: "回看", href: "/review" },
] as const;

const PRIVACY_OPTIONS: Privacy[] = ["私人", "限閱", "公開"];

export default function DojoShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const {
    entries,
    addEntry,
    updateEntry,
    modalOpen,
    modalOptions,
    openQuickAdd,
    closeQuickAdd,
    startTimerFromSpace,
  } = useDojo();

  useBackableState(modalOpen, closeQuickAdd);

  function openTimerFromHere() {
    startTimerFromSpace(currentSpaceFromPath(pathname));
    router.push("/timer");
  }

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <div className="dojo">
      <main className="app">
        <header className="top">
          {pathname === "/" ? <div className="brand">行光道場</div> : <BackButton pathname={pathname} />}
          <div className="top-actions">
            <button onClick={openTimerFromHere}>◷ 計時</button>
            <button onClick={() => router.push("/map")}>⌘ 場域</button>
          </div>
        </header>
        <div id="view">{children}</div>
      </main>

      <nav className="nav" aria-label="主要導覽">
        {NAV_ITEMS.map((item) =>
          "href" in item ? (
            <button
              key={item.key}
              className={isActive(item.href) ? "on" : ""}
              onClick={() => router.push(item.href)}
            >
              <span>{item.icon}</span>
              {item.label}
            </button>
          ) : (
            <button key={item.key} className={modalOpen ? "on" : ""} onClick={() => openQuickAdd()}>
              <span>{item.icon}</span>
              {item.label}
            </button>
          )
        )}
      </nav>

      {modalOpen && (
        <QuickAddModal
          key={`${modalOptions.editId ?? "new"}-${modalOptions.mode ?? "record"}`}
          entry={modalOptions.editId ? entries.find((entry) => entry.id === modalOptions.editId) : undefined}
          presetSpace={modalOptions.presetSpace}
          presetKind={modalOptions.presetKind}
          presetDate={modalOptions.presetDate}
          initialMode={modalOptions.mode}
          onClose={closeQuickAdd}
          onSaveRecord={async (data) => {
            if (modalOptions.editId) await updateEntry(modalOptions.editId, data);
            else await addEntry(data);
          }}
        />
      )}
    </div>
  );
}

type RecordPayload = Omit<DojoEntry, "id" | "createdAt" | "updatedAt">;

function QuickAddModal({
  entry,
  presetSpace,
  presetKind,
  presetDate,
  initialMode,
  onClose,
  onSaveRecord,
}: {
  entry?: DojoEntry;
  presetSpace?: SpaceKey;
  presetKind?: string;
  presetDate?: string;
  initialMode?: "record" | "calendar";
  onClose: () => void;
  onSaveRecord: (data: RecordPayload) => Promise<void>;
}) {
  const [mode, setMode] = useState<"record" | "calendar">(entry ? "record" : (initialMode ?? "record"));
  const [title, setTitle] = useState(entry?.title ?? "");
  const [note, setNote] = useState(entry?.note ?? "");
  const [date, setDate] = useState(entry?.date || presetDate || taipeiTodayISO());
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [space, setSpace] = useState<SpaceKey>(entry?.space ?? presetSpace ?? "practice");
  const [kind, setKind] = useState(entry?.kind ?? presetKind ?? "");
  const [guangxing, setGuangxing] = useState<GuangxingKey | null>(entry?.guangxing ?? null);
  const [guangfa, setGuangfa] = useState<GuangfaKey | null>(entry?.guangfa ?? null);
  const [privacy, setPrivacy] = useState<Privacy>(entry?.privacy ?? "私人");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !saving) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, saving]);

  async function submit() {
    if (!title.trim()) {
      setError("請先填寫標題。");
      return;
    }
    if (!date) {
      setError("請先選擇日期。");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (mode === "calendar") {
        const response = await fetch("/api/dojo/calendar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, note, date, startTime, endTime, space, kind: kind.trim() || "行程" }),
        });
        const json = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(json.error ?? `儲存失敗（${response.status}）`);
        window.dispatchEvent(new CustomEvent("dojo:calendar-changed", { detail: json.item }));
      } else {
        await onSaveRecord({
          title: title.trim(),
          note: note.trim() || undefined,
          date,
          space,
          kind: kind.trim() || "紀錄",
          guangxing,
          guangfa,
          privacy,
          sourceType: SPACE_TO_SOURCE_TYPE[space],
          traceLevel: entry?.traceLevel ?? "daily",
          traceStatus: entry?.traceStatus ?? "一般",
          viewCount: entry?.viewCount ?? 0,
          freq: entry?.freq,
          intensity: entry?.intensity,
          traceId: entry?.traceId,
        });
      }
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal show" onClick={(event) => event.target === event.currentTarget && !saving && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="quick-add-title">
        <div className="toolbar">
          <h2 id="quick-add-title">{entry ? "編輯紀錄" : "新增"}</h2>
          <button onClick={onClose} disabled={saving}>關閉</button>
        </div>

        {!entry && (
          <div className="segmented" aria-label="新增類型">
            <button className={mode === "record" ? "on" : ""} onClick={() => setMode("record")}>快速紀錄</button>
            <button className={mode === "calendar" ? "on" : ""} onClick={() => setMode("calendar")}>新增行程</button>
          </div>
        )}

        <label htmlFor="quick-title">{mode === "record" ? "標題／一句話" : "行程名稱"}</label>
        <input
          id="quick-title"
          className="field"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder={mode === "record" ? "此刻想留下什麼？" : "要安排什麼？"}
          autoFocus
        />

        <label htmlFor="quick-date">日期</label>
        <input id="quick-date" className="field" type="date" value={date} onChange={(event) => setDate(event.target.value)} />

        {mode === "calendar" && (
          <div className="two">
            <div>
              <label htmlFor="quick-start">開始</label>
              <input id="quick-start" className="field" type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} />
            </div>
            <div>
              <label htmlFor="quick-end">結束</label>
              <input id="quick-end" className="field" type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} />
            </div>
          </div>
        )}

        <label htmlFor="quick-note">說明（可留白）</label>
        <textarea
          id="quick-note"
          className="field"
          rows={3}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="描述、感受、來源或下一步"
        />

        <label>場域</label>
        <div className="row">
          {Object.entries(SPACES).map(([key, value]) => (
            <button key={key} className={space === key ? "on" : ""} onClick={() => setSpace(key as SpaceKey)}>
              {value[0]}
            </button>
          ))}
        </div>

        <label htmlFor="quick-kind">類型</label>
        <input
          id="quick-kind"
          className="field"
          value={kind}
          onChange={(event) => setKind(event.target.value)}
          placeholder={mode === "record" ? "例如：提問、練習、草稿" : "例如：約定、修習、活動"}
        />

        {mode === "record" && (
          <>
            <label>光行（選填）</label>
            <div className="row">
              <button className={guangxing === null ? "on" : ""} onClick={() => setGuangxing(null)}>不標記</button>
              {Object.entries(GUANGXING).map(([key, value]) => (
                <button key={key} className={guangxing === key ? "on" : ""} onClick={() => setGuangxing(key as GuangxingKey)}>
                  {value[0]}
                </button>
              ))}
            </div>

            <label>光法（選填）</label>
            <div className="row">
              <button className={guangfa === null ? "on" : ""} onClick={() => setGuangfa(null)}>不標記</button>
              {Object.entries(GUANGFA).map(([key, value]) => (
                <button key={key} className={guangfa === key ? "on" : ""} onClick={() => setGuangfa(key as GuangfaKey)}>
                  {value[0]}
                </button>
              ))}
            </div>

            <label>隱私</label>
            <div className="row">
              {PRIVACY_OPTIONS.map((option) => (
                <button key={option} className={privacy === option ? "on" : ""} onClick={() => setPrivacy(option)}>
                  {option}
                </button>
              ))}
            </div>
          </>
        )}

        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="primary" onClick={submit} disabled={saving}>
          {saving ? "儲存中…" : mode === "record" ? "儲存紀錄" : "加入行事曆"}
        </button>
      </div>
    </div>
  );
}
