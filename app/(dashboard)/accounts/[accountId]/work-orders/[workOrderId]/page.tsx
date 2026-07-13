"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import api, { getServerClockOffset } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import StatusPipeline from "@/components/StatusPipeline";
import Breadcrumbs from "@/components/Breadcrumbs";

const PIPELINE_STEPS = ["Requested", "Accepted", "In Progress", "Completed"];

type WorkOrderStatus = "REQUESTED" | "PENDING" | "IN_PROGRESS" | "ON_HOLD" | "COMPLETED" | "REJECTED";
type WorkOrderPriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

type WorkOrder = {
  id: string;
  title: string;
  description: string | null;
  type: "INTERNAL" | "EXTERNAL";
  status: WorkOrderStatus;
  priority: WorkOrderPriority;
  category: string | null;
  dueDate: string | null;
  remarks: string | null;
  completedAt: string | null;
  isSpecialProject: boolean;
  estimatedMinutes: number | null;
  actualSeconds: number;
  timerStartedAt: string | null;
  createdAt: string;
  asset: { id: string; name: string } | null;
  comments: { id: string; body: string; authorName: string; createdAt: string }[];
  assignments: { id: string; employeeId: string; employee: { id: string; name: string; position: string | null } }[];
};

const STATUS_CONFIG: Record<WorkOrderStatus, { label: string; cls: string }> = {
  REQUESTED:   { label: "Requested",   cls: "bg-purple-50 text-purple-700" },
  PENDING:     { label: "Accepted",    cls: "bg-blue-50 text-blue-700" },
  IN_PROGRESS: { label: "In Progress", cls: "bg-amber-50 text-amber-700" },
  ON_HOLD:     { label: "On Hold",     cls: "bg-slate-100 text-slate-700" },
  COMPLETED:   { label: "Completed",   cls: "bg-green-50 text-green-700" },
  REJECTED:    { label: "Rejected",    cls: "bg-red-50 text-red-700" },
};

const PRIORITY_CONFIG: Record<WorkOrderPriority, { label: string; cls: string }> = {
  LOW:      { label: "Low",      cls: "bg-green-50 text-green-700" },
  MEDIUM:   { label: "Medium",   cls: "bg-blue-50 text-blue-700" },
  HIGH:     { label: "High",     cls: "bg-amber-50 text-amber-700" },
  CRITICAL: { label: "Critical", cls: "bg-red-50 text-red-700" },
};

const VALID_TRANSITIONS: Record<WorkOrderStatus, WorkOrderStatus[]> = {
  REQUESTED:   ["PENDING", "REJECTED"],
  PENDING:     ["IN_PROGRESS", "REJECTED"],
  IN_PROGRESS: ["COMPLETED", "PENDING", "ON_HOLD"],
  ON_HOLD:     ["IN_PROGRESS", "REJECTED"],
  COMPLETED:   [],
  REJECTED:    [],
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

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

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

type AccountEmployee = { id: string; name: string; position: string | null };

export default function WorkOrderDetailPage() {
  const params = useParams();
  const accountId = params.accountId as string;
  const workOrderId = params.workOrderId as string;
  const { user } = useAuth();
  const [order, setOrder] = useState<WorkOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [remarks, setRemarks] = useState("");
  const [showCompleteForm, setShowCompleteForm] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);

  // Assignment picker
  const [accountEmployees, setAccountEmployees] = useState<AccountEmployee[]>([]);
  const [showAssignPicker, setShowAssignPicker] = useState(false);
  const [empSearch, setEmpSearch] = useState("");
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  // Edit mode for non-status fields
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ priority: "MEDIUM" as WorkOrderPriority, dueDate: "", category: "", estimatedMinutes: "" });
  const [savingEdit, setSavingEdit] = useState(false);

  // Man-hour time tracking
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [timerBusy, setTimerBusy] = useState(false);
  const [editingEst, setEditingEst] = useState(false);
  const [estHrs, setEstHrs] = useState("");
  const [estMins, setEstMins] = useState("");
  const timerRunning = order?.status === "IN_PROGRESS" && order?.timerStartedAt != null;

  // Tick once a second only while the timer is actively running.
  useEffect(() => {
    if (!timerRunning) return;
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [timerRunning]);

  async function toggleTimer() {
    if (!order) return;
    setTimerBusy(true);
    try {
      const action = order.timerStartedAt ? "pause" : "resume";
      const res = await api.post(`/work-orders/${order.id}/timer`, { action });
      setOrder((prev) => prev ? { ...prev, status: res.data.status, timerStartedAt: res.data.timerStartedAt, actualSeconds: res.data.actualSeconds } : prev);
    } catch {
      // silent
    } finally {
      setTimerBusy(false);
    }
  }

  async function saveEstimate() {
    if (!order) return;
    const h = estHrs.trim() === "" ? 0 : parseInt(estHrs, 10);
    const m = estMins.trim() === "" ? 0 : parseInt(estMins, 10);
    if (isNaN(h) || isNaN(m) || h < 0 || m < 0 || m > 59) return;
    const total = h * 60 + m;
    try {
      const res = await api.patch(`/work-orders/${order.id}`, { estimatedMinutes: total || null });
      setOrder((prev) => prev ? { ...prev, estimatedMinutes: res.data.estimatedMinutes } : prev);
      setEditingEst(false);
    } catch {
      // silent
    }
  }

  const isClient = user?.role === "CLIENT";
  const canManage = user?.role !== "CLIENT";
  const isManager = user?.role === "GENERAL_MANAGER" || user?.role === "MANAGER";

  useEffect(() => { fetchOrder(); }, [workOrderId]);

  async function fetchOrder() {
    setLoading(true);
    setError(false);
    try {
      // There's no single-work-order GET endpoint; the account list is the
      // source of truth (it includes asset, comments, assignments, and the
      // man-hour/timer fields), so find this order within it.
      const res = await api.get(`/accounts/${accountId}/work-orders`);
      const found = res.data.find((w: WorkOrder) => w.id === workOrderId);
      if (!found) { setError(true); return; }
      setOrder(found);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  async function openAssignPicker() {
    setShowAssignPicker(true);
    setEmpSearch("");
    if (accountEmployees.length === 0) {
      try {
        const res = await api.get(`/accounts/${accountId}/employees`);
        setAccountEmployees(res.data);
      } catch {
        // silent
      }
    }
  }

  async function assignEmployee(empId: string) {
    if (!order) return;
    setAssigningId(empId);
    try {
      const res = await api.post(`/work-orders/${order.id}/assignments`, { employeeId: empId });
      setOrder((prev) => prev ? { ...prev, assignments: [...prev.assignments, res.data] } : prev);
    } catch {
      // silent
    } finally {
      setAssigningId(null);
    }
  }

  async function removeAssignment(empId: string) {
    if (!order) return;
    setRemovingId(empId);
    try {
      await api.delete(`/work-orders/${order.id}/assignments/${empId}`);
      setOrder((prev) => prev ? { ...prev, assignments: prev.assignments.filter((a) => a.employeeId !== empId) } : prev);
    } catch {
      // silent
    } finally {
      setRemovingId(null);
    }
  }

  function openEdit() {
    if (!order) return;
    setEditForm({
      priority: order.priority,
      dueDate: order.dueDate ? order.dueDate.slice(0, 10) : "",
      category: order.category ?? "",
      estimatedMinutes: order.estimatedMinutes != null ? String(order.estimatedMinutes) : "",
    });
    setEditing(true);
  }

  async function saveEdit() {
    if (!order) return;
    setSavingEdit(true);
    try {
      const estMin = editForm.estimatedMinutes.trim();
      const res = await api.patch(`/work-orders/${order.id}`, {
        priority: editForm.priority,
        dueDate: editForm.dueDate || null,
        category: editForm.category.trim() || null,
        estimatedMinutes: estMin ? Number(estMin) : null,
      });
      // PATCH responses omit comments (and other relations); merge so we don't
      // drop them and crash the comments section.
      setOrder((prev) => prev ? { ...prev, ...res.data, comments: res.data.comments ?? prev.comments } : res.data);
      setEditing(false);
    } catch {
      // silent
    } finally {
      setSavingEdit(false);
    }
  }

  async function updateStatus(status: WorkOrderStatus) {
    if (!order) return;
    setUpdatingStatus(true);
    try {
      const body: { status: WorkOrderStatus; remarks?: string } = { status };
      if (status === "COMPLETED" && remarks.trim()) body.remarks = remarks.trim();
      const res = await api.patch(`/work-orders/${order.id}`, body);
      // PATCH responses omit comments (and other relations); merge so we don't
      // drop them and crash the comments section.
      setOrder((prev) => prev ? { ...prev, ...res.data, comments: res.data.comments ?? prev.comments } : res.data);
      setShowCompleteForm(false);
      setRemarks("");
    } catch {
      // silent
    } finally {
      setUpdatingStatus(false);
    }
  }

  async function addComment() {
    if (!commentText.trim() || submittingComment || !order) return;
    setSubmittingComment(true);
    try {
      const res = await api.post(`/work-orders/${order.id}/comments`, { body: commentText.trim() });
      setOrder((prev) => prev ? { ...prev, comments: [...prev.comments, res.data] } : prev);
      setCommentText("");
    } catch {
      // silent
    } finally {
      setSubmittingComment(false);
    }
  }

  if (loading) {
    return (
      <div className="p-8 max-w-4xl mx-auto">
        <div className="h-8 w-48 bg-gray-100 rounded animate-pulse mb-4" />
        <div className="h-64 bg-white rounded-xl border border-gray-100 animate-pulse" />
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
          Failed to load work order.{" "}
          <button onClick={fetchOrder} className="underline cursor-pointer">Try again</button>
        </div>
      </div>
    );
  }

  const cfg = STATUS_CONFIG[order.status];
  const priorityCfg = PRIORITY_CONFIG[order.priority];
  const nextStatuses = VALID_TRANSITIONS[order.status];
  const isTerminal = order.status === "COMPLETED" || order.status === "REJECTED";
  const isOverdue = !!order.dueDate && !isTerminal && new Date(order.dueDate) < new Date();

  // Special project gate: only managers can approve/reject special projects
  const canActOnStatus = !isClient && canManage && (!order.isSpecialProject || isManager);

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <Breadcrumbs
        items={[
          { label: "Work Orders", href: `/accounts/${accountId}/work-orders` },
          { label: order.title },
        ]}
      />

      {/* Main card */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 mb-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-gray-900">{order.title}</h1>
            {order.isSpecialProject && (
              <span className="inline-block mt-1 text-xs font-semibold text-amber-700 bg-amber-50 rounded-full px-2 py-0.5">
                ★ Special Project
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {canManage && !isTerminal && (
              <button
                onClick={openEdit}
                className="text-xs text-gray-500 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 cursor-pointer"
              >
                Edit
              </button>
            )}
            <span className={`rounded-full px-3 py-1 text-sm font-semibold ${cfg.cls}`}>
              {cfg.label}
            </span>
          </div>
        </div>

        {/* Lifecycle pipeline */}
        {order.status === "REJECTED" ? (
          <div className="bg-red-50 rounded-lg p-2.5 my-2.5 text-center text-[13px] font-semibold text-red-800">
            This work order was rejected.
          </div>
        ) : (
          <>
            {order.status === "ON_HOLD" && (
              <div className="flex items-center justify-center gap-2 bg-slate-100 border border-slate-200 rounded-lg p-2.5 my-2.5 text-[13px] font-semibold text-slate-700">
                <span className="flex gap-[3px]" aria-hidden="true">
                  <span className="w-[3px] h-3.5 rounded-sm bg-slate-500" />
                  <span className="w-[3px] h-3.5 rounded-sm bg-slate-500" />
                </span>
                On hold — work is paused. Resume it to continue.
              </div>
            )}
            <StatusPipeline status={order.status} steps={PIPELINE_STEPS} ariaLabel={`Status: ${cfg.label}`} />
          </>
        )}

        {/* Inline edit form */}
        {editing && (
          <div className="bg-gray-50 rounded-xl p-4 mb-4 border border-gray-200">
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Priority</label>
                <select
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2166AC]"
                  value={editForm.priority}
                  onChange={(e) => setEditForm((f) => ({ ...f, priority: e.target.value as WorkOrderPriority }))}
                >
                  {(["LOW", "MEDIUM", "HIGH", "CRITICAL"] as WorkOrderPriority[]).map((p) => (
                    <option key={p} value={p}>{PRIORITY_CONFIG[p].label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Category</label>
                <input
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2166AC]"
                  value={editForm.category}
                  onChange={(e) => setEditForm((f) => ({ ...f, category: e.target.value }))}
                  placeholder="e.g. Electrical, HVAC"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Due Date</label>
                <input
                  type="date"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2166AC]"
                  value={editForm.dueDate}
                  onChange={(e) => setEditForm((f) => ({ ...f, dueDate: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Est. Minutes</label>
                <input
                  type="number"
                  min="0"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2166AC]"
                  value={editForm.estimatedMinutes}
                  onChange={(e) => setEditForm((f) => ({ ...f, estimatedMinutes: e.target.value }))}
                  placeholder="e.g. 120"
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setEditing(false)}
                className="px-3 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-100 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={saveEdit}
                disabled={savingEdit}
                className="px-3 py-1.5 text-xs text-white bg-[#2166AC] rounded-lg hover:bg-[#1a5490] disabled:opacity-50 cursor-pointer"
              >
                {savingEdit ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </div>
        )}

        {/* Meta */}
        <div className="flex flex-wrap gap-2 mb-4">
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${priorityCfg.cls}`}>
            {priorityCfg.label}
          </span>
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${order.type === "INTERNAL" ? "bg-blue-50 text-blue-700" : "bg-amber-50 text-amber-700"}`}>
            {order.type === "INTERNAL" ? "Internal" : "External"}
          </span>
          {order.category && (
            <span className="rounded-full px-2 py-0.5 text-xs font-semibold bg-gray-100 text-gray-600">
              {order.category}
            </span>
          )}
          {order.dueDate && (
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${isOverdue ? "bg-red-50 text-red-600" : "bg-gray-100 text-gray-500"}`}>
              {isOverdue ? "Overdue · " : "Due "}{new Date(order.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </span>
          )}
        </div>

        {/* Description */}
        {order.description && (
          <p className="text-sm text-gray-600 mb-4 leading-relaxed">{order.description}</p>
        )}

        {/* Asset */}
        {order.asset && (
          <p className="text-sm mb-4">
            <span className="text-gray-500">Asset: </span>
            <Link
              href={`/accounts/${accountId}/assets/${order.asset.id}`}
              className="text-[#2166AC] hover:underline"
            >
              {order.asset.name}
            </Link>
          </p>
        )}

        {/* Assignees */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Assigned To</p>
            {canManage && !isTerminal && (
              <button
                onClick={openAssignPicker}
                className="text-xs text-[#2166AC] hover:underline cursor-pointer"
              >
                + Add
              </button>
            )}
          </div>
          {order.assignments.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {order.assignments.map((a) => (
                <span key={a.id} className="inline-flex items-center gap-1.5 text-xs bg-gray-100 text-gray-700 rounded-full px-2.5 py-1 font-medium">
                  <Link href={`/accounts/${accountId}/employees/${a.employee.id}`} className="hover:text-[#2166AC] hover:underline">
                    {a.employee.name}
                  </Link>
                  {a.employee.position && <span className="text-gray-400">· {a.employee.position}</span>}
                  {canManage && !isTerminal && (
                    <button
                      onClick={() => removeAssignment(a.employeeId)}
                      disabled={removingId === a.employeeId}
                      className="text-gray-400 hover:text-red-500 cursor-pointer leading-none"
                      aria-label={`Remove ${a.employee.name}`}
                    >
                      {removingId === a.employeeId ? "…" : "×"}
                    </button>
                  )}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400">No employees assigned</p>
          )}

          {/* Assign picker */}
          {showAssignPicker && (
            <div className="mt-3 border border-gray-200 rounded-xl overflow-hidden shadow-sm">
              <div className="p-3 border-b border-gray-100">
                <input
                  className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2166AC]"
                  placeholder="Search employees…"
                  value={empSearch}
                  onChange={(e) => setEmpSearch(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="max-h-48 overflow-y-auto">
                {accountEmployees
                  .filter((e) => {
                    const assigned = order.assignments.some((a) => a.employeeId === e.id);
                    const match = !empSearch.trim() || e.name.toLowerCase().includes(empSearch.toLowerCase());
                    return !assigned && match;
                  })
                  .map((e) => (
                    <button
                      key={e.id}
                      onClick={() => assignEmployee(e.id)}
                      disabled={assigningId === e.id}
                      className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 flex items-center justify-between cursor-pointer transition-colors"
                    >
                      <div>
                        <span className="font-medium text-gray-800">{e.name}</span>
                        {e.position && <span className="text-gray-400 text-xs ml-2">{e.position}</span>}
                      </div>
                      {assigningId === e.id && <span className="text-xs text-gray-400">…</span>}
                    </button>
                  ))}
                {accountEmployees.filter((e) => !order.assignments.some((a) => a.employeeId === e.id)).length === 0 && (
                  <p className="text-xs text-gray-400 text-center py-4">All employees assigned.</p>
                )}
              </div>
              <div className="p-2 border-t border-gray-100">
                <button
                  onClick={() => setShowAssignPicker(false)}
                  className="w-full text-xs text-gray-500 py-1.5 hover:bg-gray-50 rounded-lg cursor-pointer"
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Time tracking (man-hours) */}
        {["PENDING", "IN_PROGRESS", "ON_HOLD", "COMPLETED"].includes(order.status) && (() => {
          const liveSeconds = order.actualSeconds + (timerRunning && order.timerStartedAt
            ? Math.floor((nowTick + getServerClockOffset() - new Date(order.timerStartedAt).getTime()) / 1000)
            : 0);
          const actualMinutes = liveSeconds / 60;
          const estMin = order.estimatedMinutes;
          const pct = estMin && estMin > 0 ? Math.min((actualMinutes / estMin) * 100, 100) : null;
          const overBudget = estMin != null && actualMinutes > estMin;
          const isDone = order.status === "COMPLETED";
          return (
            <div className="border border-gray-100 rounded-xl p-4 mb-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Time Tracking · Man-Hours</p>

              {/* Expected */}
              <div className="flex items-center justify-between gap-3 mb-3">
                <span className="text-sm text-gray-500">Expected</span>
                {editingEst ? (
                  <div className="flex items-center gap-1.5">
                    <input type="number" min={0} value={estHrs} onChange={(e) => setEstHrs(e.target.value)} placeholder="0"
                      className="w-14 border border-gray-200 rounded-lg px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-[#2166AC]" />
                    <span className="text-xs text-gray-400">h</span>
                    <input type="number" min={0} max={59} value={estMins} onChange={(e) => setEstMins(e.target.value)} placeholder="0"
                      className="w-14 border border-gray-200 rounded-lg px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-[#2166AC]" />
                    <span className="text-xs text-gray-400">m</span>
                    <button onClick={saveEstimate} className="ml-1 text-xs font-semibold text-white bg-[#2166AC] rounded-lg px-2.5 py-1 hover:bg-[#1a5490] cursor-pointer">Save</button>
                    <button onClick={() => setEditingEst(false)} className="text-xs text-gray-500 px-1 cursor-pointer">Cancel</button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-800">{estMin != null ? formatHM(estMin) : "Not set"}</span>
                    {canManage && (
                      <button
                        onClick={() => { setEstHrs(estMin != null ? String(Math.floor(estMin / 60)) : ""); setEstMins(estMin != null ? String(estMin % 60) : ""); setEditingEst(true); }}
                        className="text-xs text-[#2166AC] hover:underline cursor-pointer"
                      >
                        {estMin != null ? "Edit" : "Set"}
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Live timer / actual */}
              <div className="bg-gray-50 rounded-lg p-3 flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">{isDone ? "Actual" : "Elapsed"}</p>
                  <p className={`text-2xl font-bold tabular-nums ${overBudget ? "text-red-600" : "text-gray-900"}`}>{formatTimer(liveSeconds)}</p>
                </div>
                {!isDone && (
                  <span className={`text-xs font-semibold ${timerRunning ? "text-green-600" : "text-slate-500"}`}>
                    {timerRunning ? "● Running" : "❚❚ Paused"}
                  </span>
                )}
              </div>

              {/* Budget progress */}
              {pct != null && (
                <div className="mt-3">
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-1.5 rounded-full ${overBudget ? "bg-red-500" : "bg-[#2166AC]"}`} style={{ width: `${pct}%` }} />
                  </div>
                  <p className="text-[11px] text-gray-400 mt-1">
                    {formatHM(actualMinutes)} of {formatHM(estMin!)} {overBudget ? "· over budget" : ""}
                  </p>
                </div>
              )}

              {/* Timer control (only while actively in progress) */}
              {canManage && order.status === "IN_PROGRESS" && (
                <button
                  onClick={toggleTimer}
                  disabled={timerBusy}
                  className={`mt-3 w-full py-2 rounded-lg text-sm font-semibold cursor-pointer transition-colors disabled:opacity-50 ${
                    order.timerStartedAt ? "bg-slate-100 text-slate-700 hover:bg-slate-200" : "bg-[#2166AC] text-white hover:bg-[#1a5490]"
                  }`}
                >
                  {timerBusy ? "…" : order.timerStartedAt ? "❚❚ Pause Timer" : "▶ Resume Timer"}
                </button>
              )}
            </div>
          );
        })()}

        {/* Completed info */}
        {order.status === "COMPLETED" && (
          <div className="bg-green-50 rounded-lg p-3 mb-4">
            {order.remarks && (
              <p className="text-sm text-gray-700 italic mb-1">&quot;{order.remarks}&quot;</p>
            )}
            {order.completedAt && (
              <p className="text-xs text-gray-400">Completed {formatDate(order.completedAt)}</p>
            )}
          </div>
        )}

        <p className="text-xs text-gray-400">Created {formatDate(order.createdAt)}</p>

        {/* Status actions */}
        {canActOnStatus && nextStatuses.length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            {showCompleteForm && order.status === "IN_PROGRESS" ? (
              <div>
                <textarea
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2166AC] resize-none mb-3"
                  rows={3}
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="Add closing remarks (optional)"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowCompleteForm(false)}
                    className="px-3 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => updateStatus("COMPLETED")}
                    disabled={updatingStatus}
                    className="px-3 py-1.5 text-xs text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50 cursor-pointer"
                  >
                    {updatingStatus ? "Saving..." : "Confirm Complete"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2 flex-wrap">
                {nextStatuses.map((ns) => (
                  <button
                    key={ns}
                    onClick={() => {
                      if (ns === "COMPLETED") { setShowCompleteForm(true); return; }
                      updateStatus(ns);
                    }}
                    disabled={updatingStatus}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors disabled:opacity-50 ${
                      ns === "REJECTED"
                        ? "bg-red-50 text-red-600 hover:bg-red-100"
                        : ns === "COMPLETED"
                        ? "bg-green-50 text-green-700 hover:bg-green-100"
                        : ns === "ON_HOLD"
                        ? "bg-slate-100 text-slate-700 hover:bg-slate-200"
                        : "bg-[#2166AC] text-white hover:bg-[#1a5490]"
                    }`}
                  >
                    {ns === "PENDING" && order.status === "REQUESTED" ? "Accept" :
                     ns === "PENDING" && order.status === "IN_PROGRESS" ? "Revert to Accepted" :
                     ns === "IN_PROGRESS" && order.status === "ON_HOLD" ? "Resume Work" :
                     ns === "IN_PROGRESS" ? "Start Work" :
                     ns === "ON_HOLD" ? "Put On Hold" :
                     ns === "COMPLETED" ? "Mark as Complete" :
                     ns === "REJECTED" ? "Reject" : ns}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {order.isSpecialProject && order.status === "REQUESTED" && !isManager && !isClient && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
              Awaiting manager approval for this special project.
            </p>
          </div>
        )}
      </div>

      {/* Comments */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">
          Comments {order.comments.length > 0 && `(${order.comments.length})`}
        </h2>
        {order.comments.length === 0 ? (
          <p className="text-sm text-gray-400">No comments yet.</p>
        ) : (
          <div className="space-y-3 mb-4">
            {order.comments.map((c) => (
              <div key={c.id} className="bg-gray-50 rounded-lg p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-gray-700">{c.authorName}</span>
                  <span className="text-xs text-gray-400">{timeAgo(c.createdAt)}</span>
                </div>
                <p className="text-sm text-gray-700">{c.body}</p>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <input
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2166AC]"
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            placeholder="Add a comment..."
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && addComment()}
          />
          <button
            onClick={addComment}
            disabled={!commentText.trim() || submittingComment}
            className="px-4 py-2 text-sm text-white bg-[#2166AC] rounded-lg hover:bg-[#1a5490] disabled:opacity-50 cursor-pointer"
          >
            {submittingComment ? "..." : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
