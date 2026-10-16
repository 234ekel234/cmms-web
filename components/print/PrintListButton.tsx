"use client";

import { MAX_BATCH_PRINT, batchPrintHref } from "@/lib/workOrders";

/**
 * "Print N" above a work-order list: one job sheet per order the list is
 * currently showing, in the order it shows them. What you filtered to is what
 * comes out — a site's open work, today's overdue jobs, one technician's queue.
 */
export default function PrintListButton({ ids }: { ids: string[] }) {
  if (ids.length === 0) {
    return <button type="button" className="tu-btn-secondary" disabled title="Nothing in this view to print">Print</button>;
  }
  const capped = ids.length > MAX_BATCH_PRINT;
  return (
    <a
      href={batchPrintHref(ids)}
      target="_blank"
      rel="noopener"
      className="tu-btn-secondary"
      title={
        capped
          ? `Prints the first ${MAX_BATCH_PRINT} of ${ids.length} — narrow the filters to print the rest`
          : `A job sheet for each of the ${ids.length} work order${ids.length === 1 ? "" : "s"} in this view`
      }
    >
      Print {capped ? MAX_BATCH_PRINT : ids.length}
    </a>
  );
}
