"use client";
import Link from "next/link";
import {FormEvent,useState} from "react";
import {CAPTURE_CATEGORIES,type CaptureCategoryKey,type CaptureEntry} from "@/lib/dojo/formal";
async function responseJson<T>(response:Response):Promise<T>{const json=await response.json().catch(()=>({}));if(!response.ok)throw Error(json.error??`儲存失敗（${response.status}）`);return json as T;}
export function CaptureForm() {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<CaptureCategoryKey | "">("");
  const [excerpt, setExcerpt] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<CaptureEntry | null>(null);

  function clearForm() {
    setTitle("");
    setCategory("");
    setExcerpt("");
    setSourceUrl("");
    setNote("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim()) {
      setError("請先寫下這則擷取的標題。");
      return;
    }

    setSaving(true);
    setError(null);
    setSaved(null);
    try {
      const response = await fetch("/api/dojo/captures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          category: category || null,
          excerpt: excerpt.trim(),
          sourceUrl: sourceUrl.trim(),
          note: note.trim(),
          forageReason: note.trim(),
        }),
      });
      const result = await responseJson<{ capture: CaptureEntry }>(response);
      setSaved(result.capture);
      clearForm();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="capture-form-card" onSubmit={submit}>
      <div className="capture-card-heading">
        <div>
          <span className="label">擷取入口</span>
          <h2>先留下來就好</h2>
        </div>
        <span className="capture-private">私人收件匣</span>
      </div>
      <p className="capture-guidance">不用先決定場域、知識關聯或作品方向，這些會在野採慢慢處理。</p>

      {saved && (
        <div className="capture-success" role="status">
          <div>
            <b>已先收進野採</b>
            <span>「{saved.title}」與當下感觸已安全保存，也可以稍後再探索。</span>
          </div>
          <Link href={`/forage/captures?captureId=${encodeURIComponent(saved.id)}`}>繼續探索 →</Link>
        </div>
      )}

      <label htmlFor="capture-title">標題 <span aria-hidden="true">＊</span></label>
      <input
        id="capture-title"
        className="field capture-title-field"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="這一刻想留下什麼？"
        maxLength={300}
        autoFocus
        required
      />

      <label htmlFor="capture-category">小分類</label>
      <select
        id="capture-category"
        className="field"
        value={category}
        onChange={(event) => setCategory(event.target.value as CaptureCategoryKey | "")}
      >
        <option value="">暫不分類</option>
        {Object.entries(CAPTURE_CATEGORIES).map(([key, label]) => (
          <option key={key} value={key}>{label}</option>
        ))}
      </select>
      <small className="field-help">只做輕量標記；知識連結與使用去向會留到野採判斷。</small>

      <label htmlFor="capture-excerpt">內容／節錄</label>
      <textarea
        id="capture-excerpt"
        className="field capture-excerpt"
        rows={7}
        value={excerpt}
        onChange={(event) => setExcerpt(event.target.value)}
        placeholder="貼下原文、片段、靈感或剛剛想到的內容……"
        maxLength={12000}
      />

      <label htmlFor="capture-source">來源網址</label>
      <input
        id="capture-source"
        className="field"
        type="url"
        inputMode="url"
        value={sourceUrl}
        onChange={(event) => setSourceUrl(event.target.value)}
        placeholder="https://…"
        maxLength={2000}
      />

      <label htmlFor="capture-note">為什麼想留下這份素材？</label>
      <textarea
        id="capture-note"
        className="field"
        rows={3}
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder="一句話、多句話都可以，也可以先留白，稍後再補。"
        maxLength={3000}
      />

      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="primary capture-submit" type="submit" disabled={saving}>
        <span aria-hidden="true">✦</span>
        {saving ? "正在收進來…" : "先收下"}
      </button>
      <p className="capture-footnote">儲存後會進入野採採集匣，不會自動公開，也不會直接變成作品。</p>
    </form>
  );
}

