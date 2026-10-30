"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import api, { errorMessage } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { STAFF, hasRole } from "@/lib/rbac";
import { startLoad } from "@/lib/startLoad";

type Row = {
  id: string;
  name: string;
  parentId: string | null;
  openJobs: number;
  recentJobs: number;
  repeatFlagged: boolean;
  /** Staff only. */
  visitsToday?: number;
  lastVisitAt?: string | null;
};

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/**
 * Every place on the site, for the supervisor's morning question: where is
 * work open, where does it keep coming back, and which places has nobody
 * scanned today. Each row opens the place's page. Figures are per place — a
 * building's row is what is filed at the building itself, its floors are their
 * own rows beneath it.
 */
export default function LocationsPage() {
  const { accountId } = useParams<{ accountId: string }>();
  const { user } = useAuth();
  const isStaff = hasRole(user?.role, STAFF);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [repeatDays, setRepeatDays] = useState(30);
  const [error, setError] = useState<string | null>(null);
  const [notVisitedOnly, setNotVisitedOnly] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get(`/accounts/${accountId}/asset-locations/summary`);
      setRows(res.data.locations);
      setRepeatDays(res.data.repeatDays);
      setError(null);
    } catch (err) {
      setError(errorMessage(err, "Couldn't load the locations."));
    }
  }, [accountId]);
  useEffect(() => startLoad(load), [load]);

  // Buildings in name order, each followed by its floors.
  const ordered = useMemo(() => {
    if (!rows) return [];
    const roots = rows.filter((r) => !r.parentId);
    return roots.flatMap((r) => [{ row: r, depth: 0 }, ...rows.filter((c) => c.parentId === r.id).map((c) => ({ row: c, depth: 1 }))]);
  }, [rows]);
  const shown = notVisitedOnly ? ordered.filter(({ row }) => !row.visitsToday) : ordered;
  const parentName = (id: string | null) => rows?.find((r) => r.id === id)?.name ?? "";

  if (error && !rows) return <div className="px-4 py-5 sm:p-8"><div className="tu-error-banner" role="alert">{error}</div></div>;
  if (!rows) return <div className="px-4 py-5 sm:p-8"><div className="tu-skeleton" style={{ height: 240, borderRadius: 12 }} /></div>;

  const notVisited = ordered.filter(({ row }) => !row.visitsToday).length;

  return (
    <div className="px-4 py-5 sm:p-8 flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs text-[var(--tu-text-subtle)]"><Link href={`/accounts/${accountId}/assets`} className="tu-link">Assets</Link> ›</p>
          <h2 className="text-lg font-bold text-[var(--tu-text-heading)]">Locations</h2>
        </div>
        <div className="tu-page-actions">
          {isStaff && (
            <button
              type="button"
              onClick={() => setNotVisitedOnly((v) => !v)}
              aria-pressed={notVisitedOnly}
              className={notVisitedOnly ? "tu-btn-primary" : "tu-btn-secondary"}
            >
              Not scanned today ({notVisited})
            </button>
          )}
          {isStaff && (
            <Link href={`/print/accounts/${accountId}/locations/labels`} target="_blank" className="tu-btn-secondary">Print all stickers</Link>
          )}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="tu-card tu-card-pad text-sm text-[var(--tu-text-subtle)]">
          No locations yet. Add them with <strong>Manage locations</strong> on the Assets page.
        </div>
      ) : (
        <div className="tu-card tu-scroll-x">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-[var(--tu-text-subtle)] border-b border-[var(--tu-border)]">
                <th className="px-5 py-3 font-semibold">Location</th>
                <th className="px-3 py-3 font-semibold text-right">Open jobs</th>
                <th className="px-3 py-3 font-semibold text-right">Last {repeatDays} days</th>
                {isStaff && <th className="px-3 py-3 font-semibold text-right">Scans today</th>}
                {isStaff && <th className="px-5 py-3 font-semibold">Last scanned</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--tu-border)]">
              {shown.map(({ row, depth }) => (
                <tr key={row.id}>
                  <td className="px-5 py-3">
                    <Link href={`/accounts/${accountId}/assets/locations/${row.id}`} className="hover:underline" style={{ paddingLeft: depth ? 18 : 0 }}>
                      {depth > 0 && notVisitedOnly && <span className="text-[var(--tu-text-subtle)]">{parentName(row.parentId)} / </span>}
                      <span className={depth ? "" : "font-semibold text-[var(--tu-text-heading)]"}>{row.name}</span>
                    </Link>
                  </td>
                  <td className="px-3 py-3 text-right tu-figure">{row.openJobs}</td>
                  <td className="px-3 py-3 text-right">
                    <span className="tu-figure">{row.recentJobs}</span>
                    {row.repeatFlagged && <span className="tu-badge tu-badge-warning ml-2" title="Work keeps coming back here">Repeat</span>}
                  </td>
                  {isStaff && <td className="px-3 py-3 text-right tu-figure">{row.visitsToday ?? 0}</td>}
                  {isStaff && (
                    <td className="px-5 py-3 text-[var(--tu-text-subtle)]">{row.lastVisitAt ? fmtTime(row.lastVisitAt) : "Never"}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {shown.length === 0 && <p className="tu-card-pad text-sm text-[var(--tu-text-subtle)]">Every place has been scanned today.</p>}
        </div>
      )}
    </div>
  );
}
