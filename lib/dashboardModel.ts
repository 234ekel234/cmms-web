/**
 * Everything the dashboard shows, worked out once.
 *
 * This used to live in the body of the page component, which was fine while the
 * page was one fixed column of cards. It is not fine now that each card is an
 * independently placed widget: a widget that derived its own figures would be a
 * second opinion on numbers that must agree — the point of `Open Work Orders`
 * and `Open Work by Account` disagreeing once already being that they counted
 * open differently.
 *
 * So the page fetches, this builds the model, and a widget only formats. Pure
 * and free of React, so it can be reasoned about (and tested) without one.
 */

import { WORK_ORDER_STATUS, type WorkOrderStatus } from "@/lib/statuses";

export type AccountSummary = {
  id: string;
  name: string;
  openWorkOrders: number;
  requestedWorkOrders: number;
  overdueWorkOrders: number;
  poorHealthAssets: number;
  checklistsDone: number;
  checklistsTotal: number;
  attendancePresent: number;
  attendanceTotal: number;
};

export type ActivityEntry = {
  id: string;
  action: string;
  description: string;
  performedByName: string | null;
  createdAt: string;
  accountId: string;
};

export type TrendPoint = { date: string; count: number };

export type FreqAccount = { id: string; name: string; total: number; completed: number };

export type FreqBreakdown = {
  frequency: string;
  total: number;
  completed: number;
  accounts?: FreqAccount[];
};

export type DashboardData = {
  // Derived from the status union rather than spelled out, so adding a status
  // is a compile error here instead of a silently missing chart segment. That
  // is how APPROVED was caught: WO_STATUS builds its series from the same map.
  workOrders: Record<WorkOrderStatus, number>;
  assets: { FUNCTIONAL: number; FUNCTIONAL_WITH_FINDINGS: number; BREAKDOWN: number };
  manHours: {
    estimatedMinutes: number;
    actualMinutes: number;
    /** Finished jobs carrying both an estimate and recorded time. */
    jobsCompared: number;
    /** Everything finished in the window, compared or not. */
    jobsFinished: number;
  };
  overdueWorkOrders: number;
  poorHealthAssets: number;
  /** Supervisors and above only; null for anyone else. */
  awaitingReview?: number | null;
  satisfaction?: { days: number; responses: number; overall: number | null; low: number } | null;
  attendance: { present: number; absent: number };
  checklists: { completed: number; total: number };
  accounts: AccountSummary[];
  recentActivity: ActivityEntry[];
  trends: { workOrdersCompleted: TrendPoint[]; checklistCompletions: TrendPoint[] };
  checklistBreakdown: FreqBreakdown[];
  period: string;
  trendDays: number;
};

export type OpenOrder = {
  id: string;
  title: string;
  status: WorkOrderStatus;
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | null;
  dueDate: string | null;
  createdAt: string;
  accountId: string;
  account: { name: string };
  assignments: unknown[];
  /** Days since creation, computed once at fetch time — not during render. */
  ageDays: number;
};

export type Period = "today" | "week" | "month" | "custom";

export const PERIOD_LABELS: Record<Period, string> = {
  today: "Today",
  week: "This Week",
  month: "This Month",
  custom: "Custom",
};

export const PRIORITY_SERIES = [
  { key: "CRITICAL", label: "Critical", token: "var(--tu-priority-critical)" },
  { key: "HIGH",     label: "High",     token: "var(--tu-priority-high)"     },
  { key: "MEDIUM",   label: "Medium",   token: "var(--tu-priority-medium)"   },
  { key: "LOW",      label: "Low",      token: "var(--tu-priority-low)"      },
] as const;

export const WO_STATUS = (Object.keys(WORK_ORDER_STATUS) as WorkOrderStatus[]).map((key) => ({
  key,
  label: WORK_ORDER_STATUS[key].label,
  color: WORK_ORDER_STATUS[key].color,
}));

/**
 * "Stalled" is age-based on purpose. Overdue only fires when dueDate < now, so
 * an open work order with no due date can never be flagged however long it
 * sits. This catches that case.
 *
 * The number is now a per-widget setting; this is what an unconfigured Stalled
 * Work card uses, and what it resets to.
 */
export const STALL_DAYS = 14;

/**
 * The last `days` points of a trend series.
 *
 * The page fetches the widest window the API offers and every trend card slices
 * it, so a card pinned to 7 days beside one showing 30 costs no second request.
 * The alternative — a fetch per card — turns one dashboard load into four, and
 * the series is a few dozen integers.
 */
export function sliceTrend(points: TrendPoint[], days: number): TrendPoint[] {
  return days >= points.length ? points : points.slice(points.length - days);
}

export type DashboardModel = ReturnType<typeof buildDashboardModel>;

export type ModelInput = {
  data: DashboardData | null;
  openOrders: OpenOrder[] | null;
  lowStock: number | null;
  loading: boolean;
  accountFilter: string;
  periodCaption: string;
  /** The window the page's own control is set to — what a card set to "auto" follows. */
  pageTrendDays: number;
};

export function buildDashboardModel(input: ModelInput) {
  const { data, openOrders, lowStock, loading, accountFilter, periodCaption, pageTrendDays } = input;

  const wo = data?.workOrders;
  const openWOs = (wo?.REQUESTED ?? 0) + (wo?.PENDING ?? 0) + (wo?.IN_PROGRESS ?? 0) + (wo?.ON_HOLD ?? 0);
  const totalWOs = WO_STATUS.reduce((s, x) => s + (wo?.[x.key] ?? 0), 0);
  const totalAssets =
    (data?.assets.FUNCTIONAL ?? 0) +
    (data?.assets.FUNCTIONAL_WITH_FINDINGS ?? 0) +
    (data?.assets.BREAKDOWN ?? 0);
  const overdue = data?.overdueWorkOrders ?? 0;
  const present = data?.attendance.present ?? 0;
  const absent = data?.attendance.absent ?? 0;
  const attendanceTotal = present + absent;
  const attendanceRate = attendanceTotal > 0 ? Math.round((present / attendanceTotal) * 100) : null;
  const checklistsDone = data?.checklists.completed ?? 0;
  const checklistsTotal = data?.checklists.total ?? 0;
  const checklistsBehind = checklistsTotal > 0 && checklistsDone < checklistsTotal;

  // The full series as fetched. Each trend card slices it to its own window —
  // see `sliceTrend` — so these are not totals anybody should read directly.
  const woTrend = data?.trends.workOrdersCompleted ?? [];
  const clTrend = data?.trends.checklistCompletions ?? [];

  const manHours = data?.manHours ?? { estimatedMinutes: 0, actualMinutes: 0, jobsCompared: 0, jobsFinished: 0 };
  // Signed, so the sentence beside it can say "over" or "under" rather than
  // leaving the reader to work out which direction a bare ratio points.
  const variancePct =
    manHours.estimatedMinutes > 0
      ? Math.round(((manHours.actualMinutes - manHours.estimatedMinutes) / manHours.estimatedMinutes) * 100)
      : null;

  // Busiest first: the account a manager needs to look at is the one with the
  // most outstanding work, and it should not be hunted for down the list.
  const accountLoad = [...(data?.accounts ?? [])]
    .sort((a, b) => b.openWorkOrders - a.openWorkOrders || b.overdueWorkOrders - a.overdueWorkOrders)
    .map((a) => ({
      id: a.id,
      label: a.name,
      values: { open: a.openWorkOrders, overdue: a.overdueWorkOrders },
    }));

  // Deep-link targets are account-aware: when a single account is selected the
  // cards jump straight into that account's pages, otherwise the global ones.
  const woHref = accountFilter ? `/accounts/${accountFilter}/work-orders` : "/work-orders";
  const checklistHref = accountFilter ? `/accounts/${accountFilter}/checklists` : "/pm-checklists";

  const unassignedCount = openOrders?.filter((w) => (w.assignments?.length ?? 0) === 0).length ?? null;

  const priorityCounts = PRIORITY_SERIES.map(({ key }) => ({
    key,
    count: openOrders?.filter((w) => w.priority === key).length ?? 0,
  }));
  const priorityTotal = priorityCounts.reduce((n, x) => n + x.count, 0);

  /**
   * Work open longer than `days`, oldest first.
   *
   * A function rather than a precomputed list because the threshold is now a
   * per-card setting and two cards may disagree about it — but only about the
   * threshold. Keeping one definition of what stalled *means* is the whole
   * reason this lives on the model instead of inside the widget.
   */
  const stalledWork = (days: number) =>
    (openOrders ?? [])
      .filter((w) => w.ageDays >= days)
      .sort((a, b) => b.ageDays - a.ageDays);

  return {
    data,
    loading,
    lowStock,
    accountFilter,
    periodCaption,
    wo,
    openWOs,
    totalWOs,
    totalAssets,
    overdue,
    present,
    absent,
    attendanceTotal,
    attendanceRate,
    checklistsDone,
    checklistsTotal,
    checklistsBehind,
    pageTrendDays,
    woTrend,
    clTrend,
    manHours,
    variancePct,
    accountLoad,
    woHref,
    checklistHref,
    unassignedCount,
    priorityCounts,
    priorityTotal,
    stalledWork,
  };
}
