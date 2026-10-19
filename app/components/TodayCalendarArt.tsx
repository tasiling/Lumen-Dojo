"use client";

import { useId } from "react";

export function TodayCalendarIcon({ name, className = "" }: { name: string; className?: string }) {
  return <svg className={`tc-icon ${className}`} viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><use href={`/today-calendar/icons.svg#${name}`} /></svg>;
}

export function TodayGlassMotif() {
  const id = useId();
  return (
    <svg className="tc-glass-motif" viewBox="0 0 240 240" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`${id}-glass`} x1=".1" y1="0" x2=".85" y2="1"><stop stopColor="#fff" stopOpacity=".46" /><stop offset=".5" stopColor="#f1f2ff" stopOpacity=".1" /><stop offset="1" stopColor="#a3b7de" stopOpacity=".27" /></linearGradient>
        <linearGradient id={`${id}-pearl`} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#fff" stopOpacity=".58" /><stop offset=".65" stopColor="#f5cfdf" stopOpacity=".2" /><stop offset="1" stopColor="#a8bfdf" stopOpacity=".27" /></linearGradient>
        <linearGradient id={`${id}-fade`}><stop stopColor="white" stopOpacity="0" /><stop offset=".18" stopColor="white" stopOpacity=".65" /><stop offset=".48" stopColor="white" /></linearGradient>
        <mask id={`${id}-quiet`}><rect width="270" height="270" fill={`url(#${id}-fade)`} /></mask>
      </defs>
      <g mask={`url(#${id}-quiet)`} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="174" cy="105" r="78" fill={`url(#${id}-glass)`} stroke="white" strokeOpacity=".58" strokeWidth=".8" />
        <path d="M149 44A66 66 0 0 0 112 82" fill="none" stroke="white" strokeOpacity=".64" strokeWidth="1" />
        <path d="M219 168A77 77 0 0 1 198 178" fill="none" stroke="#7b90b8" strokeOpacity=".18" strokeWidth="1" />
        <circle cx="122" cy="175" r="35" fill={`url(#${id}-pearl)`} stroke="white" strokeOpacity=".7" strokeWidth=".8" />
        <path d="M116 145A31 31 0 0 0 100 153" fill="none" stroke="white" strokeOpacity=".65" strokeWidth="1" />
        <circle cx="224" cy="35" r="10" fill="white" fillOpacity=".2" stroke="white" strokeOpacity=".55" strokeWidth=".8" />
      </g>
    </svg>
  );
}
