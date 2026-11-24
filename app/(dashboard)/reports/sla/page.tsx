"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import api from "@/lib/api";
import Breadcrumbs from "@/components/Breadcrumbs";
import AccountFilter, { type FilterAccount } from "@/components/AccountFilter";
import EmptyState from "@/components/EmptyState";
import { workOrderRef } from "@/lib/workOrders";
import { WORK_ORDER_PRIORITY, WORK_ORDER_STATUS, type WorkOrderPriority, type WorkOrderStatus } from "@/lib/statuses";
import { formatMinutes } from "@/lib/durations";
import { describeTarget, metLabel, type SiteSlaTargets, type SlaBlock, type SlaState, type SlaTally } from "@/lib/sla";
import { PrintReportButton, PrintReportHeader, dateRangeLabel, siteScope } from "@/components/ReportPrint";

/**
 * Service levels: of the jobs raised in the period, how many started and
 * finished within their site's targets, the breaches, and open work past a
 * target right now. Every figure comes from GET /reports/sla
 * (backend/helpers/sla.js); this page lays it out. Targets are set on each
 * site's profile.
 */

type JobRow = {
  id: string; number: number; title: string; priority: WorkOrderPriority; status: WorkOrderStatus;
  account: { id: string; name: string | null };
  createdAt: string; startedAt: string | null; completedAt: string | null;
  respond: SlaState; resolve: SlaState; respondBy: string | null; resolveBy: string | null;
  lateMinutes?: number;
};
type Report = {
  totals: SlaBlock;
  byPriority: (SlaBlock & { priority: WorkOrderPriority })[];
  bySite: (SlaBlock & { account: { id: string; name: string }; targets: SiteSlaTargets })[];
  breaches: { count: number; rows: JobRow[] };
  breachingNow: { count: number; rows: JobRow[] };
};

type RangeKey = "MONTH" | "30" | "90" | "YEAR";
const RANGES: { key: RangeKey; label: string }[] = [
  { key: "MONTH", label: "This month" },
  { key: "30", label: "Last 30 days" },
  { key: "90", label: "Last 90 days" },
  { key: "YEAR", label: "This year" },
];
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
function rangeDates(key: RangeKey) {
  const today = new Date();
  const from = new Date(today);
  if (key === "MONTH") from.setDate(1);
  else if (key === "YEAR") { from.setMonth(0); from.setDate(1); }
  else from.setDate(today.getDate() - Number(key) + 1);
  return { from: ymd(from), to: ymd(today) };
}

/** Below this share met, a figure is shown as needing a look. */
const WARN_BELOW = 90;
const fmtWhen = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

function MetCell({ t }: { t: SlaTally }) {
  const decided = t.met + t.breached;
  if (!decided) return <td className="tu-center"><span className="tu-figure-zero">—</span></td>;
  return (
    <td className="tu-center">
      <span className="tu-figure" style={t.metPct != null && t.metPct < WARN_BELOW ? { color: "var(--tu-on-warning)" } : undefined}>
        {metLabel(t)}
      </span>
      <span className="tu-person-muted" style={{ display: "block", fontSize: 11 }}>
        {t.met} of {decided}{t.open ? ` · ${t.open} in time` : ""}
      </span>
    </td>
  );
}

function Tile({ label, t, sub }: { label: string; t: SlaTally; sub: string }) {
  const decided = t.met + t.breached;
  return (
    <div className="tu-stat-card">
      <p className="tu-stat-label">{label}</p>
      <p className="tu-stat-value" style={t.metPct != null && t.metPct < WARN_BELOW ? { color: "var(--tu-on-warning)" } : undefined}>
        {metLabel(t)}
      </p>
      <p className="tu-stat-sub">{decided ? `${t.met} of ${decided} jobs ${sub}` : "Nothing to measure yet"}</p>
    </div>
  );
}

function Missed({ row }: { row: JobRow }) {
  const parts = [
    row.respond === "breached" && `started late (due ${row.respondBy ? fmtWhen(row.respondBy) : "—"})`,
    row.resolve === "breached" && `finished late (due ${row.resolveBy ? fmtWhen(row.resolveBy) : "—"})`,
  ].filter(Boolean);
  return <>{parts.join(" · ")}</>;
}

function SlaReport() {
  const params = useSearchParams();
  const [range, setRange] = useState<RangeKey>("30");
  const [accounts, setAccounts] = useState<FilterAccount[]>([]);
  // Opened from a site's profile with ?accountIds=<id>: start on that site.
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set((params.get("accountIds") ?? "").split(",").filter(Boolean)),
  );
  const [data, setData] = useState<Report | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    api.get("/accounts").then((res) => setAccounts(res.data)).catch(() => {});
  }, []);

  const query = useMemo(() => {
    const { from, to } = rangeDates(range);
    const q = new URLSearchParams({ from, to });
    if (selected.size) q.set("accountIds", [...selected].join(","));
    return q.toString();
  }, [range, selected]);

  useEffect(() => {
    let cancelled = false;
    api
      .get(`/reports/sla?${query}`)
      .then((res) => { if (!cancelled) { setData(res.data); setError(false); } })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [query]);

  const t = data?.totals;
  const shown = rangeDates(range);

  return (
    <div className="tu-page">
      <PrintReportHeader title="Service levels" scope={siteScope(selected, accounts)} period={dateRangeLabel(shown.from, shown.to)} />
      <div className="tu-no-print">
        <Breadcrumbs items={[{ label: "Reports", href: "/reports" }, { label: "Service levels" }]} />
      </div>

      <div className="tu-page-header">
        <div>
          <h1 className="tu-page-title tu-no-print">Service levels</h1>
          <p className="tu-page-sub">
            Of the jobs raised in the period, how many started (response) and were finished (resolution) within their
            site&apos;s targets — set on each site&apos;s profile, or the company defaults. Calendar time from when the
            job was raised. Maintenance-plan work and rejected jobs are not measured.
          </p>
        </div>
        <div className="tu-no-print">
          <PrintReportButton disabled={!data} />
        </div>
      </div>

      <div className="tu-toolbar tu-no-print" style={{ flexWrap: "wrap", gap: 12 }}>
        <div className="tu-chip-row" role="group" aria-label="Period">
          {RANGES.map((r) => (
            <button key={r.key} type="button" className="tu-chip-toggle" aria-pressed={range === r.key} onClick={() => setRange(r.key)}>
              {r.label}
            </button>
          ))}
        </div>
        {accounts.length > 1 && <AccountFilter accounts={accounts} selected={selected} onChange={setSelected} />}
      </div>

      {error && <div className="tu-error-banner" role="alert">Couldn&apos;t load the report.</div>}

      {!data ? (
        !error && <div className="tu-skeleton" style={{ height: 120 }} />
      ) : (
        <>
          <section className="tu-card" style={{ marginBottom: 24 }}>
            <div className="tu-card-header">
              <h2 className="tu-card-title">Past a target now{data.breachingNow.count ? ` (${data.breachingNow.count})` : ""}</h2>
            </div>
            <p className="tu-person-muted" style={{ padding: "0 24px", fontSize: 12 }}>
              Open jobs already late to start or to finish, whenever they were raised — most overdue first.
            </p>
            {data.breachingNow.rows.length === 0 ? (
              <p className="tu-person-empty">Nothing open is past its target.</p>
            ) : (
              <div className="tu-scroll-x">
                <table className="tu-table">
                  <thead>
                    <tr>
                      <th scope="col">Job</th>
                      <th scope="col">Site</th>
                      <th scope="col">Priority</th>
                      <th scope="col">Status</th>
                      <th scope="col">Missed</th>
                      <th scope="col" className="tu-center">Late by</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.breachingNow.rows.map((r) => (
                      <tr key={r.id}>
                        <td>
                          <Link href={`/accounts/${r.account.id}/work-orders/${r.id}`} className="tu-row-link">
                            {workOrderRef(r.number)} · {r.title}
                          </Link>
                        </td>
                        <td>{r.account.name}</td>
                        <td><span className={WORK_ORDER_PRIORITY[r.priority]?.badge}>{WORK_ORDER_PRIORITY[r.priority]?.label ?? r.priority}</span></td>
                        <td><span className={WORK_ORDER_STATUS[r.status]?.badge}>{WORK_ORDER_STATUS[r.status]?.label ?? r.status}</span></td>
                        <td className="text-[var(--tu-text-subtle)]" style={{ fontSize: 13 }}><Missed row={r} /></td>
                        <td className="tu-center"><span className="tu-figure" style={{ color: "var(--tu-on-danger)" }}>{formatMinutes(r.lateMinutes ?? 0)}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {t && t.jobs === 0 ? (
            <div className="tu-card" style={{ marginBottom: 24 }}>
              <EmptyState icon="activity" title="No jobs raised in this period" hint="Pick a longer period, or another site." />
            </div>
          ) : (
            <>
              <div className="tu-kpi-grid">
                <Tile label="Response met" t={t!.respond} sub="started in time" />
                <Tile label="Resolution met" t={t!.resolve} sub="finished in time" />
                <div className="tu-stat-card">
                  <p className="tu-stat-label">Jobs measured</p>
                  <p className="tu-stat-value">{t!.jobs}</p>
                  <p className="tu-stat-sub">
                    {t!.resolve.open ? `${t!.resolve.open} still open and in time` : "Raised in the period"}
                  </p>
                </div>
              </div>

              <section className="tu-card" style={{ marginBottom: 24 }}>
                <div className="tu-card-header"><h2 className="tu-card-title">By priority</h2></div>
                <div className="tu-scroll-x">
                  <table className="tu-table">
                    <thead>
                      <tr>
                        <th scope="col">Priority</th>
                        <th scope="col" className="tu-center">Jobs</th>
                        <th scope="col" className="tu-center">Response met</th>
                        <th scope="col" className="tu-center">Resolution met</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.byPriority.map((p) => (
                        <tr key={p.priority}>
                          <td><span className={WORK_ORDER_PRIORITY[p.priority]?.badge}>{WORK_ORDER_PRIORITY[p.priority]?.label ?? p.priority}</span></td>
                          <td className="tu-center">{p.jobs}</td>
                          <MetCell t={p.respond} />
                          <MetCell t={p.resolve} />
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="tu-card" style={{ marginBottom: 24 }}>
                <div className="tu-card-header"><h2 className="tu-card-title">By site</h2></div>
                <div className="tu-scroll-x">
                  <table className="tu-table">
                    <thead>
                      <tr>
                        <th scope="col">Site</th>
                        <th scope="col" className="tu-center">Jobs</th>
                        <th scope="col" className="tu-center">Response met</th>
                        <th scope="col" className="tu-center">Resolution met</th>
                        <th scope="col">Targets (Critical)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.bySite.map((s) => {
                        const crit = s.targets.CRITICAL;
                        return (
                          <tr key={s.account.id}>
                            <td className="tu-strong" style={{ whiteSpace: "nowrap" }}>
                              <Link href={`/accounts/${s.account.id}/profile`} className="tu-row-link">{s.account.name}</Link>
                            </td>
                            <td className="tu-center">{s.jobs}</td>
                            <MetCell t={s.respond} />
                            <MetCell t={s.resolve} />
                            <td className="text-[var(--tu-text-subtle)]" style={{ fontSize: 13 }}>
                              start {describeTarget(crit.respondMinutes)} · finish {describeTarget(crit.resolveMinutes)}
                              {Object.values(s.targets).some((x) => x.custom) ? "" : " · defaults"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="tu-card">
                <div className="tu-card-header">
                  <h2 className="tu-card-title">Missed in this period{data.breaches.count ? ` (${data.breaches.count})` : ""}</h2>
                </div>
                {data.breaches.rows.length === 0 ? (
                  <p className="tu-person-empty">Every job raised in the period met its targets so far.</p>
                ) : (
                  <div className="tu-scroll-x">
                    <table className="tu-table">
                      <thead>
                        <tr>
                          <th scope="col">Job</th>
                          <th scope="col">Site</th>
                          <th scope="col">Priority</th>
                          <th scope="col">Raised</th>
                          <th scope="col">Missed</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.breaches.rows.map((r) => (
                          <tr key={r.id}>
                            <td>
                              <Link href={`/accounts/${r.account.id}/work-orders/${r.id}`} className="tu-row-link">
                                {workOrderRef(r.number)} · {r.title}
                              </Link>
                            </td>
                            <td>{r.account.name}</td>
                            <td><span className={WORK_ORDER_PRIORITY[r.priority]?.badge}>{WORK_ORDER_PRIORITY[r.priority]?.label ?? r.priority}</span></td>
                            <td style={{ whiteSpace: "nowrap" }}>{fmtWhen(r.createdAt)}</td>
                            <td className="text-[var(--tu-text-subtle)]" style={{ fontSize: 13 }}><Missed row={r} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {data.breaches.count > data.breaches.rows.length && (
                  <p className="tu-person-muted" style={{ padding: "8px 24px 16px", fontSize: 12 }}>
                    Showing the newest {data.breaches.rows.length} of {data.breaches.count}.
                  </p>
                )}
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}

export default function SlaReportPage() {
  return (
    <Suspense fallback={null}>
      <SlaReport />
    </Suspense>
  );
}
