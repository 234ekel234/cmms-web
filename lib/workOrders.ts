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

type ApprovalShape = { type?: string | null; isSpecialProject?: boolean | null; verifiedAt?: string | null };

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

/**
 * Completed, waiting for a supervisor to check it. Mirrors awaitingReview on
 * the server. Every job is reviewed; a supervisor completing one verifies it in
 * the same step, so in practice this is a technician's finished work.
 */
export function awaitingReview(wo: ApprovalShape & { status: WorkOrderStatus }): boolean {
  return wo.status === "COMPLETED" && !wo.verifiedAt;
}

/** Sitting with the client, waiting for a decision — which needs review first. */
export function awaitingClient(wo: ApprovalShape & { status: WorkOrderStatus }): boolean {
  return wo.status === "COMPLETED" && needsClientApproval(wo) && !!wo.verifiedAt;
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
  // Internal work is settled once verified, not before: the review is when a
  // supervisor may still need to correct it.
  return wo.status === "COMPLETED" && !needsClientApproval(wo) && !!wo.verifiedAt;
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
 * What the API adds to every work order it sends (`withStageFacts` in
 * backend/routes/workOrderRoutes.js) so a row can say where it stands. Optional
 * so a row from an older response still type-checks; `stageNote` copes.
 */
export type StageFacts = {
  /** The pause the clock is stopped on; always null for a client. */
  /** CLOCK: the clock was paused. HOLD: put On Hold. SENT_BACK: completed work returned. */
  openPause?: { reason: string; kind?: "CLOCK" | "HOLD" | "SENT_BACK"; pausedAt?: string; pausedByName?: string } | null;
  /** When an unanswered sign-off closes itself — the API alone knows the grace period. */
  autoApproveAt?: string | null;
  /** Null on approved work means the nightly sweep closed it, not the client. */
  approvedById?: string | null;
  approvedByName?: string | null;
  /** Supervisor review. Null on COMPLETED work means it still awaits review. */
  verifiedAt?: string | null;
  verifiedByName?: string | null;
};

/** What `stageNote` reads. Every field beyond status is optional so any list's row will do. */
export type StageShape = ApprovalShape & StageFacts & {
  status: WorkOrderStatus;
  assignments?: { employee: { name: string } }[];
  timerStartedAt?: string | null;
};

export type StageNote = {
  text: string;
  /** Somebody has to act and nothing says they are: unassigned, paused, parked with the client. */
  attention: boolean;
};

const DAY_MS = 86_400_000;

/**
 * One line saying where an order stands and whose move it is — the thing a
 * status name alone does not say. "In Progress" covers a technician on the job
 * right now and a job parked for three days on a missing part; "Completed"
 * covers work that is finished for good and work waiting on a client.
 *
 * A client reads it from the other side of the counter: their sign-off is
 * "yours", and they are never told about the clock — pause reasons are
 * withheld from them by the API in any case.
 */
export function stageNote(wo: StageShape, isClient: boolean, now = Date.now()): StageNote {
  const note = (text: string, attention = false): StageNote => ({ text, attention });
  switch (wo.status) {
    case "REQUESTED":
      if (isClient) return note("Waiting for the team to accept it");
      return note(wo.isSpecialProject ? "Waiting for a manager to accept it" : "Waiting to be accepted", true);
    case "PENDING":
      if (isClient) return note("Accepted — work has not started yet");
      return (wo.assignments?.length ?? 0) > 0
        ? note("Ready to start")
        : note("Accepted — nobody assigned yet", true);
    case "IN_PROGRESS":
      if (isClient) return note("Work under way");
      if (wo.timerStartedAt) return note("Being worked on — clock running");
      if (wo.openPause) return note(`Paused — ${wo.openPause.reason}`, true);
      return note("Started — clock not running", true);
    case "ON_HOLD":
      if (isClient) return note("On hold — the team will resume it");
      if (wo.openPause?.kind === "SENT_BACK") return note(`Sent back — ${wo.openPause.reason}`, true);
      if (wo.openPause) return note(`On hold — ${wo.openPause.reason}`, true);
      return note("On hold — resume it to continue", true);
    case "COMPLETED": {
      if (!wo.verifiedAt) {
        return isClient
          ? note("Finished — the team is checking it")
          : note("Done — waiting for supervisor review", true);
      }
      if (!needsClientApproval(wo)) return note("Done");
      const who = isClient ? "Waiting for your sign-off" : "Waiting for client sign-off";
      if (!wo.autoApproveAt) return note(who, true);
      const days = Math.ceil((new Date(wo.autoApproveAt).getTime() - now) / DAY_MS);
      const when = days <= 0 ? "at the next daily run" : days === 1 ? "in 1 day" : `in ${days} days`;
      return note(`${who} — closes automatically ${when}`, true);
    }
    case "APPROVED":
      if (!wo.approvedById) return note("Closed automatically — no client response");
      return note(wo.approvedByName ? `Signed off by ${wo.approvedByName}` : "Signed off by the client");
    case "REJECTED":
      return note("Rejected — closed without work");
  }
}

/**
 * Past its due date and still outstanding.
 *
 * Built on `isClosed`, not `isSettled`: approved work is finished and must not
 * keep reading as late, and a rejected job is not outstanding either. Both list
 * pages had their own copy of this, spelled slightly differently.
 */
export function isOverdue(wo: { dueDate: string | null; status: WorkOrderStatus }): boolean {
  return !!wo.dueDate && !isClosed(wo) && new Date(wo.dueDate).getTime() < Date.now();
}

/**
 * The cross-cutting conditions a work order can be in, as opposed to the
 * lifecycle status it sits at.
 *
 * These are the reason the old tab bar could not answer "what is overdue *and*
 * in progress?": overdue and awaiting-sign-off are not stages, they are
 * questions about an order that may be true at several stages, and putting them
 * in the same mutually-exclusive control as the statuses made the two
 * unaskable together.
 */
export type WorkOrderFlag = "OVERDUE" | "AWAITING" | "REVIEW";

export function matchesFlag(
  wo: ApprovalShape & { status: WorkOrderStatus; dueDate: string | null },
  flag: WorkOrderFlag,
): boolean {
  if (flag === "OVERDUE") return isOverdue(wo);
  if (flag === "REVIEW") return awaitingReview(wo);
  return awaitingClient(wo);
}

/**
 * Does this order survive the two filter axes?
 *
 * Empty on either axis means "no narrowing on that axis" rather than "match
 * nothing" — an empty status set is the old All tab. The axes are ANDed, and
 * within the flag axis the selections are ANDed too: picking Overdue and
 * Awaiting asks for orders that are both, which is a coherent question and the
 * one a supervisor chasing a stalled sign-off actually has.
 */
export function passesFilters(
  wo: ApprovalShape & { status: WorkOrderStatus; dueDate: string | null },
  statuses: ReadonlySet<WorkOrderStatus>,
  flags: ReadonlySet<WorkOrderFlag>,
): boolean {
  if (statuses.size > 0 && !statuses.has(wo.status)) return false;
  for (const f of flags) if (!matchesFlag(wo, f)) return false;
  return true;
}

/**
 * The statuses staff may move an order to next.
 *
 * Mirrors `allowedTransitions` in backend/helpers/workOrderApproval.js, and
 * lives here rather than inline on the detail page because the work-order list's
 * side sheet offers the same buttons. Two copies of a transition table is how
 * one of them ends up drawing a control the API refuses.
 *
 * Staff transitions only, and none out of COMPLETED. Approving is the
 * client's alone, and sending back is role-gated and always asks why, so both
 * are offered by their own controls (see canSendBack) — a manager is never
 * shown an Approve button that would 403.
 */
export const STAFF_TRANSITIONS: Record<WorkOrderStatus, WorkOrderStatus[]> = {
  REQUESTED:   ["PENDING", "REJECTED"],
  PENDING:     ["IN_PROGRESS", "REJECTED"],
  IN_PROGRESS: ["COMPLETED", "PENDING", "ON_HOLD"],
  ON_HOLD:     ["IN_PROGRESS", "REJECTED"],
  COMPLETED:   [],
  APPROVED:    [],
  REJECTED:    [],
};

/**
 * Who may send completed work back for rework, landing it On Hold with a
 * reason. Mirrors transitionDenialReason in backend/helpers/workOrderApproval.js:
 * a supervisor or above on any completed job (quality control is theirs), the
 * client only on work awaiting their sign-off, a technician never. Offered by
 * its own control rather than STAFF_TRANSITIONS, because it is role-gated and
 * always asks why.
 */
export function canSendBack(role: string | undefined, wo: { status: WorkOrderStatus; type?: string; isSpecialProject?: boolean }): boolean {
  if (wo.status !== "COMPLETED") return false;
  if (role === "CLIENT") return needsClientApproval(wo);
  return role === "SUPERVISOR" || role === "MANAGER" || role === "GENERAL_MANAGER";
}

/** Supervisors and up review completed work; mirrors STAFF on the server. */
export function isReviewer(role: string | undefined): boolean {
  return role === "SUPERVISOR" || role === "MANAGER" || role === "GENERAL_MANAGER";
}

/** Moves that must say why — the same rule as pausing the clock. */
export function needsReason(to: WorkOrderStatus): boolean {
  return to === "ON_HOLD";
}

/**
 * What to call a transition, given where the order is coming from.
 *
 * The destination alone is not enough: PENDING means "Accept" arriving from
 * REQUESTED and "Revert to Accepted" arriving from IN_PROGRESS, and
 * IN_PROGRESS means "Start work" from PENDING but "Resume work" from ON_HOLD.
 * Labelling by destination alone told a supervisor they were starting work they
 * had already started.
 */
export function transitionLabel(from: WorkOrderStatus, to: WorkOrderStatus): string {
  if (to === "PENDING") return from === "IN_PROGRESS" ? "Revert to Accepted" : "Accept";
  if (to === "IN_PROGRESS") return from === "ON_HOLD" ? "Resume work" : "Start work";
  if (to === "ON_HOLD") return "Put on hold";
  if (to === "COMPLETED") return "Mark as complete";
  if (to === "REJECTED") return "Reject";
  if (to === "APPROVED") return "Approve";
  return to;
}

/**
 * The visual weight a transition button carries.
 *
 * Returned as a token name rather than a class so the sheet and the detail page
 * can spend it differently — one draws pills, the other full buttons.
 */
export function transitionTone(to: WorkOrderStatus): "danger" | "success" | "neutral" | "brand" {
  if (to === "REJECTED") return "danger";
  if (to === "COMPLETED") return "success";
  if (to === "ON_HOLD") return "neutral";
  return "brand";
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

/**
 * The reference people quote — "WO-1042". `WorkOrder.number` is one sequence
 * across every account, so the number alone is unique; the prefix is only so it
 * reads as a work order when pasted into an email or a chat.
 */
export function workOrderRef(number: number): string {
  return `WO-${number}`;
}

/**
 * Whether a search box entry is asking for this order by number. Accepts the
 * forms people actually type — "1042", "#1042", "wo-1042", "WO 1042" — and
 * matches the whole number, so "104" does not return WO-1042.
 */
export function matchesWorkOrderRef(number: number | undefined, query: string): boolean {
  if (number === undefined) return false;
  const m = query.trim().match(/^(?:wo[-\s]?|#)?(\d+)$/i);
  return m !== null && Number(m[1]) === number;
}

/**
 * The most job sheets one batch print will take. A day's work for a site is a
 * handful; past this it is a report, not a stack of sheets, and the print page
 * makes one request per order.
 */
export const MAX_BATCH_PRINT = 100;

/** The batch print page for these orders, in the order given. */
export function batchPrintHref(ids: string[]): string {
  return `/print/work-orders?ids=${ids.slice(0, MAX_BATCH_PRINT).map(encodeURIComponent).join(",")}`;
}
