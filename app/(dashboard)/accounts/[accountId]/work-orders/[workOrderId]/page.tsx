"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

type WorkOrderStatus = "REQUESTED" | "PENDING" | "IN_PROGRESS" | "COMPLETED" | "REJECTED";
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
  createdAt: string;
  asset: { id: string; name: string } | null;
  comments: { id: string; body: string; authorName: string; createdAt: string }[];
  assignments: { id: string; employeeId: string; employee: { id: string; name: string; position: string | null } }[];
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

const VALID_TRANSITIONS: Record<WorkOrderStatus, WorkOrderStatus[]> = {
  REQUESTED:   ["PENDING", "REJECTED"],
  PENDING:     ["IN_PROGRESS", "REJECTED"],
  IN_PROGRESS: ["COMPLETED", "PENDING"],
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

  const isClient = user?.role === "CLIENT";
  const canManage = user?.role !== "CLIENT";
  const isManager = user?.role === "GENERAL_MANAGER" || user?.role === "MANAGER";

  useEffect(() => { fetchOrder(); }, [workOrderId]);

  async function fetchOrder() {
    setLoading(true);
    setError(false);
    try {
      const res = await api.get(`/work-orders/${workOrderId}`);
      setOrder(res.data);
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
      setOrder(res.data);
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
      setOrder(res.data);
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
      <div className="mb-6">
        <Link
          href={`/accounts/${accountId}/work-orders`}
          className="text-xs text-gray-400 hover:text-[#2166AC] transition-colors"
        >
          ← Work Orders
        </Link>
      </div>

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
          <p className="text-sm text-[#2166AC] mb-4">Asset: {order.asset.name}</p>
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
                  {a.employee.name}
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

        {/* Man-hours */}
        {(order.estimatedMinutes != null || order.actualSeconds > 0) && (
          <div className="text-xs text-gray-500 mb-4">
            Time: {formatHM(order.actualSeconds / 60)}
            {order.estimatedMinutes != null && ` / ${formatHM(order.estimatedMinutes)} est.`}
          </div>
        )}

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
                        : "bg-[#2166AC] text-white hover:bg-[#1a5490]"
                    }`}
                  >
                    {ns === "PENDING" && order.status === "REQUESTED" ? "Accept" :
                     ns === "PENDING" && order.status === "IN_PROGRESS" ? "Revert to Accepted" :
                     ns === "IN_PROGRESS" ? "Start Work" :
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
