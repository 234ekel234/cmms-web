"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import api from "@/lib/api";

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

type ActivityEntry = {
  id: string;
  action: string;
  description: string;
  performedByName: string | null;
  createdAt: string;
  accountId: string;
};

type DashboardData = {
  workOrders: { REQUESTED: number; PENDING: number; IN_PROGRESS: number; COMPLETED: number; REJECTED: number };
  assets: { OPERATIONAL: number; UNDER_MAINTENANCE: number };
  overdueWorkOrders: number;
  poorHealthAssets: number;
  attendance: { present: number; absent: number };
  checklists: { completed: number; total: number };
  accounts: AccountSummary[];
  recentActivity: ActivityEntry[];
  period: string;
};

type Period = "today" | "week" | "month";

const PERIOD_LABELS: Record<Period, string> = {
  today: "Today",
  week: "This Week",
  month: "This Month",
};

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function SkeletonRows({ count, cols }: { count: number; cols: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <tr key={i} aria-hidden="true">
          {Array.from({ length: cols }).map((_, j) => (
            <td key={j} style={{ padding: "14px 24px" }}>
              <div className="tu-skeleton" style={{ height: 14, borderRadius: 4 }} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [period, setPeriod] = useState<Period>("today");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetchDashboard();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  async function fetchDashboard() {
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
  const openWOs = (wo?.REQUESTED ?? 0) + (wo?.PENDING ?? 0) + (wo?.IN_PROGRESS ?? 0);
  const totalAssets = (data?.assets.OPERATIONAL ?? 0) + (data?.assets.UNDER_MAINTENANCE ?? 0);
  const overdue = data?.overdueWorkOrders ?? 0;
  const checklistPct =
    data && data.checklists.total > 0
      ? data.checklists.completed < data.checklists.total
      : false;

  return (
    <div className="tu-page">
      {/* Page header */}
      <div className="tu-page-header">
        <div>
          <h1 className="tu-page-title">Dashboard</h1>
          <p className="tu-page-sub">Overview across all accounts</p>
        </div>

        {/* Period filter */}
        <div className="tu-filter-group" role="group" aria-label="Select time period">
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

      {/* Error state */}
      {error && (
        <div className="tu-error-banner" role="alert">
          Failed to load dashboard data. Please try refreshing the page.
        </div>
      )}

      {/* KPI cards */}
      <div className="tu-kpi-grid" aria-label="Key metrics">
        <div className="tu-stat-card">
          <p className="tu-stat-label">Open Work Orders</p>
          <p className={`tu-stat-value${openWOs > 0 ? " tu-stat-brand" : ""}`} aria-live="polite">
            {loading ? "—" : openWOs}
          </p>
          <p className="tu-stat-sub">
            {loading ? " " : `${wo?.REQUESTED ?? 0} requested · ${wo?.IN_PROGRESS ?? 0} in progress`}
          </p>
        </div>

        <div className="tu-stat-card">
          <p className="tu-stat-label">Overdue</p>
          <p className={`tu-stat-value${overdue > 0 ? " tu-stat-danger" : ""}`} aria-live="polite">
            {loading ? "—" : overdue}
          </p>
          <p className="tu-stat-sub">work orders past due date</p>
        </div>

        <div className="tu-stat-card">
          <p className="tu-stat-label">Total Assets</p>
          <p className="tu-stat-value" aria-live="polite">
            {loading ? "—" : totalAssets}
          </p>
          <p className="tu-stat-sub">
            {loading ? " " : `${data?.assets.UNDER_MAINTENANCE ?? 0} under maintenance`}
          </p>
        </div>

        <div className="tu-stat-card">
          <p className="tu-stat-label">PM Checklists</p>
          <p className={`tu-stat-value${checklistPct ? " tu-stat-warning" : ""}`} aria-live="polite">
            {loading ? "—" : `${data?.checklists.completed ?? 0}/${data?.checklists.total ?? 0}`}
          </p>
          <p className="tu-stat-sub">completed {PERIOD_LABELS[period].toLowerCase()}</p>
        </div>
      </div>

      {/* Main content grid */}
      <div className="tu-content-grid">
        {/* Account summary table */}
        <section aria-labelledby="accounts-heading">
          <div className="tu-card">
            <div className="tu-card-header">
              <h2 id="accounts-heading" className="tu-card-title">Account Summary</h2>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table className="tu-table" aria-label="Account metrics">
                <thead>
                  <tr>
                    <th scope="col">Account</th>
                    <th scope="col" className="tu-center">Open WOs</th>
                    <th scope="col" className="tu-center">Overdue</th>
                    <th scope="col" className="tu-center">Poor Assets</th>
                    <th scope="col" className="tu-center">Checklists</th>
                    <th scope="col" className="tu-center">Attendance</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <SkeletonRows count={3} cols={6} />
                  ) : !data?.accounts.length ? (
                    <tr>
                      <td
                        colSpan={6}
                        style={{ textAlign: "center", padding: "32px 24px", color: "var(--tu-text-body)", fontSize: 14 }}
                      >
                        No accounts found.
                      </td>
                    </tr>
                  ) : (
                    data.accounts.map((acc) => (
                      <tr key={acc.id} style={{ cursor: "pointer" }}>
                        <td className="tu-strong" scope="row">
                          <Link
                            href={`/accounts/${acc.id}/work-orders`}
                            style={{ color: "inherit", textDecoration: "none" }}
                            className="hover:text-[#1447e6] transition-colors"
                          >
                            {acc.name}
                          </Link>
                        </td>
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
                        <td className="tu-center" style={{ color: "var(--tu-text-body)" }}>
                          {acc.checklistsDone}/{acc.checklistsTotal}
                        </td>
                        <td className="tu-center" style={{ color: "var(--tu-text-body)" }}>
                          {acc.attendanceTotal > 0
                            ? `${acc.attendancePresent}/${acc.attendanceTotal}`
                            : <span style={{ color: "var(--tu-text-subtle)" }}>—</span>}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Recent activity */}
        <section aria-labelledby="activity-heading">
          <div className="tu-card" style={{ height: "100%" }}>
            <div className="tu-card-header">
              <h2 id="activity-heading" className="tu-card-title">Recent Activity</h2>
            </div>
            <div style={{ maxHeight: 440, overflowY: "auto" }} aria-live="polite" aria-atomic="false">
              {loading ? (
                <div style={{ padding: "16px 24px" }}>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="tu-skeleton" aria-hidden="true" style={{ height: 48, borderRadius: 6, marginBottom: 12 }} />
                  ))}
                </div>
              ) : !data?.recentActivity.length ? (
                <div style={{ padding: "32px 24px", textAlign: "center", color: "var(--tu-text-body)", fontSize: 14 }}>
                  No recent activity.
                </div>
              ) : (
                data.recentActivity.map((entry) => (
                  <div key={entry.id} className="tu-activity-item">
                    <p className="tu-activity-desc">{entry.description}</p>
                    <p className="tu-activity-meta">
                      <span>{entry.performedByName ?? "System"}</span>
                      <span aria-hidden="true"> · </span>
                      <time dateTime={entry.createdAt}>{timeAgo(entry.createdAt)}</time>
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
