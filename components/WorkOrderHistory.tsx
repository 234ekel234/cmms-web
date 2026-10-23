"use client";

import { useCallback, useEffect, useState } from "react";
import api from "@/lib/api";

/**
 * One job's history: every recorded action and every update on its thread,
 * oldest first, each with who and exactly when.
 *
 * Read from GET /work-orders/:id/history, which builds it from the audit trail
 * and the thread and applies their visibility rules — a client gets it without
 * the clock, parts, internal notes or hold reasons, and this component does not
 * need to know which.
 */

export type HistoryEntry = {
  id: string;
  kind: "event" | "update";
  action: string;
  at: string;
  by: string | null;
  text: string;
  internal?: boolean;
  files?: number;
};

/** A word for the kind of thing that happened, for the marker on each row. */
function tone(e: HistoryEntry): string {
  if (e.kind === "update") return e.internal ? "internal" : "update";
  if (/REWORK|REJECTED|TIMER_PAUSED|ON_HOLD/.test(e.action)) return "stop";
  if (/COMPLETED|APPROVED|VERIFIED/.test(e.action)) return "done";
  return "event";
}

/** Absolute time, because "3 days ago" is useless when reconstructing a job. */
function stamp(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit",
  });
}

export default function WorkOrderHistory({
  workOrderId,
  refreshKey = 0,
}: {
  workOrderId: string;
  /** Bump to reload after an action on the page, so the newest entry shows. */
  refreshKey?: string | number;
}) {
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get(`/work-orders/${workOrderId}/history`);
      setEntries(res.data);
      setError(false);
    } catch {
      setError(true);
    }
  }, [workOrderId]);

  useEffect(() => {
    (async () => { await load(); })();
  }, [load, refreshKey]);

  if (error) return <p className="tu-history-empty">Couldn&apos;t load the history.</p>;
  if (!entries) return <p className="tu-history-empty">Loading…</p>;
  if (entries.length === 0) return <p className="tu-history-empty">Nothing recorded yet.</p>;

  return (
    <ol role="list" className="tu-history">
      {entries.map((e) => (
        <li key={e.id} className={`tu-history-row tu-history-${tone(e)}`}>
          <span className="tu-history-dot" aria-hidden="true" />
          <div className="tu-history-body">
            <p className="tu-history-text">
              {e.kind === "update" ? (
                <>
                  <strong>{e.by ?? "Someone"}</strong> {e.internal ? "posted an internal note" : "posted an update"}
                  {e.files ? ` with ${e.files} file${e.files === 1 ? "" : "s"}` : ""}
                  {e.text && <span className="tu-history-quote">“{e.text}”</span>}
                </>
              ) : (
                e.text
              )}
            </p>
            <p className="tu-history-meta">
              <time dateTime={e.at}>{stamp(e.at)}</time>
              {e.kind === "event" && e.by ? ` · ${e.by}` : ""}
              {e.internal && <span className="tu-internal-badge" style={{ marginLeft: 6 }}>Staff only</span>}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
