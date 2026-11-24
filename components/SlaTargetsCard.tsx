"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import api, { errorMessage } from "@/lib/api";
import { startLoad } from "@/lib/startLoad";
import { WORK_ORDER_PRIORITY, type WorkOrderPriority } from "@/lib/statuses";
import {
  SLA_PRIORITIES, describeTarget, fromParts, toParts,
  type SlaTargetsResponse, type SlaUnit,
} from "@/lib/sla";

type Draft = Record<WorkOrderPriority, { respond: { value: string; unit: SlaUnit }; resolve: { value: string; unit: SlaUnit } }>;

const draftFrom = (t: SlaTargetsResponse["targets"]): Draft =>
  Object.fromEntries(SLA_PRIORITIES.map((p) => [p, {
    respond: toParts(t[p].respondMinutes),
    resolve: toParts(t[p].resolveMinutes),
  }])) as Draft;

/**
 * The site's service levels, on its profile: how soon work of each priority
 * must start and be finished, counted in calendar time from when the job is
 * raised. Everyone who reads the profile sees them (the client's contract
 * terms); managers change them. A priority left at the company default is
 * saved as no row, so a better default later reaches it
 * (backend/helpers/sla.js). Reports → SLA measures the work against these.
 */
export default function SlaTargetsCard({ accountId, canEdit, showReportLink }: {
  accountId: string; canEdit: boolean; showReportLink: boolean;
}) {
  const [data, setData] = useState<SlaTargetsResponse | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (isCancelled: () => boolean) => {
    try {
      const res = await api.get(`/accounts/${accountId}/sla-targets`);
      if (!isCancelled()) { setData(res.data); setLoadError(false); }
    } catch {
      if (!isCancelled()) setLoadError(true);
    }
  }, [accountId]);
  useEffect(() => startLoad(load), [load]);

  async function save(useDefaults = false) {
    if (!data) return;
    setError("");
    const targets = [];
    if (!useDefaults && draft) {
      for (const p of SLA_PRIORITIES) {
        const respondMinutes = fromParts(draft[p].respond.value, draft[p].respond.unit);
        const resolveMinutes = fromParts(draft[p].resolve.value, draft[p].resolve.unit);
        if (Number.isNaN(respondMinutes) || Number.isNaN(resolveMinutes)) {
          setError(`${WORK_ORDER_PRIORITY[p].label}: enter a positive number, or leave it blank for no target.`);
          return;
        }
        const d = data.defaults[p];
        // Same as the company default: stored as no row, so it keeps following the default.
        if (respondMinutes === d.respondMinutes && resolveMinutes === d.resolveMinutes) continue;
        targets.push({ priority: p, respondMinutes, resolveMinutes });
      }
    }
    setSaving(true);
    try {
      const res = await api.put(`/accounts/${accountId}/sla-targets`, { targets });
      setData(res.data);
      setDraft(null);
    } catch (err) {
      setError(errorMessage(err, "Couldn't save the service levels."));
    } finally {
      setSaving(false);
    }
  }

  const anyCustom = data ? SLA_PRIORITIES.some((p) => data.targets[p].custom) : false;

  const field = (p: WorkOrderPriority, which: "respond" | "resolve") => {
    const v = draft![p][which];
    const set = (next: Partial<typeof v>) =>
      setDraft((d) => (d ? { ...d, [p]: { ...d[p], [which]: { ...d[p][which], ...next } } } : d));
    const label = `${WORK_ORDER_PRIORITY[p].label} ${which === "respond" ? "response" : "resolution"} target`;
    return (
      <div className="flex gap-2">
        <input
          className="tu-input"
          style={{ width: 90 }}
          inputMode="decimal"
          aria-label={label}
          placeholder="None"
          value={v.value}
          onChange={(e) => set({ value: e.target.value })}
        />
        <select className="tu-select" aria-label={`${label} unit`} value={v.unit} onChange={(e) => set({ unit: e.target.value as SlaUnit })}>
          <option value="minutes">minutes</option>
          <option value="hours">hours</option>
          <option value="days">days</option>
        </select>
      </div>
    );
  };

  return (
    <section className="tu-card">
      <div className="tu-card-header flex flex-wrap items-center justify-between gap-2">
        <h2 className="tu-card-title">Service levels</h2>
        <div className="flex flex-wrap gap-2">
          {showReportLink && !draft && <Link href={`/reports/sla?accountIds=${accountId}`} className="tu-btn-secondary">See how it&apos;s going</Link>}
          {canEdit && data && !draft && (
            <button type="button" className="tu-btn-secondary" onClick={() => { setDraft(draftFrom(data.targets)); setError(""); }}>
              Edit service levels
            </button>
          )}
        </div>
      </div>
      <p className="tu-card-pad text-sm text-[var(--tu-text-subtle)]" style={{ paddingBottom: 0 }}>
        How soon work must <strong>start</strong> (response) and be <strong>finished</strong> (resolution), counted
        in calendar time from when the job is raised. Maintenance-plan work runs to its schedule and is not measured.
      </p>

      {loadError && !data && <p className="tu-card-pad text-sm text-[var(--tu-on-danger)]" role="alert">Couldn&apos;t load the service levels.</p>}
      {!data && !loadError && <div className="tu-card-pad"><div className="tu-skeleton" style={{ height: 120 }} /></div>}

      {data && (
        <div className="tu-scroll-x">
          <table className="tu-table">
            <thead>
              <tr>
                <th scope="col">Priority</th>
                <th scope="col">Response</th>
                <th scope="col">Resolution</th>
                {!draft && <th scope="col">Set by</th>}
              </tr>
            </thead>
            <tbody>
              {SLA_PRIORITIES.map((p) => {
                const t = data.targets[p];
                return (
                  <tr key={p}>
                    <td><span className={WORK_ORDER_PRIORITY[p].badge}>{WORK_ORDER_PRIORITY[p].label}</span></td>
                    <td>{draft ? field(p, "respond") : describeTarget(t.respondMinutes)}</td>
                    <td>{draft ? field(p, "resolve") : describeTarget(t.resolveMinutes)}</td>
                    {!draft && <td className="text-[var(--tu-text-subtle)]">{t.custom ? "This site" : "Company default"}</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {data && !draft && anyCustom && data.updatedByName && (
        <p className="tu-card-pad text-xs text-[var(--tu-text-subtle)]" style={{ paddingTop: 8 }}>
          Last changed by {data.updatedByName}
          {data.updatedAt ? ` on ${new Date(data.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}` : ""}.
        </p>
      )}

      {draft && data && (
        <div className="tu-card-pad" style={{ paddingTop: 12 }}>
          <p className="text-xs text-[var(--tu-text-subtle)] mb-3">
            Leave a box blank for no target. A row left at the company default keeps following it.
          </p>
          {error && <p className="tu-danger-text mb-3" role="alert" style={{ fontSize: 12.5 }}>{error}</p>}
          <div className="tu-page-actions" style={{ justifyContent: "space-between" }}>
            <button type="button" className="tu-btn-ghost" disabled={saving || !anyCustom} onClick={() => save(true)}
              title={anyCustom ? "Every priority back to the company default" : "Already on the company defaults"}>
              Use company defaults
            </button>
            <div className="flex gap-2">
              <button type="button" className="tu-btn-secondary" disabled={saving} onClick={() => { setDraft(null); setError(""); }}>Cancel</button>
              <button type="button" className="tu-btn-primary" disabled={saving} onClick={() => save()}>{saving ? "Saving…" : "Save"}</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
