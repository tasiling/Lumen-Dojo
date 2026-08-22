"use client";

import { useState } from "react";
import { useDojo } from "@/lib/dojo/store";
import type { DojoEntry } from "@/lib/dojo/constants";
import {
  formatFreqIntensityLabel,
  resolveHawkinsLevel,
  HAWKINS_MIN,
  HAWKINS_MAX,
  INTENSITY_MIN,
  INTENSITY_MAX,
} from "@/lib/dojo/hawkins";

const DEFAULT_FREQ = 500;
const DEFAULT_INTENSITY = 5;

export default function EntryMeasurePanel({ entry }: { entry: DojoEntry }) {
  const { setEntryMeasure } = useDojo();
  const [editing, setEditing] = useState(false);
  const [pendingFreq, setPendingFreq] = useState(entry.freq ?? DEFAULT_FREQ);
  const [hasFreq, setHasFreq] = useState(entry.freq != null);
  const [pendingIntensity, setPendingIntensity] = useState(entry.intensity ?? DEFAULT_INTENSITY);
  const [hasIntensity, setHasIntensity] = useState(entry.intensity != null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const level = entry.freq != null ? resolveHawkinsLevel(entry.freq) : null;
  const combinedLabel = formatFreqIntensityLabel(entry.freq, entry.intensity);
  const hasAny = entry.freq != null || entry.intensity != null;

  function openEdit() {
    setPendingFreq(entry.freq ?? DEFAULT_FREQ);
    setHasFreq(entry.freq != null);
    setPendingIntensity(entry.intensity ?? DEFAULT_INTENSITY);
    setHasIntensity(entry.intensity != null);
    setError(null);
    setEditing(true);
  }

  async function confirm() {
    setSaving(true);
    setError(null);
    try {
      await setEntryMeasure(entry.id, {
        freq: hasFreq ? pendingFreq : null,
        intensity: hasIntensity ? pendingIntensity : null,
      });
      setEditing(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <div className="measure-summary">
        {hasAny && (
          <span
            className="tag"
            style={{ borderColor: level?.color ?? "var(--gold)", color: level?.color ?? "var(--gold)" }}
          >
            {combinedLabel}
          </span>
        )}
        <button type="button" onClick={openEdit}>{hasAny ? "編輯測頻" : "標記這個片刻"}</button>
      </div>
    );
  }

  return (
    <div className="measure-editor">
      <div className="measure-heading">
        <b>頻率</b>
        <button type="button" onClick={() => setHasFreq((current) => !current)}>
          {hasFreq ? "清除" : "加入"}
        </button>
      </div>
      {hasFreq && (
        <div className="measure-control">
          <input
            aria-label="頻率"
            type="range"
            min={HAWKINS_MIN}
            max={HAWKINS_MAX}
            step={5}
            value={pendingFreq}
            onChange={(event) => setPendingFreq(Number(event.target.value))}
          />
          <input
            aria-label="頻率數值"
            className="field"
            type="number"
            min={HAWKINS_MIN}
            max={HAWKINS_MAX}
            value={pendingFreq}
            onChange={(event) => {
              const value = Number(event.target.value);
              if (Number.isFinite(value)) setPendingFreq(Math.min(HAWKINS_MAX, Math.max(HAWKINS_MIN, value)));
            }}
          />
          <small>{formatFreqIntensityLabel(pendingFreq, null)}</small>
        </div>
      )}

      <div className="measure-heading">
        <b>投入強度</b>
        <button type="button" onClick={() => setHasIntensity((current) => !current)}>
          {hasIntensity ? "清除" : "加入"}
        </button>
      </div>
      {hasIntensity && (
        <div className="measure-control">
          <input
            aria-label="投入強度"
            type="range"
            min={INTENSITY_MIN}
            max={INTENSITY_MAX}
            step={1}
            value={pendingIntensity}
            onChange={(event) => setPendingIntensity(Number(event.target.value))}
          />
          <input
            aria-label="投入強度數值"
            className="field"
            type="number"
            min={INTENSITY_MIN}
            max={INTENSITY_MAX}
            value={pendingIntensity}
            onChange={(event) => {
              const value = Number(event.target.value);
              if (Number.isFinite(value)) {
                setPendingIntensity(Math.min(INTENSITY_MAX, Math.max(INTENSITY_MIN, value)));
              }
            }}
          />
        </div>
      )}

      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="two">
        <button type="button" disabled={saving} onClick={() => setEditing(false)}>取消</button>
        <button type="button" className="primary" disabled={saving} onClick={() => void confirm()}>
          {saving ? "儲存中…" : "確定"}
        </button>
      </div>
    </div>
  );
}
