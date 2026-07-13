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

  const tabBase = "px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors";
  const activeCls = "border-[#2166AC] text-[#2166AC]";
  const idleCls = "border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300";

  return (
    <div className="flex flex-col min-h-full">
      {/* Account header */}
      <div className="bg-white border-b border-gray-100 px-8 pt-6 pb-0">
        <div className="mb-3">
          <Link href="/accounts" className="text-xs text-gray-400 hover:text-[#2166AC] transition-colors">
            ← Accounts
          </Link>
          <h1 className="text-xl font-bold text-gray-900 mt-1">
            {account ? account.name : "Loading..."}
          </h1>
          {account?.description && (
            <p className="text-gray-400 text-sm mt-0.5">{account.description}</p>
          )}
        </div>

        {/* Tab navigation — scoped to the current account. The leading scope
            chip signals these tabs act on THIS account; pinned tabs plus grouped
            dropdown menus keep the bar from ever needing to side-scroll. */}
        <div className="flex items-center gap-3" ref={navRef}>
          <span
            className="flex items-center gap-1.5 flex-shrink-0 max-w-[200px] px-2.5 py-1 rounded-md bg-gray-100 text-gray-600 text-xs font-semibold"
            title={account?.name ?? undefined}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="flex-shrink-0">
              <path d="M3 21h18" />
              <path d="M5 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16" />
              <path d="M15 21V9a2 2 0 0 1 2-2h1a2 2 0 0 1 2 2v12" />
              <path d="M9 7h2M9 11h2M9 15h2" />
            </svg>
            <span className="truncate">{account ? account.name : "Account"}</span>
          </span>
          <span className="h-5 w-px bg-gray-200 flex-shrink-0" aria-hidden="true" />

          <nav className="flex items-stretch gap-1" aria-label="Account sections">
            {pinned.map((tab) => {
              const active = isActive(tab.path);
              return (
                <Link
                  key={tab.path}
                  href={`/accounts/${accountId}/${tab.path}`}
                  aria-current={active ? "page" : undefined}
                  className={`${tabBase} ${active ? activeCls : idleCls}`}
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
                    className={`${tabBase} inline-flex items-center gap-1 cursor-pointer ${groupActive ? activeCls : idleCls}`}
                  >
                    {group.label}
                    <svg
                      width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
                      className={`transition-transform ${open ? "rotate-180" : ""}`}
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>
                  {open && (
                    <div
                      role="menu"
                      className="absolute left-0 top-full z-20 mt-1 min-w-[180px] rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
                    >
                      {group.tabs.map((tab) => {
                        const active = isActive(tab.path);
                        return (
                          <Link
                            key={tab.path}
                            role="menuitem"
                            href={`/accounts/${accountId}/${tab.path}`}
                            aria-current={active ? "page" : undefined}
                            onClick={() => setOpenMenu(null)}
                            className={`block px-4 py-2 text-sm transition-colors ${
                              active
                                ? "bg-blue-50 text-[#2166AC] font-semibold"
                                : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                            }`}
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
      <div className="flex-1 bg-gray-50">{children}</div>
    </div>
  );
}
