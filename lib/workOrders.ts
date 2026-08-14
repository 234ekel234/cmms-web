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
 * Settled — the record is finished and closed to further edits.
 *
 * Mirrors `isSettled` on the server, which derives it from an order having no
 * allowed transitions left. Spelled out here because the client has no
 * transition table, but the three cases are the same: APPROVED and REJECTED are
 * terminal, and COMPLETED is terminal for routine internal work.
 *
 * The exception is the one that matters. Work awaiting a client is *not*
 * settled — they may still send it back for rework, so the technician has to be
 * able to finish the job when it returns. `awaitingClient` above is exactly the
 * case this must not catch.
 *
 * The API returns 409 on any of these, so getting it wrong here costs a control
 * that fails rather than an edit that shouldn't have happened.
 */
export function isSettled(wo: ApprovalShape & { status: WorkOrderStatus }): boolean {
  if (wo.status === "APPROVED" || wo.status === "REJECTED") return true;
  return wo.status === "COMPLETED" && !needsClientApproval(wo);
}
