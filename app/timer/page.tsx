"use client";

// 修行計時(雛形 timer()/toggleTimer()/finishTimer()等的等價實作)。
// 修掉雛形本身的 bug:finishTimer() 原本無論選了 25/45/60/90 分,計算已投入分鐘數時
// 一律寫死用 25*60 起算,導致選 45/60/90 分時記錄的分鐘數是錯的。這裡改成用實際選定
// 的起始秒數(initialSeconds)計算。
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useDojo } from "@/lib/dojo/store";
import {
  SPACES,
  GUANGXING,
  GUANGFA,
  SPACE_TO_SOURCE_TYPE,
  type SpaceKey,
  type GuangxingKey,
  type GuangfaKey,
} from "@/lib/dojo/constants";
import { formatTimer } from "@/lib/dojo/format";

const MINUTE_OPTIONS = [25, 45, 60, 90];
// 收光是結束動作,不是投入時間的場域,排除;道藏(2026-08-03 擁有者追加指示)
// 補回清單——目前只排除收光。
const TIMER_SPACE_KEYS = (Object.keys(SPACES) as SpaceKey[]).filter((k) => k !== "closing");

export default function TimerPage() {
  const router = useRouter();
  const { timerConfig, addEntry } = useDojo();

  const [selectedMinutes, setSelectedMinutes] = useState(25);
  const [initialSeconds, setInitialSeconds] = useState(25 * 60);
  const [remainingSeconds, setRemainingSeconds] = useState(25 * 60);
  const [running, setRunning] = useState(false);
  const [space, setSpace] = useState<SpaceKey>(timerConfig.space);
  const [title, setTitle] = useState(timerConfig.title);
  const [kind, setKind] = useState(timerConfig.kind);
  const [guangxing, setGuangxing] = useState<GuangxingKey | null>(timerConfig.guangxing);
  const [guangfa, setGuangfa] = useState<GuangfaKey | null>(timerConfig.guangfa);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  function setMinutes(m: number) {
    setSelectedMinutes(m);
    setInitialSeconds(m * 60);
    setRemainingSeconds(m * 60);
  }

  function toggleTimer() {
    setRunning((prev) => {
      const next = !prev;
      if (next) {
        intervalRef.current = setInterval(() => {
          setRemainingSeconds((s) => {
            if (s <= 0) {
              if (intervalRef.current) clearInterval(intervalRef.current);
              return 0;
            }
            return s - 1;
          });
        }, 1000);
      } else if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      return next;
    });
  }

  async function finishTimer() {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setRunning(false);
    // 修正:用實際選定的起始秒數計算,不是寫死 25*60。
    const spent = Math.max(1, Math.round((initialSeconds - remainingSeconds) / 60));
    setSaving(true);
    setError(null);
    try {
      await addEntry({
        title,
        space,
        kind,
        note: `修行計時 ${spent} 分鐘`,
        privacy: "私人",
        guangxing,
        guangfa,
        sourceType: SPACE_TO_SOURCE_TYPE[space],
        traceLevel: "daily",
        traceStatus: "一般",
        viewCount: 0,
      });
      setRemainingSeconds(initialSeconds);
      router.push(`/${space}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="screen">
      <h1>修行計時</h1>
      <p className="lead">
        任何有意識投入的時間都可以是修行:身、心、靈修、野採、織光、聊解都能記錄。不是只有靈修。
      </p>
      <div className="card" style={{ textAlign: "center", padding: 24 }}>
        <span className="label">目前計時</span>
        <div style={{ font: "600 54px/1.15 ui-monospace,monospace", margin: "12px 0" }}>
          {formatTimer(remainingSeconds)}
        </div>
        <small>{running ? "計時中" : remainingSeconds === initialSeconds ? "尚未開始" : "已暫停"}</small>
        <div className="two" style={{ marginTop: 16 }}>
          <button className="primary" onClick={toggleTimer}>
            {running ? "暫停" : "開始"}
          </button>
          <button onClick={() => void finishTimer()} disabled={saving}>{saving ? "儲存中…" : "結束並記錄"}</button>
        </div>
      </div>

      <div className="row">
        {MINUTE_OPTIONS.map((m) => (
          <button key={m} className={selectedMinutes === m ? "on" : ""} onClick={() => setMinutes(m)}>
            {m} 分
          </button>
        ))}
      </div>

      <div className="card">
        <label>這段時間屬於哪個場域?</label>
        <div className="row">
          {TIMER_SPACE_KEYS.map((k) => (
            <button key={k} className={space === k ? "on" : ""} onClick={() => setSpace(k)}>
              {SPACES[k][0]}
            </button>
          ))}
        </div>
        <small style={{ display: "block", margin: "-4px 0 12px", color: "var(--muted)" }}>
          已自動帶入你剛剛所在的場域,仍可手動切換。
        </small>

        <label>你在練什麼?</label>
        <input
          className="field"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="例如:知的覺察、創作草稿、服務準備"
        />

        <label>光行(選填)</label>
        <div className="row">
          <button className={guangxing === null ? "on" : ""} onClick={() => setGuangxing(null)}>
            不特別標記
          </button>
          {(Object.entries(GUANGXING) as [GuangxingKey, (typeof GUANGXING)[GuangxingKey]][]).map(([k, v]) => (
            <button key={k} className={guangxing === k ? "on" : ""} onClick={() => setGuangxing(k)}>
              {v[0]}
            </button>
          ))}
        </div>

        <label>光法(選填)</label>
        <div className="row">
          <button className={guangfa === null ? "on" : ""} onClick={() => setGuangfa(null)}>
            不特別標記
          </button>
          {(Object.entries(GUANGFA) as [GuangfaKey, (typeof GUANGFA)[GuangfaKey]][]).map(([k, v]) => (
            <button key={k} className={guangfa === k ? "on" : ""} onClick={() => setGuangfa(k)}>
              {v[0]}
            </button>
          ))}
        </div>

        <label>類型／能力</label>
        <input
          className="field"
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          placeholder="例如:心／知、念能／專注、草稿"
        />
        <small>開始前可改;計時結束時會建立一筆有分鐘數的修行紀錄。</small>
      </div>

      {error && <p className="form-error" role="alert">{error}</p>}
    </section>
  );
}
