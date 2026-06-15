"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";

type AccountSummary = {
  id: string;
  name: string;
  openWorkOrders: number;
  requestedWorkOrders: number;
  overdueWorkOrders: number;
  poorHealthAssets: number;
  checklistsDone: number;
  checklistsTotal: number;
  attendancePresent: number;
  attendanceTotal: number;
};

type ActivityEntry = {
  id: string;
  action: string;
  description: string;
  performedByName: string | null;
  createdAt: string;
  accountId: string;
};

type DashboardData = {
  workOrders: { REQUESTED: number; PENDING: number; IN_PROGRESS: number; COMPLETED: number; REJECTED: number };
  assets: { OPERATIONAL: number; UNDER_MAINTENANCE: number };
  overdueWorkOrders: number;
  poorHealthAssets: number;
  attendance: { present: number; absent: number };
  checklists: { completed: number; total: number };
  accounts: AccountSummary[];
  recentActivity: ActivityEntry[];
  period: string;
};

type Period = "today" | "week" | "month";

const PERIOD_LABELS: Record<Period, string> = {
  today: "Today",
  week: "This Week",
  month: "This Month",
};

function StatCard({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-3xl font-bold ${accent ?? "text-gray-900"}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [period, setPeriod] = useState<Period>("today");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetchDashboard();
  }, [period]);

  async function fetchDashboard() {
    setLoading(true);
    setError(false);
    try {
      const res = await api.get("/dashboard", { params: { period } });
      setData(res.data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  const wo = data?.workOrders;
  const openWOs = (wo?.REQUESTED ?? 0) + (wo?.PENDING ?? 0) + (wo?.IN_PROGRESS ?? 0);
  const totalAssets = (data?.assets.OPERATIONAL ?? 0) + (data?.assets.UNDER_MAINTENANCE ?? 0);
  const attendanceTotal = (data?.attendance.present ?? 0) + (data?.attendance.absent ?? 0);

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-400 text-sm mt-0.5">Overview across all accounts</p>
        </div>
        <div className="flex gap-2">
          {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                period === p
                  ? "bg-[#2166AC] text-white"
                  : "bg-white border border-gray-200 text-gray-600 hover:border-[#2166AC] hover:text-[#2166AC]"
              }`}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mb-6">
          Failed to load dashboard. Try refreshing.
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Open Work Orders"
          value={loading ? "—" : openWOs}
          sub={loading ? undefined : `${wo?.REQUESTED ?? 0} requested · ${wo?.IN_PROGRESS ?? 0} in progress`}
        />
        <StatCard
          label="Overdue"
          value={loading ? "—" : (data?.overdueWorkOrders ?? 0)}
          sub="work orders past due date"
          accent={data?.overdueWorkOrders ? "text-red-600" : undefined}
        />
        <StatCard
          label="Assets"
          value={loading ? "—" : totalAssets}
          sub={loading ? undefined : `${data?.assets.UNDER_MAINTENANCE ?? 0} under maintenance`}
        />
        <StatCard
          label="PM Checklists"
          value={loading ? "—" : `${data?.checklists.completed ?? 0} / ${data?.checklists.total ?? 0}`}
          sub={`completed ${PERIOD_LABELS[period].toLowerCase()}`}
          accent={
            data && data.checklists.total > 0 && data.checklists.completed < data.checklists.total
              ? "text-amber-600"
              : undefined
          }
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Account summaries */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-700">Accounts</h2>
          </div>
          {loading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-12 bg-gray-100 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : !data?.accounts.length ? (
            <div className="p-8 text-center text-gray-400 text-sm">No accounts found.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs text-gray-400 font-semibold uppercase tracking-wide">
                  <th className="px-6 py-3 text-left">Account</th>
                  <th className="px-4 py-3 text-center">Open WOs</th>
                  <th className="px-4 py-3 text-center">Overdue</th>
                  <th className="px-4 py-3 text-center">Poor Assets</th>
                  <th className="px-4 py-3 text-center">Checklists</th>
                  <th className="px-4 py-3 text-center">Attendance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {data.accounts.map((acc) => (
                  <tr key={acc.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 font-medium text-gray-800">{acc.name}</td>
                    <td className="px-4 py-4 text-center">
                      <span className={acc.openWorkOrders > 0 ? "text-blue-600 font-semibold" : "text-gray-400"}>
                        {acc.openWorkOrders}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-center">
                      {acc.overdueWorkOrders > 0 ? (
                        <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-semibold bg-red-50 text-red-600">
                          {acc.overdueWorkOrders}
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-center">
                      {acc.poorHealthAssets > 0 ? (
                        <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-600">
                          {acc.poorHealthAssets}
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-center text-gray-600">
                      {acc.checklistsDone}/{acc.checklistsTotal}
                    </td>
                    <td className="px-4 py-4 text-center text-gray-600">
                      {acc.attendanceTotal > 0
                        ? `${acc.attendancePresent}/${acc.attendanceTotal}`
                        : <span className="text-gray-300">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Recent activity */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-700">Recent Activity</h2>
          </div>
          {loading ? (
            <div className="p-6 space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-10 bg-gray-100 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : !data?.recentActivity.length ? (
            <div className="p-8 text-center text-gray-400 text-sm">No recent activity.</div>
          ) : (
            <div className="divide-y divide-gray-50 max-h-[420px] overflow-y-auto">
              {data.recentActivity.map((entry) => (
                <div key={entry.id} className="px-5 py-3">
                  <p className="text-sm text-gray-700 leading-snug">{entry.description}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    {entry.performedByName ?? "System"} · {timeAgo(entry.createdAt)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
