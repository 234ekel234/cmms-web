import type { User } from "@/lib/auth";

export type Role = User["role"];

// ── Role tiers ───────────────────────────────────────────
export const ALL_ROLES: Role[] = ["GENERAL_MANAGER", "MANAGER", "SUPERVISOR", "CLIENT"];
// Internal staff — everyone except external clients.
export const STAFF: Role[] = ["GENERAL_MANAGER", "MANAGER", "SUPERVISOR"];
// Manager-level — account/user administration.
export const MANAGERS: Role[] = ["GENERAL_MANAGER", "MANAGER"];

// Where each role lands after login / after being bounced from a denied page.
// Must always point at a route that role is allowed to reach (avoids redirect loops).
export const ROLE_HOME: Record<Role, string> = {
  GENERAL_MANAGER: "/",
  MANAGER: "/",
  SUPERVISOR: "/",
  CLIENT: "/accounts",
};

// Account sub-sections a CLIENT may NOT view. Everything else under an account
// — the roster, schedule, attendance, assets, checklists, training, activity
// and reports — is theirs to read: a client is the site owner, and checking the
// service they are paying for is the point of the login.
//
// Only cost is withheld, which is why `parts` is the single entry here; the API
// strips cost from the report and the asset register rather than blocking them.
// backend/helpers/clientVisibility.js is the authority — keep this in step.
const STAFF_ONLY_ACCOUNT_SECTIONS = ["parts"];

/**
 * Which roles may access a given pathname. Ordered most-specific first.
 * Returns the list of roles permitted on that route.
 */
function rolesForPath(path: string): Role[] {
  // Account-scoped pages: /accounts/<id>/<section>/<sub>...
  const scoped = path.match(/^\/accounts\/[^/]+(?:\/([^/]+))?(?:\/([^/]+))?/);
  if (scoped) {
    const section = scoped[1] ?? ""; // "" === account overview
    const sub = scoped[2];
    if (section === "members") return MANAGERS;
    if (STAFF_ONLY_ACCOUNT_SECTIONS.includes(section)) return STAFF;
    // Everything under /checklists/ is a write surface — the assign form and
    // the fill-in form — rather than a view of one. A client sees the checklist
    // list and its per-period status, and gets the answers themselves from the
    // Reports section, which carries the aggregated responses.
    if (section === "checklists" && sub) return STAFF;
    return ALL_ROLES;
  }

  // Global top-level pages.
  if (path === "/") return STAFF;
  if (path.startsWith("/users")) return MANAGERS;
  if (path.startsWith("/work-orders")) return STAFF;
  if (path.startsWith("/assets")) return STAFF;
  if (path.startsWith("/parts")) return STAFF;
  if (path.startsWith("/employees")) return STAFF;
  if (path.startsWith("/pm-checklists")) return STAFF;
  if (path.startsWith("/trainings")) return STAFF;
  if (path.startsWith("/reports")) return STAFF;
  if (path.startsWith("/accounts")) return ALL_ROLES; // accounts list (backend scopes to membership)
  if (path.startsWith("/notifications")) return ALL_ROLES;
  if (path.startsWith("/settings")) return ALL_ROLES;

  return ALL_ROLES; // unknown routes default to allowed; backend remains the gate
}

/** True if `role` is permitted to view `path`. */
export function canAccessRoute(role: Role | undefined, path: string): boolean {
  if (!role) return false;
  return rolesForPath(path).includes(role);
}

/** True if `role` is one of `allowed`. Handy for in-page action gating. */
export function hasRole(role: Role | undefined, allowed: Role[]): boolean {
  return !!role && allowed.includes(role);
}

/**
 * True when `role` may act on account data, rather than only read it.
 *
 * Clients now reach almost every account section, but they read: their only
 * writes are raising a work-order request and commenting on one, which the
 * portal and work-order pages handle explicitly. Every other action affordance
 * — assign, remove, mark, schedule, edit — is gated on this.
 *
 * The API refuses those writes regardless, so this is about not offering a
 * button that can only fail. backend/helpers/clientVisibility.js is the
 * authority on the underlying rule.
 */
export function canManage(role: Role | undefined): boolean {
  return hasRole(role, STAFF);
}
