"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { csvBuilder } from "@/lib/csv";
import PmExportDialog from "@/components/PmExportDialog";
import api from "@/lib/api";
import AccountFilter from "@/components/AccountFilter";
import { NEEDS_ATTENTION_LABEL } from "@/lib/statuses";
import { startLoad } from "@/lib/startLoad";
import { PrintReportButton, PrintReportHeader, siteScope } from "@/components/ReportPrint";
import { WO_STATUS } from "@/lib/dashboardModel";
import type { WorkOrderStatus } from "@/lib/statuses";
import { StackedBar } from "@/components/charts";

type Period = "today" | "week" | "month";

type AccountSummary = {
  id: string;
  name: string;
  openWorkOrders: number;
  requestedWorkOrders: number;
  overdueWorkOrders: number;
  poorHealthAssets: number;
  checklistsDone: number;
  checklistsTotal: number;
  attendancePresent: number;
  attendanceTotal: number;
};

type DashboardData = {
  // Every status, from the shared union — a hand-written list here once left
  // APPROVED out, so the breakdown summed short of its own total.
  workOrders: Record<WorkOrderStatus, number>;
  assets: { FUNCTIONAL: number; FUNCTIONAL_WITH_FINDINGS: number; BREAKDOWN: number };
  overdueWorkOrders: number;
  poorHealthAssets: number;
  attendance: { present: number; absent: number };
  checklists: { completed: number; total: number };
  accounts: AccountSummary[];
};

type EmployeeReport = {
  id: string;
  name: string;
  position: string | null;
  isReliever: boolean;
  companies: string[];
  workOrders: { assigned: number; completed: number; inProgress: number };
  attendance: { present: number; absent: number; total: number; rate: number | null };
  training: { total: number; completed: number; rate: number | null };
};

// The dashboard's series: lifecycle order, built from lib/statuses, which is
// also the order the colour palette was validated in.
const STATUS_SERIES = WO_STATUS.map(({ key, label, color }) => ({ key, label, token: color }));

const PERIOD_LABELS: Record<Period, string> = {
  today: "Today",
  week:  "This Week",
  month: "This Month",
};

/**
 * The dates a period covers, for the printed letterhead — "This Month" means
 * nothing on a PDF opened next quarter. Mirrors the API's own windows
 * (dashboardRoutes.js): the week starts on Monday, the month on the 1st.
 */
function periodDates(p: Period): string {
  const fmt = (d: Date) => d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  const today = new Date();
  const start = new Date(today);
  if (p === "week") start.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  if (p === "month") start.setDate(1);
  return p === "today" ? fmt(today) : `${fmt(start)} – ${fmt(today)}`;
}

function pct(a: number, b: number) {
  if (!b) return null;
  return Math.round((a / b) * 100);
}

/**
 * A single ratio against a limit — a meter, not a chart.
 *
 * The threshold colour is a status signal, so it comes from the status tokens
 * rather than raw hex (the old values were hardcoded and ignored dark mode).
 * The percentage is always rendered, so colour is never the only thing saying
 * "this is bad".
 */
function PctBar({ value, danger = false }: { value: number | null; danger?: boolean }) {
  if (value === null) return <span className="tu-figure-zero" style={{ fontSize: 12 }}>—</span>;
  const tone = danger
    ? value > 20 ? "critical" : "good"
    : value >= 90 ? "good" : value >= 70 ? "warning" : "critical";
  return (
    <div className="tu-meter">
      <div className="tu-meter-track">
        <div className={`tu-meter-fill tu-meter-${tone}`} style={{ width: `${Math.min(value, 100)}%` }} />
      </div>
      <span className={`tu-meter-value tu-meter-${tone}`}>{value}%</span>
    </div>
  );
}

function exportCSV(accounts: AccountSummary[], employees: EmployeeReport[], period: Period) {
  // Encoding and formula-safety live in lib/csv — see the note there.
  const { line, download } = csvBuilder();

  // ── Per-account summary ──
  line(["Account Summary"]);
  line(["Account", "Open work orders", "Overdue work orders", "Assets needing attention", "Checklists Done", "Checklist Total", "Attendance Present", "Attendance Total", "Attendance %"]);
  for (const a of accounts) {
    line([
      a.name,
      a.openWorkOrders,
      a.overdueWorkOrders,
      a.poorHealthAssets,
      a.checklistsDone,
      a.checklistsTotal,
      a.attendancePresent,
      a.attendanceTotal,
      pct(a.attendancePresent, a.attendanceTotal) ?? "",
    ]);
  }

  // ── Per-employee performance (across all accounts) ──
  line([]);
  line(["Employee Performance"]);
  line([
    "Employee", "Position", "Type", "Companies",
    "Work orders assigned", "Work orders completed", "Work orders in progress",
    "Attendance %", "Present", "Absent",
    "Training Completed", "Training Total",
  ]);
  for (const e of employees) {
    line([
      e.name,
      e.position ?? "",
      e.isReliever ? "Reliever" : "Regular",
      e.companies.join("; "),
      e.workOrders.assigned,
      e.workOrders.completed,
      e.workOrders.inProgress,
      e.attendance.rate ?? "",
      e.attendance.present,
      e.attendance.absent,
      e.training.completed,
      e.training.total,
    ]);
  }

  download(`cmms-report-${period}-${new Date().toISOString().slice(0, 10)}.csv`);
}

export default function ReportsPage() {
  const router = useRouter();
  // Full permitted list for the filter's options. Kept separate from
  // data.accounts, which reflects the *current* filter and would otherwise
  // shrink the option list to whatever is already selected.
  const [allAccounts, setAllAccounts] = useState<{ id: string; name: string }[]>([]);
  const [selectedAccounts, setSelectedAccounts] = useState<Set<string>>(new Set());
  const [data, setData] = useState<DashboardData | null>(null);
  const [employees, setEmployees] = useState<EmployeeReport[]>([]);
  const [period, setPeriod] = useState<Period>("month");
  const [showPmExport, setShowPmExport] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Key on the contents, not the Set identity — AccountFilter hands back a new
  // Set on every interaction, which would otherwise refetch on a no-op change.
  const accountKey = useMemo(
    () => Array.from(selectedAccounts).sort().join(","),
    [selectedAccounts],
  );

  // Option list is fetched once and never narrowed by the filter itself.
  useEffect(() => {
    api.get("/accounts").then((r) => setAllAccounts(r.data)).catch(() => setAllAccounts([]));
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      // Employee performance rides alongside the dashboard so the CSV export can
      // include a per-employee section; a failure there shouldn't blank the page.
      const accountIds = accountKey || undefined;
      const [dash, emp] = await Promise.all([
        api.get("/dashboard", { params: { period, accountIds } }),
        api.get("/reports/employees", { params: { period } }).catch(() => null),
      ]);
      setData(dash.data);
      setEmployees(emp?.data?.employees ?? []);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [period, accountKey]);

  useEffect(() => startLoad(fetchData), [fetchData]);

  const wo = data?.workOrders;
  const totalWOs = wo ? Object.values(wo).reduce((a, b) => a + b, 0) : 0;
  // Client-approved work is finished work too — it moved on from COMPLETED.
  const completedWOs = (wo?.COMPLETED ?? 0) + (wo?.APPROVED ?? 0);
  const totalAssets =
    (data?.assets.FUNCTIONAL ?? 0) +
    (data?.assets.FUNCTIONAL_WITH_FINDINGS ?? 0) +
    (data?.assets.BREAKDOWN ?? 0);

  // Follows the page's account filter: none selected means every site.
  const scopeLabel = siteScope(selectedAccounts, allAccounts);

  return (
    <div className="tu-page">
      <PrintReportHeader title="Performance report" scope={scopeLabel} period={`${PERIOD_LABELS[period]}: ${periodDates(period)}`} />
      {/* Header */}
      <div className="tu-page-header tu-no-print">
        <div>
          <h1 className="tu-page-title">Reports</h1>
          <p className="tu-page-sub">Cross-account performance overview</p>
        </div>
        <div className="tu-page-actions">
          {data && (
            <button
              type="button"
              onClick={() => exportCSV(data.accounts, employees, period)}
              className="tu-btn-secondary"
            >
              ↓ Export CSV
            </button>
          )}
          <PrintReportButton disabled={!data} />
          <Link href="/reports/response-times" className="tu-btn-secondary">
            Response times
          </Link>
          <Link href="/reports/client-satisfaction" className="tu-btn-secondary">
            Client satisfaction
          </Link>
          <button type="button" onClick={() => setShowPmExport(true)} className="tu-btn-primary">
            PM analytics (Excel)
          </button>
          {showPmExport && (
            <PmExportDialog
              onClose={() => setShowPmExport(false)}
              scope={scopeLabel}
              accountIds={Array.from(selectedAccounts)}
            />
          )}
          {allAccounts.length > 1 && (
            <AccountFilter accounts={allAccounts} selected={selectedAccounts} onChange={setSelectedAccounts} />
          )}
          <div className="tu-filter-group" role="group" aria-label="Select period">
            {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriod(p)}
                className={`tu-period-pill${period === p ? " tu-active-pill" : ""}`}
                aria-pressed={period === p}
              >
                {PERIOD_LABELS[p]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && (
        <div className="tu-error-banner" role="alert">Failed to load report data.</div>
      )}

      {/* Global KPI strip */}
      <div className="tu-kpi-grid" style={{ marginBottom: 24 }}>
        <div className="tu-stat-card">
          <p className="tu-stat-label">Work Orders Created</p>
          <p className="tu-stat-value">{loading ? <span className="tu-skeleton tu-stat-skel" aria-label="Loading" /> : totalWOs}</p>
          <p className="tu-stat-sub">
            {loading ? " " : `${completedWOs} completed · ${data?.workOrders.IN_PROGRESS ?? 0} in progress`}
          </p>
        </div>
        <div className="tu-stat-card">
          <p className="tu-stat-label">Overdue</p>
          <p className={`tu-stat-value${(data?.overdueWorkOrders ?? 0) > 0 ? " tu-stat-danger" : ""}`}>
            {loading ? <span className="tu-skeleton tu-stat-skel" aria-label="Loading" /> : data?.overdueWorkOrders ?? 0}
          </p>
          <p className="tu-stat-sub">work orders past due</p>
        </div>
        <div className="tu-stat-card">
          <p className="tu-stat-label">Assets</p>
          <p className="tu-stat-value">{loading ? <span className="tu-skeleton tu-stat-skel" aria-label="Loading" /> : totalAssets}</p>
          <p className="tu-stat-sub">
            {loading ? " " : `${data?.poorHealthAssets ?? 0} need attention`}
          </p>
        </div>
        <div className="tu-stat-card">
          <p className="tu-stat-label">PM Checklists</p>
          <p className={`tu-stat-value${data && data.checklists.completed < data.checklists.total ? " tu-stat-warning" : ""}`}>
            {loading ? <span className="tu-skeleton tu-stat-skel" aria-label="Loading" /> : `${data?.checklists.completed ?? 0}/${data?.checklists.total ?? 0}`}
          </p>
          <p className="tu-stat-sub">completed {PERIOD_LABELS[period].toLowerCase()}</p>
        </div>
      </div>

      {/* Per-account breakdown table */}
      <div className="tu-card">
        <div className="tu-card-header">
          <h2 className="tu-card-title">Per-Account Breakdown</h2>
          <span className="tu-result-count tu-no-print">Click a row for the full account report</span>
        </div>
        <div className="tu-scroll-x">
          <table className="tu-table tu-table-interactive" aria-label="Per-account report">
            <thead>
              <tr>
                <th scope="col">Account</th>
                <th scope="col" className="tu-center">Open work orders</th>
                <th scope="col" className="tu-center">Overdue</th>
                <th scope="col" className="tu-center">{NEEDS_ATTENTION_LABEL}</th>
                <th scope="col" style={{ minWidth: 160 }}>Checklists</th>
                <th scope="col" style={{ minWidth: 160 }}>Attendance</th>
                <th scope="col" className="tu-no-print" style={{ width: 110 }}></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} aria-hidden="true">
                    {Array.from({ length: 7 }).map((__, j) => (
                      <td key={j} style={{ padding: "14px 24px" }}>
                        <div className="tu-skeleton" style={{ height: 14, borderRadius: 4 }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : !data?.accounts.length ? (
                <tr>
                  <td colSpan={7}>
                    <div className="tu-empty tu-empty-sm">
                      <p className="tu-empty-title">No accounts to report on</p>
                      <p className="tu-empty-hint">Once an account has work orders or shifts, its figures appear here.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                data.accounts.map((acc) => {
                  const checklistPct = pct(acc.checklistsDone, acc.checklistsTotal);
                  const attendancePct = pct(acc.attendancePresent, acc.attendanceTotal);
                  return (
                    <tr key={acc.id} onClick={() => router.push(`/accounts/${acc.id}/reports`)}>
                      <td className="tu-strong">{acc.name}</td>
                      {/* Plain tabular figures rather than pills: these are
                          magnitudes, and a pill around each one misaligns the
                          digits and turns the column into confetti. The header
                          already says "Overdue", so colour is emphasis here,
                          not the sole carrier of meaning. */}
                      <td className="tu-center">
                        {acc.openWorkOrders > 0
                          ? <span className="tu-figure">{acc.openWorkOrders}</span>
                          : <span className="tu-figure-zero">—</span>}
                      </td>
                      <td className="tu-center">
                        {acc.overdueWorkOrders > 0
                          ? <span className="tu-figure tu-figure-danger">{acc.overdueWorkOrders}</span>
                          : <span className="tu-figure-zero">—</span>}
                      </td>
                      <td className="tu-center">
                        {acc.poorHealthAssets > 0
                          ? <span className="tu-figure tu-figure-warning">{acc.poorHealthAssets}</span>
                          : <span className="tu-figure-zero">—</span>}
                      </td>
                      <td>
                        {acc.checklistsTotal > 0 ? (
                          <PctBar value={checklistPct} />
                        ) : (
                          <span className="tu-figure-zero" style={{ fontSize: 12 }}>None assigned</span>
                        )}
                      </td>
                      <td>
                        {acc.attendanceTotal > 0 ? (
                          <PctBar value={attendancePct} />
                        ) : (
                          <span className="tu-figure-zero" style={{ fontSize: 12 }}>No shifts logged</span>
                        )}
                      </td>
                      <td className="tu-no-print">
                        <Link
                          href={`/accounts/${acc.id}/reports`}
                          className="tu-row-link tu-row-link-brand"
                          style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap" }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          Full Report →
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Work order status breakdown.
          Six statuses that sum to the total is a part-to-whole question, so it
          is one stacked bar rather than six separate tiles — the tiles showed
          the counts but never the proportion. Colours come from the validated
          --tu-status-* set; every segment is direct-labelled and repeated in the
          legend, which is what licenses the red/green CVD pair in light mode. */}
      {!loading && data && totalWOs > 0 && (
        <div className="tu-card" style={{ marginTop: 24 }}>
          <div className="tu-card-header">
            <h2 className="tu-card-title">Work Order Breakdown</h2>
            <span className="tu-result-count">{totalWOs} total</span>
          </div>
          <div className="tu-card-body">
            {/* The dashboard's pipeline chart: labelled, keyboard-reachable
                segments and a table view, rather than a private copy of the bar. */}
            {totalWOs > 0 && (
              <StackedBar
                ariaLabel="Work order status distribution"
                segments={STATUS_SERIES.map(({ key, label, token }) => ({ key, label, value: wo?.[key] ?? 0, color: token }))}
              />
            )}

            <ul className="tu-legend tu-legend-grid">
              {STATUS_SERIES.map(({ label, key, token }) => {
                const count = wo?.[key] ?? 0;
                const share = pct(count, totalWOs);
                return (
                  <li key={key}>
                    <span className="tu-dot" style={{ background: token }} aria-hidden="true" />
                    <span className="tu-legend-name">{label}</span>
                    <span className="tu-legend-val">
                      {count}
                      <span className="tu-legend-share">{share !== null ? ` ${share}%` : ""}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
