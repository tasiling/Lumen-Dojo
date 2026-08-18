"use client";

// 正式版持久化紀錄卡，供道藏與各場域頁共用。
//
// 測頻標籤(三方協作規格書 v1.3 §2.3;修正委派書 v1.0 四新增強度):居所不得
// 以任何形式顯示測頻(含強度),這裡用 showFreq props 一併控制頻率與強度——
// 呼叫端可用 showFreq=false 隱藏測頻，其餘頁面維持預設 true。
// 單筆的數值＋標籤是紀錄本身,不是評分,兩個欄位都沒有值時就不顯示,不畫任何
// 空的佔位條。
import { useDojo } from "@/lib/dojo/store";
import { SPACES, GUANGXING, GUANGFA, type DojoEntry } from "@/lib/dojo/constants";
import { resolveHawkinsLevel, formatFreqIntensityLabel } from "@/lib/dojo/hawkins";
import { useState } from "react";

export default function EntryCard({ entry, showFreq = true }: { entry: DojoEntry; showFreq?: boolean }) {
  const { removeEntry, openQuickAdd } = useDojo();
  const colorKey = SPACES[entry.space]?.[1] ?? "dw";
  const guangxingLabel = entry.guangxing ? GUANGXING[entry.guangxing][0] : null;
  const guangfaLabel = entry.guangfa ? GUANGFA[entry.guangfa][0] : null;
  const freqLevel = showFreq && entry.freq != null ? resolveHawkinsLevel(entry.freq) : null;
  const measureLabel = showFreq ? formatFreqIntensityLabel(entry.freq, entry.intensity) : "";
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    if (!window.confirm(`要刪除「${entry.title}」嗎？資料會送進 Notion 垃圾桶。`)) return;
    setError(null);
    try {
      await removeEntry(entry.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  return (
    <div className={`item ${colorKey}`}>
      <span className="status">
        <span className="dot" />
        {entry.kind}
      </span>
      {guangxingLabel && (
        <span className="tag" style={{ borderColor: "var(--gold)", color: "var(--gold)" }}>
          {guangxingLabel}
        </span>
      )}
      {guangfaLabel && (
        <span className="tag" style={{ borderColor: "var(--gold)", color: "var(--gold)" }}>
          {guangfaLabel}
        </span>
      )}
      {measureLabel && (
        <span
          className="tag"
          style={{ borderColor: freqLevel?.color ?? "var(--gold)", color: freqLevel?.color ?? "var(--gold)" }}
        >
          {measureLabel}
        </span>
      )}
      <b>{entry.title}</b>
      <small>
        {entry.note || "尚未留下說明"} · {entry.privacy} · {entry.date}
      </small>
      <div className="actions">
        <button onClick={() => openQuickAdd({ editId: entry.id })}>編輯</button>
        <button className="danger" onClick={() => void handleDelete()}>
          刪除
        </button>
      </div>
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}
