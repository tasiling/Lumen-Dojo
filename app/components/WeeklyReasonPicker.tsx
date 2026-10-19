"use client";

import type { DailyTaskCategory } from "@/lib/dojo/formal";

const reasons: { value: DailyTaskCategory; label: string }[] = [
  { value: "important", label: "重要" },
  { value: "hobby", label: "喜歡" },
  { value: "health", label: "照顧自己" },
];

export default function WeeklyReasonPicker({ value, onChange, disabled = false }: {
  value: DailyTaskCategory | null;
  onChange: (value: DailyTaskCategory | null) => void;
  disabled?: boolean;
}) {
  return <fieldset className="weekly-reason-picker" disabled={disabled}>
    <legend>這週為什麼做？</legend>
    <div className="weekly-reason-options">
      {reasons.map((reason) => <button
        type="button"
        key={reason.value}
        className={`task-category-button ${reason.value} ${value === reason.value ? "on" : ""}`}
        aria-pressed={value === reason.value}
        onClick={() => onChange(value === reason.value ? null : reason.value)}
      >{reason.label}</button>)}
    </div>
  </fieldset>;
}
