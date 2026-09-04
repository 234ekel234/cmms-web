"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import api, { getServerClockOffset } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import WorkOrderCalendar from "@/components/WorkOrderCalendar";
import AccountFilter from "@/components/AccountFilter";
import WorkOrderFilters from "@/components/WorkOrderFilters";
import WorkOrderSheet, { type SheetPatch } from "@/components/WorkOrderSheet";
import RowMenu from "@/components/RowMenu";
import { EmptyRow } from "@/components/EmptyState";
import { WORK_ORDER_PRIORITY, WORK_ORDER_STATUS, type WorkOrderStatus } from "@/lib/statuses";
// Aliased the way the detail page does: rbac's `canManage` is the account-
// administration question, and reading it under its own name next to the
// per-job one is how the two got conflated in the first place.
import { canManage as canAdministerAccount } from "@/lib/rbac";
import {
  awaitingClient,
  isOverdue,
  matchesFlag,
  passesFilters,
  triageRank,
  type WorkOrderFlag,
} from "@/lib/workOrders";

type Account = { id: string; name: string };

type WorkOrder = {
  id: string;
  title: string;
  description: string | null;
  status: "REQUESTED" | "PENDING" | "IN_PROGRESS" | "ON_HOLD" | "COMPLETED" | "APPROVED" | "REJECTED";
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | null;
  dueDate: string | null;
  category: string | null;
  isSpecialProject: boolean;
  type: "INTERNAL" | "EXTERNAL";
  estimatedMinutes: number | null;
  actualSeconds: number;
  timerStartedAt: string | null;
  accountId: string;
  account: Account;
  asset: { id: string; name: string } | null;
  // `position` is nullable on Employee, and this said otherwise.
  assignments: { employee: { id: string; name: string; position: string | null } }[];
  // Two columns only — enough for the "3/6" counter without dragging every
  // procedure in the system across the wire. See the select on GET /work-orders.
  checklistItems?: { id: string; isDone: boolean }[];
  createdAt: string;
};

type PriorityFilter = "ALL" | NonNullable<WorkOrder["priority"]>;
type SortKey = "SMART" | "NEWEST" | "OLDEST" | "DUE_SOON" | "PRIORITY" | "TITLE" | "ACCOUNT";
type View = "list" | "calendar";

// Every status, in pipeline order, for building the counts the chip row shows.
const ALL_STATUSES: WorkOrderStatus[] = [
  "REQUESTED", "PENDING", "IN_PROGRESS", "ON_HOLD", "COMPLETED", "APPROVED", "REJECTED",
];
const ALL_FLAGS: WorkOrderFlag[] = ["OVERDUE", "AWAITING"];

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "SMART",    label: "Smart (urgency)"   },
  { key: "NEWEST",   label: "Newest first"      },
  { key: "OLDEST",   label: "Oldest first"      },
  { key: "DUE_SOON", label: "Due date (soonest)" },
  { key: "PRIORITY", label: "Priority (highest)" },
  { key: "TITLE",    label: "Title (A–Z)"       },
  { key: "ACCOUNT",  label: "Account (A–Z)"     },
];

// Highest first, so a descending sort surfaces CRITICAL at the top.
const PRIORITY_RANK: Record<NonNullable<WorkOrder["priority"]>, number> = {
  CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1,
};

/**
 * `?status=REQUESTED,PENDING` — a *set*, because the axis is multi-select now.
 *
 * Still accepts the single value the old tabs wrote, so links and bookmarks
 * from before this change land on the same narrowing rather than on everything.
 * An unrecognised name is dropped rather than failing the whole parse.
 */
function parseStatuses(raw: string | null): Set<WorkOrderStatus> {
  if (!raw) return new Set();
  const wanted = raw.split(",").map((s) => s.trim().toUpperCase());
  return new Set(ALL_STATUSES.filter((s) => wanted.includes(s)));
}

function parseFlags(raw: string | null): Set<WorkOrderFlag> {
  if (!raw) return new Set();
  const wanted = raw.split(",").map((s) => s.trim().toUpperCase());
  return new Set(ALL_FLAGS.filter((f) => wanted.includes(f)));
}

// "Smart" triage sort: closed orders sink; among open ones rank by priority
// (Critical first), then overdue-first, then soonest due, then newest. Work
// waiting on a client sorts between the two — it is not active, but it is not
// over either, and ranking it as plain "closed" buried it under signed-off and
// rejected jobs where no manager would ever scroll to find it.
function smartCompare(a: WorkOrder, b: WorkOrder) {
  const term = triageRank(a) - triageRank(b);
  if (term !== 0) return term;

  const prio = (b.priority ? PRIORITY_RANK[b.priority] : 0) - (a.priority ? PRIORITY_RANK[a.priority] : 0);
  if (prio !== 0) return prio;

  const overdue = (isOverdue(a) ? 0 : 1) - (isOverdue(b) ? 0 : 1);
  if (overdue !== 0) return overdue;

  if (a.dueDate || b.dueDate) {
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    const due = new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    if (due !== 0) return due;
  }

  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
}

// Status and priority pills come from lib/statuses.ts. This page used to keep
// its own copy, and the two had already drifted — Requested was `warning` here
// and `brand` there, so the same status wore a different colour depending on
// which list you were looking at. The chip row and the column now read from one
// table, which is the point of having it.

function IconSearch() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

// Columns that map onto an existing sort key, so the header can drive the same
// state as the dropdown instead of duplicating the sort logic.
const COLUMN_SORT: Partial<Record<string, SortKey>> = {
  Title: "TITLE",
  Account: "ACCOUNT",
  Priority: "PRIORITY",
  "Due Date": "DUE_SOON",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// Man-hours as a compact "Nh Nm" string.
function formatHM(minutes: number) {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (h && rem) return `${h}h ${rem}m`;
  if (h) return `${h}h`;
  return `${rem}m`;
}

export default function WorkOrdersPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const isClient = user?.role === "CLIENT";
  // Special projects are a manager's call to approve or reject — the gate the
  // detail page applies, mirrored so the sheet cannot offer a button the API
  // refuses.
  const isManager = user?.role === "GENERAL_MANAGER" || user?.role === "MANAGER";

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [timerBusyId, setTimerBusyId] = useState<string | null>(null);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedAccounts, setSelectedAccounts] = useState<Set<string>>(new Set());
  const [statuses, setStatuses] = useState<Set<WorkOrderStatus>>(
    () => parseStatuses(searchParams.get("status"))
  );
  const [flags, setFlags] = useState<Set<WorkOrderFlag>>(() => {
    // `?status=OVERDUE` was a real link before the axes were split. Honour it as
    // the flag it always was, rather than silently showing everything.
    const fromFlags = parseFlags(searchParams.get("flag"));
    for (const f of parseFlags(searchParams.get("status"))) fromFlags.add(f);
    return fromFlags;
  });
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>("ALL");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("SMART");
  const [view, setView] = useState<View>("list");

  // The row the sheet is open on, and the one that just changed under it.
  const [openId, setOpenId] = useState<string | null>(() => searchParams.get("open"));
  const [flashId, setFlashId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [woRes, acctRes] = await Promise.all([
          api.get("/work-orders"),
          api.get("/accounts"),
        ]);
        if (cancelled) return;
        setWorkOrders(woRes.data);
        setAccounts(acctRes.data);
      } catch {
        if (cancelled) return;
        setError("Failed to load work orders.");
        setWorkOrders([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Everything except the two chip axes — their counts are computed against
  // this set, so each chip states how many rows it would reveal.
  const preStatus = useMemo(() => {
    const q = search.trim().toLowerCase();
    return workOrders.filter((wo) => {
      const matchAccount = selectedAccounts.size === 0 || selectedAccounts.has(wo.accountId);
      const matchPriority = priorityFilter === "ALL" || wo.priority === priorityFilter;
      const matchSearch =
        !q ||
        wo.title.toLowerCase().includes(q) ||
        wo.asset?.name.toLowerCase().includes(q) ||
        wo.category?.toLowerCase().includes(q) ||
        wo.account.name.toLowerCase().includes(q) ||
        wo.assignments.some((a) => a.employee.name.toLowerCase().includes(q));
      return matchAccount && matchPriority && matchSearch;
    });
  }, [workOrders, selectedAccounts, priorityFilter, search]);

  // Each axis is counted against the *other* axis's selection, so the numbers
  // answer "how many would I see if I clicked this", not "how many exist".
  // Counting both against the unfiltered set made every flag chip claim rows
  // that the active status selection would have hidden.
  const statusCounts = useMemo(() => {
    const base = preStatus.filter((wo) => [...flags].every((f) => matchesFlag(wo, f)));
    return Object.fromEntries(
      ALL_STATUSES.map((s) => [s, base.filter((wo) => wo.status === s).length])
    ) as Record<WorkOrderStatus, number>;
  }, [preStatus, flags]);

  const flagCounts = useMemo(() => {
    const base = preStatus.filter((wo) => statuses.size === 0 || statuses.has(wo.status));
    return Object.fromEntries(
      ALL_FLAGS.map((f) => [f, base.filter((wo) => matchesFlag(wo, f)).length])
    ) as Record<WorkOrderFlag, number>;
  }, [preStatus, statuses]);

  const filtered = useMemo(
    () => preStatus.filter((wo) => passesFilters(wo, statuses, flags)),
    [preStatus, statuses, flags]
  );

  const sorted = useMemo(() => {
    const rows = [...filtered];
    rows.sort((a, b) => {
      switch (sortKey) {
        case "SMART":
          return smartCompare(a, b);
        case "OLDEST":
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case "DUE_SOON":
          // Undated work orders sink to the bottom rather than sorting as epoch 0.
          if (!a.dueDate && !b.dueDate) return 0;
          if (!a.dueDate) return 1;
          if (!b.dueDate) return -1;
          return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
        case "PRIORITY":
          return (b.priority ? PRIORITY_RANK[b.priority] : 0) - (a.priority ? PRIORITY_RANK[a.priority] : 0);
        case "TITLE":
          return a.title.localeCompare(b.title);
        case "ACCOUNT":
          return a.account.name.localeCompare(b.account.name) || a.title.localeCompare(b.title);
        case "NEWEST":
        default:
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
    });
    return rows;
  }, [filtered, sortKey]);

  const activeFilterCount =
    (selectedAccounts.size > 0 ? 1 : 0) +
    (priorityFilter !== "ALL" ? 1 : 0) +
    (search.trim() ? 1 : 0) +
    statuses.size +
    flags.size;

  function resetFilters() {
    setSelectedAccounts(new Set());
    setPriorityFilter("ALL");
    setSearch("");
    setStatuses(new Set());
    setFlags(new Set());
  }

  // Keep the URL describing the view, so a filtered queue is linkable and the
  // browser Back button closes the sheet instead of leaving the page.
  // `replace`, not `push`: every chip click would otherwise be a history entry
  // and Back would walk the filter history one toggle at a time.
  useEffect(() => {
    const q = new URLSearchParams();
    if (statuses.size) q.set("status", [...statuses].join(","));
    if (flags.size) q.set("flag", [...flags].join(","));
    if (openId) q.set("open", openId);
    const qs = q.toString();
    router.replace(qs ? `/work-orders?${qs}` : "/work-orders", { scroll: false });
  }, [statuses, flags, openId, router]);

  const openOrder = openId ? workOrders.find((o) => o.id === openId) ?? null : null;

  // The sheet hands back the changed row; the list re-renders it in place.
  // Nothing moves and nothing disappears — there are no tabs to move between
  // any more — so the flash is what makes the change visible.
  function applyChange(patch: SheetPatch) {
    setWorkOrders((prev) => prev.map((o) => (o.id === patch.id ? { ...o, ...patch } : o)));
    setFlashId(patch.id);
    window.setTimeout(() => setFlashId((cur) => (cur === patch.id ? null : cur)), 1500);
  }

  async function toggleTimer(wo: WorkOrder) {
    setTimerBusyId(wo.id);
    try {
      const action = wo.timerStartedAt ? "pause" : "resume";
      const res = await api.post(`/work-orders/${wo.id}/timer`, { action });
      // Merge: the timer response omits `account`, which the table needs.
      setWorkOrders((prev) => prev.map((o) => (o.id === wo.id ? { ...o, ...res.data } : o)));
    } catch {
      // silent
    } finally {
      setTimerBusyId(null);
    }
  }

  return (
    <div className="tu-page">
      <div className="tu-page-header">
        <div>
          <h1 className="tu-page-title">Work Orders</h1>
          <p className="tu-page-sub">Maintenance tasks across all your accounts</p>
        </div>

        <div style={{ display: "flex", gap: 16, alignItems: "flex-end" }}>
          <div className="tu-segmented" role="tablist" aria-label="View">
            {([
              { key: "list" as const, label: "List" },
              { key: "calendar" as const, label: "Calendar" },
            ]).map((v) => (
              <button
                key={v.key}
                role="tab"
                aria-selected={view === v.key}
                type="button"
                onClick={() => setView(v.key)}
                className={view === v.key ? "tu-active" : undefined}
              >
                {v.label}
              </button>
            ))}
          </div>

          {!loading && accounts.length > 1 && (
            <AccountFilter accounts={accounts} selected={selectedAccounts} onChange={setSelectedAccounts} />
          )}
        </div>
      </div>

      {error && <div className="tu-error-banner" role="alert">{error}</div>}

      <div className="tu-card">
        <div className="tu-toolbar tu-toolbar-inset">
          <WorkOrderFilters
            statuses={statuses}
            onStatusesChange={setStatuses}
            flags={flags}
            onFlagsChange={setFlags}
            statusCounts={statusCounts}
            flagCounts={flagCounts}
          />
        </div>

        {/* Search + priority + sort */}
        <div className="tu-toolbar tu-toolbar-inset">
          <label className="tu-search" style={{ width: 280 }}>
            <span className="tu-search-icon"><IconSearch /></span>
            <input
              id="wo-search"
              className="tu-input"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search title, asset, account, assignee…"
              aria-label="Search work orders"
            />
          </label>

          <select
            id="wo-priority"
            className="tu-select"
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value as PriorityFilter)}
            aria-label="Filter by priority"
          >
            <option value="ALL">All priorities</option>
            <option value="CRITICAL">Critical</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>

          <select
            id="wo-sort"
            className="tu-select"
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            aria-label="Sort work orders"
          >
            {SORT_OPTIONS.map((s) => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
          </select>

          {activeFilterCount > 0 && (
            <button type="button" className="tu-btn-secondary" onClick={resetFilters}>
              Clear filters
            </button>
          )}

          <span className="tu-toolbar-spacer tu-result-count">
            {sorted.length} work order{sorted.length !== 1 ? "s" : ""}
          </span>
        </div>

        {view === "list" ? (
          <div id="wo-tabpanel" role="tabpanel" style={{ overflowX: "auto" }}>
            <table className="tu-table tu-table-interactive" aria-label="Work orders">
              <thead>
                <tr>
                  {["Title", "Account", "Asset", "Status", "Priority", "Due Date", "Man-Hours", "Assigned To"].map((col) => {
                    const key = COLUMN_SORT[col];
                    if (!key) {
                      return (
                        <th key={col} scope="col" title={col === "Man-Hours" ? "Actual logged / Estimated" : undefined}>
                          {col}
                        </th>
                      );
                    }
                    const active = sortKey === key;
                    return (
                      <th key={col} scope="col" aria-sort={active ? "ascending" : "none"}>
                        <button
                          type="button"
                          className={`tu-th-sort${active ? " tu-active" : ""}`}
                          onClick={() => setSortKey(key)}
                          title={`Sort by ${col.toLowerCase()}`}
                        >
                          {col}
                          <span className="tu-th-arrow" aria-hidden="true">{active ? "\u2191" : ""}</span>
                        </button>
                      </th>
                    );
                  })}
                  <th scope="col"><span className="tu-sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i} aria-hidden="true">
                      {Array.from({ length: 9 }).map((__, j) => (
                        <td key={j} style={{ padding: "14px 24px" }}>
                          <div className="tu-skeleton" style={{ height: 14, borderRadius: 4 }} />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : workOrders.length === 0 ? (
                  <EmptyRow
                    colSpan={9}
                    icon="workOrder"
                    title="No work orders yet"
                    hint="Work orders raised on any of your accounts will appear here."
                  />
                ) : sorted.length === 0 ? (
                  <EmptyRow
                    colSpan={9}
                    icon="search"
                    title="No matching work orders"
                    hint="Nothing matches the current filters."
                    action={
                      <button type="button" className="tu-btn-secondary tu-btn-sm" onClick={resetFilters}>
                        Clear filters
                      </button>
                    }
                  />
                ) : (
                  sorted.map((wo) => {
                    const st = WORK_ORDER_STATUS[wo.status];
                    const pri = wo.priority ? WORK_ORDER_PRIORITY[wo.priority] : null;
                    const overdue = isOverdue(wo);
                    const rowCls = [
                      openId === wo.id ? "tu-row-selected" : "",
                      flashId === wo.id ? "tu-row-changed" : "",
                    ].filter(Boolean).join(" ");
                    return (
                      <tr
                        key={wo.id}
                        className={rowCls || undefined}
                        aria-selected={openId === wo.id}
                        // Opens the sheet over the list rather than navigating.
                        // The title link still goes to the full page, so both
                        // routes stay available and middle-click still works.
                        onClick={() => setOpenId(wo.id)}
                      >
                        <td className="tu-strong">
                          <Link
                            href={`/accounts/${wo.accountId}/work-orders/${wo.id}`}
                            className="tu-row-link"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {wo.title}
                          </Link>
                          {wo.isSpecialProject && (
                            <span
                              className="tu-badge tu-badge-brand"
                              style={{ marginLeft: 6, fontSize: 10, padding: "1px 6px" }}
                              aria-label="Special project"
                            >
                              Special
                            </span>
                          )}
                        </td>
                        <td>
                          <Link
                            href={`/accounts/${wo.accountId}`}
                            className="tu-row-link tu-row-link-brand"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {wo.account.name}
                          </Link>
                        </td>
                        <td style={{ color: "var(--tu-text-body)" }}>
                          {wo.asset?.name ?? <span style={{ color: "var(--tu-text-subtle)" }}>—</span>}
                        </td>
                        <td>
                          <span className={st.badge}>{st.label}</span>
                          {awaitingClient(wo) && (
                            <div
                              className="tu-badge tu-badge-info"
                              style={{ marginTop: 4, fontSize: 10, padding: "1px 6px", whiteSpace: "nowrap" }}
                            >
                              ⏳ Awaiting client
                            </div>
                          )}
                        </td>
                        <td>
                          {pri ? <span className={pri.badge}>{pri.label}</span> : <span style={{ color: "var(--tu-text-subtle)" }}>—</span>}
                        </td>
                        <td>
                          {wo.dueDate ? (
                            overdue ? (
                              // Colour alone was carrying this (and was broken);
                              // the pill states it outright and survives greyscale.
                              <span className="tu-badge tu-badge-danger" title="Past due">
                                <time dateTime={wo.dueDate}>{formatDate(wo.dueDate)}</time>
                              </span>
                            ) : (
                              <time dateTime={wo.dueDate} style={{ color: "var(--tu-text-body)" }}>{formatDate(wo.dueDate)}</time>
                            )
                          ) : (
                            <span className="tu-figure-zero">—</span>
                          )}
                        </td>
                        <td style={{ whiteSpace: "nowrap" }}>
                          {(() => {
                            const est = wo.estimatedMinutes;
                            const running = wo.timerStartedAt != null;
                            const actualMin =
                              wo.actualSeconds / 60 +
                              (running ? (Date.now() + getServerClockOffset() - new Date(wo.timerStartedAt!).getTime()) / 60000 : 0);
                            const hasActual = wo.actualSeconds > 0 || running;
                            if (est == null && !hasActual) {
                              return <span className="tu-figure-zero">—</span>;
                            }
                            const over = est != null && actualMin > est;
                            return (
                              <span className={`tu-timer${running ? " tu-timer-running" : over ? " tu-timer-over" : ""}`}>
                                {running && <span className="tu-timer-dot" aria-hidden="true" />}
                                <span>{hasActual ? formatHM(actualMin) : "0m"}</span>
                                {est != null && <span className="tu-timer-est">/ {formatHM(est)}</span>}
                              </span>
                            );
                          })()}
                          {wo.status === "IN_PROGRESS" && !isClient && (
                            <button
                              onClick={() => toggleTimer(wo)}
                              disabled={timerBusyId === wo.id}
                              title={wo.timerStartedAt ? "Pause timer" : "Resume timer"}
                              className={`tu-timer-btn ${wo.timerStartedAt ? "tu-timer-btn-pause" : "tu-timer-btn-resume"}`}
                              style={{ marginLeft: 8 }}
                            >
                              {timerBusyId === wo.id ? "…" : wo.timerStartedAt ? "❚❚ Pause" : "▶ Resume"}
                            </button>
                          )}
                        </td>
                        <td style={{ color: "var(--tu-text-body)" }}>
                          {wo.assignments.length > 0
                            ? wo.assignments.map((a) => a.employee.name).join(", ")
                            : <span className="tu-figure-zero">Unassigned</span>}
                        </td>
                        <td className="tu-menu-cell">
                          <RowMenu
                            label={wo.title}
                            actions={[
                              { label: "Open work order", onSelect: () => router.push(`/accounts/${wo.accountId}/work-orders/${wo.id}`) },
                              { label: "Open account", onSelect: () => router.push(`/accounts/${wo.accountId}`) },
                              ...(wo.asset
                                ? [{ label: "View asset", onSelect: () => router.push(`/accounts/${wo.accountId}/assets/${wo.asset!.id}`) }]
                                : []),
                            ]}
                          />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div id="wo-tabpanel" role="tabpanel" style={{ padding: 20 }}>
            <WorkOrderCalendar
              orders={sorted}
              loading={loading}
              hrefFor={(wo) => `/accounts/${wo.accountId}/work-orders/${wo.id}`}
              tooltipFor={(wo) => `${wo.title} — ${wo.account.name}`}
            />
          </div>
        )}
      </div>

      {openOrder && (
        <WorkOrderSheet
          // Keyed so switching rows remounts rather than carrying the previous
          // job's in-progress form state across.
          key={openOrder.id}
          order={openOrder}
          onClose={() => setOpenId(null)}
          onChanged={applyChange}
          // The same three-way split the detail page makes, and for the same
          // reason. Deciding *what the job is* — its priority, its due date,
          // who is on it — is account administration and not a technician's
          // call. Moving their own work along is, and on this list every row a
          // technician can see is already theirs (the API narrows it by
          // assignment), so no per-row check is needed here.
          canManage={canAdministerAccount(user?.role)}
          canActOnStatus={!isClient && (!openOrder.isSpecialProject || isManager)}
          isClient={isClient}
        />
      )}
    </div>
  );
}
