"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";
import { workOrderRef } from "@/lib/workOrders";
import type { WorkOrderStatus } from "@/lib/statuses";

/**
 * Asks why before it stops the clock.
 *
 * The API refuses a pause without a reason — the reason becomes a
 * WorkOrderPause row and an audit line, which is how the time is accounted for.
 * The lists once posted `{ action: "pause" }` bare and swallowed the 400, so
 * their Pause buttons did nothing at all while the man-hours kept growing. This
 * is the one place a list pauses from, so it cannot happen piecemeal again.
 *
 * `onPaused` receives the timer route's response — status, timerStartedAt,
 * actualSeconds — for the caller to merge into its row.
 */

/** Mirrors MAX_PAUSE_REASON in backend/routes/workOrderRoutes.js. */
const MAX_REASON = 500;

export type TimerResult = { id: string; status: WorkOrderStatus; timerStartedAt: string | null; actualSeconds: number };

type Props = {
  order: { id: string; number: number; title: string };
  onClose: () => void;
  onPaused: (result: TimerResult) => void;
};

export default function PauseTimerDialog({ order, onClose, onPaused }: Props) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, busy]);

  async function submit() {
    const text = reason.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.post(`/work-orders/${order.id}/timer`, { action: "pause", reason: text });
      onPaused(res.data);
      onClose();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? "Couldn't pause the timer. Try again.");
      setBusy(false);
    }
  }

  return (
    <div className="tu-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="pause-title" onClick={() => !busy && onClose()}>
      <div className="tu-modal" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
        <div className="tu-modal-header">
          <h2 id="pause-title" className="tu-modal-title">Pause timer</h2>
        </div>
        <div className="tu-modal-body">
          <p style={{ fontSize: 13, color: "var(--tu-text-subtle)", margin: "0 0 12px" }}>
            {workOrderRef(order.number)} · {order.title}
          </p>
          <label className="tu-label" htmlFor="pause-dialog-reason">Why are you pausing?</label>
          <textarea
            id="pause-dialog-reason"
            className="tu-input"
            rows={3}
            maxLength={MAX_REASON}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            onKeyDown={(e) => {
              // Enter submits, Shift+Enter is a new line — it is a sentence, not a report.
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
            }}
            placeholder="Waiting for the spare seal to arrive."
            style={{ resize: "vertical" }}
            autoFocus
          />
          {error && <p role="alert" style={{ fontSize: 12.5, color: "var(--tu-on-danger)", marginTop: 8 }}>{error}</p>}
        </div>
        <div className="tu-modal-footer">
          <button type="button" className="tu-btn-secondary tu-btn-sm" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="tu-btn-primary tu-btn-sm" onClick={submit} disabled={busy || !reason.trim()}>
            {busy ? "Pausing…" : "Pause timer"}
          </button>
        </div>
      </div>
    </div>
  );
}
