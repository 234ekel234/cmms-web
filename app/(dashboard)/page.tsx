"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import api from "@/lib/api";
import { WORK_ORDER_STATUS, NEEDS_ATTENTION_LABEL, type WorkOrderStatus } from "@/lib/statuses";
import { FREQUENCY_LABEL, type Frequency } from "@/lib/maintenancePlans";
import { TrendChart, StackedBar, GroupedBars } from "@/components/charts";
import { isClosed } from "@/lib/workOrders";

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

type FreqAccount = {
  id: string;
  name: string;
  total: number;
  completed: number;
};

type FreqBreakdown = {
  frequency: string;
  total: number;
  completed: number;
  accounts?: FreqAccount[];
};

type DashboardData = {
  // Derived from the status union rather than spelled out, so adding a status
  // is a compile error here instead of a silently missing chart segment. That
  // is how APPROVED was caught: WO_STATUS builds its series from the same map.
  workOrders: Record<WorkOrderStatus, number>;
  assets: { FUNCTIONAL: number; FUNCTIONAL_WITH_FINDINGS: number; BREAKDOWN: number };
  manHours: {
    estimatedMinutes: number;
    actualMinutes: number;
    /** Finished jobs carrying both an estimate and recorded time. */
    jobsCompared: number;
    /** Everything finished in the window, compared or not. */
    jobsFinished: number;
  };
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

type Period = "today" | "week" | "month" | "custom";

type OpenOrder = {
  id: string;
  title: string;
  status: WorkOrderStatus;
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | null;
  dueDate: string | null;
  createdAt: string;
  accountId: string;
  account: { name: string };
  assignments: unknown[];
  /** Days since creation, computed once at fetch time — not during render. */
  ageDays: number;
};

const PRIORITY_SERIES = [
  { key: "CRITICAL", label: "Critical", token: "var(--tu-priority-critical)" },
  { key: "HIGH",     label: "High",     token: "var(--tu-priority-high)"     },
  { key: "MEDIUM",   label: "Medium",   token: "var(--tu-priority-medium)"   },
  { key: "LOW",      label: "Low",      token: "var(--tu-priority-low)"      },
] as const;

const PERIOD_LABELS: Record<Period, string> = {
  today: "Today",
  week: "This Week",
  month: "This Month",
  custom: "Custom",
};

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtRange(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const WO_STATUS = (Object.keys(WORK_ORDER_STATUS) as WorkOrderStatus[]).map((key) => ({
  key,
  label: WORK_ORDER_STATUS[key].label,
  color: WORK_ORDER_STATUS[key].color,
}));

// Asset condition, three ways. Reuses the validated health palette rather than
// the retired two-value asset colours.
const COLOR_FUNCTIONAL = "var(--tu-health-good)";
const COLOR_FINDINGS = "var(--tu-health-fair)";
const COLOR_BREAKDOWN = "var(--tu-health-out)";
const COLOR_PRESENT = "var(--tu-health-good)";
const COLOR_ABSENT = "var(--tu-health-out)";

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/**
 * Minutes as hours, with a decimal only while one still tells you something.
 * A morning's work is "9.5h"; a quarter's is "412h" and the fraction is noise.
 */
function fmtHours(minutes: number) {
  const h = minutes / 60;
  if (h < 10) return `${Math.round(h * 10) / 10}h`;
  return `${Math.round(h).toLocaleString()}h`;
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
function IconUserOff() {
  return <Svg><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><line x1="17" y1="8" x2="22" y2="13" /><line x1="22" y1="8" x2="17" y2="13" /></Svg>;
}

function IconBox() {
  return <Svg><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" /></Svg>;
}

function IconChevron({ open }: { open: boolean }) {
  return (
    <svg className={`tu-freq-chevron${open ? " tu-open" : ""}`} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}
function IconArrowRight() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
    </svg>
  );
}

// ── Chart primitives ─────────────────────────────────────
// The charts themselves live in components/charts.tsx — they are shared, and
// each carries a legend, a keyboard-reachable tooltip and a table twin that
// would be noise repeated inline here.

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
  // Signals the /dashboard aggregate doesn't carry: assignment, priority, and
  // age all live on the work-order rows themselves, and low stock is a flag on
  // parts. Both are fetched alongside and degrade silently — the page is fully
  // usable without them.
  const [openOrders, setOpenOrders] = useState<OpenOrder[] | null>(null);
  const [lowStock, setLowStock] = useState<number | null>(null);
  const [accountList, setAccountList] = useState<{ id: string; name: string }[]>([]);
  const [accountFilter, setAccountFilter] = useState<string>(""); // "" = all accounts
  const [period, setPeriod] = useState<Period>("today");
  const [trendWindow, setTrendWindow] = useState<number>(7);
  const [expandedFreq, setExpandedFreq] = useState<string | null>(null);
  const [customFrom, setCustomFrom] = useState(todayISO);
  const [customTo, setCustomTo] = useState(todayISO);
  const [appliedRange, setAppliedRange] = useState<{ from: string; to: string } | null>(null);
  const [customError, setCustomError] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    api.get("/accounts").then((res) => setAccountList(res.data)).catch(() => {});
  }, []);

  useEffect(() => {
    // In custom mode wait until a valid range has been applied.
    if (period === "custom" && !appliedRange) return;
    fetchDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, trendWindow, appliedRange, accountFilter]);

  async function fetchDashboard() {
    setLoading(true);
    setError(false);
    try {
      const params: Record<string, string | number> =
        period === "custom" && appliedRange
          ? { from: appliedRange.from, to: appliedRange.to, trendDays: trendWindow }
          : { period, trendDays: trendWindow };
      if (accountFilter) params.accountId = accountFilter;
      const res = await api.get("/dashboard", { params });
      setData(res.data);

      // Deliberately not awaited with the main request: a slow or failing parts
      // call must not hold up or blank the dashboard.
      api
        .get("/work-orders")
        .then((r) => {
          const now = Date.now();
          const dayMs = 86_400_000;
          const rows: Omit<OpenOrder, "ageDays">[] = r.data;
          setOpenOrders(
            rows
              .filter(
                (w) =>
                  // Not a hand-written list: APPROVED was missing from it, so
                  // signed-off work counted as open — feeding the unassigned
                  // tile, the priority mix and the stalled list, while the new
                  // "Open Work by Account" chart beside them takes its figure
                  // from the server, which excludes it. Two open counts for the
                  // same account on one screen.
                  !isClosed(w) &&
                  (!accountFilter || w.accountId === accountFilter),
              )
              .map((w) => ({
                ...w,
                ageDays: Math.floor((now - new Date(w.createdAt).getTime()) / dayMs),
              })),
          );
        })
        .catch(() => setOpenOrders([]));

      api
        .get("/parts")
        .then((r) => {
          const rows = (Array.isArray(r.data) ? r.data : r.data?.parts ?? []) as {
            isLowStock?: boolean;
            archivedAt?: string | null;
          }[];
          setLowStock(rows.filter((x) => x.isLowStock && !x.archivedAt).length);
        })
        .catch(() => setLowStock(null));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  function handlePeriodChange(p: Period) {
    setPeriod(p);
    // Seed the range so custom fetches immediately with the default (today).
    if (p === "custom" && !appliedRange) setAppliedRange({ from: customFrom, to: customTo });
  }

  function applyCustom() {
    if (customFrom > customTo) {
      setCustomError("From date must be on or before To date.");
      return;
    }
    setCustomError("");
    setAppliedRange({ from: customFrom, to: customTo });
  }

  const periodCaption =
    period === "custom" && appliedRange
      ? `${fmtRange(appliedRange.from)} – ${fmtRange(appliedRange.to)}`
      : PERIOD_LABELS[period].toLowerCase();

  const wo = data?.workOrders;
  const openWOs = (wo?.REQUESTED ?? 0) + (wo?.PENDING ?? 0) + (wo?.IN_PROGRESS ?? 0) + (wo?.ON_HOLD ?? 0);
  const totalWOs = WO_STATUS.reduce((s, x) => s + (wo?.[x.key] ?? 0), 0);
  const totalAssets =
    (data?.assets.FUNCTIONAL ?? 0) +
    (data?.assets.FUNCTIONAL_WITH_FINDINGS ?? 0) +
    (data?.assets.BREAKDOWN ?? 0);
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

  const manHours = data?.manHours ?? { estimatedMinutes: 0, actualMinutes: 0, jobsCompared: 0, jobsFinished: 0 };
  // Signed, so the sentence beside it can say "over" or "under" rather than
  // leaving the reader to work out which direction a bare ratio points.
  const variancePct =
    manHours.estimatedMinutes > 0
      ? Math.round(((manHours.actualMinutes - manHours.estimatedMinutes) / manHours.estimatedMinutes) * 100)
      : null;

  // Busiest first: the account a manager needs to look at is the one with the
  // most outstanding work, and it should not be hunted for down the list.
  const accountLoad = [...(data?.accounts ?? [])]
    .sort((a, b) => b.openWorkOrders - a.openWorkOrders || b.overdueWorkOrders - a.overdueWorkOrders)
    .map((a) => ({
      id: a.id,
      label: a.name,
      values: { open: a.openWorkOrders, overdue: a.overdueWorkOrders },
    }));

  // Deep-link targets are account-aware: when a single account is selected the
  // cards jump straight into that account's pages, otherwise the global ones.
  const woHref = accountFilter ? `/accounts/${accountFilter}/work-orders` : "/work-orders";
  const checklistHref = accountFilter ? `/accounts/${accountFilter}/checklists` : "/pm-checklists";

  const unassignedCount = openOrders?.filter((w) => (w.assignments?.length ?? 0) === 0).length ?? null;

  const priorityCounts = PRIORITY_SERIES.map(({ key }) => ({
    key,
    count: openOrders?.filter((w) => w.priority === key).length ?? 0,
  }));
  const priorityTotal = priorityCounts.reduce((n, x) => n + x.count, 0);

  // "Stalled" is age-based on purpose. Overdue only fires when dueDate < now, so
  // an open work order with no due date can never be flagged however long it
  // sits. This catches that case.
  const STALL_DAYS = 14;
  const stalled = (openOrders ?? [])
    .filter((w) => w.ageDays >= STALL_DAYS)
    .sort((a, b) => b.ageDays - a.ageDays);

  const kpis: {
    label: string;
    accent: string;
    icon: React.ReactNode;
    value: string;
    valueClass?: string;
    sub: string;
    href?: string;
    cta?: string;
  }[] = [
    {
      label: "Open Work Orders",
      accent: "var(--tu-text-brand)",
      icon: <IconClipboard />,
      value: loading ? "—" : String(openWOs),
      valueClass: openWOs > 0 ? "tu-stat-brand" : "",
      sub: loading ? " " : `${wo?.REQUESTED ?? 0} requested · ${wo?.IN_PROGRESS ?? 0} in progress`,
      href: woHref,
      cta: "View work orders",
    },
    {
      label: "Overdue",
      accent: "var(--tu-priority-critical)",
      icon: <IconAlert />,
      value: loading ? "—" : String(overdue),
      valueClass: overdue > 0 ? "tu-stat-danger" : "",
      sub: "work orders past due date",
      href: `${woHref}?status=overdue`,
      cta: overdue > 0 ? "Review overdue" : undefined,
    },
    {
      label: "Unassigned",
      accent: "var(--tu-status-requested)",
      icon: <IconUserOff />,
      value: unassignedCount === null ? "—" : String(unassignedCount),
      valueClass: (unassignedCount ?? 0) > 0 ? "tu-stat-warning" : "",
      sub: unassignedCount === null ? " " : "open work with nobody assigned",
      href: woHref,
      cta: (unassignedCount ?? 0) > 0 ? "Assign work" : undefined,
    },
    {
      label: "Low Stock",
      accent: "var(--tu-health-poor)",
      icon: <IconBox />,
      value: lowStock === null ? "—" : String(lowStock),
      valueClass: (lowStock ?? 0) > 0 ? "tu-stat-warning" : "",
      sub: lowStock === null ? " " : "parts at or below minimum",
      href: "/parts",
      cta: (lowStock ?? 0) > 0 ? "Reorder parts" : undefined,
    },
    {
      label: "Attendance",
      accent: "var(--tu-status-completed)",
      icon: <IconCheck />,
      value: loading ? "—" : attendanceRate === null ? "—" : `${attendanceRate}%`,
      sub: loading ? " " : attendanceTotal > 0 ? `${present} present · ${absent} absent` : "no shifts logged",
    },
    {
      label: "PM Checklists",
      accent: "var(--tu-health-poor)",
      icon: <IconCheck />,
      value: loading ? "—" : `${checklistsDone}/${checklistsTotal}`,
      valueClass: checklistsBehind ? "tu-stat-warning" : "",
      sub: `completed ${periodCaption}`,
      href: checklistHref,
      cta: "Open checklists",
    },
  ];

  return (
    <div className="tu-page">
      {/* Page header */}
      <div className="tu-page-header">
        <div>
          <h1 className="tu-page-title">Dashboard</h1>
          <p className="tu-page-sub">
            {accountFilter
              ? accountList.find((a) => a.id === accountFilter)?.name ?? "Account overview"
              : "Overview across all accounts"}
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <select
            className="tu-select"
            aria-label="Filter by account"
            value={accountFilter}
            onChange={(e) => setAccountFilter(e.target.value)}
          >
            <option value="">All accounts</option>
            {accountList.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>

          <div className="tu-filter-group" role="group" aria-label="Select time period">
            {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => handlePeriodChange(p)}
                className={`tu-period-pill${period === p ? " tu-active-pill" : ""}`}
                aria-pressed={period === p}
              >
                {PERIOD_LABELS[p]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {period === "custom" && (
        <div className="tu-custom-range" role="group" aria-label="Custom date range">
          <div>
            <label htmlFor="dash-from" className="tu-select-label">From</label>
            <input
              id="dash-from"
              type="date"
              className="tu-input"
              value={customFrom}
              max={customTo}
              onChange={(e) => { setCustomFrom(e.target.value); setCustomError(""); }}
            />
          </div>
          <span className="tu-range-sep" aria-hidden="true">–</span>
          <div>
            <label htmlFor="dash-to" className="tu-select-label">To</label>
            <input
              id="dash-to"
              type="date"
              className="tu-input"
              value={customTo}
              min={customFrom}
              max={todayISO()}
              onChange={(e) => { setCustomTo(e.target.value); setCustomError(""); }}
            />
          </div>
          <button type="button" className="tu-btn-primary" onClick={applyCustom}>Apply</button>
          {customError && <p className="tu-range-error" role="alert">{customError}</p>}
        </div>
      )}

      {error && (
        <div className="tu-error-banner" role="alert">
          Failed to load dashboard data. Please try refreshing the page.
        </div>
      )}

      {/* KPI cards */}
      <div className="tu-kpi-grid" aria-label="Key metrics">
        {kpis.map((k) => {
          const inner = (
            <>
              <div className="tu-stat-head">
                <p className="tu-stat-label">{k.label}</p>
                <span className="tu-stat-ico">{k.icon}</span>
              </div>
              <p className={`tu-stat-value${k.valueClass ? " " + k.valueClass : ""}`} aria-live="polite">
                {k.value}
              </p>
              <p className="tu-stat-sub">{k.sub}</p>
              {k.href && !loading && k.cta && (
                <span className="tu-stat-cta">{k.cta} <IconArrowRight /></span>
              )}
            </>
          );
          const style = { ["--tu-accent" as string]: k.accent };
          return k.href ? (
            <Link key={k.label} href={k.href} className="tu-stat-card tu-accent" style={style}>
              {inner}
            </Link>
          ) : (
            <div key={k.label} className="tu-stat-card tu-accent" style={style}>
              {inner}
            </div>
          );
        })}
      </div>

      {/* Trend charts */}
      <div className="tu-trend-section-head">
        <h2>Activity Trends</h2>
        <div className="tu-filter-group" role="group" aria-label="Select trend window">
          {[7, 14, 30].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setTrendWindow(d)}
              className={`tu-period-pill tu-pill-sm${trendWindow === d ? " tu-active-pill" : ""}`}
              aria-pressed={trendWindow === d}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>
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
              <div className="tu-skeleton" style={{ height: 148, borderRadius: 6 }} aria-hidden="true" />
            ) : (
              <TrendChart points={woTrend} color="var(--tu-status-completed)" unit="completed" />
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
              <div className="tu-skeleton" style={{ height: 148, borderRadius: 6 }} aria-hidden="true" />
            ) : (
              <TrendChart points={clTrend} color="var(--tu-text-brand)" unit="completions" />
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
            {!loading && totalWOs > 0 && (
              <StackedBar
                ariaLabel="Work order status distribution"
                segments={WO_STATUS.map((s) => ({
                  key: s.key, label: s.label, value: wo?.[s.key] ?? 0, color: s.color,
                }))}
              />
            )}
            {loading && <div className="tu-skeleton" style={{ height: 28, borderRadius: 6 }} aria-hidden="true" />}
            <ul className="tu-legend">
              {WO_STATUS.map((s) => (
                <li key={s.key}>
                  <span className="tu-dot" style={{ background: s.color }} />
                  {s.label}
                  <span className="tu-legend-val">{loading ? "—" : wo?.[s.key] ?? 0}</span>
                </li>
              ))}
            </ul>

            {/* Urgency, not stage. Kept inside this card rather than given its
                own: the two answer one question together — what is outstanding
                and how badly does it need attention. */}
            {priorityTotal > 0 && (
              <div className="tu-subchart">
                <p className="tu-subchart-label">Open by priority</p>
                <div className="tu-segbar" role="img" aria-label={priorityCounts.map((x) => `${x.key}: ${x.count}`).join(", ")}>
                  {priorityCounts.map(({ key, count }) => {
                    if (count === 0) return null;
                    const meta = PRIORITY_SERIES.find((x) => x.key === key)!;
                    return (
                      <span
                        key={key}
                        style={{ width: `${(count / priorityTotal) * 100}%`, background: meta.token }}
                        title={`${meta.label}: ${count}`}
                      />
                    );
                  })}
                </div>
                <ul className="tu-legend tu-legend-inline">
                  {PRIORITY_SERIES.map(({ key, label, token }) => {
                    const count = priorityCounts.find((x) => x.key === key)?.count ?? 0;
                    if (count === 0) return null;
                    return (
                      <li key={key}>
                        <span className="tu-dot" style={{ background: token }} />
                        {label}
                        <span className="tu-legend-val">{count}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        </div>

        {/* Assets */}
        <div className="tu-card">
          <div className="tu-card-header">
            <h2 className="tu-card-title">Assets</h2>
            {!loading && data && data.poorHealthAssets > 0 && (
              <span className="tu-badge tu-badge-warning">{data.poorHealthAssets} need attention</span>
            )}
          </div>
          <div className="tu-card-body">
            <div className="tu-chart-head">
              <span className="tu-chart-total">{loading ? "—" : totalAssets}</span>
              <span className="tu-chart-cap">total assets</span>
            </div>
            <div className="tu-segbar" role="img" aria-label={`Assets: ${data?.assets.FUNCTIONAL ?? 0} functional, ${data?.assets.FUNCTIONAL_WITH_FINDINGS ?? 0} functional with findings, ${data?.assets.BREAKDOWN ?? 0} in breakdown`}>
              {!loading && totalAssets > 0 && (
                <>
                  <span style={{ width: `${((data?.assets.FUNCTIONAL ?? 0) / totalAssets) * 100}%`, background: COLOR_FUNCTIONAL }} title={`Functional: ${data?.assets.FUNCTIONAL ?? 0}`} />
                  <span style={{ width: `${((data?.assets.FUNCTIONAL_WITH_FINDINGS ?? 0) / totalAssets) * 100}%`, background: COLOR_FINDINGS }} title={`Functional with Findings: ${data?.assets.FUNCTIONAL_WITH_FINDINGS ?? 0}`} />
                  <span style={{ width: `${((data?.assets.BREAKDOWN ?? 0) / totalAssets) * 100}%`, background: COLOR_BREAKDOWN }} title={`Breakdown: ${data?.assets.BREAKDOWN ?? 0}`} />
                </>
              )}
            </div>
            <div>
              <ul className="tu-legend">
                <li>
                  <span className="tu-dot" style={{ background: COLOR_FUNCTIONAL }} />
                  Functional
                  <span className="tu-legend-val">{loading ? "—" : data?.assets.FUNCTIONAL ?? 0}</span>
                </li>
                <li>
                  <span className="tu-dot" style={{ background: COLOR_FINDINGS }} />
                  With Findings
                  <span className="tu-legend-val">{loading ? "—" : data?.assets.FUNCTIONAL_WITH_FINDINGS ?? 0}</span>
                </li>
                <li>
                  <span className="tu-dot" style={{ background: COLOR_BREAKDOWN }} />
                  Breakdown
                  <span className="tu-legend-val">{loading ? "—" : data?.assets.BREAKDOWN ?? 0}</span>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Attendance */}
        <div className="tu-card">
          <div className="tu-card-header">
            <h2 className="tu-card-title">Attendance</h2>
            <span className="tu-chart-cap">{periodCaption}</span>
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

      {/* Man-hours: what the work was quoted at against what it took.
          Kept out of the three-card grid above because it answers a different
          kind of question — those describe the current state of the estate,
          this one is about whether the estimates the business quotes on are
          holding up. */}
      <div className="tu-card" style={{ marginBottom: 24 }}>
        <div className="tu-card-header">
          <h2 className="tu-card-title">Man-hours: Estimated vs Actual</h2>
          <span className="tu-chart-cap">{periodCaption}</span>
        </div>
        <div className="tu-card-body">
          {loading ? (
            <div className="tu-skeleton" style={{ height: 96, borderRadius: 6 }} aria-hidden="true" />
          ) : manHours.jobsCompared === 0 ? (
            <p className="tu-chart-empty">
              No finished job in this period carried both an estimate and recorded time.
              {manHours.jobsFinished > 0 && ` ${manHours.jobsFinished} job${manHours.jobsFinished === 1 ? "" : "s"} finished without one or the other.`}
            </p>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 16 }}>
                <span className="tu-chart-total">{variancePct === null ? "—" : `${variancePct > 0 ? "+" : ""}${variancePct}%`}</span>
                <span className="tu-chart-cap">
                  {variancePct === null ? "no estimate to compare" : variancePct > 0 ? "over estimate" : variancePct < 0 ? "under estimate" : "on estimate"}
                </span>
              </div>
              {/* Minutes go in, hours come out as text. Rounding the values
                  themselves would let the bars disagree with the percentage
                  above them on small totals. */}
              <GroupedBars
                unit="hours"
                headLabel="Measure"
                format={fmtHours}
                series={[
                  { key: "estimated", label: "Estimated", color: "var(--tu-chart-estimated)" },
                  { key: "actual", label: "Actual", color: "var(--tu-chart-actual)" },
                ]}
                groups={[{
                  id: "all",
                  label: "All finished work",
                  values: {
                    estimated: manHours.estimatedMinutes,
                    actual: manHours.actualMinutes,
                  },
                }]}
              />
              {/* States what the comparison actually speaks for. A ratio drawn
                  from a third of the work is a different claim from one drawn
                  from all of it, and the chart should not hide which it is. */}
              {/* The "rest" clause only when there is a rest. At 5 of 5 it
                  contradicted the numbers standing right beside it. */}
              <p className="tu-chart-note">
                Based on {manHours.jobsCompared} of {manHours.jobsFinished} finished job{manHours.jobsFinished === 1 ? "" : "s"}
                {manHours.jobsCompared < manHours.jobsFinished
                  ? " — the rest were closed without an estimate or without the timer run."
                  : ", all of which carried an estimate and recorded time."}
              </p>
            </>
          )}
        </div>
      </div>

      {/* Per-account load. Only earns its place when there is more than one
          account to compare — with a single account the bars restate the KPI
          tiles above, and a one-row comparison is not a comparison. */}
      {(data?.accounts.length ?? 0) > 1 && (
        <div className="tu-card" style={{ marginBottom: 24 }}>
          <div className="tu-card-header">
            <h2 className="tu-card-title">Open Work by Account</h2>
            <span className="tu-chart-cap">outstanding now</span>
          </div>
          <div className="tu-card-body">
            <GroupedBars
              unit="work orders"
              headLabel="Account"
              series={[
                { key: "open", label: "Open", color: "var(--tu-chart-open)" },
                { key: "overdue", label: "Overdue", color: "var(--tu-chart-overdue)" },
              ]}
              groups={accountLoad}
            />
          </div>
        </div>
      )}

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
                const color = done ? "var(--tu-status-completed)" : pct >= 50 ? "var(--tu-text-brand)" : "var(--tu-health-fair)";
                const label = FREQUENCY_LABEL[f.frequency as Frequency] ?? f.frequency;
                const accounts = f.accounts ?? [];
                const expandable = accounts.length > 1;
                const expanded = expandedFreq === f.frequency;
                const panelId = `freq-panel-${f.frequency}`;

                const bar = (
                  <>
                    <span className="tu-freq-name">{label}</span>
                    <div className="tu-freq-bar">
                      <div className="tu-progress">
                        <div style={{ width: `${pct}%`, background: color }} />
                      </div>
                    </div>
                    <span className="tu-freq-val">{f.completed}/{f.total} · {pct}%</span>
                  </>
                );

                return (
                  <div key={f.frequency}>
                    {expandable ? (
                      <button
                        type="button"
                        className="tu-freq-toggle"
                        aria-expanded={expanded}
                        aria-controls={panelId}
                        onClick={() => setExpandedFreq(expanded ? null : f.frequency)}
                      >
                        <IconChevron open={expanded} />
                        {bar}
                      </button>
                    ) : (
                      <div className="tu-freq-row">
                        <span className="tu-freq-spacer" />
                        {bar}
                      </div>
                    )}
                    {expandable && expanded && (
                      <div id={panelId}>
                        {accounts.map((a) => {
                          const apct = a.total > 0 ? Math.round((a.completed / a.total) * 100) : 0;
                          const adone = a.completed >= a.total && a.total > 0;
                          const acolor = adone ? "var(--tu-status-completed)" : apct >= 50 ? "var(--tu-text-brand)" : "var(--tu-health-fair)";
                          return (
                            <div key={a.id} className="tu-subrow">
                              <span className="tu-subrow-name">{a.name}</span>
                              <div className="tu-freq-bar">
                                <div className="tu-progress">
                                  <div style={{ width: `${apct}%`, background: acolor }} />
                                </div>
                              </div>
                              <span className="tu-subrow-val">{a.completed}/{a.total} · {apct}%</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
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
                    <th scope="col" className="tu-center">Open work orders</th>
                    <th scope="col" className="tu-center">Overdue</th>
                    <th scope="col" className="tu-center">{NEEDS_ATTENTION_LABEL}</th>
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
                            className="hover:text-[var(--tu-text-brand)] transition-colors"
                          >
                            {acc.name}
                          </Link>
                        </td>
                        {/* Plain figures, not pills: these are magnitudes, and a
                            pill per count misaligns the digits down the column.
                            The header already names the measure, so colour is
                            emphasis rather than the carrier of meaning. */}
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

        {/* Stalled work — age-based, so it catches undated work that the
            overdue metric structurally cannot see. */}
        {stalled.length > 0 && (
          <div className="tu-card" style={{ marginBottom: 24 }}>
            <div className="tu-card-header">
              <h2 className="tu-card-title">Stalled Work</h2>
              <span className="tu-chart-cap">open {STALL_DAYS}+ days</span>
            </div>
            <table className="tu-table tu-table-interactive">
              <tbody>
                {stalled.slice(0, 6).map((w) => (
                  <tr key={w.id}>
                    <td className="tu-strong">
                      <Link href={`/accounts/${w.accountId}/work-orders/${w.id}`} className="tu-row-link">
                        {w.title}
                      </Link>
                      <span className="tu-row-sub">{w.account?.name}</span>
                    </td>
                    <td className="tu-center" style={{ whiteSpace: "nowrap" }}>
                      <span className={w.ageDays >= 30 ? "tu-figure tu-figure-danger" : "tu-figure tu-figure-warning"}>
                        {w.ageDays}d
                      </span>
                      {!w.dueDate && <span className="tu-chip" style={{ marginLeft: 8 }}>No due date</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {stalled.length > 6 && (
              <div className="tu-card-body" style={{ paddingTop: 12 }}>
                <Link href={woHref} className="tu-stat-cta">
                  {stalled.length - 6} more stalled <IconArrowRight />
                </Link>
              </div>
            )}
          </div>
        )}

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
