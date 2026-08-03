"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import api from "@/lib/api";
import { fmtQty, fmtCost, type Part } from "@/lib/parts";
import EmptyState from "@/components/EmptyState";

export default function PartsPage() {
  const params = useParams();
  const accountId = params.accountId as string;

  const [parts, setParts] = useState<Part[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState("");
  const [lowOnly, setLowOnly] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const emptyForm = { name: "", partNumber: "", unit: "pc", location: "", unitCost: "", minQuantity: "", openingQuantity: "" };
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const fetchParts = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await api.get(`/accounts/${accountId}/parts`, {
        params: {
          ...(search.trim() ? { search: search.trim() } : {}),
          ...(lowOnly ? { lowStock: "true" } : {}),
          ...(showArchived ? { includeArchived: "true" } : {}),
        },
      });
      setParts(res.data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [accountId, search, lowOnly, showArchived]);

  // Debounced so typing in the search box doesn't fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(fetchParts, search ? 250 : 0);
    return () => clearTimeout(t);
  }, [fetchParts, search]);

  async function addPart() {
    if (!form.name.trim()) { setFormError("Name is required."); return; }
    setFormError("");
    setSaving(true);
    try {
      await api.post(`/accounts/${accountId}/parts`, {
        name: form.name.trim(),
        partNumber: form.partNumber.trim() || null,
        unit: form.unit.trim() || null,
        location: form.location.trim() || null,
        unitCost: form.unitCost === "" ? null : form.unitCost,
        minQuantity: form.minQuantity === "" ? null : form.minQuantity,
        openingQuantity: form.openingQuantity === "" ? 0 : form.openingQuantity,
      });
      setShowForm(false);
      setForm(emptyForm);
      fetchParts();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setFormError(e?.response?.data?.error ?? "Failed to add part.");
    } finally {
      setSaving(false);
    }
  }

  const lowCount = parts.filter((p) => p.isLowStock && !p.archivedAt).length;

  const inputCls = "w-full border border-[var(--tu-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--tu-text-brand)]";
  const labelCls = "block text-xs font-semibold text-[var(--tu-text-subtle)] mb-1";

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold text-[var(--tu-text-heading)]">Spare Parts</h2>
          {lowCount > 0 && !lowOnly && (
            <button
              onClick={() => setLowOnly(true)}
              className="text-xs text-[var(--tu-on-danger)] hover:underline cursor-pointer mt-0.5"
            >
              {lowCount} {lowCount === 1 ? "part is" : "parts are"} at or below minimum
            </button>
          )}
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="bg-[var(--tu-text-brand)] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[var(--tu-text-brand-strong)] transition-colors cursor-pointer"
        >
          + Add Part
        </button>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, part number, category…"
          className="border border-[var(--tu-border)] rounded-lg px-3 py-1.5 text-sm w-72 focus:outline-none focus:ring-2 focus:ring-[var(--tu-text-brand)]"
        />
        <button
          onClick={() => setLowOnly((v) => !v)}
          className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors cursor-pointer ${
            lowOnly ? "bg-[var(--tu-soft-danger)] text-[var(--tu-on-danger)] border-[var(--tu-bd-danger)]" : "bg-[var(--tu-bg-surface)] text-[var(--tu-text-body)] border-[var(--tu-border)] hover:border-[var(--tu-border-strong)]"
          }`}
        >
          Low Stock Only
        </button>
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
          <h3 className="text-sm font-semibold text-[var(--tu-text-heading)] mb-4">New Part</h3>
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2">
              <label className={labelCls}>Name *</label>
              <input
                className={inputCls}
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. V-belt A42"
                autoFocus
              />
            </div>
            <div>
              <label className={labelCls}>Part Number</label>
              <input className={inputCls} value={form.partNumber} onChange={(e) => setForm((f) => ({ ...f, partNumber: e.target.value }))} placeholder="e.g. BLT-A42" />
            </div>
            <div>
              <label className={labelCls}>Unit</label>
              <input className={inputCls} value={form.unit} onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))} placeholder="pc, L, box" />
            </div>
            <div className="col-span-2">
              <label className={labelCls}>Storage Location</label>
              <input className={inputCls} value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} placeholder="e.g. Storeroom B, shelf 3" />
            </div>
            <div>
              <label className={labelCls}>Unit Cost</label>
              <input className={inputCls} type="number" min="0" value={form.unitCost} onChange={(e) => setForm((f) => ({ ...f, unitCost: e.target.value }))} placeholder="0.00" />
            </div>
            <div>
              <label className={labelCls}>Opening Stock</label>
              <input className={inputCls} type="number" min="0" value={form.openingQuantity} onChange={(e) => setForm((f) => ({ ...f, openingQuantity: e.target.value }))} placeholder="0" />
            </div>
            <div>
              <label className={labelCls}>Minimum (reorder point)</label>
              <input className={inputCls} type="number" min="0" value={form.minQuantity} onChange={(e) => setForm((f) => ({ ...f, minQuantity: e.target.value }))} placeholder="Leave blank for no alert" />
            </div>
          </div>
          <p className="text-xs text-[var(--tu-text-subtle)] mt-3">
            Opening stock is recorded as a receipt in the part&apos;s stock history, so every count has a reason behind it.
          </p>
          {formError && <p className="text-[var(--tu-on-danger)] text-xs mt-3">{formError}</p>}
          <div className="flex gap-3 justify-end mt-4">
            <button onClick={() => { setShowForm(false); setFormError(""); }} className="px-4 py-2 text-sm text-[var(--tu-text-body)] border border-[var(--tu-border)] rounded-lg hover:bg-[var(--tu-bg-secondary)] cursor-pointer">Cancel</button>
            <button onClick={addPart} disabled={saving} className="px-4 py-2 text-sm text-white bg-[var(--tu-text-brand)] rounded-lg hover:bg-[var(--tu-text-brand-strong)] disabled:opacity-50 cursor-pointer">
              {saving ? "Saving..." : "Add Part"}
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-[var(--tu-soft-danger)] border border-[var(--tu-bd-danger)] text-[var(--tu-on-danger)] text-sm rounded-lg px-4 py-3 mb-6">
          Failed to load parts.
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-16 bg-[var(--tu-bg-surface)] rounded-xl border border-[var(--tu-border)] animate-pulse" />)}
        </div>
      ) : parts.length === 0 ? (
        <div className="tu-card">
          {search || lowOnly ? (
            <EmptyState
              icon="search"
              title="No matching parts"
              hint="Nothing matches the current search and filters."
            />
          ) : (
            <EmptyState
              icon="part"
              title="No spare parts yet"
              hint="Stock the parts kept on site so technicians can draw against them on a work order."
            />
          )}
        </div>
      ) : (
        <div className="bg-[var(--tu-bg-surface)] rounded-xl border border-[var(--tu-border)] shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[var(--tu-bg-secondary)] text-xs text-[var(--tu-text-subtle)] font-semibold uppercase tracking-wide">
                <th className="px-6 py-3 text-left">Part</th>
                <th className="px-6 py-3 text-left">Part No.</th>
                <th className="px-6 py-3 text-right">On Hand</th>
                <th className="px-6 py-3 text-right">Minimum</th>
                <th className="px-6 py-3 text-right">Unit Cost</th>
                <th className="px-6 py-3 text-left">Location</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--tu-border)]">
              {parts.map((part) => {
                const isArchived = !!part.archivedAt;
                return (
                  <tr key={part.id} className={`hover:bg-[var(--tu-bg-secondary)] transition-colors ${isArchived ? "opacity-60" : ""}`}>
                    <td className="px-6 py-4">
                      <Link
                        href={`/accounts/${accountId}/parts/${part.id}`}
                        className="font-semibold text-[var(--tu-text-heading)] hover:text-[var(--tu-text-brand)] transition-colors"
                      >
                        {part.name}
                      </Link>
                      {isArchived && <span className="ml-2 text-xs bg-[var(--tu-bg-secondary-strong)] text-[var(--tu-text-subtle)] rounded-full px-2 py-0.5">Archived</span>}
                    </td>
                    <td className="px-6 py-4 text-[var(--tu-text-subtle)]">{part.partNumber ?? "—"}</td>
                    <td className="px-6 py-4 text-right">
                      <StockBadge part={part} />
                    </td>
                    <td className="px-6 py-4 text-right text-[var(--tu-text-subtle)]">
                      {part.minQuantity == null ? "—" : fmtQty(part.minQuantity)}
                    </td>
                    <td className="px-6 py-4 text-right text-[var(--tu-text-subtle)]">
                      {part.unitCost == null ? "—" : fmtCost(part.unitCost)}
                    </td>
                    <td className="px-6 py-4 text-[var(--tu-text-subtle)] text-xs">{part.location ?? "—"}</td>
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

// On-hand count, flagged when it has hit the reorder point. A negative balance
// gets its own treatment: it means more was logged as used than the count knew
// about, so the count needs correcting rather than the part reordering.
function StockBadge({ part }: { part: Part }) {
  const negative = part.quantityOnHand < 0;
  const cls = negative
    ? "bg-[var(--tu-soft-danger)] text-[var(--tu-on-danger)]"
    : part.isLowStock
      ? "bg-[var(--tu-soft-danger)] text-[var(--tu-on-danger)]"
      : "bg-[var(--tu-soft-success)] text-[var(--tu-on-success)]";
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`} title={negative ? "More issued than the count knew about — needs a stock correction" : undefined}>
      {fmtQty(part.quantityOnHand)}{part.unit ? ` ${part.unit}` : ""}
    </span>
  );
}
