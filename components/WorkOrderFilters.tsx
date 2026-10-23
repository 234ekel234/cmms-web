"use client";

import { WORK_ORDER_STATUS, type WorkOrderStatus } from "@/lib/statuses";
import type { WorkOrderFlag } from "@/lib/workOrders";

/**
 * The two filter axes for a work-order list.
 *
 * This replaces a ten-tab bar in which only seven entries were statuses. `All`,
 * `Overdue` and `Awaiting sign-off` shared that control with the lifecycle
 * stages, which had two costs: picking a status meant losing the overdue view,
 * so "what is overdue and in progress?" could not be asked at all; and because
 * the tabs were mutually exclusive, changing an order's status made it vanish
 * from the tab you were standing in.
 *
 * Split into two axes, both multi-select and ANDed together, neither of them
 * exclusive. Selecting nothing on an axis narrows nothing — that is the old
 * `All`, so it needs no chip of its own.
 */

// Pipeline order, not enum order: the row reads left to right as the lifecycle
// a job actually walks, so the chips double as a legend for the Status column.
const STATUS_ORDER: WorkOrderStatus[] = [
  "REQUESTED",
  "PENDING",
  "IN_PROGRESS",
  "ON_HOLD",
  "COMPLETED",
  "APPROVED",
  "REJECTED",
];

const FLAG_LABEL: Record<WorkOrderFlag, string> = {
  OVERDUE: "Overdue",
  AWAITING: "Awaiting sign-off",
  REVIEW: "Awaiting review",
};

function toggle<T>(set: ReadonlySet<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

export default function WorkOrderFilters({
  statuses,
  onStatusesChange,
  flags,
  onFlagsChange,
  statusCounts,
  flagCounts,
  /** Flags with nothing behind them are hidden rather than shown at zero —
   *  an account with no external work has no sign-off queue to offer. */
  availableFlags = ["OVERDUE", "REVIEW", "AWAITING"],
}: {
  statuses: ReadonlySet<WorkOrderStatus>;
  onStatusesChange: (next: Set<WorkOrderStatus>) => void;
  flags: ReadonlySet<WorkOrderFlag>;
  onFlagsChange: (next: Set<WorkOrderFlag>) => void;
  statusCounts: Record<WorkOrderStatus, number>;
  flagCounts: Record<WorkOrderFlag, number>;
  availableFlags?: WorkOrderFlag[];
}) {
  const shownFlags = availableFlags.filter((f) => flagCounts[f] > 0 || flags.has(f));

  return (
    <div className="tu-chip-row" role="group" aria-label="Filter work orders">
      <span className="tu-chip-axis-label" id="wo-status-axis">Status</span>

      {STATUS_ORDER.map((s) => {
        const on = statuses.has(s);
        const count = statusCounts[s] ?? 0;
        return (
          <button
            key={s}
            type="button"
            className="tu-chip-toggle"
            aria-pressed={on}
            // Zero-count statuses stay clickable while selected, so the only way
            // to reach an empty result is deliberate and is always reversible.
            disabled={count === 0 && !on}
            onClick={() => onStatusesChange(toggle(statuses, s))}
          >
            {WORK_ORDER_STATUS[s].label}
            <span className="tu-chip-count">{count}</span>
          </button>
        );
      })}

      {shownFlags.length > 0 && (
        <>
          <span className="tu-chip-divider" aria-hidden="true" />
          <span className="tu-chip-axis-label">Flags</span>
          {shownFlags.map((f) => (
            <button
              key={f}
              type="button"
              className="tu-chip-toggle"
              aria-pressed={flags.has(f)}
              onClick={() => onFlagsChange(toggle(flags, f))}
            >
              {FLAG_LABEL[f]}
              <span className="tu-chip-count">{flagCounts[f]}</span>
            </button>
          ))}
        </>
      )}
    </div>
  );
}
