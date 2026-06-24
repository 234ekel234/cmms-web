"use client";

export type PipelineStatus = "REQUESTED" | "PENDING" | "IN_PROGRESS" | "COMPLETED" | "REJECTED";

const PROGRESS: Record<PipelineStatus, number> = {
  REQUESTED: 1,
  PENDING: 2,
  IN_PROGRESS: 3,
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
  return (
    <div className="flex items-start my-4" role="img" aria-label={ariaLabel ?? `Progress: step ${progress} of ${steps.length}`}>
      {steps.map((step, i) => {
        const stepNum = i + 1;
        const done = progress >= stepNum;
        const active = progress === stepNum;
        return (
          <div key={step} className="flex-1 flex flex-col items-center relative">
            {i < steps.length - 1 && (
              <span className={`absolute top-[11px] left-1/2 w-full h-0.5 ${progress > stepNum ? "bg-[#2166AC]" : "bg-gray-200"}`} />
            )}
            <span
              className={`relative z-10 flex items-center justify-center w-[22px] h-[22px] rounded-full text-[11px] font-bold ${
                active
                  ? "bg-white border-[3px] border-[#2166AC]"
                  : done
                  ? "bg-[#2166AC] border-2 border-[#2166AC] text-white"
                  : "bg-gray-200 border-2 border-gray-200 text-transparent"
              }`}
            >
              {active ? <span className="w-2 h-2 rounded-full bg-[#2166AC]" /> : done ? "✓" : ""}
            </span>
            <span className={`mt-1.5 text-[9px] font-semibold text-center ${done ? "text-[#2166AC]" : "text-gray-400"}`}>
              {step}
            </span>
          </div>
        );
      })}
    </div>
  );
}
