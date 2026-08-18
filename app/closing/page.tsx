"use client";

// 收光(依三方協作規格書 v1.3 §3.5/§3.5.1 從零實作,取代先前四選項的雛形版本)。
// 正式版將快速評分移到工作後台；本頁只處理個人收光與測頻。
//
// v1.3 §3.5:收光是「處置決定」,不是心靈語句——三個選項對應三種明確的處置方式,
// 不是勾選句。原本的「先收納」「不留紀錄」已取消,收納動作移到各場域的痕跡卡片
// 就地處理,不必等到收光。
//
// v1.3 §3.5.1:測頻只在收光復盤階段做,不在紀錄當下做——逐筆列出今天的片刻,
// 各自可用滑桿或數字輸入標記,可清除;保留單筆的數值與霍金斯狀態標籤,不計算
// 今日平均、不畫任何長條或進度條。
//
// 修正委派書 v1.0 四:新增強度(1–10),與頻率並列、規則相同——各自獨立可
// 清除,清除其中一個不影響另一個;顯示格式集中在 formatFreqIntensityLabel()
// (兩者皆有:"500・愛 ・ 強度 7";只有一項就只顯示那一項),不在這裡另外拼字串。
//
// 追加修正(2026-08-03,擁有者回報「滑桿一動即寫入,無確認、無收合、清除鈕
// 常駐」):改成三態——未標記顯示「標記頻率」「標記強度」兩顆入口按鈕;點下
// 任一顆展開「頻率＋強度」共用的編輯面板(滑桿改成先寫進本地暫存值,不即時
// 寫入 entries),按「確定」才真的呼叫 setEntryFreq/setEntryIntensity,「取消」
// 直接關閉、捨棄暫存值;已標記(至少一項有值)收合成一行(用既有的
// formatFreqIntensityLabel())＋一顆「編輯」按鈕,點編輯才重新展開。清除鈕
// 移到展開面板內,只有該欄位原本已有值時才顯示,按下去立即清除並收合。用
// touched 旗標追蹤這次編輯階段使用者實際動過哪個欄位,「確定」只寫入動過的
// 欄位——避免使用者只想標頻率,卻因為面板同時顯示兩個滑桿而意外把強度也寫進
// 預設值,維持「只填其中一項完全合法」的既有規則。
//
// 《收光三選項與居所接續 — 資料邏輯規格 v1.0》(2026-08-03,擁有者裁決零新增
// 欄位,沿用 DojoEntry 語意寫進 DB-14):三個選項是「今天整體怎麼結束」的一次性
// 動作,不改動任何一筆痕跡的狀態(§0.1)——這裡呼叫 POST /api/closing,不碰
// useDojo() 的 entries。三者送出成功後都播放低刺激收光動效(800–1200ms)再
// 回居所。
//
// 行光牌與收光系統・地基實作 v2.0(2026-08-04,補充裁決01)追加:「帶回」不
// 再固定是明天,改成按鈕列選「明天起七日內」的任一天(全站禁用 <select>、
// 日曆元件在手機上太慢——照抄委派書原文的理由)。一句話仍然選填,可略過。
//
// 收光改版(2026-08-04,補充裁決03)追加:
// - 3.1 同日重複收光前先問:進頁面先查今天是否已有紀錄(GET
//   /api/closing/today),使用者選了任一選項要送出時,若今天已有紀錄就先跳
//   確認對話框說明會失去什麼(取代／保留原本的),不得靜默覆蓋。「保留原本
//   的」不寫入,直接回居所(維持既有那筆有效)。
// - 3.2 送出成功後,依選項顯示一句描述系統行為的回饋文字,跟收光動效同時
//   出現——只描述做了什麼,不評價這一天過得如何,不出現鼓勵/關心/暗示產出
//   的措辭(實際文案由擁有者核定,這裡先給草稿)。
// - 3.3「直接收光」更名「寫下今天」,choice 值 close 改為語意相符的
//   journal。
// - 3.4/3.5(七題日記展開,2026-08-05 擁有者裁決§四之1選C:另開 DB-18 日記
//   庫,不塞進 DB-14):「寫下今天」點下去展開七題(晨間組+夜間組全部同時
//   列出,全部選填,不顯示完成度/進度條,不要求先選寫幾題);「帶回明天」
//   選完日期與一句話之後,一樣提供「寫日記」入口,不想寫可以直接送出。兩個
//   入口共用同一個 JournalQuestionsPanel,答案隨 POST /api/closing 的
//   journal 欄位一起送出,DB-18 的讀寫集中在 lib/journal/notionFormat.ts +
//   lib/notion/queries.ts/mutations.ts 的 upsertJournalEntry()。
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useDojo } from "@/lib/dojo/store";
import { SPACES, GUANGXING, GUANGFA, type DojoEntry } from "@/lib/dojo/constants";
import { carryDateOptions, fmtDateWD, type ClosingChoice } from "@/lib/closing/notionFormat";
import { JOURNAL_QUESTIONS, type JournalAnswers } from "@/lib/journal/notionFormat";
import { taipeiTodayISO } from "@/lib/dojo/formal";
import {
  resolveHawkinsLevel,
  formatFreqIntensityLabel,
  HAWKINS_MIN,
  HAWKINS_MAX,
  INTENSITY_MIN,
  INTENSITY_MAX,
} from "@/lib/dojo/hawkins";

const CHOICES: { choice: ClosingChoice; label: string; note: string }[] = [
  { choice: "carry", label: "帶回", note: "選一天,建立一個溫和的接續入口。" },
  { choice: "journal", label: "寫下今天", note: "留幾句今天的紀錄,幾題都可以。" },
  { choice: "pause", label: "暫且放下", note: "不建立待辦,現在先休息。" },
];

// 選完之後的回饋文字草稿(3.2):只描述系統剛剛做了什麼,不評價這一天、不
// 鼓勵、不暗示「有沒有產出」。實際文案由擁有者核定。
function feedbackText(choice: ClosingChoice, carryToDate: string | null): string {
  if (choice === "carry") {
    return carryToDate ? `這件事會在 ${fmtDateWD(carryToDate)}出現在居所。` : "已記下要帶回的這件事。";
  }
  if (choice === "journal") return "今天寫下的內容已經存下來了。";
  return "今天到此結束,不會留下任何待辦。";
}

type ExistingToday = { title: string; note?: string; carryToDate?: string } | null;

const DEFAULT_FREQ = 500;
const DEFAULT_INTENSITY = 5;

const WD = ["日", "一", "二", "三", "四", "五", "六"];

// 按鈕標籤:第 1 天「明天」、第 2 天「後天」,其餘用日期(中文口語沒有更多
// 天數的專用稱呼)——每個按鈕都加註星期幾,方便使用者不用自己心算對到哪天。
function fmtCarryOption(iso: string, dayIndex: number): string {
  const d = new Date(iso + "T00:00:00");
  const wd = `週${WD[d.getDay()]}`;
  if (dayIndex === 0) return `明天・${wd}`;
  if (dayIndex === 1) return `後天・${wd}`;
  return `${d.getMonth() + 1}/${d.getDate()}・${wd}`;
}

export default function ClosingPage() {
  const router = useRouter();
  const { entries } = useDojo();
  const todayISO = taipeiTodayISO();
  const todayEntries = entries.filter((e) => e.date === todayISO);

  // 「帶回」是唯一有額外步驟的選項:點下去先展開日期按鈕列(必選)＋一句話
  // 輸入框(可留空),按確定才真的送出;另外兩個選項點下去就直接送出,不需要
  // 中間狀態。
  const [carryStep, setCarryStep] = useState(false);
  const [carryDate, setCarryDate] = useState<string | null>(null);
  const [carryNote, setCarryNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [settled, setSettled] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 3.4:「寫下今天」點下去展開七題日記面板(不是立即送出)。
  const [journalStep, setJournalStep] = useState(false);
  // 3.5:「帶回明天」流程裡,選完日期/一句話之後,選擇要不要順便寫日記。
  const [carryJournalOpen, setCarryJournalOpen] = useState(false);
  // 兩個入口共用同一份答案暫存——同一次收光動作只會走其中一個入口。
  const [journalAnswers, setJournalAnswers] = useState<JournalAnswers>({});

  // 3.1:進頁面先查今天是否已有收光紀錄,送出時若已存在就先擋下來問——不得
  // 靜默覆蓋。pendingSubmit 非 null 時代表確認對話框正在顯示,尚未真的送出。
  const [existingToday, setExistingToday] = useState<ExistingToday>(null);
  const [pendingSubmit, setPendingSubmit] = useState<{
    choice: ClosingChoice;
    extra?: { note?: string; carryToDate?: string; journal?: JournalAnswers };
  } | null>(null);
  // 3.2:回饋文字要引用「剛剛送出的那個選擇」,不是目前畫面上的暫存狀態(例如
  // 送出後 carryStep 可能已經被使用者切換掉),所以送出成功當下另外記一份。
  const [lastSubmitted, setLastSubmitted] = useState<{ choice: ClosingChoice; carryToDate: string | null } | null>(
    null
  );

  const carryOptions = carryDateOptions(todayISO);

  useEffect(() => {
    fetch("/api/closing/today")
      .then((res) => res.json())
      .then((data) => setExistingToday(data.existing ?? null))
      .catch(() => {});
  }, []);

  async function doSubmit(
    choice: ClosingChoice,
    extra?: { note?: string; carryToDate?: string; journal?: JournalAnswers }
  ) {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/closing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          choice,
          note: extra?.note,
          carryToDate: extra?.carryToDate,
          journal: extra?.journal,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "收光失敗,請重試。");
      }
      setLastSubmitted({ choice, carryToDate: extra?.carryToDate ?? null });
      setSettled(true);
      // 低刺激收光動效(800–1200ms)後回居所——不是換頁式的成功訊息,是安靜地淡出。
      setTimeout(() => router.push("/"), 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  // 三個送出入口(暫且放下/寫下今天的直接送出按鈕、帶回的最終送出按鈕)都改
  // 呼叫這裡,而不是直接呼叫 doSubmit——今天已有紀錄時先跳確認對話框,由使用者
  // 決定取代或保留原本的,不得替使用者決定。
  function requestSubmit(
    choice: ClosingChoice,
    extra?: { note?: string; carryToDate?: string; journal?: JournalAnswers }
  ) {
    if (existingToday) {
      setPendingSubmit({ choice, extra });
      return;
    }
    doSubmit(choice, extra);
  }

  function confirmOverwrite() {
    if (!pendingSubmit) return;
    const { choice, extra } = pendingSubmit;
    setPendingSubmit(null);
    doSubmit(choice, extra);
  }

  // 保留原本的:不寫入任何東西,直接回居所,維持既有那筆紀錄有效。
  function keepExisting() {
    setPendingSubmit(null);
    router.push("/");
  }

  return (
    <section className="screen">
      <h1>收光</h1>
      <p className="lead">今天可以安心結束;沒有未完成警告,也不要求連續打卡。</p>
      <div className="box cl">
        <span className="label">今天回望</span>
        <b>你留下了 {entries.length} 個片刻。</b>
        <small>它們可以留在今天、帶回明天、放下,或直接收光。</small>
      </div>

      <h3>復盤測頻</h3>
      <p className="lead">願不願意標記當時的能量與投入程度;不測也完全可以。</p>
      {todayEntries.length === 0 && <div className="empty">今天還沒有片刻可以復盤。</div>}
      {todayEntries.map((e) => (
        <div key={e.id} className={`item ${SPACES[e.space]?.[1] ?? "dw"}`}>
          <span className="status">
            <span className="dot" />
            {SPACES[e.space]?.[0]} · {e.kind}
          </span>
          {e.guangxing && (
            <span className="tag" style={{ borderColor: "var(--gold)", color: "var(--gold)" }}>
              {GUANGXING[e.guangxing][0]}
            </span>
          )}
          {e.guangfa && (
            <span className="tag" style={{ borderColor: "var(--gold)", color: "var(--gold)" }}>
              {GUANGFA[e.guangfa][0]}
            </span>
          )}
          <b>{e.title}</b>
          <ClosingMeasurePanel entry={e} />
        </div>
      ))}

      <h3>今天怎麼處置</h3>
      {error && <div className="warn">{error}</div>}
      {pendingSubmit && (
        <div className="item cl warn" role="alertdialog">
          <b>今天已經收過光了({existingToday?.title}),要用新的取代嗎?</b>
          <small>選「保留原本的」不會寫入任何東西,今天原本那筆紀錄會維持不變。</small>
          <div className="two" style={{ marginTop: 8 }}>
            <button onClick={keepExisting}>保留原本的</button>
            <button className="primary" onClick={confirmOverwrite}>
              取代
            </button>
          </div>
        </div>
      )}
      {!carryStep &&
        !journalStep &&
        !pendingSubmit &&
        CHOICES.map((c) => (
          <button
            key={c.choice}
            className="item cl"
            disabled={submitting}
            onClick={() => {
              if (c.choice === "carry") return setCarryStep(true);
              if (c.choice === "journal") return setJournalStep(true);
              requestSubmit(c.choice);
            }}
          >
            <b>{c.label}</b>
            <small>{c.note}</small>
          </button>
        ))}
      {journalStep && !pendingSubmit && (
        <div className="item cl">
          <b>寫下今天</b>
          <small>七題都可以留空,想寫幾題都可以,不想寫也能直接完成。</small>
          <JournalQuestionsPanel answers={journalAnswers} onChange={setJournalAnswers} />
          <div className="two" style={{ marginTop: 8 }}>
            <button
              onClick={() => {
                setJournalStep(false);
                setJournalAnswers({});
              }}
              disabled={submitting}
            >
              取消
            </button>
            <button
              className="primary"
              disabled={submitting}
              onClick={() => requestSubmit("journal", { journal: journalAnswers })}
            >
              {submitting ? "送出中…" : "完成,送出"}
            </button>
          </div>
        </div>
      )}
      {carryStep && !pendingSubmit && (
        <div className="item cl">
          <b>帶回哪一天</b>
          <small>選一天,明天起七日內。</small>
          <div className="row" style={{ marginTop: 8 }}>
            {carryOptions.map((iso, i) => (
              <button key={iso} className={carryDate === iso ? "on" : ""} onClick={() => setCarryDate(iso)}>
                {fmtCarryOption(iso, i)}
              </button>
            ))}
          </div>
          <small style={{ display: "block", marginTop: 10 }}>可以寫一句話,亦可略過。</small>
          <textarea
            className="field"
            style={{ marginTop: 8 }}
            value={carryNote}
            onChange={(e) => setCarryNote(e.target.value)}
            placeholder="想帶到那一天的一句話(選填)"
          />

          {!carryJournalOpen && (
            <>
              <small style={{ display: "block", marginTop: 10 }}>
                要不要順便寫下今天?不想寫可以直接結束。
              </small>
              <div className="two" style={{ marginTop: 8 }}>
                <button
                  onClick={() => {
                    setCarryStep(false);
                    setCarryDate(null);
                    setCarryNote("");
                  }}
                  disabled={submitting}
                >
                  取消
                </button>
                <button onClick={() => setCarryJournalOpen(true)} disabled={submitting}>
                  寫日記
                </button>
              </div>
              <button
                className="primary"
                style={{ marginTop: 8, width: "100%" }}
                disabled={submitting || !carryDate}
                onClick={() => carryDate && requestSubmit("carry", { note: carryNote, carryToDate: carryDate })}
              >
                {submitting ? "送出中…" : "不寫,直接帶回"}
              </button>
            </>
          )}

          {carryJournalOpen && (
            <>
              <JournalQuestionsPanel answers={journalAnswers} onChange={setJournalAnswers} />
              <div className="two" style={{ marginTop: 8 }}>
                <button
                  onClick={() => {
                    setCarryJournalOpen(false);
                    setJournalAnswers({});
                  }}
                  disabled={submitting}
                >
                  返回
                </button>
                <button
                  className="primary"
                  disabled={submitting || !carryDate}
                  onClick={() =>
                    carryDate &&
                    requestSubmit("carry", { note: carryNote, carryToDate: carryDate, journal: journalAnswers })
                  }
                >
                  {submitting ? "送出中…" : "完成,送出"}
                </button>
              </div>
            </>
          )}
        </div>
      )}
      {settled && (
        <div className="settle" role="status">
          {lastSubmitted && feedbackText(lastSubmitted.choice, lastSubmitted.carryToDate)}
        </div>
      )}
    </section>
  );
}

// 七題日記(3.4/3.5 共用):一次全部列出晨間組+夜間組,不分批展開;每題都
// 只是「選填」,不顯示已填幾題/還剩幾題/進度條,不要求先選今天要寫多少
// (委派書補充裁決03 §3.4 硬規則)。
const JOURNAL_GROUPS = ["晨間", "夜間"] as const;

function JournalQuestionsPanel({
  answers,
  onChange,
}: {
  answers: JournalAnswers;
  onChange: (next: JournalAnswers) => void;
}) {
  return (
    <div style={{ marginTop: 10 }}>
      {JOURNAL_GROUPS.map((group) => (
        <div key={group} style={{ marginTop: 8 }}>
          <small style={{ display: "block", fontWeight: 600 }}>{group}組</small>
          {JOURNAL_QUESTIONS.filter((q) => q.group === group).map((q) => (
            <div key={q.key} style={{ marginTop: 8 }}>
              <small style={{ display: "block" }}>{q.label}</small>
              <textarea
                className="field"
                style={{ marginTop: 4 }}
                value={answers[q.key] ?? ""}
                onChange={(e) => onChange({ ...answers, [q.key]: e.target.value })}
                placeholder="選填"
              />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// 頻率／強度共用一個編輯面板(未標記→展開中→已標記三態,見檔案開頭註解)。
function ClosingMeasurePanel({ entry }: { entry: DojoEntry }) {
  const { setEntryFreq, setEntryIntensity } = useDojo();
  const [editing, setEditing] = useState(false);
  const [pendingFreq, setPendingFreq] = useState(entry.freq ?? DEFAULT_FREQ);
  const [touchedFreq, setTouchedFreq] = useState(entry.freq != null);
  const [pendingIntensity, setPendingIntensity] = useState(entry.intensity ?? DEFAULT_INTENSITY);
  const [touchedIntensity, setTouchedIntensity] = useState(entry.intensity != null);

  const level = entry.freq != null ? resolveHawkinsLevel(entry.freq) : null;
  const combinedLabel = formatFreqIntensityLabel(entry.freq, entry.intensity);
  const hasAny = entry.freq != null || entry.intensity != null;

  function openEdit() {
    // 展開時把暫存值重設回目前實際值,不會殘留上一次取消掉的操作。
    setPendingFreq(entry.freq ?? DEFAULT_FREQ);
    setTouchedFreq(entry.freq != null);
    setPendingIntensity(entry.intensity ?? DEFAULT_INTENSITY);
    setTouchedIntensity(entry.intensity != null);
    setEditing(true);
  }

  function confirm() {
    // 只寫入這次編輯階段真的動過的欄位,沒動過的維持原狀(不會被面板上顯示的
    // 預設滑桿位置意外寫入)。
    if (touchedFreq) setEntryFreq(entry.id, pendingFreq);
    if (touchedIntensity) setEntryIntensity(entry.id, pendingIntensity);
    setEditing(false);
  }

  function cancel() {
    // 未按確定即離開,不寫入——暫存值直接捨棄。
    setEditing(false);
  }

  function clearFreqNow() {
    setEntryFreq(entry.id, null);
    setTouchedFreq(false);
    setPendingFreq(DEFAULT_FREQ);
  }

  function clearIntensityNow() {
    setEntryIntensity(entry.id, null);
    setTouchedIntensity(false);
    setPendingIntensity(DEFAULT_INTENSITY);
  }

  if (!editing) {
    if (!hasAny) {
      return (
        <div className="two" style={{ marginTop: 8 }}>
          <button onClick={openEdit}>標記頻率</button>
          <button onClick={openEdit}>標記強度</button>
        </div>
      );
    }
    return (
      <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span className="tag" style={{ borderColor: level?.color ?? "var(--gold)", color: level?.color ?? "var(--gold)" }}>
          {combinedLabel}
        </span>
        <button onClick={openEdit}>編輯</button>
      </div>
    );
  }

  return (
    <div style={{ marginTop: 8 }}>
      <small style={{ display: "block" }}>頻率(0–1000)</small>
      <div className="two" style={{ marginTop: 4, alignItems: "center" }}>
        <input
          type="range"
          min={HAWKINS_MIN}
          max={HAWKINS_MAX}
          step={5}
          value={pendingFreq}
          onChange={(ev) => {
            setPendingFreq(Number(ev.target.value));
            setTouchedFreq(true);
          }}
        />
        <input
          className="field"
          style={{ margin: 0 }}
          type="number"
          min={HAWKINS_MIN}
          max={HAWKINS_MAX}
          value={pendingFreq}
          onChange={(ev) => {
            const n = Number(ev.target.value);
            if (Number.isFinite(n)) {
              setPendingFreq(Math.min(HAWKINS_MAX, Math.max(HAWKINS_MIN, n)));
              setTouchedFreq(true);
            }
          }}
        />
      </div>
      {entry.freq != null && (
        <button className="danger" style={{ marginTop: 4 }} onClick={clearFreqNow}>
          清除頻率
        </button>
      )}

      <small style={{ display: "block", marginTop: 12 }}>強度(1–10)</small>
      <div className="two" style={{ marginTop: 4, alignItems: "center" }}>
        <input
          type="range"
          min={INTENSITY_MIN}
          max={INTENSITY_MAX}
          step={1}
          value={pendingIntensity}
          onChange={(ev) => {
            setPendingIntensity(Number(ev.target.value));
            setTouchedIntensity(true);
          }}
        />
        <input
          className="field"
          style={{ margin: 0 }}
          type="number"
          min={INTENSITY_MIN}
          max={INTENSITY_MAX}
          value={pendingIntensity}
          onChange={(ev) => {
            const n = Number(ev.target.value);
            if (Number.isFinite(n)) {
              setPendingIntensity(Math.min(INTENSITY_MAX, Math.max(INTENSITY_MIN, n)));
              setTouchedIntensity(true);
            }
          }}
        />
      </div>
      {entry.intensity != null && (
        <button className="danger" style={{ marginTop: 4 }} onClick={clearIntensityNow}>
          清除強度
        </button>
      )}

      <div className="two" style={{ marginTop: 10 }}>
        <button onClick={cancel}>取消</button>
        <button className="primary" onClick={confirm}>
          確定
        </button>
      </div>
    </div>
  );
}
