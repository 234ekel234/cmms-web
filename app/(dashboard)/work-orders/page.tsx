"use client";

import { useEffect, useMemo, useState } from "react";
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

// Work order tagged with the account it belongs to (for the all-accounts calendar).
type TaggedWorkOrder = WorkOrder & { accountId: string; accountName: string };

type StatusFilter = "ALL" | WorkOrder["status"];
type View = "list" | "calendar";

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

// Chip colors for the calendar, one per status.
const CALENDAR_STATUS: Record<WorkOrder["status"], { bg: string; fg: string; label: string }> = {
  REQUESTED:   { bg: "#eef6ff", fg: "#1447e6", label: "Requested"   },
  PENDING:     { bg: "#fef3c7", fg: "#92400e", label: "Pending"     },
  IN_PROGRESS: { bg: "#dbeafe", fg: "#1d4ed8", label: "In Progress" },
  COMPLETED:   { bg: "#dcfce7", fg: "#166534", label: "Completed"   },
  REJECTED:    { bg: "#fee2e2", fg: "#991b1b", label: "Rejected"    },
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// Local (not UTC) yyyy-mm-dd key so calendar buckets line up with the displayed grid.
function dateKey(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// 6×7 grid of dates covering the month that `cursor` falls in, padded with
// trailing/leading days from adjacent months.
function monthMatrix(cursor: Date): Date[] {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay()); // back up to Sunday
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

export default function WorkOrdersPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [view, setView] = useState<View>("list");
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [loadingWOs, setLoadingWOs] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Calendar (all accounts) state — fetched lazily the first time the view opens.
  const [calOrders, setCalOrders] = useState<TaggedWorkOrder[]>([]);
  const [calLoaded, setCalLoaded] = useState(false);
  const [calLoading, setCalLoading] = useState(false);
  const [calError, setCalError] = useState<string | null>(null);
  const [cursor, setCursor] = useState(() => new Date());

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

  // ── Calendar derived data ────────────────────────────────
  const calFiltered = useMemo(
    () => (statusFilter === "ALL" ? calOrders : calOrders.filter((wo) => wo.status === statusFilter)),
    [calOrders, statusFilter]
  );

  const ordersByDay = useMemo(() => {
    const map = new Map<string, TaggedWorkOrder[]>();
    for (const wo of calFiltered) {
      if (!wo.dueDate) continue;
      const key = dateKey(new Date(wo.dueDate));
      const bucket = map.get(key);
      if (bucket) bucket.push(wo);
      else map.set(key, [wo]);
    }
    return map;
  }, [calFiltered]);

  const noDueDateCount = calFiltered.filter((wo) => !wo.dueDate).length;
  const cells = useMemo(() => monthMatrix(cursor), [cursor]);
  const todayKey = dateKey(new Date());
  const monthLabel = cursor.toLocaleDateString("en-US", { month: "long", year: "numeric" });

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
              ? (tab.key === "ALL" ? calOrders.length : calOrders.filter((wo) => wo.status === tab.key).length)
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
            {/* Month nav */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--tu-text-heading)", margin: 0 }}>{monthLabel}</h2>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" onClick={() => setCursor(new Date())} style={calNavBtn} aria-label="Go to current month">Today</button>
                <button type="button" onClick={() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() - 1, 1))} style={calNavBtn} aria-label="Previous month">‹</button>
                <button type="button" onClick={() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + 1, 1))} style={calNavBtn} aria-label="Next month">›</button>
              </div>
            </div>

            {calLoading && !calLoaded ? (
              <div className="tu-skeleton" style={{ height: 560, borderRadius: 8 }} aria-label="Loading calendar" />
            ) : (
              <>
                {/* Weekday header */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", borderTop: "1px solid var(--tu-border)", borderLeft: "1px solid var(--tu-border)" }}>
                  {WEEKDAYS.map((d) => (
                    <div key={d} style={{ padding: "8px 10px", fontSize: 11, fontWeight: 700, color: "var(--tu-text-subtle)", textTransform: "uppercase", letterSpacing: 0.4, borderRight: "1px solid var(--tu-border)", borderBottom: "1px solid var(--tu-border)", background: "var(--tu-bg-secondary)" }}>
                      {d}
                    </div>
                  ))}
                </div>

                {/* Day grid */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", borderLeft: "1px solid var(--tu-border)" }}>
                  {cells.map((d) => {
                    const key = dateKey(d);
                    const inMonth = d.getMonth() === cursor.getMonth();
                    const isToday = key === todayKey;
                    const dayOrders = ordersByDay.get(key) ?? [];
                    return (
                      <div
                        key={key}
                        style={{
                          minHeight: 104,
                          padding: 6,
                          borderRight: "1px solid var(--tu-border)",
                          borderBottom: "1px solid var(--tu-border)",
                          background: inMonth ? "var(--tu-bg-surface)" : "var(--tu-bg-secondary)",
                          opacity: inMonth ? 1 : 0.55,
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 4 }}>
                          <span
                            style={{
                              fontSize: 12,
                              fontWeight: isToday ? 700 : 500,
                              color: isToday ? "#fff" : "var(--tu-text-body)",
                              background: isToday ? "var(--tu-text-brand)" : "transparent",
                              borderRadius: 999,
                              minWidth: 20,
                              height: 20,
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              padding: "0 5px",
                            }}
                          >
                            {d.getDate()}
                          </span>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                          {dayOrders.slice(0, 3).map((wo) => {
                            const c = CALENDAR_STATUS[wo.status];
                            return (
                              <Link
                                key={wo.id}
                                href={`/accounts/${wo.accountId}/work-orders/${wo.id}`}
                                title={`${wo.title} — ${wo.accountName} (${c.label})`}
                                style={{
                                  display: "block",
                                  fontSize: 11,
                                  fontWeight: 600,
                                  lineHeight: 1.3,
                                  padding: "2px 6px",
                                  borderRadius: 4,
                                  background: c.bg,
                                  color: c.fg,
                                  textDecoration: "none",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {wo.title}
                              </Link>
                            );
                          })}
                          {dayOrders.length > 3 && (
                            <span style={{ fontSize: 10, fontWeight: 600, color: "var(--tu-text-subtle)", paddingLeft: 4 }}>
                              +{dayOrders.length - 3} more
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Legend + no-due-date note */}
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 14, marginTop: 14 }}>
                  {(Object.keys(CALENDAR_STATUS) as WorkOrder["status"][]).map((s) => (
                    <span key={s} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--tu-text-body)" }}>
                      <span style={{ width: 12, height: 12, borderRadius: 3, background: CALENDAR_STATUS[s].bg, border: `1px solid ${CALENDAR_STATUS[s].fg}33` }} />
                      {CALENDAR_STATUS[s].label}
                    </span>
                  ))}
                  {noDueDateCount > 0 && (
                    <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--tu-text-subtle)" }}>
                      {noDueDateCount} work order{noDueDateCount !== 1 ? "s" : ""} with no due date (not shown)
                    </span>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const calNavBtn: React.CSSProperties = {
  minWidth: 34,
  height: 34,
  padding: "0 10px",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
  borderRadius: 8,
  border: "1px solid var(--tu-border)",
  background: "var(--tu-bg-surface)",
  color: "var(--tu-text-body)",
};
