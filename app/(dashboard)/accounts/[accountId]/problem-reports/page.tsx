"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import api, { errorMessage } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { MANAGERS, hasRole } from "@/lib/rbac";
import { startLoad } from "@/lib/startLoad";
import { useConfirm } from "@/components/ConfirmDialog";
import { locationPath, type AssetLocationRef } from "@/lib/assetLocations";
import { workOrderRef } from "@/lib/workOrders";

type Report = {
  id: string;
  category: string;
  notes: string[];
  contact: string | null;
  count: number;
  status: "OPEN" | "CONVERTED" | "DISMISSED";
  handledByName: string | null;
  handledAt: string | null;
  lastReportedAt: string;
  createdAt: string;
  location: AssetLocationRef;
  workOrder: { id: string; number: number; title: string; status: string } | null;
};

const CATEGORY_LABEL: Record<string, string> = {
  NEEDS_CLEANING: "Needs cleaning",
  LEAK: "Leak or spill",
  NO_SUPPLIES: "Out of supplies",
  BROKEN: "Something broken",
  OTHER: "Other problem",
};
const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/**
 * Problems reported from location stickers by people not signed in. Triage,
 * not work: a supervisor turns one into a work order or dismisses it, so
 * nothing reaches the queue — or the client — until a person has looked.
 * Managers switch the feature on or off for the site here.
 */
export default function ProblemReportsPage() {
  const { accountId } = useParams<{ accountId: string }>();
  const { user } = useAuth();
  const isManager = hasRole(user?.role, MANAGERS);
  const confirm = useConfirm();

  const [tab, setTab] = useState<"OPEN" | "DONE">("OPEN");
  const [reports, setReports] = useState<Report[] | null>(null);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [priority, setPriority] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const [list, account] = await Promise.all([
        api.get(`/accounts/${accountId}/public-reports`),
        api.get(`/accounts/${accountId}`),
      ]);
      setReports(list.data);
      setEnabled(!!account.data?.publicReportsEnabled);
      setError(null);
    } catch (err) {
      setError(errorMessage(err, "Couldn't load the reports."));
    }
  }, [accountId]);
  useEffect(() => startLoad(load), [load]);

  async function act(id: string, run: () => Promise<unknown>) {
    setBusy(id);
    setError(null);
    try {
      await run();
      await load();
    } catch (err) {
      setError(errorMessage(err, "That didn't go through."));
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function toggle() {
    const next = !enabled;
    if (next && !(await confirm({
      title: "Let anyone report problems here?",
      message: "Anyone who scans a location sticker on this site will be able to report a problem without signing in. Reports come to this inbox; nothing reaches the work queue until someone here turns it into a job.",
      confirmLabel: "Turn on",
    }))) return;
    act("setting", () => api.put(`/accounts/${accountId}/public-reporting`, { enabled: next }));
  }

  if (error && !reports) return <div className="px-4 py-5 sm:p-8"><div className="tu-error-banner" role="alert">{error}</div></div>;
  if (!reports) return <div className="px-4 py-5 sm:p-8"><div className="tu-skeleton" style={{ height: 240, borderRadius: 12 }} /></div>;

  const open = reports.filter((r) => r.status === "OPEN");
  const done = reports.filter((r) => r.status !== "OPEN");
  const shown = tab === "OPEN" ? open : done;

  return (
    <div className="px-4 py-5 sm:p-8 flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-[var(--tu-text-heading)]">Problem Reports</h2>
          <p className="text-sm text-[var(--tu-text-subtle)] max-w-2xl">
            Reported from location stickers by people who aren&apos;t signed in. Only staff see these; turn one into a
            work order to act on it.
          </p>
        </div>
        <div className="tu-page-actions items-center">
          <span className={enabled ? "tu-badge tu-badge-success" : "tu-badge tu-badge-neutral"}>
            {enabled ? "Reporting is on" : "Reporting is off"}
          </span>
          {isManager && (
            <button type="button" className="tu-btn-secondary" disabled={busy === "setting"} onClick={toggle}>
              {enabled ? "Turn off" : "Turn on"}
            </button>
          )}
          <Link href={`/print/accounts/${accountId}/locations/labels`} target="_blank" className="tu-btn-secondary">Print stickers</Link>
        </div>
      </div>

      {error && <div className="tu-action-error" role="alert"><span>{error}</span></div>}

      <div className="flex gap-2">
        <button type="button" onClick={() => setTab("OPEN")} className={tab === "OPEN" ? "tu-btn-primary" : "tu-btn-secondary"}>Open ({open.length})</button>
        <button type="button" onClick={() => setTab("DONE")} className={tab === "DONE" ? "tu-btn-primary" : "tu-btn-secondary"}>Dealt with ({done.length})</button>
      </div>

      {shown.length === 0 ? (
        <div className="tu-card tu-card-pad text-sm text-[var(--tu-text-subtle)]">
          {tab === "OPEN"
            ? enabled ? "Nothing reported. New reports appear here and in your notifications." : "Nothing reported. Turn reporting on to let people report problems from the stickers."
            : "Nothing dealt with yet."}
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {shown.map((r) => (
            <li key={r.id} className="tu-card tu-card-pad">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div style={{ minWidth: 0 }}>
                  <p className="font-semibold text-[var(--tu-text-heading)]">
                    {CATEGORY_LABEL[r.category] ?? r.category}
                    {r.count > 1 && <span className="tu-badge tu-badge-warning ml-2">Reported {r.count}×</span>}
                  </p>
                  <p className="text-sm">
                    <Link href={`/accounts/${accountId}/assets/locations/${r.location.id}`} className="tu-link">{locationPath(r.location)}</Link>
                    <span className="text-[var(--tu-text-subtle)]"> · {fmtTime(r.lastReportedAt)}</span>
                  </p>
                  {r.notes.length > 0 && (
                    <ul className="mt-2 text-sm text-[var(--tu-text-body)] list-disc pl-5">
                      {r.notes.map((n, i) => <li key={i}>{n}</li>)}
                    </ul>
                  )}
                  {r.contact && <p className="mt-2 text-xs text-[var(--tu-text-subtle)]">Left contact: {r.contact}</p>}
                  {r.status !== "OPEN" && (
                    <p className="mt-2 text-xs text-[var(--tu-text-subtle)]">
                      {r.status === "CONVERTED" ? "Turned into " : "Dismissed"}
                      {r.workOrder && (
                        <Link href={`/accounts/${accountId}/work-orders/${r.workOrder.id}`} className="tu-link">{workOrderRef(r.workOrder.number)}</Link>
                      )}
                      {r.handledByName && ` by ${r.handledByName}`}{r.handledAt && ` · ${fmtTime(r.handledAt)}`}
                    </p>
                  )}
                </div>
                {r.status === "OPEN" && (
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      className="tu-select"
                      aria-label="Priority for the work order"
                      value={priority[r.id] ?? "MEDIUM"}
                      onChange={(e) => setPriority((p) => ({ ...p, [r.id]: e.target.value }))}
                      style={{ width: "auto" }}
                    >
                      {PRIORITIES.map((p) => <option key={p} value={p}>{p.charAt(0) + p.slice(1).toLowerCase()}</option>)}
                    </select>
                    <button
                      type="button"
                      className="tu-btn-primary"
                      disabled={busy === r.id}
                      onClick={() => act(r.id, () => api.post(`/accounts/${accountId}/public-reports/${r.id}/convert`, { priority: priority[r.id] ?? "MEDIUM" }))}
                    >
                      Create work order
                    </button>
                    <button
                      type="button"
                      className="tu-btn-secondary"
                      disabled={busy === r.id}
                      onClick={() => act(r.id, () => api.post(`/accounts/${accountId}/public-reports/${r.id}/dismiss`))}
                    >
                      Dismiss
                    </button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
