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

const TABS = [
  { label: "Members", path: "members" },
  { label: "Overview", path: "overview" },
  { label: "Client Portal", path: "portal" },
  { label: "Work Orders", path: "work-orders" },
  { label: "Assets", path: "assets" },
  { label: "Employees", path: "employees" },
  { label: "PM Checklists", path: "checklists" },
  { label: "Schedule", path: "schedule" },
  { label: "Reports", path: "reports" },
  { label: "Activity", path: "activity" },
  { label: "Attendance", path: "attendance" },
  { label: "Training", path: "training" },
];

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const pathname = usePathname();
  const { user } = useAuth();
  const accountId = params.accountId as string;
  const [account, setAccount] = useState<Account | null>(null);
  const activeTabRef = useRef<HTMLAnchorElement>(null);

  // Keep the active tab visible: when the overflowing tab bar can't fit every
  // tab (mobile, or deep tabs like Members/Attendance), scroll the current one
  // into view instead of leaving it clipped off the right edge.
  useEffect(() => {
    activeTabRef.current?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [pathname]);

  // Only show tabs the current role is actually allowed to open (same rules
  // as the route guard), so tab visibility never disagrees with access.
  const visibleTabs = TABS.filter((tab) =>
    canAccessRoute(user?.role, `/accounts/${accountId}/${tab.path}`)
  );

  useEffect(() => {
    if (accountId) {
      api.get(`/accounts/${accountId}`).then((r) => setAccount(r.data)).catch(() => {});
    }
  }, [accountId]);

  function isActive(tabPath: string) {
    return pathname.includes(`/accounts/${accountId}/${tabPath}`);
  }

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
            chip (and divider) signal that these tabs act on THIS account, as
            opposed to the same-named global sections in the sidebar. */}
        <div className="flex items-center gap-3">
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
          <nav className="flex gap-1 overflow-x-auto" aria-label="Account sections">
            {visibleTabs.map((tab) => {
              const active = isActive(tab.path);
              return (
                <Link
                  key={tab.path}
                  ref={active ? activeTabRef : undefined}
                  href={`/accounts/${accountId}/${tab.path}`}
                  aria-current={active ? "page" : undefined}
                  className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                    active
                      ? "border-[#2166AC] text-[#2166AC]"
                      : "border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300"
                  }`}
                >
                  {tab.label}
                </Link>
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
