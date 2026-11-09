"use client";

import { useState } from "react";

export const PAGE_SIZES = [25, 50, 100] as const;
export type PageSize = (typeof PAGE_SIZES)[number];

/**
 * Client-side paging over a list already filtered and sorted in the page.
 * Goes back to page 1 whenever `resetKey` changes — pass something built from
 * the search and filters, so narrowing the list never strands you on page 9 of 2.
 * The reset happens during render with a "last seen" guard rather than in an
 * effect (see web/CLAUDE.md, "Loading data in effects").
 */
export function usePaging<T>(items: T[], resetKey: string, initialSize: PageSize = 50) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeState] = useState<PageSize>(initialSize);
  const [seenKey, setSeenKey] = useState(resetKey);
  if (seenKey !== resetKey) {
    setSeenKey(resetKey);
    setPage(1);
  }
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  // A row removed from the last page can leave it empty; show the new last page.
  const current = Math.min(page, pageCount);
  const start = (current - 1) * pageSize;
  return {
    page: current,
    pageSize,
    pageCount,
    total: items.length,
    start,
    pageItems: items.slice(start, start + pageSize),
    setPage,
    setPageSize: (size: PageSize) => { setPageSizeState(size); setPage(1); },
  };
}

/** Page numbers to show: the first, the last, and two either side of the current one. */
function pageList(current: number, count: number): (number | "…")[] {
  const keep = new Set([1, count, current - 2, current - 1, current, current + 1, current + 2]);
  const out: (number | "…")[] = [];
  for (let p = 1; p <= count; p++) {
    if (!keep.has(p)) continue;
    const prev = out[out.length - 1];
    if (typeof prev === "number" && p - prev > 1) out.push("…");
    out.push(p);
  }
  return out;
}

type PagerProps = ReturnType<typeof usePaging<unknown>> & {
  /** "assets" → "Showing 1–50 of 1,062 assets". */
  noun: string;
};

export default function Pager({ page, pageCount, pageSize, total, start, setPage, setPageSize, noun }: PagerProps) {
  if (total === 0) return null;
  const end = Math.min(start + pageSize, total);
  return (
    <nav className="tu-pager" aria-label={`${noun} pages`}>
      <span className="tu-pager-summary" aria-live="polite">
        Showing {(start + 1).toLocaleString()}–{end.toLocaleString()} of {total.toLocaleString()} {noun}
      </span>
      {pageCount > 1 && (
        <span className="tu-pager-pages">
          <button type="button" className="tu-pager-btn" disabled={page === 1} onClick={() => setPage(page - 1)} aria-label="Previous page">
            ‹ Prev
          </button>
          {pageList(page, pageCount).map((p, i) =>
            p === "…" ? (
              <span key={`gap-${i}`} className="tu-pager-gap" aria-hidden="true">…</span>
            ) : (
              <button
                key={p}
                type="button"
                className="tu-pager-btn tu-pager-num"
                aria-current={p === page ? "page" : undefined}
                aria-label={`Page ${p}`}
                onClick={() => setPage(p)}
              >
                {p}
              </button>
            ),
          )}
          <button type="button" className="tu-pager-btn" disabled={page === pageCount} onClick={() => setPage(page + 1)} aria-label="Next page">
            Next ›
          </button>
        </span>
      )}
      <label className="tu-pager-size">
        Per page
        <select className="tu-select" value={pageSize} onChange={(e) => setPageSize(Number(e.target.value) as PageSize)}>
          {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </label>
    </nav>
  );
}
