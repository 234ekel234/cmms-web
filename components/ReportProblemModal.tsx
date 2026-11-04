"use client";

import { useEffect, useState } from "react";
import api, { errorMessage } from "@/lib/api";

export type ReportCategory = { value: string; label: string };

/**
 * Report a problem at a place, signed in. It files the same triage report the
 * public sticker form does — into the site's Problem Reports inbox, where a
 * supervisor turns it into a job or dismisses it — rather than a work order,
 * so reports from staff, clients and passers-by are sorted in one place
 * (`POST .../asset-locations/:id/reports`; mobile's ReportProblemSheet). The
 * reporter is known, so there is no contact field.
 */
export default function ReportProblemModal({
  accountId,
  locationId,
  placeName,
  categories,
  onClose,
  onSent,
}: {
  accountId: string;
  locationId: string;
  placeName: string;
  categories: ReportCategory[];
  onClose: () => void;
  onSent: (merged: boolean) => void;
}) {
  const [category, setCategory] = useState("");
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!category) { setError("Choose what the problem is."); return; }
    if (category === "OTHER" && !note.trim()) { setError("Say briefly what the problem is."); return; }
    setError("");
    setSending(true);
    try {
      const res = await api.post(`/accounts/${accountId}/asset-locations/${locationId}/reports`, { category, note: note.trim() });
      onSent(!!res.data?.merged);
      onClose();
    } catch (err) {
      setError(errorMessage(err, "Couldn't send the report. Try again."));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Report a problem">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} aria-hidden="true" />

      <form onSubmit={submit} className="relative w-full max-w-md bg-[var(--tu-bg-surface)] rounded-xl shadow-2xl border border-[var(--tu-border)] flex flex-col">
        <div className="px-6 py-4 border-b border-[var(--tu-border)] flex items-center justify-between shrink-0">
          <h3 className="text-sm font-semibold text-[var(--tu-text-heading)]">Report a problem</h3>
          <button type="button" onClick={onClose} className="text-[var(--tu-text-subtle)] hover:text-[var(--tu-text-body)] cursor-pointer text-sm" aria-label="Close">
            ✕
          </button>
        </div>

        <div className="px-6 py-4 flex flex-col gap-4">
          <p className="text-xs text-[var(--tu-text-subtle)]">
            {placeName} · goes to the site team, who decide what happens next.
          </p>

          <fieldset className="flex flex-col gap-2">
            <legend className="tu-label mb-1">What&apos;s the problem?</legend>
            {categories.map((c) => (
              <label
                key={c.value}
                className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm cursor-pointer ${
                  category === c.value ? "border-[var(--tu-text-brand)] bg-[var(--tu-soft-brand)]" : "border-[var(--tu-border)]"
                }`}
              >
                <input type="radio" name="report-category" value={c.value} checked={category === c.value} onChange={() => setCategory(c.value)} />
                {c.label}
              </label>
            ))}
          </fieldset>

          <div>
            <label className="tu-label" htmlFor="report-note">Details {category === "OTHER" ? "*" : "(optional)"}</label>
            <textarea id="report-note" className="tu-textarea" rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>

          {error && <p className="text-[var(--tu-on-danger)] text-xs" role="alert">{error}</p>}
        </div>

        <div className="px-6 py-4 border-t border-[var(--tu-border)] flex justify-end gap-2">
          <button type="button" onClick={onClose} className="tu-btn-secondary" disabled={sending}>Cancel</button>
          <button type="submit" className="tu-btn-primary" disabled={sending}>{sending ? "Sending…" : "Send report"}</button>
        </div>
      </form>
    </div>
  );
}
