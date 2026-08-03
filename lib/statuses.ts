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
  | "REJECTED";

export type WorkOrderPriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type AssetStatus = "OPERATIONAL" | "UNDER_MAINTENANCE";
export type AssetHealth = "NEW" | "GOOD" | "FAIR" | "POOR" | "OUT_OF_SERVICE";

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
  REJECTED: { label: "Rejected", badge: "tu-badge tu-badge-danger", color: "var(--tu-status-rejected)" },
};

/** Statuses that count as "open"/active work (not completed or rejected). */
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
export const ASSET_STATUS: Record<AssetStatus, StatusMeta> = {
  OPERATIONAL: { label: "Operational", badge: "tu-badge tu-badge-success", color: "var(--tu-asset-operational)" },
  UNDER_MAINTENANCE: { label: "Under Maintenance", badge: "tu-badge tu-badge-warning", color: "var(--tu-asset-maintenance)" },
};

// ── Asset health ─────────────────────────────────────────
export const ASSET_HEALTH: Record<AssetHealth, StatusMeta> = {
  NEW: { label: "New", badge: "tu-badge tu-badge-brand", color: "var(--tu-health-new)" },
  GOOD: { label: "Good", badge: "tu-badge tu-badge-success", color: "var(--tu-health-good)" },
  FAIR: { label: "Fair", badge: "tu-badge tu-badge-warning", color: "var(--tu-health-fair)" },
  POOR: { label: "Poor", badge: "tu-badge tu-badge-danger", color: "var(--tu-health-poor)" },
  OUT_OF_SERVICE: { label: "Out of Service", badge: "tu-badge tu-badge-danger", color: "var(--tu-health-out)" },
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
export const assetStatusMeta = (s: string | null | undefined) => metaOf(ASSET_STATUS, s);
export const assetHealthMeta = (h: string | null | undefined) => metaOf(ASSET_HEALTH, h);
