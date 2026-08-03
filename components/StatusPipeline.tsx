"use client";

export type PipelineStatus = "REQUESTED" | "PENDING" | "IN_PROGRESS" | "ON_HOLD" | "COMPLETED" | "REJECTED";

const PROGRESS: Record<PipelineStatus, number> = {
  REQUESTED: 1,
  PENDING: 2,
  IN_PROGRESS: 3,
  ON_HOLD: 3, // paused at the in-progress stage; the badge conveys "On Hold"
  COMPLETED: 4,
  REJECTED: -1,
};

const DEFAULT_STEPS = ["Submitted", "Accepted", "In Progress", "Completed"];

/**
 * Horizontal progress stepper for a work order's lifecycle. Render the
 * REJECTED state with a separate banner — this only shows the happy path.
 */
export default function StatusPipeline({
  status,
  steps = DEFAULT_STEPS,
  ariaLabel,
}: {
  status: PipelineStatus;
  steps?: string[];
  ariaLabel?: string;
}) {
  const progress = PROGRESS[status];
  const onHold = status === "ON_HOLD";
  return (
    <div className="tu-pipeline" role="img" aria-label={ariaLabel ?? `Progress: step ${progress} of ${steps.length}`}>
      {steps.map((step, i) => {
        const stepNum = i + 1;
        const done = progress >= stepNum;
        const active = progress === stepNum;
        const paused = active && onHold; // sitting on this step, but work is paused
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
          </div>
        );
      })}
    </div>
  );
}
