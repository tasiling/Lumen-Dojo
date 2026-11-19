"use client";

import Link from "next/link";
import { useLayoutEffect, useRef, useState } from "react";
import { coverFor, markOpened, shelfTitle, shelfAuthor } from "./readerShelf";
import type { ReadingBook } from "@/lib/reading/types";

const scrollKey = "reading-shelf-position";

function Cover({ book, eager }: { book: ReadingBook; eager: boolean }) {
  const [failedUrl, setFailedUrl] = useState("");
  const cover = coverFor(book);
  return <span className="shelf-cover" aria-hidden="true">
    {cover && cover !== failedUrl
      // Notion rotates signed cover URLs. Request the small original directly from the private shelf.
      // eslint-disable-next-line @next/next/no-img-element
      ? <img alt="" src={cover} loading={eager ? "eager" : "lazy"} referrerPolicy="no-referrer"
          decoding="async" onError={() => setFailedUrl(cover)} />
      : <span className="shelf-type-cover">{shelfTitle(book)}</span>}
  </span>;
}

export default function ShelfGrid({ books, context }: { books: ReadingBook[]; context: string }) {
  const ref = useRef<HTMLUListElement>(null);

  useLayoutEffect(() => {
    const grid = ref.current;
    if (!grid) return;
    const cells = Array.from(grid.children) as HTMLLIElement[];
    let frame = 0;
    function layout() {
      if (!grid || !cells.length) return;
      const columns = Number(getComputedStyle(grid).getPropertyValue("--shelf-cols")) || 1;
      const heights = Array<number>(columns).fill(1);
      const sizes = cells.map(cell => Math.ceil((cell.firstElementChild!.getBoundingClientRect().height + 12) / 2));
      for (let i = 0; i < cells.length; i++) {
        const col = heights.indexOf(Math.min(...heights));
        cells[i].style.gridColumnStart = String(col + 1);
        cells[i].style.gridRow = heights[col] + " / span " + sizes[i];
        heights[col] += sizes[i];
      }
      grid.dataset.layout = "ready";
    }
    layout();
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(layout);
    });
    cells.forEach(cell => observer.observe(cell.firstElementChild!));
    let restore = 0;
    try {
      const raw = sessionStorage.getItem(scrollKey);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved.context === context) {
          const link = cells.map(cell => cell.querySelector("a")).find(a => a?.dataset.bookId === saved.id);
          if (link && Number.isFinite(saved.offset)) {
            restore = requestAnimationFrame(() => {
              sessionStorage.removeItem(scrollKey);
              link.focus({ preventScroll: true });
              window.scrollBy(0, link.getBoundingClientRect().top - saved.offset);
            });
          } else sessionStorage.removeItem(scrollKey);
        }
      }
    } catch { /* The URL still restores filters if tab storage is unavailable. */ }
    return () => { observer.disconnect(); cancelAnimationFrame(frame); cancelAnimationFrame(restore); };
  }, [books, context]);

  const query = new URLSearchParams(context);
  query.set("from", "shelf");
  return <ul className="shelf-grid" ref={ref} aria-label="書籍">
    {books.map((book, index) => <li key={book.id}>
      <Link className="shelf-book" data-book-id={book.id} prefetch={false}
        href={"/reading/reader/" + encodeURIComponent(book.id) + "?" + query}
        onClick={event => {
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          try {
            markOpened(book.id);
            sessionStorage.setItem(scrollKey, JSON.stringify({ id: book.id, context, offset: event.currentTarget.getBoundingClientRect().top }));
          } catch { /* Browser Back remains available. */ }
        }}>
        <Cover book={book} eager={index < 2} />
        <span className="shelf-book-info">
          <strong>{shelfTitle(book)}</strong>
          {shelfAuthor(book) && <span className="shelf-byline">{shelfAuthor(book).replaceAll("｜", " · ")}</span>}

        </span>
      </Link>
    </li>)}
  </ul>;
}
