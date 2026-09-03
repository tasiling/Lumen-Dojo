"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ContextPracticeSeed } from "@/lib/dojo/contextPractice";

type SeedWithPrompt = ContextPracticeSeed & { practicePrompt: string };

async function responseJson<T>(response: Response): Promise<T> {
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((json as { error?: string }).error ?? `操作失敗（${response.status}）`);
  return json as T;
}

export default function EnglishContextSeedInbox() {
  const [seeds, setSeeds] = useState<SeedWithPrompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/dojo/english-journal/context-seeds", { cache: "no-store" });
      const result = await responseJson<{ seeds: SeedWithPrompt[] }>(response);
      setSeeds(result.seeds ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    const refresh = () => void load();
    window.addEventListener("lumen-context-seeds-updated", refresh);
    return () => { window.clearTimeout(timer); window.removeEventListener("lumen-context-seeds-updated", refresh); };
  }, [load]);
  const queued = useMemo(() => seeds.filter((seed) => seed.status === "queued"), [seeds]);

  async function copyPrompt(seed: SeedWithPrompt) {
    setError(null);
    try {
      await navigator.clipboard.writeText(seed.practicePrompt);
      setNotice("語境練習指令已複製，可以貼到 GPT 開始三回合練習。");
    } catch {
      setError("瀏覽器未允許複製；請再按一次或檢查剪貼簿權限。");
    }
  }

  async function markUsed(seed: SeedWithPrompt) {
    setBusyKey(seed.id);
    setError(null);
    try {
      const response = await fetch("/api/dojo/english-journal/context-seeds", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: seed.id }),
      });
      const result = await responseJson<{ seed: SeedWithPrompt }>(response);
      setSeeds((current) => current.map((item) => item.id === result.seed.id ? result.seed : item));
      setNotice("已記錄這項句型／語法曾經放進語境練習。");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusyKey(null);
    }
  }

  if (loading) return null;
  return <section className="english-context-inbox">
    <div className="subsection-title"><div><small>英文・主動使用</small><h4>語境修習候選匣</h4></div><span>{queued.length} 項待練</span></div>
    <p>句型與語法先放在這裡；需要練習時複製指令，到 GPT 完成三回合語境對話。</p>
    {error && <p className="form-error" role="alert">{error}</p>}
    {notice && <p className="save-notice">{notice}</p>}
    {queued.length === 0 ? <p className="muted-note">目前沒有待練句型或語法。完成日記 AI 對照後，可以從自譯工作台送進來。</p> : <div className="english-context-seed-list">{queued.slice(0, 6).map((seed) => <article key={seed.id}><div><small>{seed.kind === "grammar" ? "語法" : "句型"}・{seed.sourceDate}</small><b>{seed.focus}</b><p>{seed.note || "日常生活、學校或工作情境"}</p></div><div><button type="button" onClick={() => void copyPrompt(seed)}>複製練習指令</button><button type="button" className="primary" disabled={busyKey === seed.id} onClick={() => void markUsed(seed)}>{busyKey === seed.id ? "記錄中…" : "已完成練習"}</button></div></article>)}</div>}
  </section>;
}
