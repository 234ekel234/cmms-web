"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import api from "@/lib/api";
import AssetImportModal from "@/components/AssetImportModal";
import EmptyState from "@/components/EmptyState";

type AssetHealth = "NEW" | "GOOD" | "FAIR" | "POOR" | "OUT_OF_SERVICE";

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
  NEW:            { label: "New",            cls: "bg-[var(--tu-soft-brand)] text-[var(--tu-on-brand)]" },
  GOOD:           { label: "Good",           cls: "bg-[var(--tu-soft-success)] text-[var(--tu-on-success)]" },
  FAIR:           { label: "Fair",           cls: "bg-[var(--tu-soft-warning)] text-[var(--tu-on-warning)]" },
  POOR:           { label: "Poor",           cls: "bg-[var(--tu-soft-accent)] text-[var(--tu-on-accent)]" },
  OUT_OF_SERVICE: { label: "Out of Service", cls: "bg-[var(--tu-soft-danger)] text-[var(--tu-on-danger)]" },
};

// Ascending — the health sort puts the worst-off assets first.
const HEALTH_RANK: Record<AssetHealth, number> = { OUT_OF_SERVICE: 0, POOR: 1, FAIR: 2, GOOD: 3, NEW: 4 };

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
  const [showImport, setShowImport] = useState(false);

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
        <h2 className="text-lg font-bold text-[var(--tu-text-heading)]">Assets</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowImport(true)}
            className="bg-[var(--tu-bg-surface)] text-[var(--tu-text-body)] border border-[var(--tu-border)] px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[var(--tu-bg-secondary)] transition-colors cursor-pointer"
          >
            Import CSV
          </button>
          <button
            onClick={() => setShowForm(true)}
            className="bg-[var(--tu-text-brand)] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[var(--tu-text-brand-strong)] transition-colors cursor-pointer"
          >
            + Add Asset
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <span className="text-xs text-[var(--tu-text-subtle)]">Sort:</span>
        {(["name", "condition"] as const).map((k) => (
          <button
            key={k}
            onClick={() => setSortKey(k)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors cursor-pointer ${
              sortKey === k ? "bg-[var(--tu-text-brand)] text-white border-[var(--tu-text-brand)]" : "bg-[var(--tu-bg-surface)] text-[var(--tu-text-body)] border-[var(--tu-border)] hover:border-[var(--tu-border-strong)]"
            }`}
          >
            {k === "name" ? "Name" : "Condition"}
          </button>
        ))}
        <button
          onClick={() => setShowArchived((v) => !v)}
          className={`ml-auto px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors cursor-pointer ${
            showArchived ? "bg-[var(--tu-soft-info)] text-[var(--tu-on-info)] border-[var(--tu-bd-info)]" : "bg-[var(--tu-bg-surface)] text-[var(--tu-text-body)] border-[var(--tu-border)] hover:border-[var(--tu-border-strong)]"
          }`}
        >
          {showArchived ? "Hide Archived" : "Show Archived"}
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-[var(--tu-bg-surface)] rounded-xl border border-[var(--tu-border)] shadow-sm p-6 mb-6">
          <h3 className="text-sm font-semibold text-[var(--tu-text-heading)] mb-4">New Asset</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[var(--tu-text-subtle)] mb-1">Name *</label>
              <input
                className="w-full border border-[var(--tu-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--tu-text-brand)]"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Generator A"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--tu-text-subtle)] mb-1">Category *</label>
              <input
                className="w-full border border-[var(--tu-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--tu-text-brand)]"
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                placeholder="e.g. HVAC, Electrical"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-[var(--tu-text-subtle)] mb-1">Initial Health</label>
              <div className="flex gap-2 flex-wrap">
                {(Object.keys(HEALTH_CONFIG) as AssetHealth[]).map((h) => (
                  <button
                    key={h}
                    onClick={() => setForm((f) => ({ ...f, health: h }))}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                      form.health === h ? HEALTH_CONFIG[h].cls + " border-current" : "bg-[var(--tu-bg-surface)] text-[var(--tu-text-body)] border-[var(--tu-border)] hover:border-[var(--tu-border-strong)]"
                    }`}
                  >
                    {HEALTH_CONFIG[h].label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          {formError && <p className="text-[var(--tu-on-danger)] text-xs mt-3">{formError}</p>}
          <div className="flex gap-3 justify-end mt-4">
            <button onClick={() => { setShowForm(false); setFormError(""); }} className="px-4 py-2 text-sm text-[var(--tu-text-body)] border border-[var(--tu-border)] rounded-lg hover:bg-[var(--tu-bg-secondary)] cursor-pointer">Cancel</button>
            <button onClick={addAsset} disabled={saving} className="px-4 py-2 text-sm text-white bg-[var(--tu-text-brand)] rounded-lg hover:bg-[var(--tu-text-brand-strong)] disabled:opacity-50 cursor-pointer">
              {saving ? "Saving..." : "Add Asset"}
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-[var(--tu-soft-danger)] border border-[var(--tu-bd-danger)] text-[var(--tu-on-danger)] text-sm rounded-lg px-4 py-3 mb-6">
          Failed to load assets.
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-16 bg-[var(--tu-bg-surface)] rounded-xl border border-[var(--tu-border)] animate-pulse" />)}
        </div>
      ) : sorted.length === 0 ? (
        <div className="tu-card">
          <EmptyState
            icon="asset"
            title="No assets yet"
            hint="Register the equipment at this site to track its health and maintenance history."
          />
        </div>
      ) : (
        <div className="bg-[var(--tu-bg-surface)] rounded-xl border border-[var(--tu-border)] shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[var(--tu-bg-secondary)] text-xs text-[var(--tu-text-subtle)] font-semibold uppercase tracking-wide">
                <th className="px-6 py-3 text-left">Name</th>
                <th className="px-6 py-3 text-left">Category</th>
                <th className="px-6 py-3 text-left">Health</th>
                <th className="px-6 py-3 text-left">Status</th>
                <th className="px-6 py-3 text-center">Open WOs</th>
                <th className="px-6 py-3 text-left">Last Service</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--tu-border)]">
              {sorted.map((asset) => {
                const hCfg = HEALTH_CONFIG[asset.health];
                const isArchived = !!asset.archivedAt;
                const daysSince = asset.lastCompletedAt
                  ? Math.floor((Date.now() - new Date(asset.lastCompletedAt).getTime()) / 86_400_000)
                  : null;
                return (
                  <tr key={asset.id} className={`hover:bg-[var(--tu-bg-secondary)] transition-colors ${isArchived ? "opacity-60" : ""}`}>
                    <td className="px-6 py-4">
                      <Link
                        href={`/accounts/${accountId}/assets/${asset.id}`}
                        className="font-semibold text-[var(--tu-text-heading)] hover:text-[var(--tu-text-brand)] transition-colors"
                      >
                        {asset.name}
                      </Link>
                      {isArchived && <span className="ml-2 text-xs bg-[var(--tu-bg-secondary-strong)] text-[var(--tu-text-subtle)] rounded-full px-2 py-0.5">Archived</span>}
                    </td>
                    <td className="px-6 py-4 text-[var(--tu-text-subtle)]">{asset.category}</td>
                    <td className="px-6 py-4">
                      {!isArchived && (
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${hCfg.cls}`}>
                          {hCfg.label}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {!isArchived && (
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${asset.status === "OPERATIONAL" ? "bg-[var(--tu-soft-success)] text-[var(--tu-on-success)]" : "bg-[var(--tu-soft-warning)] text-[var(--tu-on-warning)]"}`}>
                          {asset.status === "OPERATIONAL" ? "Operational" : "Under Maintenance"}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      {asset.openWorkOrders > 0
                        ? <span className="tu-figure">{asset.openWorkOrders}</span>
                        : <span className="tu-figure-zero">—</span>}
                    </td>
                    <td className="px-6 py-4 text-[var(--tu-text-subtle)] text-xs">
                      {daysSince === null ? "—" : daysSince === 0 ? "Today" : `${daysSince}d ago`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showImport && (
        <AssetImportModal
          accountId={accountId}
          onClose={() => setShowImport(false)}
          onImported={(created) => {
            setAssets((prev) => [
              ...prev,
              ...created.map((a) => ({ ...a, openWorkOrders: 0, lastCompletedAt: null, archivedAt: null })),
            ]);
          }}
        />
      )}
    </div>
  );
}
