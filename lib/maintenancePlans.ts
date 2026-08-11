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

/** What one period is called when pointing at the current one. */
export const PERIOD_NOUN: Record<Frequency, string> = {
  DAILY: "today",
  WEEKLY: "this week",
  MONTHLY: "this month",
  QUARTERLY: "this quarter",
  SEMI_ANNUALLY: "this half-year",
  ANNUALLY: "this year",
};

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
  // Derived server-side from `frequency` rather than stored, so it cannot drift
  // out of step with the schedule.
  currentPeriodStart: string;
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
    return {
      label: "Not raised yet",
      tone: "info",
      hint: `No work order exists for ${PERIOD_NOUN[plan.frequency]} yet. The generator runs each morning.`,
    };
  }
  if (occ.status === "COMPLETED") {
    return { label: "Done", tone: "success", hint: `Completed for ${PERIOD_NOUN[plan.frequency]}.` };
  }
  const overdue = occ.dueDate ? new Date(occ.dueDate) < new Date() : false;
  if (overdue) {
    return {
      label: "Overdue",
      tone: "danger",
      hint: `The period this was due in has elapsed and the work order is still ${occ.status.toLowerCase().replace("_", " ")}.`,
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
