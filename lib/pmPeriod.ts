/**
 * PM checklist periods, mirroring backend/helpers/pmPeriod.js — the server
 * decides which period a round belongs to; these let a screen draw the same
 * periods without asking.
 *
 * A calendar frequency snaps to the calendar (weeks start on Sunday). A custom
 * interval ("every N days", `CUSTOM_DAYS`) counts whole intervals from the
 * site's start date: start, start + N, start + 2N … — a fixed cycle, so a
 * period nobody filed is missed, and a late round does not move the next one.
 *
 * Every boundary is a UTC-midnight label for a calendar day, as
 * `PMLog.scheduledDate` (a `@db.Date`) is. `getPeriodStart` reads a date's
 * *local* day, like the server; `getPeriodStartUTC` reads its UTC day, for
 * screens whose selected date is already such a label.
 */

export const CUSTOM_DAYS = "CUSTOM_DAYS";
export const MIN_INTERVAL_DAYS = 2;
export const MAX_INTERVAL_DAYS = 730;

const DAY_MS = 86_400_000;

export type PmSchedule = { frequency: string; intervalDays?: number | null; startDate?: string | Date | null };

/** The schedule a site's checklist runs on: the template's frequency and interval, the assignment's start. */
export function pmSchedule(
  checklist: { frequency: string; intervalDays?: number | null },
  assignment?: { startDate?: string | Date | null } | null,
): PmSchedule {
  return { frequency: checklist.frequency, intervalDays: checklist.intervalDays ?? null, startDate: assignment?.startDate ?? null };
}

const asSchedule = (s: PmSchedule | string): PmSchedule => (typeof s === "string" ? { frequency: s } : s);

/** A custom schedule's start as a UTC-midnight label, or null when it is a calendar frequency. */
function anchorOf(s: PmSchedule): number | null {
  if (s.frequency !== CUSTOM_DAYS || !s.intervalDays || !s.startDate) return null;
  const a = new Date(s.startDate);
  if (Number.isNaN(a.getTime())) return null;
  return Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate());
}

/** The start of the period containing the calendar day labelled `day` (UTC midnight, ms). */
function periodStartOfDay(s: PmSchedule, day: number): Date {
  const anchor = anchorOf(s);
  if (anchor !== null) {
    const n = s.intervalDays as number;
    const k = Math.floor(Math.round((day - anchor) / DAY_MS) / n);
    return new Date(anchor + k * n * DAY_MS);
  }
  const d = new Date(day);
  const y = d.getUTCFullYear(), m = d.getUTCMonth(), dd = d.getUTCDate();
  switch (s.frequency) {
    case "WEEKLY":        return new Date(Date.UTC(y, m, dd - d.getUTCDay()));
    case "MONTHLY":       return new Date(Date.UTC(y, m, 1));
    case "QUARTERLY":     return new Date(Date.UTC(y, Math.floor(m / 3) * 3, 1));
    case "SEMI_ANNUALLY": return new Date(Date.UTC(y, Math.floor(m / 6) * 6, 1));
    case "ANNUALLY":      return new Date(Date.UTC(y, 0, 1));
    default:              return new Date(Date.UTC(y, m, dd)); // DAILY, and anything unknown
  }
}

const localDay = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
const utcDay = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

/** Start of the period containing `date`'s local calendar day — the server's rule. */
export function getPeriodStart(schedule: PmSchedule | string, date: Date = new Date()): Date {
  return periodStartOfDay(asSchedule(schedule), localDay(date));
}

/** Start of the period containing `date`'s UTC calendar day, for a date that is already a label. */
export function getPeriodStartUTC(schedule: PmSchedule | string, date: Date): Date {
  return periodStartOfDay(asSchedule(schedule), utcDay(date));
}

/** The period before (`-1`) or after (`1`) the one starting at `periodStart`. */
export function stepPeriod(schedule: PmSchedule | string, periodStart: Date, dir: 1 | -1): Date {
  const s = asSchedule(schedule);
  const start = getPeriodStartUTC(s, periodStart);
  if (anchorOf(s) !== null) return new Date(start.getTime() + dir * (s.intervalDays as number) * DAY_MS);
  const y = start.getUTCFullYear(), m = start.getUTCMonth(), d = start.getUTCDate();
  switch (s.frequency) {
    case "WEEKLY":        return new Date(Date.UTC(y, m, d + dir * 7));
    case "MONTHLY":       return new Date(Date.UTC(y, m + dir, 1));
    case "QUARTERLY":     return new Date(Date.UTC(y, m + dir * 3, 1));
    case "SEMI_ANNUALLY": return new Date(Date.UTC(y, m + dir * 6, 1));
    case "ANNUALLY":      return new Date(Date.UTC(y + dir, 0, 1));
    default:              return new Date(Date.UTC(y, m, d + dir));
  }
}

/** The last calendar day of the period starting at `periodStart`, as a label. */
export function lastDayOfPeriod(schedule: PmSchedule | string, periodStart: Date): Date {
  return new Date(stepPeriod(schedule, periodStart, 1).getTime() - DAY_MS);
}

/** Whether a period (a UTC label) begins before a custom schedule's start. Always false for a calendar frequency. */
export function isBeforeStart(schedule: PmSchedule | string, periodStart: Date): boolean {
  const anchor = anchorOf(asSchedule(schedule));
  return anchor !== null && utcDay(periodStart) < anchor;
}

/** "Monthly", or "Every 45 days". */
export function scheduleLabel(schedule: PmSchedule | string): string {
  const s = asSchedule(schedule);
  if (s.frequency === CUSTOM_DAYS) return s.intervalDays ? `Every ${s.intervalDays} days` : "Custom interval";
  const labels: Record<string, string> = {
    DAILY: "Daily", WEEKLY: "Weekly", MONTHLY: "Monthly", QUARTERLY: "Quarterly",
    SEMI_ANNUALLY: "Semi-annually", ANNUALLY: "Annually",
  };
  return labels[s.frequency] ?? s.frequency;
}

/** The refusal for an interval the API would refuse, or null. */
export function intervalDaysError(frequency: string, intervalDays: number | string | null | undefined): string | null {
  if (frequency !== CUSTOM_DAYS) return null;
  const n = Number(intervalDays);
  if (!Number.isInteger(n) || n < MIN_INTERVAL_DAYS || n > MAX_INTERVAL_DAYS) {
    return `Repeat every ${MIN_INTERVAL_DAYS} to ${MAX_INTERVAL_DAYS} days.`;
  }
  return null;
}
