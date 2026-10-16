"use client";

import type { ReactNode } from "react";
import type { SheetOptions } from "@/components/print/WorkOrderSheet";

/** The on-screen toolbar above job sheets: what to include, and Print. Hidden on paper. */
export default function SheetOptionsBar({
  back,
  options,
  onChange,
  hasNotes,
  hasPauses,
  summary,
}: {
  back: ReactNode;
  options: SheetOptions;
  onChange: (next: SheetOptions) => void;
  hasNotes: boolean;
  hasPauses: boolean;
  summary?: ReactNode;
}) {
  const toggle = (key: keyof SheetOptions) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...options, [key]: e.target.checked });

  return (
    <div className="ps-toolbar">
      {back}
      {summary && <span className="ps-muted">{summary}</span>}
      <span className="ps-spacer" />
      <label>
        <input type="checkbox" checked={options.showProgress} onChange={toggle("showProgress")} />
        Show ticked steps
      </label>
      {hasNotes && (
        <label>
          <input type="checkbox" checked={options.showNotes} onChange={toggle("showNotes")} />
          Progress notes
        </label>
      )}
      {hasPauses && (
        <label>
          <input type="checkbox" checked={options.showPauses} onChange={toggle("showPauses")} />
          Pause log
        </label>
      )}
      <button type="button" className="ps-print-btn" onClick={() => window.print()}>
        Print
      </button>
    </div>
  );
}
