"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import api, { getServerClockOffset } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import StatusPipeline from "@/components/StatusPipeline";
import Breadcrumbs from "@/components/Breadcrumbs";
import EmptyState from "@/components/EmptyState";
import ProgressThread, { type ProgressAttachment } from "@/components/ProgressThread";

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
  isBreakdown: boolean;
  estimatedMinutes: number | null;
  actualSeconds: number;
  timerStartedAt: string | null;
  createdAt: string;
  asset: { id: string; name: string } | null;
  comments: {
    id: string;
    body: string;
    authorName: string;
    createdAt: string;
    attachments?: ProgressAttachment[];
  }[];
  assignments: { id: string; employeeId: string; employee: { id: string; name: string; position: string | null } }[];
  // Omitted by the API for CLIENT users — parts carry cost, which clients don't see yet.
  parts?: WorkOrderPart[];
};

type WorkOrderPart = {
  id: string;
  description: string;
  quantity: number;
  unitCost: number | null;
  supplier: string | null;
  // Set when the line was picked from the account's spare-parts catalogue, in
  // which case saving it also draws that part's stock down.
  partId: string | null;
  part?: { id: string; name: string; unit: string | null; quantityOnHand: number } | null;
};

type CatalogPart = {
  id: string;
  name: string;
  partNumber: string | null;
  unit: string | null;
  unitCost: number | null;
  quantityOnHand: number;
};

const STATUS_CONFIG: Record<WorkOrderStatus, { label: string; cls: string }> = {
  REQUESTED:   { label: "Requested",   cls: "bg-[var(--tu-soft-info)] text-[var(--tu-on-info)]" },
  PENDING:     { label: "Accepted",    cls: "bg-[var(--tu-soft-brand)] text-[var(--tu-on-brand)]" },
  IN_PROGRESS: { label: "In Progress", cls: "bg-[var(--tu-soft-warning)] text-[var(--tu-on-warning)]" },
  ON_HOLD:     { label: "On Hold",     cls: "bg-[var(--tu-soft-neutral)] text-[var(--tu-on-neutral)]" },
  COMPLETED:   { label: "Completed",   cls: "bg-[var(--tu-soft-success)] text-[var(--tu-on-success)]" },
  REJECTED:    { label: "Rejected",    cls: "bg-[var(--tu-soft-danger)] text-[var(--tu-on-danger)]" },
};

const PRIORITY_CONFIG: Record<WorkOrderPriority, { label: string; cls: string }> = {
  LOW:      { label: "Low",      cls: "bg-[var(--tu-soft-success)] text-[var(--tu-on-success)]" },
  MEDIUM:   { label: "Medium",   cls: "bg-[var(--tu-soft-brand)] text-[var(--tu-on-brand)]" },
  HIGH:     { label: "High",     cls: "bg-[var(--tu-soft-warning)] text-[var(--tu-on-warning)]" },
  CRITICAL: { label: "Critical", cls: "bg-[var(--tu-soft-danger)] text-[var(--tu-on-danger)]" },
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

function formatPeso(amount: number) {
  return `₱${amount.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Quantities are stored as floats so fractional units (2.5 L of oil) work, but
// whole numbers should read as "3", not "3.00".
function formatQty(qty: number) {
  return Number.isInteger(qty) ? String(qty) : String(Math.round(qty * 100) / 100);
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
  // Files chosen but not yet posted. An update is one entry — note and photos
  // together — so they are held here until Post rather than uploaded on pick.
  const [staged, setStaged] = useState<File[]>([]);
  const [progressError, setProgressError] = useState("");
  const progressFileRef = useRef<HTMLInputElement>(null);

  // Assignment picker
  const [accountEmployees, setAccountEmployees] = useState<AccountEmployee[]>([]);
  const [showAssignPicker, setShowAssignPicker] = useState(false);
  const [empSearch, setEmpSearch] = useState("");
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  // Edit mode for non-status fields
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ priority: "MEDIUM" as WorkOrderPriority, dueDate: "", category: "", estimatedMinutes: "" });
  const [savingBreakdown, setSavingBreakdown] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);

  // Parts used. A line can either point at a catalogue part (which draws its
  // stock down when saved) or be plain free text for anything not stocked.
  const emptyPartForm = { partId: "", description: "", quantity: "1", unitCost: "", supplier: "" };
  const [showPartForm, setShowPartForm] = useState(false);
  const [partForm, setPartForm] = useState(emptyPartForm);
  const [editingPartId, setEditingPartId] = useState<string | null>(null);
  const [savingPart, setSavingPart] = useState(false);
  const [partError, setPartError] = useState<string | null>(null);
  const [removingPartId, setRemovingPartId] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<CatalogPart[]>([]);

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
      // drop them and crash the comments/parts sections.
      setOrder((prev) => prev
        ? { ...prev, ...res.data, comments: res.data.comments ?? prev.comments, parts: res.data.parts ?? prev.parts }
        : res.data);
      setEditing(false);
    } catch {
      // silent
    } finally {
      setSavingEdit(false);
    }
  }

  /**
   * Reclassifies the order as a breakdown (or not) after the fact.
   *
   * Deliberately separate from the edit form, which is closed once an order is
   * terminal. Diagnosis usually lands *after* the work is done — a request comes
   * in as "no aircon in unit 5" and only turns out to be a compressor failure
   * once someone opens it up. Mean time to repair is measured over completed
   * orders, so if a finished job could not be flagged, it would never count.
   */
  async function setBreakdown(next: boolean) {
    if (!order) return;
    setSavingBreakdown(true);
    try {
      const res = await api.patch(`/work-orders/${order.id}`, { isBreakdown: next });
      // PATCH responses omit comments (and other relations); merge so we don't
      // drop them and crash the comments/parts sections.
      setOrder((prev) => prev
        ? { ...prev, ...res.data, comments: res.data.comments ?? prev.comments, parts: res.data.parts ?? prev.parts }
        : res.data);
    } catch {
      // silent
    } finally {
      setSavingBreakdown(false);
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
      // drop them and crash the comments/parts sections.
      setOrder((prev) => prev
        ? { ...prev, ...res.data, comments: res.data.comments ?? prev.comments, parts: res.data.parts ?? prev.parts }
        : res.data);
      setShowCompleteForm(false);
      setRemarks("");
    } catch {
      // silent
    } finally {
      setUpdatingStatus(false);
    }
  }

  // Loaded lazily the first time the part form opens — most visits to a work
  // order never touch parts, so there's no reason to fetch the catalogue upfront.
  async function loadCatalog() {
    if (catalog.length > 0) return;
    try {
      const res = await api.get(`/accounts/${accountId}/parts`);
      setCatalog(res.data);
    } catch {
      // Silent: the form still works as free text without the catalogue.
    }
  }

  // Picking a catalogue part fills in the name and cost, but both stay editable
  // — the price paid on the day can differ from the catalogue's.
  function selectCatalogPart(partId: string) {
    const picked = catalog.find((c) => c.id === partId);
    setPartForm((f) => ({
      ...f,
      partId,
      description: picked ? picked.name : f.description,
      unitCost: picked?.unitCost != null ? String(picked.unitCost) : f.unitCost,
    }));
  }

  function openPartForm(part?: WorkOrderPart) {
    setPartError(null);
    loadCatalog();
    if (part) {
      setEditingPartId(part.id);
      setPartForm({
        partId: part.partId ?? "",
        description: part.description,
        quantity: String(part.quantity),
        unitCost: part.unitCost != null ? String(part.unitCost) : "",
        supplier: part.supplier ?? "",
      });
    } else {
      setEditingPartId(null);
      setPartForm(emptyPartForm);
    }
    setShowPartForm(true);
  }

  function closePartForm() {
    setShowPartForm(false);
    setEditingPartId(null);
    setPartForm(emptyPartForm);
    setPartError(null);
  }

  async function savePart() {
    if (!order || savingPart) return;
    const description = partForm.description.trim();
    if (!description) { setPartError("Part description is required"); return; }
    const quantity = Number(partForm.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) { setPartError("Quantity must be greater than 0"); return; }
    const costRaw = partForm.unitCost.trim();
    const unitCost = costRaw === "" ? null : Number(costRaw);
    if (unitCost != null && (!Number.isFinite(unitCost) || unitCost < 0)) {
      setPartError("Unit cost must be 0 or more"); return;
    }

    setSavingPart(true);
    setPartError(null);
    const body = {
      description,
      quantity,
      unitCost,
      supplier: partForm.supplier.trim() || null,
      partId: partForm.partId || null,
    };
    try {
      if (editingPartId) {
        const res = await api.patch(`/work-orders/${order.id}/parts/${editingPartId}`, body);
        setOrder((prev) => prev
          ? { ...prev, parts: (prev.parts ?? []).map((p) => (p.id === editingPartId ? res.data : p)) }
          : prev);
      } else {
        const res = await api.post(`/work-orders/${order.id}/parts`, body);
        setOrder((prev) => prev ? { ...prev, parts: [...(prev.parts ?? []), res.data] } : prev);
      }
      // The catalogue's on-hand figures are now stale — refetch so the picker
      // shows what is actually left.
      setCatalog([]);
      loadCatalog();
      closePartForm();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setPartError(e?.response?.data?.error ?? "Could not save the part. Please try again.");
    } finally {
      setSavingPart(false);
    }
  }

  async function removePart(partId: string) {
    if (!order) return;
    setRemovingPartId(partId);
    try {
      await api.delete(`/work-orders/${order.id}/parts/${partId}`);
      setOrder((prev) => prev ? { ...prev, parts: (prev.parts ?? []).filter((p) => p.id !== partId) } : prev);
      if (editingPartId === partId) closePartForm();
    } catch {
      // silent
    } finally {
      setRemovingPartId(null);
    }
  }

  async function addComment() {
    const text = commentText.trim();
    // Either alone is a valid update: a set of photos needs no caption, and a
    // note needs no photos.
    if ((!text && staged.length === 0) || submittingComment || !order) return;
    setSubmittingComment(true);
    setProgressError("");
    try {
      // Multipart only when there is something to upload, so text-only posts
      // stay a plain JSON request.
      let res;
      if (staged.length > 0) {
        const form = new FormData();
        if (text) form.append("body", text);
        for (const f of staged) form.append("files", f);
        res = await api.post(`/work-orders/${order.id}/comments`, form);
      } else {
        res = await api.post(`/work-orders/${order.id}/comments`, { body: text });
      }
      setOrder((prev) => prev ? { ...prev, comments: [...prev.comments, res.data] } : prev);
      setCommentText("");
      setStaged([]);
      if (progressFileRef.current) progressFileRef.current.value = "";
    } catch (err: unknown) {
      const r = (err as { response?: { data?: { error?: string } } })?.response;
      setProgressError(r?.data?.error ?? "Could not post that update.");
    } finally {
      setSubmittingComment(false);
    }
  }

  function stageFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    setProgressError("");
    const tooBig = picked.find((f) => f.size > 15 * 1024 * 1024);
    if (tooBig) {
      // Surfaced instantly here; the API enforces the limit regardless.
      setProgressError(`"${tooBig.name}" is over the 15 MB limit.`);
      return;
    }
    setStaged((prev) => [...prev, ...picked].slice(0, 8));
  }

  if (loading) {
    return (
      <div className="p-8 max-w-4xl mx-auto">
        <div className="h-8 w-48 bg-[var(--tu-bg-secondary-strong)] rounded animate-pulse mb-4" />
        <div className="h-64 bg-[var(--tu-bg-surface)] rounded-xl border border-[var(--tu-border)] animate-pulse" />
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="p-8">
        <div className="bg-[var(--tu-soft-danger)] border border-[var(--tu-bd-danger)] text-[var(--tu-on-danger)] text-sm rounded-lg px-4 py-3">
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

  // Parts used. Lines with no unit cost are counted but left out of the total,
  // and flagged so the figure isn't mistaken for a complete cost.
  const parts = order.parts ?? [];
  const partsTotal = parts.reduce((sum, p) => sum + (p.unitCost ?? 0) * p.quantity, 0);
  const partsMissingCost = parts.filter((p) => p.unitCost == null).length;

  const selectedCatalogPart = partForm.partId ? catalog.find((c) => c.id === partForm.partId) ?? null : null;
  // Warn when the job would take more than the count knows about. Only the
  // extra beyond what this line already consumed counts when editing.
  const alreadyIssued = editingPartId
    ? parts.find((p) => p.id === editingPartId && p.partId === partForm.partId)?.quantity ?? 0
    : 0;
  const shortStock =
    !!selectedCatalogPart && (Number(partForm.quantity) || 0) - alreadyIssued > selectedCatalogPart.quantityOnHand;

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <Breadcrumbs
        items={[
          { label: "Work Orders", href: `/accounts/${accountId}/work-orders` },
          { label: order.title },
        ]}
      />

      {/* Main card */}
      <div className="bg-[var(--tu-bg-surface)] rounded-xl border border-[var(--tu-border)] shadow-sm p-6 mb-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-[var(--tu-text-heading)]">{order.title}</h1>
            <div className="flex items-center gap-2 flex-wrap mt-1">
              {order.isSpecialProject && (
                <span className="text-xs font-semibold text-[var(--tu-on-warning)] bg-[var(--tu-soft-warning)] rounded-full px-2 py-0.5">
                  ★ Special Project
                </span>
              )}
              {order.isBreakdown && (
                <span className="text-xs font-semibold text-[var(--tu-on-danger)] bg-[var(--tu-soft-danger)] rounded-full px-2 py-0.5">
                  Breakdown
                </span>
              )}
              {/* Available at any status, including completed — see setBreakdown. */}
              {canManage && (
                <button
                  type="button"
                  onClick={() => setBreakdown(!order.isBreakdown)}
                  disabled={savingBreakdown}
                  className="text-xs text-[var(--tu-text-subtle)] underline decoration-dotted underline-offset-2 hover:text-[var(--tu-text-heading)] disabled:opacity-50 cursor-pointer bg-transparent border-none p-0"
                  title={
                    order.isBreakdown
                      ? "Stop counting this as an equipment failure in the reliability report"
                      : "Count this as an equipment failure in the reliability report"
                  }
                >
                  {savingBreakdown
                    ? "Saving…"
                    : order.isBreakdown
                      ? "Not a breakdown"
                      : "Mark as breakdown"}
                </button>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {canManage && !isTerminal && (
              <button
                onClick={openEdit}
                className="text-xs text-[var(--tu-text-subtle)] border border-[var(--tu-border)] rounded-lg px-3 py-1.5 hover:bg-[var(--tu-bg-secondary)] cursor-pointer"
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
          <div className="bg-[var(--tu-soft-danger)] rounded-lg p-2.5 my-2.5 text-center text-[13px] font-semibold text-[var(--tu-on-danger)]">
            This work order was rejected.
          </div>
        ) : (
          <>
            {order.status === "ON_HOLD" && (
              <div className="flex items-center justify-center gap-2 bg-[var(--tu-soft-neutral)] border border-[var(--tu-bd-neutral)] rounded-lg p-2.5 my-2.5 text-[13px] font-semibold text-[var(--tu-on-neutral)]">
                <span className="flex gap-[3px]" aria-hidden="true">
                  <span className="w-[3px] h-3.5 rounded-sm bg-[var(--tu-status-on-hold)]" />
                  <span className="w-[3px] h-3.5 rounded-sm bg-[var(--tu-status-on-hold)]" />
                </span>
                On hold — work is paused. Resume it to continue.
              </div>
            )}
            <StatusPipeline status={order.status} steps={PIPELINE_STEPS} ariaLabel={`Status: ${cfg.label}`} />
          </>
        )}

        {/* Inline edit form */}
        {editing && (
          <div className="bg-[var(--tu-bg-secondary)] rounded-xl p-4 mb-4 border border-[var(--tu-border)]">
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-xs font-semibold text-[var(--tu-text-subtle)] mb-1">Priority</label>
                <select
                  className="w-full border border-[var(--tu-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--tu-text-brand)]"
                  value={editForm.priority}
                  onChange={(e) => setEditForm((f) => ({ ...f, priority: e.target.value as WorkOrderPriority }))}
                >
                  {(["LOW", "MEDIUM", "HIGH", "CRITICAL"] as WorkOrderPriority[]).map((p) => (
                    <option key={p} value={p}>{PRIORITY_CONFIG[p].label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--tu-text-subtle)] mb-1">Category</label>
                <input
                  className="w-full border border-[var(--tu-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--tu-text-brand)]"
                  value={editForm.category}
                  onChange={(e) => setEditForm((f) => ({ ...f, category: e.target.value }))}
                  placeholder="e.g. Electrical, HVAC"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--tu-text-subtle)] mb-1">Due Date</label>
                <input
                  type="date"
                  className="w-full border border-[var(--tu-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--tu-text-brand)]"
                  value={editForm.dueDate}
                  onChange={(e) => setEditForm((f) => ({ ...f, dueDate: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--tu-text-subtle)] mb-1">Est. Minutes</label>
                <input
                  type="number"
                  min="0"
                  className="w-full border border-[var(--tu-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--tu-text-brand)]"
                  value={editForm.estimatedMinutes}
                  onChange={(e) => setEditForm((f) => ({ ...f, estimatedMinutes: e.target.value }))}
                  placeholder="e.g. 120"
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setEditing(false)}
                className="px-3 py-1.5 text-xs text-[var(--tu-text-body)] border border-[var(--tu-border)] rounded-lg hover:bg-[var(--tu-bg-secondary-strong)] cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={saveEdit}
                disabled={savingEdit}
                className="px-3 py-1.5 text-xs text-white bg-[var(--tu-text-brand)] rounded-lg hover:bg-[var(--tu-text-brand-strong)] disabled:opacity-50 cursor-pointer"
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
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${order.type === "INTERNAL" ? "bg-[var(--tu-soft-brand)] text-[var(--tu-on-brand)]" : "bg-[var(--tu-soft-warning)] text-[var(--tu-on-warning)]"}`}>
            {order.type === "INTERNAL" ? "Internal" : "External"}
          </span>
          {order.category && (
            <span className="rounded-full px-2 py-0.5 text-xs font-semibold bg-[var(--tu-bg-secondary-strong)] text-[var(--tu-text-body)]">
              {order.category}
            </span>
          )}
          {order.dueDate && (
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${isOverdue ? "bg-[var(--tu-soft-danger)] text-[var(--tu-on-danger)]" : "bg-[var(--tu-bg-secondary-strong)] text-[var(--tu-text-subtle)]"}`}>
              {isOverdue ? "Overdue · " : "Due "}{new Date(order.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </span>
          )}
        </div>

        {/* Description */}
        {order.description && (
          <p className="text-sm text-[var(--tu-text-body)] mb-4 leading-relaxed">{order.description}</p>
        )}

        {/* Asset */}
        {order.asset && (
          <p className="text-sm mb-4">
            <span className="text-[var(--tu-text-subtle)]">Asset: </span>
            <Link
              href={`/accounts/${accountId}/assets/${order.asset.id}`}
              className="text-[var(--tu-text-brand)] hover:underline"
            >
              {order.asset.name}
            </Link>
          </p>
        )}

        {/* Assignees */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs font-semibold text-[var(--tu-text-subtle)] uppercase tracking-wide">Assigned To</p>
            {canManage && !isTerminal && (
              <button
                onClick={openAssignPicker}
                className="text-xs text-[var(--tu-text-brand)] hover:underline cursor-pointer"
              >
                + Add
              </button>
            )}
          </div>
          {order.assignments.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {order.assignments.map((a) => (
                <span key={a.id} className="inline-flex items-center gap-1.5 text-xs bg-[var(--tu-bg-secondary-strong)] text-[var(--tu-text-body)] rounded-full px-2.5 py-1 font-medium">
                  <Link href={`/accounts/${accountId}/employees/${a.employee.id}`} className="hover:text-[var(--tu-text-brand)] hover:underline">
                    {a.employee.name}
                  </Link>
                  {a.employee.position && <span className="text-[var(--tu-text-subtle)]">· {a.employee.position}</span>}
                  {canManage && !isTerminal && (
                    <button
                      onClick={() => removeAssignment(a.employeeId)}
                      disabled={removingId === a.employeeId}
                      className="text-[var(--tu-text-subtle)] hover:text-[var(--tu-on-danger)] cursor-pointer leading-none"
                      aria-label={`Remove ${a.employee.name}`}
                    >
                      {removingId === a.employeeId ? "…" : "×"}
                    </button>
                  )}
                </span>
              ))}
            </div>
          ) : (
            <EmptyState compact icon="employee" title="No employees assigned" hint="Assign a technician so this work order shows on their queue." />
          )}

          {/* Assign picker */}
          {showAssignPicker && (
            <div className="mt-3 border border-[var(--tu-border)] rounded-xl overflow-hidden shadow-sm">
              <div className="p-3 border-b border-[var(--tu-border)]">
                <input
                  className="w-full border border-[var(--tu-border)] rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--tu-text-brand)]"
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
                      className="w-full text-left px-4 py-2.5 text-sm hover:bg-[var(--tu-bg-secondary)] flex items-center justify-between cursor-pointer transition-colors"
                    >
                      <div>
                        <span className="font-medium text-[var(--tu-text-heading)]">{e.name}</span>
                        {e.position && <span className="text-[var(--tu-text-subtle)] text-xs ml-2">{e.position}</span>}
                      </div>
                      {assigningId === e.id && <span className="text-xs text-[var(--tu-text-subtle)]">…</span>}
                    </button>
                  ))}
                {accountEmployees.filter((e) => !order.assignments.some((a) => a.employeeId === e.id)).length === 0 && (
                  <p className="text-xs text-[var(--tu-text-subtle)] text-center py-4">All employees assigned.</p>
                )}
              </div>
              <div className="p-2 border-t border-[var(--tu-border)]">
                <button
                  onClick={() => setShowAssignPicker(false)}
                  className="w-full text-xs text-[var(--tu-text-subtle)] py-1.5 hover:bg-[var(--tu-bg-secondary)] rounded-lg cursor-pointer"
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
            <div className="border border-[var(--tu-border)] rounded-xl p-4 mb-4">
              <p className="text-xs font-semibold text-[var(--tu-text-subtle)] uppercase tracking-wide mb-3">Time Tracking · Man-Hours</p>

              {/* Expected */}
              <div className="flex items-center justify-between gap-3 mb-3">
                <span className="text-sm text-[var(--tu-text-subtle)]">Expected</span>
                {editingEst ? (
                  <div className="flex items-center gap-1.5">
                    <input type="number" min={0} value={estHrs} onChange={(e) => setEstHrs(e.target.value)} placeholder="0"
                      className="w-14 border border-[var(--tu-border)] rounded-lg px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-[var(--tu-text-brand)]" />
                    <span className="text-xs text-[var(--tu-text-subtle)]">h</span>
                    <input type="number" min={0} max={59} value={estMins} onChange={(e) => setEstMins(e.target.value)} placeholder="0"
                      className="w-14 border border-[var(--tu-border)] rounded-lg px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-[var(--tu-text-brand)]" />
                    <span className="text-xs text-[var(--tu-text-subtle)]">m</span>
                    <button onClick={saveEstimate} className="ml-1 text-xs font-semibold text-white bg-[var(--tu-text-brand)] rounded-lg px-2.5 py-1 hover:bg-[var(--tu-text-brand-strong)] cursor-pointer">Save</button>
                    <button onClick={() => setEditingEst(false)} className="text-xs text-[var(--tu-text-subtle)] px-1 cursor-pointer">Cancel</button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-[var(--tu-text-heading)]">{estMin != null ? formatHM(estMin) : "Not set"}</span>
                    {canManage && (
                      <button
                        onClick={() => { setEstHrs(estMin != null ? String(Math.floor(estMin / 60)) : ""); setEstMins(estMin != null ? String(estMin % 60) : ""); setEditingEst(true); }}
                        className="text-xs text-[var(--tu-text-brand)] hover:underline cursor-pointer"
                      >
                        {estMin != null ? "Edit" : "Set"}
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Live timer / actual */}
              <div className="bg-[var(--tu-bg-secondary)] rounded-lg p-3 flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-semibold text-[var(--tu-text-subtle)] uppercase tracking-wide">{isDone ? "Actual" : "Elapsed"}</p>
                  <p className={`text-2xl font-bold tabular-nums ${overBudget ? "text-[var(--tu-on-danger)]" : "text-[var(--tu-text-heading)]"}`}>{formatTimer(liveSeconds)}</p>
                </div>
                {!isDone && (
                  <span className={`text-xs font-semibold ${timerRunning ? "text-[var(--tu-on-success)]" : "text-[var(--tu-on-neutral)]"}`}>
                    {timerRunning ? "● Running" : "❚❚ Paused"}
                  </span>
                )}
              </div>

              {/* Budget progress */}
              {pct != null && (
                <div className="mt-3">
                  <div className="h-1.5 bg-[var(--tu-bg-secondary-strong)] rounded-full overflow-hidden">
                    <div className={`h-1.5 rounded-full ${overBudget ? "bg-[var(--tu-priority-critical)]" : "bg-[var(--tu-text-brand)]"}`} style={{ width: `${pct}%` }} />
                  </div>
                  <p className="text-[11px] text-[var(--tu-text-subtle)] mt-1">
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
                    order.timerStartedAt ? "bg-[var(--tu-soft-neutral)] text-[var(--tu-on-neutral)] hover:bg-[var(--tu-bg-tertiary)]" : "bg-[var(--tu-text-brand)] text-white hover:bg-[var(--tu-text-brand-strong)]"
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
          <div className="bg-[var(--tu-soft-success)] rounded-lg p-3 mb-4">
            {order.remarks && (
              <p className="text-sm text-[var(--tu-text-body)] italic mb-1">&quot;{order.remarks}&quot;</p>
            )}
            {order.completedAt && (
              <p className="text-xs text-[var(--tu-text-subtle)]">Completed {formatDate(order.completedAt)}</p>
            )}
          </div>
        )}

        <p className="text-xs text-[var(--tu-text-subtle)]">Created {formatDate(order.createdAt)}</p>

        {/* Status actions */}
        {canActOnStatus && nextStatuses.length > 0 && (
          <div className="mt-4 pt-4 border-t border-[var(--tu-border)]">
            {showCompleteForm && order.status === "IN_PROGRESS" ? (
              <div>
                <textarea
                  className="w-full border border-[var(--tu-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--tu-text-brand)] resize-none mb-3"
                  rows={3}
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="Add closing remarks (optional)"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowCompleteForm(false)}
                    className="px-3 py-1.5 text-xs text-[var(--tu-text-body)] border border-[var(--tu-border)] rounded-lg hover:bg-[var(--tu-bg-secondary)] cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => updateStatus("COMPLETED")}
                    disabled={updatingStatus}
                    className="px-3 py-1.5 text-xs text-white bg-[var(--tu-status-completed)] rounded-lg hover:bg-[var(--tu-status-completed)] disabled:opacity-50 cursor-pointer"
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
                        ? "bg-[var(--tu-soft-danger)] text-[var(--tu-on-danger)] hover:bg-[var(--tu-soft-danger)]"
                        : ns === "COMPLETED"
                        ? "bg-[var(--tu-soft-success)] text-[var(--tu-on-success)] hover:bg-[var(--tu-soft-success)]"
                        : ns === "ON_HOLD"
                        ? "bg-[var(--tu-soft-neutral)] text-[var(--tu-on-neutral)] hover:bg-[var(--tu-bg-tertiary)]"
                        : "bg-[var(--tu-text-brand)] text-white hover:bg-[var(--tu-text-brand-strong)]"
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
          <div className="mt-4 pt-4 border-t border-[var(--tu-border)]">
            <p className="text-xs text-[var(--tu-on-warning)] bg-[var(--tu-soft-warning)] rounded-lg px-3 py-2">
              Awaiting manager approval for this special project.
            </p>
          </div>
        )}
      </div>

      {/* Parts used — staff only; clients don't see parts cost yet */}
      {canManage && (
        <div className="bg-[var(--tu-bg-surface)] rounded-xl border border-[var(--tu-border)] shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-[var(--tu-text-body)]">
                Parts Used {parts.length > 0 && `(${parts.length})`}
              </h2>
              <p className="text-xs text-[var(--tu-text-subtle)] mt-0.5">
                Recorded for job costing. Lines picked from stock also draw down the spare-parts count.
              </p>
            </div>
            {!showPartForm && (
              <button
                onClick={() => openPartForm()}
                className="px-3 py-1.5 text-xs font-semibold text-[var(--tu-text-brand)] border border-[var(--tu-text-brand)] rounded-lg hover:bg-[var(--tu-soft-brand)] cursor-pointer"
              >
                + Add Part
              </button>
            )}
          </div>

          {parts.length === 0 && !showPartForm ? (
            <EmptyState compact icon="part" title="No parts recorded" hint="Log the spare parts consumed so stock levels stay accurate." />
          ) : parts.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-[var(--tu-text-subtle)] border-b border-[var(--tu-border)]">
                    <th className="pb-2 font-medium">Part</th>
                    <th className="pb-2 font-medium text-right">Qty</th>
                    <th className="pb-2 font-medium text-right">Unit Cost</th>
                    <th className="pb-2 font-medium text-right">Total</th>
                    <th className="pb-2" />
                  </tr>
                </thead>
                <tbody>
                  {parts.map((p) => (
                    <tr key={p.id} className="border-b border-[var(--tu-border)] last:border-0">
                      <td className="py-2 pr-2 text-[var(--tu-text-body)]">
                        {p.description}
                        {p.partId ? (
                          <Link
                            href={`/accounts/${accountId}/parts/${p.partId}`}
                            className="block text-xs text-[var(--tu-text-brand)] hover:underline"
                          >
                            From stock{p.part ? ` · ${formatQty(p.part.quantityOnHand)}${p.part.unit ? ` ${p.part.unit}` : ""} left` : ""}
                          </Link>
                        ) : (
                          p.supplier && <span className="block text-xs text-[var(--tu-text-subtle)]">{p.supplier}</span>
                        )}
                      </td>
                      <td className="py-2 px-2 text-right text-[var(--tu-text-body)] whitespace-nowrap">{formatQty(p.quantity)}</td>
                      <td className="py-2 px-2 text-right text-[var(--tu-text-body)] whitespace-nowrap">
                        {p.unitCost != null ? formatPeso(p.unitCost) : <span className="text-[var(--tu-text-disabled)]">—</span>}
                      </td>
                      <td className="py-2 px-2 text-right font-medium text-[var(--tu-text-body)] whitespace-nowrap">
                        {p.unitCost != null ? formatPeso(p.unitCost * p.quantity) : <span className="text-[var(--tu-text-disabled)]">—</span>}
                      </td>
                      <td className="py-2 pl-2 text-right whitespace-nowrap">
                        <button
                          onClick={() => openPartForm(p)}
                          className="text-xs text-[var(--tu-text-subtle)] hover:text-[var(--tu-text-brand)] cursor-pointer"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => removePart(p.id)}
                          disabled={removingPartId === p.id}
                          className="ml-3 text-xs text-[var(--tu-text-subtle)] hover:text-[var(--tu-on-danger)] disabled:opacity-50 cursor-pointer"
                        >
                          {removingPartId === p.id ? "..." : "Remove"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={3} className="pt-3 text-right text-xs font-semibold text-[var(--tu-text-subtle)] pr-2">
                      Total parts cost
                    </td>
                    <td className="pt-3 text-right text-sm font-semibold text-[var(--tu-text-heading)] whitespace-nowrap">
                      {formatPeso(partsTotal)}
                    </td>
                    <td />
                  </tr>
                  {partsMissingCost > 0 && (
                    <tr>
                      <td colSpan={5} className="pt-1 text-right text-xs text-[var(--tu-on-warning)]">
                        {partsMissingCost} {partsMissingCost === 1 ? "line has" : "lines have"} no unit cost — not included in the total.
                      </td>
                    </tr>
                  )}
                </tfoot>
              </table>
            </div>
          )}

          {showPartForm && (
            <div className="mt-4 pt-4 border-t border-[var(--tu-border)]">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {catalog.length > 0 && (
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-[var(--tu-text-subtle)] mb-1">From spare parts stock (optional)</label>
                    <select
                      className="w-full border border-[var(--tu-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--tu-text-brand)] bg-[var(--tu-bg-surface)]"
                      value={partForm.partId}
                      onChange={(e) => selectCatalogPart(e.target.value)}
                    >
                      <option value="">Not from stock — free text</option>
                      {catalog.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}{c.partNumber ? ` (${c.partNumber})` : ""} — {formatQty(c.quantityOnHand)}{c.unit ? ` ${c.unit}` : ""} on hand
                        </option>
                      ))}
                    </select>
                    {selectedCatalogPart && (
                      <p className="text-xs text-[var(--tu-text-subtle)] mt-1">
                        Saving this deducts{" "}
                        <strong>{formatQty(Number(partForm.quantity) || 0)}{selectedCatalogPart.unit ? ` ${selectedCatalogPart.unit}` : ""}</strong>{" "}
                        from stock
                        {editingPartId ? " (adjusted for what this line already used)" : ""}.
                        {" "}
                        <Link href={`/accounts/${accountId}/parts/${selectedCatalogPart.id}`} className="text-[var(--tu-text-brand)] hover:underline">
                          View part
                        </Link>
                      </p>
                    )}
                    {shortStock && (
                      <p className="text-xs text-[var(--tu-on-warning)] mt-1">
                        Only {formatQty(selectedCatalogPart!.quantityOnHand)} on hand. You can still record it — the count will go negative and flag for correction.
                      </p>
                    )}
                  </div>
                )}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-[var(--tu-text-subtle)] mb-1">Part / material</label>
                  <input
                    autoFocus
                    className="w-full border border-[var(--tu-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--tu-text-brand)]"
                    value={partForm.description}
                    onChange={(e) => setPartForm({ ...partForm, description: e.target.value })}
                    placeholder="e.g. 1/2 HP capacitor"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--tu-text-subtle)] mb-1">Quantity</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    className="w-full border border-[var(--tu-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--tu-text-brand)]"
                    value={partForm.quantity}
                    onChange={(e) => setPartForm({ ...partForm, quantity: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--tu-text-subtle)] mb-1">Unit cost (₱, optional)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="w-full border border-[var(--tu-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--tu-text-brand)]"
                    value={partForm.unitCost}
                    onChange={(e) => setPartForm({ ...partForm, unitCost: e.target.value })}
                    placeholder="Leave blank if unknown"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-[var(--tu-text-subtle)] mb-1">Supplier / source (optional)</label>
                  <input
                    className="w-full border border-[var(--tu-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--tu-text-brand)]"
                    value={partForm.supplier}
                    onChange={(e) => setPartForm({ ...partForm, supplier: e.target.value })}
                    placeholder="e.g. Client-supplied, ACE Hardware"
                  />
                </div>
              </div>
              {partError && <p className="text-xs text-[var(--tu-on-danger)] mt-2">{partError}</p>}
              <div className="flex gap-2 mt-3">
                <button
                  onClick={closePartForm}
                  className="px-3 py-1.5 text-xs text-[var(--tu-text-body)] border border-[var(--tu-border)] rounded-lg hover:bg-[var(--tu-bg-secondary)] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={savePart}
                  disabled={savingPart}
                  className="px-3 py-1.5 text-xs font-semibold text-white bg-[var(--tu-text-brand)] rounded-lg hover:bg-[var(--tu-text-brand-strong)] disabled:opacity-50 cursor-pointer"
                >
                  {savingPart ? "Saving..." : editingPartId ? "Save Changes" : "Add Part"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Progress — the running record of what happened and when: notes,
          photos, and the paperwork that goes with them. */}
      <ProgressThread
        entries={order.comments}
        text={commentText}
        onTextChange={setCommentText}
        staged={staged}
        onStageFiles={stageFiles}
        onUnstage={(i) => setStaged((prev) => prev.filter((_, n) => n !== i))}
        fileInputRef={progressFileRef}
        onPost={addComment}
        posting={submittingComment}
        error={progressError}
      />
    </div>
  );
}
