"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  canCompleteEnglishJournal,
  englishJournalCoachPrompt,
  type EnglishJournalPractice,
} from "@/lib/dojo/englishJournal";

type JournalSource = { date: string; title: string; sourceText: string };

const STATUS_LABELS = {
  queued: "待自譯",
  drafting: "寫作中",
  comparing: "待完成對照",
  completed: "已完成",
} as const;

async function responseJson<T>(response: Response): Promise<T> {
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((json as { error?: string }).error ?? `操作失敗（${response.status}）`);
  return json as T;
}

function formatDate(date: string): string {
  return new Intl.DateTimeFormat("zh-TW", { month: "long", day: "numeric", weekday: "short" })
    .format(new Date(`${date}T12:00:00+08:00`));
}

export default function EnglishJournalWorkbench({
  initialDate,
  onCompleted,
}: {
  initialDate?: string | null;
  onCompleted?: () => void | Promise<void>;
}) {
  const [practices, setPractices] = useState<EnglishJournalPractice[]>([]);
  const [sources, setSources] = useState<JournalSource[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(initialDate ?? null);
  const [draft, setDraft] = useState<EnglishJournalPractice | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/dojo/english-journal", { cache: "no-store" });
      const result = await responseJson<{ practices: EnglishJournalPractice[]; sources: JournalSource[] }>(response);
      setPractices(result.practices ?? []);
      setSources(result.sources ?? []);
      const preferredDate = initialDate ?? selectedDate ?? result.practices[0]?.date ?? null;
      if (preferredDate) {
        const existing = result.practices.find((practice) => practice.date === preferredDate) ?? null;
        setSelectedDate(existing?.date ?? null);
        setDraft(existing ? structuredClone(existing) : null);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoading(false);
    }
  }, [initialDate, selectedDate]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  // Only load once on entry; later updates refresh state explicitly.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!initialDate || loading) return;
    const existing = practices.find((practice) => practice.date === initialDate);
    if (existing) {
      if (selectedDate !== initialDate) {
        const timer = window.setTimeout(() => {
          setSelectedDate(initialDate);
          setDraft(structuredClone(existing));
        }, 0);
        return () => window.clearTimeout(timer);
      }
      return;
    }
    const source = sources.find((item) => item.date === initialDate);
    if (!source) return;
    const timer = window.setTimeout(() => void queueSource(source), 0);
    return () => window.clearTimeout(timer);
  }, [initialDate, loading, practices, selectedDate, sources]);

  const pending = useMemo(() => practices.filter((practice) => practice.status !== "completed"), [practices]);
  const completed = useMemo(() => practices.filter((practice) => practice.status === "completed"), [practices]);

  function selectPractice(practice: EnglishJournalPractice) {
    setSelectedDate(practice.date);
    setDraft(structuredClone(practice));
    setNotice(null);
    setError(null);
  }

  async function queueSource(source: JournalSource) {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/dojo/english-journal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: source.date, sourceText: source.sourceText }),
      });
      const result = await responseJson<{ practice: EnglishJournalPractice }>(response);
      setPractices((current) => [result.practice, ...current.filter((item) => item.date !== result.practice.date)]
        .sort((a, b) => b.date.localeCompare(a.date)));
      setSources((current) => current.filter((item) => item.date !== result.practice.date));
      setSelectedDate(result.practice.date);
      setDraft(structuredClone(result.practice));
      setNotice("已加入待自譯，中文原文會保持不變。");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
    }
  }

  async function savePractice(options?: { promptCopied?: boolean; complete?: boolean }) {
    if (!draft) return null;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/dojo/english-journal", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: draft.date,
          practice: {
            draft: draft.draft,
            aiRevision: draft.aiRevision,
            finalVersion: draft.finalVersion,
            phrases: draft.phrases,
          },
          promptCopied: options?.promptCopied === true,
          complete: options?.complete === true,
        }),
      });
      const result = await responseJson<{ practice: EnglishJournalPractice; weeklySynced: boolean }>(response);
      setDraft(structuredClone(result.practice));
      setPractices((current) => current.map((item) => item.date === result.practice.date ? result.practice : item));
      setNotice(options?.complete
        ? result.weeklySynced ? "英文自譯已完成，也已同步本週週盤。" : "英文自譯已完成；本週沒有對應格，因此未變更週盤。"
        : options?.promptCopied ? "指令已複製，進行 AI 對照後再把結果貼回來。" : "進度已儲存。");
      if (options?.complete) await onCompleted?.();
      return result.practice;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function copyPrompt() {
    if (!draft?.draft.trim()) {
      setError("請先寫下自己的英文初稿。");
      return;
    }
    try {
      await navigator.clipboard.writeText(englishJournalCoachPrompt(draft));
      await savePractice({ promptCopied: true });
    } catch {
      setError("瀏覽器未允許複製；請再按一次或檢查剪貼簿權限。");
    }
  }

  return (
    <section className="english-journal-workbench">
      <div className="english-journal-head">
        <div>
          <span className="eyebrow">英文寫作練習</span>
          <h4>英文自譯工作台</h4>
          <p>先自己翻譯，再用 AI 對照；只有看完修正才算完成。</p>
        </div>
        <span>{pending.length} 篇待處理</span>
      </div>

      {loading && <div className="empty">正在整理英文日記…</div>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {notice && <p className="save-notice">{notice}</p>}

      {!loading && (
        <>
          <div className="english-journal-queue">
            {pending.map((practice) => (
              <button
                type="button"
                key={practice.date}
                className={selectedDate === practice.date ? "on" : ""}
                onClick={() => selectPractice(practice)}
              >
                <small>{formatDate(practice.date)}</small>
                <b>{STATUS_LABELS[practice.status]}</b>
              </button>
            ))}
            {pending.length === 0 && <p className="muted-note">目前沒有待處理的日記。</p>}
          </div>

          {draft && (
            <article className="english-journal-editor">
              <div className="english-journal-editor-title">
                <div><small>{formatDate(draft.date)}</small><b>{STATUS_LABELS[draft.status]}</b></div>
                <button type="button" className="text-link" onClick={() => { setDraft(null); setSelectedDate(null); }}>收起</button>
              </div>

              <details open className="english-source-block">
                <summary>中文原文快照</summary>
                <p>{draft.sourceText}</p>
              </details>

              <label>我的英文初稿</label>
              <textarea
                className="field"
                rows={8}
                value={draft.draft}
                onChange={(event) => setDraft({ ...draft, draft: event.target.value })}
                placeholder="先用現在會的英文寫，不需要每一句都查到完美。"
              />
              <div className="english-journal-actions">
                <button type="button" onClick={() => void savePractice()} disabled={saving}>儲存進度</button>
                <button type="button" className="primary" onClick={() => void copyPrompt()} disabled={saving || !draft.draft.trim()}>複製 AI 對照指令</button>
              </div>

              <label>AI 修正版／對照結果</label>
              <textarea
                className="field"
                rows={8}
                value={draft.aiRevision}
                onChange={(event) => setDraft({ ...draft, aiRevision: event.target.value })}
                placeholder="把 AI 提供的修正版與重要說明貼回來。"
              />

              <label>我最後採用的英文版</label>
              <textarea
                className="field"
                rows={7}
                value={draft.finalVersion}
                onChange={(event) => setDraft({ ...draft, finalVersion: event.target.value })}
                placeholder="用看完對照後真正想保留的英文重寫一次。"
              />

              <label>慣用語候選</label>
              <textarea
                className="field"
                rows={5}
                value={draft.phrases}
                onChange={(event) => setDraft({ ...draft, phrases: event.target.value })}
                placeholder="先留下真正想學的片語；之後再由你挑選送往 VocabForge。"
              />

              <button
                type="button"
                className="primary english-journal-complete"
                disabled={saving || !canCompleteEnglishJournal(draft)}
                onClick={() => void savePractice({ complete: true })}
              >
                完成自譯與對照
              </button>
              {!canCompleteEnglishJournal(draft) && <small className="completion-help">需要英文初稿，以及 AI 修正版或最終英文版。</small>}
            </article>
          )}

          <details className="english-journal-sources">
            <summary>從最近日記選擇</summary>
            <div>
              {sources.slice(0, 8).map((source) => (
                <button type="button" key={source.date} onClick={() => void queueSource(source)} disabled={saving}>
                  <span><small>{formatDate(source.date)}</small><b>{source.title}</b></span>
                  <em>加入自譯</em>
                </button>
              ))}
              {sources.length === 0 && <p className="muted-note">最近沒有尚未加入的日復盤。</p>}
            </div>
          </details>

          {completed.length > 0 && (
            <details className="english-journal-sources completed">
              <summary>已完成的英文日記（{completed.length}）</summary>
              <div>
                {completed.map((practice) => (
                  <button type="button" key={practice.date} onClick={() => selectPractice(practice)}>
                    <span><small>{formatDate(practice.date)}</small><b>{practice.finalVersion.split("\n")[0] || "已完成英文自譯"}</b></span>
                    <em>查看</em>
                  </button>
                ))}
              </div>
            </details>
          )}
        </>
      )}
    </section>
  );
}
