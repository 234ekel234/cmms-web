"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import api from "@/lib/api";

type AssetHealth = "GOOD" | "FAIR" | "POOR" | "OUT_OF_SERVICE";
type AssetStatus = "OPERATIONAL" | "UNDER_MAINTENANCE";

type Asset = {
  id: string;
  name: string;
  category: string;
  status: AssetStatus;
  health: AssetHealth;
  notes: string | null;
  serialNumber: string | null;
  location: string | null;
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

export default function AssetDetailPage() {
  const params = useParams();
  const accountId = params.accountId as string;
  const assetId = params.assetId as string;
  const [asset, setAsset] = useState<Asset | null>(null);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [editHealth, setEditHealth] = useState(false);
  const [editStatus, setEditStatus] = useState(false);
  const [editNotes, setEditNotes] = useState(false);
  const [notesVal, setNotesVal] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetchAsset(); }, [assetId]);

  async function fetchAsset() {
    setLoading(true);
    setError(false);
    try {
      const [assetRes, woRes] = await Promise.all([
        api.get(`/assets/${assetId}`),
        api.get(`/assets/${assetId}/work-orders`).catch(() => ({ data: [] })),
      ]);
      setAsset(assetRes.data);
      setWorkOrders(woRes.data);
      setNotesVal(assetRes.data.notes ?? "");
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
      setEditNotes(false);
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

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="mb-6">
        <Link href={`/accounts/${accountId}/assets`} className="text-xs text-gray-400 hover:text-[#2166AC] transition-colors">
          ← Assets
        </Link>
      </div>

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

        {/* Notes */}
        <div className="mb-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Notes</p>
          {editNotes ? (
            <div>
              <textarea
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2166AC] resize-none mb-2"
                rows={3}
                value={notesVal}
                onChange={(e) => setNotesVal(e.target.value)}
                placeholder="Add notes about this asset..."
              />
              <div className="flex gap-2">
                <button onClick={() => setEditNotes(false)} className="px-3 py-1.5 text-xs text-gray-500 border border-gray-200 rounded-lg cursor-pointer">Cancel</button>
                <button onClick={() => updateAsset({ notes: notesVal || null } as Partial<Asset>)} disabled={saving} className="px-3 py-1.5 text-xs text-white bg-[#2166AC] rounded-lg cursor-pointer disabled:opacity-50">
                  {saving ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-2">
              <p className="text-sm text-gray-600 flex-1">{asset.notes ?? <span className="text-gray-400">No notes.</span>}</p>
              <button onClick={() => setEditNotes(true)} className="text-xs text-[#2166AC] hover:underline cursor-pointer shrink-0">
                {asset.notes ? "Edit" : "Add"}
              </button>
            </div>
          )}
        </div>

        {/* Other info */}
        <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-100 text-xs text-gray-500">
          {asset.serialNumber && <div><span className="font-semibold text-gray-400">Serial:</span> {asset.serialNumber}</div>}
          {asset.location && <div><span className="font-semibold text-gray-400">Location:</span> {asset.location}</div>}
          <div><span className="font-semibold text-gray-400">Created:</span> {new Date(asset.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</div>
        </div>
      </div>

      {/* Work orders */}
      {workOrders.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-700">Work Orders ({workOrders.length})</h2>
          </div>
          <div className="divide-y divide-gray-100">
            {[...openWOs, ...closedWOs].map((wo) => (
              <Link
                key={wo.id}
                href={`/accounts/${wo.accountId}/work-orders/${wo.id}`}
                className="flex items-center justify-between px-6 py-3 hover:bg-gray-50 transition-colors"
              >
                <div>
                  <p className="text-sm font-medium text-gray-800">{wo.title}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {new Date(wo.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </p>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${WO_STATUS_CLS[wo.status] ?? "bg-gray-100 text-gray-600"}`}>
                  {WO_STATUS_LABELS[wo.status] ?? wo.status}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
