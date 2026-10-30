"use client";

/**
 * The widget catalogue: every card the dashboard can show.
 *
 * This is the only place that knows what a widget *is*. The API stores an
 * arrangement as an opaque list of keys and widths and validates nothing about
 * their meaning, so adding a card is one entry here and no backend change at
 * all — and removing one cannot leave a hole in somebody's saved layout,
 * because `reconcile` drops keys this list no longer carries.
 *
 * A widget formats; it does not derive. Every figure comes off `DashboardModel`,
 * which the page computes once — see `lib/dashboardModel.ts` for why that
 * separation is load-bearing rather than tidy.
 */

import { useState } from "react";
import Link from "next/link";
import { NEEDS_ATTENTION_LABEL } from "@/lib/statuses";
import { FREQUENCY_LABEL, type Frequency } from "@/lib/maintenancePlans";
import { TrendChart, StackedBar, GroupedBars } from "@/components/charts";
import {
  PRIORITY_SERIES,
  STALL_DAYS,
  WO_STATUS,
  sliceTrend,
  type DashboardModel,
} from "@/lib/dashboardModel";
import type { WidgetMeta, WidgetOptions } from "@/lib/dashboardLayout";

/** Narrowing helpers — `options` arrives typed as the union of what a setting can hold. */
const num = (o: WidgetOptions, k: string, fallback: number) => (typeof o[k] === "number" ? (o[k] as number) : fallback);
const str = (o: WidgetOptions, k: string, fallback: string) => (typeof o[k] === "string" ? (o[k] as string) : fallback);
const bool = (o: WidgetOptions, k: string, fallback: boolean) => (typeof o[k] === "boolean" ? (o[k] as boolean) : fallback);
const list = (o: WidgetOptions, k: string, fallback: string[]) => (Array.isArray(o[k]) ? (o[k] as string[]) : fallback);

/** The columns Account Summary can show, beyond the account name itself. */
const ACCOUNT_COLUMNS = [
  { value: "open",       label: "Open work orders" },
  { value: "overdue",    label: "Overdue"          },
  { value: "attention",  label: NEEDS_ATTENTION_LABEL },
  { value: "checklists", label: "Checklists"       },
  { value: "attendance", label: "Attendance"       },
];
const ALL_ACCOUNT_COLUMNS = ACCOUNT_COLUMNS.map((c) => c.value);

/** The window a trend card can be pinned to; "auto" follows the page control. */
const TREND_WINDOWS = [
  { value: "auto", label: "Follow page" },
  { value: "7",    label: "7 days"      },
  { value: "14",   label: "14 days"     },
  { value: "30",   label: "30 days"     },
];

// Asset condition, three ways. Reuses the validated health palette rather than
// the retired two-value asset colours.
const COLOR_FUNCTIONAL = "var(--tu-health-good)";
const COLOR_FINDINGS = "var(--tu-health-fair)";
const COLOR_BREAKDOWN = "var(--tu-health-out)";
const COLOR_PRESENT = "var(--tu-health-good)";
const COLOR_ABSENT = "var(--tu-health-out)";

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
export function IconArrowRight() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
    </svg>
  );
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

// ── KPI tiles ────────────────────────────────────────────

type KpiDef = {
  label: string;
  accent: string;
  icon: React.ReactNode;
  value: string;
  valueClass?: string;
  sub: string;
  href?: string;
  cta?: string;
};

function StatCard({ def, loading }: { def: KpiDef; loading: boolean }) {
  const inner = (
    <>
      <div className="tu-stat-head">
        <p className="tu-stat-label">{def.label}</p>
        <span className="tu-stat-ico">{def.icon}</span>
      </div>
      <p className={`tu-stat-value${def.valueClass ? " " + def.valueClass : ""}`} aria-live="polite">
        {/* A skeleton, not "—": the dash already means "nothing recorded"
            (no shifts logged, no ratings), and loading must not read as that. */}
        {loading ? <span className="tu-skeleton tu-stat-skel" aria-label="Loading" /> : def.value}
      </p>
      <p className="tu-stat-sub">{def.sub}</p>
      {def.href && !loading && def.cta && (
        <span className="tu-stat-cta">{def.cta} <IconArrowRight /></span>
      )}
    </>
  );
  const style = { ["--tu-accent" as string]: def.accent };
  return def.href ? (
    <Link href={def.href} className="tu-stat-card tu-accent" style={style}>{inner}</Link>
  ) : (
    <div className="tu-stat-card tu-accent" style={style}>{inner}</div>
  );
}

/**
 * The six tiles, keyed by widget key.
 *
 * Built as one map rather than six separate components because they are one
 * design with six sets of numbers — the moment a tile grew its own markup, the
 * row would stop lining up.
 */
function kpiDefs(m: DashboardModel): Record<string, KpiDef> {
  const { loading, wo } = m;
  return {
    "kpi-open-work-orders": {
      label: "Open Work Orders",
      accent: "var(--tu-text-brand)",
      icon: <IconClipboard />,
      value: loading ? "—" : String(m.openWOs),
      valueClass: m.openWOs > 0 ? "tu-stat-brand" : "",
      sub: loading ? " " : `${wo?.REQUESTED ?? 0} requested · ${wo?.IN_PROGRESS ?? 0} in progress`,
      href: m.woHref,
      cta: "View work orders",
    },
    "kpi-overdue": {
      label: "Overdue",
      accent: "var(--tu-priority-critical)",
      icon: <IconAlert />,
      value: loading ? "—" : String(m.overdue),
      valueClass: m.overdue > 0 ? "tu-stat-danger" : "",
      sub: "work orders past due date",
      href: `${m.woHref}?status=overdue`,
      cta: m.overdue > 0 ? "Review overdue" : undefined,
    },
    "kpi-unassigned": {
      label: "Unassigned",
      accent: "var(--tu-status-requested)",
      icon: <IconUserOff />,
      value: m.unassignedCount === null ? "—" : String(m.unassignedCount),
      valueClass: (m.unassignedCount ?? 0) > 0 ? "tu-stat-warning" : "",
      sub: m.unassignedCount === null ? " " : "open work with nobody assigned",
      href: m.woHref,
      cta: (m.unassignedCount ?? 0) > 0 ? "Assign work" : undefined,
    },
    "kpi-low-stock": {
      label: "Low Stock",
      accent: "var(--tu-health-poor)",
      icon: <IconBox />,
      value: m.lowStock === null ? "—" : String(m.lowStock),
      valueClass: (m.lowStock ?? 0) > 0 ? "tu-stat-warning" : "",
      sub: m.lowStock === null ? " " : "parts at or below minimum",
      href: "/parts",
      cta: (m.lowStock ?? 0) > 0 ? "Reorder parts" : undefined,
    },
    "kpi-attendance": {
      label: "Attendance",
      accent: "var(--tu-status-completed)",
      icon: <IconCheck />,
      value: loading ? "—" : m.attendanceRate === null ? "—" : `${m.attendanceRate}%`,
      sub: loading ? " " : m.attendanceTotal > 0 ? `${m.present} present · ${m.absent} absent` : "no shifts logged",
    },
    "kpi-awaiting-review": {
      label: "Awaiting Review",
      accent: "var(--tu-status-completed)",
      icon: <IconCheck />,
      value: loading || m.data?.awaitingReview == null ? "—" : String(m.data.awaitingReview),
      valueClass: (m.data?.awaitingReview ?? 0) > 0 ? "tu-stat-warning" : "",
      sub: "completed work a supervisor hasn't checked",
      href: `${m.woHref}?flag=REVIEW`,
      cta: (m.data?.awaitingReview ?? 0) > 0 ? "Review work" : undefined,
    },
    "kpi-client-rating": {
      label: "Client Rating",
      accent: "var(--tu-status-approved)",
      icon: <IconCheck />,
      value: loading || m.data?.satisfaction?.overall == null ? "—" : `${m.data.satisfaction.overall.toFixed(1)} / 5`,
      valueClass: (m.data?.satisfaction?.toFollowUp ?? 0) > 0 ? "tu-stat-warning" : "",
      sub: loading || !m.data?.satisfaction
        ? " "
        : m.data.satisfaction.responses === 0
          ? `no ratings in ${m.data.satisfaction.days} days`
          : `${m.data.satisfaction.responses} rating${m.data.satisfaction.responses === 1 ? "" : "s"} · ${m.data.satisfaction.days} days` +
            (m.data.satisfaction.toFollowUp ? ` · ${m.data.satisfaction.toFollowUp} low to follow up` : ""),
      href: "/reports/client-satisfaction",
      cta: "Open report",
    },
    "kpi-pm-checklists": {
      label: "PM Checklists",
      accent: "var(--tu-health-poor)",
      icon: <IconCheck />,
      value: loading ? "—" : `${m.checklistsDone}/${m.checklistsTotal}`,
      valueClass: m.checklistsBehind ? "tu-stat-warning" : "",
      sub: `completed ${m.periodCaption}`,
      href: m.checklistHref,
      cta: "Open checklists",
    },
  };
}

function Kpi({ widgetKey, model }: { widgetKey: string; model: DashboardModel }) {
  const def = kpiDefs(model)[widgetKey];
  if (!def) return null;
  return <StatCard def={def} loading={model.loading} />;
}

// ── Chart and table widgets ──────────────────────────────

function TrendCard({
  label, points, color, unit, loading, days,
}: {
  label: string; points: { date: string; count: number }[];
  color: string; unit: string; loading: boolean; days: number;
}) {
  // Sliced here rather than fetched: the page asks for the widest window the
  // API offers and every card takes what it needs, so two cards on different
  // windows still cost one request. The total follows the slice — a "last 7
  // days" heading over a 30-day sum would be a lie.
  const shown = sliceTrend(points, days);
  const total = shown.reduce((sum, d) => sum + d.count, 0);
  return (
    <div className="tu-card">
      <div className="tu-card-body">
        <div className="tu-chart-head">
          <div>
            <p className="tu-stat-label" style={{ margin: "0 0 6px" }}>{label}</p>
            <span className="tu-chart-total">{loading ? "—" : total}</span>
          </div>
          <span className="tu-chart-cap">last {shown.length} days</span>
        </div>
        {loading ? (
          <div className="tu-skeleton" style={{ height: 148, borderRadius: 6 }} aria-hidden="true" />
        ) : (
          <TrendChart points={shown} color={color} unit={unit} />
        )}
      </div>
    </div>
  );
}

function WorkOrderPipeline({ model: m, showPriority }: { model: DashboardModel; showPriority: boolean }) {
  const { loading, wo, totalWOs, priorityCounts, priorityTotal } = m;
  return (
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
        {showPriority && priorityTotal > 0 && (
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
  );
}

function AssetHealth({ model: m }: { model: DashboardModel }) {
  const { loading, data, totalAssets } = m;
  return (
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
  );
}

function AttendanceCard({ model: m }: { model: DashboardModel }) {
  const { loading, present, absent, attendanceTotal, attendanceRate, periodCaption } = m;
  return (
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
  );
}

function ManHours({ model: m }: { model: DashboardModel }) {
  const { loading, manHours, variancePct, periodCaption } = m;
  return (
    <div className="tu-card">
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
                values: { estimated: manHours.estimatedMinutes, actual: manHours.actualMinutes },
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
  );
}

function OpenWorkByAccount({ model: m, limit }: { model: DashboardModel; limit: number }) {
  // `accountLoad` is already busiest-first, so slicing is "the N that need
  // attention" rather than an arbitrary N.
  const shown = m.accountLoad.slice(0, limit);
  const hidden = m.accountLoad.length - shown.length;
  return (
    <div className="tu-card">
      <div className="tu-card-header">
        <h2 className="tu-card-title">Open Work by Account</h2>
        <span className="tu-chart-cap">
          {hidden > 0 ? `busiest ${shown.length} of ${m.accountLoad.length}` : "outstanding now"}
        </span>
      </div>
      <div className="tu-card-body">
        <GroupedBars
          unit="work orders"
          headLabel="Account"
          series={[
            { key: "open", label: "Open", color: "var(--tu-chart-open)" },
            { key: "overdue", label: "Overdue", color: "var(--tu-chart-overdue)" },
          ]}
          groups={shown}
        />
      </div>
    </div>
  );
}

function PmByFrequency({ model: m }: { model: DashboardModel }) {
  const { loading, data } = m;
  // Local to the widget: which frequency row is expanded is this card's own
  // business, and hoisting it into the page model would make the page re-render
  // every other widget to open one disclosure.
  const [expandedFreq, setExpandedFreq] = useState<string | null>(null);

  return (
    <div className="tu-card">
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
            const label = f.frequency === "CUSTOM_DAYS" ? "Every N days" : FREQUENCY_LABEL[f.frequency as Frequency] ?? f.frequency;
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
  );
}

/** Signed, with a real minus sign: "−2.5", "+1", "0". */
function fmtGap(n: number) {
  if (n === 0) return "0";
  return n > 0 ? `+${n}` : `\u2212${Math.abs(n)}`;
}

function Headcount({ model: m }: { model: DashboardModel }) {
  const { loading, headcount, periodCaption } = m;
  const rows = headcount?.rows ?? [];
  const unset = headcount?.unset ?? 0;
  return (
    <div className="tu-card">
      <div className="tu-card-header">
        <h2 className="tu-card-title">Headcount: Contracted vs Deployed</h2>
        <span className="tu-chart-cap">{periodCaption}</span>
      </div>
      {loading ? (
        <div className="tu-card-body">
          <div className="tu-skeleton" style={{ height: 96, borderRadius: 6 }} aria-hidden="true" />
        </div>
      ) : rows.length === 0 ? (
        <div className="tu-card-body">
          <p className="tu-chart-empty">
            No site&apos;s current contract names a headcount yet. Add it on the site&apos;s Site Profile → Contracts.
          </p>
        </div>
      ) : (
        <>
          <div style={{ overflowX: "auto" }}>
            <table className="tu-table" aria-label="Contracted headcount against roster and attendance">
              <thead>
                <tr>
                  <th scope="col">Site</th>
                  <th scope="col" className="tu-center">Contracted</th>
                  <th scope="col" className="tu-center">On roster</th>
                  <th scope="col" className="tu-center">Avg present / day</th>
                  <th scope="col" className="tu-center">vs contract</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((h) => (
                  <tr key={h.id}>
                    <td className="tu-strong" scope="row">
                      <Link href={`/accounts/${h.id}/profile`} className="tu-row-link">{h.name}</Link>
                    </td>
                    <td className="tu-center"><span className="tu-figure">{h.contracted}</span></td>
                    <td className="tu-center">
                      <span
                        className={h.rosterGap < 0 ? "tu-figure tu-figure-danger" : "tu-figure"}
                        title={h.rosterGap < 0 ? `${-h.rosterGap} short of the contract on the roster itself` : undefined}
                      >
                        {h.rostered}
                      </span>
                    </td>
                    <td className="tu-center">
                      {h.averagePresent === null ? (
                        <span className="tu-figure-zero" title="No attendance recorded in this period">—</span>
                      ) : (
                        <span className="tu-figure" title={`Over ${h.daysRecorded} recorded day${h.daysRecorded === 1 ? "" : "s"}`}>
                          {h.averagePresent}
                        </span>
                      )}
                    </td>
                    <td className="tu-center">
                      {h.presentGap === null ? (
                        <span className="tu-figure-zero">—</span>
                      ) : (
                        <span className={h.presentGap < 0 ? "tu-figure tu-figure-danger" : "tu-figure tu-figure-success"}>
                          {fmtGap(h.presentGap)}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Says what the figures rest on. The roster leaves relievers out
              because one is linked to every site they might cover; they count
              on the days they actually turn up. */}
          <p className="tu-chart-note" style={{ padding: "0 24px 16px" }}>
            Average present counts distinct people per day with attendance recorded, relievers included;
            the roster counts regular staff only.
            {unset > 0 && ` ${unset} site${unset === 1 ? " has" : "s have"} no headcount on its current contract.`}
          </p>
        </>
      )}
    </div>
  );
}

function AccountSummary({ model: m, columns }: { model: DashboardModel; columns: string[] }) {
  const { loading, data } = m;
  const shown = ACCOUNT_COLUMNS.filter((c) => columns.includes(c.value));
  const has = (value: string) => columns.includes(value);
  return (
    <section aria-labelledby="accounts-heading">
      <div className="tu-card">
        <div className="tu-card-header">
          <h2 id="accounts-heading" className="tu-card-title">Account Summary</h2>
          <span className="tu-chart-cap">{loading ? "" : `${data?.accounts.length ?? 0} accounts`}</span>
        </div>
        <div className="tu-scroll-x">
          <table className="tu-table tu-table-interactive" aria-label="Account metrics">
            <thead>
              <tr>
                <th scope="col">Account</th>
                {shown.map((c) => (
                  <th key={c.value} scope="col" className="tu-center">{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <SkeletonRows count={3} cols={shown.length + 1} />
              ) : !data?.accounts.length ? (
                <tr>
                  <td colSpan={shown.length + 1} style={{ textAlign: "center", padding: "32px 24px", color: "var(--tu-text-body)", fontSize: 14 }}>
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
                    {has("open") && (
                      <td className="tu-center">
                        {acc.openWorkOrders > 0
                          ? <span className="tu-figure">{acc.openWorkOrders}</span>
                          : <span className="tu-figure-zero">—</span>}
                      </td>
                    )}
                    {has("overdue") && (
                      <td className="tu-center">
                        {acc.overdueWorkOrders > 0
                          ? <span className="tu-figure tu-figure-danger">{acc.overdueWorkOrders}</span>
                          : <span className="tu-figure-zero">—</span>}
                      </td>
                    )}
                    {has("attention") && (
                      <td className="tu-center">
                        {acc.poorHealthAssets > 0
                          ? <span className="tu-figure tu-figure-warning">{acc.poorHealthAssets}</span>
                          : <span className="tu-figure-zero">—</span>}
                      </td>
                    )}
                    {has("checklists") && (
                      <td className="tu-center" style={{ color: "var(--tu-text-body)" }}>
                        {acc.checklistsDone}/{acc.checklistsTotal}
                      </td>
                    )}
                    {has("attendance") && (
                      <td className="tu-center" style={{ color: "var(--tu-text-body)" }}>
                        {acc.attendanceTotal > 0
                          ? `${acc.attendancePresent}/${acc.attendanceTotal}`
                          : <span style={{ color: "var(--tu-text-subtle)" }}>—</span>}
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function StalledWork({ model: m, days, limit }: { model: DashboardModel; days: number; limit: number }) {
  const { woHref } = m;
  const stalled = m.stalledWork(days);
  return (
    <div className="tu-card">
      <div className="tu-card-header">
        <h2 className="tu-card-title">Stalled Work</h2>
        <span className="tu-chart-cap">open {days}+ days</span>
      </div>
      <table className="tu-table tu-table-interactive">
        <tbody>
          {stalled.slice(0, limit).map((w) => (
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
      {stalled.length > limit && (
        <div className="tu-card-body" style={{ paddingTop: 12 }}>
          <Link href={woHref} className="tu-stat-cta">
            {stalled.length - limit} more stalled <IconArrowRight />
          </Link>
        </div>
      )}
    </div>
  );
}

function RecentActivity({ model: m, limit }: { model: DashboardModel; limit: number }) {
  const { loading, data } = m;
  const entries = (data?.recentActivity ?? []).slice(0, limit);
  return (
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
          ) : !entries.length ? (
            <div style={{ padding: "32px 24px", textAlign: "center", color: "var(--tu-text-body)", fontSize: 14 }}>
              No recent activity.
            </div>
          ) : (
            entries.map((entry) => (
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
  );
}

// ── The catalogue ────────────────────────────────────────

export type DashboardWidget = WidgetMeta & {
  /** Offered to supervisors and above only — see `catalogueFor`. */
  staffOnly?: boolean;
  render: (model: DashboardModel, options: WidgetOptions) => React.ReactNode;
  /**
   * Whether this widget has nothing worth showing right now.
   *
   * Kept as a predicate rather than letting `render` return null, because the
   * two callers want different things from the answer: normally an empty widget
   * is skipped entirely, but while someone is arranging the dashboard it has to
   * stay on screen as a placeholder — a card you cannot see is a card you cannot
   * move, and one that vanished mid-edit would look like the editor had eaten it.
   *
   * It takes the settings too, because emptiness can depend on them: at a
   * 90-day threshold Stalled Work is usually empty when at 14 days it is not.
   */
  isEmpty?: (model: DashboardModel, options: WidgetOptions) => boolean;
  /**
   * A few words distinguishing one instance from another.
   *
   * Only earns its place once a widget can appear twice: two cards both called
   * "Work Orders Completed (trend)" in the card picker are two cards nobody can
   * tell apart. Returns null when the settings are the defaults, so an
   * unconfigured dashboard is not littered with restatements of them.
   */
  summary?: (options: WidgetOptions) => string | null;
};

const KPI_SPANS = [2, 3, 4, 6];

export const CATALOGUE: DashboardWidget[] = [
  ...(
    [
      ["kpi-open-work-orders", "Open Work Orders"],
      ["kpi-overdue", "Overdue"],
      ["kpi-unassigned", "Unassigned"],
      ["kpi-low-stock", "Low Stock"],
      ["kpi-attendance", "Attendance rate"],
      ["kpi-pm-checklists", "PM Checklists"],
      ["kpi-awaiting-review", "Awaiting Review"],
      ["kpi-client-rating", "Client Rating"],
    ] as const
  ).map(([key, title]): DashboardWidget => ({
    key,
    // Supervisors' and managers' figures — the API sends clients neither.
    staffOnly: key === "kpi-awaiting-review" || key === "kpi-client-rating",
    title,
    group: "Key figures",
    defaultSpan: 2,
    spans: KPI_SPANS,
    // No settings, and therefore not duplicable: a KPI tile shows one number
    // and a second copy of it would be the same number again.
    render: (model) => <Kpi widgetKey={key} model={model} />,
  })),

  {
    key: "trend-work-orders",
    title: "Work Orders Completed (trend)",
    group: "Trends",
    defaultSpan: 6,
    spans: [4, 6, 8, 12],
    options: [
      {
        key: "days",
        label: "Window",
        kind: "select",
        choices: TREND_WINDOWS,
        default: "auto",
        help: "Pin this card to a window, or let it follow the page control.",
      },
    ],
    summary: (o) => trendSummary(o),
    render: (m, o) => (
      <TrendCard
        label="Work Orders Completed"
        points={m.woTrend}
        color="var(--tu-status-completed)"
        unit="completed"
        loading={m.loading}
        days={trendDaysFor(m, o)}
      />
    ),
  },
  {
    key: "trend-checklists",
    title: "PM Checklist Completions (trend)",
    group: "Trends",
    defaultSpan: 6,
    spans: [4, 6, 8, 12],
    options: [
      {
        key: "days",
        label: "Window",
        kind: "select",
        choices: TREND_WINDOWS,
        default: "auto",
        help: "Pin this card to a window, or let it follow the page control.",
      },
    ],
    summary: (o) => trendSummary(o),
    render: (m, o) => (
      <TrendCard
        label="PM Checklist Completions"
        points={m.clTrend}
        color="var(--tu-text-brand)"
        unit="completions"
        loading={m.loading}
        days={trendDaysFor(m, o)}
      />
    ),
  },

  {
    key: "work-order-pipeline",
    title: "Work Order Pipeline",
    group: "Breakdowns",
    defaultSpan: 4,
    spans: [3, 4, 6, 12],
    options: [
      { key: "showPriority", label: "Show open-by-priority bar", kind: "boolean", default: true },
    ],
    summary: (o) => (bool(o, "showPriority", true) ? null : "status only"),
    render: (m, o) => <WorkOrderPipeline model={m} showPriority={bool(o, "showPriority", true)} />,
  },
  {
    key: "asset-health",
    title: "Assets",
    group: "Breakdowns",
    defaultSpan: 4,
    spans: [3, 4, 6, 12],
    render: (m) => <AssetHealth model={m} />,
  },
  {
    key: "attendance",
    title: "Attendance",
    group: "Breakdowns",
    defaultSpan: 4,
    spans: [3, 4, 6, 12],
    render: (m) => <AttendanceCard model={m} />,
  },

  {
    key: "man-hours",
    title: "Man-hours: Estimated vs Actual",
    group: "Comparisons",
    defaultSpan: 12,
    spans: [4, 6, 8, 12],
    render: (m) => <ManHours model={m} />,
  },
  {
    key: "open-work-by-account",
    title: "Open Work by Account",
    group: "Comparisons",
    defaultSpan: 12,
    spans: [6, 8, 12],
    options: [
      {
        key: "limit",
        label: "Accounts shown",
        kind: "number",
        min: 3,
        max: 30,
        default: 10,
        suffix: "busiest",
        help: "The list is busiest-first, so this keeps the sites that need attention.",
      },
    ],
    summary: (o) => `top ${num(o, "limit", 10)}`,
    render: (m, o) => <OpenWorkByAccount model={m} limit={num(o, "limit", 10)} />,
    // With a single account the bars restate the KPI tiles above, and a one-row
    // comparison is not a comparison.
    isEmpty: (m) => (m.data?.accounts.length ?? 0) <= 1,
  },
  {
    key: "pm-by-frequency",
    title: "PM Checklist Completion by Frequency",
    group: "Comparisons",
    defaultSpan: 12,
    spans: [6, 8, 12],
    render: (m) => <PmByFrequency model={m} />,
    isEmpty: (m) => !m.loading && (m.data?.checklistBreakdown.length ?? 0) === 0,
  },

  {
    key: "headcount",
    title: "Headcount: Contracted vs Deployed",
    group: "Comparisons",
    defaultSpan: 12,
    spans: [6, 8, 12],
    render: (m) => <Headcount model={m} />,
    // Staff only: the API leaves the block out for a client, and the card
    // stands down rather than telling them nothing has been entered.
    isEmpty: (m) => m.headcount === null,
  },

  {
    key: "account-summary",
    title: "Account Summary",
    group: "Lists",
    defaultSpan: 8,
    spans: [6, 8, 12],
    options: [
      {
        key: "columns",
        label: "Columns",
        kind: "multi",
        choices: ACCOUNT_COLUMNS,
        default: ALL_ACCOUNT_COLUMNS,
        help: "The account name always shows.",
      },
    ],
    summary: (o) => {
      const chosen = list(o, "columns", ALL_ACCOUNT_COLUMNS);
      return chosen.length === ALL_ACCOUNT_COLUMNS.length ? null : `${chosen.length} of ${ALL_ACCOUNT_COLUMNS.length} columns`;
    },
    render: (m, o) => <AccountSummary model={m} columns={list(o, "columns", ALL_ACCOUNT_COLUMNS)} />,
  },
  {
    key: "recent-activity",
    title: "Recent Activity",
    group: "Lists",
    defaultSpan: 4,
    spans: [4, 6, 12],
    options: [
      // 15 is what the API returns, so it is both the default and the ceiling —
      // offering 50 would be offering rows that do not exist.
      { key: "limit", label: "Entries shown", kind: "number", min: 3, max: 15, default: 15, suffix: "rows" },
    ],
    summary: (o) => (num(o, "limit", 15) === 15 ? null : `${num(o, "limit", 15)} rows`),
    render: (m, o) => <RecentActivity model={m} limit={num(o, "limit", 15)} />,
  },
  {
    key: "stalled-work",
    title: "Stalled Work",
    group: "Lists",
    defaultSpan: 12,
    spans: [6, 8, 12],
    options: [
      {
        key: "stallDays",
        label: "Counts as stalled after",
        kind: "number",
        min: 3,
        max: 90,
        default: STALL_DAYS,
        suffix: "days",
        help: "Age-based, so it catches open work with no due date — which the overdue count structurally cannot see.",
      },
      { key: "limit", label: "Rows shown", kind: "number", min: 3, max: 20, default: 6, suffix: "rows" },
    ],
    summary: (o) => `${num(o, "stallDays", STALL_DAYS)}+ days`,
    render: (m, o) => (
      <StalledWork model={m} days={num(o, "stallDays", STALL_DAYS)} limit={num(o, "limit", 6)} />
    ),
    isEmpty: (m, o) => m.stalledWork(num(o, "stallDays", STALL_DAYS)).length === 0,
  },
];

export const CATALOGUE_BY_KEY = new Map(CATALOGUE.map((w) => [w.key, w]));

/**
 * The catalogue as one role sees it. A staff-only card is left out of a
 * client's catalogue altogether, so `reconcile` drops it from their layout and
 * the defaults never place it — rather than drawing a tile of dashes.
 */
export function catalogueFor(role: string | undefined): DashboardWidget[] {
  const staff = role === "GENERAL_MANAGER" || role === "MANAGER" || role === "SUPERVISOR";
  return staff ? CATALOGUE : CATALOGUE.filter((w) => !w.staffOnly);
}

/** "Stalled Work · 30+ days" — what distinguishes one instance from another. */
export function instanceTitle(meta: DashboardWidget, options: WidgetOptions): string {
  const extra = meta.summary?.(options);
  return extra ? `${meta.title} · ${extra}` : meta.title;
}

/** The window a trend card is actually drawing, resolving "auto" against the page. */
function trendDaysFor(m: DashboardModel, o: WidgetOptions): number {
  const choice = str(o, "days", "auto");
  return choice === "auto" ? m.pageTrendDays : Number(choice);
}

function trendSummary(o: WidgetOptions): string | null {
  const choice = str(o, "days", "auto");
  return choice === "auto" ? null : `${choice} days`;
}
