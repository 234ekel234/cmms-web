"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import AccountFilter from "@/components/AccountFilter";

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
  workOrders: { REQUESTED: number; PENDING: number; IN_PROGRESS: number; ON_HOLD: number; COMPLETED: number; REJECTED: number };
  assets: { OPERATIONAL: number; UNDER_MAINTENANCE: number };
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

// Lifecycle order. This is also the order the colour palette was validated in:
// the adjacent-pair CVD gate depends on it, so do not reorder casually.
const STATUS_SERIES = [
  { label: "Requested",   key: "REQUESTED",   token: "var(--tu-status-requested)"   },
  { label: "Accepted",    key: "PENDING",     token: "var(--tu-status-pending)"     },
  { label: "In Progress", key: "IN_PROGRESS", token: "var(--tu-status-in-progress)" },
  { label: "On Hold",     key: "ON_HOLD",     token: "var(--tu-status-on-hold)"     },
  { label: "Completed",   key: "COMPLETED",   token: "var(--tu-status-completed)"   },
  { label: "Rejected",    key: "REJECTED",    token: "var(--tu-status-rejected)"    },
] as const;

const PERIOD_LABELS: Record<Period, string> = {
  today: "Today",
  week:  "This Week",
  month: "This Month",
};

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
  const esc = (v: string | number) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines: string[] = [];
  const line = (cells: (string | number)[]) => lines.push(cells.map(esc).join(","));

  // ── Per-account summary ──
  line(["Account Summary"]);
  line(["Account", "Open WOs", "Overdue WOs", "Poor Assets", "Checklists Done", "Checklist Total", "Attendance Present", "Attendance Total", "Attendance %"]);
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
    "WOs Assigned", "WOs Completed", "WOs In Progress",
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

  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `cmms-report-${period}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Key on the contents, not the Set identity — AccountFilter hands back a new
  // Set on every interaction, which would otherwise refetch on a no-op change.
  const accountKey = useMemo(
    () => Array.from(selectedAccounts).sort().join(","),
    [selectedAccounts],
  );

  useEffect(() => { fetchData(); }, [period, accountKey]);

  // Option list is fetched once and never narrowed by the filter itself.
  useEffect(() => {
    api.get("/accounts").then((r) => setAllAccounts(r.data)).catch(() => setAllAccounts([]));
  }, []);

  async function fetchData() {
    setLoading(true);
    setError(false);
    try {
      // Employee performance rides alongside the dashboard so the CSV export can
      // include a per-employee section; a failure there shouldn't blank the page.
      const accountIds = selectedAccounts.size > 0 ? Array.from(selectedAccounts).join(",") : undefined;
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
  }

  const wo = data?.workOrders;
  const totalWOs = wo ? Object.values(wo).reduce((a, b) => a + b, 0) : 0;
  const completedWOs = wo?.COMPLETED ?? 0;
  const totalAssets = (data?.assets.OPERATIONAL ?? 0) + (data?.assets.UNDER_MAINTENANCE ?? 0);

  return (
    <div className="tu-page">
      {/* Header */}
      <div className="tu-page-header">
        <div>
          <h1 className="tu-page-title">Reports</h1>
          <p className="tu-page-sub">Cross-account performance overview</p>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          {data && (
            <button
              type="button"
              onClick={() => exportCSV(data.accounts, employees, period)}
              className="tu-btn-secondary"
            >
              ↓ Export CSV
            </button>
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
          <p className="tu-stat-value">{loading ? "—" : totalWOs}</p>
          <p className="tu-stat-sub">
            {loading ? " " : `${completedWOs} completed · ${data?.workOrders.IN_PROGRESS ?? 0} in progress`}
          </p>
        </div>
        <div className="tu-stat-card">
          <p className="tu-stat-label">Overdue</p>
          <p className={`tu-stat-value${(data?.overdueWorkOrders ?? 0) > 0 ? " tu-stat-danger" : ""}`}>
            {loading ? "—" : data?.overdueWorkOrders ?? 0}
          </p>
          <p className="tu-stat-sub">work orders past due</p>
        </div>
        <div className="tu-stat-card">
          <p className="tu-stat-label">Assets</p>
          <p className="tu-stat-value">{loading ? "—" : totalAssets}</p>
          <p className="tu-stat-sub">
            {loading ? " " : `${data?.poorHealthAssets ?? 0} poor health`}
          </p>
        </div>
        <div className="tu-stat-card">
          <p className="tu-stat-label">PM Checklists</p>
          <p className={`tu-stat-value${data && data.checklists.completed < data.checklists.total ? " tu-stat-warning" : ""}`}>
            {loading ? "—" : `${data?.checklists.completed ?? 0}/${data?.checklists.total ?? 0}`}
          </p>
          <p className="tu-stat-sub">completed {PERIOD_LABELS[period].toLowerCase()}</p>
        </div>
      </div>

      {/* Per-account breakdown table */}
      <div className="tu-card">
        <div className="tu-card-header">
          <h2 className="tu-card-title">Per-Account Breakdown</h2>
          <span className="tu-result-count">Click a row for the full account report</span>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="tu-table tu-table-interactive" aria-label="Per-account report">
            <thead>
              <tr>
                <th scope="col">Account</th>
                <th scope="col" className="tu-center">Open WOs</th>
                <th scope="col" className="tu-center">Overdue</th>
                <th scope="col" className="tu-center">Assets at risk</th>
                <th scope="col" style={{ minWidth: 160 }}>Checklists</th>
                <th scope="col" style={{ minWidth: 160 }}>Attendance</th>
                <th scope="col" style={{ width: 110 }}></th>
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
                      <td>
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
            <div className="tu-segbar tu-segbar-lg" role="img" aria-label={STATUS_SERIES.map(({ label, key }) => `${label}: ${wo?.[key as keyof typeof wo] ?? 0}`).join(", ")}>
              {STATUS_SERIES.map(({ label, key, token }) => {
                const count = wo?.[key as keyof typeof wo] ?? 0;
                if (count === 0) return null;
                return (
                  <span
                    key={key}
                    style={{ width: `${(count / totalWOs) * 100}%`, background: token }}
                    title={`${label}: ${count} (${pct(count, totalWOs)}%)`}
                  />
                );
              })}
            </div>

            <ul className="tu-legend tu-legend-grid">
              {STATUS_SERIES.map(({ label, key, token }) => {
                const count = wo?.[key as keyof typeof wo] ?? 0;
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
