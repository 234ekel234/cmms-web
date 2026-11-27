"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import api, { errorMessage } from "@/lib/api";
import { startLoad } from "@/lib/startLoad";
import { useAuth } from "@/context/AuthContext";
import EmptyState from "@/components/EmptyState";
import { WORK_ORDER_PRIORITY, workOrderStatusMeta, type WorkOrderPriority } from "@/lib/statuses";
import { workOrderRef } from "@/lib/workOrders";
import { warmPages } from "@/lib/offline";
import { listOutbox, OUTBOX_EVENT, roundsOf, type OutboxRound } from "@/lib/offlineOutbox";

/**
 * Today — a technician's day on one screen (GET /me/today, backend
 * helpers/myDay.js): their jobs by urgency, the PM rounds still to do on their
 * sites, and their own shifts for the next two weeks. Where a technician lands.
 *
 * The page groups and formats; it decides nothing. Which bucket a job is in and
 * where a checklist stands come from the API, so this cannot disagree with the
 * queue or the 08:00 reminder.
 */

type Bucket = "inProgress" | "onHold" | "overdue" | "today" | "soon" | "later";

type Job = {
  id: string;
  number: number;
  title: string;
  status: string;
  priority: WorkOrderPriority;
  dueDate: string | null;
  accountId: string;
  siteName: string | null;
  assetName: string | null;
  locationPath: string | null;
  clockRunning: boolean;
  steps: { done: number; total: number };
  holdReason: string | null;
  bucket: Bucket;
};

type Round = {
  assignmentId: string;
  accountId: string;
  siteName: string | null;
  name: string;
  assetName: string | null;
  locationPath: string | null;
  standing: "missed" | "ending" | "open";
  dueBy: string;
  periodStart: string;
  draftBy: string | null;
};

type Shift = { templateId: string; name: string; startTime: string; endTime: string; accountId: string; siteName: string | null };
type ShiftDay = { date: string; shifts: Shift[] };

type MyDay = {
  date: string;
  linked: boolean;
  jobs: Job[];
  checklists: Round[];
  shifts: ShiftDay[];
  daysBefore: number;
};

const BUCKETS: { key: Bucket; label: string; hint?: string }[] = [
  { key: "inProgress", label: "In progress" },
  { key: "onHold", label: "On hold", hint: "Resume these when you can carry on" },
  { key: "overdue", label: "Overdue" },
  { key: "today", label: "Due today" },
  { key: "soon", label: "Due this week" },
  { key: "later", label: "Later" },
];

// Date-only values (YYYY-MM-DD) are read as UTC so they never shift a day.
const dayLabel = (key: string, opts: Intl.DateTimeFormatOptions) =>
  new Date(`${key}T00:00:00Z`).toLocaleDateString("en-GB", { ...opts, timeZone: "UTC" });

function dueText(job: Job, today: string): string | null {
  if (!job.dueDate) return null;
  const due = new Date(job.dueDate);
  const key = due.toLocaleDateString("en-CA");
  if (job.bucket === "overdue") {
    const days = Math.floor((Date.parse(`${today}T00:00:00`) - Date.parse(`${key}T00:00:00`)) / 86_400_000);
    return days <= 0 ? "Overdue today" : `Overdue by ${days} day${days === 1 ? "" : "s"}`;
  }
  if (key === today) return `Due today, ${due.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
  return `Due ${due.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}`;
}

function JobRow({ job, today }: { job: Job; today: string }) {
  const where = [job.siteName, job.assetName, job.locationPath].filter(Boolean).join(" · ");
  const due = dueText(job, today);
  const status = workOrderStatusMeta(job.status);
  return (
    <li>
      <Link href={`/accounts/${job.accountId}/work-orders/${job.id}`} className="tu-today-row">
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span className="tu-figure" style={{ fontSize: 12, color: "var(--tu-text-subtle)" }}>{workOrderRef(job.number)}</span>
          <span style={{ fontWeight: 600, color: "var(--tu-text-heading)" }}>{job.title}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
          <span className={status.badge}>{status.label}</span>
          <span className={WORK_ORDER_PRIORITY[job.priority]?.badge ?? "tu-badge"}>{WORK_ORDER_PRIORITY[job.priority]?.label ?? job.priority}</span>
          {job.clockRunning && <span className="tu-badge tu-badge-brand">Clock running</span>}
          {job.steps.total > 0 && (
            <span style={{ fontSize: 12.5, color: "var(--tu-text-body)" }}>
              Steps <span className="tu-figure">{job.steps.done}/{job.steps.total}</span>
            </span>
          )}
          {due && (
            <span style={{ fontSize: 12.5, fontWeight: job.bucket === "overdue" ? 600 : 400, color: job.bucket === "overdue" ? "var(--tu-on-danger)" : "var(--tu-text-body)" }}>
              {due}
            </span>
          )}
        </div>
        {where && <p style={{ margin: "6px 0 0", fontSize: 12.5, color: "var(--tu-text-subtle)" }}>{where}</p>}
        {job.holdReason && <p style={{ margin: "4px 0 0", fontSize: 12.5, color: "var(--tu-text-body)" }}>On hold: {job.holdReason}</p>}
      </Link>
    </li>
  );
}

function RoundRow({ round, daysBefore, onPhone }: { round: Round; daysBefore: number; onPhone?: OutboxRound }) {
  const where = [round.siteName, round.assetName, round.locationPath].filter(Boolean).join(" · ");
  const due = dayLabel(round.dueBy, { weekday: "short", day: "numeric", month: "short" });
  const tone =
    round.standing === "missed" ? { cls: "tu-badge tu-badge-danger", text: "Missed last period" }
    : round.standing === "ending" ? { cls: "tu-badge tu-badge-warning", text: `Due by ${due}` }
    : { cls: "tu-badge tu-badge-neutral", text: `Due by ${due}` };
  return (
    <li>
      <Link href={`/accounts/${round.accountId}/checklists/${round.assignmentId}?period=${round.periodStart}`} className="tu-today-row">
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontWeight: 600, color: "var(--tu-text-heading)" }}>{round.name}</span>
          <span className={tone.cls} title={round.standing === "ending" ? `Within ${daysBefore} days` : undefined}>{tone.text}</span>
          {round.draftBy && <span style={{ fontSize: 12.5, color: "var(--tu-text-body)" }}>Started by {round.draftBy}</span>}
          {onPhone && (
            <span className={onPhone.status === "failed" ? "tu-badge tu-badge-danger" : "tu-badge tu-badge-warning"}>
              {onPhone.status === "failed" ? "Couldn't send" : onPhone.isDraft ? "Saved on this phone" : "Done on this phone, not sent"}
            </span>
          )}
        </div>
        {where && <p style={{ margin: "6px 0 0", fontSize: 12.5, color: "var(--tu-text-subtle)" }}>{where}</p>}
      </Link>
    </li>
  );
}

const shiftText = (s: Shift) => `${s.name} ${s.startTime}–${s.endTime}`;

const WARM_KEY = "hanni.offline.warmedAt";
const WARM_EVERY_MS = 30 * 60_000;
const WARM_MAX = 25;

/**
 * Saves what a technician will want without signal: each job and round on this
 * page — its data (through the API client, which keeps a copy of every read)
 * and its page (through the service worker). At most every half hour, in the
 * background, and only when this page came from the server rather than from
 * the copy on the device.
 */
async function warmForOffline(day: MyDay) {
  try {
    const last = Number(localStorage.getItem(WARM_KEY) ?? 0);
    if (Date.now() - last < WARM_EVERY_MS) return;
    localStorage.setItem(WARM_KEY, String(Date.now()));
  } catch { /* storage blocked: warm anyway */ }

  const jobs = day.jobs.slice(0, WARM_MAX);
  const rounds = day.checklists.slice(0, WARM_MAX);
  const reads = [
    "/work-orders",
    "/accounts",
    ...jobs.flatMap((j) => [`/work-orders/${j.id}`, `/work-orders/${j.id}/history`, `/work-orders/${j.id}/attachments`]),
    ...[...new Set(rounds.map((r) => r.accountId))].map((a) => `/accounts/${a}/pm-checklists`),
    ...rounds.map((r) => `/account-pm-checklists/${r.assignmentId}/logs`),
  ];
  // A few at a time: this runs while someone is using the page.
  for (let i = 0; i < reads.length; i += 4) {
    await Promise.all(reads.slice(i, i + 4).map((u) => api.get(u).catch(() => null)));
  }
  await warmPages([
    "/today",
    "/work-orders",
    ...jobs.map((j) => `/accounts/${j.accountId}/work-orders/${j.id}`),
    ...rounds.map((r) => `/accounts/${r.accountId}/checklists/${r.assignmentId}?period=${r.periodStart}`),
  ]);
}

export default function TodayPage() {
  const { user } = useAuth();
  const [day, setDay] = useState<MyDay | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async (isCancelled?: () => boolean) => {
    try {
      const res = await api.get<MyDay>("/me/today");
      if (!isCancelled?.()) { setDay(res.data); setError(""); }
      // Fresh from the server: save the rest of the day for offline use.
      if (!res.headers?.["x-hanni-saved-at"]) void warmForOffline(res.data);
    } catch (err) {
      if (!isCancelled?.()) setError(errorMessage(err, "Could not load your day."));
    }
  }, []);
  useEffect(() => startLoad(load), [load]);

  // Rounds saved on this phone and not sent yet, so a round done offline does
  // not still read as "to do" (lib/offlineOutbox.ts).
  const [onPhone, setOnPhone] = useState<Record<string, OutboxRound>>({});
  const loadOnPhone = useCallback(async (isCancelled?: () => boolean) => {
    if (!user) return;
    const rows = roundsOf(await listOutbox(user.id));
    if (!isCancelled?.()) setOnPhone(Object.fromEntries(rows.map((r) => [`${r.assignmentId}|${r.periodStart}`, r])));
  }, [user]);
  useEffect(() => {
    const stop = startLoad(loadOnPhone);
    const onChange = () => { void loadOnPhone(); void load(); };
    window.addEventListener(OUTBOX_EVENT, onChange);
    return () => { stop(); window.removeEventListener(OUTBOX_EVENT, onChange); };
  }, [loadOnPhone, load]);

  const firstName = user?.name?.split(" ")[0] ?? "";
  const todayShift = day?.shifts[0];
  const nextShift = day?.shifts.slice(1).find((d) => d.shifts.length);
  const counts = (b: Bucket) => day?.jobs.filter((j) => j.bucket === b).length ?? 0;

  return (
    <div className="tu-page">
      <div className="tu-page-header">
        <div>
          <h1 className="tu-page-title">Today</h1>
          <p className="tu-page-sub">
            {day ? dayLabel(day.date, { weekday: "long", day: "numeric", month: "long" }) : " "}
            {firstName && <> · Hi, {firstName}</>}
          </p>
        </div>
        <div className="tu-page-actions">
          <Link href="/work-orders" className="tu-btn-secondary">All my work orders</Link>
        </div>
      </div>

      {error && (
        <div className="tu-card tu-card-pad" style={{ marginBottom: 24 }}>
          <p role="alert" style={{ margin: 0, color: "var(--tu-on-danger)", fontWeight: 600 }}>{error}</p>
          <button type="button" className="tu-btn-secondary" style={{ marginTop: 12 }} onClick={() => load()}>Try again</button>
        </div>
      )}

      {day && !day.linked && (
        <div className="tu-card tu-card-pad" style={{ marginBottom: 24 }}>
          <p style={{ margin: 0 }}>
            Your login isn&apos;t linked to an employee record, so no jobs or shifts can be shown. Ask a
            supervisor to check your login on the Employees page.
          </p>
        </div>
      )}

      {!day && !error && <p style={{ color: "var(--tu-text-subtle)" }}>Loading your day…</p>}

      {day && (
        <>
          {/* Shift + headline counts */}
          <div className="tu-today-summary">
            <div className="tu-card tu-card-pad">
              <p className="tu-today-kicker">Your shift today</p>
              {todayShift?.shifts.length ? (
                todayShift.shifts.map((s) => (
                  <p key={s.templateId} className="tu-today-big">{shiftText(s)}<span className="tu-today-site"> · {s.siteName}</span></p>
                ))
              ) : (
                <p className="tu-today-big" style={{ color: "var(--tu-text-body)" }}>Not rostered today</p>
              )}
              {nextShift && (
                <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--tu-text-subtle)" }}>
                  Next: {dayLabel(nextShift.date, { weekday: "short", day: "numeric", month: "short" })}, {nextShift.shifts.map(shiftText).join(", ")}
                </p>
              )}
            </div>
            <div className="tu-card tu-card-pad tu-today-counts">
              {([
                ["inProgress", "In progress"],
                ["onHold", "On hold"],
                ["overdue", "Overdue"],
                ["today", "Due today"],
              ] as [Bucket, string][]).map(([b, label]) => (
                <div key={b}>
                  <p className="tu-today-count" style={b === "overdue" && counts(b) ? { color: "var(--tu-on-danger)" } : undefined}>{counts(b)}</p>
                  <p className="tu-today-kicker" style={{ margin: 0 }}>{label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Jobs */}
          <section className="tu-card" style={{ marginBottom: 24 }} aria-labelledby="today-jobs">
            <div className="tu-card-header"><h2 id="today-jobs" className="tu-card-title">Your jobs</h2></div>
            {day.jobs.length === 0 ? (
              <EmptyState icon="workOrder" title="No open jobs" hint="When someone assigns you a job it appears here." compact />
            ) : (
              <div className="tu-card-pad" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                {BUCKETS.map(({ key, label, hint }) => {
                  const list = day.jobs.filter((j) => j.bucket === key);
                  if (!list.length) return null;
                  return (
                    <div key={key}>
                      <h3 className="tu-today-group">
                        {label} <span className="tu-figure" style={{ color: "var(--tu-text-subtle)", fontWeight: 500 }}>{list.length}</span>
                      </h3>
                      {hint && <p style={{ margin: "-4px 0 8px", fontSize: 12.5, color: "var(--tu-text-subtle)" }}>{hint}</p>}
                      <ul className="tu-today-list">{list.map((j) => <JobRow key={j.id} job={j} today={day.date} />)}</ul>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* PM rounds */}
          <section className="tu-card" style={{ marginBottom: 24 }} aria-labelledby="today-rounds">
            <div className="tu-card-header"><h2 id="today-rounds" className="tu-card-title">PM rounds to do</h2></div>
            {day.checklists.length === 0 ? (
              <EmptyState icon="workOrder" title="All rounds filed" hint="Every checklist on your sites is done for this period." compact />
            ) : (
              <div className="tu-card-pad">
                <ul className="tu-today-list">{day.checklists.map((r) => <RoundRow key={r.assignmentId} round={r} daysBefore={day.daysBefore} onPhone={onPhone[`${r.assignmentId}|${r.periodStart}`]} />)}</ul>
              </div>
            )}
          </section>

          {/* Shifts */}
          <section className="tu-card" aria-labelledby="today-shifts">
            <div className="tu-card-header"><h2 id="today-shifts" className="tu-card-title">Your shifts, next 2 weeks</h2></div>
            <div className="tu-card-pad">
              {day.shifts.every((d) => !d.shifts.length) ? (
                <p style={{ margin: 0, color: "var(--tu-text-body)" }}>No shifts are scheduled for you in the next two weeks.</p>
              ) : (
                <ul className="tu-today-shifts">
                  {day.shifts.map((d, i) => (
                    <li key={d.date} aria-current={i === 0 ? "date" : undefined}>
                      <span className="tu-today-shift-day">
                        {i === 0 ? "Today" : i === 1 ? "Tomorrow" : dayLabel(d.date, { weekday: "short", day: "numeric", month: "short" })}
                      </span>
                      <span style={{ color: d.shifts.length ? "var(--tu-text-heading)" : "var(--tu-text-subtle)" }}>
                        {d.shifts.length ? d.shifts.map((s) => `${shiftText(s)} · ${s.siteName}`).join("; ") : "Off"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
