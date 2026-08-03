"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import api, { getServerClockOffset } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import WorkOrderCalendar from "@/components/WorkOrderCalendar";
import StatusPipeline from "@/components/StatusPipeline";
import { WORK_ORDER_CATEGORIES } from "@/lib/workOrderCategories";
import EmptyState from "@/components/EmptyState";

type WorkOrderStatus = "REQUESTED" | "PENDING" | "IN_PROGRESS" | "ON_HOLD" | "COMPLETED" | "REJECTED";
type WorkOrderPriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

type WorkOrder = {
  id: string;
  title: string;
  description: string | null;
  status: WorkOrderStatus;
  priority: WorkOrderPriority;
  category: string | null;
  dueDate: string | null;
  isSpecialProject: boolean;
  type: "INTERNAL" | "EXTERNAL";
  estimatedMinutes: number | null;
  actualSeconds: number;
  timerStartedAt: string | null;
  createdAt: string;
  asset: { id: string; name: string } | null;
  assignments: { employeeId: string; employee: { id: string; name: string } }[];
};

type AccountEmployee = { id: string; name: string; position: string | null };

// Pills reuse the theme-aware .tu-badge-* variants so they track dark mode.
// Labels stay local: this workspace calls PENDING "Accepted" to match the
// pipeline wording, which differs from the global label in lib/statuses.ts.
const STATUS_CONFIG: Record<WorkOrderStatus, { label: string; cls: string }> = {
  REQUESTED:   { label: "Requested",   cls: "tu-badge tu-badge-brand" },
  PENDING:     { label: "Accepted",    cls: "tu-badge tu-badge-brand" },
  IN_PROGRESS: { label: "In Progress", cls: "tu-badge tu-badge-warning" },
  ON_HOLD:     { label: "On Hold",     cls: "tu-badge tu-badge-neutral" },
  COMPLETED:   { label: "Completed",   cls: "tu-badge tu-badge-success" },
  REJECTED:    { label: "Rejected",    cls: "tu-badge tu-badge-danger" },
};

const PRIORITY_CONFIG: Record<WorkOrderPriority, { label: string; cls: string }> = {
  LOW:      { label: "Low",      cls: "tu-badge tu-badge-neutral" },
  MEDIUM:   { label: "Medium",   cls: "tu-badge tu-badge-brand" },
  HIGH:     { label: "High",     cls: "tu-badge tu-badge-warning" },
  CRITICAL: { label: "Critical", cls: "tu-badge tu-badge-danger" },
};

const STATUS_ORDER: WorkOrderStatus[] = ["REQUESTED", "PENDING", "IN_PROGRESS", "ON_HOLD", "COMPLETED", "REJECTED"];

// Highest first, so Critical rises to the top of a priority-based sort.
const PRIORITY_RANK: Record<WorkOrderPriority, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };

type SortKey = "SMART" | "STATUS" | "NEWEST" | "DUE_SOON" | "PRIORITY" | "TITLE";
const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "SMART",    label: "Smart (urgency)" },
  { key: "STATUS",   label: "Status"          },
  { key: "NEWEST",   label: "Newest"          },
  { key: "DUE_SOON", label: "Due soonest"     },
  { key: "PRIORITY", label: "Priority"        },
  { key: "TITLE",    label: "Title A–Z"       },
];

const isTerminal = (o: WorkOrder) => o.status === "COMPLETED" || o.status === "REJECTED";

// Allowed status transitions a manager/supervisor can apply from each state.
const TRANSITIONS: Record<WorkOrderStatus, WorkOrderStatus[]> = {
  REQUESTED: ["PENDING", "REJECTED"],
  PENDING: ["IN_PROGRESS", "REJECTED"],
  IN_PROGRESS: ["COMPLETED", "PENDING", "ON_HOLD"],
  ON_HOLD: ["IN_PROGRESS", "REJECTED"],
  COMPLETED: [],
  REJECTED: [],
};

const PIPELINE_STEPS = ["Requested", "Accepted", "In Progress", "Completed"];

const EMPTY_FORM = {
  title: "",
  description: "",
  priority: "MEDIUM" as WorkOrderPriority,
  category: "",
  dueDate: "",
  assetId: "",
  estHours: "",
  estMinutes: "",
  isSpecialProject: false,
  isBreakdown: false,
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

// Live timer display, H:MM:SS.
function formatTimer(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export default function WorkOrdersPage() {
  const params = useParams();
  const accountId = params.accountId as string;
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [statusFilter, setStatusFilter] = useState<WorkOrderStatus | "ALL" | "OVERDUE">(() => {
    const raw = searchParams.get("status")?.toUpperCase();
    const valid = ["OVERDUE", "REQUESTED", "PENDING", "IN_PROGRESS", "ON_HOLD", "COMPLETED", "REJECTED"];
    return raw && valid.includes(raw) ? (raw as WorkOrderStatus | "OVERDUE") : "ALL";
  });
  const [view, setView] = useState<"work" | "special">("work");
  const [sortKey, setSortKey] = useState<SortKey>("SMART");
  const [mode, setMode] = useState<"list" | "calendar">("list");
  // An `assetId` query param means we arrived from an asset page's "New Work
  // Order" action, so open the form with that asset already selected.
  const [showForm, setShowForm] = useState(() => !!searchParams.get("assetId"));
  const [form, setForm] = useState({ ...EMPTY_FORM, assetId: searchParams.get("assetId") ?? "" });
  const [assets, setAssets] = useState<{ id: string; name: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  // Inline employee assignment (modal opened from a work-order row)
  const [assigningOrder, setAssigningOrder] = useState<WorkOrder | null>(null);
  const [employees, setEmployees] = useState<AccountEmployee[]>([]);
  const [employeesLoading, setEmployeesLoading] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [assignError, setAssignError] = useState("");
  const [timerBusyId, setTimerBusyId] = useState<string | null>(null);

  // Ticks once a second so running work-order timers stay live — but only while
  // at least one order is actually IN_PROGRESS with a running timer.
  const [nowTick, setNowTick] = useState(() => Date.now());

  const isClient = user?.role === "CLIENT";
  const canManage = user?.role === "GENERAL_MANAGER" || user?.role === "MANAGER" || user?.role === "SUPERVISOR";
  const isManager = user?.role === "GENERAL_MANAGER" || user?.role === "MANAGER";

  useEffect(() => { fetchOrders(); }, [accountId]);

  useEffect(() => {
    const anyRunning = orders.some((o) => o.status === "IN_PROGRESS" && o.timerStartedAt);
    if (!anyRunning) return;
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [orders]);

  useEffect(() => {
    api
      .get(`/accounts/${accountId}/assets`)
      .then((res) => setAssets(res.data))
      .catch(() => setAssets([]));
  }, [accountId]);

  async function fetchOrders() {
    setLoading(true);
    setError(false);
    try {
      const res = await api.get(`/accounts/${accountId}/work-orders`);
      setOrders(res.data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  async function openAssignModal(order: WorkOrder) {
    setAssigningOrder(order);
    setAssignError("");
    if (employees.length === 0) {
      setEmployeesLoading(true);
      try {
        const res = await api.get(`/accounts/${accountId}/employees`);
        setEmployees(res.data);
      } catch {
        setAssignError("Failed to load employees.");
      } finally {
        setEmployeesLoading(false);
      }
    }
  }

  // Assign on click, unassign on click-again — mirrors the mobile Orders tab.
  async function toggleAssignment(order: WorkOrder, emp: AccountEmployee) {
    if (togglingId) return;
    const assigned = order.assignments.some((a) => a.employeeId === emp.id);
    setTogglingId(emp.id);
    setAssignError("");
    try {
      let assignments: WorkOrder["assignments"];
      if (assigned) {
        await api.delete(`/work-orders/${order.id}/assignments/${emp.id}`);
        assignments = order.assignments.filter((a) => a.employeeId !== emp.id);
      } else {
        const res = await api.post(`/work-orders/${order.id}/assignments`, { employeeId: emp.id });
        assignments = [...order.assignments, res.data];
      }
      const updated = { ...order, assignments };
      setOrders((prev) => prev.map((o) => (o.id === order.id ? updated : o)));
      setAssigningOrder(updated);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setAssignError(e?.response?.data?.error ?? `Failed to ${assigned ? "remove" : "assign"} ${emp.name}.`);
    } finally {
      setTogglingId(null);
    }
  }

  async function createWorkOrder() {
    if (!form.title.trim()) { setFormError("Title is required."); return; }

    const hrs = form.estHours.trim() === "" ? 0 : parseInt(form.estHours, 10);
    const mins = form.estMinutes.trim() === "" ? 0 : parseInt(form.estMinutes, 10);
    if (isNaN(hrs) || isNaN(mins) || hrs < 0 || mins < 0 || mins > 59) {
      setFormError("Enter valid expected hours and minutes (0–59).");
      return;
    }
    const estimatedMinutes = hrs * 60 + mins;

    setFormError("");
    setSaving(true);
    try {
      const res = await api.post(`/accounts/${accountId}/work-orders`, {
        title: form.title.trim(),
        description: form.description.trim() || null,
        assetId: form.assetId || null,
        priority: form.priority,
        category: form.category.trim() || null,
        dueDate: form.dueDate || null,
        estimatedMinutes: estimatedMinutes > 0 ? estimatedMinutes : null,
        isSpecialProject: form.isSpecialProject,
        isBreakdown: form.isBreakdown,
      });
      setOrders((prev) => [res.data, ...prev]);
      setShowForm(false);
      setForm({ ...EMPTY_FORM });
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setFormError(e?.response?.data?.error ?? "Failed to create work order.");
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(id: string, status: WorkOrderStatus) {
    try {
      const res = await api.patch(`/work-orders/${id}`, { status });
      setOrders((prev) => prev.map((o) => (o.id === id ? res.data : o)));
    } catch {
      // silent
    }
  }

  async function toggleTimer(order: WorkOrder) {
    setTimerBusyId(order.id);
    try {
      const action = order.timerStartedAt ? "pause" : "resume";
      const res = await api.post(`/work-orders/${order.id}/timer`, { action });
      // Merge so any field the timer response omits is preserved.
      setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, ...res.data } : o)));
    } catch {
      // silent
    } finally {
      setTimerBusyId(null);
    }
  }

  const inView = orders.filter((o) => view === "special" ? o.isSpecialProject : !o.isSpecialProject);
  const now = new Date();
  const isOverdue = (o: WorkOrder) => !!o.dueDate && o.status !== "COMPLETED" && o.status !== "REJECTED" && new Date(o.dueDate) < now;
  const overdueCount = inView.filter(isOverdue).length;
  const filtered =
    statusFilter === "ALL"
      ? inView
      : statusFilter === "OVERDUE"
      ? inView.filter(isOverdue)
      : inView.filter((o) => o.status === statusFilter);
  const sorted = [...filtered].sort((a, b) => {
    switch (sortKey) {
      case "STATUS":
        return STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status);
      case "NEWEST":
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      case "DUE_SOON":
        if (!a.dueDate && !b.dueDate) return 0;
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      case "PRIORITY":
        return PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority];
      case "TITLE":
        return a.title.localeCompare(b.title);
      case "SMART":
      default: {
        // Closed orders sink; among open ones: priority, then overdue-first,
        // then soonest due, then newest.
        const term = (isTerminal(a) ? 1 : 0) - (isTerminal(b) ? 1 : 0);
        if (term !== 0) return term;
        const prio = PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority];
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
    }
  });
  const workCount = orders.filter((o) => !o.isSpecialProject).length;
  const specialCount = orders.filter((o) => o.isSpecialProject).length;

  return (
    <div className="tu-page">
      {/* Header */}
      <div className="tu-page-header" style={{ marginBottom: 20 }}>
        <div>
          <h2 className="tu-page-title">{mode === "calendar" ? "Calendar" : view === "special" ? "Special Projects" : "Work Orders"}</h2>
          {mode === "list" && !loading && overdueCount > 0 && (
            <p className="tu-page-sub tu-danger-text">{overdueCount} overdue</p>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* List / Calendar toggle */}
          <div className="tu-segmented">
            {(["list", "calendar"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={mode === m ? "tu-active" : undefined}
              >
                {m}
              </button>
            ))}
          </div>
          <button onClick={() => setShowForm(true)} className="tu-btn-primary">
            + New
          </button>
        </div>
      </div>

      {/* View toggle */}
      {mode === "list" && (
      <div className="tu-toolbar">
        {([
          { key: "work" as const, label: "Work Orders", count: workCount },
          { key: "special" as const, label: "Special Projects", count: specialCount },
        ]).map((t) => (
          <button
            key={t.key}
            onClick={() => { setView(t.key); setStatusFilter("ALL"); }}
            className={`tu-view-pill${view === t.key ? " tu-active" : ""}`}
          >
            {t.label}{t.count > 0 ? ` (${t.count})` : ""}
          </button>
        ))}
      </div>
      )}

      {/* Status filters */}
      {mode === "list" && !loading && (
        <div className="tu-toolbar">
          {([
            { key: "ALL" as const, label: `All (${inView.length})` },
            ...(overdueCount > 0
              ? [{ key: "OVERDUE" as WorkOrderStatus | "ALL" | "OVERDUE", label: `Overdue (${overdueCount})` }]
              : []),
            ...STATUS_ORDER.filter((s) => inView.some((o) => o.status === s)).map((s) => ({
              key: s as WorkOrderStatus | "ALL" | "OVERDUE",
              label: `${STATUS_CONFIG[s].label} (${inView.filter((o) => o.status === s).length})`,
            })),
          ]).map((f) => (
            <button
              key={f.key}
              onClick={() => setStatusFilter(f.key as WorkOrderStatus | "ALL" | "OVERDUE")}
              className={`tu-filter-pill${statusFilter === f.key ? " tu-active" : ""}`}
            >
              {f.label}
            </button>
          ))}
          <label className="tu-toolbar-spacer" style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12.5, fontWeight: 500, color: "var(--tu-text-subtle)" }}>
            Sort
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              className="tu-select"
              style={{ minWidth: 150, padding: "6px 30px 6px 10px", fontSize: 12.5 }}
              aria-label="Sort work orders"
            >
              {SORT_OPTIONS.map((s) => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
            </select>
          </label>
        </div>
      )}

      {/* Create form */}
      {showForm && (
        <div className="tu-card" style={{ padding: 20, marginBottom: 24 }}>
          <h3 className="tu-card-title" style={{ marginBottom: 16 }}>New Work Order</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="tu-label">Title *</label>
              <input
                className="tu-input"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Work order title"
              />
            </div>
            <div className="col-span-2">
              <label className="tu-label">Description</label>
              <textarea
                className="tu-textarea"
                rows={3}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Optional description"
              />
            </div>
            <div>
              <label className="tu-label">Priority</label>
              <select
                className="tu-select" style={{ width: "100%" }}
                value={form.priority}
                onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value as WorkOrderPriority }))}
              >
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="CRITICAL">Critical</option>
              </select>
            </div>
            <div>
              <label className="tu-label">Category</label>
              <select
                className="tu-select" style={{ width: "100%" }}
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              >
                <option value="">Select category…</option>
                {WORK_ORDER_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="tu-label">Due Date</label>
              <input
                type="date"
                className="tu-input"
                value={form.dueDate}
                onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
              />
            </div>
            <div>
              <label className="tu-label">Asset</label>
              <select
                className="tu-select" style={{ width: "100%" }}
                value={form.assetId}
                onChange={(e) => setForm((f) => ({ ...f, assetId: e.target.value }))}
              >
                <option value="">No asset</option>
                {assets.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="tu-label">Expected Time</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  min={0}
                  aria-label="Expected hours"
                  className="tu-input"
                  value={form.estHours}
                  onChange={(e) => setForm((f) => ({ ...f, estHours: e.target.value }))}
                  placeholder="Hours"
                />
                <input
                  type="number"
                  min={0}
                  max={59}
                  aria-label="Expected minutes"
                  className="tu-input"
                  value={form.estMinutes}
                  onChange={(e) => setForm((f) => ({ ...f, estMinutes: e.target.value }))}
                  placeholder="Minutes"
                />
              </div>
            </div>
            {isManager && (
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isSpecial"
                  checked={form.isSpecialProject}
                  onChange={(e) => setForm((f) => ({ ...f, isSpecialProject: e.target.checked }))}
                  className="rounded"
                />
                <label htmlFor="isSpecial" style={{ fontSize: 14, color: "var(--tu-text-body)" }}>Special Project</label>
              </div>
            )}
            {/* Drives the failure count behind MTBF on the Reports tab, so it
                has to mean "something broke" rather than "this was urgent". */}
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isBreakdown"
                checked={form.isBreakdown}
                onChange={(e) => setForm((f) => ({ ...f, isBreakdown: e.target.checked }))}
                className="rounded"
              />
              <label htmlFor="isBreakdown" style={{ fontSize: 14, color: "var(--tu-text-body)" }}>
                Breakdown
                <span style={{ display: "block", fontSize: 12, color: "var(--tu-text-subtle)" }}>
                  Unplanned work because something failed. Counts toward reliability.
                </span>
              </label>
            </div>
          </div>
          {formError && <p className="tu-danger-text" style={{ fontSize: 12.5, marginTop: 12 }}>{formError}</p>}
          <div className="flex gap-3 justify-end mt-4">
            <button
              onClick={() => { setShowForm(false); setFormError(""); setForm({ ...EMPTY_FORM }); }}
              className="tu-btn-secondary"
            >
              Cancel
            </button>
            <button onClick={createWorkOrder} disabled={saving} className="tu-btn-primary">
              {saving ? "Creating..." : "Create"}
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="tu-error-banner">
          Failed to load work orders.
        </div>
      )}

      {mode === "calendar" ? (
        <div className="tu-card" style={{ padding: 20 }}>
          <WorkOrderCalendar
            orders={orders}
            loading={loading}
            hrefFor={(wo) => `/accounts/${accountId}/work-orders/${wo.id}`}
          />
        </div>
      ) : loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="tu-skeleton" style={{ height: 80, borderRadius: "var(--tu-radius-lg)" }} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="tu-card">
          {inView.length === 0 ? (
            <EmptyState
              icon="workOrder"
              title="No work orders yet"
              hint="Create the first work order for this account with the + New button."
            />
          ) : (
            <EmptyState
              icon="search"
              title="No matching work orders"
              hint="Try a different status filter to widen the results."
            />
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {sorted.map((order) => {
            const overdue = isOverdue(order);
            const priorityCfg = PRIORITY_CONFIG[order.priority];
            const statusCfg = STATUS_CONFIG[order.status];
            const isRejected = order.status === "REJECTED";
            const nextStatuses = TRANSITIONS[order.status];

            return (
              <div key={order.id} className="tu-wo-card" style={isRejected ? { opacity: 0.9 } : undefined}>
                {/* Top row: title + status pill */}
                <div className="flex items-start justify-between gap-3 mb-2">
                  <Link
                    href={`/accounts/${accountId}/work-orders/${order.id}`}
                    className="tu-wo-title flex-1"
                    style={isRejected ? { color: "var(--tu-text-subtle)" } : undefined}
                  >
                    {order.title}
                  </Link>
                  <span className={`shrink-0 ${statusCfg.cls}`}>{statusCfg.label}</span>
                </div>

                {/* Meta row */}
                <div className="flex flex-wrap items-center gap-1.5 mb-2.5">
                  {order.isSpecialProject && (
                    <span className="tu-badge tu-badge-warning">★ Special Project</span>
                  )}
                  <span className={priorityCfg.cls}>{priorityCfg.label}</span>
                  {order.category && (
                    <span className="tu-chip">{order.category}</span>
                  )}
                  {order.dueDate && (
                    <span className={overdue ? "tu-badge tu-badge-danger" : "tu-chip"}>
                      {overdue ? "Overdue · " : "Due "}
                      {formatDate(order.dueDate)}
                    </span>
                  )}
                  {order.asset && (
                    <span style={{ fontSize: 12, fontWeight: 500, color: "var(--tu-text-brand)" }}>› {order.asset.name}</span>
                  )}
                  {(() => {
                    const running = order.status === "IN_PROGRESS" && order.timerStartedAt != null;
                    const liveSeconds =
                      order.actualSeconds +
                      (running && order.timerStartedAt
                        ? Math.floor((nowTick + getServerClockOffset() - new Date(order.timerStartedAt).getTime()) / 1000)
                        : 0);
                    const est = order.estimatedMinutes;
                    const hasData = est != null || order.actualSeconds > 0 || running;
                    if (!hasData) return null;
                    const over = est != null && liveSeconds / 60 > est;
                    return (
                      <span
                        className={`tu-timer${running ? " tu-timer-running" : over ? " tu-timer-over" : ""}`}
                        title={running ? "Timer running" : over ? "Over estimated man-hours" : "Logged / estimated man-hours"}
                      >
                        {running ? (
                          <span className="tu-timer-dot" aria-hidden="true" />
                        ) : (
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <circle cx="12" cy="12" r="9" />
                            <path d="M12 7v5l3 2" />
                          </svg>
                        )}
                        <span className={running ? "tu-timer-clock" : undefined}>
                          {running ? formatTimer(liveSeconds) : liveSeconds > 0 ? formatHM(liveSeconds / 60) : "0m"}
                        </span>
                        {est != null && <span className="tu-timer-est">/ {formatHM(est)}</span>}
                      </span>
                    );
                  })()}
                  {order.status === "IN_PROGRESS" && !isClient && canManage && (
                    <button
                      onClick={() => toggleTimer(order)}
                      disabled={timerBusyId === order.id}
                      className={`tu-timer-btn ${order.timerStartedAt ? "tu-timer-btn-pause" : "tu-timer-btn-resume"}`}
                      title={order.timerStartedAt ? "Pause timer" : "Resume timer"}
                    >
                      {timerBusyId === order.id ? "…" : order.timerStartedAt ? "❚❚ Pause" : "▶ Resume"}
                    </button>
                  )}
                </div>

                {order.description && (
                  <p className="tu-wo-desc line-clamp-2">{order.description}</p>
                )}

                {/* Pipeline or rejected banner */}
                {isRejected ? (
                  <div className="tu-inline-notice tu-inline-notice-danger">
                    This work order was rejected.
                  </div>
                ) : (
                  <StatusPipeline status={order.status} steps={PIPELINE_STEPS} ariaLabel={`Status: ${statusCfg.label}`} />
                )}

                {/* Footer: assignment + created */}
                <div className="tu-wo-meta">
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="truncate">
                      {order.assignments.length > 0 ? order.assignments.map((a) => a.employee.name).join(", ") : "Unassigned"}
                    </span>
                    {!isClient && canManage && !isTerminal(order) && (
                      <button onClick={() => openAssignModal(order)} className="tu-link shrink-0">
                        {order.assignments.length > 0 ? "Edit" : "+ Assign"}
                      </button>
                    )}
                  </span>
                  <span className="shrink-0">Created {formatDate(order.createdAt)}</span>
                </div>

                {/* Action buttons */}
                {!isClient && canManage && nextStatuses.length > 0 && (
                  <div className="tu-wo-actions">
                    {nextStatuses.map((ns) => (
                      <button
                        key={ns}
                        onClick={() => updateStatus(order.id, ns)}
                        className={`tu-action-btn${
                          ns === "REJECTED"
                            ? " tu-action-reject"
                            : ns === "COMPLETED"
                            ? " tu-action-complete"
                            : ns === "ON_HOLD"
                            ? " tu-action-hold"
                            : ""
                        }`}
                      >
                        {ns === "PENDING" && order.status === "REQUESTED" ? "Accept" :
                         ns === "PENDING" && order.status === "IN_PROGRESS" ? "Revert to Accepted" :
                         ns === "IN_PROGRESS" && order.status === "ON_HOLD" ? "Resume" :
                         ns === "IN_PROGRESS" ? "Start" :
                         ns === "ON_HOLD" ? "Put On Hold" :
                         ns === "COMPLETED" ? "Mark Complete" :
                         ns === "REJECTED" ? "Reject" : ns}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Assign-employees modal */}
      {assigningOrder && (
        <div
          className="tu-modal-overlay"
          onClick={() => setAssigningOrder(null)}
          role="presentation"
        >
          <div
            className="tu-modal" style={{ maxWidth: 440 }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Assign employees"
          >
            <div className="tu-modal-header" style={{ display: "block" }}>
              <h3 className="tu-modal-title" style={{ fontSize: 14 }}>Assign Employees</h3>
              <p className="truncate" style={{ fontSize: 12, color: "var(--tu-text-subtle)", margin: "2px 0 0" }}>{assigningOrder.title}</p>
            </div>

            <div className="flex-1 overflow-y-auto">
              {employeesLoading ? (
                <p className="tu-empty-hint" style={{ textAlign: "center", padding: "40px 0", margin: 0 }}>Loading employees…</p>
              ) : employees.length === 0 ? (
                <p className="tu-empty-hint" style={{ textAlign: "center", padding: "40px 0", margin: 0 }}>No employees on this account.</p>
              ) : (
                employees.map((emp) => {
                  const assigned = assigningOrder.assignments.some((a) => a.employeeId === emp.id);
                  return (
                    <button
                      key={emp.id}
                      onClick={() => toggleAssignment(assigningOrder, emp)}
                      disabled={togglingId !== null}
                      aria-pressed={assigned}
                      className="tu-pick-row"
                    >
                      <span className="min-w-0">
                        <span className="tu-pick-name truncate">{emp.name}</span>
                        {emp.position && <span className="tu-pick-sub">{emp.position}</span>}
                      </span>
                      <span
                        className={`tu-pick-check${assigned ? " tu-checked" : ""}`}
                        aria-hidden="true"
                      >
                        {togglingId === emp.id ? "…" : "✓"}
                      </span>
                    </button>
                  );
                })
              )}
            </div>

            {assignError && <p className="tu-danger-text" style={{ fontSize: 12.5, padding: "8px 20px", margin: 0 }}>{assignError}</p>}

            <div className="tu-modal-footer">
              <button onClick={() => setAssigningOrder(null)} className="tu-btn-primary">
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
