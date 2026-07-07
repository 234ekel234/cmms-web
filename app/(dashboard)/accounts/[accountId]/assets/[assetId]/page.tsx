"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import api from "@/lib/api";
import Breadcrumbs from "@/components/Breadcrumbs";

type AssetHealth = "GOOD" | "FAIR" | "POOR" | "OUT_OF_SERVICE";
type AssetStatus = "OPERATIONAL" | "UNDER_MAINTENANCE";

type Asset = {
  id: string;
  name: string;
  category: string;
  status: AssetStatus;
  health: AssetHealth;
  serialNumber: string | null;
  location: string | null;
  purchaseDate: string | null;
  purchaseCost: number | null;
  warrantyExpiry: string | null;
  manufacturedDate: string | null;
  archivedAt: string | null;
  createdAt: string;
};

type WorkOrder = {
  id: string;
  title: string;
  status: string;
  priority: string;
  createdAt: string;
  completedAt: string | null;
  accountId: string;
  assignments: { employee: { id: string; name: string } }[];
};

type PMLogLite = {
  id: string;
  scheduledDate: string;
  completedAt: string;
  isDraft: boolean;
  isLate: boolean;
};

type PMChecklistAssignment = {
  id: string;
  isActive: boolean;
  checklist: { id: string; name: string; frequency: string };
  logs: PMLogLite[];
};

const HEALTH_CONFIG: Record<AssetHealth, { label: string; cls: string }> = {
  GOOD:           { label: "Good",           cls: "bg-green-50 text-green-700" },
  FAIR:           { label: "Fair",           cls: "bg-amber-50 text-amber-700" },
  POOR:           { label: "Poor",           cls: "bg-orange-50 text-orange-700" },
  OUT_OF_SERVICE: { label: "Out of Service", cls: "bg-red-50 text-red-700" },
};

const WO_STATUS_CLS: Record<string, string> = {
  REQUESTED:   "bg-purple-50 text-purple-700",
  PENDING:     "bg-blue-50 text-blue-700",
  IN_PROGRESS: "bg-amber-50 text-amber-700",
  COMPLETED:   "bg-green-50 text-green-700",
  REJECTED:    "bg-red-50 text-red-700",
};

const WO_STATUS_LABELS: Record<string, string> = {
  REQUESTED: "Requested", PENDING: "Accepted", IN_PROGRESS: "In Progress",
  COMPLETED: "Completed", REJECTED: "Rejected",
};

const FREQUENCY_CONFIG: Record<string, { label: string; cls: string }> = {
  DAILY:         { label: "Daily",         cls: "bg-blue-50 text-blue-700" },
  WEEKLY:        { label: "Weekly",        cls: "bg-violet-50 text-violet-700" },
  MONTHLY:       { label: "Monthly",       cls: "bg-amber-50 text-amber-700" },
  QUARTERLY:     { label: "Quarterly",     cls: "bg-teal-50 text-teal-700" },
  SEMI_ANNUALLY: { label: "Semi-Annually", cls: "bg-pink-50 text-pink-700" },
  ANNUALLY:      { label: "Annually",      cls: "bg-green-50 text-green-700" },
};

const PRIORITY_CONFIG: Record<string, { label: string; cls: string }> = {
  LOW:      { label: "Low",      cls: "bg-gray-100 text-gray-600" },
  MEDIUM:   { label: "Medium",   cls: "bg-blue-50 text-blue-700" },
  HIGH:     { label: "High",     cls: "bg-orange-50 text-orange-700" },
  CRITICAL: { label: "Critical", cls: "bg-red-50 text-red-700" },
};

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

const fmtCost = (n: number) =>
  `₱${n.toLocaleString("en-PH", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

// One work-order row: title + priority, status, dates, and assignees.
function WorkOrderRow({ wo }: { wo: WorkOrder }) {
  const pr = PRIORITY_CONFIG[wo.priority] ?? { label: wo.priority, cls: "bg-gray-100 text-gray-600" };
  const isClosed = ["COMPLETED", "REJECTED"].includes(wo.status);
  const dateLabel =
    isClosed && wo.completedAt ? `Completed ${fmtDate(wo.completedAt)}` : `Opened ${fmtDate(wo.createdAt)}`;
  const assignees = (wo.assignments ?? []).map((a) => a.employee.name);
  return (
    <Link
      href={`/accounts/${wo.accountId}/work-orders/${wo.id}`}
      className="flex items-center justify-between gap-3 px-6 py-3 hover:bg-gray-50 transition-colors"
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-medium text-gray-800 truncate">{wo.title}</p>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${pr.cls}`}>{pr.label}</span>
        </div>
        <p className="text-xs text-gray-400 mt-0.5">
          {dateLabel} · {assignees.length > 0 ? assignees.join(", ") : "Unassigned"}
        </p>
      </div>
      <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${WO_STATUS_CLS[wo.status] ?? "bg-gray-100 text-gray-600"}`}>
        {WO_STATUS_LABELS[wo.status] ?? wo.status}
      </span>
    </Link>
  );
}

// Warranty coverage relative to `now`, or null when no expiry is on file.
function warrantyStatus(expiry: string | null, now: number) {
  if (!expiry) return null;
  const days = Math.ceil((new Date(expiry).getTime() - now) / 86_400_000);
  if (days < 0) return { label: "Expired", cls: "bg-red-50 text-red-700" };
  if (days <= 30) return { label: `Expires in ${days}d`, cls: "bg-amber-50 text-amber-700" };
  return { label: "Under warranty", cls: "bg-green-50 text-green-700" };
}

export default function AssetDetailPage() {
  const params = useParams();
  const accountId = params.accountId as string;
  const assetId = params.assetId as string;
  const [asset, setAsset] = useState<Asset | null>(null);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [pmChecklists, setPmChecklists] = useState<PMChecklistAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [editHealth, setEditHealth] = useState(false);
  const [editStatus, setEditStatus] = useState(false);
  const [saving, setSaving] = useState(false);
  // Captured once at mount so warranty/age math stays pure across re-renders.
  const [now] = useState(() => Date.now());

  useEffect(() => { fetchAsset(); }, [assetId]);

  async function fetchAsset() {
    setLoading(true);
    setError(false);
    try {
      const [assetRes, woRes, pmRes] = await Promise.all([
        api.get(`/assets/${assetId}`),
        api.get(`/assets/${assetId}/work-orders`).catch(() => ({ data: [] })),
        api.get(`/assets/${assetId}/pm-checklists`).catch(() => ({ data: [] })),
      ]);
      setAsset(assetRes.data);
      setWorkOrders(woRes.data);
      setPmChecklists(pmRes.data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  async function updateAsset(updates: Partial<Asset>) {
    if (!asset) return;
    setSaving(true);
    try {
      const res = await api.patch(`/assets/${assetId}`, updates);
      setAsset(res.data);
      setEditHealth(false);
      setEditStatus(false);
    } catch {
      // silent
    } finally {
      setSaving(false);
    }
  }

  async function toggleArchive() {
    if (!asset) return;
    setSaving(true);
    try {
      const endpoint = asset.archivedAt ? `/assets/${assetId}/unarchive` : `/assets/${assetId}/archive`;
      const res = await api.post(endpoint);
      setAsset(res.data);
    } catch {
      // silent
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="p-8 max-w-3xl mx-auto">
        <div className="h-8 w-48 bg-gray-100 rounded animate-pulse mb-6" />
        <div className="h-64 bg-white rounded-xl border border-gray-100 animate-pulse" />
      </div>
    );
  }

  if (error || !asset) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
          Failed to load asset.{" "}
          <button onClick={fetchAsset} className="underline cursor-pointer">Try again</button>
        </div>
      </div>
    );
  }

  const hCfg = HEALTH_CONFIG[asset.health];
  const openWOs = workOrders.filter((w) => !["COMPLETED", "REJECTED"].includes(w.status));
  const closedWOs = workOrders.filter((w) => ["COMPLETED", "REJECTED"].includes(w.status));
  const warranty = warrantyStatus(asset.warrantyExpiry, now);
  const lastServiced = workOrders
    .filter((w) => w.status === "COMPLETED" && w.completedAt)
    .map((w) => w.completedAt as string)
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null;

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <Breadcrumbs
        items={[
          { label: "Assets", href: `/accounts/${accountId}/assets` },
          { label: asset.name },
        ]}
      />

      {/* Main info card */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 mb-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{asset.name}</h1>
            <p className="text-sm text-gray-500 mt-0.5">{asset.category}</p>
            {asset.archivedAt && (
              <span className="inline-block mt-1 text-xs bg-gray-100 text-gray-500 rounded-full px-2 py-0.5">Archived</span>
            )}
          </div>
          <button
            onClick={toggleArchive}
            disabled={saving}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer transition-colors ${
              asset.archivedAt
                ? "border-green-200 text-green-700 hover:bg-green-50"
                : "border-gray-200 text-gray-500 hover:bg-gray-50"
            }`}
          >
            {asset.archivedAt ? "Unarchive" : "Archive"}
          </button>
        </div>

        {/* Health */}
        <div className="mb-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Health</p>
          {editHealth ? (
            <div className="flex gap-2 flex-wrap">
              {(Object.keys(HEALTH_CONFIG) as AssetHealth[]).map((h) => (
                <button
                  key={h}
                  onClick={() => updateAsset({ health: h })}
                  disabled={saving}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer transition-colors ${
                    asset.health === h ? HEALTH_CONFIG[h].cls + " border-current" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
                  }`}
                >
                  {HEALTH_CONFIG[h].label}
                </button>
              ))}
              <button onClick={() => setEditHealth(false)} className="px-3 py-1.5 text-xs text-gray-500 cursor-pointer">Cancel</button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${hCfg.cls}`}>{hCfg.label}</span>
              {!asset.archivedAt && (
                <button onClick={() => setEditHealth(true)} className="text-xs text-[#2166AC] hover:underline cursor-pointer">Edit</button>
              )}
            </div>
          )}
        </div>

        {/* Status */}
        <div className="mb-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Status</p>
          {editStatus ? (
            <div className="flex gap-2">
              {(["OPERATIONAL", "UNDER_MAINTENANCE"] as AssetStatus[]).map((s) => (
                <button
                  key={s}
                  onClick={() => updateAsset({ status: s })}
                  disabled={saving}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer transition-colors ${
                    asset.status === s ? "bg-[#2166AC] text-white border-[#2166AC]" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
                  }`}
                >
                  {s === "OPERATIONAL" ? "Operational" : "Under Maintenance"}
                </button>
              ))}
              <button onClick={() => setEditStatus(false)} className="px-3 py-1.5 text-xs text-gray-500 cursor-pointer">Cancel</button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${asset.status === "OPERATIONAL" ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"}`}>
                {asset.status === "OPERATIONAL" ? "Operational" : "Under Maintenance"}
              </span>
              {!asset.archivedAt && (
                <button onClick={() => setEditStatus(true)} className="text-xs text-[#2166AC] hover:underline cursor-pointer">Edit</button>
              )}
            </div>
          )}
        </div>

        {/* Details */}
        <div className="pt-4 border-t border-gray-100">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Details</p>
          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3 text-xs">
            {[
              { label: "Serial No.", value: asset.serialNumber },
              { label: "Location", value: asset.location },
              { label: "Manufactured", value: asset.manufacturedDate ? fmtDate(asset.manufacturedDate) : null },
              { label: "Purchased", value: asset.purchaseDate ? fmtDate(asset.purchaseDate) : null },
              { label: "Purchase Cost", value: asset.purchaseCost != null ? fmtCost(asset.purchaseCost) : null },
              { label: "Registered", value: fmtDate(asset.createdAt) },
            ].map((f) => (
              <div key={f.label}>
                <dt className="font-semibold text-gray-400">{f.label}</dt>
                <dd className="text-gray-700 mt-0.5">{f.value ?? <span className="text-gray-300">—</span>}</dd>
              </div>
            ))}
            <div>
              <dt className="font-semibold text-gray-400">Warranty</dt>
              <dd className="mt-0.5">
                {asset.warrantyExpiry ? (
                  <span className="flex items-center gap-1.5">
                    <span className="text-gray-700">{fmtDate(asset.warrantyExpiry)}</span>
                    {warranty && (
                      <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${warranty.cls}`}>
                        {warranty.label}
                      </span>
                    )}
                  </span>
                ) : (
                  <span className="text-gray-300">—</span>
                )}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: "Open Work Orders", value: String(openWOs.length), accent: openWOs.length > 0 ? "text-[#2166AC]" : "text-gray-800" },
          { label: "Total Work Orders", value: String(workOrders.length), accent: "text-gray-800" },
          { label: "Last Serviced", value: lastServiced ? fmtDate(lastServiced) : "—", accent: "text-gray-800" },
          { label: "PM Checklists", value: String(pmChecklists.length), accent: "text-gray-800" },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">{s.label}</p>
            <p className={`text-lg font-bold mt-1 ${s.accent}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* PM checklists */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden mb-6">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700">PM Checklists ({pmChecklists.length})</h2>
        </div>
        {pmChecklists.length === 0 ? (
          <p className="px-6 py-6 text-sm text-gray-400">No PM checklists assigned to this asset.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {pmChecklists.map((pm) => {
              const freq = FREQUENCY_CONFIG[pm.checklist.frequency] ?? { label: pm.checklist.frequency, cls: "bg-gray-100 text-gray-600" };
              const last = pm.logs[0];
              return (
                <Link
                  key={pm.id}
                  href={`/accounts/${accountId}/checklists/${pm.id}`}
                  className="flex items-center justify-between px-6 py-3 hover:bg-gray-50 transition-colors"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-800">{pm.checklist.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {last ? `Last done ${fmtDate(last.completedAt)}${last.isDraft ? " (draft)" : ""}` : "Never completed"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {!pm.isActive && (
                      <span className="rounded-full px-2 py-0.5 text-xs font-semibold bg-gray-100 text-gray-500">Inactive</span>
                    )}
                    {last?.isLate && (
                      <span className="rounded-full px-2 py-0.5 text-xs font-semibold bg-red-50 text-red-700">Late</span>
                    )}
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${freq.cls}`}>{freq.label}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* Work orders */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-gray-700">Work Orders ({workOrders.length})</h2>
          {workOrders.length > 0 && (
            <p className="text-xs text-gray-400">{openWOs.length} open · {closedWOs.length} closed</p>
          )}
        </div>
        {workOrders.length === 0 ? (
          <p className="px-6 py-6 text-sm text-gray-400">No work orders for this asset.</p>
        ) : (
          <>
            {openWOs.length > 0 && (
              <>
                <p className="px-6 pt-3 pb-1 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
                  Open ({openWOs.length})
                </p>
                <div className="divide-y divide-gray-100">
                  {openWOs.map((wo) => <WorkOrderRow key={wo.id} wo={wo} />)}
                </div>
              </>
            )}
            {closedWOs.length > 0 && (
              <>
                <p className="px-6 pt-3 pb-1 text-[11px] font-semibold text-gray-400 uppercase tracking-wide border-t border-gray-100">
                  History ({closedWOs.length})
                </p>
                <div className="divide-y divide-gray-100">
                  {closedWOs.map((wo) => <WorkOrderRow key={wo.id} wo={wo} />)}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
