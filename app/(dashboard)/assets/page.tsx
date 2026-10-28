"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import api from "@/lib/api";
import AccountFilter from "@/components/AccountFilter";
import { EmptyRow } from "@/components/EmptyState";
import { type AssetLocationRef, locationPath } from "@/lib/assetLocations";
import { ASSET_HEALTH, assetHealthMeta } from "@/lib/statuses";

type Account = { id: string; name: string };

type Asset = {
  id: string;
  name: string;
  category: string;
  status: string;
  health: "FUNCTIONAL" | "FUNCTIONAL_WITH_FINDINGS" | "BREAKDOWN";
  assetCode: string | null;
  brand: string | null;
  model: string | null;
  serialNumber: string | null;
  location: AssetLocationRef | null;
  openWorkOrders: number;
  lastCompletedAt: string | null;
  archivedAt: string | null;
  accountId: string;
  account: Account;
};

type HealthFilter = "ALL" | Asset["health"];
type StatusFilter = "ALL" | Asset["status"];
type SortKey = "NAME" | "ACCOUNT" | "HEALTH" | "OPEN_WOS" | "LAST_MAINT";

const HEALTH_TABS: { key: HealthFilter; label: string }[] = [
  { key: "ALL", label: "All" },
  ...(Object.keys(ASSET_HEALTH) as Asset["health"][]).map((k) => ({
    key: k as HealthFilter,
    label: ASSET_HEALTH[k].label,
  })),
];

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "NAME",       label: "Name (A–Z)"          },
  { key: "ACCOUNT",    label: "Account (A–Z)"       },
  { key: "HEALTH",     label: "Health (worst first)" },
  { key: "OPEN_WOS",   label: "Open work orders"    },
  { key: "LAST_MAINT", label: "Least recently maintained" },
];

// Worst first, so a descending sort surfaces failing equipment at the top.
const HEALTH_RANK: Record<Asset["health"], number> = {
  BREAKDOWN: 3, FUNCTIONAL_WITH_FINDINGS: 2, FUNCTIONAL: 1,
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function AssetsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedAccounts, setSelectedAccounts] = useState<Set<string>>(new Set());
  const [healthFilter, setHealthFilter] = useState<HealthFilter>("ALL");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("NAME");
  const [showArchived, setShowArchived] = useState(false);

  // Archived assets are excluded server-side unless asked for, so this refetches.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [assetRes, acctRes] = await Promise.all([
          api.get("/assets", { params: { includeArchived: showArchived } }),
          api.get("/accounts"),
        ]);
        if (cancelled) return;
        setAssets(assetRes.data);
        setAccounts(acctRes.data);
      } catch {
        if (cancelled) return;
        setError("Failed to load assets.");
        setAssets([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [showArchived]);

  // Everything except the health filter, so health tab counts reflect the rest.
  const preHealth = useMemo(() => {
    const q = search.trim().toLowerCase();
    return assets.filter((a) => {
      const matchAccount = selectedAccounts.size === 0 || selectedAccounts.has(a.accountId);
      const matchStatus = statusFilter === "ALL" || a.status === statusFilter;
      const matchSearch =
        !q ||
        a.name.toLowerCase().includes(q) ||
        a.category.toLowerCase().includes(q) ||
        a.account.name.toLowerCase().includes(q) ||
        // The whole written path, so searching "Tower B" finds what is on its
        // floors as well as what is filed at the building itself.
        locationPath(a.location).toLowerCase().includes(q) ||
        !!a.serialNumber?.toLowerCase().includes(q) ||
        !!a.assetCode?.toLowerCase().includes(q) ||
        !!a.brand?.toLowerCase().includes(q) ||
        !!a.model?.toLowerCase().includes(q);
      return matchAccount && matchStatus && matchSearch;
    });
  }, [assets, selectedAccounts, statusFilter, search]);

  const healthCounts = useMemo(
    () => Object.fromEntries(
      HEALTH_TABS.map((t) => [t.key, t.key === "ALL" ? preHealth.length : preHealth.filter((a) => a.health === t.key).length])
    ) as Record<HealthFilter, number>,
    [preHealth]
  );

  const sorted = useMemo(() => {
    const rows = preHealth.filter((a) => healthFilter === "ALL" || a.health === healthFilter);
    rows.sort((a, b) => {
      switch (sortKey) {
        case "ACCOUNT":
          return a.account.name.localeCompare(b.account.name) || a.name.localeCompare(b.name);
        case "HEALTH":
          return HEALTH_RANK[b.health] - HEALTH_RANK[a.health] || a.name.localeCompare(b.name);
        case "OPEN_WOS":
          return b.openWorkOrders - a.openWorkOrders || a.name.localeCompare(b.name);
        case "LAST_MAINT":
          // Never-maintained assets are the most urgent, so they sort first.
          if (!a.lastCompletedAt && !b.lastCompletedAt) return a.name.localeCompare(b.name);
          if (!a.lastCompletedAt) return -1;
          if (!b.lastCompletedAt) return 1;
          return new Date(a.lastCompletedAt).getTime() - new Date(b.lastCompletedAt).getTime();
        case "NAME":
        default:
          return a.name.localeCompare(b.name);
      }
    });
    return rows;
  }, [preHealth, healthFilter, sortKey]);

  const findingsCount = assets.filter((a) => a.health === "FUNCTIONAL_WITH_FINDINGS").length;
  const breakdownCount = assets.filter((a) => a.health === "BREAKDOWN").length;

  // The status filter is built from what is actually stored, because status is
  // free text — there is no fixed list to offer. Anything an account has
  // written is selectable; anything nobody uses never clutters the menu.
  const statusOptions = useMemo(
    () => Array.from(new Set(assets.map((a) => a.status).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [assets]
  );

  const activeFilterCount =
    (selectedAccounts.size > 0 ? 1 : 0) +
    (healthFilter !== "ALL" ? 1 : 0) +
    (statusFilter !== "ALL" ? 1 : 0) +
    (search.trim() ? 1 : 0);

  function resetFilters() {
    setSelectedAccounts(new Set());
    setHealthFilter("ALL");
    setStatusFilter("ALL");
    setSearch("");
  }

  return (
    <div className="tu-page">
      <div className="tu-page-header">
        <div>
          <h1 className="tu-page-title">Assets</h1>
          <p className="tu-page-sub">Equipment and facility registry across all your accounts</p>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
          {!loading && accounts.length > 1 && (
            <AccountFilter accounts={accounts} selected={selectedAccounts} onChange={setSelectedAccounts} />
          )}
        </div>
      </div>

      {error && <div className="tu-error-banner" role="alert">{error}</div>}

      {!loading && assets.length > 0 && (
        <div className="tu-kpi-grid" style={{ marginBottom: 24 }}>
          <div className="tu-stat-card">
            <p className="tu-stat-label">Total Assets</p>
            <p className="tu-stat-value">{assets.length}</p>
            <p className="tu-stat-sub">in registry</p>
          </div>
          <div className="tu-stat-card">
            <p className="tu-stat-label">{ASSET_HEALTH.FUNCTIONAL_WITH_FINDINGS.label}</p>
            <p className={`tu-stat-value${findingsCount > 0 ? " tu-stat-warning" : ""}`}>
              {findingsCount}
            </p>
            <p className="tu-stat-sub">still running, needs a look</p>
          </div>
          <div className="tu-stat-card">
            <p className="tu-stat-label">{ASSET_HEALTH.BREAKDOWN.label}</p>
            <p className={`tu-stat-value${breakdownCount > 0 ? " tu-stat-danger" : ""}`}>{breakdownCount}</p>
            <p className="tu-stat-sub">down right now</p>
          </div>
          <div className="tu-stat-card">
            <p className="tu-stat-label">Open Work Orders</p>
            <p className="tu-stat-value">{assets.reduce((s, a) => s + a.openWorkOrders, 0)}</p>
            <p className="tu-stat-sub">across all assets</p>
          </div>
        </div>
      )}

      <div className="tu-card">
        <div className="tu-tab-group" role="tablist" aria-label="Filter by health">
          {HEALTH_TABS.map((tab) => (
            <button
              key={tab.key}
              role="tab"
              aria-selected={healthFilter === tab.key}
              className={`tu-tab${healthFilter === tab.key ? " tu-active-tab" : ""}`}
              onClick={() => setHealthFilter(tab.key)}
              type="button"
            >
              {tab.label}
              {healthCounts[tab.key] > 0 && (
                <span
                  style={{
                    marginLeft: 6,
                    fontSize: 11,
                    fontWeight: 600,
                    color: healthFilter === tab.key ? "var(--tu-text-brand)" : "var(--tu-text-subtle)",
                  }}
                  aria-label={`${healthCounts[tab.key]} items`}
                >
                  {healthCounts[tab.key]}
                </span>
              )}
            </button>
          ))}
        </div>

        <div style={{ padding: "12px 24px", borderBottom: "1px solid var(--tu-border)", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <input
            id="asset-search"
            className="tu-input"
            style={{ width: 280 }}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, category, account, location…"
            aria-label="Search assets"
          />

          <select
            id="asset-status"
            className="tu-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            aria-label="Filter by status"
          >
            <option value="ALL">All statuses</option>
            {statusOptions.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          <select
            id="asset-sort"
            className="tu-select"
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            aria-label="Sort assets"
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
            {sorted.length} asset{sorted.length !== 1 ? "s" : ""}
          </span>
        </div>

        <div className="tu-scroll-x">
          <table className="tu-table" aria-label="Assets">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Account</th>
                <th scope="col">Category</th>
                <th scope="col">Health</th>
                <th scope="col">Status</th>
                <th scope="col">Location</th>
                <th scope="col" className="tu-center">Open work orders</th>
                <th scope="col">Last Maintenance</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} aria-hidden="true">
                    {Array.from({ length: 8 }).map((__, j) => (
                      <td key={j} style={{ padding: "14px 24px" }}>
                        <div className="tu-skeleton" style={{ height: 14, borderRadius: 4 }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : assets.length === 0 ? (
                <EmptyRow
                  colSpan={8}
                  icon="asset"
                  title="No assets yet"
                  hint="Assets are the equipment you maintain. Add them from an account's Assets tab."
                />
              ) : sorted.length === 0 ? (
                <EmptyRow
                  colSpan={8}
                  icon="search"
                  title="No matching assets"
                  hint="Nothing matches the current filters."
                />
              ) : (
                sorted.map((asset) => {
                  const health = assetHealthMeta(asset.health);
                  return (
                    <tr key={asset.id} style={asset.archivedAt ? { opacity: 0.5 } : undefined}>
                      <td className="tu-strong">
                        <Link
                          href={`/accounts/${asset.accountId}/assets/${asset.id}`}
                          style={{ color: "inherit", textDecoration: "none" }}
                          className="tu-row-link"
                        >
                          {asset.name}
                          {asset.archivedAt && (
                            <span className="tu-badge tu-badge-neutral" style={{ marginLeft: 6, fontSize: 10 }}>Archived</span>
                          )}
                        </Link>
                      </td>
                      <td>
                        <Link href={`/accounts/${asset.accountId}`} className="tu-row-link" style={{ color: "var(--tu-text-brand)", textDecoration: "none" }}>
                          {asset.account.name}
                        </Link>
                      </td>
                      <td style={{ color: "var(--tu-text-body)" }}>{asset.category}</td>
                      <td><span className={health.badge}>{health.label}</span></td>
                      <td><span className="tu-badge tu-badge-neutral">{asset.status || "—"}</span></td>
                      <td style={{ color: "var(--tu-text-body)" }}>
                        {locationPath(asset.location) || <span style={{ color: "var(--tu-text-subtle)" }}>—</span>}
                      </td>
                      <td className="tu-center">
                        {asset.openWorkOrders > 0
                          ? <span className="tu-figure">{asset.openWorkOrders}</span>
                          : <span className="tu-figure-zero">—</span>}
                      </td>
                      <td style={{ color: "var(--tu-text-body)", fontSize: 13 }}>
                        {asset.lastCompletedAt
                          ? formatDate(asset.lastCompletedAt)
                          : <span style={{ color: "var(--tu-text-subtle)" }}>Never</span>}
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
