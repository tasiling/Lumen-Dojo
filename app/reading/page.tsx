"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import BookFormSheet, { type FormMode } from "@/app/components/BookFormSheet";
import ForageIcon from "@/app/components/ForageIcon";
import type { ReadingBook } from "@/lib/reading/types";
import {
  defaultShelf, displayFacet, emptySelection, matchBooks, readShelfView, shelfContext,
  shelfGroups, toggleFacet, writeShelfView, type ShelfSelection, type ShelfView,
} from "@/lib/reading/shelf";
import ShelfFilters, { groupLabels } from "./ShelfFilters";
import { openedAt } from "./readerShelf";
import ShelfGrid from "./ShelfGrid";
import "./shelf.css";

export default function ReadingShelfPage() {
  const router = useRouter();
  const [books, setBooks] = useState<ReadingBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState<FormMode | null>(null);
  const [view, setView] = useState(defaultShelf);
  const [parent, setParent] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const nextView = useRef<ShelfView | null>(null);
  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams(window.location.search);
      const focused = params.get("focus") === "anxiety-effort";
      const response = await fetch("/api/dojo/reading/books" + (focused ? "?focus=anxiety-effort" : ""), { cache: "no-store", signal });
      if (!response.ok) throw new Error("書架讀取失敗（" + response.status + "）");
      const json: { books: ReadingBook[]; selection?: { bookId: string; noteId: string } } = await response.json();
      if (signal?.aborted) return;
      setBooks(json.books);
      if (focused && json.selection) {
        const query = shelfContext(params);
        query.set("note", json.selection.noteId);
        router.replace("/reading/books/" + encodeURIComponent(json.selection.bookId) + "?" + query);
      } else if (focused) setNotice("可在書架選擇這次想討論的閱讀紀錄。");
    } catch (e) {
      if (!signal?.aborted) setError(e instanceof Error ? e.message : String(e));
    } finally { if (!signal?.aborted) setLoading(false); }
  }, [router]);

  const change = useCallback((next: ShelfView) => {
    const url = new URL(window.location.href);
    url.searchParams.delete("panel");
    writeShelfView(next, url.searchParams);
    window.history.replaceState(null, "", url);
    setView(next);
  }, []);

  useEffect(() => {
    function readLocation() {
      const params = new URLSearchParams(window.location.search);
      const pending = nextView.current;
      nextView.current = null;
      if (pending) change(pending); else setView(readShelfView(params));
      setParent(shelfContext(params).get("returnTo") || "");
      setFiltersOpen(params.get("panel") === "filters");
    }
    const signal = new AbortController();
    const timer = window.setTimeout(() => { readLocation(); void load(signal.signal); }, 0);
    window.addEventListener("popstate", readLocation);
    return () => { window.clearTimeout(timer); signal.abort(); window.removeEventListener("popstate", readLocation); };
  }, [change, load]);

  function openFilters() {
    const url = new URL(window.location.href);
    url.searchParams.set("panel", "filters");
    history.pushState({ shelfFilterLayer: true }, "", url);
    setFiltersOpen(true);
  }
  function closeFilters(selection?: ShelfSelection) {
    const next = selection ? { ...view, ...selection } : view;
    if (history.state?.shelfFilterLayer) {
      nextView.current = next;
      history.back();
    } else {
      change(next);
      setFiltersOpen(false);
    }
  }

  const found = useMemo(() => {
    const result = matchBooks(books, { ...view, sort: "added" });
    const times = openedAt();
    return result.sort((a,b) => (times[b.id] || 0) - (times[a.id] || 0));
  }, [books, view]);
  const context = writeShelfView(view);
  if (parent) context.set("returnTo", parent);
  const count = shelfGroups.reduce((sum, group) => sum + view[group].length, 0);
  const openForm = (mode: FormMode) => {
    document.querySelector<HTMLDetailsElement>("details[name=shelf-actions][open]")?.removeAttribute("open");
    setForm(mode);
  };

  return <section className="screen reading-screen reading-shelf">
    <header className="shelf-head">
      <div><p className="shelf-crumb">修習所・心知</p><h1>閱讀書架</h1></div>

    </header>
    <div className="shelf-find" role="search">
      <label className="shelf-search"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/></svg>
        <input type="search" enterKeyHint="search" value={view.q} placeholder="搜尋書名、作者或副標題" aria-label="搜尋書名、作者或副標題"
          onChange={e => change({ ...view, q: e.target.value })} />
      </label>
    </div>
    <nav className="shelf-tabs" aria-label="書籍分類">
      <div>{["", "新時代 New age", "職場工作", "成功法"].map(category =>
        <button key={category} type="button" aria-pressed={category ? view.category.includes(category) : count === 0}
          onClick={() => change(category ? { ...view, category: [category] } : { ...view, ...emptySelection })}>
          {category ? displayFacet(category) : "全部"}
        </button>)}</div>
      <button onClick={openFilters} aria-haspopup="dialog" aria-expanded={filtersOpen}>更多分類</button>
    </nav>
    {count > 0 && <div className="shelf-applied" aria-label="已套用的篩選">{shelfGroups.flatMap(group => view[group].map(value =>
      <button key={group + value} aria-label={"移除" + groupLabels[group] + "「" + displayFacet(value) + "」"}
        onClick={() => change({ ...view, ...toggleFacet(view, group, value) })}>{displayFacet(value)} ×</button>))}</div>}
    {notice && <p role="status">{notice}</p>}
    {loading ? <p className="shelf-empty" role="status">正在打開書架…</p> : error ? <p className="form-error" role="alert">{error} <button onClick={() => void load()}>重新讀取</button></p> : <>
      <div className="shelf-meta"><span aria-live="polite" aria-atomic="true">{count || view.q.trim() ? found.length + "／" + books.length + " 本" : "共 " + books.length + " 本"}</span>
        <span>最近開啟優先</span>
      </div>
      {found.length ? <ShelfGrid books={found} context={context.toString()} /> : <div className="shelf-empty">
        <ForageIcon name="i-book"/><h2>{books.length ? "找不到符合的書" : "書架上還沒有書"}</h2>
        {view.q && <button onClick={() => change({ ...view, q: "" })}>清除搜尋</button>}
        {count > 0 && <button onClick={() => change({ ...view, ...emptySelection })}>清除篩選</button>}
        {!books.length && <button onClick={() => openForm("start")}>開始一本書</button>}
      </div>}
    </>}
      <div className="shelf-tools">
        <details name="shelf-actions"><summary>記閱讀</summary><div>
          <Link href="/reading/clips">上傳書頁</Link><Link href="/add?mode=reading">貼文字／寫想法</Link>
        </div></details>
        <details name="shelf-actions"><summary>閱讀工具</summary><div>
          <button onClick={() => openForm("start")}>開始一本書</button><button onClick={() => openForm("wait")}>先放入待讀</button>
          <Link href="/reading/visits">今日回訪</Link><Link href="/reading/cards">洞察卡片庫</Link>
          <Link href="/dao/explore">閱讀與知識總覽</Link><Link href="/dao/knowledge">知識庫</Link>
        </div></details>
      </div>
    {filtersOpen && <ShelfFilters books={books} view={view} onClose={closeFilters} />}
    {form && <BookFormSheet mode={form} onClose={() => setForm(null)} onCreated={book => {
      setForm(null);
      if (book.status === "待讀") { void load(); return; }
      context.set("from", "shelf");
      router.push("/reading/books/" + encodeURIComponent(book.id) + "?" + context);
    }} />}
  </section>;
}
