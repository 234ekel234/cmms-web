"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import api from "@/lib/api";
import WorkOrderCalendar from "@/components/WorkOrderCalendar";
import AccountFilter from "@/components/AccountFilter";

type Account = { id: string; name: string };

type WorkOrder = {
  id: string;
  title: string;
  description: string | null;
  status: "REQUESTED" | "PENDING" | "IN_PROGRESS" | "ON_HOLD" | "COMPLETED" | "REJECTED";
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | null;
  dueDate: string | null;
  category: string | null;
  isSpecialProject: boolean;
  accountId: string;
  account: Account;
  asset: { id: string; name: string } | null;
  assignments: { employee: { id: string; name: string; position: string } }[];
  createdAt: string;
};

type StatusFilter = "ALL" | "OVERDUE" | WorkOrder["status"];
type PriorityFilter = "ALL" | NonNullable<WorkOrder["priority"]>;
type SortKey = "NEWEST" | "OLDEST" | "DUE_SOON" | "PRIORITY" | "TITLE" | "ACCOUNT";
type View = "list" | "calendar";

const STATUS_TABS: { key: StatusFilter; label: string }[] = [
  { key: "ALL",         label: "All"         },
  { key: "OVERDUE",     label: "Overdue"     },
  { key: "REQUESTED",   label: "Requested"   },
  { key: "PENDING",     label: "Pending"     },
  { key: "IN_PROGRESS", label: "In Progress" },
  { key: "ON_HOLD",     label: "On Hold"     },
  { key: "COMPLETED",   label: "Completed"   },
  { key: "REJECTED",    label: "Rejected"    },
];

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "NEWEST",   label: "Newest first"      },
  { key: "OLDEST",   label: "Oldest first"      },
  { key: "DUE_SOON", label: "Due date (soonest)" },
  { key: "PRIORITY", label: "Priority (highest)" },
  { key: "TITLE",    label: "Title (A–Z)"       },
  { key: "ACCOUNT",  label: "Account (A–Z)"     },
];

// Highest first, so a descending sort surfaces CRITICAL at the top.
const PRIORITY_RANK: Record<NonNullable<WorkOrder["priority"]>, number> = {
  CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1,
};

function parseStatusParam(raw: string | null): StatusFilter {
  if (!raw) return "ALL";
  const up = raw.toUpperCase();
  return (STATUS_TABS.some((t) => t.key === up) ? up : "ALL") as StatusFilter;
}

const isOverdue = (wo: { dueDate: string | null; status: WorkOrder["status"] }) =>
  !!wo.dueDate && wo.status !== "COMPLETED" && wo.status !== "REJECTED" && new Date(wo.dueDate).getTime() < Date.now();

const STATUS_BADGE: Record<WorkOrder["status"], { cls: string; label: string }> = {
  REQUESTED:   { cls: "tu-badge tu-badge-brand",   label: "Requested"   },
  PENDING:     { cls: "tu-badge tu-badge-warning",  label: "Pending"     },
  IN_PROGRESS: { cls: "tu-badge tu-badge-brand",    label: "In Progress" },
  ON_HOLD:     { cls: "tu-badge tu-badge-neutral",  label: "On Hold"     },
  COMPLETED:   { cls: "tu-badge tu-badge-success",  label: "Completed"   },
  REJECTED:    { cls: "tu-badge tu-badge-danger",   label: "Rejected"    },
};

const PRIORITY_BADGE: Record<NonNullable<WorkOrder["priority"]>, { cls: string }> = {
  LOW:      { cls: "tu-badge tu-badge-neutral" },
  MEDIUM:   { cls: "tu-badge tu-badge-warning" },
  HIGH:     { cls: "tu-badge tu-badge-danger"  },
  CRITICAL: { cls: "tu-badge tu-badge-danger"  },
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function WorkOrdersPage() {
  const searchParams = useSearchParams();

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedAccounts, setSelectedAccounts] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(() => parseStatusParam(searchParams.get("status")));
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>("ALL");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("NEWEST");
  const [view, setView] = useState<View>("list");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [woRes, acctRes] = await Promise.all([
          api.get("/work-orders"),
          api.get("/accounts"),
        ]);
        if (cancelled) return;
        setWorkOrders(woRes.data);
        setAccounts(acctRes.data);
      } catch {
        if (cancelled) return;
        setError("Failed to load work orders.");
        setWorkOrders([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const matchesStatus = (wo: WorkOrder, key: StatusFilter) =>
    key === "ALL" ? true : key === "OVERDUE" ? isOverdue(wo) : wo.status === key;

  // Everything except the status filter — the tab counts are computed against
  // this set so each tab shows how many rows it would reveal.
  const preStatus = useMemo(() => {
    const q = search.trim().toLowerCase();
    return workOrders.filter((wo) => {
      const matchAccount = selectedAccounts.size === 0 || selectedAccounts.has(wo.accountId);
      const matchPriority = priorityFilter === "ALL" || wo.priority === priorityFilter;
      const matchSearch =
        !q ||
        wo.title.toLowerCase().includes(q) ||
        wo.asset?.name.toLowerCase().includes(q) ||
        wo.category?.toLowerCase().includes(q) ||
        wo.account.name.toLowerCase().includes(q) ||
        wo.assignments.some((a) => a.employee.name.toLowerCase().includes(q));
      return matchAccount && matchPriority && matchSearch;
    });
  }, [workOrders, selectedAccounts, priorityFilter, search]);

  const counts = useMemo(
    () => Object.fromEntries(
      STATUS_TABS.map((tab) => [tab.key, preStatus.filter((wo) => matchesStatus(wo, tab.key)).length])
    ) as Record<StatusFilter, number>,
    [preStatus]
  );

  const filtered = useMemo(
    () => preStatus.filter((wo) => matchesStatus(wo, statusFilter)),
    [preStatus, statusFilter]
  );

  const sorted = useMemo(() => {
    const rows = [...filtered];
    rows.sort((a, b) => {
      switch (sortKey) {
        case "OLDEST":
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case "DUE_SOON":
          // Undated work orders sink to the bottom rather than sorting as epoch 0.
          if (!a.dueDate && !b.dueDate) return 0;
          if (!a.dueDate) return 1;
          if (!b.dueDate) return -1;
          return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
        case "PRIORITY":
          return (b.priority ? PRIORITY_RANK[b.priority] : 0) - (a.priority ? PRIORITY_RANK[a.priority] : 0);
        case "TITLE":
          return a.title.localeCompare(b.title);
        case "ACCOUNT":
          return a.account.name.localeCompare(b.account.name) || a.title.localeCompare(b.title);
        case "NEWEST":
        default:
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
    });
    return rows;
  }, [filtered, sortKey]);

  const activeFilterCount =
    (selectedAccounts.size > 0 ? 1 : 0) +
    (priorityFilter !== "ALL" ? 1 : 0) +
    (search.trim() ? 1 : 0) +
    (statusFilter !== "ALL" ? 1 : 0);

  function resetFilters() {
    setSelectedAccounts(new Set());
    setPriorityFilter("ALL");
    setSearch("");
    setStatusFilter("ALL");
  }

  return (
    <div className="tu-page">
      <div className="tu-page-header">
        <div>
          <h1 className="tu-page-title">Work Orders</h1>
          <p className="tu-page-sub">Maintenance tasks across all your accounts</p>
        </div>

        <div style={{ display: "flex", gap: 16, alignItems: "flex-end" }}>
          <div role="tablist" aria-label="View" style={{ display: "inline-flex", border: "1px solid var(--tu-border)", borderRadius: 8, overflow: "hidden" }}>
            {([
              { key: "list" as const, label: "List" },
              { key: "calendar" as const, label: "Calendar" },
            ]).map((v) => (
              <button
                key={v.key}
                role="tab"
                aria-selected={view === v.key}
                type="button"
                onClick={() => setView(v.key)}
                style={{
                  padding: "8px 16px",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  border: "none",
                  background: view === v.key ? "var(--tu-bg-brand-soft)" : "var(--tu-bg-surface)",
                  color: view === v.key ? "var(--tu-text-brand)" : "var(--tu-text-subtle)",
                }}
              >
                {v.label}
              </button>
            ))}
          </div>

          {!loading && accounts.length > 1 && (
            <AccountFilter accounts={accounts} selected={selectedAccounts} onChange={setSelectedAccounts} />
          )}
        </div>
      </div>

      {error && <div className="tu-error-banner" role="alert">{error}</div>}

      <div className="tu-card">
        <div className="tu-tab-group" role="tablist" aria-label="Filter by status">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.key}
              role="tab"
              aria-selected={statusFilter === tab.key}
              aria-controls="wo-tabpanel"
              className={`tu-tab${statusFilter === tab.key ? " tu-active-tab" : ""}`}
              onClick={() => setStatusFilter(tab.key)}
              type="button"
            >
              {tab.label}
              {counts[tab.key] > 0 && (
                <span
                  style={{
                    marginLeft: 6,
                    fontSize: 11,
                    fontWeight: 600,
                    color: statusFilter === tab.key ? "var(--tu-text-brand)" : "var(--tu-text-subtle)",
                  }}
                  aria-label={`${counts[tab.key]} items`}
                >
                  {counts[tab.key]}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Search + priority + sort */}
        <div style={{ padding: "12px 24px", borderBottom: "1px solid var(--tu-border)", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <input
            id="wo-search"
            className="tu-input"
            style={{ width: 280 }}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title, asset, account, assignee…"
            aria-label="Search work orders"
          />

          <select
            id="wo-priority"
            className="tu-select"
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value as PriorityFilter)}
            aria-label="Filter by priority"
          >
            <option value="ALL">All priorities</option>
            <option value="CRITICAL">Critical</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>

          <select
            id="wo-sort"
            className="tu-select"
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            aria-label="Sort work orders"
          >
            {SORT_OPTIONS.map((s) => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
          </select>

          {activeFilterCount > 0 && (
            <button type="button" className="tu-btn-secondary" onClick={resetFilters}>
              Clear filters
            </button>
          )}

          <span style={{ marginLeft: "auto", fontSize: 13, color: "var(--tu-text-subtle)" }}>
            {sorted.length} work order{sorted.length !== 1 ? "s" : ""}
          </span>
        </div>

        {view === "list" ? (
          <div id="wo-tabpanel" role="tabpanel" style={{ overflowX: "auto" }}>
            <table className="tu-table" aria-label="Work orders">
              <thead>
                <tr>
                  <th scope="col">Title</th>
                  <th scope="col">Account</th>
                  <th scope="col">Asset</th>
                  <th scope="col">Status</th>
                  <th scope="col">Priority</th>
                  <th scope="col">Due Date</th>
                  <th scope="col">Assigned To</th>
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
                ) : workOrders.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: "center", padding: "40px 24px", color: "var(--tu-text-body)", fontSize: 14 }}>
                      No work orders yet.
                    </td>
                  </tr>
                ) : sorted.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: "center", padding: "40px 24px", color: "var(--tu-text-body)", fontSize: 14 }}>
                      No work orders match these filters.
                    </td>
                  </tr>
                ) : (
                  sorted.map((wo) => {
                    const st = STATUS_BADGE[wo.status];
                    const pri = wo.priority ? PRIORITY_BADGE[wo.priority] : null;
                    const overdue = isOverdue(wo);
                    return (
                      <tr key={wo.id}>
                        <td className="tu-strong">
                          <Link
                            href={`/accounts/${wo.accountId}/work-orders/${wo.id}`}
                            style={{ color: "inherit", textDecoration: "none" }}
                            className="tu-row-link"
                          >
                            {wo.title}
                          </Link>
                          {wo.isSpecialProject && (
                            <span
                              className="tu-badge tu-badge-brand"
                              style={{ marginLeft: 6, fontSize: 10, padding: "1px 6px" }}
                              aria-label="Special project"
                            >
                              Special
                            </span>
                          )}
                        </td>
                        <td>
                          <Link href={`/accounts/${wo.accountId}`} className="tu-row-link" style={{ color: "var(--tu-text-brand)", textDecoration: "none" }}>
                            {wo.account.name}
                          </Link>
                        </td>
                        <td style={{ color: "var(--tu-text-body)" }}>
                          {wo.asset?.name ?? <span style={{ color: "var(--tu-text-subtle)" }}>—</span>}
                        </td>
                        <td><span className={st.cls}>{st.label}</span></td>
                        <td>
                          {pri ? <span className={pri.cls}>{wo.priority}</span> : <span style={{ color: "var(--tu-text-subtle)" }}>—</span>}
                        </td>
                        <td style={{ color: overdue ? "var(--tu-danger)" : "var(--tu-text-body)", fontWeight: overdue ? 500 : undefined }}>
                          {wo.dueDate ? <time dateTime={wo.dueDate}>{formatDate(wo.dueDate)}</time> : <span style={{ color: "var(--tu-text-subtle)" }}>—</span>}
                        </td>
                        <td style={{ color: "var(--tu-text-body)" }}>
                          {wo.assignments.length > 0
                            ? wo.assignments.map((a) => a.employee.name).join(", ")
                            : <span style={{ color: "var(--tu-text-subtle)" }}>Unassigned</span>}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div id="wo-tabpanel" role="tabpanel" style={{ padding: 20 }}>
            <WorkOrderCalendar
              orders={sorted}
              loading={loading}
              hrefFor={(wo) => `/accounts/${wo.accountId}/work-orders/${wo.id}`}
              tooltipFor={(wo) => `${wo.title} — ${wo.account.name}`}
            />
          </div>
        )}
      </div>
    </div>
  );
}
