import type { User } from "@/lib/auth";

export type Role = User["role"];

// ── Role tiers ───────────────────────────────────────────
// Mirrors backend/helpers/roles.js — keep the two in step.
export const ALL_ROLES: Role[] = ["GENERAL_MANAGER", "MANAGER", "SUPERVISOR", "TECHNICIAN", "CLIENT"];
// Staff who run the work: schedule it, cost it, see the whole account.
// TECHNICIAN is deliberately absent — see FIELD_STAFF.
export const STAFF: Role[] = ["GENERAL_MANAGER", "MANAGER", "SUPERVISOR"];
// Manager-level — account/user administration.
export const MANAGERS: Role[] = ["GENERAL_MANAGER", "MANAGER"];
// Everyone who does or directs the work on the ground. The opt-in tier: a
// technician reaches a page only where it names this, so a page nobody has
// thought about stays shut rather than opening by default.
export const FIELD_STAFF: Role[] = [...STAFF, "TECHNICIAN"];
// Everyone entitled to an overview of the whole account — the staff who run it
// and the client who owns it. A technician's view of the work is their own
// assignments, so they are not here.
export const ACCOUNT_OVERVIEW: Role[] = [...STAFF, "CLIENT"];

// Where each role lands after login / after being bounced from a denied page.
// Must always point at a route that role is allowed to reach (avoids redirect loops).
export const ROLE_HOME: Record<Role, string> = {
  GENERAL_MANAGER: "/",
  MANAGER: "/",
  SUPERVISOR: "/",
  // Not "/" — the dashboard is the account at a glance, which is exactly what a
  // technician does not get. Their queue is the whole product for them.
  TECHNICIAN: "/work-orders",
  CLIENT: "/accounts",
};

// Account sub-sections a CLIENT may NOT view. Everything else under an account
// — the roster, schedule, attendance, assets, checklists, training, activity
// and reports — is theirs to read: a client is the site owner, and checking the
// service they are paying for is the point of the login.
//
// Cost is withheld, which is why `parts` is here; the API strips cost from the
// report and the asset register rather than blocking them.
//
// `maintenance-plans` is here for a different reason: a plan is an internal
// scheduling decision — how often we intend to service the client's kit — and
// what the client is entitled to see is the work itself, which reaches them as
// ordinary work orders on their account.
//
// backend/helpers/clientVisibility.js is the authority — keep this in step.
const STAFF_ONLY_ACCOUNT_SECTIONS = ["parts", "maintenance-plans"];

// The only account sections a TECHNICIAN reaches: the work they were given, and
// the kit they were given it on. Everything else under an account — the roster,
// the schedule, attendance, checklists, training, the activity trail, reports —
// answers "what is happening on this site?", which is not their question.
//
// An allowlist rather than a deny-list, because the account branch below falls
// through to ALL_ROLES: a section added later would otherwise open to them
// silently, and the API would then refuse a page the nav had just offered.
const TECHNICIAN_ACCOUNT_SECTIONS = ["work-orders", "assets", "checklists"];

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
    // Everything under /checklists/ is a write surface rather than a view of
    // one, and a client reaches none of it: they see the checklist list and its
    // per-period status, and get the answers themselves from the Reports
    // section, which carries the aggregated responses.
    //
    // The two write surfaces are not the same tier, though. *Assigning* a
    // checklist to a site decides what this account is obliged to inspect and
    // how often — scheduling, and staff-only. *Filling one in* is doing the
    // round, which is a technician's job, so the fill-in form names FIELD_STAFF.
    // The API draws the same line: POST/PUT on a log went to FIELD_STAFF while
    // assigning stayed STAFF.
    //
    // Both must stay ABOVE the technician narrowing below. This sat underneath
    // it once and, because the narrowing returned first, the line was
    // unreachable and quietly handed the assign form to CLIENT. Every
    // role-specific case belongs before the fall-through, not after it.
    if (section === "checklists" && sub === "assign") return STAFF;
    if (section === "checklists" && sub) return FIELD_STAFF;
    // Narrow the rest to the two sections a technician has business in. The
    // account overview ("") is not one of them by name, but they never land on
    // it — the account root redirects them straight to their queue.
    if (section !== "" && !TECHNICIAN_ACCOUNT_SECTIONS.includes(section)) {
      return ACCOUNT_OVERVIEW;
    }
    return ALL_ROLES;
  }

  // Global top-level pages.
  if (path === "/") return STAFF;
  if (path.startsWith("/users")) return MANAGERS;
  if (path.startsWith("/work-orders")) return FIELD_STAFF;
  if (path.startsWith("/assets")) return FIELD_STAFF;
  if (path.startsWith("/parts")) return STAFF;
  if (path.startsWith("/employees")) return STAFF;
  if (path.startsWith("/pm-checklists")) return STAFF;
  if (path.startsWith("/trainings")) return STAFF;
  if (path.startsWith("/reports")) return STAFF;
  // Printable sheets. Open to everyone because each one reads a single record
  // through the same endpoint its screen page uses, and the API decides who may
  // have it — a technician asking for someone else's job gets the same 404.
  if (path.startsWith("/print")) return ALL_ROLES;
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

/**
 * True when `role` may act on a job that is *theirs* — its status, its steps,
 * its clock, its photos, the parts they fitted.
 *
 * The distinction `canManage` could not draw once TECHNICIAN existed. It is
 * kept as a second, narrower question rather than by widening `canManage`,
 * because eight pages already ask that one and every one of them means
 * "administer the account": the asset register, the schedule, attendance,
 * checklists, training, the roster. Widening it drew Edit and Archive controls
 * for a technician on every one of those, each of which the API answers 403.
 *
 * So: `canManage` keeps its meaning, and the two work-order pages ask this
 * instead. Whether the job is actually theirs is the API's call — see
 * backend/helpers/technicianScope.js.
 */
export function canWorkOnJob(role: Role | undefined): boolean {
  return hasRole(role, FIELD_STAFF);
}
