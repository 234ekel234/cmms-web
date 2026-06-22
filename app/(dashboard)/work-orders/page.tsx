"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import api from "@/lib/api";

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

type StatusFilter = "ALL" | WorkOrder["status"];

const STATUS_TABS: { key: StatusFilter; label: string }[] = [
  { key: "ALL",         label: "All"         },
  { key: "REQUESTED",   label: "Requested"   },
  { key: "PENDING",     label: "Pending"     },
  { key: "IN_PROGRESS", label: "In Progress" },
  { key: "COMPLETED",   label: "Completed"   },
  { key: "REJECTED",    label: "Rejected"    },
];

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
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [loadingWOs, setLoadingWOs] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAccounts();
  }, []);

  useEffect(() => {
    if (selectedAccountId) fetchWorkOrders(selectedAccountId);
  }, [selectedAccountId]);

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

  const filtered =
    statusFilter === "ALL"
      ? workOrders
      : workOrders.filter((wo) => wo.status === statusFilter);

  const counts = STATUS_TABS.reduce<Record<StatusFilter, number>>(
    (acc, tab) => {
      acc[tab.key] =
        tab.key === "ALL"
          ? workOrders.length
          : workOrders.filter((wo) => wo.status === tab.key).length;
      return acc;
    },
    {} as Record<StatusFilter, number>
  );

  return (
    <div className="tu-page">
      {/* Page header */}
      <div className="tu-page-header">
        <div>
          <h1 className="tu-page-title">Work Orders</h1>
          <p className="tu-page-sub">Manage and track maintenance tasks</p>
        </div>

        {/* Account selector */}
        {!loadingAccounts && accounts.length > 0 && (
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

      {/* Error banner */}
      {error && (
        <div className="tu-error-banner" role="alert">{error}</div>
      )}

      {/* Card with tabs + table */}
      <div className="tu-card">
        {/* Status tabs */}
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

        {/* Table */}
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
      </div>
    </div>
  );
}
