"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ReadingHeaderArt } from "@/app/components/ReadingArt";
import type { ReadingBook } from "@/lib/reading/types";
import {
  noteHref,
  originalHref,
  type ClipBatchDetail,
  type ClipDraft,
  type ClipLayout,
  type ClipListRow,
  type ClipPage,
} from "@/lib/reading/clips";
import { recognizeReadingImage } from "@/lib/reading/browserOcr";

const api = "/api/dojo/reading/clips";
async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: "no-store", ...init });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Error(data.error || "無法讀取，請再試一次。");
  return data;
}
const post = <T,>(data: unknown) =>
  request<T>(api, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
const message = (e: unknown) => (e instanceof Error ? e.message : "請再試一次。");
const selectQuery = (id: string) => {
  const url = new URL(window.location.href);
  if (id) url.searchParams.set("batch", id);
  else url.searchParams.delete("batch");
  window.history.replaceState(null, "", url);
};

export default function ReadingClipInbox() {
  const [rows, setRows] = useState<ClipListRow[]>([]),
    [batch, setBatch] = useState<ClipBatchDetail | null>(null),
    [books, setBooks] = useState<ReadingBook[]>([]);
  const [selected, setSelected] = useState(""),
    [defaultBook, setDefaultBook] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const input = useRef<HTMLInputElement>(null),
    generation = useRef(0);
  const reloadBooks = useCallback(async () => {
    const data = await request<{ books: ReadingBook[] }>("/api/dojo/reading/books");
    setBooks(data.books);
  }, []);
  const reloadRows = useCallback(async () => {
    const source = await request<{ batches: ClipListRow[] }>(api);
    setRows(source.batches);
    return source.batches;
  }, []);
  const showBatch = useCallback(async (id: string) => {
    const token = ++generation.current;
    const { batch: b } = await request<{ batch: ClipBatchDetail }>(api + "?batch=" + encodeURIComponent(id));
    if (token !== generation.current) return;
    setBatch(b);
    setSelected((b.pages.find((p) => !p.saved) || b.pages[0])?.id || "");
    selectQuery(id);
  }, []);
  const load = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const q = new URLSearchParams(window.location.search);
      setDefaultBook(q.get("book") || "");
      const [items] = await Promise.all([reloadRows(), reloadBooks()]);
      const first = q.get("batch") || items.find((r) => r.pending)?.id;
      if (first) await showBatch(first);
    } catch (e) {
      setError(message(e));
    } finally {
      setLoading(false);
    }
  }, [reloadRows, reloadBooks, showBatch]);
  useEffect(() => {
    void load();
  }, [load]);
  async function upload(files: File[]) {
    if (!files.length || busy) return;
    setBusy(true);
    setError("");
    let loaded = 0;
    const id = crypto.randomUUID(),
      errors: string[] = [];
    for (const [i, f] of files.entries()) {
      setNotice("正在收下第 " + (i + 1) + "／" + files.length + " 張書頁…");
      try {
        const form = new FormData();
        form.append("file", f);
        form.append("batchId", id);
        await request(api, { method: "POST", body: form });
        loaded++;
      } catch (e) {
        errors.push(f.name + "：" + message(e));
      }
    }
    try {
      if (loaded) {
        await reloadRows();
        await showBatch(id);
      }
      setNotice(loaded ? "已收下 " + loaded + " 張。請對照原圖，選擇要留下的原文。" : "");
      setError(errors.join("\n"));
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }
  function changed(b: ClipBatchDetail, next: string, info: string) {
    setBatch(b);
    if (next) setSelected(next);
    setNotice(info);
    setError("");
    void reloadRows().catch((e) => setError(message(e)));
  }
  const page = batch?.pages.find((p) => p.id === selected);
  return (
    <section className="screen reading-screen reading-clips-screen">
      <Link href="/reading" className="text-link">
        ‹ 閱讀書架
      </Link>
      <div className="reading-hero">
        <ReadingHeaderArt kind="book" />
        <span className="eyebrow">行光剪藏・修習所心知</span>
        <h1>心知閱讀截圖</h1>
        <p>從 LINE 傳來的書頁會出現在這裡。對照原圖，挑出想留在這一讀的句子。</p>
      </div>
      <section className="ritual-card clip-upload">
        <label htmlFor="reading-files">從相簿加入書頁</label>
        <input
          ref={input}
          id="reading-files"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          disabled={busy}
          onChange={(e) => void upload(Array.from(e.target.files || []))}
        />
      </section>
      {error && (
        <p className="form-error" role="alert">
          {error}{" "}
          <button type="button" onClick={() => void load()}>
            重新讀取
          </button>
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {loading && <p role="status">正在打開書架和剪藏原圖…</p>}
      {!loading && rows.length === 0 && !error && (
        <div className="reading-soft-empty">
          還沒有書頁。傳圖到 LINE「行光剪藏」後選「心知閱讀截圖」，或從上方相簿選圖。
        </div>
      )}
      {rows.length > 0 && (
        <label className="clip-batch-label">
          這次核對哪一組？
          <select
            aria-label="截圖批次"
            className="field"
            value={batch?.id || ""}
            disabled={busy}
            onChange={(e) => {
              setError("");
              setNotice("");
              void showBatch(e.target.value).catch((err) => setError(message(err)));
            }}
          >
            {!batch && <option value="">選擇一批書頁</option>}
            {rows.map((r, i) => (
              <option key={r.id} value={r.id}>
                {r.origin === "line" ? "LINE" : "相簿"} ·{" "}
                {new Date(r.createdAt).toLocaleString("zh-TW", {
                  month: "numeric",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}{" "}
                · 共 {r.total} 張，待核對 {r.pending} 張
                {rows[i + 1]?.createdAt === r.createdAt ? "（另一批）" : ""}
              </option>
            ))}
          </select>
        </label>
      )}
      {batch && page && (
        <>
          <nav aria-label="這組的書頁" className="clip-page-nav">
            {batch.pages.map((p, i) => (
              <button
                type="button"
                key={p.id}
                aria-pressed={selected === p.id}
                onClick={() => {
                  setSelected(p.id);
                  setNotice("");
                }}
              >
                第 {i + 1} 張{p.saved ? " · 已存" : ""}
              </button>
            ))}
          </nav>
          <ClipEditor
            key={page.id}
            page={page}
            batch={batch}
            books={books}
            defaultBook={batch.lastBookId || defaultBook}
            reloadBooks={reloadBooks}
            changed={changed}
          />
        </>
      )}
    </section>
  );
}

function ClipEditor({
  page,
  batch,
  books,
  defaultBook,
  reloadBooks,
  changed,
}: {
  page: ClipPage;
  batch: ClipBatchDetail;
  books: ReadingBook[];
  defaultBook: string;
  reloadBooks: () => Promise<void>;
  changed: (b: ClipBatchDetail, next: string, info: string) => void;
}) {
  const router = useRouter();
  const cacheKey = "xinzhi.formal.clip." + page.id;
  const [draft, setDraft] = useState<ClipDraft>(() => {
    try {
      const cached = JSON.parse(localStorage.getItem(cacheKey) || "null");
      if (cached?.revision === page.revision && !page.saved) return cached.draft;
    } catch {}
    return (
      page.draft || {
        bookId: defaultBook,
        location: "",
        label: "",
        excerpt: "",
        reflection: "",
        layout: "horizontal",
      }
    );
  });
  const [img, setImg] = useState(""),
    [photoTry, setPhotoTry] = useState(0),
    [imgError, setImgError] = useState(false);
  const [ocr, setOcr] = useState(""),
    [status, setStatus] = useState(""),
    [running, setRunning] = useState(false),
    [job, setJob] = useState({ layout: draft.layout, seq: 0 });
  const [error, setError] = useState(""),
    [saving, setSaving] = useState(false),
    [newBook, setNewBook] = useState(""),
    [read, setRead] = useState("1");
  const edited = useRef(Boolean(draft.excerpt) || Boolean(page.draft)),
    current = useRef(draft),
    active = useRef(true),
    bookDetails = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const update = useCallback(
    (patch: Partial<ClipDraft>) => {
      const next = { ...current.current, ...patch };
      current.current = next;
      setDraft(next);
      try {
        localStorage.setItem(cacheKey, JSON.stringify({ revision: page.revision, draft: next }));
      } catch {}
    },
    [cacheKey, page.revision],
  );
  useEffect(() => {
    let url = "";
    const controller = new AbortController();
    setImg("");
    setImgError(false);
    void (async () => {
      const res = await fetch(originalHref(page.id), { cache: "no-store", signal: controller.signal });
      if (!res.ok) throw Error();
      const blob = await res.blob();
      if (controller.signal.aborted) return;
      url = URL.createObjectURL(blob);
      setImg(url);
    })().catch(() => {
      if (!controller.signal.aborted) setImgError(true);
    });
    return () => {
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [page.id, photoTry]);
  useEffect(() => {
    if (!img || page.saved || (!job.seq && edited.current)) return;
    const c = new AbortController();
    setRunning(true);
    setStatus("正在載入文字辨識…");
    void recognizeReadingImage(img, job.layout, c.signal, (v) => {
      if (!c.signal.aborted) setStatus(v);
    })
      .then((data) => {
        if (c.signal.aborted) return;
        setOcr(data.text);
        if (!edited.current) update({ excerpt: data.text });
        setStatus(
          !data.text
            ? "這頁還沒辨識出文字，可切換排版重試或手動輸入。"
            : data.confidence < 70
              ? "已辨識，請特別核對模糊字。"
              : "文字已辨識，請核對想留下的段落。",
        );
      })
      .catch(() => {
        if (!c.signal.aborted) setStatus("未能完成辨識，可重試或對照原圖輸入。");
      })
      .finally(() => {
        if (!c.signal.aborted) setRunning(false);
      });
    return () => c.abort();
  }, [img, job, page.saved, update]);
  const nextPage = batch.pages.find((p) => p.id !== page.id && !p.saved);
  async function save(confirm: boolean, next = false) {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const { batch: b } = await post<{ batch: ClipBatchDetail }>({
        action: confirm ? "confirm" : "draft",
        batchId: batch.id,
        pageId: page.id,
        revision: page.revision,
        draft: current.current,
      });
      try {
        localStorage.removeItem(cacheKey);
      } catch {}
      if (active.current) {
        const receipt = b.pages.find((p) => p.id === page.id)?.saved;
        changed(
          b,
          next ? nextPage?.id || "" : "",
          "已" + (confirm ? "存入這本書的閱讀選段。" : "暫存核對內容。"),
        );
        if (confirm && !next && receipt) router.push(noteHref(receipt));
      }
    } catch (e) {
      if (active.current) setError(message(e));
    } finally {
      if (active.current) setSaving(false);
    }
  }
  async function makeBook() {
    setSaving(true);
    setError("");
    try {
      const res = await post<{ bookId: string }>({ action: "book", title: newBook, readCount: Number(read) });
      await reloadBooks();
      if (active.current) {
        update({ bookId: res.bookId });
        if (bookDetails.current) bookDetails.current.open = false;
      }
    } catch (e) {
      setError(message(e));
    } finally {
      if (active.current) setSaving(false);
    }
  }
  return (
    <div className="clip-review-grid">
      <section className="ritual-card clip-original">
        <h2>原始截圖</h2>
        <small>{page.name}</small>
        {img ? (
          <>
            <img src={img} alt="原始閱讀書頁" />
            <a href={originalHref(page.id)} target="_blank" rel="noreferrer">
              放大原圖 ↗
            </a>
          </>
        ) : imgError ? (
          <button onClick={() => setPhotoTry((x) => x + 1)}>重試載入原圖</button>
        ) : (
          <p>正在打開原圖…</p>
        )}
      </section>
      {page.saved ? (
        <section className="ritual-card clip-form">
          <h2>已存為閱讀選段</h2>
          <p>{page.draft?.label || page.draft?.excerpt.slice(0, 80)}</p>
          <Link className="primary" href={noteHref(page.saved)}>
            打開選段・討論或留卡
          </Link>
        </section>
      ) : (
        <section className="ritual-card clip-form">
          <h2>核對閱讀選段</h2>
          <label>
            書名與讀次
            <select
              className="field"
              value={draft.bookId}
              onChange={(e) => update({ bookId: e.target.value })}
            >
              <option value="">選擇書架上的一讀</option>
              {books.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.title} · 第 {b.readCount} 讀
                </option>
              ))}
            </select>
          </label>
          <details ref={bookDetails}>
            <summary>新增書名或讀次</summary>
            <label>
              書名
              <input
                className="field"
                value={newBook}
                maxLength={180}
                onChange={(e) => setNewBook(e.target.value)}
              />
            </label>
            <label>
              第幾讀
              <input
                className="field"
                type="number"
                min={1}
                max={999}
                value={read}
                onChange={(e) => setRead(e.target.value)}
              />
            </label>
            <button disabled={saving || !newBook.trim()} onClick={() => void makeBook()}>
              保存並選用這一讀
            </button>
          </details>
          <label>
            頁碼或位置（選填）
            <input
              className="field"
              value={draft.location}
              maxLength={180}
              onChange={(e) => update({ location: e.target.value })}
            />
          </label>
          <label>
            作者原文
            <textarea
              className="field"
              rows={7}
              maxLength={40000}
              value={draft.excerpt}
              onChange={(e) => {
                edited.current = true;
                update({ excerpt: e.target.value });
              }}
            />
          </label>
          <small role="status">{status}</small>
          <details>
            <summary>文字辨識選項</summary>
            <label>
              原圖排版
              <select
                className="field"
                value={draft.layout}
                onChange={(e) => update({ layout: e.target.value as ClipLayout })}
              >
                <option value="horizontal">橫排／一般版面</option>
                <option value="vertical">中文直排</option>
              </select>
            </label>
            <button
              disabled={running || !img}
              onClick={() => setJob({ layout: draft.layout, seq: job.seq + 1 })}
            >
              重新辨識
            </button>
            {ocr && ocr !== draft.excerpt && (
              <button
                onClick={() => {
                  edited.current = true;
                  update({ excerpt: ocr });
                }}
              >
                採用本次辨識文字
              </button>
            )}
          </details>
          <label>
            我的心得（選填）
            <textarea
              className="field"
              rows={3}
              value={draft.reflection}
              maxLength={6000}
              onChange={(e) => update({ reflection: e.target.value })}
            />
          </label>
          <details>
            <summary>替選段命名</summary>
            <label>
              選段名稱
              <input
                className="field"
                maxLength={120}
                value={draft.label}
                onChange={(e) => update({ label: e.target.value })}
              />
            </label>
          </details>
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          <div className="clip-form-actions">
            {nextPage && (
              <button className="primary" disabled={saving} onClick={() => void save(true, true)}>
                存入並核對下一張
              </button>
            )}
            <button className={nextPage ? "" : "primary"} disabled={saving} onClick={() => void save(true)}>
              核對並存為閱讀選段
            </button>
            <button disabled={saving} onClick={() => void save(false)}>
              暫存核對內容
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
