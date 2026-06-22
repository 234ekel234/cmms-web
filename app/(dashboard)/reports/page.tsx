"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import api from "@/lib/api";

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
  workOrders: { REQUESTED: number; PENDING: number; IN_PROGRESS: number; COMPLETED: number; REJECTED: number };
  assets: { OPERATIONAL: number; UNDER_MAINTENANCE: number };
  overdueWorkOrders: number;
  poorHealthAssets: number;
  attendance: { present: number; absent: number };
  checklists: { completed: number; total: number };
  accounts: AccountSummary[];
};

const PERIOD_LABELS: Record<Period, string> = {
  today: "Today",
  week:  "This Week",
  month: "This Month",
};

function pct(a: number, b: number) {
  if (!b) return null;
  return Math.round((a / b) * 100);
}

function PctBar({ value, danger = false }: { value: number | null; danger?: boolean }) {
  if (value === null) return <span style={{ color: "var(--tu-text-subtle)", fontSize: 12 }}>—</span>;
  const color = danger
    ? value > 20 ? "#ef4444" : "#16a34a"
    : value >= 90 ? "#16a34a" : value >= 70 ? "#f59e0b" : "#ef4444";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ flex: 1, height: 6, background: "var(--tu-bg-tertiary)", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ width: `${Math.min(value, 100)}%`, height: "100%", background: color, borderRadius: 3, transition: "width 400ms" }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 700, color, minWidth: 32, textAlign: "right" }}>{value}%</span>
    </div>
  );
}

function exportCSV(accounts: AccountSummary[], period: Period) {
  const header = ["Account", "Open WOs", "Overdue WOs", "Poor Assets", "Checklists Done", "Checklist Total", "Attendance Present", "Attendance Total", "Attendance %"].join(",");
  const rows = accounts.map((a) => [
    `"${a.name}"`,
    a.openWorkOrders,
    a.overdueWorkOrders,
    a.poorHealthAssets,
    a.checklistsDone,
    a.checklistsTotal,
    a.attendancePresent,
    a.attendanceTotal,
    pct(a.attendancePresent, a.attendanceTotal) ?? "",
  ].join(","));
  const csv = [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `cmms-report-${period}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ReportsPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [period, setPeriod] = useState<Period>("month");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => { fetchData(); }, [period]);

  async function fetchData() {
    setLoading(true);
    setError(false);
    try {
      const res = await api.get("/dashboard", { params: { period } });
      setData(res.data);
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
              onClick={() => exportCSV(data.accounts, period)}
              className="tu-btn-secondary"
            >
              ↓ Export CSV
            </button>
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
          <p style={{ fontSize: 13, color: "var(--tu-text-subtle)" }}>
            Click an account to view its full detailed report.
          </p>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="tu-table" aria-label="Per-account report">
            <thead>
              <tr>
                <th scope="col">Account</th>
                <th scope="col" className="tu-center">Open WOs</th>
                <th scope="col" className="tu-center">Overdue</th>
                <th scope="col" className="tu-center">Poor Assets</th>
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
                  <td colSpan={7} style={{ textAlign: "center", padding: "40px 24px", color: "var(--tu-text-body)", fontSize: 14 }}>
                    No accounts found.
                  </td>
                </tr>
              ) : (
                data.accounts.map((acc) => {
                  const checklistPct = pct(acc.checklistsDone, acc.checklistsTotal);
                  const attendancePct = pct(acc.attendancePresent, acc.attendanceTotal);
                  return (
                    <tr key={acc.id}>
                      <td className="tu-strong">{acc.name}</td>
                      <td className="tu-center">
                        {acc.openWorkOrders > 0 ? (
                          <span className="tu-badge tu-badge-brand">{acc.openWorkOrders}</span>
                        ) : (
                          <span style={{ color: "var(--tu-text-subtle)" }}>—</span>
                        )}
                      </td>
                      <td className="tu-center">
                        {acc.overdueWorkOrders > 0 ? (
                          <span className="tu-badge tu-badge-danger">{acc.overdueWorkOrders}</span>
                        ) : (
                          <span style={{ color: "var(--tu-text-subtle)" }}>—</span>
                        )}
                      </td>
                      <td className="tu-center">
                        {acc.poorHealthAssets > 0 ? (
                          <span className="tu-badge tu-badge-warning">{acc.poorHealthAssets}</span>
                        ) : (
                          <span style={{ color: "var(--tu-text-subtle)" }}>—</span>
                        )}
                      </td>
                      <td>
                        {acc.checklistsTotal > 0 ? (
                          <PctBar value={checklistPct} />
                        ) : (
                          <span style={{ color: "var(--tu-text-subtle)", fontSize: 12 }}>None assigned</span>
                        )}
                      </td>
                      <td>
                        {acc.attendanceTotal > 0 ? (
                          <PctBar value={attendancePct} />
                        ) : (
                          <span style={{ color: "var(--tu-text-subtle)", fontSize: 12 }}>No shifts logged</span>
                        )}
                      </td>
                      <td>
                        <Link
                          href={`/accounts/${acc.id}/reports`}
                          style={{ fontSize: 13, fontWeight: 600, color: "var(--tu-text-brand)", textDecoration: "none", whiteSpace: "nowrap" }}
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

      {/* Work order status breakdown */}
      {!loading && data && totalWOs > 0 && (
        <div className="tu-card" style={{ marginTop: 24 }}>
          <div className="tu-card-header">
            <h2 className="tu-card-title">Work Order Breakdown</h2>
          </div>
          <div style={{ padding: "0 24px 24px", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 12 }}>
            {[
              { label: "Requested",   key: "REQUESTED",   color: "#a855f7" },
              { label: "Accepted",    key: "PENDING",     color: "#3b82f6" },
              { label: "In Progress", key: "IN_PROGRESS", color: "#f59e0b" },
              { label: "Completed",   key: "COMPLETED",   color: "#16a34a" },
              { label: "Rejected",    key: "REJECTED",    color: "#ef4444" },
            ].map(({ label, key, color }) => {
              const count = wo?.[key as keyof typeof wo] ?? 0;
              const share = pct(count, totalWOs);
              return (
                <div
                  key={key}
                  style={{
                    background: "var(--tu-bg-secondary)",
                    borderRadius: 10,
                    padding: "14px 16px",
                    borderLeft: `3px solid ${color}`,
                  }}
                >
                  <p style={{ fontSize: 22, fontWeight: 800, color: "var(--tu-text-heading)", lineHeight: 1 }}>{count}</p>
                  <p style={{ fontSize: 12, color: "var(--tu-text-subtle)", marginTop: 4 }}>{label}</p>
                  {share !== null && (
                    <p style={{ fontSize: 11, fontWeight: 600, color, marginTop: 4 }}>{share}%</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
