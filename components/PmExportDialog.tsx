"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";
import { downloadPmWorkbook, fileSlug, type PmExport } from "@/lib/pmExport";

/**
 * "Export PM checklists" — choose a range, get an Excel workbook of every round,
 * every answer and the statistics. One dialog for both report pages: give it an
 * `accountId` for one site, or `accountIds` (empty = all reachable) for the
 * cross-site export, which the API only serves to staff.
 *
 * Its own range rather than the page's, because the pages' ranges are built for
 * reading a screen (today / this week / this month) and analytics wants a
 * quarter or a year.
 */

/** Mirrors MAX_EXPORT_DAYS in backend/helpers/pmExport.js. */
const MAX_DAYS = 366;

const pad = (n: number) => String(n).padStart(2, "0");
const key = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function presets(now = new Date()) {
  const y = now.getFullYear(), m = now.getMonth();
  const q = Math.floor(m / 3) * 3;
  return [
    { label: "This month", from: new Date(y, m, 1), to: now },
    { label: "Last month", from: new Date(y, m - 1, 1), to: new Date(y, m, 0) },
    { label: "This quarter", from: new Date(y, q, 1), to: now },
    { label: "Last quarter", from: new Date(y, q - 3, 1), to: new Date(y, q, 0) },
    { label: "Year to date", from: new Date(y, 0, 1), to: now },
    { label: "Last 12 months", from: new Date(y - 1, m, now.getDate() + 1), to: now },
  ].map((p) => ({ label: p.label, from: key(p.from), to: key(p.to) }));
}

type Props = {
  onClose: () => void;
  /** Name for the workbook's title and filename: a site, or "All sites". */
  scope: string;
  accountId?: string;
  accountIds?: string[];
  initialFrom?: string;
  initialTo?: string;
};

export default function PmExportDialog({ onClose, scope, accountId, accountIds, initialFrom, initialTo }: Props) {
  const options = presets();
  const [from, setFrom] = useState(initialFrom ?? options[0].from);
  const [to, setTo] = useState(initialTo ?? options[0].to);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, busy]);

  const days = from && to ? Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1 : 0;
  const rangeProblem =
    !from || !to ? "Choose both dates."
    : days < 1 ? "The start date is after the end date."
    : days > MAX_DAYS ? `Export at most ${MAX_DAYS} days at a time.`
    : null;

  async function run() {
    if (rangeProblem || busy) return;
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const url = accountId ? `/accounts/${accountId}/reports/pm-checklists` : "/reports/pm-checklists";
      const params: Record<string, string> = { from, to };
      if (!accountId && accountIds && accountIds.length > 0) params.accountIds = accountIds.join(",");
      const res = await api.get<PmExport>(url, { params });
      await downloadPmWorkbook(res.data, {
        scope,
        filename: `pm-checklists-${fileSlug(scope)}-${from}-to-${to}.xlsx`,
      });
      const t = res.data.totals;
      setDone(`${t.submitted} round${t.submitted === 1 ? "" : "s"} and ${res.data.answers.length} answer${res.data.answers.length === 1 ? "" : "s"} across ${t.checklists} checklist${t.checklists === 1 ? "" : "s"}.`);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? "Couldn't build the export. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="tu-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="pm-export-title" onClick={() => !busy && onClose()}>
      <div className="tu-modal" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
        <div className="tu-modal-header">
          <h2 id="pm-export-title" className="tu-modal-title">Export PM checklists</h2>
        </div>
        <div className="tu-modal-body">
          <p style={{ fontSize: 13, color: "var(--tu-text-subtle)", margin: "0 0 14px" }}>
            An Excel workbook for {scope}: compliance and finding rates per checklist, every period
            (including missed ones), findings by item, and every answer.
          </p>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
            {options.map((p) => (
              <button
                key={p.label}
                type="button"
                className={`tu-period-pill${from === p.from && to === p.to ? " tu-active-pill" : ""}`}
                aria-pressed={from === p.from && to === p.to}
                onClick={() => { setFrom(p.from); setTo(p.to); }}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label className="tu-label" htmlFor="pm-export-from">From</label>
              <input id="pm-export-from" type="date" className="tu-input" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div>
              <label className="tu-label" htmlFor="pm-export-to">To</label>
              <input id="pm-export-to" type="date" className="tu-input" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>
          <p style={{ fontSize: 12, color: "var(--tu-text-subtle)", marginTop: 8 }}>
            Periods are chosen by when they start, so a round filed late still counts in its own period.
          </p>

          {rangeProblem && from && to && <p role="alert" style={{ fontSize: 12.5, color: "var(--tu-on-danger)", marginTop: 8 }}>{rangeProblem}</p>}
          {error && <p role="alert" style={{ fontSize: 12.5, color: "var(--tu-on-danger)", marginTop: 8 }}>{error}</p>}
          {done && <p role="status" style={{ fontSize: 12.5, color: "var(--tu-on-success)", marginTop: 8 }}>Downloaded — {done}</p>}
        </div>
        <div className="tu-modal-footer">
          <button type="button" className="tu-btn-secondary tu-btn-sm" onClick={onClose} disabled={busy}>Close</button>
          <button type="button" className="tu-btn-primary tu-btn-sm" onClick={run} disabled={busy || !!rangeProblem}>
            {busy ? "Building…" : "Download Excel"}
          </button>
        </div>
      </div>
    </div>
  );
}
