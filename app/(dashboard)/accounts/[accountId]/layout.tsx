"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { canAccessRoute } from "@/lib/rbac";

type Account = {
  id: string;
  name: string;
  description: string | null;
};

type Tab = { label: string; path: string };

// Two always-visible tabs, then grouped dropdown menus so the bar never has to
// side-scroll. Tabs still filter by role, and a menu with nothing visible is
// hidden entirely.
const PINNED: Tab[] = [
  { label: "Members", path: "members" },
  { label: "Overview", path: "overview" },
];

const GROUPS: { label: string; tabs: Tab[] }[] = [
  {
    label: "Maintenance",
    tabs: [
      { label: "Work Orders", path: "work-orders" },
      { label: "Assets", path: "assets" },
      { label: "Spare Parts", path: "parts" },
      { label: "PM Checklists", path: "checklists" },
    ],
  },
  {
    label: "Workforce",
    tabs: [
      { label: "Employees", path: "employees" },
      { label: "Schedule", path: "schedule" },
      { label: "Attendance", path: "attendance" },
      { label: "Training", path: "training" },
    ],
  },
  {
    label: "More",
    tabs: [
      { label: "Reports", path: "reports" },
      { label: "Activity", path: "activity" },
      { label: "Client Portal", path: "portal" },
    ],
  },
];

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const pathname = usePathname();
  const { user } = useAuth();
  const accountId = params.accountId as string;
  const [account, setAccount] = useState<Account | null>(null);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const navRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (accountId) {
      api.get(`/accounts/${accountId}`).then((r) => setAccount(r.data)).catch(() => {});
    }
  }, [accountId]);

  // Close the open menu on navigation, outside click, or Escape.
  useEffect(() => { setOpenMenu(null); }, [pathname]);
  useEffect(() => {
    if (!openMenu) return;
    function onDown(e: MouseEvent) {
      if (navRef.current && !navRef.current.contains(e.target as Node)) setOpenMenu(null);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpenMenu(null);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [openMenu]);

  // Only show what the current role is allowed to open (same rule as the route
  // guard), and drop any menu left with no visible tabs.
  const canSee = (path: string) => canAccessRoute(user?.role, `/accounts/${accountId}/${path}`);
  const isActive = (path: string) => pathname.includes(`/accounts/${accountId}/${path}`);

  const pinned = PINNED.filter((t) => canSee(t.path));
  const groups = GROUPS
    .map((g) => ({ label: g.label, tabs: g.tabs.filter((t) => canSee(t.path)) }))
    .filter((g) => g.tabs.length > 0);

  return (
    <div className="flex flex-col min-h-full">
      {/* Account header */}
      <div className="tu-acct-header">
        <div style={{ marginBottom: 12 }}>
          <Link href="/accounts" className="tu-acct-back">
            ← Accounts
          </Link>
          <h1 className="tu-acct-title">
            {account ? account.name : "Loading..."}
          </h1>
          {account?.description && (
            <p className="tu-acct-sub">{account.description}</p>
          )}
        </div>

        {/* Tab navigation — scoped to the current account. The leading scope
            chip signals these tabs act on THIS account; pinned tabs plus grouped
            dropdown menus keep the bar from ever needing to side-scroll. */}
        <div className="tu-subnav-row" ref={navRef}>
          <span className="tu-scope-chip" title={account?.name ?? undefined}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 21h18" />
              <path d="M5 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16" />
              <path d="M15 21V9a2 2 0 0 1 2-2h1a2 2 0 0 1 2 2v12" />
              <path d="M9 7h2M9 11h2M9 15h2" />
            </svg>
            <span className="tu-scope-name">{account ? account.name : "Account"}</span>
          </span>
          <span className="tu-scope-divider" aria-hidden="true" />

          <nav className="tu-subnav" aria-label="Account sections">
            {pinned.map((tab) => {
              const active = isActive(tab.path);
              return (
                <Link
                  key={tab.path}
                  href={`/accounts/${accountId}/${tab.path}`}
                  aria-current={active ? "page" : undefined}
                  className={`tu-subnav-tab${active ? " tu-active" : ""}`}
                >
                  {tab.label}
                </Link>
              );
            })}

            {groups.map((group) => {
              const groupActive = group.tabs.some((t) => isActive(t.path));
              const open = openMenu === group.label;
              return (
                <div key={group.label} className="relative flex">
                  <button
                    type="button"
                    aria-haspopup="menu"
                    aria-expanded={open}
                    onClick={() => setOpenMenu(open ? null : group.label)}
                    className={`tu-subnav-tab${groupActive ? " tu-active" : ""}`}
                  >
                    {group.label}
                    <svg
                      width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
                      className="tu-subnav-chevron"
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>
                  {open && (
                    <div role="menu" className="tu-menu">
                      {group.tabs.map((tab) => {
                        const active = isActive(tab.path);
                        return (
                          <Link
                            key={tab.path}
                            role="menuitem"
                            href={`/accounts/${accountId}/${tab.path}`}
                            aria-current={active ? "page" : undefined}
                            onClick={() => setOpenMenu(null)}
                            className={`tu-menu-item${active ? " tu-active" : ""}`}
                          >
                            {tab.label}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Page content */}
      <div className="tu-acct-body">{children}</div>
    </div>
  );
}
