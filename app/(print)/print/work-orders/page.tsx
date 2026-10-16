"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import api from "@/lib/api";
import { MAX_BATCH_PRINT } from "@/lib/workOrders";
import { useAuth } from "@/context/AuthContext";
import WorkOrderSheet, { DEFAULT_SHEET_OPTIONS, type PrintableWorkOrder } from "@/components/print/WorkOrderSheet";
import SheetOptionsBar from "@/components/print/SheetOptionsBar";

/**
 * Several job sheets, one per page — "print tomorrow's work for this site".
 *
 * `?ids=a,b,c`, in the order the list showed them. Each is read through the
 * single-order endpoint, so the batch is exactly the set of sheets the caller
 * could have printed one at a time: an id they may not see (a technician's
 * colleague's job) answers 404 and is counted as skipped, not shown.
 */

/** Requests in flight at once; the single-order route does several reads each. */
const CONCURRENCY = 6;

function BatchPrint() {
  const params = useSearchParams();
  const { user } = useAuth();
  const ids = useMemo(
    () => [...new Set((params.get("ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean))].slice(0, MAX_BATCH_PRINT),
    [params]
  );
  const [orders, setOrders] = useState<(PrintableWorkOrder | null)[] | null>(null);
  const [options, setOptions] = useState(DEFAULT_SHEET_OPTIONS);

  useEffect(() => {
    let cancelled = false;
    const results: (PrintableWorkOrder | null)[] = new Array(ids.length).fill(null);
    let next = 0;
    async function worker() {
      while (next < ids.length) {
        const i = next++;
        try {
          results[i] = (await api.get(`/work-orders/${ids[i]}`)).data;
        } catch {
          results[i] = null;
        }
      }
    }
    Promise.all(Array.from({ length: Math.min(CONCURRENCY, ids.length) }, worker)).then(() => {
      if (!cancelled) setOrders(results);
    });
    return () => { cancelled = true; };
  }, [ids]);

  useEffect(() => {
    document.title = `Job sheets (${ids.length})`;
  }, [ids.length]);

  if (ids.length === 0) return <div className="ps-state">No work orders were chosen to print.</div>;
  if (!orders) return <div className="ps-state ps-muted">Loading {ids.length} work order{ids.length === 1 ? "" : "s"}…</div>;

  const found = orders.filter((o): o is PrintableWorkOrder => o !== null);
  const skipped = orders.length - found.length;
  if (found.length === 0) return <div className="ps-state">None of these work orders could be loaded.</div>;

  return (
    <div className="ps-screen">
      <SheetOptionsBar
        // Opened in its own tab from the list, so closing it is the way back.
        back={<a href="#" onClick={(e) => { e.preventDefault(); window.close(); }}>← Close</a>}
        summary={
          `${found.length} sheet${found.length === 1 ? "" : "s"}` +
          (skipped > 0 ? ` · ${skipped} couldn't be loaded` : "")
        }
        options={options}
        onChange={setOptions}
        hasNotes={found.some((o) => o.comments.length > 0)}
        hasPauses={found.some((o) => (o.pauses ?? []).length > 0)}
      />
      {found.map((o) => (
        <WorkOrderSheet key={o.id} order={o} options={options} printedBy={user?.name} />
      ))}
    </div>
  );
}

export default function BatchPrintPage() {
  // useSearchParams needs a Suspense boundary under the App Router.
  return (
    <Suspense fallback={<div className="ps-state ps-muted">Loading…</div>}>
      <BatchPrint />
    </Suspense>
  );
}
