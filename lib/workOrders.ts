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
 * Status alone, exactly as the server has it. Deriving this from `isSettled`
 * instead looks equivalent and is not: work sitting COMPLETED awaiting a client
 * is not settled, but it *is* closed. Built on `isSettled` it read as overdue
 * on the detail page while the dashboard, the reports and the overdue sweep all
 * agreed it was not — the job is finished, and a customer being slow to
 * countersign is not the technician running late.
 */
export function isClosed(wo: { status: WorkOrderStatus }): boolean {
  return wo.status === "COMPLETED" || wo.status === "APPROVED" || wo.status === "REJECTED";
}

/**
 * The cue that work is parked with the client, or null when it is not.
 *
 * The wording differs by who is reading — "your" for the client whose decision
 * it is, "client" for the staff who must not sit waiting on themselves — but
 * the *condition* must not, which is why both come from `awaitingClient` here
 * rather than from a status check written out at each call site. COMPLETED
 * alone is the wrong test everywhere this appears: routine internal work is
 * also COMPLETED and is waiting for nobody.
 *
 * Used by the account work-order list and the portal card. The cross-account
 * table asks `awaitingClient` directly and labels it "Awaiting client" — the
 * column is too narrow for the full phrase — and the detail page states it as a
 * heading rather than a badge. Both are wording, not condition; the condition
 * is the part that must stay in one place.
 */
export function signOffCue(
  wo: ApprovalShape & { status: WorkOrderStatus },
  isClient: boolean,
): string | null {
  if (!awaitingClient(wo)) return null;
  return isClient ? "Awaiting your sign-off" : "Awaiting client sign-off";
}

/**
 * Triage rank for the "smart" sorts: 0 still being worked, 1 parked with the
 * client, 2 finished for good.
 *
 * Both lists used to sort on `isClosed` alone, which put work awaiting a client
 * in the same bucket as work that is genuinely over — so the one row somebody
 * still has to act on sank to the bottom of the page, under every signed-off
 * and rejected job. It is not active work, so it does not belong above the open
 * queue either; it belongs exactly between the two.
 */
export function triageRank(wo: ApprovalShape & { status: WorkOrderStatus }): number {
  if (!isClosed(wo)) return 0;
  return awaitingClient(wo) ? 1 : 2;
}
