"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import api from "@/lib/api";

type AssetHealth = "GOOD" | "FAIR" | "POOR" | "OUT_OF_SERVICE";

type Asset = {
  id: string;
  name: string;
  category: string;
  status: "OPERATIONAL" | "UNDER_MAINTENANCE";
  health: AssetHealth;
  openWorkOrders: number;
  lastCompletedAt: string | null;
  archivedAt: string | null;
};

const HEALTH_CONFIG: Record<AssetHealth, { label: string; cls: string }> = {
  GOOD:           { label: "Good",           cls: "bg-green-50 text-green-700" },
  FAIR:           { label: "Fair",           cls: "bg-amber-50 text-amber-700" },
  POOR:           { label: "Poor",           cls: "bg-orange-50 text-orange-700" },
  OUT_OF_SERVICE: { label: "Out of Service", cls: "bg-red-50 text-red-700" },
};

const HEALTH_RANK: Record<AssetHealth, number> = { OUT_OF_SERVICE: 0, POOR: 1, FAIR: 2, GOOD: 3 };

export default function AssetsPage() {
  const params = useParams();
  const accountId = params.accountId as string;
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [sortKey, setSortKey] = useState<"name" | "condition">("name");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", category: "", health: "GOOD" as AssetHealth });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  useEffect(() => { fetchAssets(); }, [accountId, showArchived]);

  async function fetchAssets() {
    setLoading(true);
    setError(false);
    try {
      const res = await api.get(`/accounts/${accountId}/assets`, {
        params: showArchived ? { includeArchived: "true" } : {},
      });
      setAssets(res.data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  async function addAsset() {
    if (!form.name.trim()) { setFormError("Name is required."); return; }
    if (!form.category.trim()) { setFormError("Category is required."); return; }
    setFormError("");
    setSaving(true);
    try {
      const res = await api.post(`/accounts/${accountId}/assets`, {
        name: form.name.trim(),
        category: form.category.trim(),
        health: form.health,
        status: "OPERATIONAL",
      });
      setAssets((prev) => [...prev, res.data]);
      setShowForm(false);
      setForm({ name: "", category: "", health: "GOOD" });
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setFormError(e?.response?.data?.error ?? "Failed to add asset.");
    } finally {
      setSaving(false);
    }
  }

  const sorted = [...assets].sort((a, b) => {
    if (!!a.archivedAt !== !!b.archivedAt) return a.archivedAt ? 1 : -1;
    return sortKey === "name"
      ? a.name.localeCompare(b.name)
      : HEALTH_RANK[a.health] - HEALTH_RANK[b.health] || a.name.localeCompare(b.name);
  });

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-bold text-gray-900">Assets</h2>
        <button
          onClick={() => setShowForm(true)}
          className="bg-[#2166AC] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#1a5490] transition-colors cursor-pointer"
        >
          + Add Asset
        </button>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <span className="text-xs text-gray-500">Sort:</span>
        {(["name", "condition"] as const).map((k) => (
          <button
            key={k}
            onClick={() => setSortKey(k)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors cursor-pointer ${
              sortKey === k ? "bg-[#2166AC] text-white border-[#2166AC]" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
            }`}
          >
            {k === "name" ? "Name" : "Condition"}
          </button>
        ))}
        <button
          onClick={() => setShowArchived((v) => !v)}
          className={`ml-auto px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors cursor-pointer ${
            showArchived ? "bg-purple-50 text-purple-700 border-purple-200" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
          }`}
        >
          {showArchived ? "Hide Archived" : "Show Archived"}
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 mb-6">
          <h3 className="text-sm font-semibold text-gray-800 mb-4">New Asset</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Name *</label>
              <input
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2166AC]"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Generator A"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Category *</label>
              <input
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2166AC]"
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                placeholder="e.g. HVAC, Electrical"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-gray-500 mb-1">Initial Health</label>
              <div className="flex gap-2 flex-wrap">
                {(Object.keys(HEALTH_CONFIG) as AssetHealth[]).map((h) => (
                  <button
                    key={h}
                    onClick={() => setForm((f) => ({ ...f, health: h }))}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                      form.health === h ? HEALTH_CONFIG[h].cls + " border-current" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
                    }`}
                  >
                    {HEALTH_CONFIG[h].label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          {formError && <p className="text-red-500 text-xs mt-3">{formError}</p>}
          <div className="flex gap-3 justify-end mt-4">
            <button onClick={() => { setShowForm(false); setFormError(""); }} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">Cancel</button>
            <button onClick={addAsset} disabled={saving} className="px-4 py-2 text-sm text-white bg-[#2166AC] rounded-lg hover:bg-[#1a5490] disabled:opacity-50 cursor-pointer">
              {saving ? "Saving..." : "Add Asset"}
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mb-6">
          Failed to load assets.
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-16 bg-white rounded-xl border border-gray-100 animate-pulse" />)}
        </div>
      ) : sorted.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-12 text-center text-gray-400 text-sm">
          No assets yet. Click &quot;+ Add Asset&quot; to register the first one.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-xs text-gray-400 font-semibold uppercase tracking-wide">
                <th className="px-6 py-3 text-left">Name</th>
                <th className="px-6 py-3 text-left">Category</th>
                <th className="px-6 py-3 text-left">Health</th>
                <th className="px-6 py-3 text-left">Status</th>
                <th className="px-6 py-3 text-center">Open WOs</th>
                <th className="px-6 py-3 text-left">Last Service</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sorted.map((asset) => {
                const hCfg = HEALTH_CONFIG[asset.health];
                const isArchived = !!asset.archivedAt;
                const daysSince = asset.lastCompletedAt
                  ? Math.floor((Date.now() - new Date(asset.lastCompletedAt).getTime()) / 86_400_000)
                  : null;
                return (
                  <tr key={asset.id} className={`hover:bg-gray-50 transition-colors ${isArchived ? "opacity-60" : ""}`}>
                    <td className="px-6 py-4">
                      <Link
                        href={`/accounts/${accountId}/assets/${asset.id}`}
                        className="font-semibold text-gray-800 hover:text-[#2166AC] transition-colors"
                      >
                        {asset.name}
                      </Link>
                      {isArchived && <span className="ml-2 text-xs bg-gray-100 text-gray-500 rounded-full px-2 py-0.5">Archived</span>}
                    </td>
                    <td className="px-6 py-4 text-gray-500">{asset.category}</td>
                    <td className="px-6 py-4">
                      {!isArchived && (
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${hCfg.cls}`}>
                          {hCfg.label}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {!isArchived && (
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${asset.status === "OPERATIONAL" ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"}`}>
                          {asset.status === "OPERATIONAL" ? "Operational" : "Under Maintenance"}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      {asset.openWorkOrders > 0 ? (
                        <span className="text-xs font-semibold text-red-600 bg-red-50 rounded-full px-2 py-0.5">
                          {asset.openWorkOrders}
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-gray-400 text-xs">
                      {daysSince === null ? "—" : daysSince === 0 ? "Today" : `${daysSince}d ago`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
