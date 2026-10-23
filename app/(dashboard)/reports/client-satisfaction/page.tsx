"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import api from "@/lib/api";
import Breadcrumbs from "@/components/Breadcrumbs";
import AccountFilter, { type FilterAccount } from "@/components/AccountFilter";
import EmptyState from "@/components/EmptyState";
import { Stars } from "@/components/ClientSurvey";
import { workOrderRef } from "@/lib/workOrders";

/**
 * The client satisfaction scorecard: what clients said about finished work,
 * by site, by month and by the people who did it. Supervisors and above only —
 * the route under /reports is already STAFF, and the API refuses anyone else.
 *
 * Every figure comes from GET /reports/client-satisfaction (helpers/
 * clientSatisfaction.js); this page only lays it out.
 */

type Block = {
  responses: number;
  overall: number | null;
  quality: number | null;
  timeliness: number | null;
  communication: number | null;
};

type Scorecard = {
  totals: Block & { eligible: number; responseRatePct: number | null; low: number; lowAwaitingFollowUp: number };
  lowRatings: {
    id: string; overall: number; comment: string | null; createdAt: string; by: string;
    account: { id: string; name: string };
    workOrder: { id: string; number: number; title: string };
    followUpNote: string | null; followedUpAt: string | null; followedUpByName: string | null;
  }[];
  distribution: { stars: number; count: number }[];
  bySite: (Block & { account: { id: string; name: string }; eligible: number; responseRatePct: number | null; low: number })[];
  byMonth: (Block & { month: string })[];
  byTechnician: (Block & { employee: { id: string; name: string } })[];
  comments: {
    id: string;
    overall: number;
    comment: string;
    createdAt: string;
    by: string;
    account: { id: string; name: string };
    workOrder: { id: string; number: number; title: string };
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

function rangeDates(key: RangeKey): { from: string; to: string } {
  const today = new Date();
  const from = new Date(today);
  if (key === "MONTH") from.setDate(1);
  else if (key === "YEAR") { from.setMonth(0); from.setDate(1); }
  else from.setDate(today.getDate() - Number(key) + 1);
  return { from: ymd(from), to: ymd(today) };
}

const score = (v: number | null) => (v == null ? "—" : v.toFixed(1));
const monthLabel = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, 1)).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
};

export default function ClientSatisfactionPage() {
  const [range, setRange] = useState<RangeKey>("90");
  const [accounts, setAccounts] = useState<FilterAccount[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [data, setData] = useState<Scorecard | null>(null);
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
      .get(`/reports/client-satisfaction?${query}`)
      .then((res) => { if (!cancelled) { setData(res.data); setError(false); } })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [query]);

  const t = data?.totals;

  return (
    <div className="tu-page">
      <Breadcrumbs items={[{ label: "Reports", href: "/reports" }, { label: "Client satisfaction" }]} />

      <div className="tu-page-header">
        <div>
          <h1 className="tu-page-title">Client satisfaction</h1>
          <p className="tu-page-sub">What clients said about finished work. Seen by supervisors and managers only.</p>
        </div>
      </div>

      <div className="tu-toolbar" style={{ flexWrap: "wrap", gap: 12 }}>
        <div className="tu-chip-row" role="group" aria-label="Period">
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              className="tu-chip-toggle"
              aria-pressed={range === r.key}
              onClick={() => setRange(r.key)}
            >
              {r.label}
            </button>
          ))}
        </div>
        {accounts.length > 1 && <AccountFilter accounts={accounts} selected={selected} onChange={setSelected} />}
      </div>

      {error && <div className="tu-error-banner" role="alert">Couldn&apos;t load the report.</div>}

      {!data ? (
        !error && <div className="tu-skeleton" style={{ height: 120 }} />
      ) : t && t.responses === 0 && t.eligible === 0 ? (
        <div className="tu-card">
          <EmptyState icon="activity" title="Nothing to report yet" hint="Ratings appear here once clients rate signed-off work." />
        </div>
      ) : (
        <>
          <div className="tu-kpi-grid">
            <div className="tu-stat-card">
              <p className="tu-stat-label">Average rating</p>
              <p className="tu-stat-value">{score(t!.overall)}<span className="tu-stat-sub"> / 5</span></p>
              <Stars value={t!.overall ? Math.round(t!.overall) : null} label="Average rating" size="sm" />
            </div>
            <div className="tu-stat-card">
              <p className="tu-stat-label">Response rate</p>
              <p className="tu-stat-value">{t!.responseRatePct != null ? `${t!.responseRatePct}%` : "—"}</p>
              <p className="tu-stat-sub">{t!.responses} rating{t!.responses === 1 ? "" : "s"} · {t!.eligible} job{t!.eligible === 1 ? "" : "s"} signed off</p>
            </div>
            <div className="tu-stat-card">
              <p className="tu-stat-label">Low ratings (1–2)</p>
              <p className={`tu-stat-value${t!.lowAwaitingFollowUp ? " tu-stat-danger" : ""}`}>{t!.low}</p>
              <p className="tu-stat-sub">
                {t!.low ? `${t!.lowAwaitingFollowUp} awaiting follow-up · ` : ""}
                {data.distribution.slice().reverse().map((d) => `${d.stars}★ ${d.count}`).join(" · ")}
              </p>
            </div>
          </div>

          {data.lowRatings.length > 0 && (
            <section className="tu-card" style={{ marginBottom: 24 }}>
              <div className="tu-card-header"><h2 className="tu-card-title">Low ratings</h2></div>
              <p className="tu-person-muted" style={{ padding: "0 24px", fontSize: 12 }}>
                Ratings of 1 or 2, the ones nobody has followed up first. Open the job to record what was done.
              </p>
              <ul role="list" className="tu-person-list">
                {data.lowRatings.map((r) => (
                  <li key={r.id}>
                    <Stars value={r.overall} label="Rating" size="sm" />{" "}
                    <Link href={`/accounts/${r.account.id}/work-orders/${r.workOrder.id}`} className="tu-link">
                      {workOrderRef(r.workOrder.number)} · {r.workOrder.title}
                    </Link>
                    <span className="tu-person-muted"> — {r.account.name}</span>
                    {r.comment && <span> · “{r.comment}”</span>}
                    <br />
                    {r.followedUpAt ? (
                      <span className="tu-person-ok">
                        Followed up by {r.followedUpByName}: {r.followUpNote}
                      </span>
                    ) : (
                      <span className="tu-person-bad">Not followed up yet</span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="tu-card" style={{ marginBottom: 24 }}>
            <div className="tu-card-header"><h2 className="tu-card-title">By site</h2></div>
            <div style={{ overflowX: "auto" }}>
              <table className="tu-table">
                <thead>
                  <tr>
                    <th scope="col">Site</th>
                    <th scope="col" className="tu-center">Rating</th>
                    <th scope="col" className="tu-center">Quality</th>
                    <th scope="col" className="tu-center">Timeliness</th>
                    <th scope="col" className="tu-center">Communication</th>
                    <th scope="col" className="tu-center">Ratings</th>
                    <th scope="col" className="tu-center">Response rate</th>
                    <th scope="col" className="tu-center">Low</th>
                  </tr>
                </thead>
                <tbody>
                  {data.bySite.map((r) => (
                    <tr key={r.account.id}>
                      <td className="tu-strong">{r.account.name}</td>
                      <td className="tu-center"><span className="tu-figure">{score(r.overall)}</span></td>
                      <td className="tu-center">{score(r.quality)}</td>
                      <td className="tu-center">{score(r.timeliness)}</td>
                      <td className="tu-center">{score(r.communication)}</td>
                      <td className="tu-center">{r.responses}</td>
                      <td className="tu-center">{r.responseRatePct != null ? `${r.responseRatePct}%` : "—"}</td>
                      <td className="tu-center">
                        {r.low ? <span className="tu-figure tu-figure-danger">{r.low}</span> : <span className="tu-figure-zero">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <div className="tu-person-grid">
            <section className="tu-card">
              <div className="tu-card-header"><h2 className="tu-card-title">By month</h2></div>
              {data.byMonth.length === 0 ? (
                <p className="tu-person-empty">No ratings in this period.</p>
              ) : (
                <table className="tu-table">
                  <thead>
                    <tr>
                      <th scope="col">Month</th>
                      <th scope="col" className="tu-center">Rating</th>
                      <th scope="col" className="tu-center">Ratings</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byMonth.map((m) => (
                      <tr key={m.month}>
                        <td>{monthLabel(m.month)}</td>
                        <td className="tu-center"><span className="tu-figure">{score(m.overall)}</span></td>
                        <td className="tu-center">{m.responses}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            <section className="tu-card">
              <div className="tu-card-header">
                <h2 className="tu-card-title">By technician</h2>
              </div>
              <p className="tu-person-empty" style={{ paddingBottom: 0 }}>
                Average over the rated jobs each person was assigned to — a job&apos;s rating counts for everyone on it.
              </p>
              {data.byTechnician.length === 0 ? (
                <p className="tu-person-empty">No rated jobs with someone assigned.</p>
              ) : (
                <table className="tu-table">
                  <thead>
                    <tr>
                      <th scope="col">Name</th>
                      <th scope="col" className="tu-center">Rating</th>
                      <th scope="col" className="tu-center">Rated jobs</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byTechnician.map((p) => (
                      <tr key={p.employee.id}>
                        <td><Link href={`/employees/${p.employee.id}`} className="tu-row-link">{p.employee.name}</Link></td>
                        <td className="tu-center"><span className="tu-figure">{score(p.overall)}</span></td>
                        <td className="tu-center">{p.responses}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          </div>

          <section className="tu-card" style={{ marginTop: 24 }}>
            <div className="tu-card-header"><h2 className="tu-card-title">What clients said</h2></div>
            {data.comments.length === 0 ? (
              <p className="tu-person-empty">No comments in this period.</p>
            ) : (
              <ul role="list" className="tu-person-list">
                {data.comments.map((c) => (
                  <li key={c.id}>
                    <Stars value={c.overall} label="Rating" size="sm" />{" "}
                    <span>“{c.comment}”</span>
                    <span className="tu-person-muted">
                      {" "}— {c.by}, {c.account.name} ·{" "}
                      <Link href={`/accounts/${c.account.id}/work-orders/${c.workOrder.id}`} className="tu-link">
                        {workOrderRef(c.workOrder.number)}
                      </Link>{" "}
                      · {new Date(c.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
