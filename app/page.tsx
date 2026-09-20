"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import EntryMeasurePanel from "@/app/components/EntryMeasurePanel";
import ManifestationMilestoneCapture from "@/app/components/ManifestationMilestoneCapture";
import { carryDateOptions, fmtDateWD } from "@/lib/closing/notionFormat";
import { SPACES, type SpaceKey } from "@/lib/dojo/constants";
import type { PersonalContinuation } from "@/lib/dojo/continuations";
import {
  DAILY_TASK_CATEGORIES,
  DOJO_TIME_ZONE,
  ENGLISH_TOUCH_TYPES,
  completedBingoLines,
  emptyDailyRecord,
  mondayOf,
  taipeiTodayISO,
  type DailyRecord,
  type DailyTaskCategory,
  type EnglishTouchType,
  type MorningDepth,
  type WeeklyBoard,
} from "@/lib/dojo/formal";
import { useDojo } from "@/lib/dojo/store";
import type { CreativeRoleProfile } from "@/lib/dojo/manifestation";

const TASK_ORDER: DailyTaskCategory[] = ["important", "hobby", "health"];
const ENGLISH_TOUCH_ORDER: EnglishTouchType[] = ["input", "output", "vocabulary", "transfer"];
const EVENING_FIELDS = {
  light: ["highlight", "practiceReflection"],
  medium: ["highlight", "practiceReflection", "block", "insight"],
  deep: ["highlight", "practiceReflection", "block", "insight", "nextAction"],
} as const;

const MORNING_DEPTHS: { key: MorningDepth; label: string; note: string }[] = [
  { key: "light", label: "輕", note: "簡單開始" },
  { key: "medium", label: "適中", note: "感恩與肯定" },
  { key: "deep", label: "深入", note: "未來日記" },
];

const EVENING_LABELS = {
  highlight: ["今天的一束光", "今天有什麼值得留下的時刻？"],
  practiceReflection: ["今天的實踐回望", "帶著今天早晨的選擇生活了一天，你經歷了什麼？"],
  block: ["今天的卡點與消耗", "今天有什麼不太順利，或讓你感到消耗的地方？"],
  insight: ["今天的發現", "經歷今天之後，你有什麼新的理解？"],
  nextAction: ["下一次的小調整", "下次遇到類似情況，你想嘗試什麼？"],
} as const;

const CAPACITY_OPTIONS = [
  ["low", "低"],
  ["medium", "適中"],
  ["high", "充足"],
] as const;

const REFLECTION_PROMPTS = {
  highlight: ["今天做得好的一件事", "今天經歷的美好時刻", "一個想感謝的人或片刻"],
  block: ["今天想改善的問題", "哪個地方消耗最多", "如果重來一次，會調整什麼"],
} as const;

function formatToday(dateISO: string) {
  return new Intl.DateTimeFormat("zh-TW", {
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(new Date(`${dateISO}T12:00:00+08:00`));
}

function carryOptionLabel(iso: string, index: number) {
  const prefix = index === 0 ? "明天" : index === 1 ? "後天" : `第 ${index + 1} 天`;
  return `${prefix} · ${fmtDateWD(iso)}`;
}

function isThursday(dateISO: string) {
  return new Date(`${dateISO}T12:00:00Z`).getUTCDay() === 4;
}

function englishRhythmStatus(count: number) {
  if (count === 0) return "今天還沒有走出英文光步，也沒關係";
  if (count === 1) return "今天已走出 1 步";
  if (count === 2) return "今日基準完成";
  if (count === 3) return "今天多走了 1 步";
  return "今天走完 4 步，四種英文都有接觸";
}

async function readResponse<T>(response: Response): Promise<T> {
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((json as { error?: string }).error ?? `操作失敗（${response.status}）`);
  return json as T;
}

export default function TodayPage() {
  const { entries, entriesLoading, entriesError } = useDojo();
  const date = useMemo(() => taipeiTodayISO(), []);
  const weekStart = useMemo(() => mondayOf(date), [date]);
  const carryOptions = useMemo(() => carryDateOptions(date), [date]);
  const todayEntries = useMemo(() => entries.filter((entry) => entry.date === date), [date, entries]);
  const [record, setRecord] = useState<DailyRecord>(() => emptyDailyRecord(date));
  const [board, setBoard] = useState<WeeklyBoard | null>(null);
  const [continuations, setContinuations] = useState<PersonalContinuation[]>([]);
  const [continuationError, setContinuationError] = useState<string | null>(null);
  const [resolvingContinuation, setResolvingContinuation] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [eveningError, setEveningError] = useState<string | null>(null);
  const [eveningFeedback, setEveningFeedback] = useState<string | null>(null);
  const [logText, setLogText] = useState("");
  const [readingVisitCount, setReadingVisitCount] = useState(0);
  const [creativeRole, setCreativeRole] = useState<CreativeRoleProfile | null>(null);
  const [editingRoleMessage, setEditingRoleMessage] = useState(false);
  const [saveRoleMessage, setSaveRoleMessage] = useState(true);
  const [roleMessageFeedback, setRoleMessageFeedback] = useState<string | null>(null);
  const [reusingChoice, setReusingChoice] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [dailyResponse, boardResponse, manifestationResponse] = await Promise.all([
          fetch(`/api/dojo/daily?date=${date}`, { cache: "no-store" }),
          fetch(`/api/dojo/bingo?week=${weekStart}`, { cache: "no-store" }),
          fetch("/api/dojo/manifestation", { cache: "no-store" }).catch(() => null),
        ]);
        const dailyJson = await readResponse<{ record: DailyRecord }>(dailyResponse);
        const boardJson = await readResponse<{ board: WeeklyBoard }>(boardResponse);
        const manifestationJson = manifestationResponse?.ok
          ? await readResponse<{ profile: CreativeRoleProfile }>(manifestationResponse)
          : null;
        if (!cancelled) {
          const profile = manifestationJson?.profile ?? null;
          const latestMessage = profile?.messages.at(-1);
          setRecord(latestMessage && !dailyJson.record.morning.roleMessage
            ? {
                ...dailyJson.record,
                morning: {
                  ...dailyJson.record.morning,
                  roleMessageId: latestMessage.id,
                  roleMessage: latestMessage.text,
                },
              }
            : dailyJson.record);
          setBoard(boardJson.board);
          setCreativeRole(profile);
        }
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : String(caught));
      } finally {
        if (!cancelled) setLoading(false);
      }

      try {
        const response = await fetch("/api/dojo/continuations", { cache: "no-store" });
        const json = await readResponse<{ cards: PersonalContinuation[] }>(response);
        if (!cancelled) {
          setContinuations(json.cards ?? []);
          setContinuationError(null);
        }
      } catch (caught) {
        if (!cancelled) setContinuationError(caught instanceof Error ? caught.message : String(caught));
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [date, weekStart]);

  useEffect(() => {
    let cancelled = false;
    async function loadReadingVisits() {
      try {
        const response = await fetch("/api/dojo/reading/cards?view=due&countOnly=true", { cache: "no-store" });
        const json = await readResponse<{ count: number }>(response);
        if (!cancelled) setReadingVisitCount(Math.max(0, json.count ?? 0));
      } catch {
        // 閱讀回訪是今天頁的輕量提醒；讀取失敗不應阻擋晨間、三件事或收光。
      }
    }
    void loadReadingVisits();
    return () => { cancelled = true; };
  }, []);

  async function writeDaily(next: DailyRecord) {
    const response = await fetch("/api/dojo/daily", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, record: next }),
    });
    const json = await readResponse<{ record: DailyRecord }>(response);
    setRecord(json.record);
    return json.record;
  }

  async function persist(next: DailyRecord, message?: string) {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const saved = await writeDaily(next);
      if (message) setNotice(message);
      return saved;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      throw caught;
    } finally {
      setSaving(false);
    }
  }

  function updateTask(category: DailyTaskCategory, patch: Partial<DailyRecord["tasks"][DailyTaskCategory]>) {
    setRecord((current) => ({
      ...current,
      tasks: { ...current.tasks, [category]: { ...current.tasks[category], ...patch } },
    }));
  }

  function toggleEnglishTouch(touch: EnglishTouchType) {
    setRecord((current) => {
      const selected = current.englishRhythm.touches.includes(touch);
      return {
        ...current,
        englishRhythm: {
          ...current.englishRhythm,
          touches: selected
            ? current.englishRhythm.touches.filter((item) => item !== touch)
            : [...current.englishRhythm.touches, touch],
          vocabForgeRounds: touch === "vocabulary"
            ? selected ? 0 : Math.max(1, current.englishRhythm.vocabForgeRounds)
            : current.englishRhythm.vocabForgeRounds,
        },
      };
    });
  }

  function setVocabForgeRounds(rounds: 1 | 3 | 5) {
    setRecord((current) => ({
      ...current,
      englishRhythm: {
        ...current.englishRhythm,
        touches: current.englishRhythm.touches.includes("vocabulary")
          ? current.englishRhythm.touches
          : [...current.englishRhythm.touches, "vocabulary"],
        vocabForgeRounds: rounds,
      },
    }));
  }

  async function saveEnglishRhythm() {
    const next: DailyRecord = {
      ...record,
      englishRhythm: {
        ...record.englishRhythm,
        updatedAt: new Date().toISOString(),
      },
    };
    try {
      await persist(next, "今天的英文光步已存下來；不占三件事名額。" );
    } catch {
      // persist() 已顯示錯誤。
    }
  }

  async function toggleTask(category: DailyTaskCategory) {
    const task = record.tasks[category];
    if (!task.text.trim()) return;
    const completed = !task.completed;
    const next: DailyRecord = {
      ...record,
      tasks: {
        ...record.tasks,
        [category]: {
          ...task,
          completed,
          completedAt: completed ? new Date().toISOString() : null,
        },
      },
    };
    try {
      await persist(next);
      const response = await fetch("/api/dojo/flow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "complete-task", date, category, completed, result: next.tasks[category].result }),
      });
      const json = await readResponse<{ daily: DailyRecord; board: WeeklyBoard | null }>(response);
      setRecord(json.daily);
      if (json.board) setBoard(json.board);
      setNotice(completed ? "已記下完成時間，週盤也已同步。" : "已改回進行中，週盤也已同步。");
    } catch {
      // persist() 已將錯誤放到頁面上。
    }
  }

  async function addLog() {
    const text = logText.trim();
    if (!text) return;
    const now = new Date();
    const time = new Intl.DateTimeFormat("zh-TW", {
      timeZone: DOJO_TIME_ZONE,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(now);
    const next = {
      ...record,
      daytime: {
        ...record.daytime,
        logs: [...record.daytime.logs, { id: crypto.randomUUID(), time, text, createdAt: now.toISOString() }],
      },
    };
    setLogText("");
    try {
      await persist(next, "白天追蹤已存下來。");
    } catch {
      setLogText(text);
    }
  }

  async function removeLog(id: string) {
    const next = {
      ...record,
      daytime: { ...record.daytime, logs: record.daytime.logs.filter((log) => log.id !== id) },
    };
    try {
      await persist(next);
    } catch {
      // persist() 已顯示錯誤。
    }
  }

  function selectRoleMessage(message: CreativeRoleProfile["messages"][number]) {
    setRoleMessageFeedback(null);
    setEditingRoleMessage(false);
    setRecord((current) => ({
      ...current,
      morning: { ...current.morning, roleMessageId: message.id, roleMessage: message.text },
    }));
  }

  function reuseLatestRoleMessage() {
    const latest = creativeRole?.messages.at(-1);
    if (!latest) {
      setRoleMessageFeedback("這個角色還沒有保存過留言，可以先寫一句新的話。");
      setEditingRoleMessage(true);
      return;
    }
    selectRoleMessage(latest);
    setRoleMessageFeedback("已沿用最近保存的角色留言。");
  }

  function rotateRoleMessage() {
    const messages = creativeRole?.messages ?? [];
    if (!messages.length) {
      setRoleMessageFeedback("這個角色還沒有其他留言。");
      setEditingRoleMessage(true);
      return;
    }
    const currentIndex = messages.findIndex((message) =>
      message.id === record.morning.roleMessageId || message.text === record.morning.roleMessage
    );
    const nextIndex = currentIndex < 0 ? messages.length - 1 : (currentIndex - 1 + messages.length) % messages.length;
    selectRoleMessage(messages[nextIndex]);
    setRoleMessageFeedback(messages.length === 1 ? "目前只保存了這一句。" : "換成另一句保存過的話了。");
  }

  async function reuseLastChoice() {
    setReusingChoice(true);
    setError(null);
    try {
      const response = await fetch(`/api/dojo/daily?date=${date}&latestChoiceBefore=1`, { cache: "no-store" });
      const json = await readResponse<{ latest: { date: string; choice: string } | null }>(response);
      if (!json.latest) {
        setNotice("目前還沒有可沿用的過往選擇。");
        return;
      }
      setRecord((current) => ({
        ...current,
        morning: { ...current.morning, intention: json.latest?.choice ?? current.morning.intention },
      }));
      setNotice(`已帶入 ${json.latest.date} 的選擇；儲存晨間啟動後才會寫入今天。`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setReusingChoice(false);
    }
  }

  async function saveMorning() {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      let roleMessageId = record.morning.roleMessageId;
      let profile = creativeRole;
      const roleMessage = record.morning.roleMessage.trim();
      if (profile?.title && roleMessage && !roleMessageId && saveRoleMessage) {
        const response = await fetch("/api/dojo/manifestation", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: roleMessage }),
        });
        const json = await readResponse<{
          profile: CreativeRoleProfile;
          message: CreativeRoleProfile["messages"][number];
        }>(response);
        profile = json.profile;
        roleMessageId = json.message.id;
        setCreativeRole(json.profile);
      }
      const roleSnapshot = record.morning.roleSnapshot ?? (profile?.title ? {
        id: profile.id,
        title: profile.title,
        traits: profile.traits,
        note: profile.note,
      } : null);
      await writeDaily({
        ...record,
        morning: {
          ...record.morning,
          depth: record.morning.depth ?? "light",
          roleSnapshot,
          roleMessageId,
          roleMessage,
          startedAt: record.morning.startedAt ?? new Date().toISOString(),
        },
      });
      setEditingRoleMessage(false);
      setNotice(`晨間${record.morning.depth === "deep" ? "深入" : record.morning.depth === "medium" ? "適中" : "輕量"}模式已存下來。`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
    }
  }

  function addReflectionPrompt(field: "highlight" | "block", prompt: string) {
    setEveningFeedback(null);
    setRecord((current) => {
      if (current.evening[field].includes(prompt)) return current;
      const prefix = current.evening[field].trim() ? `${current.evening[field].trim()}\n` : "";
      return {
        ...current,
        evening: { ...current.evening, [field]: `${prefix}${prompt}：` },
      };
    });
  }

  async function saveEvening() {
    const disposition = record.evening.disposition;
    setEveningError(null);
    setEveningFeedback(null);
    if (!disposition) {
      setEveningError("請選擇帶回、寫下今天或暫且放下。");
      return;
    }
    if (disposition === "journal" && !record.evening.depth) {
      setEveningError("請先選擇今晚要用輕、適中或深入復盤。");
      return;
    }
    if (disposition === "carry" && !record.evening.carryNote.trim()) {
      setEveningError("請寫下想帶回的念頭、問題或下一步。");
      return;
    }
    if (disposition === "carry" && !record.evening.carryToDate) {
      setEveningError("請選擇要在哪一天重新接住它。");
      return;
    }

    let overwrite = false;
    if (record.evening.closedAt) {
      overwrite = window.confirm("今天已經完成收光。要用這次內容取代原本紀錄嗎？");
      if (!overwrite) return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/dojo/evening", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, record, overwrite }),
      });
      const json = await readResponse<{ record: DailyRecord }>(response);
      setRecord(json.record);
      if (disposition === "journal") {
        setEveningFeedback("晚間復盤已收進今天，之後可在回看找到。");
      } else if (disposition === "pause") {
        setEveningFeedback("今晚已暫且放下；沒有建立待辦，也不需要現在解決。");
      } else {
        const carriedDate = json.record.evening.carryToDate ?? record.evening.carryToDate;
        setEveningFeedback(
          `已把這段接續帶到 ${carriedDate ? fmtDateWD(carriedDate) : "指定日期"}。未完成任務仍留在本週 Bingo。`
        );
      }
    } catch (caught) {
      setEveningError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
    }
  }

  async function resolveContinuation(card: PersonalContinuation) {
    setResolvingContinuation(card.id);
    setContinuationError(null);
    try {
      const response = await fetch("/api/dojo/continuations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: card.source, id: card.id, createdDate: card.createdDate }),
      });
      await readResponse<{ ok: true }>(response);
      setContinuations((current) => current.filter((item) => !(item.source === card.source && item.id === card.id)));
    } catch (caught) {
      setContinuationError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setResolvingContinuation(null);
    }
  }

  const taskDone = TASK_ORDER.filter((category) => record.tasks[category].completed).length;
  const englishTouchCount = record.englishRhythm.touches.length;
  const englishTouchLabels = ENGLISH_TOUCH_ORDER
    .filter((touch) => record.englishRhythm.touches.includes(touch))
    .map((touch) => ENGLISH_TOUCH_TYPES[touch].label);
  const boardDone = board?.cells.filter((cell) => cell.index !== 12 && cell.completed).length ?? 0;
  const displayedRole = record.morning.roleSnapshot ?? creativeRole;
  return (
    <section className="screen today-screen">
      <div className="hero today-hero">
        <div className="eyebrow">今天 · {formatToday(date)}</div>
        <h1>把光放回今天</h1>
        <p>晨間定向、白天留下動靜，晚上再把一天收回來。</p>
        <div className="today-summary">
          <span>三件事 {taskDone}/3</span>
          <Link href="/bingo">週盤 {boardDone}/24 · {board ? completedBingoLines(board) : 0} 連線</Link>
        </div>
      </div>

      {continuations.length > 0 && (
        <section className="continuation-section" aria-labelledby="continuation-title">
          <div className="section-heading">
            <div>
              <span className="eyebrow">帶回今天</span>
              <h2 id="continuation-title">先接住之前留下的話</h2>
            </div>
          </div>
          <div className="continuation-list">
            {continuations.map((card) => (
              <article className="continuation-card" key={`${card.source}:${card.id}`}>
                <small>{fmtDateWD(card.createdDate)} 留下 · {fmtDateWD(card.carryToDate)} 帶回</small>
                <p>{card.text}</p>
                <button
                  type="button"
                  disabled={resolvingContinuation === card.id}
                  onClick={() => void resolveContinuation(card)}
                >
                  {resolvingContinuation === card.id ? "處理中…" : "這段已接住"}
                </button>
              </article>
            ))}
          </div>
        </section>
      )}
      {continuationError && <p className="form-error" role="alert">接續內容暫時無法讀取：{continuationError}</p>}

      {readingVisitCount > 0 && (
        <Link className="reading-today-reminder" href="/reading/visits">
          <span>閱讀回訪</span>
          <div><b>今天有 {readingVisitCount} 張洞察卡到期</b><small>回來看看：做了嗎，結果如何？</small></div>
          <i>→</i>
        </Link>
      )}

      {loading && <div className="empty">正在讀取今天…</div>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {notice && <p className="save-notice" role="status">{notice}</p>}

      {!loading && (
        <>
          <section className="ritual-card morning-card">
            <div className="section-heading">
              <div>
                <span className="eyebrow">晨間啟動</span>
                <h2>先看見此刻</h2>
              </div>
              {record.morning.startedAt && <span className="saved-mark">{
                record.morning.depth === "deep" ? "深層" : record.morning.depth === "medium" ? "中層" : "輕層"
              }</span>}
            </div>

            <label>今天想寫到多深？</label>
            <div className="segmented three morning-depth-picker">
              {MORNING_DEPTHS.map((depth) => (
                <button
                  type="button"
                  key={depth.key}
                  className={(record.morning.depth ?? "light") === depth.key ? "on" : ""}
                  onClick={() => setRecord((current) => ({
                    ...current,
                    morning: { ...current.morning, depth: depth.key },
                  }))}
                >
                  <b>{depth.label}</b>
                  <small>{depth.note}</small>
                </button>
              ))}
            </div>

            <div className="morning-section-block">
              <div className="morning-section-title">
                <b>此刻的我</b>
                <small>現在的你，正經歷著什麼？</small>
              </div>
              <label>今天的行動餘裕</label>
              <div className="segmented three capacity-picker">
              {CAPACITY_OPTIONS.map(([capacity, label]) => (
                <button
                  type="button"
                  key={capacity}
                  className={record.morning.capacity === capacity ? "on" : ""}
                  onClick={() => setRecord((current) => ({
                    ...current,
                    morning: { ...current.morning, capacity },
                  }))}
                >
                  {label}
                </button>
              ))}
              </div>
              <label htmlFor="morning-self-note">此刻的我</label>
              <textarea
                id="morning-self-note"
                className="field compact-field"
                rows={2}
                value={record.morning.selfNote}
                onChange={(event) => setRecord((current) => ({
                  ...current,
                  morning: { ...current.morning, selfNote: event.target.value },
                }))}
                placeholder="有什麼想對自己說的？（選填）"
              />
            </div>

            {displayedRole?.title ? (
              <div className="morning-creative-anchor">
                <div>
                  <small>我正在創現的角色</small>
                  <b>{displayedRole.title}</b>
                  <span>{displayedRole.traits.join("・")}</span>
                </div>
                <div className="role-anchor-actions">
                  <Link href="/practice?manifestation=1">查看角色</Link>
                  <Link href="/practice?manifestation=1">調整角色</Link>
                </div>
              </div>
            ) : (
              <div className="morning-role-empty">
                <p>還沒有建立創現角色，也可以先完成今天的一般晨間紀錄。</p>
                <Link className="morning-creative-setup" href="/practice?manifestation=1">前往修習所建立角色 →</Link>
              </div>
            )}

            {displayedRole?.title && (
              <section className="role-message-section">
                <div className="morning-section-title">
                  <b>來自那個我的一句話</b>
                  <small>已經活出這個版本的你，今天想對此刻的自己說什麼？</small>
                </div>
                <div className="role-message-card">
                  <small>{displayedRole.title}</small>
                  <p>{record.morning.roleMessage || "今天想聽見一句什麼樣的話？"}</p>
                </div>
                <div className="role-message-actions">
                  <button type="button" onClick={() => {
                    setEditingRoleMessage(true);
                    setRoleMessageFeedback(null);
                    setRecord((current) => ({
                      ...current,
                      morning: { ...current.morning, roleMessageId: null, roleMessage: "" },
                    }));
                  }}>寫一句新留言</button>
                  <button type="button" onClick={reuseLatestRoleMessage}>沿用之前的留言</button>
                  <button type="button" onClick={rotateRoleMessage}>換一句想聽的話</button>
                </div>
                {editingRoleMessage && (
                  <div className="role-message-editor">
                    <textarea
                      className="field compact-field"
                      rows={3}
                      value={record.morning.roleMessage}
                      onChange={(event) => setRecord((current) => ({
                        ...current,
                        morning: { ...current.morning, roleMessageId: null, roleMessage: event.target.value },
                      }))}
                      placeholder="保留你自己的語氣：溫柔、幽默、調皮或很日常都可以。"
                    />
                    <label className="inline-check">
                      <input type="checkbox" checked={saveRoleMessage} onChange={(event) => setSaveRoleMessage(event.target.checked)} />
                      保存到這個角色的留言紀錄
                    </label>
                  </div>
                )}
                {roleMessageFeedback && <small className="role-message-feedback">{roleMessageFeedback}</small>}
                <label htmlFor="morning-role-reply">我想對他說（選填）</label>
                <textarea
                  id="morning-role-reply"
                  className="field compact-field"
                  rows={2}
                  value={record.morning.roleReply}
                  onChange={(event) => setRecord((current) => ({
                    ...current,
                    morning: { ...current.morning, roleReply: event.target.value },
                  }))}
                  placeholder="好啦！我知道啦🤣"
                />
              </section>
            )}

            <div className="morning-choice-section">
              <div className="field-heading-row">
                <label htmlFor="morning-intention">今天的選擇</label>
                <button type="button" className="text-action" disabled={reusingChoice} onClick={() => void reuseLastChoice()}>
                  {reusingChoice ? "讀取中…" : "沿用上次的選擇"}
                </button>
              </div>
              <textarea
                id="morning-intention"
                className="field"
                rows={3}
                value={record.morning.intention}
                onChange={(event) => setRecord({ ...record, morning: { ...record.morning, intention: event.target.value } })}
                placeholder="今天，你想如何實踐這個版本的自己？"
              />
            </div>

            {(record.morning.depth === "medium" || record.morning.depth === "deep") && (
              <section className="morning-layer-fields">
                <div className="morning-layer-heading">
                  <b>中層書寫</b>
                  <small>感恩與肯定句</small>
                </div>
                <label htmlFor="morning-gratitude">今天想感謝的人事物</label>
                <textarea
                  id="morning-gratitude"
                  className="field"
                  value={record.morning.gratitude}
                  onChange={(event) => setRecord((current) => ({
                    ...current,
                    morning: { ...current.morning, gratitude: event.target.value },
                  }))}
                  placeholder="一件、三件或更多件都可以。"
                />
                <label htmlFor="morning-affirmation">我的正向肯定句</label>
                <textarea
                  id="morning-affirmation"
                  className="field"
                  value={record.morning.affirmation}
                  onChange={(event) => setRecord((current) => ({
                    ...current,
                    morning: { ...current.morning, affirmation: event.target.value },
                  }))}
                  placeholder={'寫 1–3 句即可，例如：「我今天決定讓穩定成為我的行動方式。」'}
                />
                <small className="field-help">這裡只需要寫一次，作為今天的意識錨定；專注重複複誦請到修習所的「狂A肯定句」。</small>
              </section>
            )}
            {record.morning.depth === "deep" && (
              <section className="morning-layer-fields deep">
                <div className="morning-layer-heading">
                  <b>深層書寫</b>
                  <small>把想走向的生活先寫下來</small>
                </div>
                <label htmlFor="morning-future-journal">我的未來日記</label>
                <textarea
                  id="morning-future-journal"
                  className="field"
                  value={record.morning.futureJournal}
                  onChange={(event) => setRecord((current) => ({
                    ...current,
                    morning: { ...current.morning, futureJournal: event.target.value },
                  }))}
                  placeholder="用創作者視角，寫下你決定如何讓下一段生活發生。"
                />
              </section>
            )}

            <button
              type="button"
              className="primary"
              disabled={saving}
              onClick={() => void saveMorning()}
            >
              {saving ? "儲存中…" : "開始今天"}
            </button>
          </section>

          <section className="ritual-card">
            <div className="section-heading">
              <div>
                <span className="eyebrow">晨間啟動 · 今日安排</span>
                <h2>規劃今天的三件事</h2>
              </div>
              <Link href="/bingo" className="text-link">從週盤帶入</Link>
            </div>

            <div className="daily-task-list">
              {TASK_ORDER.map((category) => {
                const task = record.tasks[category];
                const meta = DAILY_TASK_CATEGORIES[category];
                return (
                  <div key={category} className={`daily-task ${category} ${task.completed ? "done" : ""}`}>
                    <button
                      type="button"
                      className={`task-check ${task.completed ? "on" : ""}`}
                      onClick={() => void toggleTask(category)}
                      disabled={!task.text.trim() || saving}
                      aria-label={task.completed ? `將${meta.label}改回未完成` : `完成${meta.label}`}
                    >
                      {task.completed ? "✓" : ""}
                    </button>
                    <div className="task-body">
                      <label htmlFor={`task-${category}`}>{meta.label}</label>
                      <input
                        id={`task-${category}`}
                        className="field"
                        value={task.text}
                        onChange={(event) => updateTask(category, {
                          text: event.target.value,
                          origin: task.origin && event.target.value !== task.text ? null : task.origin,
                        })}
                        placeholder={meta.prompt}
                      />
                      {task.origin && <small>來自本週週盤第 {task.origin.cellIndex + 1} 格</small>}
                      {task.completed && (
                        <textarea
                          className="field compact"
                          value={task.result}
                          onChange={(event) => updateTask(category, { result: event.target.value })}
                          placeholder="完成後留下結果或感受（選填）"
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <button type="button" className="primary" disabled={saving} onClick={() => void persist(record, "今天的三件事已更新。") }>
              {saving ? "儲存中…" : "儲存今天的三件事"}
            </button>
          </section>

          <details className="ritual-card english-rhythm-card">
            <summary>
              <div>
                <span className="eyebrow">日常節奏</span>
                <h2>英文光步</h2>
                <small>{isThursday(date) ? "週四休養日・走一步也很好" : "基準走 2 步，狀態好可到 4 步"}</small>
              </div>
              <span className={`english-rhythm-count ${englishTouchCount >= 2 ? "reached" : ""}`}>
                {englishTouchCount}/{englishTouchCount > 2 ? 4 : 2}
              </span>
            </summary>
            <div className="english-rhythm-body">
              <p className="english-rhythm-status">{englishRhythmStatus(englishTouchCount)}</p>
              <div className="english-touch-grid">
                {ENGLISH_TOUCH_ORDER.map((touch) => {
                  const meta = ENGLISH_TOUCH_TYPES[touch];
                  const selected = record.englishRhythm.touches.includes(touch);
                  return (
                    <button
                      type="button"
                      key={touch}
                      className={selected ? "on" : ""}
                      aria-pressed={selected}
                      onClick={() => toggleEnglishTouch(touch)}
                    >
                      <span>{selected ? "✓" : "○"}</span>
                      <b>{meta.label}</b>
                      <small>{meta.examples}</small>
                    </button>
                  );
                })}
              </div>
              <div className="vocabforge-rounds">
                <div>
                  <b>VocabForge 科學複習</b>
                  <small>每輪 5 個單字；主動回想依系統排程出現</small>
                </div>
                <div className="vocabforge-round-options" aria-label="今天完成的 VocabForge 輪數">
                  {([1, 3, 5] as const).map((rounds) => (
                    <button
                      type="button"
                      key={rounds}
                      className={record.englishRhythm.vocabForgeRounds === rounds ? "on" : ""}
                      aria-pressed={record.englishRhythm.vocabForgeRounds === rounds}
                      onClick={() => setVocabForgeRounds(rounds)}
                    >
                      <b>{rounds} 輪</b>
                      <small>{rounds === 1 ? "今日有碰" : rounds === 3 ? "今日淬煉" : "今日深煉"}</small>
                    </button>
                  ))}
                </div>
              </div>
              <label htmlFor="english-rhythm-note">今天留下什麼？（選填）</label>
              <input
                id="english-rhythm-note"
                className="field"
                value={record.englishRhythm.note}
                onChange={(event) => setRecord((current) => ({
                  ...current,
                  englishRhythm: { ...current.englishRhythm, note: event.target.value },
                }))}
                placeholder="一句理解、一個說法，或下次想延續的素材"
              />
              <button type="button" className="primary" disabled={saving} onClick={() => void saveEnglishRhythm()}>
                {saving ? "儲存中…" : "儲存英文光步"}
              </button>
            </div>
          </details>

          <section className="ritual-card daytime-card">
            <span className="eyebrow">白天追蹤</span>
            <h2>留下正在發生的事</h2>
            <div className="quick-log">
              <input
                className="field"
                value={logText}
                onChange={(event) => setLogText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void addLog();
                  }
                }}
                placeholder="一句進度、感受或轉折"
              />
              <button type="button" onClick={() => void addLog()} disabled={!logText.trim() || saving}>記下</button>
            </div>
            {record.daytime.logs.length > 0 && (
              <div className="day-log-list">
                {record.daytime.logs.map((log) => (
                  <div className="day-log" key={log.id}>
                    <time>{log.time}</time>
                    <span>{log.text}</span>
                    <button type="button" onClick={() => void removeLog(log.id)} aria-label={`刪除「${log.text}」`}>×</button>
                  </div>
                ))}
              </div>
            )}

            <label htmlFor="day-note">日間札記</label>
            <textarea
              id="day-note"
              className="field journal-field"
              value={record.daytime.note}
              onChange={(event) => setRecord({ ...record, daytime: { ...record.daytime, note: event.target.value } })}
              placeholder="自由寫下今天，不需要整理成結論。"
            />
            <button type="button" className="primary" disabled={saving} onClick={() => void persist(record, "日間札記已存下來。") }>
              {saving ? "儲存中…" : "儲存日間札記"}
            </button>
          </section>

          <section className="ritual-card evening-card" id="today-closing">
            <div className="section-heading">
              <div>
                <span className="eyebrow">晚間收光</span>
                <h2>今天過得怎麼樣？</h2>
              </div>
              {record.evening.closedAt && <span className="saved-mark">已收光</span>}
            </div>

            {englishTouchCount > 0 && (
              <div className="evening-english-summary" aria-label="今日英文光步摘要">
                <span>日常節奏 · 英文光步</span>
                <b>{englishTouchLabels.join("、")} · {englishTouchCount} 步</b>
                {record.englishRhythm.vocabForgeRounds > 0 && <small>VocabForge {record.englishRhythm.vocabForgeRounds} 輪 · {record.englishRhythm.vocabForgeRounds * 5} 個單字席次</small>}
                {record.englishRhythm.note && <small>{record.englishRhythm.note}</small>}
              </div>
            )}

            <details className="measure-disclosure">
              <summary>
                <span>片刻測頻</span>
                <small>只標記值得回看的片刻 · 選填</small>
              </summary>
              <div className="measure-disclosure-body">
                <p>頻率與投入強度不是每天必填，也不會被平均成一天的分數。</p>
                {entriesLoading && <small>正在讀取今天的片刻…</small>}
                {entriesError && <p className="form-error">{entriesError}</p>}
                {!entriesLoading && todayEntries.length === 0 && (
                  <small>今天還沒有六個場域的片刻；需要時可用下方「新增」留下。</small>
                )}
                {todayEntries.map((entry) => (
                  <article className="measure-entry" key={entry.id}>
                    <div>
                      <small>{SPACES[entry.space][0]} · {entry.kind}</small>
                      <b>{entry.title}</b>
                    </div>
                    <EntryMeasurePanel entry={entry} />
                  </article>
                ))}
              </div>
            </details>

            <p className="section-guide">選一種今晚真正需要的收束；三個選項各自有完整流程。</p>
            <div className="closing-choice-grid">
              {([
                ["journal", "寫下今天", "留下今天，也可依需要往發現與小調整深入"],
                ["carry", "帶回", "把一段念頭、問題或下一步帶到指定日期"],
                ["pause", "暫且放下", "今天到此，不建立待辦或接續"],
              ] as const).map(([choice, label, description]) => (
                <button
                  type="button"
                  key={choice}
                  className={record.evening.disposition === choice ? "on" : ""}
                  aria-pressed={record.evening.disposition === choice}
                  onClick={() => {
                    setEveningError(null);
                    setEveningFeedback(null);
                    setRecord((current) => ({
                      ...current,
                      evening: { ...current.evening, disposition: choice },
                    }));
                  }}
                >
                  <b>{label}</b>
                  <small>{description}</small>
                </button>
              ))}
            </div>

            {eveningError && <p className="form-error closing-inline-message" role="alert">{eveningError}</p>}
            {eveningFeedback && (
              <div className="closing-success" role="status">
                <b>今晚已收好</b>
                <p>{eveningFeedback}</p>
                <button type="button" onClick={() => setEveningFeedback(null)}>修改今晚的選擇</button>
              </div>
            )}

            {!eveningFeedback && record.evening.disposition === "journal" && (
              <div className="closing-flow-panel journal" aria-live="polite">
                <ManifestationMilestoneCapture date={date} />
                {(record.morning.startedAt || record.morning.intention || record.morning.roleMessage) && (
                  <div className="evening-morning-context">
                    <small>今天早晨留下的方向</small>
                    {record.morning.roleSnapshot?.title && (
                      <p><b>創現角色</b>{record.morning.roleSnapshot.title}</p>
                    )}
                    {record.morning.intention && <p><b>今天的選擇</b>{record.morning.intention}</p>}
                    {record.morning.roleMessage && <p><b>來自那個我的一句話</b>{record.morning.roleMessage}</p>}
                  </div>
                )}
                <label>今天想回看到多深？</label>
                <div className="segmented three evening-depth-picker">
                  {([
                    ["light", "輕", "留下今天"],
                    ["medium", "適中", "整理今天"],
                    ["deep", "深入", "回望與調整"],
                  ] as const).map(([depth, label, note]) => (
                    <button
                      type="button"
                      key={depth}
                      className={record.evening.depth === depth ? "on" : ""}
                      aria-pressed={record.evening.depth === depth}
                      onClick={() => setRecord((current) => ({
                        ...current,
                        evening: { ...current.evening, depth },
                      }))}
                    >
                      <b>{label}</b>
                      <small>{note}</small>
                    </button>
                  ))}
                </div>

                {record.evening.depth && EVENING_FIELDS[record.evening.depth].map((field) => {
                  const [label, placeholder] = EVENING_LABELS[field];
                  const prompts = field === "highlight" || field === "block" ? REFLECTION_PROMPTS[field] : null;
                  return (
                    <div key={field}>
                      <label htmlFor={`evening-${field}`}>{label}</label>
                      {prompts && (
                        <div className="prompt-chip-list" aria-label={`${label}書寫提示`}>
                          {prompts.map((prompt) => (
                            <button
                              type="button"
                              key={prompt}
                              onClick={() => {
                                if (field === "highlight" || field === "block") addReflectionPrompt(field, prompt);
                              }}
                            >
                              {prompt}
                            </button>
                          ))}
                        </div>
                      )}
                      <textarea
                        id={`evening-${field}`}
                        className="field"
                        value={record.evening[field]}
                        onChange={(event) => setRecord((current) => ({
                          ...current,
                          evening: { ...current.evening, [field]: event.target.value },
                        }))}
                        placeholder={placeholder}
                      />
                    </div>
                  );
                })}

                <button type="button" className="primary" disabled={saving} onClick={() => void saveEvening()}>
                  {saving ? "收光中…" : record.evening.closedAt ? "更新今晚復盤" : "完成並儲存日復盤"}
                </button>
              </div>
            )}

            {!eveningFeedback && record.evening.disposition === "carry" && (
              <div className="closing-flow-panel carry" aria-live="polite">
                <b>把一段話帶到之後</b>
                <p>這裡承接的是念頭、問題或下一步；未完成任務會留在本週 Bingo，不會被複製。</p>
                <label htmlFor="carry-note">想帶回什麼？</label>
                <textarea
                  id="carry-note"
                  className="field"
                  value={record.evening.carryNote}
                  onChange={(event) => setRecord((current) => ({
                    ...current,
                    evening: { ...current.evening, carryNote: event.target.value },
                  }))}
                  placeholder="一個還想想看的問題、一段提醒，或下一次想試的小動作。"
                />
                <label>在哪一天重新接住？</label>
                <div className="carry-date-grid">
                  {carryOptions.map((option, index) => (
                    <button
                      type="button"
                      key={option}
                      className={record.evening.carryToDate === option ? "on" : ""}
                      aria-pressed={record.evening.carryToDate === option}
                      onClick={() => setRecord((current) => ({
                        ...current,
                        evening: { ...current.evening, carryToDate: option },
                      }))}
                    >
                      {carryOptionLabel(option, index)}
                    </button>
                  ))}
                </div>
                <button type="button" className="primary" disabled={saving} onClick={() => void saveEvening()}>
                  {saving ? "帶回中…" : "確認帶回"}
                </button>
              </div>
            )}

            {!eveningFeedback && record.evening.disposition === "pause" && (
              <div className="closing-flow-panel pause" aria-live="polite">
                <b>今晚到此，暫且放下</b>
                <p>會留下今天選擇結束的紀錄，不建立明日待辦，也不要求你現在整理出答案。</p>
                <button type="button" className="primary" disabled={saving} onClick={() => void saveEvening()}>
                  {saving ? "收光中…" : "確認暫且放下"}
                </button>
              </div>
            )}
          </section>

          <section className="spaces-shortcut">
            <div className="section-heading">
              <div>
                <span className="eyebrow">六個場域</span>
                <h2>需要時再走進去</h2>
              </div>
              <Link href="/map" className="text-link">完整場域圖</Link>
            </div>
            <div className="grid">
              {(Object.entries(SPACES) as [SpaceKey, (typeof SPACES)[SpaceKey]][]).map(([key, value]) => (
                <Link key={key} href={`/${key}`} className={`space-link ${value[1]}`}>
                  <span className="dot" />
                  <b>{value[0]}</b>
                  <small>{value[2]}</small>
                </Link>
              ))}
            </div>
          </section>
        </>
      )}
    </section>
  );
}
