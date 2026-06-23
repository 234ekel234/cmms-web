"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import api from "@/lib/api";

type Account = {
  id: string;
  name: string;
  description: string | null;
};

const TABS = [
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
  { label: "Members", path: "members" },
];

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const pathname = usePathname();
  const accountId = params.accountId as string;
  const [account, setAccount] = useState<Account | null>(null);

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

        {/* Tab navigation */}
        <nav className="flex gap-1 overflow-x-auto">
          {TABS.map((tab) => {
            const active = isActive(tab.path);
            return (
              <Link
                key={tab.path}
                href={`/accounts/${accountId}/${tab.path}`}
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

      {/* Page content */}
      <div className="flex-1 bg-gray-50">{children}</div>
    </div>
  );
}
