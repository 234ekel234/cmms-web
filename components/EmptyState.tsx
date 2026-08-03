/**
 * One empty state for the whole app.
 *
 * Every list used to hand-roll its own "nothing here" message — different tone,
 * colour, padding and no icon. This component is the single shape: a muted icon
 * disc, a title, an optional hint line, and an optional action.
 *
 * Styling lives in `.tu-empty*` in globals.css, so it themes with everything else.
 */

type IconName =
  | "account"
  | "activity"
  | "asset"
  | "attendance"
  | "checklist"
  | "employee"
  | "inbox"
  | "notification"
  | "part"
  | "report"
  | "schedule"
  | "search"
  | "training"
  | "workOrder";

const S = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

/**
 * Kept in one place so the same concept always gets the same glyph — an asset
 * looks like a box wherever it runs out.
 */
const ICONS: Record<IconName, React.ReactNode> = {
  account: (
    <svg width="22" height="22" {...S} aria-hidden="true">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  ),
  activity: (
    <svg width="22" height="22" {...S} aria-hidden="true">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  ),
  asset: (
    <svg width="22" height="22" {...S} aria-hidden="true">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  ),
  attendance: (
    <svg width="22" height="22" {...S} aria-hidden="true">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <polyline points="16 11 18 13 22 9" />
    </svg>
  ),
  checklist: (
    <svg width="22" height="22" {...S} aria-hidden="true">
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  ),
  employee: (
    <svg width="22" height="22" {...S} aria-hidden="true">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  inbox: (
    <svg width="22" height="22" {...S} aria-hidden="true">
      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
      <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </svg>
  ),
  notification: (
    <svg width="22" height="22" {...S} aria-hidden="true">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  ),
  part: (
    <svg width="22" height="22" {...S} aria-hidden="true">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  ),
  report: (
    <svg width="22" height="22" {...S} aria-hidden="true">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
      <line x1="3" y1="20" x2="21" y2="20" />
    </svg>
  ),
  schedule: (
    <svg width="22" height="22" {...S} aria-hidden="true">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),
  search: (
    <svg width="22" height="22" {...S} aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  ),
  training: (
    <svg width="22" height="22" {...S} aria-hidden="true">
      <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
      <path d="M6 12v5c0 1.657 2.686 3 6 3s6-1.343 6-3v-5" />
    </svg>
  ),
  workOrder: (
    <svg width="22" height="22" {...S} aria-hidden="true">
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
      <line x1="9" y1="12" x2="15" y2="12" />
      <line x1="9" y1="16" x2="13" y2="16" />
    </svg>
  ),
};

type Props = {
  icon: IconName;
  title: string;
  /** One sentence of context — what would put something here. */
  hint?: React.ReactNode;
  /** A primary action, e.g. the button that creates the first record. */
  action?: React.ReactNode;
  /** Tighter padding, for empty table bodies and small panels. */
  compact?: boolean;
};

export default function EmptyState({ icon, title, hint, action, compact }: Props) {
  return (
    <div className={compact ? "tu-empty tu-empty-sm" : "tu-empty"}>
      <span className="tu-empty-icon" aria-hidden="true">{ICONS[icon]}</span>
      <p className="tu-empty-title">{title}</p>
      {hint && <p className="tu-empty-hint">{hint}</p>}
      {action && <div className="tu-empty-action">{action}</div>}
    </div>
  );
}

/**
 * Empty state for a table: same component, wrapped in a full-width row so it
 * sits centred under the headers instead of squeezing into one column.
 */
export function EmptyRow({ colSpan, ...props }: Props & { colSpan: number }) {
  return (
    <tr className="tu-empty-row">
      <td colSpan={colSpan}>
        <EmptyState {...props} compact />
      </td>
    </tr>
  );
}
