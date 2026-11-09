"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import api from "@/lib/api";
import Breadcrumbs from "@/components/Breadcrumbs";
import AccountFilter, { type FilterAccount } from "@/components/AccountFilter";
import { formatMinutes } from "@/lib/durations";
import { PrintReportButton, PrintReportHeader, dateRangeLabel, siteScope } from "@/components/ReportPrint";

/**
 * The KPI scorecard: one page of maintenance KPIs, for every site in reach,
 * each site, and month by month. Every figure comes from GET /reports/kpis
 * (backend/helpers/kpis.js, which says what each one means); this page only
 * lays it out and says in plain words what each figure is.
 */

type Mix = { preventive: number; inspection: number; project: number; reactive: number };
type Kpis = {
  work: {
    completed: number; mix: Mix; breakdowns: number; plannedPct: number | null; reactivePct: number | null;
    dated: number; onTime: number; onTimePct: number | null; hoursLogged: number; hoursVsEstimate: number | null;
  };
  backlog: {
    open: number; overdue: number; finishedPerWeek: number; backlogWeeks: number | null;
    openEstimatedHours: number; openWithoutEstimate: number;
  };
  checklists: { checklists: number; periodsDue: number; submitted: number; missed: number; compliancePct: number | null; onTimePct: number | null };
  reliability: {
    availability: number | null; mttrHours: number | null; mtbfHours: number | null;
    failures: number; assetsDownNow: number; cameBackPct: number | null;
  };
  response: { medianMinutesToStart: number | null; medianMinutesToAccept: number | null };
  rating: { overall: number | null; responses: number; responseRatePct: number | null };
};
type Report = {
  from: string;
  to: string;
  totals: Kpis;
  bySite: (Kpis & { account: { id: string; name: string } })[];
  byMonth: { month: string; completed: number; mix: Mix; plannedPct: number | null; onTimePct: number | null; hoursLogged: number }[];
  paceDays: number;
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

const KINDS: { key: keyof Mix; label: string; color: string }[] = [
  { key: "preventive", label: "Preventive (plans)", color: "var(--tu-chart-teal)" },
  { key: "inspection", label: "From checklist findings", color: "var(--tu-chart-estimated)" },
  { key: "project", label: "Projects", color: "var(--tu-chart-amber)" },
  { key: "reactive", label: "Reactive (requests, breakdowns)", color: "var(--tu-chart-pink)" },
];

const pct = (v: number | null) => (v == null ? "—" : `${v}%`);
const availability = (v: number | null) => (v == null ? "—" : `${Math.round(v * 1000) / 10}%`);
const hours = (v: number | null) => (v == null ? "—" : v >= 48 ? `${Math.round(v / 2.4) / 10} days` : `${v} h`);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const monthLabel = (key: string) => {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleString("en-US", { month: "short", year: "numeric" });
};

function Tile({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: "danger" | "warning" }) {
  return (
    <div className="tu-stat-card">
      <p className="tu-stat-label">{label}</p>
      <p className={`tu-stat-value${tone ? ` tu-stat-${tone}` : ""}`}>{value}</p>
      <p className="tu-stat-sub">{sub}</p>
    </div>
  );
}

function Group({ title, note, children }: { title: string; note: string; children: React.ReactNode }) {
  return (
    <section className="tu-kpi-group">
      <div className="tu-kpi-group-head">
        <h2 className="tu-card-title">{title}</h2>
        <p className="tu-person-muted">{note}</p>
      </div>
      <div className="tu-kpi-grid tu-kpi-grid-4">{children}</div>
    </section>
  );
}

/** The kinds of finished work as one bar, each share labelled in the legend. */
function MixBar({ mix, total }: { mix: Mix; total: number }) {
  if (!total) return <p className="tu-person-empty">Nothing finished in this period.</p>;
  return (
    <div>
      <div className="tu-mix-bar" role="img" aria-label={KINDS.map((k) => `${k.label}: ${mix[k.key]}`).join(", ")}>
        {KINDS.filter((k) => mix[k.key] > 0).map((k) => (
          <span key={k.key} style={{ width: `${(mix[k.key] / total) * 100}%`, background: k.color }} />
        ))}
      </div>
      <ul className="tu-mix-legend">
        {KINDS.map((k) => (
          <li key={k.key}>
            <i style={{ background: k.color }} aria-hidden="true" />
            {k.label}
            <span className="tu-figure">{mix[k.key]}</span>
            <span className="tu-person-muted">{Math.round((mix[k.key] / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function KpiPage() {
  const [range, setRange] = useState<RangeKey>("MONTH");
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
      .get(`/reports/kpis?${query}`)
      .then((res) => { if (!cancelled) { setData(res.data); setError(false); } })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [query]);

  const shown = rangeDates(range);
  const t = data?.totals;

  return (
    <div className="tu-page">
      <PrintReportHeader title="Maintenance KPIs" scope={siteScope(selected, accounts)} period={dateRangeLabel(shown.from, shown.to)} />
      <div className="tu-no-print">
        <Breadcrumbs items={[{ label: "Reports", href: "/reports" }, { label: "KPIs" }]} />
      </div>

      <div className="tu-page-header">
        <div>
          <h1 className="tu-page-title tu-no-print">Maintenance KPIs</h1>
          <p className="tu-page-sub">
            How the maintenance is going, in a dozen figures: the work finished in the period, the queue as it
            stands today, checklists and equipment, and what clients said.
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

      {error && <div className="tu-error-banner" role="alert">Couldn&apos;t load the KPIs.</div>}

      {!data || !t ? (
        !error && <div className="tu-skeleton" style={{ height: 160 }} />
      ) : (
        <>
          <Group title="Work finished" note="Jobs completed in the period.">
            <Tile label="Jobs finished" value={String(t.work.completed)} sub={`${plural(t.work.breakdowns, "breakdown")} among them`} />
            <Tile
              label="Planned work"
              value={pct(t.work.plannedPct)}
              sub="Share that was planned: maintenance plans, checklist findings and projects. The rest was reactive."
            />
            <Tile
              label="Finished on time"
              value={pct(t.work.onTimePct)}
              sub={t.work.dated ? `${t.work.onTime} of ${t.work.dated} jobs with a due date, on or before the due day` : "No finished job had a due date"}
              tone={t.work.onTimePct != null && t.work.onTimePct < 80 ? "warning" : undefined}
            />
            <Tile
              label="Hours logged"
              value={`${t.work.hoursLogged} h`}
              sub={t.work.hoursVsEstimate == null
                ? "No job had both an estimate and clocked time"
                : `${Math.round(t.work.hoursVsEstimate * 100)}% of the estimate, on jobs that had one`}
            />
          </Group>

          <section className="tu-card" style={{ marginBottom: 24 }}>
            <div className="tu-card-header"><h2 className="tu-card-title">What kind of work it was</h2></div>
            <div style={{ padding: "0 24px 20px" }}>
              <MixBar mix={t.work.mix} total={t.work.completed} />
            </div>
          </section>

          <Group title="The queue today" note="Open jobs right now, whatever period is picked above.">
            <Tile label="Open jobs" value={String(t.backlog.open)} sub={`${t.backlog.openEstimatedHours} h estimated · ${t.backlog.openWithoutEstimate} without an estimate`} />
            <Tile label="Overdue" value={String(t.backlog.overdue)} sub="Open and past the due date" tone={t.backlog.overdue ? "danger" : undefined} />
            <Tile
              label="Backlog"
              value={t.backlog.backlogWeeks == null ? "—" : `${t.backlog.backlogWeeks} wk`}
              sub={t.backlog.backlogWeeks == null
                ? `Nothing finished in the last ${data.paceDays} days to measure the pace by`
                : "Time to clear the open jobs at the recent pace"}
              tone={t.backlog.backlogWeeks != null && t.backlog.backlogWeeks > 4 ? "warning" : undefined}
            />
            <Tile label="Pace" value={`${t.backlog.finishedPerWeek} / wk`} sub={`Jobs finished per week, last ${data.paceDays} days`} />
          </Group>

          <Group title="Checklists and equipment" note="PM rounds due in the period, and the assets' breakdown record.">
            <Tile
              label="PM compliance"
              value={pct(t.checklists.compliancePct)}
              sub={t.checklists.periodsDue
                ? `${t.checklists.submitted} of ${t.checklists.periodsDue} rounds done · ${t.checklists.missed} missed`
                : "No checklist rounds were due"}
              tone={t.checklists.missed ? "warning" : undefined}
            />
            <Tile
              label="Equipment available"
              value={availability(t.reliability.availability)}
              sub={`${plural(t.reliability.failures, "breakdown")} · ${t.reliability.assetsDownNow} down now`}
            />
            <Tile
              label="Time to repair (MTTR)"
              value={hours(t.reliability.mttrHours)}
              sub={`Between breakdowns (MTBF): ${hours(t.reliability.mtbfHours)}`}
            />
            <Tile
              label="Came back"
              value={pct(t.reliability.cameBackPct)}
              sub="Finished jobs on an asset that needed a follow-up within 30 days"
              tone={t.reliability.cameBackPct != null && t.reliability.cameBackPct > 10 ? "warning" : undefined}
            />
          </Group>

          <Group title="Clients and response" note="Ratings given and jobs raised in the period.">
            <Tile
              label="Client rating"
              value={t.rating.overall == null ? "—" : `${t.rating.overall} / 5`}
              sub={t.rating.responses ? `${plural(t.rating.responses, "rating")} · ${pct(t.rating.responseRatePct)} of signed-off jobs rated` : "No ratings in this period"}
            />
            <Tile label="Time to accept" value={formatMinutes(t.response.medianMinutesToAccept)} sub="Typical wait before a client request is accepted" />
            <Tile label="Time to start" value={formatMinutes(t.response.medianMinutesToStart)} sub="Typical wait from raised to work started (plan work not counted)" />
            <div className="tu-stat-card tu-kpi-links tu-no-print">
              <p className="tu-stat-label">More detail</p>
              <Link href="/reports/response-times">Response times →</Link>
              <Link href="/reports/client-satisfaction">Client satisfaction →</Link>
              <Link href="/reports">Performance report →</Link>
            </div>
          </Group>

          {data.byMonth.length > 1 && (
            <section className="tu-card" style={{ marginBottom: 24 }}>
              <div className="tu-card-header"><h2 className="tu-card-title">Month by month</h2></div>
              <div className="tu-scroll-x">
                <table className="tu-table">
                  <thead>
                    <tr>
                      <th scope="col">Month</th>
                      <th scope="col" className="tu-center">Jobs finished</th>
                      <th scope="col" className="tu-center">Planned</th>
                      <th scope="col" className="tu-center">On time</th>
                      <th scope="col" className="tu-center">Hours logged</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byMonth.map((m) => (
                      <tr key={m.month}>
                        <td className="tu-strong">{monthLabel(m.month)}</td>
                        <td className="tu-center"><span className="tu-figure">{m.completed}</span></td>
                        <td className="tu-center">{pct(m.plannedPct)}</td>
                        <td className="tu-center">{pct(m.onTimePct)}</td>
                        <td className="tu-center">{m.hoursLogged}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {data.bySite.length > 1 && (
            <section className="tu-card">
              <div className="tu-card-header"><h2 className="tu-card-title">By site</h2></div>
              <div className="tu-scroll-x">
                <table className="tu-table">
                  <thead>
                    <tr>
                      <th scope="col">Site</th>
                      <th scope="col" className="tu-center">Jobs finished</th>
                      <th scope="col" className="tu-center">Planned</th>
                      <th scope="col" className="tu-center">On time</th>
                      <th scope="col" className="tu-center">Open</th>
                      <th scope="col" className="tu-center">Overdue</th>
                      <th scope="col" className="tu-center">Backlog</th>
                      <th scope="col" className="tu-center">PM compliance</th>
                      <th scope="col" className="tu-center">Available</th>
                      <th scope="col" className="tu-center">Rating</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.bySite.map((s) => (
                      <tr key={s.account.id}>
                        <td style={{ whiteSpace: "nowrap" }}><Link href={`/accounts/${s.account.id}`} className="tu-row-link">{s.account.name}</Link></td>
                        <td className="tu-center"><span className="tu-figure">{s.work.completed}</span></td>
                        <td className="tu-center">{pct(s.work.plannedPct)}</td>
                        <td className="tu-center">{pct(s.work.onTimePct)}</td>
                        <td className="tu-center">{s.backlog.open}</td>
                        <td className="tu-center">{s.backlog.overdue ? <span className="tu-stat-danger">{s.backlog.overdue}</span> : 0}</td>
                        <td className="tu-center">{s.backlog.open === 0 ? "None open" : s.backlog.backlogWeeks == null ? "—" : `${s.backlog.backlogWeeks} wk`}</td>
                        <td className="tu-center">{pct(s.checklists.compliancePct)}</td>
                        <td className="tu-center">{availability(s.reliability.availability)}</td>
                        <td className="tu-center">{s.rating.overall == null ? "—" : `${s.rating.overall} / 5`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <p className="tu-person-muted" style={{ marginTop: 20, fontSize: 12 }}>
            A dash means there is nothing to measure yet, not zero. Equipment figures come from breakdowns flagged on
            jobs and the asset&apos;s condition; a site that never flags a breakdown shows none.
          </p>
        </>
      )}
    </div>
  );
}
