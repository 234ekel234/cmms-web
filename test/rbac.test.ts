import { describe, expect, it } from "vitest";
import { ALL_ROLES, ROLE_HOME, canAccessRoute, canManage, canResetPassword, canWorkOnJob, type Role } from "@/lib/rbac";

const who = (path: string) => ALL_ROLES.filter((r) => canAccessRoute(r, path));

describe("route access", () => {
  it("keeps a technician out of the overview pages", () => {
    expect(canAccessRoute("TECHNICIAN", "/")).toBe(false);
    expect(canAccessRoute("TECHNICIAN", "/reports")).toBe(false);
    expect(canAccessRoute("TECHNICIAN", "/accounts/a/employees")).toBe(false);
    expect(canAccessRoute("TECHNICIAN", "/accounts/a/activity")).toBe(false);
  });

  it("opens a technician's three sections only", () => {
    for (const s of ["work-orders", "assets", "checklists"]) expect(canAccessRoute("TECHNICIAN", `/accounts/a/${s}`)).toBe(true);
  });

  it("lets a technician fill in a round but not assign a checklist", () => {
    expect(canAccessRoute("TECHNICIAN", "/accounts/a/checklists/xyz")).toBe(true);
    expect(canAccessRoute("TECHNICIAN", "/accounts/a/checklists/assign")).toBe(false);
  });

  it("never hands a client a write surface or cost", () => {
    expect(canAccessRoute("CLIENT", "/accounts/a/checklists/assign")).toBe(false);
    expect(canAccessRoute("CLIENT", "/accounts/a/checklists/xyz")).toBe(false);
    for (const s of ["parts", "maintenance-plans", "problem-reports", "export"]) {
      expect(canAccessRoute("CLIENT", `/accounts/a/${s}`)).toBe(false);
    }
    expect(canAccessRoute("CLIENT", "/accounts/a/reports")).toBe(true);
  });

  it("keeps Site Access and Users to managers", () => {
    expect(who("/accounts/a/members")).toEqual(["GENERAL_MANAGER", "MANAGER"]);
    expect(who("/users")).toEqual(["GENERAL_MANAGER", "MANAGER"]);
  });

  it("opens the Locations list wherever Assets is open", () => {
    expect(who("/accounts/a/assets/locations")).toEqual(who("/accounts/a/assets"));
  });

  it("refuses a missing role", () => {
    expect(canAccessRoute(undefined, "/accounts")).toBe(false);
  });

  it("sends every role home to a page it may open — no redirect loops", () => {
    for (const role of ALL_ROLES) expect(canAccessRoute(role, ROLE_HOME[role])).toBe(true);
  });
});

describe("action gates", () => {
  it("separates administering a site from working a job", () => {
    expect(canManage("TECHNICIAN")).toBe(false);
    expect(canWorkOnJob("TECHNICIAN")).toBe(true);
    expect(canManage("CLIENT")).toBe(false);
    expect(canWorkOnJob("CLIENT")).toBe(false);
    expect(canManage("SUPERVISOR")).toBe(true);
  });

  it("offers password resets for the roles each may create", () => {
    const can = (caller: Role) => ALL_ROLES.filter((t) => canResetPassword(caller, t));
    expect(can("GENERAL_MANAGER")).toEqual(ALL_ROLES);
    expect(can("MANAGER")).toEqual(["SUPERVISOR", "TECHNICIAN", "CLIENT"]);
    expect(can("SUPERVISOR")).toEqual(["TECHNICIAN"]);
    expect(can("TECHNICIAN")).toEqual([]);
  });
});
