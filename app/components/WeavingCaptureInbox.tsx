"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  CAPTURE_CATEGORIES,
  CAPTURE_CONTENT_TYPES,
  type CaptureContentType,
  type CaptureEntry,
} from "@/lib/dojo/formal";

async function responseJson<T>(response: Response): Promise<T> {
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((json as { error?: string }).error ?? `讀取失敗（${response.status}）`);
  }
  return json as T;
}

function capturedTime(value: string): string {
  try {
    return new Intl.DateTimeFormat("zh-TW", {
      timeZone: "Asia/Taipei",
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return "時間未明";
  }
}

function sourceHost(sourceUrl: string): string {
  try {
    return new URL(sourceUrl).hostname.replace(/^www\./, "");
  } catch {
    return "查看來源";
  }
}

export default function WeavingCaptureInbox() {
  const [captures, setCaptures] = useState<CaptureEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showWoven, setShowWoven] = useState(false);

  const loadCaptures = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/dojo/captures", { cache: "no-store" });
      const result = await responseJson<{ captures: CaptureEntry[] }>(response);
      setCaptures(result.captures ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadCaptures(), 0);
    return () => window.clearTimeout(timer);
  }, [loadCaptures]);

  function replaceCapture(next: CaptureEntry) {
    setCaptures((previous) =>
      previous
        .map((capture) => capture.id === next.id ? next : capture)
        .sort((a, b) => b.capturedAt.localeCompare(a.capturedAt))
    );
  }

  const pending = captures.filter((capture) => capture.status === "pending");
  const woven = captures.filter((capture) => capture.status === "woven");

  return (
    <section className="weaving-inbox" aria-labelledby="weaving-inbox-title">
      <div className="section-heading weaving-inbox-heading">
        <div>
          <span className="eyebrow">捕捉之後</span>
          <h2 id="weaving-inbox-title">待織素材</h2>
          <p className="lead">在這裡判斷它是什麼，再決定如何繼續發展。</p>
        </div>
        <span className="weaving-count" aria-label={`${pending.length} 則待整理`}>{pending.length}</span>
      </div>

      {loading && <div className="empty">正在打開素材匣…</div>}
      {error && (
        <div className="form-error" role="alert">
          {error}
          <button type="button" className="text-link weaving-retry" onClick={() => void loadCaptures()}>重新讀取</button>
        </div>
      )}

      {!loading && !error && pending.length === 0 && (
        <div className="weaving-empty">
          <span aria-hidden="true">✦</span>
          <b>素材匣目前是空的</b>
          <p>新的靈感會先從「新增」收進這裡。</p>
          <Link href="/add">前往捕捉</Link>
        </div>
      )}

      <div className="weaving-capture-list">
        {pending.map((capture) => (
          <CaptureCard
            key={capture.id}
            capture={capture}
            editing={editingId === capture.id}
            onEdit={() => setEditingId(capture.id)}
            onCancel={() => setEditingId(null)}
            onSaved={(next) => {
              replaceCapture(next);
              if (next.status === "woven") setEditingId(null);
            }}
          />
        ))}
      </div>

      {!loading && !error && woven.length > 0 && (
        <details className="woven-history" open={showWoven} onToggle={(event) => setShowWoven(event.currentTarget.open)}>
          <summary>已整理素材 <span>{woven.length}</span></summary>
          <div className="weaving-capture-list">
            {woven.map((capture) => (
              <CaptureCard
                key={capture.id}
                capture={capture}
                editing={editingId === capture.id}
                onEdit={() => setEditingId(capture.id)}
                onCancel={() => setEditingId(null)}
                onSaved={(next) => {
                  replaceCapture(next);
                  setEditingId(null);
                }}
              />
            ))}
          </div>
        </details>
      )}
    </section>
  );
}

function CaptureCard({
  capture,
  editing,
  onEdit,
  onCancel,
  onSaved,
}: {
  capture: CaptureEntry;
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSaved: (capture: CaptureEntry) => void;
}) {
  const [contentType, setContentType] = useState<CaptureContentType | null>(capture.contentType);
  const [weavingNote, setWeavingNote] = useState(capture.weavingNote);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const categoryLabel = capture.category ? CAPTURE_CATEGORIES[capture.category] : "未分類";

  async function save(status: "pending" | "woven") {
    if (status === "woven" && !contentType) {
      setError("完成整理前，請先選擇這份素材的內容類型。");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/dojo/captures", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: capture.id,
          capture: {
            ...capture,
            contentType,
            weavingNote: weavingNote.trim(),
            status,
          },
        }),
      });
      const result = await responseJson<{ capture: CaptureEntry }>(response);
      onSaved(result.capture);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <article className={`weaving-capture-card ${capture.status === "woven" ? "is-woven" : ""}`}>
      <div className="weaving-capture-meta">
        <span>{categoryLabel}</span>
        <time dateTime={capture.capturedAt}>{capturedTime(capture.capturedAt)}</time>
      </div>
      <h3>{capture.title}</h3>
      {capture.excerpt && <p className="weaving-excerpt">{capture.excerpt}</p>}
      {capture.note && (
        <div className="weaving-original-note">
          <b>捕捉時的想法</b>
          <p>{capture.note}</p>
        </div>
      )}
      {capture.sourceUrl && (
        <a className="weaving-source" href={capture.sourceUrl} target="_blank" rel="noreferrer">
          ↗ {sourceHost(capture.sourceUrl)}
        </a>
      )}

      {capture.status === "woven" && capture.contentType && !editing && (
        <div className="woven-result">
          <span>{CAPTURE_CONTENT_TYPES[capture.contentType][0]}</span>
          {capture.weavingNote && <p>{capture.weavingNote}</p>}
        </div>
      )}

      {!editing ? (
        <button type="button" className="weaving-edit-button" onClick={onEdit}>
          {capture.status === "woven" ? "重新整理" : "開始整理"}
        </button>
      ) : (
        <div className="weaving-editor">
          <div className="weaving-editor-heading">
            <div>
              <span className="label">內容類型</span>
              <b>這份素材現在是什麼？</b>
            </div>
            <button type="button" className="text-link" onClick={onCancel} disabled={saving}>收起</button>
          </div>

          <div className="content-type-options" role="radiogroup" aria-label="內容類型">
            {Object.entries(CAPTURE_CONTENT_TYPES).map(([key, value]) => (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={contentType === key}
                className={contentType === key ? "on" : ""}
                onClick={() => setContentType(key as CaptureContentType)}
                disabled={saving}
              >
                <b>{value[0]}</b>
                <small>{value[1]}</small>
              </button>
            ))}
          </div>

          <label htmlFor={`weaving-note-${capture.id}`}>整理筆記</label>
          <textarea
            id={`weaving-note-${capture.id}`}
            className="field"
            rows={4}
            value={weavingNote}
            onChange={(event) => setWeavingNote(event.target.value)}
            placeholder="它可以發展成什麼？和哪些內容有關？"
            maxLength={5000}
            disabled={saving}
          />

          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="weaving-editor-actions">
            {capture.status === "woven" ? (
              <button type="button" onClick={() => void save("pending")} disabled={saving}>放回待整理</button>
            ) : (
              <button type="button" onClick={() => void save("pending")} disabled={saving}>儲存整理進度</button>
            )}
            <button type="button" className="primary" onClick={() => void save("woven")} disabled={saving}>
              {saving ? "儲存中…" : "完成這次整理"}
            </button>
          </div>
        </div>
      )}
    </article>
  );
}
