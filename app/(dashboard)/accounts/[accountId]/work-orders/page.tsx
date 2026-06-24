"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import WorkOrderCalendar from "@/components/WorkOrderCalendar";
import StatusPipeline from "@/components/StatusPipeline";

type WorkOrderStatus = "REQUESTED" | "PENDING" | "IN_PROGRESS" | "COMPLETED" | "REJECTED";
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
  createdAt: string;
  asset: { id: string; name: string } | null;
  assignments: { employeeId: string; employee: { id: string; name: string } }[];
};

const STATUS_CONFIG: Record<WorkOrderStatus, { label: string; cls: string }> = {
  REQUESTED:   { label: "Requested",   cls: "bg-purple-50 text-purple-700" },
  PENDING:     { label: "Accepted",    cls: "bg-blue-50 text-blue-700" },
  IN_PROGRESS: { label: "In Progress", cls: "bg-amber-50 text-amber-700" },
  COMPLETED:   { label: "Completed",   cls: "bg-green-50 text-green-700" },
  REJECTED:    { label: "Rejected",    cls: "bg-red-50 text-red-700" },
};

const PRIORITY_CONFIG: Record<WorkOrderPriority, { label: string; cls: string }> = {
  LOW:      { label: "Low",      cls: "bg-green-50 text-green-700" },
  MEDIUM:   { label: "Medium",   cls: "bg-blue-50 text-blue-700" },
  HIGH:     { label: "High",     cls: "bg-amber-50 text-amber-700" },
  CRITICAL: { label: "Critical", cls: "bg-red-50 text-red-700" },
};

const STATUS_ORDER: WorkOrderStatus[] = ["REQUESTED", "PENDING", "IN_PROGRESS", "COMPLETED", "REJECTED"];

// Allowed status transitions a manager/supervisor can apply from each state.
const TRANSITIONS: Record<WorkOrderStatus, WorkOrderStatus[]> = {
  REQUESTED: ["PENDING", "REJECTED"],
  PENDING: ["IN_PROGRESS", "REJECTED"],
  IN_PROGRESS: ["COMPLETED", "PENDING"],
  COMPLETED: [],
  REJECTED: [],
};

const PIPELINE_STEPS = ["Requested", "Accepted", "In Progress", "Completed"];

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function WorkOrdersPage() {
  const params = useParams();
  const accountId = params.accountId as string;
  const { user } = useAuth();
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [statusFilter, setStatusFilter] = useState<WorkOrderStatus | "ALL">("ALL");
  const [view, setView] = useState<"work" | "special">("work");
  const [mode, setMode] = useState<"list" | "calendar">("list");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", priority: "MEDIUM" as WorkOrderPriority, category: "", dueDate: "", isSpecialProject: false });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const isClient = user?.role === "CLIENT";
  const canManage = user?.role === "GENERAL_MANAGER" || user?.role === "MANAGER" || user?.role === "SUPERVISOR";
  const isManager = user?.role === "GENERAL_MANAGER" || user?.role === "MANAGER";

  useEffect(() => { fetchOrders(); }, [accountId]);

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

  async function createWorkOrder() {
    if (!form.title.trim()) { setFormError("Title is required."); return; }
    setFormError("");
    setSaving(true);
    try {
      const res = await api.post(`/accounts/${accountId}/work-orders`, {
        title: form.title.trim(),
        description: form.description.trim() || null,
        priority: form.priority,
        category: form.category.trim() || null,
        dueDate: form.dueDate || null,
        isSpecialProject: form.isSpecialProject,
      });
      setOrders((prev) => [res.data, ...prev]);
      setShowForm(false);
      setForm({ title: "", description: "", priority: "MEDIUM", category: "", dueDate: "", isSpecialProject: false });
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

  const inView = orders.filter((o) => view === "special" ? o.isSpecialProject : !o.isSpecialProject);
  const now = new Date();
  const isOverdue = (o: WorkOrder) => !!o.dueDate && o.status !== "COMPLETED" && o.status !== "REJECTED" && new Date(o.dueDate) < now;
  const overdueCount = inView.filter(isOverdue).length;
  const filtered = statusFilter === "ALL" ? inView : inView.filter((o) => o.status === statusFilter);
  const sorted = [...filtered].sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status));
  const workCount = orders.filter((o) => !o.isSpecialProject).length;
  const specialCount = orders.filter((o) => o.isSpecialProject).length;

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold text-gray-900">{mode === "calendar" ? "Calendar" : view === "special" ? "Special Projects" : "Work Orders"}</h2>
          {mode === "list" && !loading && overdueCount > 0 && (
            <p className="text-xs text-red-500 mt-0.5">{overdueCount} overdue</p>
          )}
        </div>
        <div className="flex items-center gap-3">
          {/* List / Calendar toggle */}
          <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden">
            {(["list", "calendar"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-3 py-2 text-sm font-semibold capitalize cursor-pointer transition-colors ${
                  mode === m ? "bg-[#2166AC] text-white" : "bg-white text-gray-600 hover:text-[#2166AC]"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="bg-[#2166AC] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#1a5490] transition-colors cursor-pointer"
          >
            + New
          </button>
        </div>
      </div>

      {/* View toggle */}
      {mode === "list" && (
      <div className="flex gap-2 mb-4">
        {([
          { key: "work" as const, label: "Work Orders", count: workCount },
          { key: "special" as const, label: "Special Projects", count: specialCount },
        ]).map((t) => (
          <button
            key={t.key}
            onClick={() => { setView(t.key); setStatusFilter("ALL"); }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer border ${
              view === t.key
                ? "bg-[#2166AC] text-white border-[#2166AC]"
                : "bg-white text-gray-600 border-gray-200 hover:border-[#2166AC] hover:text-[#2166AC]"
            }`}
          >
            {t.label}{t.count > 0 ? ` (${t.count})` : ""}
          </button>
        ))}
      </div>
      )}

      {/* Status filters */}
      {mode === "list" && !loading && (
        <div className="flex gap-2 mb-6 flex-wrap">
          {([
            { key: "ALL" as const, label: `All (${inView.length})` },
            ...STATUS_ORDER.filter((s) => inView.some((o) => o.status === s)).map((s) => ({
              key: s as WorkOrderStatus | "ALL",
              label: `${STATUS_CONFIG[s].label} (${inView.filter((o) => o.status === s).length})`,
            })),
          ]).map((f) => (
            <button
              key={f.key}
              onClick={() => setStatusFilter(f.key as WorkOrderStatus | "ALL")}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors cursor-pointer ${
                statusFilter === f.key
                  ? "bg-[#2166AC] text-white border-[#2166AC]"
                  : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      {/* Create form */}
      {showForm && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 mb-6">
          <h3 className="text-sm font-semibold text-gray-800 mb-4">New Work Order</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-gray-500 mb-1">Title *</label>
              <input
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2166AC]"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Work order title"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-gray-500 mb-1">Description</label>
              <textarea
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2166AC] resize-none"
                rows={3}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Optional description"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Priority</label>
              <select
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2166AC]"
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
              <label className="block text-xs font-semibold text-gray-500 mb-1">Category</label>
              <input
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2166AC]"
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                placeholder="e.g. Electrical, HVAC"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Due Date</label>
              <input
                type="date"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2166AC]"
                value={form.dueDate}
                onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
              />
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
                <label htmlFor="isSpecial" className="text-sm text-gray-700">Special Project</label>
              </div>
            )}
          </div>
          {formError && <p className="text-red-500 text-xs mt-3">{formError}</p>}
          <div className="flex gap-3 justify-end mt-4">
            <button
              onClick={() => { setShowForm(false); setFormError(""); }}
              className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={createWorkOrder}
              disabled={saving}
              className="px-4 py-2 text-sm text-white bg-[#2166AC] rounded-lg hover:bg-[#1a5490] disabled:opacity-50 cursor-pointer"
            >
              {saving ? "Creating..." : "Create"}
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mb-6">
          Failed to load work orders.
        </div>
      )}

      {mode === "calendar" ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <WorkOrderCalendar
            orders={orders}
            loading={loading}
            hrefFor={(wo) => `/accounts/${accountId}/work-orders/${wo.id}`}
          />
        </div>
      ) : loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-20 bg-white rounded-xl border border-gray-100 animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-12 text-center text-gray-400 text-sm">
          {inView.length === 0 ? "No work orders yet." : "No work orders match this filter."}
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
              <div key={order.id} className={`bg-white rounded-xl border border-gray-100 shadow-sm p-4 ${isRejected ? "opacity-90" : ""}`}>
                {/* Top row: title + status pill */}
                <div className="flex items-start justify-between gap-3 mb-2">
                  <Link
                    href={`/accounts/${accountId}/work-orders/${order.id}`}
                    className={`flex-1 text-base font-bold leading-snug hover:text-[#2166AC] transition-colors ${isRejected ? "text-gray-500" : "text-gray-900"}`}
                  >
                    {order.title}
                  </Link>
                  <span className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-bold ${statusCfg.cls}`}>{statusCfg.label}</span>
                </div>

                {/* Meta row */}
                <div className="flex flex-wrap items-center gap-1.5 mb-2.5">
                  {order.isSpecialProject && (
                    <span className="rounded px-2 py-0.5 text-[11px] font-bold bg-amber-100 text-amber-800">★ Special Project</span>
                  )}
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${priorityCfg.cls}`}>{priorityCfg.label}</span>
                  {order.category && (
                    <span className="rounded-full px-2 py-0.5 text-xs font-semibold bg-gray-100 text-gray-600">{order.category}</span>
                  )}
                  {order.dueDate && (
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${overdue ? "bg-red-50 text-red-600" : "bg-gray-100 text-gray-500"}`}>
                      {overdue ? "Overdue · " : "Due "}
                      {formatDate(order.dueDate)}
                    </span>
                  )}
                  {order.asset && <span className="text-xs font-medium text-[#2166AC]">› {order.asset.name}</span>}
                </div>

                {order.description && (
                  <p className="text-[13px] text-gray-600 leading-relaxed mb-3 line-clamp-2">{order.description}</p>
                )}

                {/* Pipeline or rejected banner */}
                {isRejected ? (
                  <div className="bg-red-50 rounded-lg p-2.5 my-2.5 text-center text-[13px] font-semibold text-red-800">
                    This work order was rejected.
                  </div>
                ) : (
                  <StatusPipeline status={order.status} steps={PIPELINE_STEPS} ariaLabel={`Status: ${statusCfg.label}`} />
                )}

                {/* Footer: assignment + created */}
                <div className="flex items-center justify-between gap-2 text-[11px] text-gray-400">
                  <span>{order.assignments.length > 0 ? order.assignments.map((a) => a.employee.name).join(", ") : "Unassigned"}</span>
                  <span>Created {formatDate(order.createdAt)}</span>
                </div>

                {/* Action buttons */}
                {!isClient && canManage && nextStatuses.length > 0 && (
                  <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100">
                    {nextStatuses.map((ns) => (
                      <button
                        key={ns}
                        onClick={() => updateStatus(order.id, ns)}
                        className={`px-3 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                          ns === "REJECTED"
                            ? "bg-red-50 text-red-600 hover:bg-red-100"
                            : ns === "COMPLETED"
                            ? "bg-green-50 text-green-700 hover:bg-green-100"
                            : "bg-[#2166AC] text-white hover:bg-[#1a5490]"
                        }`}
                      >
                        {ns === "PENDING" && order.status === "REQUESTED" ? "Accept" :
                         ns === "PENDING" && order.status === "IN_PROGRESS" ? "Revert to Accepted" :
                         ns === "IN_PROGRESS" ? "Start" :
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
    </div>
  );
}
