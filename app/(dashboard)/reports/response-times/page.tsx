"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import api from "@/lib/api";
import Breadcrumbs from "@/components/Breadcrumbs";
import AccountFilter, { type FilterAccount } from "@/components/AccountFilter";
import EmptyState from "@/components/EmptyState";
import { workOrderRef } from "@/lib/workOrders";
import { WORK_ORDER_PRIORITY, WORK_ORDER_STATUS, type WorkOrderPriority, type WorkOrderStatus } from "@/lib/statuses";
import { formatMinutes } from "@/lib/durations";
import { PrintReportButton, PrintReportHeader, dateRangeLabel, siteScope } from "@/components/ReportPrint";

/**
 * How quickly work is answered: from raised to accepted, started and
 * completed — medians, with the 90th percentile where the slow tail shows.
 * Every figure comes from GET /reports/response-times
 * (backend/helpers/responseTimes.js); this page only lays it out.
 */

type Stat = { count: number; median: number | null; p90: number | null };
type Block = { jobs: number; toAccept: Stat; toStart: Stat; toComplete: Stat };
type Report = {
  totals: Block;
  byPriority: (Block & { priority: WorkOrderPriority })[];
  bySite: (Block & { account: { id: string; name: string } })[];
  longestWaiting: {
    id: string; number: number; title: string; priority: WorkOrderPriority; status: WorkOrderStatus;
    account: { id: string; name: string }; waitingMinutes: number;
  }[];
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

function Cell({ stat }: { stat: Stat }) {
  if (!stat.count) return <td className="tu-center"><span className="tu-figure-zero">—</span></td>;
  return (
    <td className="tu-center">
      <span className="tu-figure">{formatMinutes(stat.median)}</span>
      <span className="tu-person-muted" style={{ display: "block", fontSize: 11 }}>
        90%: {formatMinutes(stat.p90)} · {stat.count}
      </span>
    </td>
  );
}

function Tile({ label, stat, note }: { label: string; stat: Stat; note: string }) {
  return (
    <div className="tu-stat-card">
      <p className="tu-stat-label">{label}</p>
      <p className="tu-stat-value">{formatMinutes(stat.median)}</p>
      <p className="tu-stat-sub">
        {stat.count ? `90% within ${formatMinutes(stat.p90)} · ${stat.count} job${stat.count === 1 ? "" : "s"}` : note}
      </p>
    </div>
  );
}

export default function ResponseTimesPage() {
  const [range, setRange] = useState<RangeKey>("30");
  const [accounts, setAccounts] = useState<FilterAccount[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
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
      .get(`/reports/response-times?${query}`)
      .then((res) => { if (!cancelled) { setData(res.data); setError(false); } })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [query]);

  const t = data?.totals;
  const shown = rangeDates(range);

  return (
    <div className="tu-page">
      <PrintReportHeader
        title="Response times"
        scope={siteScope(selected, accounts)}
        period={dateRangeLabel(shown.from, shown.to)}
      />
      <div className="tu-no-print">
        <Breadcrumbs items={[{ label: "Reports", href: "/reports" }, { label: "Response times" }]} />
      </div>

      <div className="tu-page-header">
        <div>
          <h1 className="tu-page-title tu-no-print">Response times</h1>
          <p className="tu-page-sub">
            How long jobs raised in the period took to be accepted, started and completed. Typical (median) time,
            and the time 90% of jobs were within. Maintenance-plan work is not counted — it runs to its schedule.
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
          {t && t.jobs === 0 ? (
            <div className="tu-card" style={{ marginBottom: 24 }}>
              <EmptyState icon="activity" title="No jobs raised in this period" hint="Pick a longer period, or another site." />
            </div>
          ) : (
            <>
              <div className="tu-kpi-grid">
                <Tile label="Time to accept" stat={t!.toAccept} note="No client requests in this period" />
                <Tile label="Time to start" stat={t!.toStart} note="Nothing started yet" />
                <Tile label="Time to complete" stat={t!.toComplete} note="Nothing completed yet" />
              </div>
              <p className="tu-person-muted" style={{ margin: "-8px 0 20px", fontSize: 12 }}>
                Time to accept counts client requests and special projects only — staff work is accepted the moment it is raised.
              </p>

              <section className="tu-card" style={{ marginBottom: 24 }}>
                <div className="tu-card-header"><h2 className="tu-card-title">By priority</h2></div>
                <div className="tu-scroll-x">
                  <table className="tu-table">
                    <thead>
                      <tr>
                        <th scope="col">Priority</th>
                        <th scope="col" className="tu-center">Jobs</th>
                        <th scope="col" className="tu-center">To accept</th>
                        <th scope="col" className="tu-center">To start</th>
                        <th scope="col" className="tu-center">To complete</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.byPriority.map((p) => (
                        <tr key={p.priority}>
                          <td><span className={WORK_ORDER_PRIORITY[p.priority]?.badge}>{WORK_ORDER_PRIORITY[p.priority]?.label ?? p.priority}</span></td>
                          <td className="tu-center">{p.jobs}</td>
                          <Cell stat={p.toAccept} />
                          <Cell stat={p.toStart} />
                          <Cell stat={p.toComplete} />
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
                        <th scope="col" className="tu-center">To accept</th>
                        <th scope="col" className="tu-center">To start</th>
                        <th scope="col" className="tu-center">To complete</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.bySite.map((s) => (
                        <tr key={s.account.id}>
                          <td className="tu-strong">{s.account.name}</td>
                          <td className="tu-center">{s.jobs}</td>
                          <Cell stat={s.toAccept} />
                          <Cell stat={s.toStart} />
                          <Cell stat={s.toComplete} />
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}

          <section className="tu-card">
            <div className="tu-card-header">
              <h2 className="tu-card-title">Waiting longest to start</h2>
            </div>
            <p className="tu-person-muted" style={{ padding: "0 24px", fontSize: 12 }}>
              Open jobs not started yet, whenever they were raised.
            </p>
            {data.longestWaiting.length === 0 ? (
              <p className="tu-person-empty">Nothing is waiting — every open job has been started.</p>
            ) : (
              <table className="tu-table">
                <thead>
                  <tr>
                    <th scope="col">Job</th>
                    <th scope="col">Site</th>
                    <th scope="col">Priority</th>
                    <th scope="col">Status</th>
                    <th scope="col" className="tu-center">Waiting</th>
                  </tr>
                </thead>
                <tbody>
                  {data.longestWaiting.map((w) => (
                    <tr key={w.id}>
                      <td>
                        <Link href={`/accounts/${w.account.id}/work-orders/${w.id}`} className="tu-row-link">
                          {workOrderRef(w.number)} · {w.title}
                        </Link>
                      </td>
                      <td>{w.account.name}</td>
                      <td><span className={WORK_ORDER_PRIORITY[w.priority]?.badge}>{WORK_ORDER_PRIORITY[w.priority]?.label ?? w.priority}</span></td>
                      <td><span className={WORK_ORDER_STATUS[w.status]?.badge}>{WORK_ORDER_STATUS[w.status]?.label ?? w.status}</span></td>
                      <td className="tu-center"><span className="tu-figure">{formatMinutes(w.waitingMinutes)}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}
    </div>
  );
}
