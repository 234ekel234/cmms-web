"use client";

import { useEffect, useState } from "react";

/**
 * Asks why before a job stops — putting it On Hold, or sending finished work
 * back. The API refuses both without a reason (it becomes the job's "waiting
 * on" line and its pause history), so the screens that offer either move ask
 * through this rather than each growing its own text box.
 *
 * `onSubmit` returns an error message to show, or null when it went through;
 * the dialog closes itself on success.
 */

/** Mirrors MAX_PAUSE_REASON in backend/routes/workOrderRoutes.js. */
const MAX_REASON = 500;

export default function ReasonDialog({
  title,
  subtitle,
  label,
  placeholder,
  hint,
  confirmLabel,
  onSubmit,
  onClose,
}: {
  title: string;
  subtitle?: string;
  label: string;
  placeholder?: string;
  hint?: string;
  confirmLabel: string;
  onSubmit: (reason: string) => Promise<string | null>;
  onClose: () => void;
}) {
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
    const failed = await onSubmit(text);
    if (failed) {
      setError(failed);
      setBusy(false);
      return;
    }
    onClose();
  }

  return (
    <div className="tu-modal-overlay" role="presentation" onClick={() => !busy && onClose()}>
      <div
        className="tu-modal"
        style={{ maxWidth: 440 }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="reason-dialog-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="tu-modal-header">
          <h2 id="reason-dialog-title" className="tu-modal-title">{title}</h2>
        </div>
        <div className="tu-modal-body">
          {subtitle && (
            <p style={{ fontSize: 13, color: "var(--tu-text-subtle)", margin: "0 0 12px" }}>{subtitle}</p>
          )}
          <label className="tu-label" htmlFor="reason-dialog-text">{label}</label>
          <textarea
            id="reason-dialog-text"
            className="tu-input"
            rows={3}
            maxLength={MAX_REASON}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            onKeyDown={(e) => {
              // Enter submits, Shift+Enter is a new line — it is a sentence, not a report.
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
            }}
            placeholder={placeholder}
            style={{ resize: "vertical" }}
            autoFocus
          />
          {hint && <p style={{ fontSize: 12, color: "var(--tu-text-subtle)", marginTop: 6 }}>{hint}</p>}
          {error && <p role="alert" style={{ fontSize: 12.5, color: "var(--tu-on-danger)", marginTop: 8 }}>{error}</p>}
        </div>
        <div className="tu-modal-footer">
          <button type="button" className="tu-btn-secondary tu-btn-sm" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="tu-btn-primary tu-btn-sm" onClick={submit} disabled={busy || !reason.trim()}>
            {busy ? "Saving…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
