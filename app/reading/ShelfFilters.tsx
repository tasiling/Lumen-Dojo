"use client";

import { useEffect, useRef, useState } from "react";
import type { ReadingBook } from "@/lib/reading/types";
import { displayFacet, emptySelection, facetOptions, matchBooks, shelfGroups, toggleFacet, type ShelfGroup, type ShelfSelection, type ShelfView } from "@/lib/reading/shelf";

export const groupLabels: Record<ShelfGroup, string> = {
  category: "電子書分類", subject: "我的學科", progress: "閱讀狀態",
};

export default function ShelfFilters({ books, view, onClose }: {
  books: ReadingBook[]; view: ShelfView; onClose: (selection?: ShelfSelection) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState<ShelfSelection>(() => ({
    category: view.category, subject: view.subject, progress: view.progress,
  }));
  useEffect(() => {
    const node = dialog.current;
    const old = document.body.style.overflow;
    node?.showModal();
    document.body.style.overflow = "hidden";
    return () => { node?.close(); document.body.style.overflow = old; };
  }, []);
  return <dialog className="shelf-filters" aria-labelledby="shelf-filters-title" ref={dialog}
    onCancel={e => { e.preventDefault(); onClose(); }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="shelf-filter-panel">
      <header><h2 id="shelf-filters-title">篩選書籍</h2><button type="button" onClick={() => onClose()}>取消</button></header>
      <div className="shelf-filter-body">
        {shelfGroups.map(group => {
          const options = facetOptions(books, group, draft[group]);
          const buttons = <div className="shelf-options" role="group" aria-label={groupLabels[group]}>
            {options.map(([value, count]) => <button type="button" key={value} aria-pressed={draft[group].includes(value)}
              onClick={() => setDraft(prev => toggleFacet(prev, group, value))}>{displayFacet(value)} <small>{count}</small></button>)}
          </div>;
          return group === "category" ? <section key={group}><h3>{groupLabels[group]}</h3>{buttons}</section>
            : <details key={group} open={view[group].length > 0 || undefined}><summary>{groupLabels[group]}</summary>{buttons}</details>;
        })}
      </div>
      <footer><button type="button" onClick={() => setDraft(emptySelection)}>清除條件</button>
        <button type="button" className="shelf-apply" onClick={() => onClose(draft)}>
          顯示 {matchBooks(books, { ...view, ...draft }).length} 本書
        </button></footer>
    </div>
  </dialog>;
}
