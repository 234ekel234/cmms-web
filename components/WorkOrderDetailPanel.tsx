"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import api from "@/lib/api";
import StatusPipeline, { APPROVAL_STEPS } from "@/components/StatusPipeline";
import ProgressThread, { type ProgressEntry } from "@/components/ProgressThread";
import { WORK_ORDER_PRIORITY, WORK_ORDER_STATUS, type WorkOrderPriority, type WorkOrderStatus } from "@/lib/statuses";
import {
  STAFF_TRANSITIONS,
  isOverdue,
  isSettled,
  needsClientApproval,
  stageNote,
  transitionLabel,
  transitionTone,
  workOrderRef,
  type StageFacts,
  canSendBack,
  needsReason,
  awaitingReview,
  awaitingClient,
  isReviewer,
  surveyable,
  type SurveyScores,
} from "@/lib/workOrders";
import { useConfirm } from "@/components/ConfirmDialog";
import { useAuth } from "@/context/AuthContext";
import WorkOrderHistory from "@/components/WorkOrderHistory";
import { SurveyForm, SurveyResult } from "@/components/ClientSurvey";

/**
 * The right half of the split view: one work order, beside the queue.
 *
 * This replaces an overlay sheet, and the difference is the point. The sheet sat
 * *over* the list and dimmed it, so acting on a job still cost you sight of the
 * queue — half of the original complaint. A permanent pane leaves both live: the
 * list stays readable and keyboard-navigable while the detail changes beside it.
 *
 * It also buys room. At ~420px an overlay could only carry the transition
 * buttons and a few facts; at full height beside the list there is space for the
 * comment thread, which is the thing a supervisor actually reaches for while
 * triaging — "why is this still open?" is usually answered in the last note.
 *
 * Parts, attachments and step-by-step editing stay on the full page. Those are a
 * technician's business on the job itself, not something done while working down
 * a queue, and the page is one click away.
 */

export type PanelOrder = StageFacts & {
  id: string;
  number: number;
  title: string;
  description: string | null;
  status: WorkOrderStatus;
  // Never null: the column is non-nullable with @default(MEDIUM), and the PATCH
  // route skips a falsy priority outright — so there is no "no priority" state
  // to represent, and no "None" option to offer.
  priority: WorkOrderPriority;
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
  assignments: { employeeId?: string; employee: { id: string; name: string; position: string | null } }[];
  checklistItems?: { id: string; isDone: boolean }[];
  comments?: ProgressEntry[];
};

/**
 * What the panel may hand back to the queue beside it.
 *
 * `account` is excluded deliberately: the panel never changes which account a
 * job belongs to, and the two lists type that field differently — the
 * cross-account one always has it, the account-scoped one does not carry it.
 * Leaving it out keeps both callers assignable without either widening a field
 * it genuinely always has.
 */
export type PanelPatch = { id: string } & Partial<Omit<PanelOrder, "account">>;

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
function loggedMinutes(o: PanelOrder) {
  const running = o.timerStartedAt ? (Date.now() - new Date(o.timerStartedAt).getTime()) / 1000 : 0;
  return (o.actualSeconds + running) / 60;
}

export default function WorkOrderDetailPanel({
  order,
  onChanged,
  canManage,
  canActOnStatus,
  isClient,
  onClose,
}: {
  /** The row from the list — enough to render immediately, before the fetch. */
  order: PanelOrder;
  onChanged: (patch: PanelPatch) => void;
  /** May change what the job *is* — priority, due date, who is on it. */
  canManage: boolean;
  /** May move it along the pipeline. */
  canActOnStatus: boolean;
  isClient: boolean;
  /** Only shown on narrow screens, where the panel covers the queue. */
  onClose?: () => void;
}) {
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remarks, setRemarks] = useState("");
  const [confirmComplete, setConfirmComplete] = useState(false);
  // Holding a job and sending one back both ask why, in the same box.
  const [reasonFor, setReasonFor] = useState<null | "HOLD" | "SEND_BACK">(null);
  const [reasonText, setReasonText] = useState("");
  const { user } = useAuth();

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [showPicker, setShowPicker] = useState(false);

  // The client's rating, from the single-order fetch, for this order only.
  const [fetchedSurvey, setFetchedSurvey] = useState<{ id: string; survey?: SurveyScores } | null>(null);
  const survey = fetchedSurvey?.id === order.id ? fetchedSurvey.survey : order.survey;

  // The thread is not on the list row — it arrives with the fetch below.
  const [comments, setComments] = useState<ProgressEntry[]>(order.comments ?? []);
  const [commentText, setCommentText] = useState("");
  const [staged, setStaged] = useState<File[]>([]);
  const [posting, setPosting] = useState(false);
  const [threadError, setThreadError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  /**
   * Pull the full order for the thread.
   *
   * `GET /work-orders/:id` exists for exactly this. Before it, the only way to
   * read one order was to fetch the whole account's list and search it — which
   * the detail page did, and which would have re-read every work order on the
   * site on every arrow key here.
   */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get(`/work-orders/${order.id}`);
        if (!cancelled) setComments(res.data.comments ?? []);
        // The rating is on the single order only — list rows say whether one
        // exists, not what it was.
        if (!cancelled) setFetchedSurvey({ id: order.id, survey: res.data.survey });
      } catch {
        // The facts above are already on screen from the list row; a failed
        // thread fetch should not blank them.
        if (!cancelled) setThreadError("Couldn't load the thread.");
      }
    })();
    return () => { cancelled = true; };
  }, [order.id]);

  const patch = useCallback(
    async (body: Record<string, unknown>) => {
      setBusy(true);
      setError(null);
      try {
        const res = await api.patch(`/work-orders/${order.id}`, body);
        onChanged({ ...res.data, id: order.id });
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
    if (needsReason(to)) { setReasonFor("HOLD"); setReasonText(""); return; }
    if (to === "REJECTED" && !(await confirm({
      title: "Reject this work order?",
      message: "It will be closed without any work done. A rejected order can't be reopened.",
      confirmLabel: "Reject",
    }))) return;
    const body: Record<string, unknown> = { status: to };
    if (to === "COMPLETED" && remarks.trim()) body.remarks = remarks.trim();
    if (await patch(body)) { setConfirmComplete(false); setRemarks(""); }
  }

  // Both land the job On Hold with the reason; a send-back also posts the
  // reason to the thread, so that is pulled back in.
  async function submitReason() {
    const reason = reasonText.trim();
    if (!reason || !reasonFor) return;
    const sendingBack = reasonFor === "SEND_BACK";
    if (await patch({ status: "ON_HOLD", reason })) {
      setReasonFor(null);
      setReasonText("");
      if (sendingBack) {
        try {
          const res = await api.get(`/work-orders/${order.id}`);
          setComments(res.data.comments ?? []);
        } catch { /* the status change already landed */ }
      }
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
    const who = order.assignments.find((a) => a.employee.id === empId)?.employee.name ?? "This person";
    if (!(await confirm({
      title: "Unassign from this job?",
      message: `${who} will be taken off this work order.`,
      confirmLabel: "Unassign",
    }))) return;
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

  // Staff only: the next update is an internal note. Tied to the order it was
  // set on, so moving to another job in the queue starts back at public —
  // without an effect resetting it.
  const [internalFor, setInternalFor] = useState<string | null>(null);
  // Open for one order only, like the internal-note flag above.
  const [historyFor, setHistoryFor] = useState<string | null>(null);
  const historyOpen = historyFor === order.id;
  const internalNote = internalFor === order.id;

  async function postComment() {
    const text = commentText.trim();
    if ((!text && staged.length === 0) || posting) return;
    setPosting(true);
    setThreadError("");
    try {
      // Multipart only when there is something to upload, so a text-only note
      // stays a plain JSON request.
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
      setComments((prev) => [...prev, res.data]);
      setCommentText("");
      setStaged([]);
      if (fileRef.current) fileRef.current.value = "";
    } catch (err: unknown) {
      const r = (err as { response?: { data?: { error?: string } } })?.response;
      setThreadError(r?.data?.error ?? "Could not post that update.");
    } finally {
      setPosting(false);
    }
  }

  const settled = isSettled(order);
  const overdue = isOverdue(order);
  const note = stageNote(order, isClient);
  const nexts = canActOnStatus && !settled ? STAFF_TRANSITIONS[order.status] : [];
  const steps = order.checklistItems ?? [];
  const done = steps.filter((s) => s.isDone).length;
  const assignedIds = new Set(order.assignments.map((a) => a.employee.id));

  // The client's two moves out of COMPLETED. Offered here rather than through
  // STAFF_TRANSITIONS, which deliberately omits them so staff are never shown
  // an Approve button the API refuses.
  // Only once a supervisor has verified it (awaitingClient checks that) — the
  // API refuses a client's decision on unreviewed work.
  const clientDecision = isClient && awaitingClient(order);
  // Quality control: a supervisor or above may send any completed job back.
  const staffSendBack = !isClient && canSendBack(user?.role, order);
  // Supervisor review of a technician's completed work.
  const canVerify = !isClient && isReviewer(user?.role) && awaitingReview(order);
  // A supervisor completing work verifies it in the same step — say so.
  const completingVerifies = isReviewer(user?.role);

  async function verify() {
    setBusy(true);
    setError(null);
    try {
      const res = await api.post(`/work-orders/${order.id}/verify`);
      onChanged(res.data);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e?.response?.data?.error ?? "Couldn't verify this work.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="tu-detail">
      <div className="tu-detail-header">
        <div style={{ minWidth: 0 }}>
          <h2 className="tu-detail-title">{order.title}</h2>
          <p className="tu-detail-sub">
            {/* The account name is only worth stating when the queue spans more
                than one. Inside an account the page header already says which. */}
            {[workOrderRef(order.number), order.account?.name, order.asset?.name, order.isSpecialProject ? "Special project" : null]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        {onClose && (
          <button type="button" className="tu-drawer-close tu-detail-back" onClick={onClose} aria-label="Back to the queue">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
            </svg>
          </button>
        )}
      </div>

      <div className="tu-detail-body">
        {error && <div className="tu-error-banner" role="alert">{error}</div>}

        <div className="tu-detail-section">
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span className={WORK_ORDER_STATUS[order.status].badge}>
              {WORK_ORDER_STATUS[order.status].label}
            </span>
            {overdue && <span className="tu-badge tu-badge-danger">Overdue</span>}
          </div>
          {/* Where it stands and whose move it is. This replaced a sign-off
              badge, which said the same thing for one stage out of seven. */}
          <p className={`tu-stage-note${note.attention ? " tu-attention" : ""}`}>{note.text}</p>
          {order.verifiedAt && order.verifiedByName && !isClient && (
            <p className="tu-detail-hint">Verified by {order.verifiedByName} · {new Date(order.verifiedAt).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</p>
          )}
          {order.status !== "REJECTED" && (
            <StatusPipeline
              status={order.status}
              steps={needsClientApproval(order) ? APPROVAL_STEPS : undefined}
              verified={!!order.verifiedAt}
              ariaLabel={`Progress: ${WORK_ORDER_STATUS[order.status].label}`}
            />
          )}
        </div>

        {/* ── Client survey ── on signed-off client-facing work. */}
        {surveyable(order) && (isClient || isReviewer(user?.role)) && (
          <div className="tu-detail-section">
            {isClient ? (
              order.surveyDone
                ? <p className="tu-survey-thanks">Thanks for your feedback.</p>
                : <SurveyForm workOrderId={order.id} onDone={() => onChanged({ id: order.id, surveyDone: true })} />
            ) : survey ? (
              <SurveyResult survey={survey} />
            ) : (
              <p className="tu-detail-hint">No client rating yet.</p>
            )}
          </div>
        )}

        {/* ── Transitions ── */}
        {(nexts.length > 0 || clientDecision || staffSendBack || canVerify) && (
          <div className="tu-detail-section">
            <span className="tu-detail-label">Change status</span>

            {confirmComplete ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <textarea
                  className="tu-input"
                  rows={3}
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="Add closing remarks (optional)"
                  aria-label="Closing remarks"
                />
                {completingVerifies && (
                  <p className="tu-detail-hint">You&apos;re completing this as a supervisor, so it&apos;s verified too — no separate review.</p>
                )}
                <div className="tu-detail-actions">
                  <button type="button" className="tu-sheet-action tu-sheet-action-neutral" onClick={() => setConfirmComplete(false)} disabled={busy}>
                    Cancel
                  </button>
                  <button type="button" className="tu-sheet-action tu-sheet-action-success" onClick={() => move("COMPLETED")} disabled={busy}>
                    {busy ? "Saving…" : completingVerifies ? "Complete & verify" : "Confirm complete"}
                  </button>
                </div>
              </div>
            ) : reasonFor ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <textarea
                  className="tu-input"
                  rows={3}
                  maxLength={500}
                  value={reasonText}
                  onChange={(e) => setReasonText(e.target.value)}
                  placeholder={reasonFor === "SEND_BACK" ? "What still needs doing? (required)" : "Why is it going on hold? (required)"}
                  aria-label={reasonFor === "SEND_BACK" ? "Reason for sending back" : "Reason for putting on hold"}
                  autoFocus
                />
                {reasonFor === "SEND_BACK" && (
                  <p className="tu-detail-hint">It goes back On Hold, and the reason is posted to the job&apos;s updates for the technician.</p>
                )}
                <div className="tu-detail-actions">
                  <button type="button" className="tu-sheet-action tu-sheet-action-neutral" onClick={() => setReasonFor(null)} disabled={busy}>
                    Cancel
                  </button>
                  <button type="button" className="tu-sheet-action tu-sheet-action-brand" onClick={submitReason} disabled={busy || !reasonText.trim()}>
                    {busy ? "Saving…" : reasonFor === "SEND_BACK" ? "Send back" : "Put on hold"}
                  </button>
                </div>
              </div>
            ) : clientDecision ? (
              <div className="tu-detail-actions">
                <button type="button" className="tu-sheet-action tu-sheet-action-success" onClick={() => patch({ status: "APPROVED" })} disabled={busy}>
                  {busy ? "Saving…" : "Approve"}
                </button>
                <button type="button" className="tu-sheet-action tu-sheet-action-neutral" onClick={() => { setReasonFor("SEND_BACK"); setReasonText(""); }} disabled={busy}>
                  Send back for rework
                </button>
              </div>
            ) : (
              <div className="tu-detail-actions">
                {canVerify && (
                  <button type="button" className="tu-sheet-action tu-sheet-action-success" onClick={verify} disabled={busy}>
                    {busy ? "Saving…" : "Verify work"}
                  </button>
                )}
                {staffSendBack && (
                  <button type="button" className="tu-sheet-action tu-sheet-action-neutral" onClick={() => { setReasonFor("SEND_BACK"); setReasonText(""); }} disabled={busy}>
                    Send back for rework
                  </button>
                )}
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
        <div className="tu-detail-section">
          <span className="tu-detail-label">Details</span>
          <dl className="tu-detail-facts">
            <div className="tu-sheet-fact">
              <dt>Priority</dt>
              <dd>
                {canManage && !settled ? (
                  <select
                    className="tu-select"
                    value={order.priority}
                    disabled={busy}
                    onChange={(e) => patch({ priority: e.target.value })}
                    aria-label="Priority"
                  >
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
        <div className="tu-detail-section">
          <span className="tu-detail-label">Assigned to</span>
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
                style={{ maxWidth: 320 }}
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
              <button type="button" className="tu-btn-secondary tu-btn-sm" style={{ alignSelf: "flex-start" }} onClick={openPicker} disabled={busy}>
                Assign someone
              </button>
            )
          )}
        </div>

        {order.description && (
          <div className="tu-detail-section">
            <span className="tu-detail-label">Description</span>
            <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55, color: "var(--tu-text-body)", whiteSpace: "pre-wrap" }}>
              {order.description}
            </p>
          </div>
        )}

        {/* ── The thread ── */}
        <div className="tu-detail-section">
          <span className="tu-detail-label">Progress ({comments.length})</span>
          <ProgressThread
            entries={comments}
            text={commentText}
            onTextChange={setCommentText}
            staged={staged}
            onStageFiles={(e) => setStaged((prev) => [...prev, ...Array.from(e.target.files ?? [])])}
            onUnstage={(i) => setStaged((prev) => prev.filter((_, n) => n !== i))}
            fileInputRef={fileRef}
            onPost={postComment}
            posting={posting}
            error={threadError}
            {...(isClient ? {} : { internal: internalNote, onInternalChange: (v: boolean) => setInternalFor(v ? order.id : null) })}
          />
        </div>

        {/* ── History ── loaded only when opened: walking the queue with the
            arrow keys should not fetch every job's whole history. Keyed to the
            order so moving to another job starts it closed. */}
        <details key={order.id} className="tu-detail-section tu-detail-history" onToggle={(e) => setHistoryFor((e.target as HTMLDetailsElement).open ? order.id : null)}>
          <summary className="tu-detail-label" style={{ cursor: "pointer" }}>History</summary>
          {historyOpen && (
            <div style={{ marginTop: 10 }}>
              <WorkOrderHistory
                workOrderId={order.id}
                refreshKey={[order.status, order.priority, order.dueDate, order.verifiedAt, comments.length, order.assignments.length, order.timerStartedAt].join("|")}
              />
            </div>
          )}
        </details>
      </div>

      <div className="tu-detail-footer">
        <Link
          href={`/accounts/${order.accountId}/work-orders/${order.id}`}
          className="tu-btn-secondary tu-btn-sm"
          style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
        >
          Open full page
          <span aria-hidden="true">↗</span>
        </Link>
        <span style={{ marginLeft: 10, fontSize: 12, color: "var(--tu-text-subtle)" }}>
          for parts, attachments and steps
        </span>
        <Link
          href={`/print/work-orders/${order.id}`}
          target="_blank"
          className="tu-btn-secondary tu-btn-sm"
          style={{ marginLeft: "auto" }}
        >
          Print
        </Link>
      </div>
    </div>
  );
}
