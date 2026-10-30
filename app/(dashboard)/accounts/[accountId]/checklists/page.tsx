"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import ActionError from "@/components/ActionError";
import api, { errorMessage } from "@/lib/api";
import EmptyState from "@/components/EmptyState";
import { useAuth } from "@/context/AuthContext";
import { FIELD_STAFF, canManage, hasRole } from "@/lib/rbac";
import { frequencyMeta } from "@/lib/maintenancePlans";
import { CUSTOM_DAYS, getPeriodStart, pmSchedule, type PmSchedule } from "@/lib/pmPeriod";
import { useConfirm } from "@/components/ConfirmDialog";
import ArchivedList from "@/components/ArchivedList";
import { locationPath, type AssetLocationRef } from "@/lib/assetLocations";

type PMLog = {
  id: string;
  scheduledDate: string;
  completedAt: string | null;
  isDraft: boolean;
};

type Assignment = {
  id: string;
  checklist: { id: string; name: string; frequency: string; intervalDays?: number | null; sections: { items: unknown[] }[] };
  asset: { id: string; name: string } | null;
  location?: AssetLocationRef | null;
  /** Where an "every N days" checklist's cycle starts on this site. */
  startDate?: string;
  logs: PMLog[];
};

function getThisPeriodLog(logs: PMLog[], schedule: PmSchedule): PMLog | null {
  if (!logs.length) return null;
  const periodStart = getPeriodStart(schedule);
  return logs.find((l) => new Date(l.scheduledDate) >= periodStart) ?? null;
}

type ChecklistState = "completed" | "draft" | "unanswered";

// This-period state of an assignment: finalized log = completed, a draft log =
// draft, no log yet = unanswered.
function statusOf(a: Assignment): ChecklistState {
  const log = getThisPeriodLog(a.logs, pmSchedule(a.checklist, a));
  if (log && !log.isDraft) return "completed";
  if (log) return "draft";
  return "unanswered";
}

const STATUS_ORDER: ChecklistState[] = ["completed", "draft", "unanswered"];
const STATUS_META: Record<ChecklistState, { label: string; activeCls: string; badgeCls: string }> = {
  completed: {
    label: "Done",
    activeCls: "bg-[var(--tu-status-completed)] text-white border-[var(--tu-status-completed)]",
    badgeCls: "bg-[var(--tu-soft-success)] text-[var(--tu-on-success)]",
  },
  draft: {
    label: "Partial",
    activeCls: "bg-[var(--tu-priority-high)] text-white border-[var(--tu-priority-high)]",
    badgeCls: "bg-[var(--tu-soft-warning)] text-[var(--tu-on-warning)]",
  },
  unanswered: {
    label: "Unanswered",
    activeCls: "bg-[var(--tu-text-body)] text-white border-[var(--tu-text-body)]",
    badgeCls: "bg-[var(--tu-bg-secondary-strong)] text-[var(--tu-text-subtle)]",
  },
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function ChecklistsPage() {
  const confirm = useConfirm();
  // Captured once, for "starts later" — render must not read the clock.
  const [nowMs] = useState(() => Date.now());
  const params = useParams();
  const accountId = params.accountId as string;
  const { user } = useAuth();
  // A client sees which checklists are assigned and whether they were done this
  // period; assigning them and filling them in are staff jobs, and the cards
  // stop being links for a client because the detail page is the fill-in form.
  // Two questions, not one. Deciding *what this site must inspect* — assigning
  // a checklist, removing one — is scheduling, and stays staff. *Filling one in*
  // is doing the round, which a technician does, so the card opens for them too.
  // Asking `canManage` for both is what kept technicians off the fill-in form
  // while the API was already handing them every question on it.
  const canSchedule = canManage(user?.role);
  const canFillIn = hasRole(user?.role, FIELD_STAFF);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  // A refused write, said rather than swallowed — see ActionError.
  const [actionError, setActionError] = useState("");
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"ALL" | ChecklistState>("ALL");

  // Bumped after a restore, to refetch the live list.
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Set explicitly rather than relying on the initial state: this effect
      // re-runs in place when the route param changes, where `loading` is
      // already false and the previous record's data would otherwise sit
      // there with no affordance until the new request returned.
      if (!cancelled) setLoading(true);
      try {
        const res = await api.get(`/accounts/${accountId}/pm-checklists`);
        if (!cancelled) setAssignments(res.data);
      } catch {
        // silent
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [accountId, reloadKey]);

  async function handleRemove(assignmentId: string) {
    const a = assignments.find((x) => x.id === assignmentId);
    if (!(await confirm({
      title: "Remove this checklist?",
      // Rounds are kept: the API switches an assignment with rounds off
      // rather than deleting it, and it can be restored from below the list.
      message: `“${a?.checklist.name ?? "This checklist"}” will no longer be scheduled at this site. Rounds already filed for it are kept, and you can restore it from “Show removed checklists”.`,
      confirmLabel: "Remove",
    }))) return;
    try {
      await api.delete(`/accounts/${accountId}/pm-checklists/${assignmentId}`);
      setAssignments((prev) => prev.filter((a) => a.id !== assignmentId));
    } catch (err) {
      setActionError(errorMessage(err, "Could not remove that checklist."));
    }
  }

  const byStatus: Record<ChecklistState, Assignment[]> = { completed: [], draft: [], unanswered: [] };
  for (const a of assignments) byStatus[statusOf(a)].push(a);
  const totalDone = byStatus.completed.length;

  function renderCard(a: Assignment) {
    const freqCfg = frequencyMeta(a.checklist.frequency, a.checklist.intervalDays);
    // An "every N days" checklist whose first round is still ahead.
    const startsLater = a.checklist.frequency === CUSTOM_DAYS && !!a.startDate && new Date(a.startDate).getTime() > nowMs;
    const state = statusOf(a);
    const done = state === "completed";
    const isDraft = state === "draft";
    const lastLog = a.logs[0] ?? null;
    const itemCount = a.checklist.sections.reduce((sum, s) => sum + (s.items as unknown[]).length, 0);

    const cardClass = `block bg-[var(--tu-bg-surface)] rounded-xl border shadow-sm p-4 ${
      canFillIn ? "hover:shadow-md transition-shadow" : ""
    } ${
      done ? "border-[var(--tu-bd-success)] bg-[var(--tu-soft-success)]/30" :
      isDraft ? "border-[var(--tu-bd-warning)] bg-[var(--tu-soft-warning)]/30" :
      "border-[var(--tu-border)]"
    }`;

    // The detail page is the fill-in form, so for a client the card is the
    // whole thing — a link that only bounces them back would be worse than no
    // link at all.
    const body = (
      <>
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-[var(--tu-text-heading)] text-sm">{a.checklist.name}</p>
            {a.asset && (
              <p className="text-xs text-[var(--tu-text-brand)] mt-0.5">› {a.asset.name}</p>
            )}
            {a.location && (
              <p className="text-xs text-[var(--tu-text-subtle)] mt-0.5">{locationPath(a.location)}</p>
            )}
            <div className="flex flex-wrap gap-1.5 mt-2">
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${freqCfg.cls}`}>
                {freqCfg.label}
              </span>
              <span className="text-xs text-[var(--tu-text-subtle)]">{itemCount} items</span>
              {lastLog && <span className="text-xs text-[var(--tu-text-subtle)]">Last: {fmtDate(lastLog.scheduledDate)}</span>}
              {startsLater && <span className="text-xs text-[var(--tu-text-subtle)]">Starts {fmtDate(a.startDate as string)}</span>}
            </div>
          </div>
          <div className="flex items-start gap-2 shrink-0">
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_META[state].badgeCls}`}>
              {STATUS_META[state].label}
            </span>
            {canSchedule && (
              <button
                // The card is a link to the fill-in form; without this the
                // click opened the checklist as well as asking to remove it.
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleRemove(a.id); }}
                className="text-xs text-[var(--tu-text-subtle)] hover:text-[var(--tu-on-danger)] transition-colors cursor-pointer"
              >
                Remove
              </button>
            )}
          </div>
        </div>
      </>
    );

    return canFillIn ? (
      <Link key={a.id} href={`/accounts/${accountId}/checklists/${a.id}`} className={cardClass}>
        {body}
      </Link>
    ) : (
      <div key={a.id} className={cardClass}>{body}</div>
    );
  }

  return (
    <div className="px-4 py-5 sm:p-8">
      <ActionError message={actionError} onDismiss={() => setActionError("")} />
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold text-[var(--tu-text-heading)]">PM Checklists</h2>
          {!loading && assignments.length > 0 && (
            <p className="text-xs text-[var(--tu-text-subtle)] mt-0.5">
              {totalDone}/{assignments.length} completed this period
            </p>
          )}
        </div>
        {canSchedule && (
          <Link
            href={`/accounts/${accountId}/checklists/assign`}
            className="border border-[var(--tu-text-brand)] text-[var(--tu-text-brand)] px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[var(--tu-soft-brand)] transition-colors"
          >
            + Assign Checklist
          </Link>
        )}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-20 bg-[var(--tu-bg-surface)] rounded-xl border border-[var(--tu-border)] animate-pulse" />)}
        </div>
      ) : assignments.length === 0 ? (
        <div className="tu-card">
          <EmptyState
            icon="checklist"
            title="No checklists assigned"
            hint={canSchedule ? (
              <>
                Assign checklists from the{" "}
                <Link href="/pm-checklists" className="tu-link">PM library</Link> to start
                tracking preventive maintenance here.
              </>
            ) : (
              "No preventive maintenance checklists are set up for this site yet."
            )}
          />
        </div>
      ) : (
        <div>
          {/* Status filter pills */}
          <div className="flex flex-wrap gap-2 mb-6">
            <button
              type="button"
              onClick={() => setStatusFilter("ALL")}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors cursor-pointer ${
                statusFilter === "ALL" ? "bg-[var(--tu-text-brand)] text-white border-[var(--tu-text-brand)]" : "bg-[var(--tu-bg-surface)] text-[var(--tu-text-body)] border-[var(--tu-border)] hover:border-[var(--tu-border-strong)]"
              }`}
            >
              All ({assignments.length})
            </button>
            {STATUS_ORDER.map((key) => {
              const active = statusFilter === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setStatusFilter(key)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors cursor-pointer ${
                    active ? STATUS_META[key].activeCls : "bg-[var(--tu-bg-surface)] text-[var(--tu-text-body)] border-[var(--tu-border)] hover:border-[var(--tu-border-strong)]"
                  }`}
                >
                  {STATUS_META[key].label} ({byStatus[key].length})
                </button>
              );
            })}
          </div>

          {/* Status-grouped sections */}
          {STATUS_ORDER.filter((key) => statusFilter === "ALL" || statusFilter === key).map((key) => {
            const list = byStatus[key];
            if (list.length === 0) return null;
            return (
              <div key={key} className="mb-6">
                <p className="text-xs font-bold text-[var(--tu-text-subtle)] uppercase tracking-wide mb-3">
                  {STATUS_META[key].label} ({list.length})
                </p>
                <div className="space-y-3">{list.map(renderCard)}</div>
              </div>
            );
          })}

          {statusFilter !== "ALL" && byStatus[statusFilter].length === 0 && (
            <div className="bg-[var(--tu-bg-surface)] rounded-xl border border-[var(--tu-border)] shadow-sm p-8 text-center text-[var(--tu-text-subtle)] text-sm">
              No {STATUS_META[statusFilter].label.toLowerCase()} checklists this period.
            </div>
          )}
        </div>
      )}
      {canSchedule && (
        <ArchivedList<Assignment & { _count?: { logs: number } }>
          noun="removed checklists"
          load={async () => (await api.get(`/accounts/${accountId}/pm-checklists?inactive=true`)).data}
          title={(a) => a.checklist.name + (a.asset ? ` › ${a.asset.name}` : "")}
          detail={(a) => {
            const n = a._count?.logs ?? 0;
            return `${n} filed round${n === 1 ? "" : "s"} kept`;
          }}
          restore={async (a) => { await api.post(`/accounts/${accountId}/pm-checklists/${a.id}/restore`); }}
          canRestore
          onRestored={() => setReloadKey((k) => k + 1)}
        />
      )}
    </div>
  );
}
