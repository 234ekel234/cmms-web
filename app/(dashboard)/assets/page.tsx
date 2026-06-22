"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import api from "@/lib/api";

type Account = { id: string; name: string };

type Asset = {
  id: string;
  name: string;
  category: string;
  status: "OPERATIONAL" | "UNDER_MAINTENANCE";
  health: "GOOD" | "FAIR" | "POOR" | "OUT_OF_SERVICE";
  serialNumber: string | null;
  location: string | null;
  openWorkOrders: number;
  lastCompletedAt: string | null;
  archivedAt: string | null;
};

type HealthFilter = "ALL" | Asset["health"];

const HEALTH_BADGE: Record<Asset["health"], { cls: string; label: string }> = {
  GOOD:            { cls: "tu-badge tu-badge-success",  label: "Good"           },
  FAIR:            { cls: "tu-badge tu-badge-warning",  label: "Fair"           },
  POOR:            { cls: "tu-badge tu-badge-danger",   label: "Poor"           },
  OUT_OF_SERVICE:  { cls: "tu-badge tu-badge-neutral",  label: "Out of Service" },
};

const STATUS_BADGE: Record<Asset["status"], { cls: string; label: string }> = {
  OPERATIONAL:       { cls: "tu-badge tu-badge-success", label: "Operational"       },
  UNDER_MAINTENANCE: { cls: "tu-badge tu-badge-warning", label: "Under Maintenance" },
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function AssetsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [healthFilter, setHealthFilter] = useState<HealthFilter>("ALL");
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  useEffect(() => { fetchAccounts(); }, []);
  useEffect(() => { if (selectedAccountId) fetchAssets(); }, [selectedAccountId, showArchived]);

  async function fetchAccounts() {
    setLoadingAccounts(true);
    try {
      const res = await api.get("/accounts");
      const list: Account[] = res.data;
      setAccounts(list);
      if (list.length > 0) setSelectedAccountId(list[0].id);
    } catch {
      // silent
    } finally {
      setLoadingAccounts(false);
    }
  }

  async function fetchAssets() {
    setLoadingAssets(true);
    try {
      const res = await api.get(`/accounts/${selectedAccountId}/assets`, {
        params: { includeArchived: showArchived },
      });
      setAssets(res.data);
    } catch {
      setAssets([]);
    } finally {
      setLoadingAssets(false);
    }
  }

  const HEALTH_TABS: { key: HealthFilter; label: string }[] = [
    { key: "ALL",            label: "All"           },
    { key: "GOOD",           label: "Good"          },
    { key: "FAIR",           label: "Fair"          },
    { key: "POOR",           label: "Poor"          },
    { key: "OUT_OF_SERVICE", label: "Out of Service"},
  ];

  const activeAssets = showArchived ? assets : assets.filter((a) => !a.archivedAt);

  const filtered = activeAssets.filter((a) => {
    const matchHealth = healthFilter === "ALL" || a.health === healthFilter;
    const matchSearch = !search.trim() ||
      a.name.toLowerCase().includes(search.toLowerCase()) ||
      a.category.toLowerCase().includes(search.toLowerCase()) ||
      a.location?.toLowerCase().includes(search.toLowerCase()) ||
      a.serialNumber?.toLowerCase().includes(search.toLowerCase());
    return matchHealth && matchSearch;
  });

  const healthCounts = HEALTH_TABS.reduce<Record<HealthFilter, number>>((acc, tab) => {
    acc[tab.key] = tab.key === "ALL"
      ? activeAssets.length
      : activeAssets.filter((a) => a.health === tab.key).length;
    return acc;
  }, {} as Record<HealthFilter, number>);

  const poorCount = activeAssets.filter((a) => a.health === "POOR" || a.health === "OUT_OF_SERVICE").length;
  const underMaintenanceCount = activeAssets.filter((a) => a.status === "UNDER_MAINTENANCE").length;

  return (
    <div className="tu-page">
      {/* Header */}
      <div className="tu-page-header">
        <div>
          <h1 className="tu-page-title">Assets</h1>
          <p className="tu-page-sub">Equipment and facility asset registry</p>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          {!loadingAccounts && accounts.length > 0 && (
            <div>
              <label htmlFor="account-select" className="tu-select-label">Account</label>
              <select
                id="account-select"
                className="tu-select"
                value={selectedAccountId}
                onChange={(e) => { setSelectedAccountId(e.target.value); setHealthFilter("ALL"); setSearch(""); }}
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* KPI strip */}
      {!loadingAssets && activeAssets.length > 0 && (
        <div className="tu-kpi-grid" style={{ marginBottom: 24 }}>
          <div className="tu-stat-card">
            <p className="tu-stat-label">Total Assets</p>
            <p className="tu-stat-value">{activeAssets.length}</p>
            <p className="tu-stat-sub">in registry</p>
          </div>
          <div className="tu-stat-card">
            <p className="tu-stat-label">Under Maintenance</p>
            <p className={`tu-stat-value${underMaintenanceCount > 0 ? " tu-stat-warning" : ""}`}>
              {underMaintenanceCount}
            </p>
            <p className="tu-stat-sub">currently offline</p>
          </div>
          <div className="tu-stat-card">
            <p className="tu-stat-label">Poor / Out of Service</p>
            <p className={`tu-stat-value${poorCount > 0 ? " tu-stat-danger" : ""}`}>{poorCount}</p>
            <p className="tu-stat-sub">need attention</p>
          </div>
          <div className="tu-stat-card">
            <p className="tu-stat-label">Open Work Orders</p>
            <p className="tu-stat-value">
              {activeAssets.reduce((s, a) => s + a.openWorkOrders, 0)}
            </p>
            <p className="tu-stat-sub">across all assets</p>
          </div>
        </div>
      )}

      {/* Card */}
      <div className="tu-card">
        {/* Health tabs */}
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
                >
                  {healthCounts[tab.key]}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Search + archive toggle */}
        <div style={{ padding: "12px 24px", borderBottom: "1px solid var(--tu-border)", display: "flex", gap: 12, alignItems: "center" }}>
          <input
            className="tu-input"
            style={{ width: 240 }}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, category, location…"
          />
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--tu-text-body)", cursor: "pointer", userSelect: "none" }}>
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              style={{ width: 14, height: 14 }}
            />
            Show archived
          </label>
          <span style={{ marginLeft: "auto", fontSize: 13, color: "var(--tu-text-subtle)" }}>
            {filtered.length} asset{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Table */}
        <div style={{ overflowX: "auto" }}>
          <table className="tu-table" aria-label="Assets">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Category</th>
                <th scope="col">Health</th>
                <th scope="col">Status</th>
                <th scope="col">Location</th>
                <th scope="col" className="tu-center">Open WOs</th>
                <th scope="col">Last Maintenance</th>
              </tr>
            </thead>
            <tbody>
              {loadingAccounts || loadingAssets ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} aria-hidden="true">
                    {Array.from({ length: 7 }).map((__, j) => (
                      <td key={j} style={{ padding: "14px 24px" }}>
                        <div className="tu-skeleton" style={{ height: 14, borderRadius: 4 }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: "40px 24px", color: "var(--tu-text-body)", fontSize: 14 }}>
                    {activeAssets.length === 0
                      ? "No assets for this account."
                      : "No assets match your search."}
                  </td>
                </tr>
              ) : (
                filtered.map((asset) => {
                  const health = HEALTH_BADGE[asset.health];
                  const status = STATUS_BADGE[asset.status];
                  return (
                    <tr key={asset.id} style={asset.archivedAt ? { opacity: 0.5 } : undefined}>
                      <td className="tu-strong">
                        <Link
                          href={`/accounts/${selectedAccountId}/assets/${asset.id}`}
                          style={{ color: "inherit", textDecoration: "none" }}
                          className="tu-row-link"
                        >
                          {asset.name}
                          {asset.archivedAt && (
                            <span className="tu-badge tu-badge-neutral" style={{ marginLeft: 6, fontSize: 10 }}>Archived</span>
                          )}
                        </Link>
                      </td>
                      <td style={{ color: "var(--tu-text-body)" }}>{asset.category}</td>
                      <td><span className={health.cls}>{health.label}</span></td>
                      <td><span className={status.cls}>{status.label}</span></td>
                      <td style={{ color: "var(--tu-text-body)" }}>
                        {asset.location ?? <span style={{ color: "var(--tu-text-subtle)" }}>—</span>}
                      </td>
                      <td className="tu-center">
                        {asset.openWorkOrders > 0 ? (
                          <span className="tu-badge tu-badge-brand">{asset.openWorkOrders}</span>
                        ) : (
                          <span style={{ color: "var(--tu-text-subtle)" }}>—</span>
                        )}
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
