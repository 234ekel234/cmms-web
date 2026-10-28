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
//
// The pill is a `.tu-stage`: a dot and a light tint in the status's own chart
// colour, so a stage is the same colour on a pill, a queue row and a chart. It
// used to borrow the generic badge tones, which gave Requested and In Progress
// the same blue and Completed and Approved the same green — two stages that
// look alike are worse than no colour. Text stays in the body colour: several
// status hues are under 3:1 as text in light mode, and the palette is
// validator-verified rather than something to darken by eye.
export const WORK_ORDER_STATUS: Record<WorkOrderStatus, StatusMeta> = {
  REQUESTED: { label: "Requested", badge: "tu-badge tu-stage tu-stage-requested", color: "var(--tu-status-requested)" },
  PENDING: { label: "Accepted", badge: "tu-badge tu-stage tu-stage-pending", color: "var(--tu-status-pending)" },
  IN_PROGRESS: { label: "In Progress", badge: "tu-badge tu-stage tu-stage-in-progress", color: "var(--tu-status-in-progress)" },
  ON_HOLD: { label: "On Hold", badge: "tu-badge tu-stage tu-stage-on-hold", color: "var(--tu-status-on-hold)" },
  COMPLETED: { label: "Completed", badge: "tu-badge tu-stage tu-stage-completed", color: "var(--tu-status-completed)" },
  // "Approved" rather than "Signed off": the client sees this word on their own
  // button, and the two should match.
  APPROVED: { label: "Approved", badge: "tu-badge tu-stage tu-stage-approved", color: "var(--tu-status-approved)" },
  REJECTED: { label: "Rejected", badge: "tu-badge tu-stage tu-stage-rejected", color: "var(--tu-status-rejected)" },
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

/**
 * The pill for one order. REJECTED reads "Cancelled" when the job had been
 * accepted — staff work starts accepted — and was then called off; "Rejected"
 * is kept for a request turned down. Same status, same colour; only the word
 * differs (isCancellation in backend helpers/workOrderApproval.js).
 */
export function workOrderStatusFor(wo: { status: string; acceptedAt?: string | null }): StatusMeta {
  const meta = workOrderStatusMeta(wo.status);
  return wo.status === "REJECTED" && wo.acceptedAt ? { ...meta, label: "Cancelled" } : meta;
}

/** A status as a group of orders — filters and breakdowns, where REJECTED holds both. */
export const workOrderStatusGroupLabel = (s: string) => (s === "REJECTED" ? "Rejected / Cancelled" : workOrderStatusMeta(s).label);
export const workOrderPriorityMeta = (p: string | null | undefined) => metaOf(WORK_ORDER_PRIORITY, p, "—");
// assetStatusMeta is defined above with the asset section — it takes free text
// rather than looking a key up in a map, so it is not a metaOf() wrapper.
export const assetHealthMeta = (h: string | null | undefined) => metaOf(ASSET_HEALTH, h);

// ── Asset health, restated for callers that draw their own chips ──
/**
 * What each health value means, in a phrase.
 *
 * The labels alone did not tell a user which of the two condition fields
 * matters: an asset carries free-text `status` ("Operational") *and* `health`,
 * side by side on the form, and only health opens a downtime period. The hint
 * is where that is said — most plainly on BREAKDOWN, which is the one that
 * starts the clock.
 */
export const ASSET_HEALTH_HINT: Record<AssetHealth, string> = {
  FUNCTIONAL: "Working as it should",
  FUNCTIONAL_WITH_FINDINGS: "Still running, but something was found",
  BREAKDOWN: "Down — starts counting downtime",
};

/**
 * Tailwind classes for a soft health chip, for the pages that draw their own
 * rather than using `.tu-badge`.
 *
 * Four pages kept a private copy of this map, and two of them imported this
 * module already. They had drifted: the asset register grouped
 * `health !== FUNCTIONAL` under "Poor / Out of Service" while the tab row
 * directly beneath it called the same rows "Breakdown".
 */
export const ASSET_HEALTH_CLS: Record<AssetHealth, string> = {
  FUNCTIONAL: "bg-[var(--tu-soft-success)] text-[var(--tu-on-success)]",
  FUNCTIONAL_WITH_FINDINGS: "bg-[var(--tu-soft-warning)] text-[var(--tu-on-warning)]",
  BREAKDOWN: "bg-[var(--tu-soft-danger)] text-[var(--tu-on-danger)]",
};

/**
 * The health values that mean somebody has to go and look.
 *
 * Mirrors NEEDS_ATTENTION_HEALTH in backend/helpers/assetHealth.js, and
 * `NEEDS_ATTENTION_LABEL` is the one name the UI gives that set. It had four:
 * "Poor Assets", "Assets at risk", "poor health" and "Poor / Out of Service" —
 * and "poor" is not a word this app defines anywhere, since the health
 * vocabulary is Functional / Functional with Findings / Breakdown. A column
 * heading a reader cannot map back onto the values it counts is a heading that
 * has to be guessed at.
 */
export const NEEDS_ATTENTION_HEALTH: AssetHealth[] = ["FUNCTIONAL_WITH_FINDINGS", "BREAKDOWN"];
export const NEEDS_ATTENTION_LABEL = "Needs attention";

// ── Roles ────────────────────────────────────────────────
/**
 * How a role is written when a person reads it.
 *
 * Four files kept their own copy, and one of them — the top bar, which draws
 * the chip on every page — was never given TECHNICIAN when the fifth role
 * arrived. Its lookup fell through to `?? user.role`, so a technician's own
 * screen labelled them "TECHNICIAN" in the raw database spelling.
 *
 * `roleLabel` never falls back to the key for that reason: an unknown value
 * says "Unknown role", which is at least a sentence.
 */
export const ROLE_LABEL: Record<string, string> = {
  GENERAL_MANAGER: "General Manager",
  MANAGER: "Manager",
  SUPERVISOR: "Supervisor",
  TECHNICIAN: "Technician",
  CLIENT: "Client",
};

/**
 * Soft chip classes per role.
 *
 * GENERAL_MANAGER used a raw `bg-violet-50 text-violet-700` in all three copies
 * — the one palette entry that was not a token, so it kept its light-mode
 * lavender in dark mode and put violet-700 text on it. `--tu-soft-info` /
 * `--tu-on-info` is the same violet, themed.
 */
export const ROLE_CLS: Record<string, string> = {
  GENERAL_MANAGER: "bg-[var(--tu-soft-info)] text-[var(--tu-on-info)]",
  MANAGER: "bg-[var(--tu-soft-brand)] text-[var(--tu-on-brand)]",
  SUPERVISOR: "bg-[var(--tu-soft-success)] text-[var(--tu-on-success)]",
  TECHNICIAN: "bg-[var(--tu-soft-accent)] text-[var(--tu-on-accent)]",
  CLIENT: "bg-[var(--tu-soft-warning)] text-[var(--tu-on-warning)]",
};

export const roleLabel = (r: string | null | undefined) =>
  (r && ROLE_LABEL[r]) || "Unknown role";
export const roleCls = (r: string | null | undefined) =>
  (r && ROLE_CLS[r]) || "bg-[var(--tu-soft-neutral)] text-[var(--tu-on-neutral)]";
