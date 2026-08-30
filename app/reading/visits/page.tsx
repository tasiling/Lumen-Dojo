"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { InsightCardWithBook } from "@/lib/reading/types";

async function readJson<T>(response: Response): Promise<T> {
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((json as { error?: string }).error ?? `操作失敗（${response.status}）`);
  return json as T;
}

export default function ReadingVisitsPage() {
  const router = useRouter();
  const [cards, setCards] = useState<InsightCardWithBook[]>([]);
  const [todayISO, setTodayISO] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/dojo/reading/cards?view=due", { cache: "no-store" });
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

  function removeCard(id: string) {
    setCards((current) => current.filter((card) => card.id !== id));
  }

  return (
    <section className="screen reading-screen reading-visits-screen">
      <div className="reading-page-intro">
        <span className="eyebrow">閱讀萃取</span>
        <h1>今日回訪</h1>
        <p>現在回來看的，是「做了嗎、結果如何」，不測記憶，也不把延後算成失敗。</p>
      </div>
      <div className="reading-page-tabs">
        <button className="on">今日回訪</button>
        <button onClick={() => router.push("/reading/cards")}>卡片庫</button>
      </div>

      {loading && <div className="empty">正在找今天需要回來看的卡片…</div>}
      {error && <p className="form-error" role="alert">{error}<button className="text-link" onClick={() => void load()}>重新讀取</button></p>}
      {!loading && !error && cards.length === 0 && (
        <div className="reading-complete-empty"><span>✓</span><h2>今天沒有到期卡片</h2><p>下次回訪日到了，它們會再回到這裡。</p></div>
      )}
      <div className="reading-visit-list">
        {cards.map((card) => (
          <VisitCard key={card.id} card={card} todayISO={todayISO} onResolved={() => removeCard(card.id)} />
        ))}
      </div>
    </section>
  );
}

function VisitCard({ card, todayISO, onResolved }: { card: InsightCardWithBook; todayISO: string; onResolved: () => void }) {
  const [panel, setPanel] = useState<"result" | "abandon" | "stuck" | null>(null);
  const [result, setResult] = useState("");
  const [resultStatus, setResultStatus] = useState<"已驗證" | "不成立">("已驗證");
  const [reason, setReason] = useState("");
  const [reframedAction, setReframedAction] = useState(card.action);
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
      return await readJson<{ card: InsightCardWithBook; stuck?: boolean }>(response);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function postpone() {
    const json = await patch({ actionName: "postpone" });
    if (!json) return;
    if (json.stuck) setPanel("stuck");
    else onResolved();
  }

  async function saveResult() {
    const json = await patch({ actionName: "result", result, status: resultStatus });
    if (json) onResolved();
  }

  async function abandon() {
    const json = await patch({ actionName: "abandon", reason });
    if (json) onResolved();
  }

  async function downgrade() {
    const json = await patch({ actionName: "downgrade" });
    if (json) onResolved();
  }

  async function reframe() {
    const json = await patch({ actionName: "reframe", nextAction: reframedAction });
    if (json) onResolved();
  }

  async function startAction() {
    const json = await patch({ actionName: "start" });
    if (json) onResolved();
  }

  return (
    <article className="reading-visit-card">
      <div className="reading-visit-meta"><span>{card.actionType}</span><span>{card.sourceBookTitle}</span><span>{card.nextVisitAt && card.nextVisitAt < todayISO ? "已到期" : "今天回訪"}</span></div>
      <h2>{card.insight}</h2>
      <div className="reading-original-action"><small>當初寫下的行動化</small><p>{card.action}</p></div>
      {card.result && <details className="reading-previous-results"><summary>之前留下的感悟與結果</summary><p>{card.result}</p></details>}
      {card.postponementCount > 0 && <p className="reading-postpone-count">已順延 {card.postponementCount} 次</p>}

      {panel === null && (
        <div className="reading-visit-actions">
          <button className="primary" onClick={() => setPanel("result")}>有結果了</button>
          <button onClick={() => void postpone()} disabled={saving}>還沒做／還在觀察</button>
          <button onClick={() => setPanel("abandon")}>這張放棄</button>
          {card.actionType === "執行型" && card.status === "待行動" && <button className="reading-start-action" onClick={() => void startAction()} disabled={saving}>開始做這個行動</button>}
        </div>
      )}

      {panel === "result" && (
        <div className="reading-visit-panel">
          <label>實際發生了什麼？</label>
          <textarea rows={4} value={result} onChange={(event) => setResult(event.target.value)} placeholder="做了什麼、觀察到什麼，結果和原本想的一樣嗎？" />
          <div className="segmented"><button className={resultStatus === "已驗證" ? "on" : ""} onClick={() => setResultStatus("已驗證")}>已驗證</button><button className={resultStatus === "不成立" ? "on" : ""} onClick={() => setResultStatus("不成立")}>不成立</button></div>
          <div className="reading-panel-actions"><button onClick={() => setPanel(null)}>返回</button><button className="primary" disabled={saving || !result.trim()} onClick={() => void saveResult()}>{saving ? "儲存中…" : "留下結果"}</button></div>
        </div>
      )}

      {panel === "abandon" && (
        <div className="reading-visit-panel">
          <label>放棄原因（可留白）</label>
          <textarea rows={3} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="為什麼決定不再追蹤這張卡？" />
          <p>放棄代表尚未驗證就停止，不會進入可做節目的清單。</p>
          <div className="reading-panel-actions"><button onClick={() => setPanel(null)}>返回</button><button className="danger" disabled={saving} onClick={() => void abandon()}>{saving ? "處理中…" : "確認放棄"}</button></div>
        </div>
      )}

      {panel === "stuck" && (
        <div className="reading-stuck-panel">
          <span>已經順延三次</span>
          <h3>這張卡需要換一種處理方式</h3>
          {card.actionType === "執行型" ? (
            <><p>可以把實際行動降成低成本觀察，或決定停止追蹤。</p><div className="reading-panel-actions"><button className="primary" disabled={saving} onClick={() => void downgrade()}>降為觀察型</button><button className="danger" disabled={saving} onClick={() => setPanel("abandon")}>放棄</button></div></>
          ) : (
            <><label>重新說明接下來要觀察什麼</label><textarea rows={3} value={reframedAction} onChange={(event) => setReframedAction(event.target.value)} /><div className="reading-panel-actions"><button className="primary" disabled={saving || !reframedAction.trim()} onClick={() => void reframe()}>保留並重新觀察</button><button className="danger" disabled={saving} onClick={() => setPanel("abandon")}>放棄</button></div></>
          )}
        </div>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
    </article>
  );
}
