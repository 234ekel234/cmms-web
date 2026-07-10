"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import api from "@/lib/api";

type WorkOrder = {
  id: string; status: string; priority: string;
  dueDate: string | null; completedAt: string | null; isSpecialProject: boolean;
};
type Asset = { id: string; health: string; status: string; archivedAt: string | null };
type Employee = { id: string; occupied: boolean };
type PMLog = { scheduledDate: string; isDraft: boolean };
type PMAssignment = { id: string; checklist: { frequency: string }; logs: PMLog[] };
type Activity = { id: string; description: string; performedByName: string | null; createdAt: string };
type ShiftTemplate = { id: string; name: string; startTime: string; endTime: string };
type Account = { id: string; name: string; description: string | null; createdAt: string; shiftTemplates: ShiftTemplate[] };

const WO_STATUS: { key: string; label: string; cls: string }[] = [
  { key: "REQUESTED",   label: "Requested",   cls: "bg-purple-500" },
  { key: "PENDING",     label: "Accepted",    cls: "bg-blue-500" },
  { key: "IN_PROGRESS", label: "In Progress", cls: "bg-amber-500" },
  { key: "ON_HOLD",     label: "On Hold",     cls: "bg-slate-400" },
  { key: "COMPLETED",   label: "Completed",   cls: "bg-green-500" },
  { key: "REJECTED",    label: "Rejected",    cls: "bg-red-400" },
];

const HEALTH: { key: string; label: string; cls: string }[] = [
  { key: "NEW",            label: "New",            cls: "bg-blue-500" },
  { key: "GOOD",           label: "Good",           cls: "bg-green-500" },
  { key: "FAIR",           label: "Fair",           cls: "bg-amber-500" },
  { key: "POOR",           label: "Poor",           cls: "bg-orange-500" },
  { key: "OUT_OF_SERVICE", label: "Out of Service", cls: "bg-red-500" },
];

function getPeriodStart(frequency: string, now: number): number {
  const d = new Date(now);
  const y = d.getFullYear(), m = d.getMonth();
  switch (frequency) {
    case "DAILY":         return Date.UTC(y, m, d.getDate());
    case "WEEKLY":        return Date.UTC(y, m, d.getDate() - d.getDay());
    case "MONTHLY":       return Date.UTC(y, m, 1);
    case "QUARTERLY":     return Date.UTC(y, Math.floor(m / 3) * 3, 1);
    case "SEMI_ANNUALLY": return Date.UTC(y, Math.floor(m / 6) * 6, 1);
    case "ANNUALLY":      return Date.UTC(y, 0, 1);
    default:              return Date.UTC(y, m, d.getDate());
  }
}

function pmStatus(a: PMAssignment, now: number): "done" | "draft" | "unanswered" {
  const start = getPeriodStart(a.checklist.frequency, now);
  const log = a.logs.find((l) => new Date(l.scheduledDate).getTime() >= start);
  if (log && !log.isDraft) return "done";
  if (log) return "draft";
  return "unanswered";
}

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const fmtRel = (d: string) =>
  new Date(d).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

function StatTile({ label, value, sub, href, accent }: { label: string; value: string; sub?: string; href: string; accent?: string }) {
  return (
    <Link href={href} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 hover:shadow-md transition-shadow">
      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${accent ?? "text-gray-900"}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </Link>
  );
}

// Compact segmented bar with a labelled legend for a categorical breakdown.
function Breakdown({ segments, total }: { segments: { label: string; count: number; cls: string }[]; total: number }) {
  const present = segments.filter((s) => s.count > 0);
  return (
    <div>
      <div className="flex h-2.5 rounded-full overflow-hidden bg-gray-100 mb-3">
        {present.map((s) => (
          <div key={s.label} className={s.cls} style={{ width: `${(s.count / total) * 100}%` }} title={`${s.label}: ${s.count}`} />
        ))}
      </div>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center gap-2 text-xs">
            <span className={`w-2.5 h-2.5 rounded-sm ${s.cls}`} aria-hidden="true" />
            <span className="text-gray-500 flex-1">{s.label}</span>
            <span className="font-semibold text-gray-800 tabular-nums">{s.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function AccountOverviewPage() {
  const params = useParams();
  const accountId = params.accountId as string;
  const base = `/accounts/${accountId}`;
  const [account, setAccount] = useState<Account | null>(null);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [pm, setPm] = useState<PMAssignment[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [now] = useState(() => Date.now());

  useEffect(() => { fetchAll(); }, [accountId]);

  async function fetchAll() {
    setLoading(true);
    try {
      const [acc, wo, as, emp, pmc, act] = await Promise.all([
        api.get(`${base}`).catch(() => ({ data: null })),
        api.get(`${base}/work-orders`).catch(() => ({ data: [] })),
        api.get(`${base}/assets`).catch(() => ({ data: [] })),
        api.get(`${base}/employees`).catch(() => ({ data: [] })),
        api.get(`${base}/pm-checklists`).catch(() => ({ data: [] })),
        api.get(`${base}/audit-logs`).catch(() => ({ data: [] })),
      ]);
      setAccount(acc.data);
      setWorkOrders(wo.data);
      setAssets(as.data);
      setEmployees(emp.data);
      setPm(pmc.data);
      setActivity(act.data);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="p-8 grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => <div key={i} className="h-24 bg-white rounded-xl border border-gray-100 animate-pulse" />)}
      </div>
    );
  }

  // Work orders
  const isOpen = (w: WorkOrder) => !["COMPLETED", "REJECTED"].includes(w.status);
  const openWO = workOrders.filter(isOpen);
  const overdue = openWO.filter((w) => w.dueDate && new Date(w.dueDate).getTime() < now);
  const specialProjects = workOrders.filter((w) => w.isSpecialProject).length;
  const woSegments = WO_STATUS.map((s) => ({ label: s.label, count: workOrders.filter((w) => w.status === s.key).length, cls: s.cls }));

  // Assets
  const activeAssets = assets.filter((a) => !a.archivedAt);
  const underMaint = activeAssets.filter((a) => a.status === "UNDER_MAINTENANCE").length;
  const healthSegments = HEALTH.map((h) => ({ label: h.label, count: activeAssets.filter((a) => a.health === h.key).length, cls: h.cls }));

  // Employees
  const occupied = employees.filter((e) => e.occupied).length;

  // PM this period
  const pmCounts = { done: 0, draft: 0, unanswered: 0 };
  pm.forEach((a) => { pmCounts[pmStatus(a, now)]++; });
  const pmPct = pm.length > 0 ? Math.round((pmCounts.done / pm.length) * 100) : 0;

  return (
    <div className="p-8 space-y-6">
      {/* Stat tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile label="Open Work Orders" value={String(openWO.length)} sub={overdue.length > 0 ? `${overdue.length} overdue` : "none overdue"} href={`${base}/work-orders`} accent={openWO.length > 0 ? "text-[#2166AC]" : undefined} />
        <StatTile label="Assets" value={String(activeAssets.length)} sub={underMaint > 0 ? `${underMaint} under maintenance` : "all operational"} href={`${base}/assets`} />
        <StatTile label="Employees" value={String(employees.length)} sub={occupied > 0 ? `${occupied} occupied` : "all available"} href={`${base}/employees`} />
        <StatTile label="PM This Period" value={`${pmPct}%`} sub={`${pmCounts.done}/${pm.length} completed`} href={`${base}/checklists`} accent={pmPct >= 90 ? "text-green-600" : pmPct >= 50 ? "text-amber-600" : "text-red-600"} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Work orders breakdown */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-700">Work Orders ({workOrders.length})</h2>
            <Link href={`${base}/work-orders`} className="text-xs text-[#2166AC] hover:underline">View all →</Link>
          </div>
          {workOrders.length === 0 ? (
            <p className="text-sm text-gray-400">No work orders yet.</p>
          ) : (
            <>
              <Breakdown segments={woSegments} total={workOrders.length} />
              <div className="flex gap-4 mt-4 pt-3 border-t border-gray-100 text-xs">
                {overdue.length > 0 && <span className="text-red-600 font-semibold">{overdue.length} overdue</span>}
                {specialProjects > 0 && <span className="text-gray-500">{specialProjects} special project{specialProjects > 1 ? "s" : ""}</span>}
              </div>
            </>
          )}
        </div>

        {/* Asset health breakdown */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-700">Asset Health ({activeAssets.length})</h2>
            <Link href={`${base}/assets`} className="text-xs text-[#2166AC] hover:underline">View all →</Link>
          </div>
          {activeAssets.length === 0 ? (
            <p className="text-sm text-gray-400">No assets yet.</p>
          ) : (
            <Breakdown segments={healthSegments} total={activeAssets.length} />
          )}
        </div>

        {/* PM compliance */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-700">PM Checklists ({pm.length})</h2>
            <Link href={`${base}/checklists`} className="text-xs text-[#2166AC] hover:underline">View all →</Link>
          </div>
          {pm.length === 0 ? (
            <p className="text-sm text-gray-400">No checklists assigned.</p>
          ) : (
            <>
              <div className="flex items-baseline gap-2 mb-3">
                <span className="text-2xl font-bold text-gray-900">{pmPct}%</span>
                <span className="text-xs text-gray-400">completed this period</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-3">
                <div className="h-2 bg-green-500 rounded-full" style={{ width: `${pmPct}%` }} />
              </div>
              <div className="flex gap-4 text-xs">
                <span className="text-green-700 font-semibold">{pmCounts.done} done</span>
                <span className="text-amber-700 font-semibold">{pmCounts.draft} draft</span>
                <span className="text-gray-500 font-semibold">{pmCounts.unanswered} unanswered</span>
              </div>
            </>
          )}
        </div>

        {/* Recent activity */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-700">Recent Activity</h2>
            <Link href={`${base}/activity`} className="text-xs text-[#2166AC] hover:underline">View all →</Link>
          </div>
          {activity.length === 0 ? (
            <p className="text-sm text-gray-400">No activity yet.</p>
          ) : (
            <ul className="space-y-3">
              {activity.slice(0, 6).map((a) => (
                <li key={a.id} className="text-xs">
                  <p className="text-gray-700">{a.description}</p>
                  <p className="text-gray-400 mt-0.5">{fmtRel(a.createdAt)}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Account info */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Account Info</h2>
        <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3 text-xs mb-4">
          <div>
            <dt className="font-semibold text-gray-400">Created</dt>
            <dd className="text-gray-700 mt-0.5">{account ? fmtDate(account.createdAt) : "—"}</dd>
          </div>
          <div>
            <dt className="font-semibold text-gray-400">Team Size</dt>
            <dd className="text-gray-700 mt-0.5">{employees.length} employee{employees.length === 1 ? "" : "s"}</dd>
          </div>
          <div>
            <dt className="font-semibold text-gray-400">Shift Templates</dt>
            <dd className="text-gray-700 mt-0.5">{account?.shiftTemplates?.length ?? 0}</dd>
          </div>
        </dl>
        {account?.shiftTemplates && account.shiftTemplates.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-3 border-t border-gray-100">
            {account.shiftTemplates.map((s) => (
              <span key={s.id} className="rounded-full bg-gray-50 border border-gray-200 px-3 py-1 text-xs text-gray-600">
                <span className="font-semibold text-gray-700">{s.name}</span> · {s.startTime}–{s.endTime}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
