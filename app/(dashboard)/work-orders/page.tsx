"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import api from "@/lib/api";
import WorkOrderCalendar from "@/components/WorkOrderCalendar";

type Account = { id: string; name: string };

type WorkOrder = {
  id: string;
  title: string;
  description: string | null;
  status: "REQUESTED" | "PENDING" | "IN_PROGRESS" | "COMPLETED" | "REJECTED";
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | null;
  dueDate: string | null;
  category: string | null;
  isSpecialProject: boolean;
  asset: { id: string; name: string } | null;
  assignments: { employee: { id: string; name: string; position: string } }[];
  createdAt: string;
};

// Work order tagged with the account it belongs to (for the all-accounts calendar).
type TaggedWorkOrder = WorkOrder & { accountId: string; accountName: string };

type StatusFilter = "ALL" | "OVERDUE" | WorkOrder["status"];
type View = "list" | "calendar";

const STATUS_TABS: { key: StatusFilter; label: string }[] = [
  { key: "ALL",         label: "All"         },
  { key: "OVERDUE",     label: "Overdue"     },
  { key: "REQUESTED",   label: "Requested"   },
  { key: "PENDING",     label: "Pending"     },
  { key: "IN_PROGRESS", label: "In Progress" },
  { key: "COMPLETED",   label: "Completed"   },
  { key: "REJECTED",    label: "Rejected"    },
];

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
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const searchParams = useSearchParams();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(() => parseStatusParam(searchParams.get("status")));
  const [view, setView] = useState<View>("list");
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [loadingWOs, setLoadingWOs] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Calendar (all accounts) state — fetched lazily the first time the view opens.
  const [calOrders, setCalOrders] = useState<TaggedWorkOrder[]>([]);
  const [calLoaded, setCalLoaded] = useState(false);
  const [calLoading, setCalLoading] = useState(false);
  const [calError, setCalError] = useState<string | null>(null);

  useEffect(() => {
    fetchAccounts();
  }, []);

  useEffect(() => {
    if (selectedAccountId) fetchWorkOrders(selectedAccountId);
  }, [selectedAccountId]);

  useEffect(() => {
    if (view === "calendar" && !calLoaded && !calLoading && accounts.length > 0) {
      fetchAllWorkOrders();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, calLoaded, calLoading, accounts]);

  async function fetchAccounts() {
    setLoadingAccounts(true);
    try {
      const res = await api.get("/accounts");
      const list: Account[] = res.data;
      setAccounts(list);
      if (list.length > 0) setSelectedAccountId(list[0].id);
    } catch {
      setError("Failed to load accounts.");
    } finally {
      setLoadingAccounts(false);
    }
  }

  async function fetchWorkOrders(accountId: string) {
    setLoadingWOs(true);
    setError(null);
    try {
      const res = await api.get(`/accounts/${accountId}/work-orders`);
      setWorkOrders(res.data);
    } catch {
      setError("Failed to load work orders.");
      setWorkOrders([]);
    } finally {
      setLoadingWOs(false);
    }
  }

  async function fetchAllWorkOrders() {
    setCalLoading(true);
    setCalError(null);
    try {
      const results = await Promise.all(
        accounts.map((a) =>
          api
            .get(`/accounts/${a.id}/work-orders`)
            .then((r) =>
              (r.data as WorkOrder[]).map((wo) => ({ ...wo, accountId: a.id, accountName: a.name }))
            )
            .catch(() => [] as TaggedWorkOrder[])
        )
      );
      setCalOrders(results.flat());
      setCalLoaded(true);
    } catch {
      setCalError("Failed to load work orders.");
    } finally {
      setCalLoading(false);
    }
  }

  const matchesFilter = (wo: WorkOrder, key: StatusFilter) =>
    key === "ALL" ? true : key === "OVERDUE" ? isOverdue(wo) : wo.status === key;

  const filtered = workOrders.filter((wo) => matchesFilter(wo, statusFilter));

  const counts = STATUS_TABS.reduce<Record<StatusFilter, number>>(
    (acc, tab) => {
      acc[tab.key] = workOrders.filter((wo) => matchesFilter(wo, tab.key)).length;
      return acc;
    },
    {} as Record<StatusFilter, number>
  );

  // Status-filtered orders for the calendar (all accounts).
  const calFiltered = useMemo(
    () => calOrders.filter((wo) => matchesFilter(wo, statusFilter)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [calOrders, statusFilter]
  );

  return (
    <div className="tu-page">
      {/* Page header */}
      <div className="tu-page-header">
        <div>
          <h1 className="tu-page-title">Work Orders</h1>
          <p className="tu-page-sub">Manage and track maintenance tasks</p>
        </div>

        <div style={{ display: "flex", gap: 16, alignItems: "flex-end" }}>
          {/* View toggle */}
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

          {/* Account selector — list view only (calendar shows all accounts) */}
          {view === "list" && !loadingAccounts && accounts.length > 0 && (
            <div>
              <label htmlFor="account-select" className="tu-select-label">Account</label>
              <select
                id="account-select"
                className="tu-select"
                value={selectedAccountId}
                onChange={(e) => setSelectedAccountId(e.target.value)}
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Error banner */}
      {(error || calError) && (
        <div className="tu-error-banner" role="alert">{view === "calendar" ? calError : error}</div>
      )}

      {/* Card with tabs + content */}
      <div className="tu-card">
        {/* Status tabs (shared by both views) */}
        <div className="tu-tab-group" role="tablist" aria-label="Filter by status">
          {STATUS_TABS.map((tab) => {
            const count = view === "calendar"
              ? calOrders.filter((wo) => matchesFilter(wo, tab.key)).length
              : counts[tab.key];
            return (
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
                {count > 0 && (
                  <span
                    style={{
                      marginLeft: 6,
                      fontSize: 11,
                      fontWeight: 600,
                      color: statusFilter === tab.key ? "var(--tu-text-brand)" : "var(--tu-text-subtle)",
                    }}
                    aria-label={`${count} items`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {view === "list" ? (
          /* ── List view ─────────────────────────────────── */
          <div id="wo-tabpanel" role="tabpanel" style={{ overflowX: "auto" }}>
            <table className="tu-table" aria-label="Work orders">
              <thead>
                <tr>
                  <th scope="col">Title</th>
                  <th scope="col">Asset</th>
                  <th scope="col">Status</th>
                  <th scope="col">Priority</th>
                  <th scope="col">Due Date</th>
                  <th scope="col">Assigned To</th>
                </tr>
              </thead>
              <tbody>
                {loadingAccounts || loadingWOs ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i} aria-hidden="true">
                      {Array.from({ length: 6 }).map((__, j) => (
                        <td key={j} style={{ padding: "14px 24px" }}>
                          <div className="tu-skeleton" style={{ height: 14, borderRadius: 4 }} />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : accounts.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: "center", padding: "40px 24px", color: "var(--tu-text-body)", fontSize: 14 }}>
                      No accounts found.
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: "center", padding: "40px 24px", color: "var(--tu-text-body)", fontSize: 14 }}>
                      {statusFilter === "ALL"
                        ? "No work orders for this account."
                        : `No ${statusFilter.replace("_", " ").toLowerCase()} work orders.`}
                    </td>
                  </tr>
                ) : (
                  filtered.map((wo) => {
                    const st = STATUS_BADGE[wo.status];
                    const pri = wo.priority ? PRIORITY_BADGE[wo.priority] : null;
                    const overdue = wo.dueDate && new Date(wo.dueDate) < new Date() && wo.status !== "COMPLETED";
                    return (
                      <tr key={wo.id}>
                        <td className="tu-strong">
                          <Link
                            href={`/accounts/${selectedAccountId}/work-orders/${wo.id}`}
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
                        <td style={{ color: "var(--tu-text-body)" }}>
                          {wo.asset?.name ?? <span style={{ color: "var(--tu-text-subtle)" }}>—</span>}
                        </td>
                        <td>
                          <span className={st.cls}>{st.label}</span>
                        </td>
                        <td>
                          {pri ? (
                            <span className={pri.cls}>{wo.priority}</span>
                          ) : (
                            <span style={{ color: "var(--tu-text-subtle)" }}>—</span>
                          )}
                        </td>
                        <td style={{ color: overdue ? "#C70036" : "var(--tu-text-body)", fontWeight: overdue ? 500 : undefined }}>
                          {wo.dueDate ? (
                            <time dateTime={wo.dueDate}>
                              {formatDate(wo.dueDate)}
                            </time>
                          ) : (
                            <span style={{ color: "var(--tu-text-subtle)" }}>—</span>
                          )}
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
          /* ── Calendar view (all accounts, by due date) ──── */
          <div id="wo-tabpanel" role="tabpanel" style={{ padding: 20 }}>
            <WorkOrderCalendar
              orders={calFiltered}
              loading={calLoading && !calLoaded}
              hrefFor={(wo) => `/accounts/${wo.accountId}/work-orders/${wo.id}`}
              tooltipFor={(wo) => `${wo.title} — ${wo.accountName}`}
            />
          </div>
        )}
      </div>
    </div>
  );
}
