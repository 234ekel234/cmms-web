/**
 * Service levels on the web: the shapes GET /accounts/:id/sla-targets and
 * GET /reports/sla send (backend/helpers/sla.js is the authority — targets,
 * defaults, what met and breached mean), and the one thing the web adds:
 * writing a target in minutes as the "4 hours" or "3 days" a manager types.
 */
import type { WorkOrderPriority } from "@/lib/statuses";

export const SLA_PRIORITIES: WorkOrderPriority[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];

export type SlaTarget = { respondMinutes: number | null; resolveMinutes: number | null };
export type SiteSlaTargets = Record<WorkOrderPriority, SlaTarget & { custom: boolean }>;
export type SlaTargetsResponse = {
  targets: SiteSlaTargets;
  defaults: Record<WorkOrderPriority, SlaTarget>;
  updatedAt: string | null;
  updatedByName: string | null;
};

export type SlaState = "met" | "breached" | "open" | null;
export type SlaTally = { met: number; breached: number; open: number; metPct: number | null };
export type SlaBlock = { jobs: number; respond: SlaTally; resolve: SlaTally };

export type SlaUnit = "minutes" | "hours" | "days";
const PER: Record<SlaUnit, number> = { minutes: 1, hours: 60, days: 1440 };

/** A target as a number and a unit, in the largest unit it divides into. "" for none. */
export function toParts(minutes: number | null): { value: string; unit: SlaUnit } {
  if (minutes == null) return { value: "", unit: "hours" };
  if (minutes % PER.days === 0) return { value: String(minutes / PER.days), unit: "days" };
  if (minutes % PER.hours === 0) return { value: String(minutes / PER.hours), unit: "hours" };
  return { value: String(minutes), unit: "minutes" };
}

/**
 * Back to minutes: null for a blank (no target), NaN for something that is not
 * a whole number of minutes once converted ("1.5" hours is fine, "0.3" minutes
 * is not) — the form says so, and the API would refuse it anyway.
 */
export function fromParts(value: string, unit: SlaUnit): number | null {
  const v = value.trim();
  if (v === "") return null;
  const n = Number(v) * PER[unit];
  return Number.isInteger(n) && n > 0 ? n : Number.NaN;
}

/** "2 hours", "1 day", "90 minutes", "No target". */
export function describeTarget(minutes: number | null): string {
  if (minutes == null) return "No target";
  const { value, unit } = toParts(minutes);
  const n = Number(value);
  return `${value} ${n === 1 ? unit.slice(0, -1) : unit}`;
}

/** "75%", or "—" when nothing was decided. */
export const metLabel = (t: SlaTally) => (t.metPct == null ? "—" : `${t.metPct}%`);
