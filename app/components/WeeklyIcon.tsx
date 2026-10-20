import type { ReactNode } from "react";

const shapes: Record<string, ReactNode> = {
  compass: <><circle cx="12" cy="12" r="10"/><path d="m16.24 7.76-1.804 5.411a2 2 0 0 1-1.265 1.265L7.76 16.24l1.804-5.411a2 2 0 0 1 1.265-1.265z"/></>,
  grid: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
  layers: <><path d="m12 3 10 5-10 5L2 8l10-5Z"/><path d="m2 12 10 5 10-5M2 16l10 5 10-5"/></>,
  write: <><path d="M13.4 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7.4M2 6h4M2 10h4M2 14h4M2 18h4"/><path d="m21.4 5.6-6.2 6.2-3.6 1 1-3.6 6.2-6.2a1.8 1.8 0 0 1 2.6 2.6Z"/></>,
  history: <><path d="M3 12a9 9 0 1 0 9-9 9.7 9.7 0 0 0-6.7 2.7L3 8M3 3v5h5M12 8v4l3 2"/></>,
  settings: <path d="M21 4H14M10 4H3M21 12H12M8 12H3M21 20H16M12 20H3M14 2v4M8 10v4M16 18v4"/>,
  back: <path d="m15 18-6-6 6-6"/>,
  arrow: <path d="m9 18 6-6-6-6"/>,
  plus: <path d="M5 12h14M12 5v14"/>,
  add: <><rect x="2" y="2" width="20" height="20" rx="6"/><path d="M6 12h12M12 6v12"/></>,
  check: <path d="m4 12 5 5L20 6"/>,
  heart: <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>,
  leaf: <><path d="M11 20a10 10 0 0 0 10-10 26 26 0 0 0-1-7.3C16 6 13 5.5 9.8 6.1A7 7 0 0 0 11 20Z"/><path d="M2 21c2-5 6-4 9-8"/></>,
  target: <><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/></>,
  spark: <path d="M12 2.5 14 10l7.5 2-7.5 2-2 7.5-2-7.5-7.5-2 7.5-2L12 2.5ZM20 2v4M18 4h4"/>,
  clock: <><circle cx="12" cy="14" r="8"/><path d="M10 2h4M12 10v4l3-3"/></>,
  palette: <><circle cx="8" cy="8" r=".7"/><circle cx="13" cy="6" r=".7"/><circle cx="17" cy="10" r=".7"/><path d="M21 12a9 9 0 1 0-9 9h1a2 2 0 0 0 1.4-3.4 1.9 1.9 0 0 1 1.4-3.3H18a3 3 0 0 0 3-2.3Z"/></>,
  book: <><path d="M12 5v16M12 5a5 5 0 0 0-4-2H3v16h5a5 5 0 0 1 4 2 5 5 0 0 1 4-2h5V3h-5a5 5 0 0 0-4 2Z"/><path d="M6 8h2M6 12h2M16 8h2M16 12h2"/></>,
  shuffle: <><path d="m18 3 3 3-3 3M18 15l3 3-3 3M3 6h3c5 0 7 12 12 12h3M3 18h3c1.5 0 3-1.5 4.5-4M14 9c1.5-2 2.5-3 4-3h3"/></>,
};

export default function WeeklyIcon({name, className = ""}: {name: keyof typeof shapes; className?: string}) {
  return <svg className={`weekly-icon ${className}`} viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{shapes[name]}</svg>;
}

export function WeeklyMotif(){return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 250" className="weekly-motif" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round"><rect x="25" y="21" width="57" height="57" rx="12"/><rect x="96" y="21" width="57" height="57" rx="12"/><rect x="167" y="21" width="57" height="57" rx="12"/><rect x="25" y="92" width="57" height="57" rx="12"/><rect x="96" y="92" width="57" height="57" rx="12"/><rect x="167" y="92" width="57" height="57" rx="12"/><rect x="25" y="163" width="57" height="57" rx="12"/><rect x="96" y="163" width="57" height="57" rx="12"/><rect x="167" y="163" width="57" height="57" rx="12"/><path d="M53.5 191.5L195.5 49.5"/><circle cx="53.5" cy="191.5" r="7" fill="currentColor" stroke="none"/><circle cx="124.5" cy="120.5" r="7" fill="currentColor" stroke="none"/><circle cx="195.5" cy="49.5" r="7" fill="currentColor" stroke="none"/></svg>;}
