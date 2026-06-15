"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import api from "@/lib/api";

type Period = "this_week" | "this_month" | "this_quarter" | "this_year" | "custom";

type EmployeePerf = {
  id: string;
  name: string;
  position: string | null;
  workOrders: { assigned: number; completed: number; inProgress: number };
  training: { total: number; completed: number; rate: number | null };
};

type ReportData = {
  period: { from: string; to: string };
  workOrders: {
    total: number;
    byStatus: Record<string, number>;
    byPriority: Record<string, number>;
    byCategory: { category: string; count: number }[];
    completionRate: number | null;
    avgCompletionDays: number | null;
    overdue: number;
  };
  attendance: {
    presentTotal: number;
    absentTotal: number;
    total: number;
    rate: number | null;
    byEmployee: { id: string; name: string; position: string | null; present: number; absent: number; total: number; rate: number | null }[];
  };
  checklists: {
    assigned: number;
    completedLogs: number;
    byFrequency: { frequency: string; assigned: number; completed: number }[];
  };
  employees: EmployeePerf[];
};

const PERIOD_LABELS: Record<Period, string> = {
  this_week:    "This Week",
  this_month:   "This Month",
  this_quarter: "This Quarter",
  this_year:    "This Year",
  custom:       "Custom",
};

const STATUS_LABELS: Record<string, string> = {
  COMPLETED: "Completed", IN_PROGRESS: "In Progress", PENDING: "Accepted",
  REQUESTED: "Requested", REJECTED: "Rejected",
};

const STATUS_COLORS: Record<string, string> = {
  COMPLETED: "#16a34a", IN_PROGRESS: "#f59e0b", PENDING: "#3b82f6",
  REQUESTED: "#a855f7", REJECTED: "#ef4444",
};

const PRIORITY_COLORS: Record<string, string> = {
  LOW: "#16a34a", MEDIUM: "#3b82f6", HIGH: "#f59e0b", CRITICAL: "#ef4444",
};

function getPeriodDates(p: Period): { from: string; to: string } {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  if (p === "this_week") {
    const d = new Date(now);
    const dow = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - dow);
    return { from: fmt(d), to: fmt(now) };
  }
  if (p === "this_month") return { from: fmt(new Date(now.getFullYear(), now.getMonth(), 1)), to: fmt(now) };
  if (p === "this_quarter") {
    const qStart = Math.floor(now.getMonth() / 3) * 3;
    return { from: fmt(new Date(now.getFullYear(), qStart, 1)), to: fmt(now) };
  }
  return { from: fmt(new Date(now.getFullYear(), 0, 1)), to: fmt(now) };
}

function StatCard({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-4 text-center flex-1 min-w-[80px]">
      <p className={`text-2xl font-bold ${color ?? "text-gray-900"}`}>{value}</p>
      <p className="text-xs text-gray-400 mt-1 font-medium">{label}</p>
    </div>
  );
}

function BarRow({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="flex items-center gap-3 mb-3">
      <span className="text-sm text-gray-600 w-28 shrink-0">{label}</span>
      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-2 rounded-full" style={{ width: `${Math.round(pct)}%`, backgroundColor: color, minWidth: count > 0 ? "4px" : 0 }} />
      </div>
      <span className="text-sm font-semibold text-gray-700 w-8 text-right">{count}</span>
    </div>
  );
}

export default function ReportsPage() {
  const params = useParams();
  const accountId = params.accountId as string;
  const [period, setPeriod] = useState<Period>("this_month");
  const [activeRange, setActiveRange] = useState(getPeriodDates("this_month"));
  const [customFrom, setCustomFrom] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; });
  const [customTo, setCustomTo] = useState(customFrom);
  const [customError, setCustomError] = useState("");
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadReport(activeRange.from, activeRange.to);
  }, [activeRange]);

  async function loadReport(from: string, to: string) {
    setLoading(true);
    try {
      const res = await api.get(`/accounts/${accountId}/reports?from=${from}&to=${to}`);
      setData(res.data);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }

  function handlePeriodChange(p: Period) {
    setPeriod(p);
    if (p !== "custom") setActiveRange(getPeriodDates(p));
  }

  function applyCustom() {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(customFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(customTo)) {
      setCustomError("Enter valid YYYY-MM-DD dates.");
      return;
    }
    if (customFrom > customTo) { setCustomError("From must be before To."); return; }
    setCustomError("");
    setActiveRange({ from: customFrom, to: customTo });
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-bold text-gray-900">Reports</h2>
        <span className="text-xs text-gray-400">{activeRange.from} – {activeRange.to}</span>
      </div>

      {/* Period picker */}
      <div className="flex flex-wrap gap-2 mb-4">
        {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
          <button
            key={p}
            onClick={() => handlePeriodChange(p)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border cursor-pointer transition-colors ${
              period === p ? "bg-[#2166AC] text-white border-[#2166AC]" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
            }`}
          >
            {PERIOD_LABELS[p]}
          </button>
        ))}
      </div>

      {period === "custom" && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-6 flex items-end gap-3 flex-wrap">
          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-1">From</label>
            <input type="date" value={customFrom} onChange={(e) => { setCustomFrom(e.target.value); setCustomError(""); }}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2166AC]" />
          </div>
          <span className="text-gray-400 pb-2">–</span>
          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-1">To</label>
            <input type="date" value={customTo} onChange={(e) => { setCustomTo(e.target.value); setCustomError(""); }}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2166AC]" />
          </div>
          <button onClick={applyCustom} className="bg-[#2166AC] text-white px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer hover:bg-[#1a5490]">Apply</button>
          {customError && <p className="text-xs text-red-500 w-full">{customError}</p>}
        </div>
      )}

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => <div key={i} className="h-32 bg-white rounded-xl border border-gray-100 animate-pulse" />)}
        </div>
      ) : !data ? (
        <div className="text-center text-gray-400 py-12">Failed to load report.</div>
      ) : (
        <div className="space-y-6">
          {/* Work Orders */}
          <div>
            <h3 className="text-sm font-bold text-gray-700 mb-3">Work Orders</h3>
            <div className="flex gap-3 mb-4 flex-wrap">
              <StatCard label="Total" value={data.workOrders.total} />
              <StatCard label="Completed" value={data.workOrders.byStatus.COMPLETED ?? 0} color="text-green-600" />
              <StatCard label="Avg Days" value={data.workOrders.avgCompletionDays != null ? `${data.workOrders.avgCompletionDays}d` : "—"} />
              {data.workOrders.overdue > 0 && <StatCard label="Overdue" value={data.workOrders.overdue} color="text-red-600" />}
            </div>

            {data.workOrders.total > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">By Status</p>
                  {Object.entries(data.workOrders.byStatus).filter(([, n]) => n > 0).sort(([, a], [, b]) => b - a).map(([s, n]) => (
                    <BarRow key={s} label={STATUS_LABELS[s] ?? s} count={n} total={data.workOrders.total} color={STATUS_COLORS[s] ?? "#9ca3af"} />
                  ))}
                </div>
                {Object.values(data.workOrders.byPriority).some((v) => v > 0) && (
                  <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">By Priority</p>
                    {(["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const).filter((p) => (data.workOrders.byPriority[p] ?? 0) > 0).map((p) => (
                      <BarRow key={p} label={p.charAt(0) + p.slice(1).toLowerCase()} count={data.workOrders.byPriority[p]} total={data.workOrders.total} color={PRIORITY_COLORS[p]} />
                    ))}
                  </div>
                )}
                {data.workOrders.byCategory.length > 0 && (
                  <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 md:col-span-2">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">By Category</p>
                    {data.workOrders.byCategory.map(({ category, count }) => (
                      <BarRow key={category} label={category} count={count} total={data.workOrders.total} color="#2166AC" />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Attendance */}
          <div>
            <h3 className="text-sm font-bold text-gray-700 mb-3">Attendance</h3>
            <div className="flex gap-3 mb-4 flex-wrap">
              <StatCard label="Present" value={data.attendance.presentTotal} color="text-green-600" />
              <StatCard label="Absent" value={data.attendance.absentTotal} color="text-red-600" />
              <StatCard label="Total" value={data.attendance.total} />
            </div>
            {data.attendance.byEmployee.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-xs text-gray-400 font-semibold uppercase tracking-wide">
                      <th className="px-4 py-3 text-left">Employee</th>
                      <th className="px-4 py-3 text-center">Present</th>
                      <th className="px-4 py-3 text-center">Absent</th>
                      <th className="px-4 py-3 text-center">Rate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.attendance.byEmployee.filter((e) => e.total > 0).map((e) => (
                      <tr key={e.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-800">{e.name}</p>
                          {e.position && <p className="text-xs text-gray-400">{e.position}</p>}
                        </td>
                        <td className="px-4 py-3 text-center text-green-600 font-semibold">{e.present}</td>
                        <td className="px-4 py-3 text-center text-red-500 font-semibold">{e.absent}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`font-semibold ${e.rate != null && e.rate >= 90 ? "text-green-600" : e.rate != null && e.rate >= 70 ? "text-amber-600" : "text-red-500"}`}>
                            {e.rate != null ? `${e.rate}%` : "—"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Checklists */}
          <div>
            <h3 className="text-sm font-bold text-gray-700 mb-3">PM Checklists</h3>
            <div className="flex gap-3 mb-4 flex-wrap">
              <StatCard label="Assigned" value={data.checklists.assigned} />
              <StatCard label="Completions" value={data.checklists.completedLogs} color="text-[#2166AC]" />
            </div>
            {data.checklists.byFrequency.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-xs text-gray-400 font-semibold uppercase tracking-wide">
                      <th className="px-4 py-3 text-left">Frequency</th>
                      <th className="px-4 py-3 text-center">Assigned</th>
                      <th className="px-4 py-3 text-center">Completed</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.checklists.byFrequency.map(({ frequency, assigned, completed }) => (
                      <tr key={frequency} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-800">
                          {frequency.replace("_", "-").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())}
                        </td>
                        <td className="px-4 py-3 text-center text-gray-600">{assigned}</td>
                        <td className="px-4 py-3 text-center text-[#2166AC] font-semibold">{completed}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Employee Performance */}
          <div>
            <h3 className="text-sm font-bold text-gray-700 mb-3">Employee Performance</h3>
            {data.employees.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-8 text-center text-gray-400 text-sm">
                No employees in this account.
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm divide-y divide-gray-100">
                {data.employees.map((emp) => {
                  const woPct = emp.workOrders.assigned > 0 ? emp.workOrders.completed / emp.workOrders.assigned : null;
                  const att = data.attendance.byEmployee.find((a) => a.id === emp.id);
                  return (
                    <div key={emp.id} className="p-4">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                          <span className="text-sm font-bold text-[#2166AC]">{emp.name.charAt(0).toUpperCase()}</span>
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-gray-800">{emp.name}</p>
                          {emp.position && <p className="text-xs text-gray-400">{emp.position}</p>}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div>
                          <div className="flex justify-between mb-1">
                            <span className="text-xs text-gray-500">Work Orders</span>
                            <span className="text-xs font-semibold text-gray-700">
                              <span className="text-green-600">{emp.workOrders.completed}</span>/{emp.workOrders.assigned}
                              {emp.workOrders.inProgress > 0 && <span className="text-gray-400"> · {emp.workOrders.inProgress} active</span>}
                            </span>
                          </div>
                          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-1.5 rounded-full" style={{ width: `${Math.round((woPct ?? 0) * 100)}%`, backgroundColor: woPct != null && woPct >= 0.7 ? "#16a34a" : "#f59e0b" }} />
                          </div>
                        </div>
                        {att && att.total > 0 && (
                          <div>
                            <div className="flex justify-between mb-1">
                              <span className="text-xs text-gray-500">Attendance</span>
                              <span className="text-xs font-semibold text-gray-700">
                                <span className="text-green-600">{att.present}P</span>
                                <span className="text-gray-400"> / {att.absent}A</span>
                              </span>
                            </div>
                            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div className="h-1.5 rounded-full bg-green-500" style={{ width: `${Math.round((att.present / att.total) * 100)}%` }} />
                            </div>
                          </div>
                        )}
                        {emp.training.total > 0 && (
                          <div>
                            <div className="flex justify-between mb-1">
                              <span className="text-xs text-gray-500">Training</span>
                              <span className="text-xs font-semibold text-violet-700">
                                {emp.training.completed}/{emp.training.total}
                              </span>
                            </div>
                            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div className="h-1.5 rounded-full bg-violet-500" style={{ width: `${emp.training.total > 0 ? Math.round((emp.training.completed / emp.training.total) * 100) : 0}%` }} />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
