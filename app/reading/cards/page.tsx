"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ACTIVE_INSIGHT_STATUSES,
  INSIGHT_TOPICS,
  PROGRAM_APPLICATIONS,
  isStuckInsight,
  type InsightCardWithBook,
  type InsightTopic,
  type ProgramApplication,
} from "@/lib/reading/types";

async function readJson<T>(response: Response): Promise<T> {
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((json as { error?: string }).error ?? `操作失敗（${response.status}）`);
  return json as T;
}

type View = "due" | "program" | "topics" | "stuck";

export default function ReadingCardsPage() {
  const router = useRouter();
  const [cards, setCards] = useState<InsightCardWithBook[]>([]);
  const [todayISO, setTodayISO] = useState("");
  const [view, setView] = useState<View>("due");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/dojo/reading/cards", { cache: "no-store" });
      const json = await readJson<{ cards: InsightCardWithBook[]; todayISO: string }>(response);
      setCards(json.cards ?? []);
      setTodayISO(json.todayISO);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const dueCards = useMemo(() => cards.filter((card) =>
    ACTIVE_INSIGHT_STATUSES.includes(card.status) && Boolean(card.nextVisitAt && card.nextVisitAt <= todayISO)
  ), [cards, todayISO]);
  const programCards = useMemo(() => cards.filter((card) =>
    (card.status === "已驗證" || card.status === "不成立") && card.programApplication === "未定"
  ), [cards]);
  const stuckCards = useMemo(() => cards.filter((card) => isStuckInsight(card, todayISO)), [cards, todayISO]);

  function updateCard(next: InsightCardWithBook) {
    setCards((current) => current.map((card) => card.id === next.id ? { ...card, ...next } : card));
  }

  return (
    <section className="screen reading-screen reading-library-screen">
      <div className="reading-page-intro">
        <span className="eyebrow">閱讀萃取</span>
        <h1>洞察卡片庫</h1>
        <p>看見現在需要回訪、可成為內容線索，以及已經卡住的洞察。</p>
      </div>

      <div className="reading-library-tabs" role="tablist">
        <button className={view === "due" ? "on" : ""} onClick={() => setView("due")}><span>{dueCards.length}</span>今日待回訪</button>
        <button className={view === "program" ? "on" : ""} onClick={() => setView("program")}><span>{programCards.length}</span>可做節目</button>
        <button className={view === "topics" ? "on" : ""} onClick={() => setView("topics")}><span>{cards.length}</span>依主題聚合</button>
        <button className={view === "stuck" ? "on" : ""} onClick={() => setView("stuck")}><span>{stuckCards.length}</span>卡住的卡片</button>
      </div>

      {loading && <div className="empty">正在整理洞察卡片…</div>}
      {error && <p className="form-error" role="alert">{error}<button className="text-link" onClick={() => void load()}>重新讀取</button></p>}

      {!loading && view === "due" && (
        <CardSection
          title="今日待回訪"
          hint="到期後才會出現在這裡"
          cards={dueCards}
          empty="今天沒有到期卡片。"
          extra={<button className="primary" onClick={() => router.push("/reading/visits")}>開始今日回訪</button>}
          onUpdated={updateCard}
        />
      )}
      {!loading && view === "program" && (
        <CardSection
          title="可做節目"
          hint="已有真實結果，且尚未決定用途"
          cards={programCards}
          empty="已驗證或不成立的洞察，會在這裡等待你決定用途。"
          onUpdated={updateCard}
        />
      )}
      {!loading && view === "stuck" && (
        <CardSection
          title="卡住的卡片"
          hint="超過一個月，或已順延至少三次"
          cards={stuckCards}
          empty="目前沒有卡住的洞察。"
          stuck
          onUpdated={updateCard}
        />
      )}
      {!loading && view === "topics" && <TopicGroups cards={cards} onUpdated={updateCard} />}
    </section>
  );
}

function TopicGroups({ cards, onUpdated }: { cards: InsightCardWithBook[]; onUpdated: (card: InsightCardWithBook) => void }) {
  const groups = useMemo(() => {
    const map = new Map<string, InsightCardWithBook[]>();
    for (const card of cards) {
      const topics = card.topics.length ? card.topics : ["未分類"];
      for (const topic of topics) map.set(topic, [...(map.get(topic) ?? []), card]);
    }
    return [...map.entries()].sort(([a], [b]) => a === "未分類" ? 1 : b === "未分類" ? -1 : a.localeCompare(b, "zh-Hant"));
  }, [cards]);
  if (!groups.length) return <div className="reading-soft-empty">立成洞察卡後，才會開始形成主題線索。</div>;
  return <div className="reading-topic-groups">{groups.map(([topic, topicCards]) => (
    <section key={topic} className="reading-topic-group">
      <div className="reading-section-heading"><div><h2>{topic}</h2><p>{topicCards.length} 張洞察</p></div></div>
      <div className="reading-library-list">{topicCards.map((card) => <LibraryCard key={`${topic}-${card.id}`} card={card} onUpdated={onUpdated} />)}</div>
    </section>
  ))}</div>;
}

function CardSection({
  title,
  hint,
  cards,
  empty,
  extra,
  stuck = false,
  onUpdated,
}: {
  title: string;
  hint: string;
  cards: InsightCardWithBook[];
  empty: string;
  extra?: React.ReactNode;
  stuck?: boolean;
  onUpdated: (card: InsightCardWithBook) => void;
}) {
  return <section className="reading-library-section">
    <div className="reading-section-heading"><div><h2>{title}</h2><p>{hint}</p></div></div>
    {extra}
    {cards.length === 0 ? <div className="reading-soft-empty">{empty}</div> : (
      <div className="reading-library-list">{cards.map((card) => <LibraryCard key={card.id} card={card} stuck={stuck} onUpdated={onUpdated} />)}</div>
    )}
  </section>;
}

function LibraryCard({ card, stuck = false, onUpdated }: { card: InsightCardWithBook; stuck?: boolean; onUpdated: (card: InsightCardWithBook) => void }) {
  const [organizing, setOrganizing] = useState(false);
  const [stuckPanel, setStuckPanel] = useState(false);
  const [topics, setTopics] = useState<InsightTopic[]>(card.topics);
  const [programApplication, setProgramApplication] = useState<ProgramApplication>(card.programApplication);
  const [nextAction, setNextAction] = useState(card.action);
  const [abandonReason, setAbandonReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function patch(body: Record<string, unknown>) {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/dojo/reading/cards/${card.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await readJson<{ card: InsightCardWithBook }>(response);
      const next = { ...card, ...json.card, sourceBookTitle: card.sourceBookTitle };
      onUpdated(next);
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function saveOrganization() {
    if (await patch({ actionName: "organize", topics, programApplication })) setOrganizing(false);
  }

  async function resolveStuck(actionName: "downgrade" | "reframe" | "abandon") {
    const ok = await patch({ actionName, nextAction, reason: actionName === "abandon" ? abandonReason : undefined });
    if (ok) {
      setStuckPanel(false);
      setAbandonReason("");
    }
  }

  return <article className={`reading-library-card ${stuck ? "is-stuck" : ""}`}>
    <div className="reading-visit-meta"><span>{card.actionType}</span><span>{card.status}</span><span>{card.sourceBookTitle}</span></div>
    <h3>{card.insight}</h3>
    <div className="reading-original-action"><small>行動化</small><p>{card.action}</p></div>
    {card.result && <p className="reading-library-result">{card.result}</p>}
    <div className="reading-card-tags">
      {card.topics.map((topic) => <span key={topic}>{topic}</span>)}
      {card.programApplication !== "未定" && <span>{card.programApplication}</span>}
      {card.postponementCount > 0 && <span>順延 {card.postponementCount} 次</span>}
    </div>
    <div className="reading-library-actions">
      <button onClick={() => setOrganizing((value) => !value)}>整理標籤</button>
      {stuck && <button className="danger" onClick={() => setStuckPanel((value) => !value)}>處理卡住狀態</button>}
    </div>

    {organizing && <div className="reading-organize-panel">
      <label>主題標籤</label>
      <div className="reading-topic-picker">{INSIGHT_TOPICS.map((topic) => <button key={topic} className={topics.includes(topic) ? "on" : ""} onClick={() => setTopics((current) => current.includes(topic) ? current.filter((item) => item !== topic) : [...current, topic])}>{topic}</button>)}</div>
      <label>節目應用</label>
      <select value={programApplication} onChange={(event) => setProgramApplication(event.target.value as ProgramApplication)}>{PROGRAM_APPLICATIONS.map((item) => <option key={item}>{item}</option>)}</select>
      <button className="primary" disabled={saving} onClick={() => void saveOrganization()}>{saving ? "儲存中…" : "儲存整理"}</button>
    </div>}

    {stuckPanel && <div className="reading-stuck-panel">
      {card.actionType === "執行型" ? <><p>如果目前做不動，可以先降成兩週觀察。</p><button className="primary reading-stuck-primary" disabled={saving} onClick={() => void resolveStuck("downgrade")}>降為觀察型</button></> : <><label>重新說明要觀察什麼</label><textarea rows={3} value={nextAction} onChange={(event) => setNextAction(event.target.value)} /><button className="primary reading-stuck-primary" disabled={saving || !nextAction.trim()} onClick={() => void resolveStuck("reframe")}>重新觀察</button></>}
      <div className="reading-stuck-abandon">
        <label>如果決定放下（原因可留白）</label>
        <textarea rows={2} value={abandonReason} onChange={(event) => setAbandonReason(event.target.value)} placeholder="例如：目前不再需要追蹤" />
        <button className="danger" disabled={saving} onClick={() => void resolveStuck("abandon")}>放棄這張卡片</button>
      </div>
    </div>}
    {error && <p className="form-error">{error}</p>}
  </article>;
}
