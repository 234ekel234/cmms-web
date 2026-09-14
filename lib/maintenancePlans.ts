// Recurring work orders. A MaintenancePlan is a standing rule; each period it
// produces one ordinary work order (its "occurrence"). The backend owns the
// generation — see backend/jobs/recurringWorkOrderJob.js — so nothing here
// schedules anything, it only reads and edits the rule.

export const FREQUENCIES = [
  "DAILY",
  "WEEKLY",
  "MONTHLY",
  "QUARTERLY",
  "SEMI_ANNUALLY",
  "ANNUALLY",
] as const;

export type Frequency = (typeof FREQUENCIES)[number];

export const FREQUENCY_LABEL: Record<Frequency, string> = {
  DAILY: "Daily",
  WEEKLY: "Weekly",
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
  SEMI_ANNUALLY: "Semi-annually",
  ANNUALLY: "Annually",
};

/**
 * The current period, as something you can drop straight into a sentence:
 * "raise one for **this month**". Already demonstrative — never prefix it with
 * "the", which is what produced "day 3 of the this month".
 */
export const PERIOD_NOUN: Record<Frequency, string> = {
  DAILY: "today",
  WEEKLY: "this week",
  MONTHLY: "this month",
  QUARTERLY: "this quarter",
  SEMI_ANNUALLY: "this half-year",
  ANNUALLY: "this year",
};

/**
 * The bare unit, for sentences that supply their own article: "day 3 of the
 * **month**", "Days after the **month** starts", "the whole **day**".
 */
export const PERIOD_UNIT: Record<Frequency, string> = {
  DAILY: "day",
  WEEKLY: "week",
  MONTHLY: "month",
  QUARTERLY: "quarter",
  SEMI_ANNUALLY: "half-year",
  ANNUALLY: "year",
};

/**
 * The largest lead offset the API will accept, per frequency.
 *
 * Mirrors `maxGenerateOffset` / `SHORTEST_PERIOD_DAYS` in
 * backend/helpers/planSchedule.js, which validates against the *shortest*
 * possible period so a plan cannot be configured into silence — 30 days into a
 * monthly period does not exist in February, and the resulting silence looks
 * exactly like a broken cron.
 *
 * Zero for DAILY: a one-day period leaves no day to wait for.
 */
const SHORTEST_PERIOD_DAYS: Record<Frequency, number> = {
  DAILY: 1,
  WEEKLY: 7,
  MONTHLY: 28,
  QUARTERLY: 90,
  SEMI_ANNUALLY: 181,
  ANNUALLY: 365,
};

export function maxLeadDays(frequency: Frequency): number {
  return SHORTEST_PERIOD_DAYS[frequency] - 1;
}

export type PlanOccurrence = {
  id: string;
  title: string;
  status: string;
  dueDate: string | null;
  completedAt?: string | null;
  scheduledPeriod?: string | null;
  actualSeconds?: number;
  estimatedMinutes?: number | null;
  assignments?: { employee: { id: string; name: string } }[];
};

export type MaintenancePlan = {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  frequency: Frequency;
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  type: "INTERNAL" | "EXTERNAL";
  estimatedMinutes: number | null;
  isActive: boolean;
  startDate: string;
  endDate: string | null;
  accountId: string;
  asset: { id: string; name: string } | null;
  account?: { id: string; name: string };
  assignees: { id: string; employeeId: string; employee: { id: string; name: string; position: string | null } }[];
  steps: { id: string; description: string; order: number }[];
  /** Days after the period starts before the occurrence is raised. 0 = day one. */
  generateOffsetDays: number;
  /** Deadline in days after it is raised. Null = the end of the period. */
  dueAfterDays: number | null;
  // Derived server-side from the schedule rather than stored, so it cannot drift
  // out of step with what the generator will actually do.
  currentPeriodStart: string;
  /** Null once the plan is past its end date — there is no next occurrence. */
  currentGenerateOn: string | null;
  currentPeriodDue: string;
  currentOccurrence: PlanOccurrence | null;
};

/** `YYYY-MM-DD` for a date input, in local time. */
export function dateInputValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/**
 * The calendar day a schedule *label* names, as `YYYY-MM-DD`.
 *
 * `currentPeriodStart` / `currentGenerateOn` are UTC midnights standing for a
 * local calendar day, not for an instant — so the day is read in UTC. Reading
 * local components here would shift it a day for any viewer west of UTC.
 */
function labelDay(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** Today on the business clock those labels were built from. */
function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Where a plan stands for the period we are in right now.
 *
 * "Not generated yet" is a normal state, not a fault: the generator runs each
 * morning, and a plan created after today's run is simply waiting for tomorrow's
 * — which is what the Generate Now action is for.
 */
export type PlanState = {
  label: string;
  tone: "success" | "info" | "danger" | "neutral";
  hint: string;
};

export function planState(plan: MaintenancePlan): PlanState {
  if (!plan.isActive) {
    return {
      label: "Paused",
      tone: "neutral",
      hint: "No new work orders are being generated. Occurrences already raised are unaffected.",
    };
  }
  const occ = plan.currentOccurrence;
  if (!occ) {
    // Past its end date: the server sends a null raise day precisely so this
    // does not fall through to "the generator runs each morning", which reads
    // as a fault when in fact nothing further is meant to happen.
    if (plan.endDate && plan.currentGenerateOn == null) {
      return {
        label: "Ended",
        tone: "neutral",
        hint: `This plan ended on ${fmtDate(plan.endDate)}. No further work orders will be generated.`,
      };
    }
    // A plan with a lead offset is deliberately silent for the early part of
    // every period, so "nothing here yet" has two quite different meanings and
    // only one of them is worth a second glance. Naming the date is what
    // separates "waiting for its day" from "the generator did not run".
    // Compared as calendar days, not as instants. `currentGenerateOn` is a
    // UTC-midnight *label* for a local calendar day (see calendarDay in
    // backend/helpers/planSchedule.js), so under Asia/Manila it reads as 08:00
    // local on the day it names. Treated as an instant, every plan still looked
    // "Scheduled" between midnight and 08:00 on its own raise day — hiding a
    // failed 06:00 generator run during exactly the window after it should have
    // run, which is the distinction this branch exists to draw.
    if (plan.currentGenerateOn && labelDay(plan.currentGenerateOn) > todayKey()) {
      return {
        label: "Scheduled",
        tone: "neutral",
        hint: `Due to be raised on ${fmtDate(plan.currentGenerateOn)}.`,
      };
    }
    return {
      label: "Not raised yet",
      tone: "info",
      hint: `No work order exists for ${PERIOD_NOUN[plan.frequency]} yet. The generator runs each morning.`,
    };
  }
  // APPROVED counts as done for the same reason DONE_STATUSES exists on the
  // server: a plan set to EXTERNAL produces work the client signs off, and
  // treating only COMPLETED as finished would show signed-off work as
  // outstanding.
  if (occ.status === "COMPLETED" || occ.status === "APPROVED") {
    return { label: "Done", tone: "success", hint: `Completed for ${PERIOD_NOUN[plan.frequency]}.` };
  }
  const overdue = occ.dueDate ? new Date(occ.dueDate) < new Date() : false;
  if (overdue) {
    return {
      label: "Overdue",
      tone: "danger",
      hint: `The deadline passed on ${fmtDate(occ.dueDate)} and the work order is still ${occ.status.toLowerCase().replace("_", " ")}.`,
    };
  }
  return {
    label: "In queue",
    tone: "info",
    hint: `Raised for ${PERIOD_NOUN[plan.frequency]} and currently ${occ.status.toLowerCase().replace("_", " ")}.`,
  };
}

// Reuses the shared badge variants from globals.css rather than hand-rolling
// pills, so a plan's state reads the same as every other status in the product
// and inherits the dark-mode handling for free.
export const TONE_CLASS: Record<PlanState["tone"], string> = {
  success: "tu-badge tu-badge-success",
  info: "tu-badge tu-badge-info",
  danger: "tu-badge tu-badge-danger",
  neutral: "tu-badge tu-badge-neutral",
};

/**
 * Soft chip classes per frequency, for the pages that draw a frequency pill.
 *
 * Five pages kept a byte-identical copy of this map and every one of them wrote
 * the label as "Semi-Annually", against `FREQUENCY_LABEL`'s "Semi-annually" —
 * the same word, capitalised two ways, on screens a user moves between.
 *
 * Three of the six colours were raw Tailwind (`bg-violet-50`, `bg-teal-50`,
 * `bg-pink-50`), so they kept their light-mode wash in dark mode with dark text
 * on top. These are the themed equivalents. `danger` is deliberately not used:
 * no frequency is an alarm.
 */
export const FREQUENCY_CLS: Record<string, string> = {
  DAILY: "bg-[var(--tu-soft-brand)] text-[var(--tu-on-brand)]",
  WEEKLY: "bg-[var(--tu-soft-info)] text-[var(--tu-on-info)]",
  MONTHLY: "bg-[var(--tu-soft-warning)] text-[var(--tu-on-warning)]",
  QUARTERLY: "bg-[var(--tu-soft-accent)] text-[var(--tu-on-accent)]",
  SEMI_ANNUALLY: "bg-[var(--tu-soft-neutral)] text-[var(--tu-on-neutral)]",
  ANNUALLY: "bg-[var(--tu-soft-success)] text-[var(--tu-on-success)]",
};

/** Label + chip class together, tolerating a value the UI does not know. */
export function frequencyMeta(f: string): { label: string; cls: string } {
  return {
    label: FREQUENCY_LABEL[f as Frequency] ?? f,
    cls: FREQUENCY_CLS[f] ?? "bg-[var(--tu-bg-secondary-strong)] text-[var(--tu-text-body)]",
  };
}
