// Single source of truth for how domain enums render in the UI.
//
// Each entry carries three things:
//   - `label`  human-readable text
//   - `badge`  className for status pills (reuses the dark-aware .tu-badge-*
//              variants in globals.css)
//   - `color`  a var(--tu-*) color for chart fills, legend dots, and segment
//              bars — resolves to a theme-aware token so it adapts in dark mode
//              (unlike the raw hexes these replace)
//
// Prefer `badge` for pills and `color` for SVG/inline backgrounds.
//
// PENDING is labelled "Accepted": the UI wording follows the pipeline a user
// actually walks (Requested -> Accepted -> In Progress -> Completed) rather
// than the raw enum. The DB value is unchanged.

export type WorkOrderStatus =
  | "REQUESTED"
  | "PENDING"
  | "IN_PROGRESS"
  | "ON_HOLD"
  | "COMPLETED"
  | "APPROVED"
  | "REJECTED";

export type WorkOrderPriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
/**
 * Free text, mirroring the column. There is no union to check against any more:
 * a site writes whatever describes the asset ("Standby", "Awaiting spare
 * parts"), and the API stores it verbatim.
 */
export type AssetStatus = string;
export type AssetHealth = "FUNCTIONAL" | "FUNCTIONAL_WITH_FINDINGS" | "BREAKDOWN";

export type StatusMeta = {
  label: string;
  /** Full className for a status pill, e.g. "tu-badge tu-badge-brand". */
  badge: string;
  /** Theme-aware color for charts/dots/segbars, e.g. "var(--tu-status-completed)". */
  color: string;
};

// ── Work order status ────────────────────────────────────
// Order matches the pipeline so callers can iterate for legends/segment bars.
export const WORK_ORDER_STATUS: Record<WorkOrderStatus, StatusMeta> = {
  REQUESTED: { label: "Requested", badge: "tu-badge tu-badge-brand", color: "var(--tu-status-requested)" },
  PENDING: { label: "Accepted", badge: "tu-badge tu-badge-info", color: "var(--tu-status-pending)" },
  IN_PROGRESS: { label: "In Progress", badge: "tu-badge tu-badge-brand", color: "var(--tu-status-in-progress)" },
  ON_HOLD: { label: "On Hold", badge: "tu-badge tu-badge-neutral", color: "var(--tu-status-on-hold)" },
  COMPLETED: { label: "Completed", badge: "tu-badge tu-badge-success", color: "var(--tu-status-completed)" },
  // "Approved" rather than "Signed off": the client sees this word on their own
  // button, and the two should match.
  APPROVED: { label: "Approved", badge: "tu-badge tu-badge-success", color: "var(--tu-status-approved)" },
  REJECTED: { label: "Rejected", badge: "tu-badge tu-badge-danger", color: "var(--tu-status-rejected)" },
};

/**
 * Statuses that count as "open"/active work — not completed, approved or
 * rejected. A whitelist on purpose: a status added later is excluded until
 * somebody decides it belongs, which is the safe default for a filter that
 * decides what shows up as outstanding.
 */
export const OPEN_WORK_ORDER_STATUSES: WorkOrderStatus[] = [
  "REQUESTED",
  "PENDING",
  "IN_PROGRESS",
  "ON_HOLD",
];

// ── Work order priority ──────────────────────────────────
export const WORK_ORDER_PRIORITY: Record<WorkOrderPriority, StatusMeta> = {
  LOW: { label: "Low", badge: "tu-badge tu-badge-neutral", color: "var(--tu-priority-low)" },
  MEDIUM: { label: "Medium", badge: "tu-badge tu-badge-warning", color: "var(--tu-priority-medium)" },
  HIGH: { label: "High", badge: "tu-badge tu-badge-danger", color: "var(--tu-priority-high)" },
  CRITICAL: { label: "Critical", badge: "tu-badge tu-badge-danger", color: "var(--tu-priority-critical)" },
};

// ── Asset status ─────────────────────────────────────────
/**
 * Status is a neutral chip, deliberately — it carries no colour signal at all.
 *
 * It used to be two values and green/amber said which. Now that anyone can type
 * anything, colouring it would mean string-matching free text to decide what is
 * "good", which is exactly the guesswork that made it unfit to drive the
 * downtime ledger. Health is the field that carries meaning, and it is the one
 * that gets a colour; status is shown as written.
 */
export function assetStatusMeta(status: string | null | undefined): StatusMeta {
  return {
    label: status?.trim() || "—",
    badge: "tu-badge tu-badge-neutral",
    color: "var(--tu-text-subtle)",
  };
}

// ── Asset health ─────────────────────────────────────────
// Three values, worst last. Colours reuse the existing validated palette
// entries rather than introducing new ones: good → functional, fair → findings,
// out → breakdown.
export const ASSET_HEALTH: Record<AssetHealth, StatusMeta> = {
  FUNCTIONAL: { label: "Functional", badge: "tu-badge tu-badge-success", color: "var(--tu-health-good)" },
  FUNCTIONAL_WITH_FINDINGS: { label: "Functional with Findings", badge: "tu-badge tu-badge-warning", color: "var(--tu-health-fair)" },
  BREAKDOWN: { label: "Breakdown", badge: "tu-badge tu-badge-danger", color: "var(--tu-health-out)" },
};

// ── Lookup helpers (safe for unknown/legacy values) ──────
function metaOf<T extends string>(
  map: Record<T, StatusMeta>,
  key: string | null | undefined,
  fallbackLabel = "Unknown",
): StatusMeta {
  if (key && key in map) return map[key as T];
  return { label: fallbackLabel, badge: "tu-badge tu-badge-neutral", color: "var(--tu-text-subtle)" };
}

export const workOrderStatusMeta = (s: string | null | undefined) => metaOf(WORK_ORDER_STATUS, s);
export const workOrderPriorityMeta = (p: string | null | undefined) => metaOf(WORK_ORDER_PRIORITY, p, "—");
// assetStatusMeta is defined above with the asset section — it takes free text
// rather than looking a key up in a map, so it is not a metaOf() wrapper.
export const assetHealthMeta = (h: string | null | undefined) => metaOf(ASSET_HEALTH, h);
