"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import api from "@/lib/api";

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
  DAILY:         { label: "Daily",         cls: "bg-blue-50 text-blue-700" },
  WEEKLY:        { label: "Weekly",        cls: "bg-violet-50 text-violet-700" },
  MONTHLY:       { label: "Monthly",       cls: "bg-amber-50 text-amber-700" },
  QUARTERLY:     { label: "Quarterly",     cls: "bg-teal-50 text-teal-700" },
  SEMI_ANNUALLY: { label: "Semi-Annually", cls: "bg-pink-50 text-pink-700" },
  ANNUALLY:      { label: "Annually",      cls: "bg-green-50 text-green-700" },
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
  completed:  { label: "Completed",  activeCls: "bg-green-600 text-white border-green-600" },
  draft:      { label: "Draft",      activeCls: "bg-amber-500 text-white border-amber-500" },
  unanswered: { label: "Unanswered", activeCls: "bg-gray-600 text-white border-gray-600" },
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function ChecklistsPage() {
  const params = useParams();
  const accountId = params.accountId as string;
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
    const freqCfg = FREQUENCY_CONFIG[a.checklist.frequency] ?? { label: a.checklist.frequency, cls: "bg-gray-100 text-gray-600" };
    const periodLog = getThisPeriodLog(a.logs, a.checklist.frequency);
    const done = !!periodLog && !periodLog.isDraft;
    const isDraft = !!periodLog && periodLog.isDraft;
    const lastLog = a.logs[0] ?? null;
    const itemCount = a.checklist.sections.reduce((sum, s) => sum + (s.items as unknown[]).length, 0);

    return (
      <Link
        key={a.id}
        href={`/accounts/${accountId}/checklists/${a.id}`}
        className={`block bg-white rounded-xl border shadow-sm p-4 hover:shadow-md transition-shadow ${
          done ? "border-green-200 bg-green-50/30" :
          isDraft ? "border-amber-200 bg-amber-50/30" :
          "border-gray-100"
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-gray-800 text-sm">{a.checklist.name}</p>
            {a.asset && (
              <p className="text-xs text-[#2166AC] mt-0.5">› {a.asset.name}</p>
            )}
            <div className="flex flex-wrap gap-1.5 mt-2">
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${freqCfg.cls}`}>
                {freqCfg.label}
              </span>
              <span className="text-xs text-gray-400">{itemCount} items</span>
              {lastLog && <span className="text-xs text-gray-400">Last: {fmtDate(lastLog.scheduledDate)}</span>}
            </div>
          </div>
          <div className="flex items-start gap-2 shrink-0">
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
              done ? "bg-green-50 text-green-700" :
              isDraft ? "bg-amber-50 text-amber-700" :
              "bg-gray-100 text-gray-500"
            }`}>
              {done ? "Done" : isDraft ? "Partial" : "Pending"}
            </span>
            <button
              onClick={() => handleRemove(a.id)}
              className="text-xs text-gray-400 hover:text-red-500 transition-colors cursor-pointer"
            >
              Remove
            </button>
          </div>
        </div>
      </Link>
    );
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold text-gray-900">PM Checklists</h2>
          {!loading && assignments.length > 0 && (
            <p className="text-xs text-gray-400 mt-0.5">
              {totalDone}/{assignments.length} completed this period
            </p>
          )}
        </div>
        <Link
          href={`/accounts/${accountId}/checklists/assign`}
          className="border border-[#2166AC] text-[#2166AC] px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-50 transition-colors"
        >
          + Assign Checklist
        </Link>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-20 bg-white rounded-xl border border-gray-100 animate-pulse" />)}
        </div>
      ) : assignments.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-12 text-center">
          <p className="text-gray-400 text-sm">No checklists assigned.</p>
          <p className="text-gray-400 text-xs mt-1">
            Assign checklists from the{" "}
            <Link href="/pm-checklists" className="text-[#2166AC] hover:underline">PM library</Link>.
          </p>
        </div>
      ) : (
        <div>
          {/* Status filter pills */}
          <div className="flex flex-wrap gap-2 mb-6">
            <button
              type="button"
              onClick={() => setStatusFilter("ALL")}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors cursor-pointer ${
                statusFilter === "ALL" ? "bg-[#2166AC] text-white border-[#2166AC]" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
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
                    active ? STATUS_META[key].activeCls : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
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
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">
                  {STATUS_META[key].label} ({list.length})
                </p>
                <div className="space-y-3">{list.map(renderCard)}</div>
              </div>
            );
          })}

          {statusFilter !== "ALL" && byStatus[statusFilter].length === 0 && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-8 text-center text-gray-400 text-sm">
              No {STATUS_META[statusFilter].label.toLowerCase()} checklists this period.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
