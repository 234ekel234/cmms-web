"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import api from "@/lib/api";
import AccountFilter from "@/components/AccountFilter";
import { fmtCost, fmtQty, type Part } from "@/lib/parts";
import { EmptyRow } from "@/components/EmptyState";

type Account = { id: string; name: string };

type StockFilter = "ALL" | "LOW" | "NEGATIVE";
type SortKey = "NAME" | "ACCOUNT" | "STOCK" | "VALUE";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "NAME",    label: "Name (A–Z)" },
  { key: "ACCOUNT", label: "Account (A–Z)" },
  { key: "STOCK",   label: "Stock (lowest first)" },
  { key: "VALUE",   label: "Stock value (highest first)" },
];

// What the stock on hand is worth, for the value KPI and sort. Parts with no
// unit cost contribute nothing rather than being guessed at.
const stockValue = (p: Part) => (p.unitCost ?? 0) * Math.max(p.quantityOnHand, 0);

export default function PartsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [parts, setParts] = useState<Part[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedAccounts, setSelectedAccounts] = useState<Set<string>>(new Set());
  const [stockFilter, setStockFilter] = useState<StockFilter>("ALL");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("NAME");
  const [showArchived, setShowArchived] = useState(false);

  useEffect(() => {
    api.get("/accounts").then((r) => setAccounts(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .get("/parts", { params: showArchived ? { includeArchived: "true" } : {} })
      .then((r) => { if (!cancelled) setParts(r.data); })
      .catch(() => { if (!cancelled) setError("Failed to load spare parts."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [showArchived]);

  const sorted = useMemo(() => {
    const term = search.trim().toLowerCase();
    const rows = parts.filter((p) => {
      if (selectedAccounts.size > 0 && !selectedAccounts.has(p.accountId)) return false;
      if (stockFilter === "LOW" && !p.isLowStock) return false;
      if (stockFilter === "NEGATIVE" && p.quantityOnHand >= 0) return false;
      if (!term) return true;
      return [p.name, p.partNumber, p.category, p.location, p.account?.name]
        .some((v) => v?.toLowerCase().includes(term));
    });

    return rows.sort((a, b) => {
      switch (sortKey) {
        case "ACCOUNT":
          return (a.account?.name ?? "").localeCompare(b.account?.name ?? "") || a.name.localeCompare(b.name);
        case "STOCK":
          return a.quantityOnHand - b.quantityOnHand || a.name.localeCompare(b.name);
        case "VALUE":
          return stockValue(b) - stockValue(a) || a.name.localeCompare(b.name);
        default:
          return a.name.localeCompare(b.name);
      }
    });
  }, [parts, selectedAccounts, stockFilter, search, sortKey]);

  const lowCount = parts.filter((p) => p.isLowStock && !p.archivedAt).length;
  const negativeCount = parts.filter((p) => p.quantityOnHand < 0 && !p.archivedAt).length;
  const totalValue = parts.filter((p) => !p.archivedAt).reduce((s, p) => s + stockValue(p), 0);

  const activeFilterCount =
    (selectedAccounts.size > 0 ? 1 : 0) + (stockFilter !== "ALL" ? 1 : 0) + (search.trim() ? 1 : 0);

  function resetFilters() {
    setSelectedAccounts(new Set());
    setStockFilter("ALL");
    setSearch("");
  }

  return (
    <div className="tu-page">
      <div className="tu-page-header">
        <div>
          <h1 className="tu-page-title">Spare Parts</h1>
          <p className="tu-page-sub">Stocked spares and reorder levels across all your accounts</p>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
          {!loading && accounts.length > 1 && (
            <AccountFilter accounts={accounts} selected={selectedAccounts} onChange={setSelectedAccounts} />
          )}
        </div>
      </div>

      {error && <div className="tu-error-banner" role="alert">{error}</div>}

      {!loading && parts.length > 0 && (
        <div className="tu-kpi-grid" style={{ marginBottom: 24 }}>
          <div className="tu-stat-card">
            <p className="tu-stat-label">Catalogued Parts</p>
            <p className="tu-stat-value">{parts.filter((p) => !p.archivedAt).length}</p>
            <p className="tu-stat-sub">across all accounts</p>
          </div>
          <div className="tu-stat-card">
            <p className="tu-stat-label">At or Below Minimum</p>
            <p className={`tu-stat-value${lowCount > 0 ? " tu-stat-danger" : ""}`}>{lowCount}</p>
            <p className="tu-stat-sub">need reordering</p>
          </div>
          <div className="tu-stat-card">
            <p className="tu-stat-label">Negative Counts</p>
            <p className={`tu-stat-value${negativeCount > 0 ? " tu-stat-warning" : ""}`}>{negativeCount}</p>
            <p className="tu-stat-sub">need a stock correction</p>
          </div>
          <div className="tu-stat-card">
            <p className="tu-stat-label">Stock Value</p>
            <p className="tu-stat-value">{fmtCost(totalValue)}</p>
            <p className="tu-stat-sub">at last known cost</p>
          </div>
        </div>
      )}

      <div className="tu-card">
        <div style={{ padding: "12px 24px", borderBottom: "1px solid var(--tu-border)", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <input
            id="part-search"
            className="tu-input"
            style={{ width: 280 }}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, part number, account, location…"
            aria-label="Search spare parts"
          />

          <select
            id="part-stock"
            className="tu-select"
            value={stockFilter}
            onChange={(e) => setStockFilter(e.target.value as StockFilter)}
            aria-label="Filter by stock level"
          >
            <option value="ALL">All stock levels</option>
            <option value="LOW">At or below minimum</option>
            <option value="NEGATIVE">Negative count</option>
          </select>

          <select
            id="part-sort"
            className="tu-select"
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            aria-label="Sort spare parts"
          >
            {SORT_OPTIONS.map((s) => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
          </select>

          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--tu-text-body)", cursor: "pointer", userSelect: "none" }}>
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              style={{ width: 16, height: 16, borderRadius: 4 }}
            />
            Show archived
          </label>

          {activeFilterCount > 0 && (
            <button type="button" className="tu-btn-secondary" onClick={resetFilters}>
              Clear filters
            </button>
          )}

          <span style={{ marginLeft: "auto", fontSize: 13, color: "var(--tu-text-subtle)" }}>
            {sorted.length} part{sorted.length !== 1 ? "s" : ""}
          </span>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table className="tu-table" aria-label="Spare parts">
            <thead>
              <tr>
                <th scope="col">Part</th>
                <th scope="col">Account</th>
                <th scope="col">Part No.</th>
                <th scope="col" className="tu-center">On Hand</th>
                <th scope="col" className="tu-center">Minimum</th>
                <th scope="col">Unit Cost</th>
                <th scope="col">Location</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} aria-hidden="true">
                    {Array.from({ length: 7 }).map((__, j) => (
                      <td key={j} style={{ padding: "14px 24px" }}>
                        <div className="tu-skeleton" style={{ height: 14, borderRadius: 4 }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : parts.length === 0 ? (
                <EmptyRow
                  colSpan={7}
                  icon="part"
                  title="No spare parts catalogued"
                  hint="Add them from an account's Spare Parts tab to track stock levels here."
                />
              ) : sorted.length === 0 ? (
                <EmptyRow
                  colSpan={7}
                  icon="search"
                  title="No matching parts"
                  hint="Nothing matches the current filters."
                />
              ) : (
                sorted.map((part) => {
                  const negative = part.quantityOnHand < 0;
                  const badgeCls = negative
                    ? "tu-badge tu-badge-danger"
                    : part.isLowStock
                      ? "tu-badge tu-badge-warning"
                      : "tu-badge tu-badge-success";
                  return (
                    <tr key={part.id} style={part.archivedAt ? { opacity: 0.5 } : undefined}>
                      <td className="tu-strong">
                        <Link
                          href={`/accounts/${part.accountId}/parts/${part.id}`}
                          style={{ color: "inherit", textDecoration: "none" }}
                          className="tu-row-link"
                        >
                          {part.name}
                          {part.archivedAt && (
                            <span className="tu-badge tu-badge-neutral" style={{ marginLeft: 6, fontSize: 10 }}>Archived</span>
                          )}
                        </Link>
                      </td>
                      <td>
                        <Link href={`/accounts/${part.accountId}/parts`} className="tu-row-link" style={{ color: "var(--tu-text-brand)", textDecoration: "none" }}>
                          {part.account?.name ?? "—"}
                        </Link>
                      </td>
                      <td style={{ color: "var(--tu-text-body)" }}>
                        {part.partNumber ?? <span style={{ color: "var(--tu-text-subtle)" }}>—</span>}
                      </td>
                      <td className="tu-center">
                        <span className={badgeCls}>
                          {fmtQty(part.quantityOnHand)}{part.unit ? ` ${part.unit}` : ""}
                        </span>
                      </td>
                      <td className="tu-center" style={{ color: "var(--tu-text-body)" }}>
                        {part.minQuantity == null
                          ? <span style={{ color: "var(--tu-text-subtle)" }}>—</span>
                          : fmtQty(part.minQuantity)}
                      </td>
                      <td style={{ color: "var(--tu-text-body)" }}>
                        {part.unitCost == null
                          ? <span style={{ color: "var(--tu-text-subtle)" }}>—</span>
                          : fmtCost(part.unitCost)}
                      </td>
                      <td style={{ color: "var(--tu-text-body)", fontSize: 13 }}>
                        {part.location ?? <span style={{ color: "var(--tu-text-subtle)" }}>—</span>}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
