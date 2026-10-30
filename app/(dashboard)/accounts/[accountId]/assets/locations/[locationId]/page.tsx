"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import api, { errorMessage } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { FIELD_STAFF, MANAGERS, STAFF, hasRole } from "@/lib/rbac";
import { useConfirm } from "@/components/ConfirmDialog";
import Attachments from "@/components/Attachments";
import { startLoad } from "@/lib/startLoad";
import type { AssetLocationRef } from "@/lib/assetLocations";
import { assetHealthMeta, roleLabel, workOrderPriorityMeta, workOrderStatusFor } from "@/lib/statuses";
import { isOverdue, workOrderRef } from "@/lib/workOrders";
import { getPeriodStart, pmSchedule, scheduleLabel } from "@/lib/pmPeriod";
import { pmControlNumber } from "@/lib/pmControlNumber";
import type { WorkOrderStatus } from "@/lib/statuses";

type Job = {
  id: string;
  number: number;
  title: string;
  status: WorkOrderStatus;
  priority: string;
  dueDate: string | null;
  completedAt: string | null;
  acceptedAt: string | null;
  asset: { id: string; name: string } | null;
  location: AssetLocationRef | null;
  assignments: { employee: { id: string; name: string } }[];
};

type Overview = {
  location: AssetLocationRef & { children: { id: string; name: string }[] };
  account: { id: string; name: string };
  assets: { id: string; name: string; assetCode: string | null; category: string; health: string; location: AssetLocationRef | null }[];
  openWork: Job[];
  recentWork: Job[];
  checklists: {
    id: string;
    startDate: string;
    checklist: { id: string; name: string; frequency: string; intervalDays: number | null };
    asset: { id: string; name: string } | null;
    location: AssetLocationRef | null;
    lastRound: { id: string; scheduledDate: string; completedAt: string; isLate: boolean } | null;
  }[];
  recentRounds: {
    id: string; number: number; createdAt: string; scheduledDate: string; completedAt: string; isLate: boolean;
    performedByName: string; accountChecklistId: string; accountChecklist: { checklist: { name: string } };
    /** Staff only. */
    scannedOnSite?: boolean | null;
  }[];
  repeat: { jobs: number; days: number; flagged: boolean };
  /** Staff only: who scanned the sticker, newest first. */
  visits?: { id: string; userName: string; userRole: string; createdAt: string; locationId: string }[];
};

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";

/**
 * One place on a site — what the QR sticker on its wall opens. What is here,
 * what is being done here, what was done here, and the rounds walked here. A
 * building includes its floors. The API reads each list with the viewer's
 * usual share (a technician's jobs only, no cost for anyone), so this page
 * draws what it is given.
 */
export default function LocationPage() {
  const { accountId, locationId } = useParams<{ accountId: string; locationId: string }>();
  const { user } = useAuth();
  const isStaff = hasRole(user?.role, STAFF);
  const canFillIn = hasRole(user?.role, FIELD_STAFF);
  const isClient = user?.role === "CLIENT";
  const isManager = hasRole(user?.role, MANAGERS);
  const confirm = useConfirm();

  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Opened from the sticker (its URL carries ?scan=1): that is a visit, and
  // the API records it. Opening the page from a desk records nothing.
  const scanned = useSearchParams().get("scan") === "1";
  const [visitNote, setVisitNote] = useState<string | null>(null);

  const recordScan = useCallback(async () => {
    if (!scanned) return;
    try {
      const res = await api.post(`/accounts/${accountId}/asset-locations/${locationId}/visits`);
      setVisitNote(res.data.recorded ? `Visit recorded at ${fmtTime(res.data.visitedAt)}.` : `Visit already recorded at ${fmtTime(res.data.visitedAt)}.`);
    } catch {
      setVisitNote(null);
    }
  }, [scanned, accountId, locationId]);
  useEffect(() => startLoad(recordScan), [recordScan]);

  const load = useCallback(async () => {
    try {
      const res = await api.get(`/accounts/${accountId}/asset-locations/${locationId}`);
      setData(res.data);
      setError(null);
    } catch (err) {
      setError(errorMessage(err, "Couldn't load this location."));
    }
  }, [accountId, locationId]);
  useEffect(() => startLoad(load), [load]);

  if (error && !data) return <div className="px-4 py-5 sm:p-8"><div className="tu-error-banner" role="alert">{error}</div></div>;
  if (!data) {
    return (
      <div className="px-4 py-5 sm:p-8 flex flex-col gap-4">
        <div className="tu-skeleton" style={{ height: 110, borderRadius: 12 }} />
        <div className="tu-skeleton" style={{ height: 240, borderRadius: 12 }} />
      </div>
    );
  }

  const { location } = data;

  // A sticker photographed and shared, or a place being spammed: a new code
  // kills every printed copy of the old one at once.
  async function replaceSticker() {
    if (!(await confirm({
      title: "Replace this place's sticker?",
      message: "The sticker on the wall will stop working straight away. Print the new one and put it up in its place.",
      confirmLabel: "Replace sticker",
    }))) return;
    try {
      await api.post(`/accounts/${accountId}/asset-locations/${locationId}/report-code`);
      window.open(`/print/accounts/${accountId}/locations/labels?location=${locationId}`, "_blank");
    } catch (err) {
      setError(errorMessage(err, "Couldn't replace the sticker."));
    }
  }
  // Clients raise requests from the portal; everyone else from the queue.
  const reportHref = isClient
    ? `/accounts/${accountId}/portal?locationId=${location.id}`
    : `/accounts/${accountId}/work-orders?locationId=${location.id}`;
  const sub = (l: AssetLocationRef | null) => (l && l.id !== location.id ? l.name : null);

  return (
    <div className="px-4 py-5 sm:p-8 flex flex-col gap-5">
      {error && <div className="tu-action-error" role="alert"><span>{error}</span></div>}
      {visitNote && <div className="rounded-lg px-4 py-2.5 text-sm bg-[var(--tu-soft-success)] text-[var(--tu-on-success)] border border-[var(--tu-bd-success)]" role="status">{visitNote}</div>}
      {data.repeat.flagged && (
        <div className="rounded-lg px-4 py-2.5 text-sm bg-[var(--tu-soft-warning)] text-[var(--tu-on-warning)] border border-[var(--tu-bd-warning)]" role="status">
          {data.repeat.jobs} jobs raised here in the last {data.repeat.days} days — this may be a recurring problem worth a closer look.
        </div>
      )}
      <section className="tu-card">
        <div className="tu-card-pad" style={{ paddingTop: 20 }}>
          <p className="text-xs text-[var(--tu-text-subtle)] mb-1">
            <Link href={`/accounts/${accountId}/assets`} className="tu-link">Assets</Link>
            {location.parent && (
              <> › <Link href={`/accounts/${accountId}/assets/locations/${location.parent.id}`} className="tu-link">{location.parent.name}</Link></>
            )}
          </p>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div style={{ minWidth: 0 }}>
              <h1 className="tu-card-title" style={{ fontSize: 22 }}>{location.name}</h1>
              <p className="text-sm text-[var(--tu-text-subtle)]">
                {data.account.name}{location.parent ? ` · ${location.parent.name}` : ""}
              </p>
            </div>
            <div className="tu-page-actions">
              {isStaff && (
                <Link href={`/print/accounts/${accountId}/locations/labels?location=${location.id}`} target="_blank" className="tu-btn-secondary">
                  Print QR sticker
                </Link>
              )}
              {isManager && (
                <button type="button" className="tu-btn-secondary" onClick={replaceSticker}>Replace sticker</button>
              )}
              <Link href={reportHref} className="tu-btn-primary">Report a problem here</Link>
            </div>
          </div>
          <div className="flex flex-wrap gap-4 mt-4 text-sm">
            <span><strong className="tu-figure">{data.openWork.length}</strong> open job{data.openWork.length === 1 ? "" : "s"}</span>
            <span><strong className="tu-figure">{data.assets.length}</strong> asset{data.assets.length === 1 ? "" : "s"}</span>
            <span><strong className="tu-figure">{data.checklists.length}</strong> checklist{data.checklists.length === 1 ? "" : "s"}</span>
          </div>
          {location.children.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-4">
              {location.children.map((c) => (
                <Link key={c.id} href={`/accounts/${accountId}/assets/locations/${c.id}`} className="tu-badge tu-badge-neutral">{c.name}</Link>
              ))}
            </div>
          )}
        </div>
      </section>

      <p className="text-sm -mb-2">
        <Link href={`/accounts/${accountId}/work-orders?location=${location.id}`} className="tu-link">See all work here in the queue →</Link>
      </p>

      <JobList
        title="Open work"
        empty="Nothing open here."
        jobs={data.openWork}
        accountId={accountId}
        sub={sub}
        right={(j) => (
          <span className={isOverdue(j) ? "text-[var(--tu-on-danger)]" : undefined}>
            {j.dueDate ? `Due ${fmt(j.dueDate)}` : "No due date"}
          </span>
        )}
      />

      <JobList
        title="Recently finished"
        empty="No finished work recorded here yet."
        jobs={data.recentWork}
        accountId={accountId}
        sub={sub}
        right={(j) => (
          <span>
            {fmt(j.completedAt)}
            {j.assignments.length > 0 && <> · {j.assignments.map((a) => a.employee.name).join(", ")}</>}
          </span>
        )}
      />

      <section className="tu-card">
        <div className="tu-card-header"><h2 className="tu-card-title">Checklists walked here</h2></div>
        {data.checklists.length === 0 ? (
          <p className="tu-card-pad text-sm text-[var(--tu-text-subtle)]">No checklists are placed here.</p>
        ) : (
          <ul className="divide-y divide-[var(--tu-border)]">
            {data.checklists.map((c) => {
              const schedule = pmSchedule(c.checklist, c);
              const done = c.lastRound && new Date(c.lastRound.scheduledDate) >= getPeriodStart(schedule);
              const name = (
                <>
                  <span className="font-semibold text-[var(--tu-text-heading)]">{c.checklist.name}</span>
                  {c.asset && <span className="text-[var(--tu-text-subtle)]"> › {c.asset.name}</span>}
                </>
              );
              return (
                <li key={c.id} className="px-5 py-3 flex flex-wrap items-center justify-between gap-2 text-sm">
                  <div style={{ minWidth: 0 }}>
                    {canFillIn ? <Link href={`/accounts/${accountId}/checklists/${c.id}`} className="hover:underline">{name}</Link> : name}
                    <p className="text-xs text-[var(--tu-text-subtle)]">
                      {scheduleLabel(schedule)}
                      {sub(c.location) ? ` · ${sub(c.location)}` : ""}
                      {` · Last round ${c.lastRound ? fmt(c.lastRound.completedAt) : "never"}`}
                    </p>
                  </div>
                  <span className={done ? "tu-badge tu-badge-success" : "tu-badge tu-badge-warning"}>
                    {done ? "Done this period" : "Due this period"}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        {data.recentRounds.length > 0 && (
          <>
            <div className="tu-card-header" style={{ borderTop: "1px solid var(--tu-border)" }}>
              <h3 className="tu-card-title" style={{ fontSize: 14 }}>Recent rounds</h3>
            </div>
            <ul className="divide-y divide-[var(--tu-border)]">
              {data.recentRounds.map((r) => (
                <li key={r.id} className="px-5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span>
                    <span className="tu-wo-ref">{pmControlNumber(r)}</span>{" "}
                    {r.accountChecklist.checklist.name}
                    {r.isLate && <span className="tu-badge tu-badge-warning ml-2">Late</span>}
                    {r.scannedOnSite === true && <span className="tu-badge tu-badge-success ml-2">✓ Scanned on site</span>}
                    {r.scannedOnSite === false && <span className="tu-badge tu-badge-neutral ml-2">Not scanned</span>}
                  </span>
                  <span className="text-xs text-[var(--tu-text-subtle)]">{fmt(r.completedAt)} · {r.performedByName}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {/* Photos and documents of the place: how it should look, a floor
          plan, an access map. Anyone on the site may add; staff archive. */}
      <section className="tu-card tu-card-pad">
        <Attachments parent="asset-locations" parentId={location.id} canUpload canDelete={isStaff} />
      </section>

      {data.visits && (
        <section className="tu-card">
          <div className="tu-card-header"><h2 className="tu-card-title">Sticker scans</h2></div>
          {data.visits.length === 0 ? (
            <p className="tu-card-pad text-sm text-[var(--tu-text-subtle)]">Nobody has scanned this place&apos;s sticker yet.</p>
          ) : (
            <ul className="divide-y divide-[var(--tu-border)]">
              {data.visits.map((v) => (
                <li key={v.id} className="px-5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span>
                    <span className="font-semibold text-[var(--tu-text-heading)]">{v.userName}</span>
                    <span className="text-[var(--tu-text-subtle)]"> · {roleLabel(v.userRole)}{v.locationId !== location.id && location.children.length ? ` · ${location.children.find((c) => c.id === v.locationId)?.name ?? ""}` : ""}</span>
                  </span>
                  <span className="text-xs text-[var(--tu-text-subtle)]">{fmtTime(v.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="tu-card">
        <div className="tu-card-header"><h2 className="tu-card-title">Assets here</h2></div>
        {data.assets.length === 0 ? (
          <p className="tu-card-pad text-sm text-[var(--tu-text-subtle)]">No assets are filed here.</p>
        ) : (
          <ul className="divide-y divide-[var(--tu-border)]">
            {data.assets.map((a) => {
              const health = assetHealthMeta(a.health);
              return (
                <li key={a.id} className="px-5 py-3 flex flex-wrap items-center justify-between gap-2 text-sm">
                  <div style={{ minWidth: 0 }}>
                    <Link href={`/accounts/${accountId}/assets/${a.id}`} className="font-semibold text-[var(--tu-text-heading)] hover:underline">{a.name}</Link>
                    <p className="text-xs text-[var(--tu-text-subtle)]">
                      {[a.assetCode, a.category, sub(a.location)].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <span className={health.badge}>{health.label}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function JobList({
  title, empty, jobs, accountId, sub, right,
}: {
  title: string;
  empty: string;
  jobs: Job[];
  accountId: string;
  sub: (l: AssetLocationRef | null) => string | null;
  right: (j: Job) => React.ReactNode;
}) {
  return (
    <section className="tu-card">
      <div className="tu-card-header"><h2 className="tu-card-title">{title}</h2></div>
      {jobs.length === 0 ? (
        <p className="tu-card-pad text-sm text-[var(--tu-text-subtle)]">{empty}</p>
      ) : (
        <ul className="divide-y divide-[var(--tu-border)]">
          {jobs.map((j) => {
            const status = workOrderStatusFor(j);
            const pri = workOrderPriorityMeta(j.priority);
            return (
              <li key={j.id} className="px-5 py-3 flex flex-wrap items-center justify-between gap-2 text-sm">
                <div style={{ minWidth: 0 }}>
                  <Link href={`/accounts/${accountId}/work-orders/${j.id}`} className="hover:underline">
                    <span className="tu-wo-ref">{workOrderRef(j.number)}</span>{" "}
                    <span className="font-semibold text-[var(--tu-text-heading)]">{j.title}</span>
                  </Link>
                  <p className="text-xs text-[var(--tu-text-subtle)]">
                    {[j.asset?.name, sub(j.location)].filter(Boolean).join(" · ")}
                    {(j.asset || sub(j.location)) && " · "}
                    {right(j)}
                  </p>
                </div>
                <span className="flex items-center gap-2">
                  <span className={pri.badge}>{pri.label}</span>
                  <span className={status.badge}>{status.label}</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

