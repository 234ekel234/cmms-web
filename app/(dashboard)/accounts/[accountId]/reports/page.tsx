"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import api from "@/lib/api";
import EmptyState from "@/components/EmptyState";

type Period = "this_week" | "this_month" | "this_quarter" | "this_year" | "custom";

type EmployeePerf = {
  id: string;
  name: string;
  position: string | null;
  isReliever: boolean;
  workOrders: { assigned: number; completed: number; inProgress: number };
  training: { total: number; completed: number; rate: number | null };
};

type ReportData = {
  accountName: string;
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
  parts: {
    totalCost: number;
    lines: number;
    workOrdersWithParts: number;
    avgCostPerWorkOrder: number | null;
    top: { description: string; quantity: number; cost: number }[];
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
    trend?: { unit: string; points: { label: string; completed: number }[] };
  };
  checklistResponses: {
    id: string;
    checklistName: string;
    assetName: string | null;
    completions: number;
    inProgress: number;
    lateCount: number;
    sections: {
      title: string;
      answerOptions: string[];
      items: { id: string; label: string; answers: Record<string, number> }[];
    }[];
  }[];
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
  COMPLETED: "Completed", IN_PROGRESS: "In Progress", ON_HOLD: "On Hold", PENDING: "Accepted",
  REQUESTED: "Requested", REJECTED: "Rejected",
};

// Chart fills resolve to theme tokens so bars stay legible in dark mode.
const STATUS_COLORS: Record<string, string> = {
  COMPLETED: "var(--tu-status-completed)", IN_PROGRESS: "var(--tu-status-in-progress)",
  ON_HOLD: "var(--tu-status-on-hold)", PENDING: "var(--tu-status-pending)",
  REQUESTED: "var(--tu-status-requested)", REJECTED: "var(--tu-status-rejected)",
};

const PRIORITY_COLORS: Record<string, string> = {
  LOW: "var(--tu-priority-low)", MEDIUM: "var(--tu-priority-medium)",
  HIGH: "var(--tu-priority-high)", CRITICAL: "var(--tu-priority-critical)",
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

function formatPeso(amount: number) {
  return `₱${amount.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function StatCard({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="bg-[var(--tu-bg-surface)] rounded-xl border border-[var(--tu-border)] shadow-sm px-4 py-4 text-center flex-1 min-w-[80px]">
      <p className={`text-2xl font-bold ${color ?? "text-[var(--tu-text-heading)]"}`}>{value}</p>
      <p className="text-xs text-[var(--tu-text-subtle)] mt-1 font-medium">{label}</p>
    </div>
  );
}

function BarRow({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="flex items-center gap-3 mb-3">
      <span className="text-sm text-[var(--tu-text-body)] w-28 shrink-0">{label}</span>
      <div className="flex-1 h-2 bg-[var(--tu-bg-secondary-strong)] rounded-full overflow-hidden">
        <div className="h-2 rounded-full" style={{ width: `${Math.round(pct)}%`, backgroundColor: color, minWidth: count > 0 ? "4px" : 0 }} />
      </div>
      <span className="text-sm font-semibold text-[var(--tu-text-body)] w-8 text-right">{count}</span>
    </div>
  );
}

// Colour PM answer options: green for pass-like, red for fail-like, grey for
// N/A, otherwise cycle a neutral palette so options stay distinguishable.
const ANSWER_PALETTE = [
  "var(--tu-priority-medium)", "var(--tu-status-pending)", "var(--tu-chart-teal)",
  "var(--tu-chart-amber)", "var(--tu-chart-pink)",
];
function answerColor(opt: string, idx: number) {
  const o = opt.toLowerCase();
  if (/(^ok$|pass|good|yes|done|compliant)/.test(o)) return "var(--tu-status-completed)";
  if (/(^ng$|fail|bad|^no$|poor|defect|not)/.test(o)) return "var(--tu-priority-critical)";
  if (/(n\/?a|skip)/.test(o)) return "var(--tu-status-rejected)";
  return ANSWER_PALETTE[idx % ANSWER_PALETTE.length];
}

function freqLabel(frequency: string) {
  return frequency.replace("_", "-").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

type ChecklistResponse = ReportData["checklistResponses"][number];

// Roll the per-checklist responses up by asset for a per-asset PM summary.
function aggregateByAsset(responses: ChecklistResponse[]) {
  const m = new Map<string, { asset: string; checklists: number; completions: number; late: number }>();
  for (const c of responses) {
    const key = c.assetName ?? "— No asset —";
    const a = m.get(key) ?? { asset: key, checklists: 0, completions: 0, late: 0 };
    a.checklists += 1;
    a.completions += c.completions;
    a.late += c.lateCount;
    m.set(key, a);
  }
  return [...m.values()].sort((a, b) => b.completions - a.completions || a.asset.localeCompare(b.asset));
}

// Vertical mini bar chart of completions per period bucket.
function TrendChart({ points }: { points: { label: string; completed: number }[] }) {
  const max = Math.max(1, ...points.map((p) => p.completed));
  return (
    <div className="bg-[var(--tu-bg-surface)] rounded-xl border border-[var(--tu-border)] shadow-sm p-4">
      <div className="flex items-end gap-1 h-28">
        {points.map((p, i) => (
          <div key={i} className="flex-1 flex flex-col items-center justify-end gap-1 min-w-0" title={`${p.label}: ${p.completed}`}>
            <span className="text-[10px] font-semibold text-[var(--tu-text-subtle)] leading-none">{p.completed || ""}</span>
            <div
              className="w-full rounded-t bg-[var(--tu-text-brand)]"
              style={{ height: `${(p.completed / max) * 100}%`, minHeight: p.completed > 0 ? 4 : 0 }}
            />
            <span className="text-[9px] text-[var(--tu-text-subtle)] truncate w-full text-center">{p.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

type AssetReliability = {
  assetId: string;
  name: string;
  category: string;
  status: string;
  health: string;
  downtimeHours: number;
  uptimeHours: number;
  availability: number | null;
  failures: number;
  mttrHours: number | null;
  mtbfHours: number | null;
  repairsCompleted: number;
  isDownNow: boolean;
};

type ReliabilityData = {
  summary: {
    assetsTracked: number;
    assetsDownNow: number;
    totalDowntimeHours: number;
    failures: number;
    availability: number | null;
    mttrHours: number | null;
    mtbfHours: number | null;
  };
  assets: AssetReliability[];
  coverage: { unclassifiedWorkOrders: number; assetsWithDowntimeData: number };
};

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
  const [reliability, setReliability] = useState<ReliabilityData | null>(null);

  useEffect(() => {
    loadReport(activeRange.from, activeRange.to);
  }, [activeRange]);

  async function loadReport(from: string, to: string) {
    setLoading(true);
    try {
      // Reliability is a separate endpoint so a failure there cannot blank the
      // rest of the report.
      const [res, rel] = await Promise.allSettled([
        api.get(`/accounts/${accountId}/reports?from=${from}&to=${to}`),
        api.get(`/accounts/${accountId}/reports/reliability?from=${from}&to=${to}`),
      ]);
      if (rel.status === "fulfilled") setReliability(rel.value.data);
      else setReliability(null);
      if (res.status === "rejected") throw res.reason;
      setData(res.value.data);
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

  function exportChecklistCSV() {
    if (!data) return;
    const responses = data.checklistResponses ?? [];
    const esc = (v: string | number) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const rows: string[] = [];
    const line = (cells: (string | number)[]) => rows.push(cells.map(esc).join(","));

    const totalLate = responses.reduce((s, c) => s + c.lateCount, 0);
    const totalDrafts = responses.reduce((s, c) => s + c.inProgress, 0);
    const completions = data.checklists.completedLogs;
    const onTime = completions > 0 ? Math.round(((completions - totalLate) / completions) * 100) : "";

    line(["Account Report"]);
    line(["Account", data.accountName]);
    line(["Period", data.period.from, "to", data.period.to]);
    line([]);
    line(["Assigned", data.checklists.assigned]);
    line(["Completions", completions]);
    line(["On-time %", onTime]);
    line(["Late", totalLate]);
    line(["In progress", totalDrafts]);
    line([]);
    line(["By Asset"]);
    line(["Asset", "Checklists", "Completions", "Late"]);
    for (const a of aggregateByAsset(responses)) line([a.asset, a.checklists, a.completions, a.late]);
    line([]);
    line(["Response Breakdown"]);
    line(["Checklist", "Asset", "Section", "Item", "Answer", "Count"]);
    for (const c of responses) {
      for (const sec of c.sections) {
        for (const item of sec.items) {
          for (const opt of sec.answerOptions) {
            line([c.checklistName, c.assetName ?? "", sec.title, item.label, opt, item.answers[opt] ?? 0]);
          }
        }
      }
    }

    if (data.parts && data.parts.lines > 0) {
      line([]);
      line(["Parts Used"]);
      line(["Total Cost", data.parts.totalCost]);
      line(["Jobs With Parts", data.parts.workOrdersWithParts]);
      line(["Avg Cost Per Job", data.parts.avgCostPerWorkOrder ?? ""]);
      line([]);
      line(["Part", "Quantity", "Cost"]);
      for (const p of data.parts.top) line([p.description, p.quantity, p.cost]);
    }

    line([]);
    line(["Employee Performance"]);
    line([
      "Employee", "Position", "Type", "Company",
      "WOs Assigned", "WOs Completed", "WOs In Progress",
      "Attendance %", "Present", "Absent",
      "Training Completed", "Training Total",
    ]);
    for (const emp of data.employees) {
      const att = data.attendance.byEmployee.find((a) => a.id === emp.id);
      line([
        emp.name,
        emp.position ?? "",
        emp.isReliever ? "Reliever" : "Regular",
        data.accountName,
        emp.workOrders.assigned,
        emp.workOrders.completed,
        emp.workOrders.inProgress,
        att?.rate ?? "",
        att?.present ?? 0,
        att?.absent ?? 0,
        emp.training.completed,
        emp.training.total,
      ]);
    }

    const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `account-report-${data.period.from}-to-${data.period.to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-bold text-[var(--tu-text-heading)]">Reports</h2>
        <div className="flex items-center gap-3">
          <span className="text-xs text-[var(--tu-text-subtle)]">{activeRange.from} – {activeRange.to}</span>
          {data && (
            <button
              type="button"
              onClick={exportChecklistCSV}
              className="text-xs font-semibold text-[var(--tu-text-brand)] border border-[var(--tu-border)] rounded-lg px-3 py-1.5 hover:bg-[var(--tu-bg-secondary)] cursor-pointer"
            >
              Export PM CSV
            </button>
          )}
        </div>
      </div>

      {/* Period picker */}
      <div className="flex flex-wrap gap-2 mb-4">
        {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
          <button
            key={p}
            onClick={() => handlePeriodChange(p)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border cursor-pointer transition-colors ${
              period === p ? "bg-[var(--tu-text-brand)] text-white border-[var(--tu-text-brand)]" : "bg-[var(--tu-bg-surface)] text-[var(--tu-text-body)] border-[var(--tu-border)] hover:border-[var(--tu-border-strong)]"
            }`}
          >
            {PERIOD_LABELS[p]}
          </button>
        ))}
      </div>

      {period === "custom" && (
        <div className="bg-[var(--tu-bg-surface)] rounded-xl border border-[var(--tu-border)] shadow-sm p-4 mb-6 flex items-end gap-3 flex-wrap">
          <div>
            <label className="block text-xs font-semibold text-[var(--tu-text-subtle)] mb-1">From</label>
            <input type="date" value={customFrom} onChange={(e) => { setCustomFrom(e.target.value); setCustomError(""); }}
              className="border border-[var(--tu-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--tu-text-brand)]" />
          </div>
          <span className="text-[var(--tu-text-subtle)] pb-2">–</span>
          <div>
            <label className="block text-xs font-semibold text-[var(--tu-text-subtle)] mb-1">To</label>
            <input type="date" value={customTo} onChange={(e) => { setCustomTo(e.target.value); setCustomError(""); }}
              className="border border-[var(--tu-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--tu-text-brand)]" />
          </div>
          <button onClick={applyCustom} className="bg-[var(--tu-text-brand)] text-white px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer hover:bg-[var(--tu-text-brand-strong)]">Apply</button>
          {customError && <p className="text-xs text-[var(--tu-on-danger)] w-full">{customError}</p>}
        </div>
      )}

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => <div key={i} className="h-32 bg-[var(--tu-bg-surface)] rounded-xl border border-[var(--tu-border)] animate-pulse" />)}
        </div>
      ) : !data ? (
        <div className="text-center text-[var(--tu-text-subtle)] py-12">Failed to load report.</div>
      ) : (
        <div className="space-y-6">
          {/* Work Orders */}
          <div>
            <h3 className="text-sm font-bold text-[var(--tu-text-body)] mb-3">Work Orders</h3>
            <div className="flex gap-3 mb-4 flex-wrap">
              <StatCard label="Total" value={data.workOrders.total} />
              <StatCard label="Completed" value={data.workOrders.byStatus.COMPLETED ?? 0} color="text-[var(--tu-on-success)]" />
              <StatCard label="Avg Days" value={data.workOrders.avgCompletionDays != null ? `${data.workOrders.avgCompletionDays}d` : "—"} />
              {data.workOrders.overdue > 0 && <StatCard label="Overdue" value={data.workOrders.overdue} color="text-[var(--tu-on-danger)]" />}
            </div>

            {data.workOrders.total > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-[var(--tu-bg-surface)] rounded-xl border border-[var(--tu-border)] shadow-sm p-4">
                  <p className="text-xs font-semibold text-[var(--tu-text-subtle)] uppercase tracking-wide mb-3">By Status</p>
                  {Object.entries(data.workOrders.byStatus).filter(([, n]) => n > 0).sort(([, a], [, b]) => b - a).map(([s, n]) => (
                    <BarRow key={s} label={STATUS_LABELS[s] ?? s} count={n} total={data.workOrders.total} color={STATUS_COLORS[s] ?? "var(--tu-text-subtle)"} />
                  ))}
                </div>
                {Object.values(data.workOrders.byPriority).some((v) => v > 0) && (
                  <div className="bg-[var(--tu-bg-surface)] rounded-xl border border-[var(--tu-border)] shadow-sm p-4">
                    <p className="text-xs font-semibold text-[var(--tu-text-subtle)] uppercase tracking-wide mb-3">By Priority</p>
                    {(["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const).filter((p) => (data.workOrders.byPriority[p] ?? 0) > 0).map((p) => (
                      <BarRow key={p} label={p.charAt(0) + p.slice(1).toLowerCase()} count={data.workOrders.byPriority[p]} total={data.workOrders.total} color={PRIORITY_COLORS[p]} />
                    ))}
                  </div>
                )}
                {data.workOrders.byCategory.length > 0 && (
                  <div className="bg-[var(--tu-bg-surface)] rounded-xl border border-[var(--tu-border)] shadow-sm p-4 md:col-span-2">
                    <p className="text-xs font-semibold text-[var(--tu-text-subtle)] uppercase tracking-wide mb-3">By Category</p>
                    {data.workOrders.byCategory.map(({ category, count }) => (
                      <BarRow key={category} label={category} count={count} total={data.workOrders.total} color="var(--tu-text-brand)" />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Parts used — only worth showing once anyone has recorded some */}
          {data.parts && data.parts.lines > 0 && (
            <div>
              <h3 className="text-sm font-bold text-[var(--tu-text-body)] mb-3">Parts Used</h3>
              <div className="flex gap-3 mb-4 flex-wrap">
                <StatCard label="Total Cost" value={formatPeso(data.parts.totalCost)} />
                <StatCard label="Jobs w/ Parts" value={data.parts.workOrdersWithParts} />
                <StatCard
                  label="Avg / Job"
                  value={data.parts.avgCostPerWorkOrder != null ? formatPeso(data.parts.avgCostPerWorkOrder) : "—"}
                />
              </div>
              {data.parts.top.length > 0 && (
                <div className="bg-[var(--tu-bg-surface)] rounded-xl border border-[var(--tu-border)] shadow-sm overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-[var(--tu-bg-secondary)]">
                      <tr className="text-left text-xs text-[var(--tu-text-subtle)]">
                        <th className="px-4 py-2 font-medium">Part</th>
                        <th className="px-4 py-2 font-medium text-right">Qty</th>
                        <th className="px-4 py-2 font-medium text-right">Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.parts.top.map((p) => (
                        <tr key={p.description} className="border-t border-[var(--tu-border)]">
                          <td className="px-4 py-2 text-[var(--tu-text-body)]">{p.description}</td>
                          <td className="px-4 py-2 text-right text-[var(--tu-text-body)]">{p.quantity}</td>
                          <td className="px-4 py-2 text-right font-medium text-[var(--tu-text-body)]">{formatPeso(p.cost)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Attendance */}
          <div>
            <h3 className="text-sm font-bold text-[var(--tu-text-body)] mb-3">Attendance</h3>
            <div className="flex gap-3 mb-4 flex-wrap">
              <StatCard label="Present" value={data.attendance.presentTotal} color="text-[var(--tu-on-success)]" />
              <StatCard label="Absent" value={data.attendance.absentTotal} color="text-[var(--tu-on-danger)]" />
              <StatCard label="Total" value={data.attendance.total} />
            </div>
            {data.attendance.byEmployee.length > 0 && (
              <div className="bg-[var(--tu-bg-surface)] rounded-xl border border-[var(--tu-border)] shadow-sm overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[var(--tu-bg-secondary)] text-xs text-[var(--tu-text-subtle)] font-semibold uppercase tracking-wide">
                      <th className="px-4 py-3 text-left">Employee</th>
                      <th className="px-4 py-3 text-center">Present</th>
                      <th className="px-4 py-3 text-center">Absent</th>
                      <th className="px-4 py-3 text-center">Rate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--tu-border)]">
                    {data.attendance.byEmployee.filter((e) => e.total > 0).map((e) => (
                      <tr key={e.id} className="hover:bg-[var(--tu-bg-secondary)]">
                        <td className="px-4 py-3">
                          <p className="font-medium text-[var(--tu-text-heading)]">{e.name}</p>
                          {e.position && <p className="text-xs text-[var(--tu-text-subtle)]">{e.position}</p>}
                        </td>
                        <td className="px-4 py-3 text-center text-[var(--tu-on-success)] font-semibold">{e.present}</td>
                        <td className="px-4 py-3 text-center text-[var(--tu-on-danger)] font-semibold">{e.absent}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`font-semibold ${e.rate != null && e.rate >= 90 ? "text-[var(--tu-on-success)]" : e.rate != null && e.rate >= 70 ? "text-[var(--tu-on-warning)]" : "text-[var(--tu-on-danger)]"}`}>
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
          {(() => {
            const responses = data.checklistResponses ?? [];
            const totalLate = responses.reduce((s, c) => s + c.lateCount, 0);
            const totalDrafts = responses.reduce((s, c) => s + c.inProgress, 0);
            const completions = data.checklists.completedLogs;
            const onTimeRate = completions > 0 ? Math.round(((completions - totalLate) / completions) * 100) : null;
            const withData = responses.filter((c) => c.completions > 0);
            const byAsset = aggregateByAsset(responses).filter((a) => a.completions > 0);
            const trend = data.checklists.trend;
            return (
              <div>
                <h3 className="text-sm font-bold text-[var(--tu-text-body)] mb-3">PM Checklists</h3>
                <div className="flex gap-3 mb-4 flex-wrap">
                  <StatCard label="Assigned" value={data.checklists.assigned} />
                  <StatCard label="Completions" value={completions} color="text-[var(--tu-text-brand)]" />
                  <StatCard label="On-time" value={onTimeRate != null ? `${onTimeRate}%` : "—"} color="text-[var(--tu-on-success)]" />
                  <StatCard label="Late" value={totalLate} color={totalLate > 0 ? "text-[var(--tu-on-danger)]" : undefined} />
                  <StatCard label="In progress" value={totalDrafts} />
                </div>

                {trend && trend.points.some((p) => p.completed > 0) && (
                  <div className="mb-4">
                    <p className="text-xs font-semibold text-[var(--tu-text-subtle)] uppercase tracking-wide mb-2">Completions over time</p>
                    <TrendChart points={trend.points} />
                  </div>
                )}

                {byAsset.length > 0 && (
                  <div className="bg-[var(--tu-bg-surface)] rounded-xl border border-[var(--tu-border)] shadow-sm overflow-hidden mb-4">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-[var(--tu-bg-secondary)] text-xs text-[var(--tu-text-subtle)] font-semibold uppercase tracking-wide">
                          <th className="px-4 py-3 text-left">Asset</th>
                          <th className="px-4 py-3 text-center">Checklists</th>
                          <th className="px-4 py-3 text-center">Completions</th>
                          <th className="px-4 py-3 text-center">Late</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--tu-border)]">
                        {byAsset.map((a) => (
                          <tr key={a.asset} className="hover:bg-[var(--tu-bg-secondary)]">
                            <td className="px-4 py-3 font-medium text-[var(--tu-text-heading)]">{a.asset}</td>
                            <td className="px-4 py-3 text-center text-[var(--tu-text-body)]">{a.checklists}</td>
                            <td className="px-4 py-3 text-center text-[var(--tu-text-brand)] font-semibold">{a.completions}</td>
                            <td className={`px-4 py-3 text-center font-semibold ${a.late > 0 ? "text-[var(--tu-on-danger)]" : "text-[var(--tu-text-subtle)]"}`}>{a.late}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {data.checklists.byFrequency.length > 0 && (
                  <div className="bg-[var(--tu-bg-surface)] rounded-xl border border-[var(--tu-border)] shadow-sm overflow-hidden mb-4">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-[var(--tu-bg-secondary)] text-xs text-[var(--tu-text-subtle)] font-semibold uppercase tracking-wide">
                          <th className="px-4 py-3 text-left">Frequency</th>
                          <th className="px-4 py-3 text-center">Assigned</th>
                          <th className="px-4 py-3 text-center">Completed</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--tu-border)]">
                        {data.checklists.byFrequency.map(({ frequency, assigned, completed }) => (
                          <tr key={frequency} className="hover:bg-[var(--tu-bg-secondary)]">
                            <td className="px-4 py-3 font-medium text-[var(--tu-text-heading)]">{freqLabel(frequency)}</td>
                            <td className="px-4 py-3 text-center text-[var(--tu-text-body)]">{assigned}</td>
                            <td className="px-4 py-3 text-center text-[var(--tu-text-brand)] font-semibold">{completed}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Per-checklist response breakdown (Google-Forms style) */}
                {withData.length > 0 && (
                  <div className="space-y-3">
                    <p className="text-xs font-semibold text-[var(--tu-text-subtle)] uppercase tracking-wide">Response breakdown</p>
                    {withData.map((cl) => (
                      <details key={cl.id} className="bg-[var(--tu-bg-surface)] rounded-xl border border-[var(--tu-border)] shadow-sm overflow-hidden group">
                        <summary className="flex items-center justify-between gap-3 px-4 py-3 cursor-pointer list-none hover:bg-[var(--tu-bg-secondary)]">
                          <span className="min-w-0">
                            <span className="font-semibold text-[var(--tu-text-heading)]">{cl.checklistName}</span>
                            {cl.assetName && <span className="text-sm text-[var(--tu-text-subtle)]"> · {cl.assetName}</span>}
                          </span>
                          <span className="flex items-center gap-2 shrink-0 text-xs font-semibold">
                            <span className="rounded-full px-2 py-0.5 bg-[var(--tu-soft-brand)] text-[var(--tu-text-brand)]">{cl.completions} done</span>
                            {cl.inProgress > 0 && <span className="rounded-full px-2 py-0.5 bg-[var(--tu-bg-secondary-strong)] text-[var(--tu-text-body)]">{cl.inProgress} draft{cl.inProgress > 1 ? "s" : ""}</span>}
                            {cl.lateCount > 0 && <span className="rounded-full px-2 py-0.5 bg-[var(--tu-soft-danger)] text-[var(--tu-on-danger)]">{cl.lateCount} late</span>}
                            <span className="text-[var(--tu-text-disabled)] transition-transform group-open:rotate-180" aria-hidden="true">▾</span>
                          </span>
                        </summary>
                        <div className="px-4 pb-4 pt-1 border-t border-[var(--tu-border)]">
                          {cl.sections.map((sec, si) => (
                            <div key={si} className="mt-4 first:mt-2">
                              <p className="text-xs font-bold text-[var(--tu-text-subtle)] uppercase tracking-wide mb-3">{sec.title}</p>
                              {sec.items.map((item) => {
                                const itemTotal = Object.values(item.answers).reduce((a, b) => a + b, 0);
                                return (
                                  <div key={item.id} className="mb-4 last:mb-1">
                                    <p className="text-sm text-[var(--tu-text-body)] mb-2">{item.label}</p>
                                    {itemTotal === 0 ? (
                                      <p className="text-xs text-[var(--tu-text-subtle)]">No responses</p>
                                    ) : (
                                      sec.answerOptions.map((opt, oi) => (
                                        <BarRow key={opt} label={opt} count={item.answers[opt] ?? 0} total={itemTotal} color={answerColor(opt, oi)} />
                                      ))
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          ))}
                        </div>
                      </details>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}

          {/* Reliability — downtime, availability, MTTR, MTBF */}
          {reliability && (
            <div>
              <h3 className="text-sm font-bold text-[var(--tu-text-body)] mb-3">Reliability</h3>

              <div className="flex gap-3 mb-4 flex-wrap">
                <StatCard
                  label="Availability"
                  value={reliability.summary.availability != null ? `${(reliability.summary.availability * 100).toFixed(1)}%` : "—"}
                  color="text-[var(--tu-on-success)]"
                />
                <StatCard label="Downtime" value={`${reliability.summary.totalDowntimeHours}h`} />
                <StatCard
                  label="Failures"
                  value={reliability.summary.failures}
                  color={reliability.summary.failures > 0 ? "text-[var(--tu-on-danger)]" : undefined}
                />
                <StatCard label="Mean Time To Repair" value={reliability.summary.mttrHours != null ? `${reliability.summary.mttrHours}h` : "—"} />
                <StatCard label="Mean Time Between Failures" value={reliability.summary.mtbfHours != null ? `${reliability.summary.mtbfHours}h` : "—"} />
                <StatCard
                  label="Down now"
                  value={reliability.summary.assetsDownNow}
                  color={reliability.summary.assetsDownNow > 0 ? "text-[var(--tu-on-danger)]" : undefined}
                />
              </div>

              {/* MTBF is only as honest as the breakdown flag. Saying so beats
                  letting an unflagged account read as flawless. */}
              {reliability.coverage.unclassifiedWorkOrders > 0 && (
                <p className="text-xs text-[var(--tu-text-subtle)] mb-3">
                  {reliability.coverage.unclassifiedWorkOrders} work order
                  {reliability.coverage.unclassifiedWorkOrders === 1 ? " is" : "s are"} not marked as a
                  breakdown, so failure counts and mean time between failures cover only what has
                  been classified.
                </p>
              )}

              {reliability.assets.length === 0 ? (
                <EmptyState
                  compact
                  icon="asset"
                  title="No assets to measure"
                  hint="Reliability is calculated per asset. Add assets to this account to see downtime and failure rates."
                />
              ) : (
                <div className="bg-[var(--tu-bg-surface)] rounded-xl border border-[var(--tu-border)] shadow-sm overflow-hidden mb-4">
                  <div style={{ overflowX: "auto" }}>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-[var(--tu-bg-secondary)] text-xs text-[var(--tu-text-subtle)] font-semibold uppercase tracking-wide">
                          <th className="px-4 py-3 text-left">Asset</th>
                          <th className="px-4 py-3 text-center">Availability</th>
                          <th className="px-4 py-3 text-center">Downtime</th>
                          <th className="px-4 py-3 text-center">Failures</th>
                          <th className="px-4 py-3 text-center">Mean Time<br />To Repair</th>
                          <th className="px-4 py-3 text-center">Mean Time<br />Between Failures</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--tu-border)]">
                        {reliability.assets.map((a) => (
                          <tr key={a.assetId}>
                            <td className="px-4 py-3">
                              <span className="font-medium text-[var(--tu-text-heading)]">{a.name}</span>
                              {a.isDownNow && (
                                <span className="tu-badge tu-badge-danger" style={{ marginLeft: 8 }}>Down</span>
                              )}
                              <span className="block text-xs text-[var(--tu-text-subtle)]">{a.category}</span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              {a.availability != null ? (
                                <span className={a.availability < 0.9 ? "tu-figure text-[var(--tu-on-danger)]" : "tu-figure"}>
                                  {(a.availability * 100).toFixed(1)}%
                                </span>
                              ) : (
                                <span className="tu-figure-zero">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-center">
                              {a.downtimeHours > 0 ? <span className="tu-figure">{a.downtimeHours}h</span> : <span className="tu-figure-zero">—</span>}
                            </td>
                            <td className="px-4 py-3 text-center">
                              {a.failures > 0 ? <span className="tu-figure">{a.failures}</span> : <span className="tu-figure-zero">—</span>}
                            </td>
                            <td className="px-4 py-3 text-center">
                              {a.mttrHours != null ? <span className="tu-figure">{a.mttrHours}h</span> : <span className="tu-figure-zero">—</span>}
                            </td>
                            <td className="px-4 py-3 text-center">
                              {a.mtbfHours != null ? <span className="tu-figure">{a.mtbfHours}h</span> : <span className="tu-figure-zero">—</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Employee Performance */}
          <div>
            <h3 className="text-sm font-bold text-[var(--tu-text-body)] mb-3">Employee Performance</h3>
            {data.employees.length === 0 ? (
              <div className="bg-[var(--tu-bg-surface)] rounded-xl border border-[var(--tu-border)] shadow-sm p-8 text-center text-[var(--tu-text-subtle)] text-sm">
                No employees in this account.
              </div>
            ) : (
              <div className="bg-[var(--tu-bg-surface)] rounded-xl border border-[var(--tu-border)] shadow-sm divide-y divide-[var(--tu-border)]">
                {data.employees.map((emp) => {
                  const woPct = emp.workOrders.assigned > 0 ? emp.workOrders.completed / emp.workOrders.assigned : null;
                  const att = data.attendance.byEmployee.find((a) => a.id === emp.id);
                  return (
                    <div key={emp.id} className="p-4">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-8 h-8 rounded-full bg-[var(--tu-soft-brand)] flex items-center justify-center shrink-0">
                          <span className="text-sm font-bold text-[var(--tu-text-brand)]">{emp.name.charAt(0).toUpperCase()}</span>
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-[var(--tu-text-heading)]">{emp.name}</p>
                          {emp.position && <p className="text-xs text-[var(--tu-text-subtle)]">{emp.position}</p>}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div>
                          <div className="flex justify-between mb-1">
                            <span className="text-xs text-[var(--tu-text-subtle)]">Work Orders</span>
                            <span className="text-xs font-semibold text-[var(--tu-text-body)]">
                              <span className="text-[var(--tu-on-success)]">{emp.workOrders.completed}</span>/{emp.workOrders.assigned}
                              {emp.workOrders.inProgress > 0 && <span className="text-[var(--tu-text-subtle)]"> · {emp.workOrders.inProgress} active</span>}
                            </span>
                          </div>
                          <div className="h-1.5 bg-[var(--tu-bg-secondary-strong)] rounded-full overflow-hidden">
                            <div className="h-1.5 rounded-full" style={{ width: `${Math.round((woPct ?? 0) * 100)}%`, backgroundColor: woPct != null && woPct >= 0.7 ? "#16a34a" : "#f59e0b" }} />
                          </div>
                        </div>
                        {att && att.total > 0 && (
                          <div>
                            <div className="flex justify-between mb-1">
                              <span className="text-xs text-[var(--tu-text-subtle)]">Attendance</span>
                              <span className="text-xs font-semibold text-[var(--tu-text-body)]">
                                <span className="text-[var(--tu-on-success)]">{att.present}P</span>
                                <span className="text-[var(--tu-text-subtle)]"> / {att.absent}A</span>
                              </span>
                            </div>
                            <div className="h-1.5 bg-[var(--tu-bg-secondary-strong)] rounded-full overflow-hidden">
                              <div className="h-1.5 rounded-full bg-[var(--tu-status-completed)]" style={{ width: `${Math.round((att.present / att.total) * 100)}%` }} />
                            </div>
                          </div>
                        )}
                        {emp.training.total > 0 && (
                          <div>
                            <div className="flex justify-between mb-1">
                              <span className="text-xs text-[var(--tu-text-subtle)]">Training</span>
                              <span className="text-xs font-semibold text-violet-700">
                                {emp.training.completed}/{emp.training.total}
                              </span>
                            </div>
                            <div className="h-1.5 bg-[var(--tu-bg-secondary-strong)] rounded-full overflow-hidden">
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
