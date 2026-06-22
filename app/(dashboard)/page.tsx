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

type TrendPoint = { date: string; count: number };

type FreqBreakdown = {
  frequency: string;
  total: number;
  completed: number;
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
  trends: { workOrdersCompleted: TrendPoint[]; checklistCompletions: TrendPoint[] };
  checklistBreakdown: FreqBreakdown[];
  period: string;
  trendDays: number;
};

type Period = "today" | "week" | "month";

const PERIOD_LABELS: Record<Period, string> = {
  today: "Today",
  week: "This Week",
  month: "This Month",
};

const WO_STATUS: { key: keyof DashboardData["workOrders"]; label: string; color: string }[] = [
  { key: "REQUESTED", label: "Requested", color: "#F59E0B" },
  { key: "PENDING", label: "Pending", color: "#6366F1" },
  { key: "IN_PROGRESS", label: "In Progress", color: "#1447E6" },
  { key: "COMPLETED", label: "Completed", color: "#10B981" },
  { key: "REJECTED", label: "Rejected", color: "#94A3B8" },
];

const COLOR_OPERATIONAL = "#10B981";
const COLOR_MAINTENANCE = "#F59E0B";
const COLOR_PRESENT = "#10B981";
const COLOR_ABSENT = "#EF4444";

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function fmtDay(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric" });
}

// ── Inline icons ─────────────────────────────────────────
function Svg({ children }: { children: React.ReactNode }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
  );
}
function IconClipboard() {
  return <Svg><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><rect x="8" y="2" width="8" height="4" rx="1" /></Svg>;
}
function IconAlert() {
  return <Svg><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></Svg>;
}
function IconCheck() {
  return <Svg><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></Svg>;
}

// ── Chart primitives ─────────────────────────────────────

function BarChart({ data, color }: { data: TrendPoint[]; color: string }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  const n = data.length || 1;
  const gap = 2;
  const barW = (100 - gap * (n - 1)) / n;
  return (
    <svg viewBox="0 0 100 44" preserveAspectRatio="none" style={{ width: "100%", height: 72, display: "block" }} role="img" aria-label="Daily trend">
      {data.map((d, i) => {
        const h = (d.count / max) * 40;
        return (
          <rect
            key={d.date}
            x={i * (barW + gap)}
            y={44 - Math.max(h, 1.5)}
            width={barW}
            height={Math.max(h, 1.5)}
            rx={0.8}
            fill={d.count > 0 ? color : "var(--tu-bg-tertiary)"}
          >
            <title>{`${fmtDay(d.date)}: ${d.count}`}</title>
          </rect>
        );
      })}
    </svg>
  );
}

function Donut({ segments, centerNum, centerCap }: { segments: { value: number; color: string }[]; centerNum: string; centerCap: string }) {
  const size = 120;
  const stroke = 16;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const total = segments.reduce((s, x) => s + x.value, 0);
  let acc = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Distribution">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--tu-bg-tertiary)" strokeWidth={stroke} />
      {total > 0 &&
        segments.filter((s) => s.value > 0).map((s, i) => {
          const len = (s.value / total) * c;
          const dash = `${len} ${c - len}`;
          const offset = -acc;
          acc += len;
          return (
            <circle
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={stroke}
              strokeDasharray={dash}
              strokeDashoffset={offset}
              strokeLinecap="butt"
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          );
        })}
      <text x="50%" y="48%" textAnchor="middle" dominantBaseline="middle" className="tu-ring-center-num">{centerNum}</text>
      <text x="50%" y="63%" textAnchor="middle" dominantBaseline="middle" className="tu-ring-center-cap">{centerCap}</text>
    </svg>
  );
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
  const totalWOs = WO_STATUS.reduce((s, x) => s + (wo?.[x.key] ?? 0), 0);
  const totalAssets = (data?.assets.OPERATIONAL ?? 0) + (data?.assets.UNDER_MAINTENANCE ?? 0);
  const overdue = data?.overdueWorkOrders ?? 0;
  const present = data?.attendance.present ?? 0;
  const absent = data?.attendance.absent ?? 0;
  const attendanceTotal = present + absent;
  const attendanceRate = attendanceTotal > 0 ? Math.round((present / attendanceTotal) * 100) : null;
  const checklistsDone = data?.checklists.completed ?? 0;
  const checklistsTotal = data?.checklists.total ?? 0;
  const checklistsBehind = checklistsTotal > 0 && checklistsDone < checklistsTotal;

  const trendDays = data?.trendDays ?? 7;
  const woTrend = data?.trends.workOrdersCompleted ?? [];
  const clTrend = data?.trends.checklistCompletions ?? [];
  const woTrendTotal = woTrend.reduce((s, d) => s + d.count, 0);
  const clTrendTotal = clTrend.reduce((s, d) => s + d.count, 0);

  return (
    <div className="tu-page">
      {/* Page header */}
      <div className="tu-page-header">
        <div>
          <h1 className="tu-page-title">Dashboard</h1>
          <p className="tu-page-sub">Overview across all accounts</p>
        </div>

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

      {error && (
        <div className="tu-error-banner" role="alert">
          Failed to load dashboard data. Please try refreshing the page.
        </div>
      )}

      {/* KPI cards */}
      <div className="tu-kpi-grid" aria-label="Key metrics">
        <div className="tu-stat-card tu-accent" style={{ ["--tu-accent" as string]: "#1447E6" }}>
          <div className="tu-stat-head">
            <p className="tu-stat-label">Open Work Orders</p>
            <span className="tu-stat-ico"><IconClipboard /></span>
          </div>
          <p className={`tu-stat-value${openWOs > 0 ? " tu-stat-brand" : ""}`} aria-live="polite">
            {loading ? "—" : openWOs}
          </p>
          <p className="tu-stat-sub">
            {loading ? " " : `${wo?.REQUESTED ?? 0} requested · ${wo?.IN_PROGRESS ?? 0} in progress`}
          </p>
        </div>

        <div className="tu-stat-card tu-accent" style={{ ["--tu-accent" as string]: "#C70036" }}>
          <div className="tu-stat-head">
            <p className="tu-stat-label">Overdue</p>
            <span className="tu-stat-ico"><IconAlert /></span>
          </div>
          <p className={`tu-stat-value${overdue > 0 ? " tu-stat-danger" : ""}`} aria-live="polite">
            {loading ? "—" : overdue}
          </p>
          <p className="tu-stat-sub">work orders past due date</p>
        </div>

        <div className="tu-stat-card tu-accent" style={{ ["--tu-accent" as string]: "#10B981" }}>
          <div className="tu-stat-head">
            <p className="tu-stat-label">Attendance</p>
            <span className="tu-stat-ico" style={{ ["--tu-accent" as string]: "#10B981" }}><IconCheck /></span>
          </div>
          <p className="tu-stat-value" aria-live="polite">
            {loading ? "—" : attendanceRate === null ? "—" : `${attendanceRate}%`}
          </p>
          <p className="tu-stat-sub">
            {loading ? " " : attendanceTotal > 0 ? `${present} present · ${absent} absent` : "no shifts logged"}
          </p>
        </div>

        <div className="tu-stat-card tu-accent" style={{ ["--tu-accent" as string]: "#F97316" }}>
          <div className="tu-stat-head">
            <p className="tu-stat-label">PM Checklists</p>
            <span className="tu-stat-ico" style={{ ["--tu-accent" as string]: "#F97316" }}><IconCheck /></span>
          </div>
          <p className={`tu-stat-value${checklistsBehind ? " tu-stat-warning" : ""}`} aria-live="polite">
            {loading ? "—" : `${checklistsDone}/${checklistsTotal}`}
          </p>
          <p className="tu-stat-sub">completed {PERIOD_LABELS[period].toLowerCase()}</p>
        </div>
      </div>

      {/* Trend charts */}
      <div className="tu-trend-grid">
        <div className="tu-card">
          <div className="tu-card-body">
            <div className="tu-chart-head">
              <div>
                <p className="tu-stat-label" style={{ margin: "0 0 6px" }}>Work Orders Completed</p>
                <span className="tu-chart-total">{loading ? "—" : woTrendTotal}</span>
              </div>
              <span className="tu-chart-cap">last {trendDays} days</span>
            </div>
            {loading ? (
              <div className="tu-skeleton" style={{ height: 72, borderRadius: 6 }} aria-hidden="true" />
            ) : (
              <BarChart data={woTrend} color="#10B981" />
            )}
          </div>
        </div>

        <div className="tu-card">
          <div className="tu-card-body">
            <div className="tu-chart-head">
              <div>
                <p className="tu-stat-label" style={{ margin: "0 0 6px" }}>PM Checklist Completions</p>
                <span className="tu-chart-total">{loading ? "—" : clTrendTotal}</span>
              </div>
              <span className="tu-chart-cap">last {trendDays} days</span>
            </div>
            {loading ? (
              <div className="tu-skeleton" style={{ height: 72, borderRadius: 6 }} aria-hidden="true" />
            ) : (
              <BarChart data={clTrend} color="#1447E6" />
            )}
          </div>
        </div>
      </div>

      {/* Distribution cards */}
      <div className="tu-section-grid">
        {/* Work order pipeline */}
        <div className="tu-card">
          <div className="tu-card-header">
            <h2 className="tu-card-title">Work Order Pipeline</h2>
            <span className="tu-chart-cap">{loading ? "" : `${totalWOs} total`}</span>
          </div>
          <div className="tu-card-body">
            <div className="tu-segbar" role="img" aria-label="Work order status distribution">
              {!loading && totalWOs > 0 &&
                WO_STATUS.map((s) => {
                  const v = wo?.[s.key] ?? 0;
                  if (v === 0) return null;
                  return <span key={s.key} style={{ width: `${(v / totalWOs) * 100}%`, background: s.color }} title={`${s.label}: ${v}`} />;
                })}
            </div>
            <ul className="tu-legend">
              {WO_STATUS.map((s) => (
                <li key={s.key}>
                  <span className="tu-dot" style={{ background: s.color }} />
                  {s.label}
                  <span className="tu-legend-val">{loading ? "—" : wo?.[s.key] ?? 0}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Assets */}
        <div className="tu-card">
          <div className="tu-card-header">
            <h2 className="tu-card-title">Assets</h2>
            {!loading && data && data.poorHealthAssets > 0 && (
              <span className="tu-badge tu-badge-warning">{data.poorHealthAssets} poor</span>
            )}
          </div>
          <div className="tu-card-body">
            <div className="tu-ring-wrap">
              {loading ? (
                <div className="tu-skeleton" style={{ width: 120, height: 120, borderRadius: "9999px" }} aria-hidden="true" />
              ) : (
                <Donut
                  segments={[
                    { value: data?.assets.OPERATIONAL ?? 0, color: COLOR_OPERATIONAL },
                    { value: data?.assets.UNDER_MAINTENANCE ?? 0, color: COLOR_MAINTENANCE },
                  ]}
                  centerNum={String(totalAssets)}
                  centerCap="assets"
                />
              )}
              <ul className="tu-legend" style={{ margin: 0, flex: 1 }}>
                <li>
                  <span className="tu-dot" style={{ background: COLOR_OPERATIONAL }} />
                  Operational
                  <span className="tu-legend-val">{loading ? "—" : data?.assets.OPERATIONAL ?? 0}</span>
                </li>
                <li>
                  <span className="tu-dot" style={{ background: COLOR_MAINTENANCE }} />
                  Under Maintenance
                  <span className="tu-legend-val">{loading ? "—" : data?.assets.UNDER_MAINTENANCE ?? 0}</span>
                </li>
                <li>
                  <span className="tu-dot" style={{ background: "#EF4444" }} />
                  Poor / Out of Service
                  <span className="tu-legend-val">{loading ? "—" : data?.poorHealthAssets ?? 0}</span>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Attendance */}
        <div className="tu-card">
          <div className="tu-card-header">
            <h2 className="tu-card-title">Attendance</h2>
            <span className="tu-chart-cap">{PERIOD_LABELS[period].toLowerCase()}</span>
          </div>
          <div className="tu-card-body">
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 14 }}>
              <span className="tu-chart-total">{loading ? "—" : attendanceRate === null ? "—" : `${attendanceRate}%`}</span>
              <span className="tu-chart-cap">present rate</span>
            </div>
            <div className="tu-segbar" role="img" aria-label="Attendance distribution">
              {!loading && attendanceTotal > 0 && (
                <>
                  <span style={{ width: `${(present / attendanceTotal) * 100}%`, background: COLOR_PRESENT }} title={`Present: ${present}`} />
                  <span style={{ width: `${(absent / attendanceTotal) * 100}%`, background: COLOR_ABSENT }} title={`Absent: ${absent}`} />
                </>
              )}
            </div>
            <ul className="tu-legend">
              <li>
                <span className="tu-dot" style={{ background: COLOR_PRESENT }} />
                Present
                <span className="tu-legend-val">{loading ? "—" : present}</span>
              </li>
              <li>
                <span className="tu-dot" style={{ background: COLOR_ABSENT }} />
                Absent
                <span className="tu-legend-val">{loading ? "—" : absent}</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* PM checklist completion by frequency */}
      {(loading || (data?.checklistBreakdown.length ?? 0) > 0) && (
        <div className="tu-card" style={{ marginBottom: 24 }}>
          <div className="tu-card-header">
            <h2 className="tu-card-title">PM Checklist Completion by Frequency</h2>
            <span className="tu-chart-cap">current period per schedule</span>
          </div>
          <div>
            {loading ? (
              <div style={{ padding: "8px 24px" }}>
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="tu-skeleton" aria-hidden="true" style={{ height: 20, borderRadius: 6, margin: "12px 0" }} />
                ))}
              </div>
            ) : (
              data?.checklistBreakdown.map((f) => {
                const pct = f.total > 0 ? Math.round((f.completed / f.total) * 100) : 0;
                const done = f.completed >= f.total && f.total > 0;
                const color = done ? "#10B981" : pct >= 50 ? "#1447E6" : "#F59E0B";
                return (
                  <div key={f.frequency} className="tu-freq-row">
                    <span className="tu-freq-name">{f.frequency.replace(/_/g, " ").toLowerCase()}</span>
                    <div className="tu-freq-bar">
                      <div className="tu-progress">
                        <div style={{ width: `${pct}%`, background: color }} />
                      </div>
                    </div>
                    <span className="tu-freq-val">{f.completed}/{f.total} · {pct}%</span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Main content grid */}
      <div className="tu-content-grid">
        {/* Account summary table */}
        <section aria-labelledby="accounts-heading">
          <div className="tu-card">
            <div className="tu-card-header">
              <h2 id="accounts-heading" className="tu-card-title">Account Summary</h2>
              <span className="tu-chart-cap">{loading ? "" : `${data?.accounts.length ?? 0} accounts`}</span>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table className="tu-table tu-table-interactive" aria-label="Account metrics">
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
                      <tr key={acc.id}>
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
