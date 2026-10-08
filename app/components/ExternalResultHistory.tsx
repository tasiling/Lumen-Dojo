"use client";
import Link from "./PracticeRouteLink";
import { useEffect, useState } from "react";
import type { Receipt, Checkpoint } from "@/lib/dojo/externalResults/model";
const origin = "https://lumen-context-room-production-4a2c.up.railway.app";
type Cache = {
  receipts: Receipt[];
  cursor: string | null;
  checkpoint: Checkpoint | null;
  sources: { contextRoom: string; vocabForge: string };
  contractStatus: string;
};
const modes: Record<string, string> = {
  topic_speaking: "主題口說",
  dialogue: "情境對話",
  writing_review: "寫作",
  micro_practice: "表達活用",
  quick_retell: "快速重說",
};
const completions = {
  completed: "來源確認完成",
  withdrawn: "來源已撤回完成",
  unverified: "來源證據不足",
};
const availability = {
  available: "來源可用",
  archived: "來源封存・保留歷史",
  deleted: "來源已刪除・保留必要歷史",
};
export default function ExternalResultHistory({
  recent = false,
  onChanged,
}: {
  recent?: boolean;
  onChanged?: () => void;
}) {
  const [cache, setCache] = useState<Cache | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  async function read(cursor?: string) {
    const r = await fetch(
      `/api/dojo/external-results${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
      { cache: "no-store" },
    );
    const j = await r.json();
    if (!r.ok) throw Error(j.code ?? "CACHE_UNAVAILABLE");
    return j as Cache;
  }
  useEffect(() => {
    let live = true;
    read()
      .then((j) => {
        if (live) setCache(j);
      })
      .catch(() => {
        if (live) setError("來源快取暫時不可用；本地修習仍可使用。");
      });
    return () => {
      live = false;
    };
  }, []);
  async function action(action: string, id?: string) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const r = await fetch("/api/dojo/external-results", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...(id ? { id } : {}) }),
      });
      const j = await r.json();
      if (!r.ok) throw Error(j.code ?? "SOURCE_TEMPORARILY_UNAVAILABLE");
      onChanged?.();
      const refreshed = await read();
      setCache(refreshed);
      setMessage(
        action === "retry"
          ? refreshed.contractStatus === "active" ? "已核對來源投影；同一 Session 保留原事件。" : "契約待確認，未建立事件、投影或確認 Notion。"
          : j.remaining
            ? "本頁已保存，尚有下一頁；請繼續同步。"
            : refreshed.contractStatus === "active" ? `來源成果已保存；本次新增 ${j.counted ?? 0} 次。待核對項不計入。` : "來源查核已保存；待確認項不計入完成次數。",
      );
    } catch (e) {
      const code = e instanceof Error ? e.message : "";
      setError(
        code === "WRITE_LOCK_OR_INTENT_REQUIRES_REVIEW" ||
          code === "STORAGE_UNAVAILABLE_OR_UNKNOWN_OUTCOME"
          ? "儲存結果需核對。不要重送建立，請依來源收據與意圖紀錄恢復。"
          : `同步暫停（${code}）；保留上次來源資料，不視為刪除。`,
      );
    } finally {
      setBusy(false);
    }
  }
  async function more() {
    if (!cache?.cursor) return;
    setBusy(true);
    try {
      const page = await read(cache.cursor);
      setCache((c) =>
        c
          ? {
              ...page,
              receipts: [
                ...new Map(
                  [...c.receipts, ...page.receipts].map((r) => [r.id, r]),
                ).values(),
              ],
            }
          : page,
      );
    } catch {
      setError("來源快取下一頁暫時不可用。");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="external-result-history" aria-label="外部修習來源">
      <h3>外部修習來源</h3>
      <p>{cache?.contractStatus === "active" ? "來源成果由同一 Session 更新原事件。" : "來源收據待事件契約核准，不列入完成次數。"}VF：尚未接入。</p>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {!cache && !error && <p>讀取已保存的來源快取…</p>}
      {cache && (
        <>
          <p>
            語境修習室：
            {cache.sources.contextRoom === "not_connected"
              ? "尚未接入"
              : cache.checkpoint?.connection === "temporarily_unavailable"
                ? "暫時不可用"
                : "已配置・需明確同步"}
            ；最後成功查核：{cache.checkpoint?.lastSuccessAt ?? "尚無查核紀錄"}
          </p>
          <div className="external-result-actions">
            <button
              disabled={busy || cache.sources.contextRoom === "not_connected"}
              onClick={() => void action("sync")}
            >
              {cache.checkpoint?.cursor ? "繼續來源同步" : "刷新來源成果"}
            </button>
            <button
              disabled={busy || cache.sources.contextRoom === "not_connected"}
              onClick={() => void action("reconcile")}
            >
              完整來源對帳
            </button>
          </div>
          <p>已載入來源：{cache.receipts.length} 筆；已接收 {cache.receipts.filter(r => r.acceptance === "accepted").length} 筆（此載入範圍，非全站總數）。</p>
          {!cache.receipts.length && (
            <p>尚無來源快取；這不表示沒有完成過修習。</p>
          )}
          {(recent ? cache.receipts.slice(0, 5) : cache.receipts).map((r) => {
            const s = r.source;
            const safeLink =
              s.sourceLocation === `${origin}/practice-results/${s.sourceId}`
                ? s.sourceLocation
                : null;
            return (
              <article className="card" key={r.id}>
                <h4>語境修習室・{modes[s.activityMode] ?? "未支援模式"}</h4>
                <p>
                  {completions[s.completionStatus]} ·{" "}
                  {availability[s.sourceAvailability]} · {({accepted:"已接收",needs_review:"待核對",withdrawn:"已撤回",unverified:"證據不足"})[r.acceptance]}
                </p>
                <p>
                  來源原日期：{s.practicedOn ?? "來源日期未知"}；保存／匯入時間：
                  {s.occurredAt ?? "未知"}
                </p>
                <p>
                  來源時區：{s.timeZone ?? "未知"}
                  。上述時間未獨立證明真正練習時刻，原日期可能是匯入日。
                </p>
                <p>
                  當時脈絡：
                  {s.originalContext
                    ? `${s.originalContext.projectName ?? "名稱未知"}／${s.originalContext.unitName ?? "Unit 未知"}（完成寫入時擷取，非練習當時保證）`
                    : "未知（沒有歷史快照）"}
                </p>
                <p>
                  目前位置：{s.currentContext.projectName ?? "名稱未知"}／
                  {s.currentContext.unitName ?? "Unit 未知"}
                </p>
                <p>
                  目前摘要模式：{modes[s.summary.mode] ?? "未支援模式"} ·
                  首次內容 {s.summary.firstDone ? "已完成" : "不足"} · 回饋{" "}
                  {s.summary.feedbackReceived ? "已取得" : "不足"} ·{" "}
                  {s.summary.mode === "quick_retell"
                    ? "快速重說不強制 Second Take"
                    : `修訂內容 ${s.summary.secondDone ? "已完成" : "不足"}`}
                </p>
                <p>
                  尚未連結學科 · 週盤未連結 · 光步未連結 · 正文{r.projections.record === "applied" ? "已保存" : r.projections.record === "needs_retry" ? "待重試" : "待處理"} · Notion{" "}
                  {r.aliases.length ? "保留既有確認；不新增 ack" : "不適用"}
                </p>
                {r.legacyUnidentified && <p>舊收據缺少穩定來源 ID，需核對後才能計次。</p>}
                {r.legacyReceipts.length > 0 && (
                  <p>
                    已有 {r.legacyReceipts.length}{" "}
                    筆舊來源收據／任務關聯，需核對，未重新完成格子。
                  </p>
                )}
                <details>
                  <summary>來源識別與查核限制</summary>
                  <p>Session：{s.sourceId}</p>
                  <p>來源版本：{s.sourceRevision}（不透明識別）</p>
                  <p>來源更新：{s.updatedAt}</p>
                  <p>{r.reasons.join(" · ")}</p>
                </details>
                {safeLink && (
                  <a href={safeLink} target="_blank" rel="noreferrer">
                    返回來源工作台（需要登入）
                  </a>
                )}
                {r.learningRecordId && /^[a-f0-9-]{36}$/.test(r.learningRecordId) && <Link href={`/practice/records?record=${r.learningRecordId}`}>查看歷程</Link>}
                <button
                  disabled={busy}
                  onClick={() => void action("retry", r.id)}
                >
                  核對已保存來源
                </button>
              </article>
            );
          })}
          {cache.cursor && !recent && (
            <button disabled={busy} onClick={() => void more()}>
              更多來源收據
            </button>
          )}
        </>
      )}
      <style jsx>{`
        .external-result-history {
          min-width: 0;
          padding-bottom: max(1rem, env(safe-area-inset-bottom));
        }
        .external-result-history p,
        .external-result-history h4 {
          overflow-wrap: anywhere;
          word-break: normal;
        }
        .external-result-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
        }
        .external-result-history button {
          min-height: 44px;
          white-space: normal;
          max-width: 100%;
          margin: 0.4rem 0.4rem 0.4rem 0;
        }
        .external-result-history article {
          min-width: 0;
        }
        .external-result-history details {
          margin: 0.75rem 0;
        }
      `}</style>
    </section>
  );
}
