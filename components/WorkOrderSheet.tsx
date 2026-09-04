"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import api from "@/lib/api";
import StatusPipeline, { APPROVAL_STEPS } from "@/components/StatusPipeline";
import { WORK_ORDER_PRIORITY, WORK_ORDER_STATUS, type WorkOrderPriority, type WorkOrderStatus } from "@/lib/statuses";
import {
  STAFF_TRANSITIONS,
  isOverdue,
  isSettled,
  needsClientApproval,
  signOffCue,
  transitionLabel,
  transitionTone,
} from "@/lib/workOrders";

/**
 * The work order, opened over the list instead of navigating to it.
 *
 * The problem this solves is specific: status changes used to mean a full page
 * navigation away from the queue and back, and — under the old status tabs —
 * the order you had just acted on was gone from the tab you returned to. You
 * lost the job and your place at once. Here the list stays mounted behind the
 * sheet, the row updates in place, and the sheet stays open on the new state.
 *
 * Deliberately not the whole detail page. This carries what a supervisor
 * triages on — the transition buttons, who is on it, how urgent, when it is
 * due — and links out for parts, comments, attachments and step-by-step
 * editing, which are a technician's business on the job itself rather than
 * something done while working down a queue.
 */

export type SheetOrder = {
  id: string;
  title: string;
  description: string | null;
  status: WorkOrderStatus;
  priority: WorkOrderPriority | null;
  dueDate: string | null;
  category: string | null;
  type: "INTERNAL" | "EXTERNAL";
  isSpecialProject: boolean;
  estimatedMinutes: number | null;
  actualSeconds: number;
  timerStartedAt: string | null;
  accountId: string;
  account?: { id: string; name: string } | null;
  asset: { id: string; name: string } | null;
  assignments: { employee: { id: string; name: string; position: string | null } }[];
  checklistItems?: { id: string; isDone: boolean }[];
};

/**
 * What the sheet may hand back to the list.
 *
 * `account` is excluded deliberately: the sheet never changes which account a
 * job belongs to, and the two lists type that field differently — the
 * cross-account one always has it, the account-scoped one does not carry it at
 * all. Leaving it out of the patch keeps both callers assignable without either
 * having to widen a field it genuinely always has.
 */
export type SheetPatch = { id: string } & Partial<Omit<SheetOrder, "account">>;

type Employee = { id: string; name: string; position?: string | null };

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

/** Logged time, counting a running timer up to now. */
function loggedMinutes(o: SheetOrder) {
  const running = o.timerStartedAt ? (Date.now() - new Date(o.timerStartedAt).getTime()) / 1000 : 0;
  return (o.actualSeconds + running) / 60;
}

export default function WorkOrderSheet({
  order,
  onClose,
  onChanged,
  canManage,
  canActOnStatus,
  isClient,
}: {
  order: SheetOrder;
  onClose: () => void;
  /** Hands the updated row back so the list behind can re-render in place. */
  onChanged: (patch: SheetPatch) => void;
  /** May change what the job *is* — priority, due date, who is on it. */
  canManage: boolean;
  /** May move it along the pipeline. */
  canActOnStatus: boolean;
  isClient: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remarks, setRemarks] = useState("");
  const [confirmComplete, setConfirmComplete] = useState(false);
  const [sendBackReason, setSendBackReason] = useState("");
  const [sendingBack, setSendingBack] = useState(false);

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [showPicker, setShowPicker] = useState(false);

  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Focus lands on the close button rather than the first action: the first
  // action is destructive on some statuses (Reject), and a sheet that opens
  // with a destructive control focused is one stray Enter from a mistake.
  useEffect(() => { closeRef.current?.focus(); }, []);

  // Transient form state is reset by *remounting*, not by an effect: the caller
  // keys this component on the order id. Resetting in an effect would render the
  // new job for one frame carrying the previous one's half-typed rejection
  // reason, and React rightly flags the cascading render.

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key !== "Tab" || !panelRef.current) return;
      // Focus trap: the list behind is inert while this is open, so Tab must
      // not walk into it.
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const patch = useCallback(
    async (body: Record<string, unknown>, optimistic?: Partial<SheetOrder>) => {
      setBusy(true);
      setError(null);
      try {
        const res = await api.patch(`/work-orders/${order.id}`, body);
        onChanged({ ...optimistic, ...res.data, id: order.id });
        return true;
      } catch {
        setError("That change didn't save. Try again.");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [order.id, onChanged]
  );

  async function move(to: WorkOrderStatus) {
    if (to === "COMPLETED" && !confirmComplete) { setConfirmComplete(true); return; }
    const body: Record<string, unknown> = { status: to };
    if (to === "COMPLETED" && remarks.trim()) body.remarks = remarks.trim();
    if (await patch(body)) { setConfirmComplete(false); setRemarks(""); }
  }

  async function sendBack() {
    const reason = sendBackReason.trim();
    if (!reason) return;
    if (await patch({ status: "IN_PROGRESS", reason })) {
      setSendingBack(false);
      setSendBackReason("");
    }
  }

  async function openPicker() {
    setShowPicker(true);
    if (employees.length === 0) {
      try {
        const res = await api.get(`/accounts/${order.accountId}/employees`);
        setEmployees(res.data);
      } catch {
        setError("Couldn't load the roster.");
      }
    }
  }

  async function assign(empId: string) {
    setBusy(true);
    try {
      const res = await api.post(`/work-orders/${order.id}/assignments`, { employeeId: empId });
      onChanged({ id: order.id, assignments: [...order.assignments, res.data] });
      setShowPicker(false);
    } catch {
      setError("Couldn't assign that person.");
    } finally {
      setBusy(false);
    }
  }

  async function unassign(empId: string) {
    setBusy(true);
    try {
      await api.delete(`/work-orders/${order.id}/assignments/${empId}`);
      onChanged({ id: order.id, assignments: order.assignments.filter((a) => a.employee.id !== empId) });
    } catch {
      setError("Couldn't remove that person.");
    } finally {
      setBusy(false);
    }
  }

  const settled = isSettled(order);
  const overdue = isOverdue(order);
  const cue = signOffCue(order, isClient);
  const nexts = canActOnStatus && !settled ? STAFF_TRANSITIONS[order.status] : [];
  const steps = order.checklistItems ?? [];
  const done = steps.filter((s) => s.isDone).length;
  const assignedIds = new Set(order.assignments.map((a) => a.employee.id));

  // The client's two moves out of COMPLETED. Offered here rather than through
  // STAFF_TRANSITIONS, which deliberately omits them so staff are never shown
  // an Approve button the API refuses.
  const clientDecision = isClient && order.status === "COMPLETED" && needsClientApproval(order);

  return (
    <div
      className="tu-sheet-overlay"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={panelRef}
        className="tu-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={`Work order: ${order.title}`}
      >
        <div className="tu-sheet-header">
          <div style={{ minWidth: 0 }}>
            <h2 className="tu-sheet-title">{order.title}</h2>
            <p className="tu-sheet-sub">
              {order.account?.name ?? "This account"}
              {order.asset ? ` · ${order.asset.name}` : ""}
              {order.isSpecialProject ? " · Special project" : ""}
            </p>
          </div>
          <button ref={closeRef} type="button" className="tu-drawer-close" onClick={onClose} aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="tu-sheet-body">
          {error && <div className="tu-error-banner" role="alert">{error}</div>}

          <div className="tu-sheet-section">
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span className={WORK_ORDER_STATUS[order.status].badge}>
                {WORK_ORDER_STATUS[order.status].label}
              </span>
              {overdue && <span className="tu-badge tu-badge-danger">Overdue</span>}
              {cue && <span className="tu-badge tu-badge-warning">{cue}</span>}
            </div>
            {order.status !== "REJECTED" && (
              <StatusPipeline
                status={order.status}
                steps={needsClientApproval(order) ? APPROVAL_STEPS : undefined}
                ariaLabel={`Progress: ${WORK_ORDER_STATUS[order.status].label}`}
              />
            )}
          </div>

          {/* ── Transitions ── */}
          {(nexts.length > 0 || clientDecision) && (
            <div className="tu-sheet-section">
              <span className="tu-sheet-label">Move this on</span>

              {confirmComplete ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <textarea
                    className="tu-input"
                    rows={3}
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    placeholder="Closing remarks (optional)"
                    aria-label="Closing remarks"
                  />
                  <div className="tu-sheet-actions">
                    <button type="button" className="tu-sheet-action tu-sheet-action-neutral" onClick={() => setConfirmComplete(false)} disabled={busy}>
                      Cancel
                    </button>
                    <button type="button" className="tu-sheet-action tu-sheet-action-success" onClick={() => move("COMPLETED")} disabled={busy}>
                      {busy ? "Saving…" : "Confirm complete"}
                    </button>
                  </div>
                </div>
              ) : sendingBack ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <textarea
                    className="tu-input"
                    rows={3}
                    value={sendBackReason}
                    onChange={(e) => setSendBackReason(e.target.value)}
                    placeholder="What still needs doing? (required)"
                    aria-label="Reason for sending back"
                  />
                  <div className="tu-sheet-actions">
                    <button type="button" className="tu-sheet-action tu-sheet-action-neutral" onClick={() => setSendingBack(false)} disabled={busy}>
                      Cancel
                    </button>
                    <button type="button" className="tu-sheet-action tu-sheet-action-brand" onClick={sendBack} disabled={busy || !sendBackReason.trim()}>
                      {busy ? "Sending…" : "Send back"}
                    </button>
                  </div>
                </div>
              ) : clientDecision ? (
                <div className="tu-sheet-actions">
                  <button type="button" className="tu-sheet-action tu-sheet-action-success" onClick={() => patch({ status: "APPROVED" })} disabled={busy}>
                    {busy ? "Saving…" : "Approve"}
                  </button>
                  <button type="button" className="tu-sheet-action tu-sheet-action-neutral" onClick={() => setSendingBack(true)} disabled={busy}>
                    Send back for rework
                  </button>
                </div>
              ) : (
                <div className="tu-sheet-actions">
                  {nexts.map((ns) => (
                    <button
                      key={ns}
                      type="button"
                      className={`tu-sheet-action tu-sheet-action-${transitionTone(ns)}`}
                      onClick={() => move(ns)}
                      disabled={busy}
                    >
                      {transitionLabel(order.status, ns)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Facts ── */}
          <div className="tu-sheet-section">
            <span className="tu-sheet-label">Details</span>
            <dl className="tu-sheet-facts">
              <div className="tu-sheet-fact">
                <dt>Priority</dt>
                <dd>
                  {canManage && !settled ? (
                    <select
                      className="tu-select"
                      style={{ width: "100%" }}
                      value={order.priority ?? ""}
                      disabled={busy}
                      onChange={(e) => patch({ priority: e.target.value || null })}
                      aria-label="Priority"
                    >
                      <option value="">None</option>
                      {(Object.keys(WORK_ORDER_PRIORITY) as WorkOrderPriority[]).map((p) => (
                        <option key={p} value={p}>{WORK_ORDER_PRIORITY[p].label}</option>
                      ))}
                    </select>
                  ) : order.priority ? (
                    <span className={WORK_ORDER_PRIORITY[order.priority].badge}>
                      {WORK_ORDER_PRIORITY[order.priority].label}
                    </span>
                  ) : "—"}
                </dd>
              </div>

              <div className="tu-sheet-fact">
                <dt>Due</dt>
                <dd>
                  {canManage && !settled ? (
                    <input
                      type="date"
                      className="tu-input"
                      style={{ width: "100%" }}
                      value={order.dueDate ? order.dueDate.slice(0, 10) : ""}
                      disabled={busy}
                      onChange={(e) => patch({ dueDate: e.target.value || null })}
                      aria-label="Due date"
                    />
                  ) : order.dueDate ? formatDate(order.dueDate) : "—"}
                </dd>
              </div>

              <div className="tu-sheet-fact">
                <dt>Man-hours</dt>
                <dd style={{ fontVariantNumeric: "tabular-nums" }}>
                  {formatHM(loggedMinutes(order))}
                  {order.estimatedMinutes ? ` / ${formatHM(order.estimatedMinutes)}` : ""}
                  {order.timerStartedAt && <span className="tu-chip" style={{ marginLeft: 8 }}>Running</span>}
                </dd>
              </div>

              {steps.length > 0 && (
                <div className="tu-sheet-fact">
                  <dt>Steps</dt>
                  <dd style={{ fontVariantNumeric: "tabular-nums" }}>{done} / {steps.length} done</dd>
                </div>
              )}

              {order.category && (
                <div className="tu-sheet-fact"><dt>Category</dt><dd>{order.category}</dd></div>
              )}
            </dl>
          </div>

          {/* ── Assignees ── */}
          <div className="tu-sheet-section">
            <span className="tu-sheet-label">Assigned to</span>
            {order.assignments.length === 0 && !showPicker && (
              <p style={{ margin: 0, fontSize: 13, color: "var(--tu-text-subtle)" }}>Nobody yet.</p>
            )}
            {order.assignments.length > 0 && (
              <div className="tu-chip-row">
                {order.assignments.map((a) => (
                  <span key={a.employee.id} className="tu-chip">
                    {a.employee.name}
                    {canManage && !settled && (
                      <button
                        type="button"
                        onClick={() => unassign(a.employee.id)}
                        disabled={busy}
                        aria-label={`Remove ${a.employee.name}`}
                        style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: "inherit", lineHeight: 1 }}
                      >
                        ×
                      </button>
                    )}
                  </span>
                ))}
              </div>
            )}

            {canManage && !settled && (
              showPicker ? (
                <select
                  className="tu-select"
                  defaultValue=""
                  disabled={busy}
                  aria-label="Assign an employee"
                  onChange={(e) => { if (e.target.value) assign(e.target.value); }}
                >
                  <option value="">Choose someone…</option>
                  {employees
                    .filter((e) => !assignedIds.has(e.id))
                    .map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name}{e.position ? ` — ${e.position}` : ""}
                      </option>
                    ))}
                </select>
              ) : (
                <button type="button" className="tu-btn-secondary tu-btn-sm" onClick={openPicker} disabled={busy}>
                  Assign someone
                </button>
              )
            )}
          </div>

          {order.description && (
            <div className="tu-sheet-section">
              <span className="tu-sheet-label">Description</span>
              <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55, color: "var(--tu-text-body)", whiteSpace: "pre-wrap" }}>
                {order.description}
              </p>
            </div>
          )}
        </div>

        <div className="tu-sheet-footer">
          <Link
            href={`/accounts/${order.accountId}/work-orders/${order.id}`}
            className="tu-btn-secondary tu-btn-sm"
            style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            Open full page
            <span aria-hidden="true">↗</span>
          </Link>
          <span style={{ marginLeft: 10, fontSize: 12, color: "var(--tu-text-subtle)" }}>
            for parts, comments and steps
          </span>
        </div>
      </div>
    </div>
  );
}
