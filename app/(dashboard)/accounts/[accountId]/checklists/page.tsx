"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import api from "@/lib/api";
import EmptyState from "@/components/EmptyState";
import { useAuth } from "@/context/AuthContext";
import { canManage } from "@/lib/rbac";

type PMLog = {
  id: string;
  scheduledDate: string;
  completedAt: string | null;
  isDraft: boolean;
};

type Assignment = {
  id: string;
  checklist: { id: string; name: string; frequency: string; sections: { items: unknown[] }[] };
  asset: { id: string; name: string } | null;
  logs: PMLog[];
};

const FREQUENCY_CONFIG: Record<string, { label: string; cls: string }> = {
  DAILY:         { label: "Daily",         cls: "bg-[var(--tu-soft-brand)] text-[var(--tu-on-brand)]" },
  WEEKLY:        { label: "Weekly",        cls: "bg-violet-50 text-violet-700" },
  MONTHLY:       { label: "Monthly",       cls: "bg-[var(--tu-soft-warning)] text-[var(--tu-on-warning)]" },
  QUARTERLY:     { label: "Quarterly",     cls: "bg-teal-50 text-teal-700" },
  SEMI_ANNUALLY: { label: "Semi-Annually", cls: "bg-pink-50 text-pink-700" },
  ANNUALLY:      { label: "Annually",      cls: "bg-[var(--tu-soft-success)] text-[var(--tu-on-success)]" },
};

function getPeriodStart(frequency: string): Date {
  const d = new Date();
  const y = d.getFullYear(), m = d.getMonth();
  switch (frequency) {
    case "DAILY":        return new Date(Date.UTC(y, m, d.getDate()));
    case "WEEKLY":       return new Date(Date.UTC(y, m, d.getDate() - d.getDay()));
    case "MONTHLY":      return new Date(Date.UTC(y, m, 1));
    case "QUARTERLY":    return new Date(Date.UTC(y, Math.floor(m / 3) * 3, 1));
    case "SEMI_ANNUALLY": return new Date(Date.UTC(y, Math.floor(m / 6) * 6, 1));
    case "ANNUALLY":     return new Date(Date.UTC(y, 0, 1));
    default:             return new Date(Date.UTC(y, m, d.getDate()));
  }
}

function getThisPeriodLog(logs: PMLog[], frequency: string): PMLog | null {
  if (!logs.length) return null;
  const periodStart = getPeriodStart(frequency);
  return logs.find((l) => new Date(l.scheduledDate) >= periodStart) ?? null;
}

type ChecklistState = "completed" | "draft" | "unanswered";

// This-period state of an assignment: finalized log = completed, a draft log =
// draft, no log yet = unanswered.
function statusOf(a: Assignment): ChecklistState {
  const log = getThisPeriodLog(a.logs, a.checklist.frequency);
  if (log && !log.isDraft) return "completed";
  if (log) return "draft";
  return "unanswered";
}

const STATUS_ORDER: ChecklistState[] = ["completed", "draft", "unanswered"];
const STATUS_META: Record<ChecklistState, { label: string; activeCls: string }> = {
  completed:  { label: "Completed",  activeCls: "bg-[var(--tu-status-completed)] text-white border-[var(--tu-status-completed)]" },
  draft:      { label: "Draft",      activeCls: "bg-[var(--tu-priority-high)] text-white border-[var(--tu-priority-high)]" },
  unanswered: { label: "Unanswered", activeCls: "bg-[var(--tu-text-body)] text-white border-[var(--tu-text-body)]" },
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function ChecklistsPage() {
  const params = useParams();
  const accountId = params.accountId as string;
  const { user } = useAuth();
  // A client sees which checklists are assigned and whether they were done this
  // period; assigning them and filling them in are staff jobs, and the cards
  // stop being links for a client because the detail page is the fill-in form.
  const writable = canManage(user?.role);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"ALL" | ChecklistState>("ALL");

  useEffect(() => { fetchAssignments(); }, [accountId]);

  async function fetchAssignments() {
    setLoading(true);
    try {
      const res = await api.get(`/accounts/${accountId}/pm-checklists`);
      setAssignments(res.data);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }

  async function handleRemove(assignmentId: string) {
    try {
      await api.delete(`/accounts/${accountId}/pm-checklists/${assignmentId}`);
      setAssignments((prev) => prev.filter((a) => a.id !== assignmentId));
    } catch {
      // silent
    }
  }

  const byStatus: Record<ChecklistState, Assignment[]> = { completed: [], draft: [], unanswered: [] };
  for (const a of assignments) byStatus[statusOf(a)].push(a);
  const totalDone = byStatus.completed.length;

  function renderCard(a: Assignment) {
    const freqCfg = FREQUENCY_CONFIG[a.checklist.frequency] ?? { label: a.checklist.frequency, cls: "bg-[var(--tu-bg-secondary-strong)] text-[var(--tu-text-body)]" };
    const periodLog = getThisPeriodLog(a.logs, a.checklist.frequency);
    const done = !!periodLog && !periodLog.isDraft;
    const isDraft = !!periodLog && periodLog.isDraft;
    const lastLog = a.logs[0] ?? null;
    const itemCount = a.checklist.sections.reduce((sum, s) => sum + (s.items as unknown[]).length, 0);

    const cardClass = `block bg-[var(--tu-bg-surface)] rounded-xl border shadow-sm p-4 ${
      writable ? "hover:shadow-md transition-shadow" : ""
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
            <div className="flex flex-wrap gap-1.5 mt-2">
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${freqCfg.cls}`}>
                {freqCfg.label}
              </span>
              <span className="text-xs text-[var(--tu-text-subtle)]">{itemCount} items</span>
              {lastLog && <span className="text-xs text-[var(--tu-text-subtle)]">Last: {fmtDate(lastLog.scheduledDate)}</span>}
            </div>
          </div>
          <div className="flex items-start gap-2 shrink-0">
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
              done ? "bg-[var(--tu-soft-success)] text-[var(--tu-on-success)]" :
              isDraft ? "bg-[var(--tu-soft-warning)] text-[var(--tu-on-warning)]" :
              "bg-[var(--tu-bg-secondary-strong)] text-[var(--tu-text-subtle)]"
            }`}>
              {done ? "Done" : isDraft ? "Partial" : "Pending"}
            </span>
            {writable && (
              <button
                onClick={() => handleRemove(a.id)}
                className="text-xs text-[var(--tu-text-subtle)] hover:text-[var(--tu-on-danger)] transition-colors cursor-pointer"
              >
                Remove
              </button>
            )}
          </div>
        </div>
      </>
    );

    return writable ? (
      <Link key={a.id} href={`/accounts/${accountId}/checklists/${a.id}`} className={cardClass}>
        {body}
      </Link>
    ) : (
      <div key={a.id} className={cardClass}>{body}</div>
    );
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold text-[var(--tu-text-heading)]">PM Checklists</h2>
          {!loading && assignments.length > 0 && (
            <p className="text-xs text-[var(--tu-text-subtle)] mt-0.5">
              {totalDone}/{assignments.length} completed this period
            </p>
          )}
        </div>
        {writable && (
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
            hint={writable ? (
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
    </div>
  );
}
