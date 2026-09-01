"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  canCompleteEnglishJournal,
  canCompleteSegment,
  englishJournalCoachPrompt,
  englishJournalFinalText,
  type EnglishJournalPractice,
  type EnglishJournalSegment,
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

function segmentStateLabel(segment: EnglishJournalSegment): string {
  if (segment.status === "skipped") return "已略過";
  if (canCompleteSegment(segment)) return "已對照";
  if (segment.aiRevision.trim() || segment.promptCopiedAt) return "對照中";
  if (segment.draft.trim()) return "已有初稿";
  return "尚未開始";
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
  const [activeSegment, setActiveSegment] = useState(0);
  const [reviewing, setReviewing] = useState(false);
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
          setActiveSegment(0);
          setReviewing(false);
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
  const currentSegment = draft?.segments[activeSegment] ?? null;
  const handledSegments = draft?.segments.filter((segment) =>
    segment.status === "skipped" || canCompleteSegment(segment)
  ).length ?? 0;

  function selectPractice(practice: EnglishJournalPractice) {
    setSelectedDate(practice.date);
    setDraft(structuredClone(practice));
    setActiveSegment(0);
    setReviewing(false);
    setNotice(null);
    setError(null);
  }

  function updateSegment(changes: Partial<EnglishJournalSegment>) {
    if (!draft || !currentSegment) return;
    setDraft({
      ...draft,
      segments: draft.segments.map((segment, index) =>
        index === activeSegment ? { ...segment, ...changes } : segment
      ),
    });
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
      setActiveSegment(0);
      setReviewing(false);
      setNotice(`已切成 ${result.practice.segments.length} 段，中文原文快照不會被改寫。`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
    }
  }

  async function savePractice(options?: { promptCopied?: boolean; complete?: boolean }, override?: EnglishJournalPractice) {
    const practice = override ?? draft;
    if (!practice) return null;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/dojo/english-journal", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: practice.date,
          practice: { segments: practice.segments },
          promptCopied: options?.promptCopied === true ? practice.segments[activeSegment]?.id : null,
          complete: options?.complete === true,
        }),
      });
      const result = await responseJson<{ practice: EnglishJournalPractice; weeklySynced: boolean }>(response);
      setDraft(structuredClone(result.practice));
      setPractices((current) => current.map((item) => item.date === result.practice.date ? result.practice : item));
      setNotice(options?.complete
        ? result.weeklySynced ? "英文自譯已完成，也已同步本週週盤。" : "英文自譯已完成；本週沒有對應格，因此未變更週盤。"
        : options?.promptCopied ? "這一段的指令已複製；取得 AI 回覆後貼回同一段。" : "這一段的進度已儲存。");
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
    if (!draft || !currentSegment?.draft.trim()) {
      setError("請先寫下這一段的英文初稿。");
      return;
    }
    try {
      await navigator.clipboard.writeText(englishJournalCoachPrompt(currentSegment));
      await savePractice({ promptCopied: true });
    } catch {
      setError("瀏覽器未允許複製；請再按一次或檢查剪貼簿權限。");
    }
  }

  async function copyFinalJournal() {
    if (!draft) return;
    const text = englishJournalFinalText(draft);
    if (!text) {
      setError("目前還沒有可組合的英文定稿。");
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setNotice("完整英文日記已複製。");
    } catch {
      setError("瀏覽器未允許複製；請檢查剪貼簿權限。");
    }
  }

  function toggleSkip() {
    if (!currentSegment) return;
    updateSegment({ status: currentSegment.status === "skipped" ? "untouched" : "skipped" });
  }

  return (
    <section className="english-journal-workbench">
      <div className="english-journal-head">
        <div>
          <span className="eyebrow">英文寫作練習</span>
          <h4>英文自譯工作台</h4>
          <p>一次只處理一段：先自己翻譯，再用 AI 對照與定稿。</p>
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
                <div>
                  <small>{formatDate(draft.date)}</small>
                  <b>{reviewing ? "全文中英回看" : `第 ${activeSegment + 1} 段，共 ${draft.segments.length} 段`}</b>
                </div>
                <button type="button" className="text-link" onClick={() => { setDraft(null); setSelectedDate(null); }}>收起</button>
              </div>

              <div className="english-segment-map" aria-label="段落位置">
                {draft.segments.map((segment, index) => (
                  <button
                    type="button"
                    key={segment.id}
                    className={index === activeSegment && !reviewing ? "on" : ""}
                    data-state={segment.status === "skipped" ? "skipped" : canCompleteSegment(segment) ? "ready" : "open"}
                    aria-label={`前往第 ${index + 1} 段：${segmentStateLabel(segment)}`}
                    onClick={() => { setActiveSegment(index); setReviewing(false); }}
                  >
                    {index + 1}
                  </button>
                ))}
              </div>

              {!reviewing && currentSegment && (
                <>
                  <div className="english-segment-heading">
                    <span>{currentSegment.label}</span>
                    <button type="button" className="text-link" onClick={toggleSkip}>
                      {currentSegment.status === "skipped" ? "恢復這段" : "略過這段"}
                    </button>
                  </div>

                  {currentSegment.status === "skipped" ? (
                    <div className="english-segment-skipped">
                      <b>這一段不列入本篇練習</b>
                      <p>{currentSegment.sourceText}</p>
                    </div>
                  ) : (
                    <>
                      <section className="english-source-card">
                        <small>中文原文</small>
                        <p>{currentSegment.sourceText}</p>
                      </section>

                      <label>我的英文自譯</label>
                      <textarea
                        className="field"
                        rows={7}
                        value={currentSegment.draft}
                        onChange={(event) => updateSegment({ draft: event.target.value })}
                        placeholder="只翻譯目前這一段。先用現在會的英文寫，不用急著查到完美。"
                      />
                      <div className="english-journal-actions">
                        <button type="button" onClick={() => void savePractice()} disabled={saving}>儲存這段</button>
                        <button type="button" className="primary" onClick={() => void copyPrompt()} disabled={saving || !currentSegment.draft.trim()}>複製這段 AI 對照</button>
                      </div>

                      <details className="english-comparison-block" open={Boolean(currentSegment.aiRevision || currentSegment.promptCopiedAt)}>
                        <summary>AI 對照與我的定稿</summary>
                        <label>AI 修正版／說明</label>
                        <textarea
                          className="field"
                          rows={7}
                          value={currentSegment.aiRevision}
                          onChange={(event) => updateSegment({ aiRevision: event.target.value })}
                          placeholder="把這一段的 AI 修正版與重要說明貼回來。"
                        />

                        <label>我最後採用的英文</label>
                        <textarea
                          className="field"
                          rows={6}
                          value={currentSegment.finalVersion}
                          onChange={(event) => updateSegment({ finalVersion: event.target.value })}
                          placeholder="整理成你真正想保留的英文；也可以暫時採用 AI 修正版。"
                        />

                        <label>這段想帶走的表達（選填，最多 1–2 個）</label>
                        <textarea
                          className="field"
                          rows={3}
                          value={currentSegment.phrases}
                          onChange={(event) => updateSegment({ phrases: event.target.value })}
                          placeholder="只留下真的想再用一次的片語或搭配詞。"
                        />
                      </details>
                    </>
                  )}

                  <div className="english-segment-nav">
                    <button type="button" disabled={activeSegment === 0} onClick={() => setActiveSegment((index) => Math.max(0, index - 1))}>上一段</button>
                    <button type="button" disabled={activeSegment >= draft.segments.length - 1} onClick={() => setActiveSegment((index) => Math.min(draft.segments.length - 1, index + 1))}>下一段</button>
                  </div>
                </>
              )}

              {reviewing && (
                <div className="english-full-review">
                  <div className="english-review-summary">
                    <span>已處理 {handledSegments} 段，共 {draft.segments.length} 段</span>
                    <button type="button" onClick={() => void copyFinalJournal()}>複製完整英文</button>
                  </div>
                  {draft.segments.map((segment, index) => (
                    <section key={segment.id} className={segment.status === "skipped" ? "skipped" : ""}>
                      <div><small>第 {index + 1} 段・中文</small><p>{segment.sourceText}</p></div>
                      <div><small>{segment.status === "skipped" ? "本段已略過" : "我的英文"}</small><p>{segment.status === "skipped" ? "—" : segment.finalVersion || segment.aiRevision || segment.draft || "尚未自譯"}</p></div>
                      {segment.phrases.trim() && <aside><small>想帶走的表達</small><p>{segment.phrases}</p></aside>}
                    </section>
                  ))}
                </div>
              )}

              <div className="english-journal-finish">
                <button type="button" onClick={() => setReviewing((value) => !value)}>
                  {reviewing ? "回到逐段練習" : "全文中英回看"}
                </button>
                <button
                  type="button"
                  className="primary"
                  disabled={saving || !canCompleteEnglishJournal(draft)}
                  onClick={() => void savePractice({ complete: true })}
                >
                  完成本篇
                </button>
              </div>
              {!canCompleteEnglishJournal(draft) && <small className="completion-help">每個未略過的段落都要有英文初稿，以及 AI 修正版或自己的定稿。</small>}
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
                    <span><small>{formatDate(practice.date)}</small><b>{englishJournalFinalText(practice).split("\n")[0] || "已完成英文自譯"}</b></span>
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
