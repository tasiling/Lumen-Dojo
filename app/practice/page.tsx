"use client";

// 修習所(雛形 practice()/body()/mind()/spirit()/logs()等頁面的等價實作,原本
// 對應念能分頁的函式已隨本次改版整個替換掉)。
//
// 修正委派書 v1.0 三:分頁從 身/心/靈修/念能/修行紀錄 改為 身/心/靈/光行/光法/
// 修行紀錄(6 分頁);「心」點入後在下面再多一排 知/情/意 子分頁(v1.1 起就有
// 這個概念,這次正式做成 UI)。原本已作廢的舊版單層五功法系統,拆成光行五與
// 光法五兩個獨立分頁,各自選填、不計分、不解鎖、不累積等級。
//
// 追加修正(2026-08-03,擁有者指示):六個子項目(身/心-知/心-情/心-意/靈/
// 光行/光法)的內容卡片上各加一顆「在此計時」,直接呼叫 useDojo() 的
// startTimerWith() 一次帶入完整的 space/title/kind(光行/光法分頁另外帶入
// 目前選中的項目),不需要使用者到 /timer 再重新選一次自己剛剛所在的位置。
// 身/心的知情意/靈沒有既定的光行／光法對應關係(那是兩套獨立的選填標籤,不
// 是身心靈的子分類),維持「不特別標記」,不自行發明對應。
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useDojo } from "@/lib/dojo/store";
import { GUANGXING, GUANGFA, type GuangxingKey, type GuangfaKey } from "@/lib/dojo/constants";
import LearningPaths from "../components/LearningPaths";

type Tab = "body" | "mind" | "spirit" | "guangxing" | "guangfa" | "logs";
const TABS: { key: Tab; label: string }[] = [
  { key: "body", label: "身" },
  { key: "mind", label: "心" },
  { key: "spirit", label: "靈" },
  { key: "guangxing", label: "光行" },
  { key: "guangfa", label: "光法" },
  { key: "logs", label: "修行紀錄" },
];

export default function PracticePage() {
  const [tab, setTab] = useState<Tab>("body");
  return (
    <section className="screen">
      <h1>修習所</h1>
      <p className="lead">身、心、靈、光行、光法與修行紀錄;「心」明確拆為知、情、意。</p>
      <div className="row">
        {TABS.map((t) => (
          <button key={t.key} className={tab === t.key ? "on" : ""} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>
      <div>
        {tab === "body" && <BodyTab />}
        {tab === "mind" && <MindTab />}
        {tab === "spirit" && <SpiritTab />}
        {tab === "guangxing" && <GuangxingTab />}
        {tab === "guangfa" && <GuangfaTab />}
        {tab === "logs" && <LogsTab />}
      </div>
    </section>
  );
}

function BodyTab() {
  const router = useRouter();
  const { openQuickAdd, startTimerWith } = useDojo();
  // 身沒有明確對應的光行／光法項目(兩者是獨立的選填標籤,不是身心靈的子分類),
  // 維持不特別標記,不自行發明對應關係。
  function startHere() {
    startTimerWith({ space: "practice", title: "身", kind: "身" });
    router.push("/timer");
  }
  return (
    <>
      <div className="card">
        <span className="label">身體照料</span>
        <b>今天先照看身體。</b>
        <small>活動、睡眠、飲食、疼痛與恢復都可作為單次紀錄,不強迫建立 Session。</small>
        <label className="check">
          <input type="checkbox" />
          活動／伸展
        </label>
        <label className="check">
          <input type="checkbox" />
          飲食與喝水
        </label>
        <label className="check">
          <input type="checkbox" />
          睡眠／休息
        </label>
      </div>
      <button className="primary" onClick={() => openQuickAdd({ presetSpace: "practice", presetKind: "身" })}>
        留下身體紀錄
      </button>
      <button className="ghost" onClick={startHere}>
        在此計時
      </button>
    </>
  );
}

type MindSub = "知" | "情" | "意";
const MIND_SUBS: MindSub[] = ["知", "情", "意"];
const MIND_SUB_DESC: Record<MindSub, string> = {
  知: "閱讀筆記、寫作練習、抄寫經文、學習筆記",
  情: "情緒覺察、感恩、心裡小語",
  意: "意圖設定、決定、承諾",
};

function MindTab() {
  const router = useRouter();
  const { openQuickAdd, startTimerWith } = useDojo();
  const [sub, setSub] = useState<MindSub>("知");
  // 知/情/意沒有明確對應的光行／光法項目,維持不特別標記(理由同身)。
  function startHere() {
    startTimerWith({ space: "practice", title: `心・${sub}`, kind: `心／${sub}` });
    router.push("/timer");
  }
  return (
    <>
      <div className="row">
        {MIND_SUBS.map((s) => (
          <button key={s} className={sub === s ? "on" : ""} onClick={() => setSub(s)}>
            {s}
          </button>
        ))}
      </div>
      {sub === "知" ? <LearningPaths /> : <>
        <div className="card">
          <span className="label">心・{sub}</span>
          <b>覺察此刻的心。</b>
          <small>{MIND_SUB_DESC[sub]}</small>
        </div>
        <button className="primary" onClick={() => openQuickAdd({ presetSpace: "practice", presetKind: `心／${sub}` })}>
          留下{sub}的紀錄
        </button>
        <button className="ghost" onClick={startHere}>
          在此計時
        </button>
      </>}
    </>
  );
}

function SpiritTab() {
  const router = useRouter();
  const { openQuickAdd, startTimerWith } = useDojo();
  // 靈沒有明確對應的光行／光法項目,維持不特別標記(理由同身)。
  function startHere() {
    startTimerWith({ space: "practice", title: "靈", kind: "靈" });
    router.push("/timer");
  }
  return (
    <>
      <div className="card">
        <span className="label">靈</span>
        <b>回到更深的連結。</b>
        <small>冥想、祈願、儀式、與宇宙對話的片刻。</small>
      </div>
      <button className="primary" onClick={() => openQuickAdd({ presetSpace: "practice", presetKind: "靈" })}>
        留下靈修紀錄
      </button>
      <button className="ghost" onClick={startHere}>
        在此計時
      </button>
    </>
  );
}

function GuangxingTab() {
  const router = useRouter();
  const { startTimerWith } = useDojo();
  const [selected, setSelected] = useState<GuangxingKey>("ning");
  const v = GUANGXING[selected];

  // 光行分頁選中的項目就是明確對應,直接帶入 guangxing——跟身/心/靈那幾個
  // 分頁不同,那幾個沒有既定的光行／光法對應關係,不能套用同一套邏輯。
  function startHere() {
    startTimerWith({
      space: "practice",
      title: `${v[0]}:${v[2].split("、")[0]}`,
      kind: `光行／${v[0]}`,
      guangxing: selected,
    });
    router.push("/timer");
  }

  return (
    <>
      <div className="card">
        <span className="label">光行五 · 每日修行的運作方式</span>
        <b>光行不是裝飾能力,而是每日修行的五種運作方式。</b>
        <small>選填標籤,不計分、不解鎖、不累積等級;可與光法同時標記,也可只標其一或都不標。</small>
      </div>
      <div className="row">
        {(Object.entries(GUANGXING) as [GuangxingKey, (typeof GUANGXING)[GuangxingKey]][]).map(([k, val]) => (
          <button key={k} className={selected === k ? "on" : ""} onClick={() => setSelected(k)}>
            {val[0]}
          </button>
        ))}
      </div>
      <div className="card">
        <span className="label">{v[0]}</span>
        <b>{v[1]}</b>
        <small>真實對應:{v[2]}</small>
        <button className="primary" onClick={startHere}>
          在此計時
        </button>
      </div>
    </>
  );
}

function GuangfaTab() {
  const router = useRouter();
  const { startTimerWith } = useDojo();
  const [selected, setSelected] = useState<GuangfaKey>("ju");
  const v = GUANGFA[selected];

  function startHere() {
    startTimerWith({
      space: "practice",
      title: `${v[0]}:${v[2].split("、")[0]}`,
      kind: `光法／${v[0]}`,
      guangfa: selected,
    });
    router.push("/timer");
  }

  return (
    <>
      <div className="card">
        <span className="label">光法五 · 光行成熟後的應用</span>
        <b>光法是光行穩定之後,自然發展出來的應用方式。</b>
        <small>選填標籤,不計分、不解鎖、不累積等級;可與光行同時標記,也可只標其一或都不標。</small>
      </div>
      <div className="row">
        {(Object.entries(GUANGFA) as [GuangfaKey, (typeof GUANGFA)[GuangfaKey]][]).map(([k, val]) => (
          <button key={k} className={selected === k ? "on" : ""} onClick={() => setSelected(k)}>
            {val[0]}
          </button>
        ))}
      </div>
      <div className="card">
        <span className="label">{v[0]}</span>
        <b>{v[1]}</b>
        <small>真實對應:{v[2]}</small>
        <button className="primary" onClick={startHere}>
          在此計時
        </button>
      </div>
    </>
  );
}

function LogsTab() {
  const { entries } = useDojo();
  const list = entries.filter((e) => e.space === "practice");
  if (list.length === 0) return <div className="empty">還沒有修行紀錄。</div>;
  return (
    <div className="timeline">
      {list.map((e) => (
        <div key={e.id} className="event" style={{ "--event": "var(--pr)" } as React.CSSProperties}>
          <b>{e.title}</b>
          <small>
            {e.kind} · {e.date}
          </small>
        </div>
      ))}
    </div>
  );
}
