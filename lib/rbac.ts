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

// Account sub-sections a CLIENT may view. Everything else under an account
// (employees, schedule, assets, checklists, members, …) is staff-only.
const CLIENT_ACCOUNT_SECTIONS = ["", "work-orders", "portal"];

/**
 * Which roles may access a given pathname. Ordered most-specific first.
 * Returns the list of roles permitted on that route.
 */
function rolesForPath(path: string): Role[] {
  // Account-scoped pages: /accounts/<id>/<section>/...
  const scoped = path.match(/^\/accounts\/[^/]+(?:\/([^/]+))?/);
  if (scoped) {
    const section = scoped[1] ?? ""; // "" === account overview
    if (section === "members") return MANAGERS;
    if (CLIENT_ACCOUNT_SECTIONS.includes(section)) return ALL_ROLES;
    return STAFF;
  }

  // Global top-level pages.
  if (path === "/") return STAFF;
  if (path.startsWith("/users")) return MANAGERS;
  if (path.startsWith("/work-orders")) return STAFF;
  if (path.startsWith("/assets")) return STAFF;
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
