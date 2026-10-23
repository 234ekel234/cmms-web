"use client";

export type PipelineStatus =
  | "REQUESTED" | "PENDING" | "IN_PROGRESS" | "ON_HOLD" | "COMPLETED" | "APPROVED" | "REJECTED";

const PROGRESS: Record<PipelineStatus, number> = {
  REQUESTED: 1,
  PENDING: 2,
  IN_PROGRESS: 3,
  ON_HOLD: 3, // paused at the in-progress stage; the badge conveys "On Hold"
  COMPLETED: 4, // 5 once a supervisor has verified it — see `verified`
  APPROVED: 6,
  REJECTED: -1,
};

// Verified is a step, not a status: a supervisor's review of COMPLETED work.
const DEFAULT_STEPS = ["Submitted", "Accepted", "In Progress", "Completed", "Verified"];

/**
 * The lifecycle for work that ends with the client, rather than at COMPLETED.
 *
 * Passed by the caller instead of switched on here, because whether an order
 * needs sign-off is a property of the order — see needsClientApproval in
 * web/lib/workOrders.ts — and this component only knows a status. Showing the
 * fifth step to work that will never reach it would leave every internal job
 * looking permanently unfinished.
 */
export const APPROVAL_STEPS = ["Submitted", "Accepted", "In Progress", "Completed", "Verified", "Approved"];

/**
 * When each step was reached, from the order itself. Positional, matching the
 * steps: Submitted is createdAt, Accepted acceptedAt, In Progress startedAt
 * (the first start — a resume after a hold does not move it), and so on.
 * Completed and Verified are the latest ones: a send-back clears both.
 */
export type StepTimes = Partial<Record<
  "createdAt" | "acceptedAt" | "startedAt" | "completedAt" | "verifiedAt" | "approvedAt",
  string | null
>>;
const STEP_TIME_FIELDS = ["createdAt", "acceptedAt", "startedAt", "completedAt", "verifiedAt", "approvedAt"] as const;

function stepTime(iso: string | null | undefined): { day: string; time: string } | null {
  if (!iso) return null;
  const d = new Date(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return {
    day: d.toLocaleDateString(undefined, { day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) }),
    time: d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }),
  };
}

/**
 * Horizontal progress stepper for a work order's lifecycle. Render the
 * REJECTED state with a separate banner — this only shows the happy path.
 */
export default function StatusPipeline({
  status,
  steps = DEFAULT_STEPS,
  verified = false,
  times,
  ariaLabel,
}: {
  status: PipelineStatus;
  steps?: string[];
  /** COMPLETED work a supervisor has checked — lights the Verified step. */
  verified?: boolean;
  /** Dates each reached step underneath it. Omit where there is no room. */
  times?: StepTimes;
  ariaLabel?: string;
}) {
  const progress = status === "COMPLETED" && verified ? 5 : PROGRESS[status];
  const onHold = status === "ON_HOLD";
  return (
    <div className="tu-pipeline" role="img" aria-label={ariaLabel ?? `Progress: step ${progress} of ${steps.length}`}>
      {steps.map((step, i) => {
        const stepNum = i + 1;
        const done = progress >= stepNum;
        const active = progress === stepNum;
        const paused = active && onHold; // sitting on this step, but work is paused
        // Only for a step actually reached: a stale stamp on a step the job has
        // gone back past (it cannot today, but a future transition might) would
        // date something that is no longer true.
        const when = times && done ? stepTime(times[STEP_TIME_FIELDS[i]]) : null;
        return (
          <div key={step} className="tu-pipe-step">
            {i < steps.length - 1 && (
              <span className={`tu-pipe-line${progress > stepNum ? " tu-filled" : ""}`} />
            )}
            <span
              className={`tu-pipe-node${
                paused ? " tu-paused" : active ? " tu-current" : done ? " tu-done" : ""
              }`}
            >
              {paused ? (
                <span className="tu-pipe-pause" aria-hidden="true">
                  <span />
                  <span />
                </span>
              ) : active ? <span className="tu-pipe-inner" /> : done ? "✓" : ""}
            </span>
            <span className={`tu-pipe-label${paused ? " tu-paused" : done ? " tu-done" : ""}`}>
              {paused ? "On Hold" : step}
            </span>
            {when && (
              <time className="tu-pipe-time" dateTime={times![STEP_TIME_FIELDS[i]]!}>
                {when.day}<br />{when.time}
              </time>
            )}
          </div>
        );
      })}
    </div>
  );
}
