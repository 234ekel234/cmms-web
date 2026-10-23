"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import api, { getServerClockOffset } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import StatusPipeline, { APPROVAL_STEPS } from "@/components/StatusPipeline";
import { STAFF_TRANSITIONS, awaitingClient, awaitingReview, canSendBack, isReviewer, surveyable, isClosed, isSettled, needsClientApproval, stageNote, type StageFacts, workOrderRef } from "@/lib/workOrders";
import ReasonDialog from "@/components/ReasonDialog";
import WorkOrderHistory from "@/components/WorkOrderHistory";
import { SurveyForm, SurveyResult } from "@/components/ClientSurvey";
import { WORK_ORDER_STATUS } from "@/lib/statuses";
import Breadcrumbs from "@/components/Breadcrumbs";
import EmptyState from "@/components/EmptyState";
import ProgressThread, { type ProgressAttachment } from "@/components/ProgressThread";
import { canManage as canAdministerAccount } from "@/lib/rbac";
import { useConfirm } from "@/components/ConfirmDialog";

const PIPELINE_STEPS = ["Requested", "Accepted", "In Progress", "Completed", "Verified"];

type WorkOrderStatus = "REQUESTED" | "PENDING" | "IN_PROGRESS" | "ON_HOLD" | "COMPLETED" | "APPROVED" | "REJECTED";
type WorkOrderPriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

// StageFacts: why the clock stopped and when sign-off closes itself — the stage line.
type WorkOrder = StageFacts & {
  id: string;
  number: number;
  title: string;
  description: string | null;
  type: "INTERNAL" | "EXTERNAL";
  status: WorkOrderStatus;
  priority: WorkOrderPriority;
  category: string | null;
  dueDate: string | null;
  remarks: string | null;
  completedAt: string | null;
  approvedAt: string | null;
  /** Null when the daily sweep closed it rather than a person — see the note
      where this is rendered; the two must not read the same. */
  approvedByName: string | null;
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
  // The steps for this job — typed here, or copied from a maintenance plan's
  // steps when it raised the order. Clients see them; only staff may tick one.
  checklistItems: ChecklistItem[];
  /** Set when a maintenance plan raised this order. */
  planId: string | null;
  // Omitted by the API for CLIENT users, along with `parts` — a client sees the
  // work, not the rota behind it.
  plan?: { id: string; title: string; frequency: string } | null;
  // Omitted by the API for CLIENT users — parts carry cost, which clients don't see yet.
  parts?: WorkOrderPart[];
  // Every press of Pause, newest first, with the reason given. Omitted by the
  // API for CLIENT users: it is how the time was spent, not the service.
  pauses?: WorkOrderPause[];
};

type WorkOrderPause = {
  id: string;
  reason: string;
  pausedByName: string;
  pausedAt: string;
  /** Null while this pause is still in force. */
  resumedAt: string | null;
};

type ChecklistItem = {
  id: string;
  description: string;
  isDone: boolean;
  order: number;
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

const PRIORITY_CONFIG: Record<WorkOrderPriority, { label: string; cls: string }> = {
  LOW:      { label: "Low",      cls: "bg-[var(--tu-soft-success)] text-[var(--tu-on-success)]" },
  MEDIUM:   { label: "Medium",   cls: "bg-[var(--tu-soft-brand)] text-[var(--tu-on-brand)]" },
  HIGH:     { label: "High",     cls: "bg-[var(--tu-soft-warning)] text-[var(--tu-on-warning)]" },
  CRITICAL: { label: "Critical", cls: "bg-[var(--tu-soft-danger)] text-[var(--tu-on-danger)]" },
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
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
  const confirm = useConfirm();
  const params = useParams();
  const accountId = params.accountId as string;
  const workOrderId = params.workOrderId as string;
  const { user } = useAuth();
  const [order, setOrder] = useState<WorkOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [remarks, setRemarks] = useState("");
  const [showCompleteForm, setShowCompleteForm] = useState(false);
  // Client review of finished work.
  const [sendingBack, setSendingBack] = useState(false);
  const [sendBackReason, setSendBackReason] = useState("");
  // Putting a job on hold, or a supervisor sending finished work back: both ask why.
  const [reasonDialog, setReasonDialog] = useState<null | "HOLD" | "SEND_BACK">(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);
  // Files chosen but not yet posted. An update is one entry — note and photos
  // together — so they are held here until Post rather than uploaded on pick.
  const [staged, setStaged] = useState<File[]>([]);
  const [progressError, setProgressError] = useState("");
  const progressFileRef = useRef<HTMLInputElement>(null);

  // Steps (checklist items)
  const [newStep, setNewStep] = useState("");
  const [addingStep, setAddingStep] = useState(false);
  // A set, not a single id: steps are independent rows and a technician works
  // down the list faster than a slow connection answers. Blocking on "any step
  // is saving" silently dropped every tick made while an earlier one was in
  // flight — the box flipped back on re-render with no error shown.
  const [savingSteps, setSavingSteps] = useState<ReadonlySet<string>>(new Set());
  const [stepError, setStepError] = useState("");

  // Assignment picker
  const [accountEmployees, setAccountEmployees] = useState<AccountEmployee[]>([]);
  const [showAssignPicker, setShowAssignPicker] = useState(false);
  const [empSearch, setEmpSearch] = useState("");
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  // Edit mode for non-status fields
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    priority: "MEDIUM" as WorkOrderPriority, dueDate: "", category: "", estimatedMinutes: "",
    title: "", description: "", assetId: "",
  });
  // The site's assets, loaded when the edit form first opens.
  const [editAssets, setEditAssets] = useState<{ id: string; name: string; assetCode?: string | null }[]>([]);
  const [editError, setEditError] = useState("");
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
  // Pausing asks why before it stops the clock; the API refuses a pause
  // without a reason.
  const [pausing, setPausing] = useState(false);
  const [pauseReason, setPauseReason] = useState("");
  const [timerError, setTimerError] = useState<string | null>(null);
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

  async function setTimer(action: "pause" | "resume", reason?: string) {
    if (!order) return;
    setTimerBusy(true);
    setTimerError(null);
    try {
      const res = await api.post(`/work-orders/${order.id}/timer`, { action, reason });
      setOrder((prev) => prev ? { ...prev, status: res.data.status, timerStartedAt: res.data.timerStartedAt, actualSeconds: res.data.actualSeconds } : prev);
      setPausing(false);
      setPauseReason("");
      // The timer route answers with the order but not its pause history, so
      // read that back quietly — fetchOrder would blank the page to a spinner.
      // Outside the error path on purpose: the clock has already changed, and
      // a failed re-read only means a stale list, not a failed pause.
      api
        .get(`/work-orders/${order.id}`)
        .then((fresh) => setOrder((prev) => prev ? { ...prev, pauses: fresh.data.pauses } : prev))
        .catch(() => {});
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setTimerError(msg ?? "Couldn't update the timer. Try again.");
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
  // "May act on this job" — true for a technician, whose own work this is.
  const canManage = user?.role !== "CLIENT";
  // "May decide what the job is, and who does it" — not a technician's call.
  // The API refuses both regardless; this is about not drawing a control whose
  // only outcome is a 403.
  const canAdmin = canAdministerAccount(user?.role);
  const isManager = user?.role === "GENERAL_MANAGER" || user?.role === "MANAGER";

  useEffect(() => { fetchOrder(); }, [workOrderId]);

  async function fetchOrder() {
    setLoading(true);
    setError(false);
    try {
      // One order, one request. This used to read the whole account's list and
      // search it client-side, for want of a single-order endpoint — every
      // work order on the site fetched to render one of them.
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
    const who = order.assignments.find((a) => a.employeeId === empId)?.employee.name ?? "This person";
    if (!(await confirm({
      title: "Unassign from this job?",
      message: `${who} will be taken off this work order.`,
      confirmLabel: "Unassign",
    }))) return;
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
      title: order.title,
      description: order.description ?? "",
      assetId: order.asset?.id ?? "",
    });
    setEditError("");
    setEditing(true);
    // Live assets only: the API refuses an archived one.
    if (editAssets.length === 0) {
      api.get(`/accounts/${accountId}/assets`).then((res) => setEditAssets(res.data)).catch(() => {});
    }
  }

  async function saveEdit() {
    if (!order) return;
    if (!editForm.title.trim()) { setEditError("A work order needs a title."); return; }
    setSavingEdit(true);
    setEditError("");
    try {
      const estMin = editForm.estimatedMinutes.trim();
      const res = await api.patch(`/work-orders/${order.id}`, {
        title: editForm.title.trim(),
        description: editForm.description.trim() || null,
        assetId: editForm.assetId || null,
        priority: editForm.priority,
        dueDate: editForm.dueDate || null,
        category: editForm.category.trim() || null,
        estimatedMinutes: estMin ? Number(estMin) : null,
      });
      // PATCH responses omit comments (and other relations); merge so we don't
      // drop them and crash the comments/parts sections.
      setOrder((prev) => prev
        ? {
            ...prev,
            ...res.data,
            comments: res.data.comments ?? prev.comments,
            parts: res.data.parts ?? prev.parts,
            checklistItems: res.data.checklistItems ?? prev.checklistItems,
          }
        : res.data);
      setEditing(false);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setEditError(e?.response?.data?.error ?? "Couldn't save the changes.");
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
        ? {
            ...prev,
            ...res.data,
            comments: res.data.comments ?? prev.comments,
            parts: res.data.parts ?? prev.parts,
            checklistItems: res.data.checklistItems ?? prev.checklistItems,
          }
        : res.data);
    } catch {
      // silent
    } finally {
      setSavingBreakdown(false);
    }
  }

  // Supervisor review of a technician's completed work.
  async function verifyWork() {
    if (!order) return;
    setUpdatingStatus(true);
    try {
      const res = await api.post(`/work-orders/${order.id}/verify`);
      setOrder((prev) => (prev ? { ...prev, ...res.data, comments: prev.comments, parts: prev.parts, checklistItems: prev.checklistItems } : prev));
    } catch {
      // The button stays; a refusal (already verified, sent back meanwhile) is
      // resolved by the refetch.
      await fetchOrder();
    } finally {
      setUpdatingStatus(false);
    }
  }

  // Returns the API's refusal, or null — the reason dialog shows the refusal.
  async function updateStatus(status: WorkOrderStatus, opts: { reason?: string } = {}): Promise<string | null> {
    if (!order) return null;
    if (status === "REJECTED" && !(await confirm({
      title: "Reject this work order?",
      message: "It will be closed without any work done. A rejected order can't be reopened.",
      confirmLabel: "Reject",
    }))) return null;
    setUpdatingStatus(true);
    try {
      const body: { status: WorkOrderStatus; remarks?: string; reason?: string } = { status };
      if (status === "COMPLETED" && remarks.trim()) body.remarks = remarks.trim();
      // Required by the API to go on hold, and to send completed work back.
      if (opts.reason) body.reason = opts.reason;
      const res = await api.patch(`/work-orders/${order.id}`, body);
      // PATCH responses omit comments (and other relations); merge so we don't
      // drop them and crash the comments/parts sections.
      setOrder((prev) => prev
        ? {
            ...prev,
            ...res.data,
            comments: res.data.comments ?? prev.comments,
            parts: res.data.parts ?? prev.parts,
            checklistItems: res.data.checklistItems ?? prev.checklistItems,
          }
        : res.data);
      // A send-back writes the client's reason as a comment server-side, and
      // that merge above deliberately keeps the *old* comment list — so without
      // this the client posts a reason and watches nothing happen, which reads
      // as a failure. Refetch to pull the new entry into the thread.
      if (opts.reason) await fetchOrder();
      setShowCompleteForm(false);
      setRemarks("");
      setSendingBack(false);
      setSendBackReason("");
      return null;
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      return e?.response?.data?.error ?? "Couldn't change the status. Try again.";
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
    const line = (order.parts ?? []).find((p) => p.id === partId);
    if (!(await confirm({
      title: "Remove this part?",
      message: line?.partId
        ? `“${line.description}” will be removed from this job and its quantity returned to stock.`
        : `“${line?.description ?? "This line"}” will be removed from this job.`,
      confirmLabel: "Remove",
    }))) return;
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

  async function toggleStep(item: ChecklistItem) {
    // Only this step being in flight blocks it — a double-click on the same
    // box, not a tick on a different one.
    if (!order || savingSteps.has(item.id)) return;
    setSavingSteps((prev) => new Set(prev).add(item.id));
    setStepError("");
    // Optimistic: ticking a step is the most repeated action on this page and
    // a technician works down the list. Reverted below if the write fails, so
    // the box never stays ticked against a step the server did not record.
    const next = !item.isDone;
    setOrder((prev) => prev ? {
      ...prev,
      checklistItems: prev.checklistItems.map((i) => i.id === item.id ? { ...i, isDone: next } : i),
    } : prev);
    try {
      await api.patch(`/work-orders/${order.id}/checklist-items/${item.id}`, { isDone: next });
    } catch (err: unknown) {
      setOrder((prev) => prev ? {
        ...prev,
        checklistItems: prev.checklistItems.map((i) => i.id === item.id ? { ...i, isDone: item.isDone } : i),
      } : prev);
      const e = err as { response?: { data?: { error?: string } } };
      setStepError(e?.response?.data?.error ?? "Could not save that step.");
    } finally {
      setSavingSteps((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    }
  }

  async function addStep() {
    const description = newStep.trim();
    if (!description || addingStep || !order) return;
    setAddingStep(true);
    setStepError("");
    try {
      const res = await api.post(`/work-orders/${order.id}/checklist-items`, { description });
      setOrder((prev) => prev ? { ...prev, checklistItems: [...prev.checklistItems, res.data] } : prev);
      setNewStep("");
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setStepError(e?.response?.data?.error ?? "Could not add that step.");
    } finally {
      setAddingStep(false);
    }
  }

  async function removeStep(item: ChecklistItem) {
    // Guarded like addStep and toggleStep. Without it a double-click fires two
    // DELETEs and the second 404s, painting "Checklist item not found" under a
    // list from which the step was in fact removed perfectly well.
    if (!order || savingSteps.has(item.id)) return;
    if (!(await confirm({
      title: "Delete this step?",
      message: `“${item.description}” will be removed from this job's steps.`,
    }))) return;
    setSavingSteps((prev) => new Set(prev).add(item.id));
    setStepError("");
    try {
      await api.delete(`/work-orders/${order.id}/checklist-items/${item.id}`);
      setOrder((prev) => prev ? {
        ...prev,
        checklistItems: prev.checklistItems.filter((i) => i.id !== item.id),
      } : prev);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setStepError(e?.response?.data?.error ?? "Could not remove that step.");
    } finally {
      // Released even on success: without this a failed delete could never be
      // retried, because the id would stay latched in the in-flight set.
      setSavingSteps((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    }
  }

  // Staff only: whether the next update is an internal note. Sticky by design —
  // see ProgressThread.
  const [internalNote, setInternalNote] = useState(false);

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
        if (internalNote && !isClient) form.append("internal", "true");
        for (const f of staged) form.append("files", f);
        res = await api.post(`/work-orders/${order.id}/comments`, form);
      } else {
        res = await api.post(`/work-orders/${order.id}/comments`, { body: text, internal: internalNote && !isClient });
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

  const cfg = WORK_ORDER_STATUS[order.status];
  const note = stageNote(order, isClient);
  const priorityCfg = PRIORITY_CONFIG[order.priority];
  const nextStatuses = STAFF_TRANSITIONS[order.status];
  // "Nothing more will happen to this." Work awaiting a client is *not*
  // settled — it can still come back for rework — so the edit affordances stay
  // available until it actually is.
  //
  // Shared with lib/workOrders rather than spelled out here: the API now
  // refuses these edits with a 409, so this decides what to *offer* and the
  // two must agree. An inline copy is how they would stop agreeing.
  const isTerminal = isSettled(order);
  const isAwaitingClient = awaitingClient(order);
  // `isClosed`, not `isTerminal`: a rejected job is not outstanding and must not
  // read as overdue, but its record stays editable so issued parts can go back
  // to stock. The two predicates differ only there, which is why both exist.
  const isOverdue = !!order.dueDate && !isClosed(order) && new Date(order.dueDate) < new Date();

  // Special project gate: only managers can approve/reject special projects
  const canActOnStatus = !isClient && canManage && (!order.isSpecialProject || isManager);

  const stepsDone = order.checklistItems.filter((i) => i.isDone).length;

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
            <p className="tu-wo-ref" style={{ fontSize: 12.5, margin: "0 0 2px" }}>{workOrderRef(order.number)}</p>
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
            {/* Everyone who can read the order can print it; the sheet carries
                no cost, so there is nothing role-specific to withhold. */}
            <Link
              href={`/print/work-orders/${order.id}`}
              target="_blank"
              className="text-xs text-[var(--tu-text-subtle)] border border-[var(--tu-border)] rounded-lg px-3 py-1.5 hover:bg-[var(--tu-bg-secondary)] cursor-pointer"
            >
              Print
            </Link>
            {canAdmin && !isTerminal && (
              <button
                onClick={openEdit}
                className="text-xs text-[var(--tu-text-subtle)] border border-[var(--tu-border)] rounded-lg px-3 py-1.5 hover:bg-[var(--tu-bg-secondary)] cursor-pointer"
              >
                Edit
              </button>
            )}
            <span className={cfg.badge} style={{ fontSize: 13.5, padding: "3px 11px" }}>
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
            <StatusPipeline status={order.status} steps={needsClientApproval(order) ? APPROVAL_STEPS : PIPELINE_STEPS} verified={!!order.verifiedAt} times={order} ariaLabel={`Status: ${cfg.label}`} />
            {/* Where it stands and whose move it is — the same line as the queue.
                It absorbed the old On Hold banner, which said this for one stage. */}
            <p className={`tu-stage-note${note.attention ? " tu-attention" : ""}`} style={{ textAlign: "center" }}>{note.text}</p>
          </>
        )}

        {/* Inline edit form */}
        {editing && (
          <div className="bg-[var(--tu-bg-secondary)] rounded-xl p-4 mb-4 border border-[var(--tu-border)]">
            {/* What the job is — correctable while it is open. Every change is
                recorded in the History with before → after. */}
            <div className="flex flex-col gap-3 mb-3">
              <div>
                <label htmlFor="edit-title" className="block text-xs font-semibold text-[var(--tu-text-subtle)] mb-1">Title</label>
                <input
                  id="edit-title"
                  className="w-full border border-[var(--tu-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--tu-text-brand)]"
                  value={editForm.title}
                  maxLength={200}
                  onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))}
                />
              </div>
              <div>
                <label htmlFor="edit-description" className="block text-xs font-semibold text-[var(--tu-text-subtle)] mb-1">Description</label>
                <textarea
                  id="edit-description"
                  className="w-full border border-[var(--tu-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--tu-text-brand)] resize-y"
                  rows={3}
                  maxLength={5000}
                  value={editForm.description}
                  onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                />
              </div>
              <div>
                <label htmlFor="edit-asset" className="block text-xs font-semibold text-[var(--tu-text-subtle)] mb-1">Asset</label>
                <select
                  id="edit-asset"
                  className="w-full border border-[var(--tu-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--tu-text-brand)]"
                  value={editForm.assetId}
                  onChange={(e) => setEditForm((f) => ({ ...f, assetId: e.target.value }))}
                >
                  <option value="">No asset</option>
                  {/* The current asset stays offered even before the list loads. */}
                  {order.asset && !editAssets.some((a) => a.id === order.asset!.id) && (
                    <option value={order.asset.id}>{order.asset.name}</option>
                  )}
                  {editAssets.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}{a.assetCode ? ` (${a.assetCode})` : ""}</option>
                  ))}
                </select>
              </div>
            </div>
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
            {editError && <p role="alert" className="text-xs font-semibold text-[var(--tu-on-danger)] mb-2">{editError}</p>}
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
                {savingEdit ? "Saving…" : "Save changes"}
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

        {/* Raised by a maintenance plan. Staff only — the API withholds `plan`
            from clients, who see the work but not the rota behind it. */}
        {order.plan && (
          <p className="text-sm mb-4">
            <span className="text-[var(--tu-text-subtle)]">Raised by: </span>
            <Link
              href={`/accounts/${accountId}/maintenance-plans/${order.plan.id}`}
              className="text-[var(--tu-text-brand)] hover:underline"
            >
              {order.plan.title}
            </Link>
            <span className="text-[var(--tu-text-subtle)]">
              {" "}— {order.plan.frequency.toLowerCase().replace("_", "-")} maintenance plan
            </span>
          </p>
        )}

        {/* Assignees */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs font-semibold text-[var(--tu-text-subtle)] uppercase tracking-wide">Assigned to</p>
            {/* Assignments stay editable after sign-off on purpose — a wrong
                name on a finished job must still be correctable. */}
            {canAdmin && (
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
                  {/* Assignments stay editable after sign-off on purpose — a wrong
                      name on a finished job must still be correctable. */}
                  {canAdmin && (
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
        {/* APPROVED included: the estimate and the recorded time are what the
            job cost, and signing it off is no reason for them to disappear from
            the page — the dashboard's man-hours panel is built on exactly these
            two numbers for finished work. Only REQUESTED and REJECTED are left
            out, where there is nothing to show. */}
        {["PENDING", "IN_PROGRESS", "ON_HOLD", "COMPLETED", "APPROVED"].includes(order.status) && (() => {
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
                    {canAdmin && !isTerminal && (
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
                pausing ? (
                  <div className="mt-3">
                    <label htmlFor="pause-reason" className="tu-label">Why are you pausing?</label>
                    <textarea
                      id="pause-reason"
                      className="w-full border border-[var(--tu-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--tu-text-brand)] resize-none"
                      rows={2}
                      maxLength={500}
                      value={pauseReason}
                      onChange={(e) => setPauseReason(e.target.value)}
                      placeholder="Waiting for the spare seal to arrive."
                      autoFocus
                    />
                    <div className="flex gap-2 mt-2">
                      <button
                        type="button"
                        className="tu-btn-primary tu-btn-sm"
                        disabled={timerBusy || !pauseReason.trim()}
                        onClick={() => setTimer("pause", pauseReason.trim())}
                      >
                        {timerBusy ? "Pausing…" : "Pause timer"}
                      </button>
                      <button
                        type="button"
                        className="tu-btn-secondary tu-btn-sm"
                        onClick={() => { setPausing(false); setPauseReason(""); setTimerError(null); }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => (order.timerStartedAt ? setPausing(true) : setTimer("resume"))}
                    disabled={timerBusy}
                    className={`mt-3 w-full py-2 rounded-lg text-sm font-semibold cursor-pointer transition-colors disabled:opacity-50 ${
                      order.timerStartedAt ? "bg-[var(--tu-soft-neutral)] text-[var(--tu-on-neutral)] hover:bg-[var(--tu-bg-tertiary)]" : "bg-[var(--tu-text-brand)] text-white hover:bg-[var(--tu-text-brand-strong)]"
                    }`}
                  >
                    {timerBusy ? "…" : order.timerStartedAt ? "❚❚ Pause Timer" : "▶ Resume Timer"}
                  </button>
                )
              )}
              {timerError && <p className="text-xs text-[var(--tu-on-danger)] mt-2">{timerError}</p>}

              {/* Pause history: each stop of the clock and the reason given. */}
              {order.pauses && order.pauses.length > 0 && (
                <div className="mt-4">
                  <p className="text-[11px] font-semibold text-[var(--tu-text-subtle)] uppercase tracking-wide mb-1.5">Pauses</p>
                  <ul className="space-y-2">
                    {order.pauses.map((p) => (
                      <li key={p.id} className="text-xs">
                        <p className="text-[var(--tu-text-body)]">{p.reason}</p>
                        <p className="text-[var(--tu-text-subtle)] mt-0.5">
                          {p.pausedByName} · {formatDateTime(p.pausedAt)}
                          {p.resumedAt ? ` – resumed ${formatDateTime(p.resumedAt)}` : " · still paused"}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          );
        })()}

        {/* Completed info */}
        {(order.status === "COMPLETED" || order.status === "APPROVED") && (
          <div className="bg-[var(--tu-soft-success)] rounded-lg p-3 mb-4">
            {order.remarks && (
              <p className="text-sm text-[var(--tu-text-body)] italic mb-1">&quot;{order.remarks}&quot;</p>
            )}
            {order.completedAt && (
              <p className="text-xs text-[var(--tu-text-subtle)]">Completed {formatDate(order.completedAt)}</p>
            )}
            {order.verifiedAt && (
              <p className="text-xs text-[var(--tu-text-subtle)] mt-0.5">
                {/* No verifier recorded means the job was finished before review
                    existed and was marked verified when it was introduced. */}
                {order.verifiedByName
                  ? `Verified by ${order.verifiedByName} on ${formatDate(order.verifiedAt)}`
                  : "Verified (finished before supervisor review was introduced)"}
              </p>
            )}
            {order.status === "APPROVED" && (
              <p className="text-xs text-[var(--tu-text-subtle)] mt-0.5">
                {/* An auto-approval carries no approver, and must not be dressed
                    up as one — it records that nobody objected, not that anyone
                    agreed. See jobs/autoApproveWorkOrders.js. */}
                {order.approvedByName
                  ? `Approved by ${order.approvedByName}${order.approvedAt ? ` on ${formatDate(order.approvedAt)}` : ""}`
                  : `Closed automatically — no client response${order.approvedAt ? ` by ${formatDate(order.approvedAt)}` : ""}`}
              </p>
            )}
          </div>
        )}

        {/* The client survey on signed-off client-facing work: the client is
            asked once; supervisors and above read the answer. */}
        {surveyable(order) && isClient && (
          <div className="bg-[var(--tu-bg-secondary)] border border-[var(--tu-border)] rounded-lg p-3.5 mb-4">
            {order.surveyDone ? (
              <p className="tu-survey-thanks">Thanks for your feedback.</p>
            ) : (
              <SurveyForm workOrderId={order.id} onDone={() => setOrder((prev) => (prev ? { ...prev, surveyDone: true } : prev))} />
            )}
          </div>
        )}
        {surveyable(order) && isReviewer(user?.role) && (
          <div className="bg-[var(--tu-bg-secondary)] border border-[var(--tu-border)] rounded-lg p-3.5 mb-4">
            {order.survey ? (
              <SurveyResult survey={order.survey} />
            ) : (
              <p className="text-xs text-[var(--tu-text-subtle)]">No client rating yet.</p>
            )}
          </div>
        )}

        {/* Awaiting the client. Shown to everyone: staff need to know the job is
            not closed yet and why, and the client needs the two buttons. */}
        {isAwaitingClient && (
          <div className="bg-[var(--tu-bg-secondary)] border border-[var(--tu-border)] rounded-lg p-3.5 mb-4">
            <p className="text-sm font-semibold text-[var(--tu-text-heading)]">
              {isClient ? "Is this job done to your satisfaction?" : "Waiting for the client to sign off"}
            </p>
            <p className="text-xs text-[var(--tu-text-subtle)] mt-1">
              {isClient
                ? "Approve to close it, or send it back and tell us what still needs doing."
                : "Only the client can close this. It closes on its own if they don’t respond."}
            </p>

            {isClient && (
              <div className="mt-3">
                {sendingBack ? (
                  <div>
                    <label htmlFor="sendback-reason" className="tu-label">What still needs doing?</label>
                    <textarea
                      id="sendback-reason"
                      className="w-full border border-[var(--tu-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--tu-text-brand)] resize-none"
                      rows={3}
                      value={sendBackReason}
                      onChange={(e) => setSendBackReason(e.target.value)}
                      placeholder="The leak has stopped but the ceiling stain is still there."
                      autoFocus
                    />
                    <div className="flex gap-2 mt-2">
                      <button
                        type="button"
                        className="tu-btn-primary tu-btn-sm"
                        disabled={updatingStatus || !sendBackReason.trim()}
                        onClick={() => updateStatus("ON_HOLD", { reason: sendBackReason.trim() })}
                      >
                        {updatingStatus ? "Sending…" : "Send back"}
                      </button>
                      <button
                        type="button"
                        className="tu-btn-secondary tu-btn-sm"
                        onClick={() => { setSendingBack(false); setSendBackReason(""); }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="tu-btn-primary tu-btn-sm"
                      disabled={updatingStatus}
                      onClick={() => updateStatus("APPROVED")}
                    >
                      {updatingStatus ? "Saving…" : "Approve"}
                    </button>
                    <button
                      type="button"
                      className="tu-btn-secondary tu-btn-sm"
                      disabled={updatingStatus}
                      onClick={() => setSendingBack(true)}
                    >
                      Send back
                    </button>
                  </div>
                )}
              </div>
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
                {isReviewer(user?.role) && (
                  <p className="text-xs text-[var(--tu-text-subtle)] -mt-2 mb-3">
                    You&apos;re completing this as a supervisor, so it&apos;s verified too — no separate review.
                  </p>
                )}
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
                    {updatingStatus ? "Saving…" : isReviewer(user?.role) ? "Complete & verify" : "Confirm complete"}
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
                      if (ns === "ON_HOLD") { setReasonDialog("HOLD"); return; }
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

        {/* Quality control: a supervisor or above verifies a technician's
            completed work, or sends any completed job back — before or after
            the client sees it. A send-back lands On Hold, with why. */}
        {!isClient && canSendBack(user?.role, order) && (
          <div className="mt-4 pt-4 border-t border-[var(--tu-border)] flex gap-2 flex-wrap">
            {isReviewer(user?.role) && awaitingReview(order) && (
              <button
                type="button"
                onClick={verifyWork}
                disabled={updatingStatus}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors disabled:opacity-50 bg-[var(--tu-soft-success)] text-[var(--tu-on-success)]"
              >
                Verify work
              </button>
            )}
            <button
              type="button"
              onClick={() => setReasonDialog("SEND_BACK")}
              disabled={updatingStatus}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors disabled:opacity-50 bg-[var(--tu-soft-neutral)] text-[var(--tu-on-neutral)] hover:bg-[var(--tu-bg-tertiary)]"
            >
              Send back for rework
            </button>
          </div>
        )}

        {reasonDialog && (
          <ReasonDialog
            title={reasonDialog === "SEND_BACK" ? "Send back for rework" : "Put on hold"}
            subtitle={`${workOrderRef(order.number)} · ${order.title}`}
            label={reasonDialog === "SEND_BACK" ? "What still needs doing?" : "Why is it going on hold?"}
            placeholder={reasonDialog === "SEND_BACK" ? "The drain still backs up under load." : "Waiting for the replacement compressor."}
            hint={reasonDialog === "SEND_BACK"
              ? "It goes back On Hold, and the reason is posted to the job's updates for the technician."
              : "Shown to staff as the job's status line. Clients don't see the reason."}
            confirmLabel={reasonDialog === "SEND_BACK" ? "Send back" : "Put on hold"}
            onSubmit={(reason) => updateStatus("ON_HOLD", { reason })}
            onClose={() => setReasonDialog(null)}
          />
        )}

        {order.isSpecialProject && order.status === "REQUESTED" && !isManager && !isClient && (
          <div className="mt-4 pt-4 border-t border-[var(--tu-border)]">
            <p className="text-xs text-[var(--tu-on-warning)] bg-[var(--tu-soft-warning)] rounded-lg px-3 py-2">
              Awaiting manager approval for this special project.
            </p>
          </div>
        )}
      </div>

      {/* Steps — the procedure for this job. Shown to clients read-only: it is
          what was done, not what it cost. Hidden entirely when there are none
          and the viewer cannot add any, rather than showing an empty card. */}
      {(order.checklistItems.length > 0 || canManage) && (
        <div className="bg-[var(--tu-bg-surface)] rounded-xl border border-[var(--tu-border)] shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-[var(--tu-text-body)]">
                Steps{" "}
                {order.checklistItems.length > 0 && (
                  <span className="tu-figure text-[var(--tu-text-subtle)]">
                    {stepsDone}/{order.checklistItems.length}
                  </span>
                )}
              </h2>
              <p className="text-xs text-[var(--tu-text-subtle)] mt-0.5">
                {order.plan
                  ? "Copied from the maintenance plan that raised this job."
                  : "The procedure for this job. Tick each step as it is done."}
              </p>
            </div>
          </div>

          {order.checklistItems.length === 0 ? (
            <p className="text-xs text-[var(--tu-text-subtle)] mb-3">No steps yet.</p>
          ) : (
            <ul className="space-y-1 mb-3">
              {order.checklistItems.map((item) => (
                <li key={item.id} className="flex items-center gap-3 group py-1">
                  <input
                    type="checkbox"
                    checked={item.isDone}
                    disabled={!canManage || isTerminal || savingSteps.has(item.id)}
                    onChange={() => toggleStep(item)}
                    className="w-4 h-4 shrink-0 accent-[var(--tu-text-brand)] cursor-pointer disabled:cursor-default"
                  />
                  <span
                    className={`text-sm flex-1 ${
                      item.isDone
                        ? "line-through text-[var(--tu-text-disabled)]"
                        : "text-[var(--tu-text-body)]"
                    }`}
                  >
                    {item.description}
                  </span>
                  {canManage && !isTerminal && (
                    <button
                      onClick={() => removeStep(item)}
                      className="text-xs text-[var(--tu-text-subtle)] opacity-0 group-hover:opacity-100 hover:text-[var(--tu-on-danger)] cursor-pointer transition-opacity"
                      aria-label={`Remove step: ${item.description}`}
                    >
                      Remove
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {canManage && !isTerminal && (
            <div className="flex gap-2">
              <input
                value={newStep}
                onChange={(e) => setNewStep(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addStep(); }}
                placeholder="Add a step…"
                className="flex-1 px-3 py-2 text-sm bg-[var(--tu-bg-input)] border border-[var(--tu-border)] rounded-lg text-[var(--tu-text-body)] placeholder:text-[var(--tu-text-disabled)] focus:outline-none focus:border-[var(--tu-text-brand)]"
              />
              <button
                onClick={addStep}
                disabled={!newStep.trim() || addingStep}
                className="px-3 py-2 text-xs font-semibold text-[var(--tu-text-brand)] border border-[var(--tu-text-brand)] rounded-lg hover:bg-[var(--tu-soft-brand)] cursor-pointer disabled:opacity-50 disabled:cursor-default"
              >
                {addingStep ? "Adding…" : "Add"}
              </button>
            </div>
          )}
          {!!stepError && (
            <p className="text-xs text-[var(--tu-on-danger)] mt-2">{stepError}</p>
          )}
        </div>
      )}

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
            {!showPartForm && !isTerminal && (
              <button
                onClick={() => openPartForm()}
                className="px-3 py-1.5 text-xs font-semibold text-[var(--tu-text-brand)] border border-[var(--tu-text-brand)] rounded-lg hover:bg-[var(--tu-soft-brand)] cursor-pointer"
              >
                + Add Part
              </button>
            )}
          </div>

          {parts.length === 0 && !showPartForm ? (
            <EmptyState
              compact
              icon="part"
              title="No parts recorded"
              // Don't prompt for something the API will now refuse.
              hint={isTerminal
                ? "This work order is closed; its parts can no longer be changed."
                : "Log the spare parts consumed so stock levels stay accurate."}
            />
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
                        {!isTerminal && (
                        <>
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
                          {removingPartId === p.id ? "…" : "Remove"}
                        </button>
                        </>
                        )}
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
                  {savingPart ? "Saving…" : editingPartId ? "Save changes" : "Add part"}
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
        {...(isClient ? {} : { internal: internalNote, onInternalChange: setInternalNote })}
      />

      {/* History — every action on the job, oldest first, with who and when.
          Reloaded when the job changes so the latest move shows up. */}
      <section id="history" className="bg-[var(--tu-bg-surface)] rounded-xl border border-[var(--tu-border)] shadow-sm p-6 mt-6">
        <h2 className="text-sm font-semibold text-[var(--tu-text-body)] mb-4">History</h2>
        <WorkOrderHistory
          workOrderId={order.id}
          refreshKey={[order.status, order.priority, order.dueDate, order.verifiedAt, order.comments.length, order.assignments.length, order.timerStartedAt].join("|")}
        />
      </section>
    </div>
  );
}
