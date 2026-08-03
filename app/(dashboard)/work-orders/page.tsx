"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import api, { getServerClockOffset } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import WorkOrderCalendar from "@/components/WorkOrderCalendar";
import AccountFilter from "@/components/AccountFilter";
import RowMenu from "@/components/RowMenu";
import { EmptyRow } from "@/components/EmptyState";

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
  estimatedMinutes: number | null;
  actualSeconds: number;
  timerStartedAt: string | null;
  accountId: string;
  account: Account;
  asset: { id: string; name: string } | null;
  assignments: { employee: { id: string; name: string; position: string } }[];
  createdAt: string;
};

type StatusFilter = "ALL" | "OVERDUE" | WorkOrder["status"];
type PriorityFilter = "ALL" | NonNullable<WorkOrder["priority"]>;
type SortKey = "SMART" | "NEWEST" | "OLDEST" | "DUE_SOON" | "PRIORITY" | "TITLE" | "ACCOUNT";
type View = "list" | "calendar";

const STATUS_TABS: { key: StatusFilter; label: string }[] = [
  { key: "ALL",         label: "All"         },
  { key: "OVERDUE",     label: "Overdue"     },
  { key: "REQUESTED",   label: "Requested"   },
  { key: "PENDING",     label: "Accepted"    },
  { key: "IN_PROGRESS", label: "In Progress" },
  { key: "ON_HOLD",     label: "On Hold"     },
  { key: "COMPLETED",   label: "Completed"   },
  { key: "REJECTED",    label: "Rejected"    },
];

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "SMART",    label: "Smart (urgency)"   },
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

const isTerminal = (wo: WorkOrder) => wo.status === "COMPLETED" || wo.status === "REJECTED";

// "Smart" triage sort: closed orders sink; among open ones rank by priority
// (Critical first), then overdue-first, then soonest due, then newest.
function smartCompare(a: WorkOrder, b: WorkOrder) {
  const term = (isTerminal(a) ? 1 : 0) - (isTerminal(b) ? 1 : 0);
  if (term !== 0) return term;

  const prio = (b.priority ? PRIORITY_RANK[b.priority] : 0) - (a.priority ? PRIORITY_RANK[a.priority] : 0);
  if (prio !== 0) return prio;

  const overdue = (isOverdue(a) ? 0 : 1) - (isOverdue(b) ? 0 : 1);
  if (overdue !== 0) return overdue;

  if (a.dueDate || b.dueDate) {
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    const due = new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    if (due !== 0) return due;
  }

  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
}

// One tone per status so the column is scannable; mirrors lib/statuses.ts.
const STATUS_BADGE: Record<WorkOrder["status"], { cls: string; label: string }> = {
  REQUESTED:   { cls: "tu-badge tu-badge-warning", label: "Requested"   },
  PENDING:     { cls: "tu-badge tu-badge-info",    label: "Accepted"    },
  IN_PROGRESS: { cls: "tu-badge tu-badge-brand",   label: "In Progress" },
  ON_HOLD:     { cls: "tu-badge tu-badge-neutral", label: "On Hold"     },
  COMPLETED:   { cls: "tu-badge tu-badge-success", label: "Completed"   },
  REJECTED:    { cls: "tu-badge tu-badge-danger",  label: "Rejected"    },
};

const PRIORITY_BADGE: Record<NonNullable<WorkOrder["priority"]>, { cls: string }> = {
  LOW:      { cls: "tu-badge tu-badge-neutral" },
  MEDIUM:   { cls: "tu-badge tu-badge-warning" },
  HIGH:     { cls: "tu-badge tu-badge-danger"  },
  CRITICAL: { cls: "tu-badge tu-badge-danger"  },
};

function IconSearch() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

// Columns that map onto an existing sort key, so the header can drive the same
// state as the dropdown instead of duplicating the sort logic.
const COLUMN_SORT: Partial<Record<string, SortKey>> = {
  Title: "TITLE",
  Account: "ACCOUNT",
  Priority: "PRIORITY",
  "Due Date": "DUE_SOON",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// Man-hours as a compact "Nh Nm" string.
function formatHM(minutes: number) {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (h && rem) return `${h}h ${rem}m`;
  if (h) return `${h}h`;
  return `${rem}m`;
}

export default function WorkOrdersPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const isClient = user?.role === "CLIENT";

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [timerBusyId, setTimerBusyId] = useState<string | null>(null);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedAccounts, setSelectedAccounts] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(() => parseStatusParam(searchParams.get("status")));
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>("ALL");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("SMART");
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
        case "SMART":
          return smartCompare(a, b);
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

  async function toggleTimer(wo: WorkOrder) {
    setTimerBusyId(wo.id);
    try {
      const action = wo.timerStartedAt ? "pause" : "resume";
      const res = await api.post(`/work-orders/${wo.id}/timer`, { action });
      // Merge: the timer response omits `account`, which the table needs.
      setWorkOrders((prev) => prev.map((o) => (o.id === wo.id ? { ...o, ...res.data } : o)));
    } catch {
      // silent
    } finally {
      setTimerBusyId(null);
    }
  }

  return (
    <div className="tu-page">
      <div className="tu-page-header">
        <div>
          <h1 className="tu-page-title">Work Orders</h1>
          <p className="tu-page-sub">Maintenance tasks across all your accounts</p>
        </div>

        <div style={{ display: "flex", gap: 16, alignItems: "flex-end" }}>
          <div className="tu-segmented" role="tablist" aria-label="View">
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
                className={view === v.key ? "tu-active" : undefined}
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
                <span className="tu-tab-count" aria-label={`${counts[tab.key]} items`}>
                  {counts[tab.key]}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Search + priority + sort */}
        <div className="tu-toolbar tu-toolbar-inset">
          <label className="tu-search" style={{ width: 280 }}>
            <span className="tu-search-icon"><IconSearch /></span>
            <input
              id="wo-search"
              className="tu-input"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search title, asset, account, assignee…"
              aria-label="Search work orders"
            />
          </label>

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

          <span className="tu-toolbar-spacer tu-result-count">
            {sorted.length} work order{sorted.length !== 1 ? "s" : ""}
          </span>
        </div>

        {view === "list" ? (
          <div id="wo-tabpanel" role="tabpanel" style={{ overflowX: "auto" }}>
            <table className="tu-table tu-table-interactive" aria-label="Work orders">
              <thead>
                <tr>
                  {["Title", "Account", "Asset", "Status", "Priority", "Due Date", "Man-Hours", "Assigned To"].map((col) => {
                    const key = COLUMN_SORT[col];
                    if (!key) {
                      return (
                        <th key={col} scope="col" title={col === "Man-Hours" ? "Actual logged / Estimated" : undefined}>
                          {col}
                        </th>
                      );
                    }
                    const active = sortKey === key;
                    return (
                      <th key={col} scope="col" aria-sort={active ? "ascending" : "none"}>
                        <button
                          type="button"
                          className={`tu-th-sort${active ? " tu-active" : ""}`}
                          onClick={() => setSortKey(key)}
                          title={`Sort by ${col.toLowerCase()}`}
                        >
                          {col}
                          <span className="tu-th-arrow" aria-hidden="true">{active ? "\u2191" : ""}</span>
                        </button>
                      </th>
                    );
                  })}
                  <th scope="col"><span className="tu-sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i} aria-hidden="true">
                      {Array.from({ length: 9 }).map((__, j) => (
                        <td key={j} style={{ padding: "14px 24px" }}>
                          <div className="tu-skeleton" style={{ height: 14, borderRadius: 4 }} />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : workOrders.length === 0 ? (
                  <EmptyRow
                    colSpan={9}
                    icon="workOrder"
                    title="No work orders yet"
                    hint="Work orders raised on any of your accounts will appear here."
                  />
                ) : sorted.length === 0 ? (
                  <EmptyRow
                    colSpan={9}
                    icon="search"
                    title="No matching work orders"
                    hint="Nothing matches the current filters."
                    action={
                      <button type="button" className="tu-btn-secondary tu-btn-sm" onClick={resetFilters}>
                        Clear filters
                      </button>
                    }
                  />
                ) : (
                  sorted.map((wo) => {
                    const st = STATUS_BADGE[wo.status];
                    const pri = wo.priority ? PRIORITY_BADGE[wo.priority] : null;
                    const overdue = isOverdue(wo);
                    return (
                      <tr
                        key={wo.id}
                        onClick={() => router.push(`/accounts/${wo.accountId}/work-orders/${wo.id}`)}
                      >
                        <td className="tu-strong">
                          <Link
                            href={`/accounts/${wo.accountId}/work-orders/${wo.id}`}
                            className="tu-row-link"
                            onClick={(e) => e.stopPropagation()}
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
                          <Link
                            href={`/accounts/${wo.accountId}`}
                            className="tu-row-link tu-row-link-brand"
                            onClick={(e) => e.stopPropagation()}
                          >
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
                        <td>
                          {wo.dueDate ? (
                            overdue ? (
                              // Colour alone was carrying this (and was broken);
                              // the pill states it outright and survives greyscale.
                              <span className="tu-badge tu-badge-danger" title="Past due">
                                <time dateTime={wo.dueDate}>{formatDate(wo.dueDate)}</time>
                              </span>
                            ) : (
                              <time dateTime={wo.dueDate} style={{ color: "var(--tu-text-body)" }}>{formatDate(wo.dueDate)}</time>
                            )
                          ) : (
                            <span className="tu-figure-zero">—</span>
                          )}
                        </td>
                        <td style={{ whiteSpace: "nowrap" }}>
                          {(() => {
                            const est = wo.estimatedMinutes;
                            const running = wo.timerStartedAt != null;
                            const actualMin =
                              wo.actualSeconds / 60 +
                              (running ? (Date.now() + getServerClockOffset() - new Date(wo.timerStartedAt!).getTime()) / 60000 : 0);
                            const hasActual = wo.actualSeconds > 0 || running;
                            if (est == null && !hasActual) {
                              return <span className="tu-figure-zero">—</span>;
                            }
                            const over = est != null && actualMin > est;
                            return (
                              <span className={`tu-timer${running ? " tu-timer-running" : over ? " tu-timer-over" : ""}`}>
                                {running && <span className="tu-timer-dot" aria-hidden="true" />}
                                <span>{hasActual ? formatHM(actualMin) : "0m"}</span>
                                {est != null && <span className="tu-timer-est">/ {formatHM(est)}</span>}
                              </span>
                            );
                          })()}
                          {wo.status === "IN_PROGRESS" && !isClient && (
                            <button
                              onClick={() => toggleTimer(wo)}
                              disabled={timerBusyId === wo.id}
                              title={wo.timerStartedAt ? "Pause timer" : "Resume timer"}
                              className={`tu-timer-btn ${wo.timerStartedAt ? "tu-timer-btn-pause" : "tu-timer-btn-resume"}`}
                              style={{ marginLeft: 8 }}
                            >
                              {timerBusyId === wo.id ? "…" : wo.timerStartedAt ? "❚❚ Pause" : "▶ Resume"}
                            </button>
                          )}
                        </td>
                        <td style={{ color: "var(--tu-text-body)" }}>
                          {wo.assignments.length > 0
                            ? wo.assignments.map((a) => a.employee.name).join(", ")
                            : <span className="tu-figure-zero">Unassigned</span>}
                        </td>
                        <td className="tu-menu-cell">
                          <RowMenu
                            label={wo.title}
                            actions={[
                              { label: "Open work order", onSelect: () => router.push(`/accounts/${wo.accountId}/work-orders/${wo.id}`) },
                              { label: "Open account", onSelect: () => router.push(`/accounts/${wo.accountId}`) },
                              ...(wo.asset
                                ? [{ label: "View asset", onSelect: () => router.push(`/accounts/${wo.accountId}/assets/${wo.asset!.id}`) }]
                                : []),
                            ]}
                          />
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
