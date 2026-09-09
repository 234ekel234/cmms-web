"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import api from "@/lib/api";
import AssetImportModal from "@/components/AssetImportModal";
import LocationPicker from "@/components/LocationPicker";
import LocationManagerModal from "@/components/LocationManagerModal";
import {
  type AssetLocationNode,
  type AssetLocationRef,
  locationPath,
  locationScopeIds,
} from "@/lib/assetLocations";
import EmptyState from "@/components/EmptyState";
import { useAuth } from "@/context/AuthContext";
import { canManage } from "@/lib/rbac";

type AssetHealth = "FUNCTIONAL" | "FUNCTIONAL_WITH_FINDINGS" | "BREAKDOWN";

type Asset = {
  id: string;
  name: string;
  category: string;
  status: string;
  health: AssetHealth;
  assetCode: string | null;
  brand: string | null;
  model: string | null;
  location: AssetLocationRef | null;
  openWorkOrders: number;
  lastCompletedAt: string | null;
  archivedAt: string | null;
};

const HEALTH_CONFIG: Record<AssetHealth, { label: string; cls: string }> = {
  FUNCTIONAL:               { label: "Functional",               cls: "bg-[var(--tu-soft-success)] text-[var(--tu-on-success)]" },
  FUNCTIONAL_WITH_FINDINGS: { label: "Functional with Findings", cls: "bg-[var(--tu-soft-warning)] text-[var(--tu-on-warning)]" },
  BREAKDOWN:                { label: "Breakdown",                cls: "bg-[var(--tu-soft-danger)] text-[var(--tu-on-danger)]" },
};

// Ascending — the health sort puts the worst-off assets first.
const HEALTH_RANK: Record<AssetHealth, number> = { BREAKDOWN: 0, FUNCTIONAL_WITH_FINDINGS: 1, FUNCTIONAL: 2 };

// One shape, declared once, so the initial state and the post-save reset cannot
// drift apart as fields are added. Everything is a string because these are all
// text/date/number inputs; `addAsset` is what turns blanks into nulls.
const INPUT_CLS =
  "w-full border border-[var(--tu-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--tu-text-brand)]";

const BLANK_FORM = {
  name: "", category: "", assetCode: "", brand: "", model: "", status: "",
  serialNumber: "", manufacturedDate: "", purchaseDate: "",
  purchaseCost: "", warrantyExpiry: "",
  health: "FUNCTIONAL" as AssetHealth,
  // The one field that is an id rather than text: a location has to already
  // exist (or be created through the picker) before an asset can point at it.
  locationId: null as string | null,
};

export default function AssetsPage() {
  const params = useParams();
  const accountId = params.accountId as string;
  const { user } = useAuth();
  // A client sees the register for their own site — the API strips purchase
  // cost — but adding and importing equipment is ours.
  const writable = canManage(user?.role);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [sortKey, setSortKey] = useState<"name" | "condition">("name");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...BLANK_FORM });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [locations, setLocations] = useState<AssetLocationNode[]>([]);
  const [showLocations, setShowLocations] = useState(false);
  // "" is every location; otherwise the id of the node being filtered on.
  const [locationFilter, setLocationFilter] = useState("");

  // Kept as a callable rather than folded into the effect below: the picker and
  // the manager both have to refresh the tree after writing to it, and awaiting
  // the same function they triggered is what lets them select what they just
  // created.
  const loadLocations = useCallback(async () => {
    try {
      const res = await api.get(`/accounts/${accountId}/asset-locations`);
      setLocations(res.data);
    } catch {
      // A failed tree is not worth blocking the register over — the picker just
      // shows nothing to choose from, and the assets still list.
    }
  }, [accountId]);

  // Wrapped rather than called straight from the effect body: `loadLocations`
  // sets state, and calling it bare is the cascading-render pattern the React
  // lint rule refuses. The await also keeps it consistent with the fetches below.
  useEffect(() => {
    (async () => { await loadLocations(); })();
  }, [loadLocations]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Set explicitly, not left to the initial state: this effect also re-runs
      // on the "Show archived" toggle, where `loading` is already false and the
      // previous, wrong list would otherwise sit there with no affordance until
      // the request returned.
      if (!cancelled) { setError(false); setLoading(true); }
      try {
        const res = await api.get(`/accounts/${accountId}/assets`, {
          params: showArchived ? { includeArchived: "true" } : {},
        });
        if (!cancelled) setAssets(res.data);
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [accountId, showArchived]);

  async function addAsset() {
    if (!form.name.trim()) { setFormError("Name is required."); return; }
    if (!form.category.trim()) { setFormError("Category is required."); return; }
    if (form.purchaseCost.trim() && !Number.isFinite(Number(form.purchaseCost))) {
      setFormError("Purchase cost must be a number."); return;
    }
    setFormError("");
    setSaving(true);
    try {
      const res = await api.post(`/accounts/${accountId}/assets`, {
        name: form.name.trim(),
        category: form.category.trim(),
        assetCode: form.assetCode.trim(),
        brand: form.brand.trim(),
        model: form.model.trim(),
        // Left blank the API applies its own default rather than storing "".
        status: form.status.trim(),
        serialNumber: form.serialNumber.trim(),
        locationId: form.locationId,
        // Dates and cost go as null rather than "" when untouched: the API
        // stores what it is given, and an empty string is not a missing date.
        manufacturedDate: form.manufacturedDate || null,
        purchaseDate: form.purchaseDate || null,
        purchaseCost: form.purchaseCost.trim() ? Number(form.purchaseCost) : null,
        warrantyExpiry: form.warrantyExpiry || null,
        health: form.health,
      });
      setAssets((prev) => [...prev, res.data]);
      setShowForm(false);
      setForm({ ...BLANK_FORM });
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setFormError(e?.response?.data?.error ?? "Failed to add asset.");
    } finally {
      setSaving(false);
    }
  }

  // Filtering on a building includes everything on its floors. Matching the id
  // alone would return only the assets filed at the building itself and quietly
  // hide the rest — which is the failure the free-text column had, one level up.
  const visible = useMemo(() => {
    if (!locationFilter) return assets;
    const node =
      locations.find((r) => r.id === locationFilter) ??
      locations.flatMap((r) => r.children).find((c) => c.id === locationFilter);
    if (!node) return assets;
    const scope = new Set(locationScopeIds(node));
    return assets.filter((a) => a.location && scope.has(a.location.id));
  }, [assets, locations, locationFilter]);

  const sorted = [...visible].sort((a, b) => {
    if (!!a.archivedAt !== !!b.archivedAt) return a.archivedAt ? 1 : -1;
    return sortKey === "name"
      ? a.name.localeCompare(b.name)
      : HEALTH_RANK[a.health] - HEALTH_RANK[b.health] || a.name.localeCompare(b.name);
  });

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-bold text-[var(--tu-text-heading)]">Assets</h2>
        {writable && (
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
        )}
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
        <span className="text-xs text-[var(--tu-text-subtle)] ml-2">Location:</span>
        <select
          className="tu-select"
          value={locationFilter}
          onChange={(e) => setLocationFilter(e.target.value)}
        >
          <option value="">All locations</option>
          {locations.map((root) => (
            <optgroup key={root.id} label={root.name}>
              <option value={root.id}>All of {root.name}</option>
              {root.children.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </optgroup>
          ))}
        </select>
        {writable && (
          <button
            onClick={() => setShowLocations(true)}
            className="px-3 py-1.5 rounded-full text-xs font-semibold border bg-[var(--tu-bg-surface)] text-[var(--tu-text-body)] border-[var(--tu-border)] hover:border-[var(--tu-border-strong)] transition-colors cursor-pointer"
          >
            Manage locations
          </button>
        )}
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
                className={INPUT_CLS}
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Generator A"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--tu-text-subtle)] mb-1">Category *</label>
              <input
                className={INPUT_CLS}
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                placeholder="e.g. HVAC, Electrical"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--tu-text-subtle)] mb-1">Asset Code</label>
              <input
                className={INPUT_CLS}
                value={form.assetCode}
                onChange={(e) => setForm((f) => ({ ...f, assetCode: e.target.value }))}
                placeholder="e.g. MKT-HV-001"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--tu-text-subtle)] mb-1">Status</label>
              <input
                className={INPUT_CLS}
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                placeholder="Operational"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--tu-text-subtle)] mb-1">Brand</label>
              <input
                className={INPUT_CLS}
                value={form.brand}
                onChange={(e) => setForm((f) => ({ ...f, brand: e.target.value }))}
                placeholder="e.g. Carrier"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--tu-text-subtle)] mb-1">Model</label>
              <input
                className={INPUT_CLS}
                value={form.model}
                onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
                placeholder="e.g. 39CQ"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--tu-text-subtle)] mb-1">Serial No.</label>
              <input
                className={INPUT_CLS}
                value={form.serialNumber}
                onChange={(e) => setForm((f) => ({ ...f, serialNumber: e.target.value }))}
                placeholder="e.g. SN-4471902"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--tu-text-subtle)] mb-1">Manufactured</label>
              <input
                type="date"
                className={INPUT_CLS}
                value={form.manufacturedDate}
                onChange={(e) => setForm((f) => ({ ...f, manufacturedDate: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--tu-text-subtle)] mb-1">Purchase Date</label>
              <input
                type="date"
                className={INPUT_CLS}
                value={form.purchaseDate}
                onChange={(e) => setForm((f) => ({ ...f, purchaseDate: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--tu-text-subtle)] mb-1">Purchase Cost</label>
              <input
                type="number"
                min="0"
                step="0.01"
                className={INPUT_CLS}
                value={form.purchaseCost}
                onChange={(e) => setForm((f) => ({ ...f, purchaseCost: e.target.value }))}
                placeholder="e.g. 185000"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--tu-text-subtle)] mb-1">Warranty Expiry</label>
              <input
                type="date"
                className={INPUT_CLS}
                value={form.warrantyExpiry}
                onChange={(e) => setForm((f) => ({ ...f, warrantyExpiry: e.target.value }))}
              />
            </div>
            <div className="col-span-2">
              <LocationPicker
                accountId={accountId}
                tree={locations}
                value={form.locationId}
                onChange={(locationId) => setForm((f) => ({ ...f, locationId }))}
                onTreeChange={loadLocations}
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
                <th className="px-6 py-3 text-left">Location</th>
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
                    <td className="px-6 py-4 text-[var(--tu-text-subtle)] text-xs">
                      {locationPath(asset.location) || <span className="text-[var(--tu-text-disabled)]">—</span>}
                    </td>
                    <td className="px-6 py-4">
                      {!isArchived && (
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${hCfg.cls}`}>
                          {hCfg.label}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {!isArchived && (
                        <span className="rounded-full px-2 py-0.5 text-xs font-semibold bg-[var(--tu-bg-secondary)] text-[var(--tu-text-body)]">
                          {asset.status || "—"}
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

      {showLocations && (
        <LocationManagerModal
          accountId={accountId}
          tree={locations}
          onClose={() => setShowLocations(false)}
          onChanged={loadLocations}
        />
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
