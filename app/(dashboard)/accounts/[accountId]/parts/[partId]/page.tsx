"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import api from "@/lib/api";
import Breadcrumbs from "@/components/Breadcrumbs";
import EmptyState from "@/components/EmptyState";
import {
  MOVEMENT_CONFIG,
  fmtCost,
  fmtDateTime,
  fmtQty,
  type Part,
  type PartTransaction,
  type PartTransactionType,
} from "@/lib/parts";

type PartDetail = Part & {
  assets: { id: string; asset: { id: string; name: string; category: string } }[];
};

type AssetLite = { id: string; name: string; category: string };

const inputCls = "w-full border border-[var(--tu-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--tu-text-brand)]";
const labelCls = "block text-xs font-semibold text-[var(--tu-text-subtle)] mb-1";

export default function PartDetailPage() {
  const params = useParams();
  const accountId = params.accountId as string;
  const partId = params.partId as string;

  const [part, setPart] = useState<PartDetail | null>(null);
  const [ledger, setLedger] = useState<PartTransaction[]>([]);
  const [assets, setAssets] = useState<AssetLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);

  // Stock movement form
  const [moveType, setMoveType] = useState<PartTransactionType | null>(null);
  const [moveQty, setMoveQty] = useState("");
  const [moveCost, setMoveCost] = useState("");
  const [moveReason, setMoveReason] = useState("");
  const [moveError, setMoveError] = useState("");

  // Details editor
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: "", partNumber: "", unit: "", category: "", location: "", unitCost: "", minQuantity: "", supplier: "" });
  const [editError, setEditError] = useState("");

  // Asset links
  const [editingAssets, setEditingAssets] = useState(false);
  const [selectedAssets, setSelectedAssets] = useState<Set<string>>(new Set());

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const [partRes, ledgerRes, assetsRes] = await Promise.all([
        api.get(`/parts/${partId}`),
        api.get(`/parts/${partId}/transactions`),
        api.get(`/accounts/${accountId}/assets`),
      ]);
      setPart(partRes.data);
      setLedger(ledgerRes.data);
      setAssets(assetsRes.data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [accountId, partId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  function openMovement(type: PartTransactionType) {
    setMoveType(type);
    setMoveQty("");
    setMoveCost("");
    setMoveReason("");
    setMoveError("");
  }

  async function submitMovement() {
    if (!moveType || !part) return;
    const qty = Number(moveQty);
    if (!Number.isFinite(qty) || qty === 0) { setMoveError("Enter a quantity."); return; }
    if (moveType === "ADJUSTMENT" && !moveReason.trim()) {
      setMoveError("A reason is required so the correction can be explained later.");
      return;
    }
    setSaving(true);
    setMoveError("");
    try {
      await api.post(`/parts/${partId}/transactions`, {
        type: moveType,
        quantity: qty,
        unitCost: moveCost === "" ? null : moveCost,
        reason: moveReason.trim() || null,
      });
      setMoveType(null);
      fetchAll();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setMoveError(e?.response?.data?.error ?? "Failed to record the movement.");
    } finally {
      setSaving(false);
    }
  }

  function openEditor() {
    if (!part) return;
    setForm({
      name: part.name,
      partNumber: part.partNumber ?? "",
      unit: part.unit ?? "",
      category: part.category ?? "",
      location: part.location ?? "",
      supplier: part.supplier ?? "",
      unitCost: part.unitCost != null ? String(part.unitCost) : "",
      minQuantity: part.minQuantity != null ? String(part.minQuantity) : "",
    });
    setEditError("");
    setEditing(true);
  }

  async function saveDetails() {
    if (!form.name.trim()) { setEditError("Name is required."); return; }
    setSaving(true);
    try {
      await api.patch(`/parts/${partId}`, {
        name: form.name.trim(),
        partNumber: form.partNumber.trim() || null,
        unit: form.unit.trim() || null,
        category: form.category.trim() || null,
        location: form.location.trim() || null,
        supplier: form.supplier.trim() || null,
        unitCost: form.unitCost === "" ? null : form.unitCost,
        minQuantity: form.minQuantity === "" ? null : form.minQuantity,
      });
      setEditing(false);
      fetchAll();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setEditError(e?.response?.data?.error ?? "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleArchive() {
    if (!part) return;
    setSaving(true);
    try {
      if (part.archivedAt) await api.patch(`/parts/${partId}`, { archived: false });
      else await api.delete(`/parts/${partId}`);
      fetchAll();
    } finally {
      setSaving(false);
    }
  }

  function openAssetEditor() {
    if (!part) return;
    setSelectedAssets(new Set(part.assets.map((a) => a.asset.id)));
    setEditingAssets(true);
  }

  async function saveAssets() {
    setSaving(true);
    try {
      await api.put(`/parts/${partId}/assets`, { assetIds: [...selectedAssets] });
      setEditingAssets(false);
      fetchAll();
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="p-8 max-w-3xl mx-auto">
        <div className="h-8 w-48 bg-[var(--tu-bg-secondary-strong)] rounded animate-pulse mb-6" />
        <div className="h-64 bg-[var(--tu-bg-surface)] rounded-xl border border-[var(--tu-border)] animate-pulse" />
      </div>
    );
  }

  if (error || !part) {
    return (
      <div className="p-8">
        <div className="bg-[var(--tu-soft-danger)] border border-[var(--tu-bd-danger)] text-[var(--tu-on-danger)] text-sm rounded-lg px-4 py-3">
          Failed to load part.{" "}
          <button onClick={fetchAll} className="underline cursor-pointer">Try again</button>
        </div>
      </div>
    );
  }

  const unit = part.unit ? ` ${part.unit}` : "";
  const negative = part.quantityOnHand < 0;

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <Breadcrumbs
        items={[
          { label: "Spare Parts", href: `/accounts/${accountId}/parts` },
          { label: part.name },
        ]}
      />

      {/* Main card */}
      <div className="bg-[var(--tu-bg-surface)] rounded-xl border border-[var(--tu-border)] shadow-sm p-6 mb-6">
        <div className="flex items-start justify-between gap-4 mb-5">
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-[var(--tu-text-heading)]">{part.name}</h1>
            <p className="text-sm text-[var(--tu-text-subtle)] mt-0.5">
              {[part.partNumber, part.category].filter(Boolean).join(" · ") || "No part number"}
            </p>
            {part.archivedAt && (
              <span className="inline-block mt-1 text-xs bg-[var(--tu-bg-secondary-strong)] text-[var(--tu-text-subtle)] rounded-full px-2 py-0.5">Archived</span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={openEditor} className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-[var(--tu-border)] text-[var(--tu-text-body)] hover:bg-[var(--tu-bg-secondary)] cursor-pointer">
              Edit
            </button>
            <button
              onClick={toggleArchive}
              disabled={saving}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer transition-colors ${
                part.archivedAt ? "border-[var(--tu-bd-success)] text-[var(--tu-on-success)] hover:bg-[var(--tu-soft-success)]" : "border-[var(--tu-border)] text-[var(--tu-text-subtle)] hover:bg-[var(--tu-bg-secondary)]"
              }`}
            >
              {part.archivedAt ? "Restore" : "Archive"}
            </button>
          </div>
        </div>

        {/* Stock summary */}
        <div className="flex items-end gap-6 flex-wrap border-t border-[var(--tu-border)] pt-5">
          <div>
            <p className="text-xs font-semibold text-[var(--tu-text-subtle)] uppercase tracking-wide mb-1">On Hand</p>
            <p className={`text-3xl font-bold ${negative ? "text-[var(--tu-on-danger)]" : part.isLowStock ? "text-[var(--tu-on-danger)]" : "text-[var(--tu-text-heading)]"}`}>
              {fmtQty(part.quantityOnHand)}<span className="text-base font-semibold text-[var(--tu-text-subtle)]">{unit}</span>
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold text-[var(--tu-text-subtle)] uppercase tracking-wide mb-1">Minimum</p>
            <p className="text-sm text-[var(--tu-text-body)] pb-2">{part.minQuantity == null ? "Not set" : `${fmtQty(part.minQuantity)}${unit}`}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-[var(--tu-text-subtle)] uppercase tracking-wide mb-1">Unit Cost</p>
            <p className="text-sm text-[var(--tu-text-body)] pb-2">{part.unitCost == null ? "—" : fmtCost(part.unitCost)}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-[var(--tu-text-subtle)] uppercase tracking-wide mb-1">Location</p>
            <p className="text-sm text-[var(--tu-text-body)] pb-2">{part.location ?? "—"}</p>
          </div>
        </div>

        {negative && (
          <div className="mt-4 bg-[var(--tu-soft-danger)] border border-[var(--tu-bd-danger)] text-[var(--tu-on-danger)] text-xs rounded-lg px-4 py-3">
            The count is negative — more has been logged as used than the system knew was in stock.
            Record an <strong>Adjustment</strong> to bring it back in line with what is physically there.
          </div>
        )}
        {!negative && part.isLowStock && (
          <div className="mt-4 bg-[var(--tu-soft-warning)] border border-[var(--tu-bd-warning)] text-[var(--tu-on-warning)] text-xs rounded-lg px-4 py-3">
            At or below the minimum of {fmtQty(part.minQuantity as number)}{unit}. Time to reorder.
          </div>
        )}

        {/* Stock actions */}
        {!part.archivedAt && (
          <div className="flex gap-2 mt-5 flex-wrap">
            {(["RECEIPT", "ISSUE", "ADJUSTMENT"] as const).map((t) => (
              <button
                key={t}
                onClick={() => openMovement(t)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer transition-colors ${
                  moveType === t ? "bg-[var(--tu-text-brand)] text-white border-[var(--tu-text-brand)]" : "bg-[var(--tu-bg-surface)] text-[var(--tu-text-body)] border-[var(--tu-border)] hover:border-[var(--tu-border-strong)]"
                }`}
              >
                {t === "RECEIPT" ? "Receive Stock" : t === "ISSUE" ? "Issue Stock" : "Adjust Count"}
              </button>
            ))}
          </div>
        )}

        {moveType && (
          <div className="mt-4 border border-[var(--tu-border)] rounded-lg p-4">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className={labelCls}>
                  Quantity {moveType === "ADJUSTMENT" ? "(+ / −)" : ""} *
                </label>
                <input className={inputCls} type="number" value={moveQty} onChange={(e) => setMoveQty(e.target.value)} placeholder={moveType === "ADJUSTMENT" ? "e.g. -2" : "0"} autoFocus />
              </div>
              {moveType === "RECEIPT" && (
                <div>
                  <label className={labelCls}>Unit Cost</label>
                  <input className={inputCls} type="number" min="0" value={moveCost} onChange={(e) => setMoveCost(e.target.value)} placeholder={part.unitCost != null ? String(part.unitCost) : "0.00"} />
                </div>
              )}
              <div className={moveType === "RECEIPT" ? "col-span-1" : "col-span-2"}>
                <label className={labelCls}>Reason {moveType === "ADJUSTMENT" ? "*" : ""}</label>
                <input className={inputCls} value={moveReason} onChange={(e) => setMoveReason(e.target.value)} placeholder={moveType === "ADJUSTMENT" ? "e.g. Physical stock count" : "Optional note"} />
              </div>
            </div>
            {moveType === "ADJUSTMENT" && (
              <p className="text-xs text-[var(--tu-text-subtle)] mt-2">
                Use a negative number to write stock off, positive to add it. The reason is kept in the history.
              </p>
            )}
            {moveType === "RECEIPT" && (
              <p className="text-xs text-[var(--tu-text-subtle)] mt-2">
                A unit cost entered here becomes the part&apos;s current cost for future job costing.
              </p>
            )}
            {moveError && <p className="text-[var(--tu-on-danger)] text-xs mt-3">{moveError}</p>}
            <div className="flex gap-3 justify-end mt-4">
              <button onClick={() => setMoveType(null)} className="px-4 py-2 text-sm text-[var(--tu-text-body)] border border-[var(--tu-border)] rounded-lg hover:bg-[var(--tu-bg-secondary)] cursor-pointer">Cancel</button>
              <button onClick={submitMovement} disabled={saving} className="px-4 py-2 text-sm text-white bg-[var(--tu-text-brand)] rounded-lg hover:bg-[var(--tu-text-brand-strong)] disabled:opacity-50 cursor-pointer">
                {saving ? "Saving..." : "Record"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Edit details */}
      {editing && (
        <div className="bg-[var(--tu-bg-surface)] rounded-xl border border-[var(--tu-border)] shadow-sm p-6 mb-6">
          <h3 className="text-sm font-semibold text-[var(--tu-text-heading)] mb-4">Edit Part</h3>
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2">
              <label className={labelCls}>Name *</label>
              <input className={inputCls} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <label className={labelCls}>Part Number</label>
              <input className={inputCls} value={form.partNumber} onChange={(e) => setForm((f) => ({ ...f, partNumber: e.target.value }))} />
            </div>
            <div>
              <label className={labelCls}>Category</label>
              <input className={inputCls} value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} />
            </div>
            <div>
              <label className={labelCls}>Unit</label>
              <input className={inputCls} value={form.unit} onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))} />
            </div>
            <div>
              <label className={labelCls}>Supplier</label>
              <input className={inputCls} value={form.supplier} onChange={(e) => setForm((f) => ({ ...f, supplier: e.target.value }))} />
            </div>
            <div className="col-span-2">
              <label className={labelCls}>Storage Location</label>
              <input className={inputCls} value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} />
            </div>
            <div>
              <label className={labelCls}>Unit Cost</label>
              <input className={inputCls} type="number" min="0" value={form.unitCost} onChange={(e) => setForm((f) => ({ ...f, unitCost: e.target.value }))} />
            </div>
            <div>
              <label className={labelCls}>Minimum</label>
              <input className={inputCls} type="number" min="0" value={form.minQuantity} onChange={(e) => setForm((f) => ({ ...f, minQuantity: e.target.value }))} placeholder="Blank = no alert" />
            </div>
          </div>
          <p className="text-xs text-[var(--tu-text-subtle)] mt-3">
            The on-hand count isn&apos;t editable here — it only changes through a recorded stock movement, so the history always explains it.
          </p>
          {editError && <p className="text-[var(--tu-on-danger)] text-xs mt-3">{editError}</p>}
          <div className="flex gap-3 justify-end mt-4">
            <button onClick={() => setEditing(false)} className="px-4 py-2 text-sm text-[var(--tu-text-body)] border border-[var(--tu-border)] rounded-lg hover:bg-[var(--tu-bg-secondary)] cursor-pointer">Cancel</button>
            <button onClick={saveDetails} disabled={saving} className="px-4 py-2 text-sm text-white bg-[var(--tu-text-brand)] rounded-lg hover:bg-[var(--tu-text-brand-strong)] disabled:opacity-50 cursor-pointer">
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      )}

      {/* Fits these assets */}
      <div className="bg-[var(--tu-bg-surface)] rounded-xl border border-[var(--tu-border)] shadow-sm mb-6">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--tu-border)]">
          <h3 className="text-sm font-semibold text-[var(--tu-text-heading)]">Fits These Assets</h3>
          {!editingAssets && (
            <button onClick={openAssetEditor} className="text-xs font-semibold text-[var(--tu-text-brand)] hover:underline cursor-pointer">Edit</button>
          )}
        </div>

        {editingAssets ? (
          <div className="p-6">
            {assets.length === 0 ? (
              <p className="text-sm text-[var(--tu-text-subtle)]">This account has no assets yet.</p>
            ) : (
              <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto">
                {assets.map((a) => (
                  <label key={a.id} className="flex items-center gap-2 text-sm text-[var(--tu-text-body)] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedAssets.has(a.id)}
                      onChange={(e) => {
                        setSelectedAssets((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(a.id); else next.delete(a.id);
                          return next;
                        });
                      }}
                    />
                    <span className="truncate">{a.name}</span>
                    <span className="text-xs text-[var(--tu-text-subtle)]">{a.category}</span>
                  </label>
                ))}
              </div>
            )}
            <div className="flex gap-3 justify-end mt-4">
              <button onClick={() => setEditingAssets(false)} className="px-4 py-2 text-sm text-[var(--tu-text-body)] border border-[var(--tu-border)] rounded-lg hover:bg-[var(--tu-bg-secondary)] cursor-pointer">Cancel</button>
              <button onClick={saveAssets} disabled={saving} className="px-4 py-2 text-sm text-white bg-[var(--tu-text-brand)] rounded-lg hover:bg-[var(--tu-text-brand-strong)] disabled:opacity-50 cursor-pointer">
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        ) : part.assets.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-[var(--tu-text-subtle)]">Not linked to any asset yet.</p>
        ) : (
          <div className="px-6 py-4 flex flex-wrap gap-2">
            {part.assets.map((link) => (
              <Link
                key={link.id}
                href={`/accounts/${accountId}/assets/${link.asset.id}`}
                className="rounded-full bg-[var(--tu-bg-secondary)] border border-[var(--tu-border)] px-3 py-1 text-xs font-medium text-[var(--tu-text-body)] hover:border-[var(--tu-text-brand)] hover:text-[var(--tu-text-brand)] transition-colors"
              >
                {link.asset.name}
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Stock history */}
      <div className="bg-[var(--tu-bg-surface)] rounded-xl border border-[var(--tu-border)] shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-[var(--tu-border)]">
          <h3 className="text-sm font-semibold text-[var(--tu-text-heading)]">Stock History</h3>
          <p className="text-xs text-[var(--tu-text-subtle)] mt-0.5">Newest first. Every change to the count appears here.</p>
        </div>
        {ledger.length === 0 ? (
          <EmptyState compact icon="part" title="No movements yet" hint="Receipts, issues, and adjustments to this part will be listed here." />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[var(--tu-bg-secondary)] text-xs text-[var(--tu-text-subtle)] font-semibold uppercase tracking-wide">
                <th className="px-6 py-3 text-left">When</th>
                <th className="px-6 py-3 text-left">Movement</th>
                <th className="px-6 py-3 text-right">Change</th>
                <th className="px-6 py-3 text-right">Balance</th>
                <th className="px-6 py-3 text-left">Reason</th>
                <th className="px-6 py-3 text-left">By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--tu-border)]">
              {ledger.map((t) => {
                const cfg = MOVEMENT_CONFIG[t.type];
                return (
                  <tr key={t.id} className="hover:bg-[var(--tu-bg-secondary)] transition-colors">
                    <td className="px-6 py-3 text-xs text-[var(--tu-text-subtle)] whitespace-nowrap">{fmtDateTime(t.createdAt)}</td>
                    <td className="px-6 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${cfg.cls}`}>{cfg.label}</span>
                    </td>
                    <td className={`px-6 py-3 text-right font-semibold ${t.quantity < 0 ? "text-[var(--tu-on-danger)]" : "text-[var(--tu-on-success)]"}`}>
                      {t.quantity > 0 ? "+" : ""}{fmtQty(t.quantity)}
                    </td>
                    <td className="px-6 py-3 text-right text-[var(--tu-text-body)]">{fmtQty(t.balanceAfter)}</td>
                    <td className="px-6 py-3 text-xs text-[var(--tu-text-subtle)]">
                      {t.workOrder ? (
                        <Link href={`/accounts/${accountId}/work-orders/${t.workOrder.id}`} className="text-[var(--tu-text-brand)] hover:underline">
                          {t.workOrder.title}
                        </Link>
                      ) : (
                        t.reason ?? "—"
                      )}
                    </td>
                    <td className="px-6 py-3 text-xs text-[var(--tu-text-subtle)]">{t.performedByName}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
