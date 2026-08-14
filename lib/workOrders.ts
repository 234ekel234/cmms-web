import type { WorkOrderStatus } from "@/lib/statuses";

/**
 * Work-order rules the UI needs to agree with the API on.
 *
 * backend/helpers/workOrderApproval.js is the authority. This is the mirror,
 * kept deliberately small: it decides what to *offer*, never what to allow. The
 * API refuses anything these get wrong, so the cost of a mismatch here is a
 * button that fails rather than a permission hole — but a button that can only
 * fail is still a bug, which is why the rule is copied rather than guessed at
 * each call site.
 */

type ApprovalShape = { type?: string | null; isSpecialProject?: boolean | null };

/**
 * Whether this order ends with the client rather than at COMPLETED.
 *
 * Mirrors needsClientApproval on the server: the client raised it (EXTERNAL),
 * or it is a special project. Routine internal maintenance closes at COMPLETED,
 * because nobody is waiting on a customer to countersign a generator test.
 */
export function needsClientApproval(wo: ApprovalShape): boolean {
  return wo.type === "EXTERNAL" || wo.isSpecialProject === true;
}

/** Finished work, whether or not it has been signed off. */
export function isDone(status: WorkOrderStatus): boolean {
  return status === "COMPLETED" || status === "APPROVED";
}

/** Sitting with the client, waiting for a decision. */
export function awaitingClient(wo: ApprovalShape & { status: WorkOrderStatus }): boolean {
  return wo.status === "COMPLETED" && needsClientApproval(wo);
}

/**
 * Settled — work was delivered and accepted, so the record is now evidence.
 *
 * Mirrors `isSettled` on the server, and the API answers 409 on anything this
 * covers, so getting it wrong here costs a control that fails rather than an
 * edit that should not have happened.
 *
 * Two exceptions, both deliberate. Work *awaiting* a client is not settled —
 * they may still send it back for rework, so the technician has to be able to
 * finish the job when it returns. And REJECTED is not settled either: nothing
 * was delivered and nobody accepted anything, so there is no record to protect,
 * while the parts issued against it are real stock that has to be returnable.
 *
 * Use `isClosed` instead for "is this still outstanding" — overdue flags,
 * queue counts. The two differ only on REJECTED, which is exactly where it matters.
 */
export function isSettled(wo: ApprovalShape & { status: WorkOrderStatus }): boolean {
  if (wo.status === "APPROVED") return true;
  return wo.status === "COMPLETED" && !needsClientApproval(wo);
}

/**
 * No longer outstanding work — the counterpart to the server's CLOSED_STATUSES.
 *
 * Includes REJECTED, which `isSettled` does not. A rejected job is not waiting
 * on anyone and must not count as overdue, but its record is still editable.
 */
export function isClosed(wo: ApprovalShape & { status: WorkOrderStatus }): boolean {
  return wo.status === "REJECTED" || isSettled(wo);
}
