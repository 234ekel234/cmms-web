/**
 * Mirrors DEFAULT_DUE_DAYS in backend/helpers/dueDates.js: the due date a work
 * order is given when the form leaves it blank. Shown on the form so nobody is
 * surprised by a date they did not type; the API is what sets it.
 */
export const DEFAULT_DUE_DAYS: Record<string, number> = { CRITICAL: 1, HIGH: 3, MEDIUM: 7, LOW: 14 };

/** "Leave blank and it's due in 7 days (Medium priority)." */
export function defaultDueHint(priority: string): string {
  const days = DEFAULT_DUE_DAYS[priority] ?? DEFAULT_DUE_DAYS.MEDIUM;
  const label = priority.charAt(0) + priority.slice(1).toLowerCase();
  return `Leave blank and it's due in ${days} day${days === 1 ? "" : "s"} (${label} priority).`;
}
