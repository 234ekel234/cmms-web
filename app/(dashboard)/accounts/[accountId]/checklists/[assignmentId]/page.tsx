"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import api from "@/lib/api";

type PMItem = { id: string; label: string; order: number };
type PMSection = { id: string; title: string; answerOptions: string[]; order: number; items: PMItem[] };
type PMLog = {
  id: string;
  scheduledDate: string;
  completedAt: string;
  performedByName: string;
  isDraft: boolean;
  isLate: boolean;
  items: { id: string; itemId: string; answer: string; remarks: string | null; answeredAt: string }[];
};
type Assignment = {
  id: string;
  checklist: { id: string; name: string; frequency: string; sections: PMSection[] };
  asset: { id: string; name: string } | null;
  logs: PMLog[];
};
type ItemState = { answer: string; remarks: string; answeredAt?: string };

const FREQ_CONFIG: Record<string, { label: string; cls: string }> = {
  DAILY:         { label: "Daily",         cls: "bg-blue-50 text-blue-700" },
  WEEKLY:        { label: "Weekly",        cls: "bg-violet-50 text-violet-700" },
  MONTHLY:       { label: "Monthly",       cls: "bg-amber-50 text-amber-700" },
  QUARTERLY:     { label: "Quarterly",     cls: "bg-teal-50 text-teal-700" },
  SEMI_ANNUALLY: { label: "Semi-Annually", cls: "bg-pink-50 text-pink-700" },
  ANNUALLY:      { label: "Annually",      cls: "bg-green-50 text-green-700" },
};

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function getPeriodStart(date: Date, frequency: string): Date {
  const y = date.getUTCFullYear(), m = date.getUTCMonth(), d = date.getUTCDate();
  switch (frequency) {
    case "DAILY":        return new Date(Date.UTC(y, m, d));
    case "WEEKLY":       return new Date(Date.UTC(y, m, d - date.getUTCDay()));
    case "MONTHLY":      return new Date(Date.UTC(y, m, 1));
    case "QUARTERLY":    return new Date(Date.UTC(y, Math.floor(m / 3) * 3, 1));
    case "SEMI_ANNUALLY":return new Date(Date.UTC(y, Math.floor(m / 6) * 6, 1));
    case "ANNUALLY":     return new Date(Date.UTC(y, 0, 1));
    default:             return new Date(Date.UTC(y, m, d));
  }
}

function stepPeriod(date: Date, frequency: string, dir: 1 | -1): Date {
  const y = date.getUTCFullYear(), m = date.getUTCMonth(), d = date.getUTCDate();
  switch (frequency) {
    case "DAILY":        return new Date(Date.UTC(y, m, d + dir));
    case "WEEKLY":       return new Date(Date.UTC(y, m, d + dir * 7));
    case "MONTHLY":      return new Date(Date.UTC(y, m + dir, 1));
    case "QUARTERLY":    return new Date(Date.UTC(y, m + dir * 3, 1));
    case "SEMI_ANNUALLY":return new Date(Date.UTC(y, m + dir * 6, 1));
    case "ANNUALLY":     return new Date(Date.UTC(y + dir, 0, 1));
    default:             return new Date(Date.UTC(y, m, d + dir));
  }
}

function formatPeriod(date: Date, frequency: string): string {
  const y = date.getUTCFullYear(), m = date.getUTCMonth(), d = date.getUTCDate();
  switch (frequency) {
    case "DAILY":   return `${MONTHS[m]} ${d}, ${y}`;
    case "WEEKLY": {
      const end = new Date(Date.UTC(y, m, d + 6));
      return `${MONTHS[m]} ${d} – ${MONTHS[end.getUTCMonth()]} ${end.getUTCDate()}, ${end.getUTCFullYear()}`;
    }
    case "MONTHLY":       return `${MONTHS[m]} ${y}`;
    case "QUARTERLY":     return `Q${Math.floor(m / 3) + 1} ${y}`;
    case "SEMI_ANNUALLY": return `H${Math.floor(m / 6) + 1} ${y}`;
    case "ANNUALLY":      return `${y}`;
    default:              return date.toLocaleDateString();
  }
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function ChecklistFormPage() {
  const params = useParams();
  const router = useRouter();
  const accountId = params.accountId as string;
  const assignmentId = params.assignmentId as string;

  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [allLogs, setAllLogs] = useState<PMLog[]>([]);
  const [selectedDate, setSelectedDate] = useState(() => {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  });
  const [periodLog, setPeriodLog] = useState<PMLog | null>(null);
  const [itemStates, setItemStates] = useState<Record<string, ItemState>>({});
  const [isEditing, setIsEditing] = useState(true);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveMsg, setSaveMsg] = useState("");

  useEffect(() => { fetchData(); }, [assignmentId]);

  useEffect(() => {
    if (!assignment) return;
    const periodStart = getPeriodStart(selectedDate, assignment.checklist.frequency);
    const log = allLogs.find((l) => new Date(l.scheduledDate).getTime() === periodStart.getTime()) ?? null;
    setPeriodLog(log);
    if (log) {
      const states: Record<string, ItemState> = {};
      for (const li of log.items) {
        states[li.itemId] = { answer: li.answer, remarks: li.remarks ?? "", answeredAt: li.answeredAt };
      }
      setItemStates(states);
      setIsEditing(log.isDraft);
    } else {
      setItemStates({});
      setIsEditing(true);
    }
  }, [selectedDate, allLogs, assignment]);

  async function fetchData() {
    try {
      const [assignRes, logsRes] = await Promise.all([
        api.get(`/accounts/${accountId}/pm-checklists`),
        api.get(`/account-pm-checklists/${assignmentId}/logs`),
      ]);
      const found: Assignment = assignRes.data.find((a: Assignment) => a.id === assignmentId);
      if (!found) { router.push(`/accounts/${accountId}/checklists`); return; }
      setAssignment(found);
      setAllLogs(logsRes.data);
    } catch {
      setError("Failed to load checklist.");
    } finally {
      setLoading(false);
    }
  }

  const setAnswer = useCallback((itemId: string, answer: string) => {
    setItemStates((prev) => ({ ...prev, [itemId]: { ...prev[itemId], answer, remarks: prev[itemId]?.remarks ?? "" } }));
  }, []);

  const setRemarks = useCallback((itemId: string, remarks: string) => {
    setItemStates((prev) => ({ ...prev, [itemId]: { ...prev[itemId], remarks, answer: prev[itemId]?.answer ?? "" } }));
  }, []);

  function sectionFilled(sec: PMSection) {
    return sec.items.length > 0 && sec.items.every((it) => !!itemStates[it.id]?.answer);
  }
  function sectionTouched(sec: PMSection) {
    return sec.items.some((it) => !!itemStates[it.id]?.answer);
  }
  function sectionSubmitted(sec: PMSection) {
    return sec.items.length > 0 && sec.items.every((it) => !!itemStates[it.id]?.answeredAt);
  }
  function sectionCompletedAt(sec: PMSection): string | null {
    if (!sectionFilled(sec)) return null;
    const times = sec.items.map((it) => itemStates[it.id]?.answeredAt).filter((t): t is string => !!t);
    if (!times.length) return null;
    return times.reduce((a, b) => (new Date(a) >= new Date(b) ? a : b));
  }
  function sectionStats() {
    const sections = assignment?.checklist.sections ?? [];
    const complete = sections.filter(sectionFilled);
    const incomplete = sections.filter((s) => sectionTouched(s) && !sectionFilled(s));
    return { total: sections.length, completeCount: complete.length, incompleteTitles: incomplete.map((s) => s.title) };
  }

  function navigate(dir: 1 | -1) {
    if (!assignment) return;
    setSelectedDate((prev) => stepPeriod(prev, assignment.checklist.frequency, dir));
    setError(null); setSaveMsg("");
  }

  function isAtCurrentPeriod() {
    if (!assignment) return true;
    const current = getPeriodStart(new Date(), assignment.checklist.frequency);
    return getPeriodStart(selectedDate, assignment.checklist.frequency).getTime() >= current.getTime();
  }

  function isPastPeriod() {
    if (!assignment) return false;
    const current = getPeriodStart(new Date(), assignment.checklist.frequency);
    return getPeriodStart(selectedDate, assignment.checklist.frequency).getTime() < current.getTime();
  }

  async function handleSubmit() {
    if (!assignment || submitting) return;
    const { total, completeCount, incompleteTitles } = sectionStats();
    if (completeCount === 0) { setError("Fill in at least one complete section before saving."); return; }

    setSubmitting(true); setError(null);
    const items = assignment.checklist.sections
      .filter(sectionFilled)
      .flatMap((sec) => sec.items.map((item) => ({
        itemId: item.id,
        answer: itemStates[item.id].answer,
        remarks: itemStates[item.id].remarks?.trim() || null,
      })));
    const isDraft = completeCount < total;
    const scheduledDate = selectedDate.toISOString().split("T")[0];

    try {
      let savedLog: PMLog;
      if (periodLog) {
        const res = await api.put(`/account-pm-checklists/${assignmentId}/logs/${periodLog.id}`, { items, isDraft });
        savedLog = res.data;
      } else {
        const res = await api.post(`/account-pm-checklists/${assignmentId}/logs`, { items, isDraft, scheduledDate });
        savedLog = res.data;
      }
      setAllLogs((prev) => [savedLog, ...prev.filter((l) => l.id !== savedLog.id)]);
      if (isDraft) {
        const msg = incompleteTitles.length > 0
          ? `Saved ${completeCount} section(s); ${incompleteTitles.length} incomplete skipped`
          : "Saved as partial";
        setSaveMsg(msg);
        setTimeout(() => setSaveMsg(""), 4000);
      } else {
        setIsEditing(false);
        setSaveMsg("Checklist submitted.");
      }
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e?.response?.data?.error ?? "Failed to submit. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-[#2166AC] border-t-transparent" />
      </div>
    );
  }

  if (!assignment) {
    return <div className="p-8 text-sm text-red-600">{error ?? "Checklist not found."}</div>;
  }

  const { checklist } = assignment;
  const freq = FREQ_CONFIG[checklist.frequency] ?? { label: checklist.frequency, cls: "bg-gray-100 text-gray-600" };
  const atCurrent = isAtCurrentPeriod();
  const { total, completeCount, incompleteTitles } = sectionStats();
  const progressPct = total > 0 ? Math.round((completeCount / total) * 100) : 0;

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-4 sticky top-0 z-10">
        <Link
          href={`/accounts/${accountId}/checklists`}
          className="text-[#2166AC] text-sm font-semibold hover:underline shrink-0"
        >
          ← Back
        </Link>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-bold text-gray-900 truncate">{checklist.name}</h2>
          {assignment.asset && (
            <p className="text-xs text-[#2166AC]">› {assignment.asset.name}</p>
          )}
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold shrink-0 ${freq.cls}`}>
          {freq.label}
        </span>
        {!isEditing && periodLog && !periodLog.isDraft && (
          <button
            onClick={() => setIsEditing(true)}
            className="text-sm text-[#2166AC] font-semibold hover:underline shrink-0 cursor-pointer"
          >
            Edit
          </button>
        )}
      </div>

      {/* Period navigation */}
      <div className="bg-gray-50 border-b border-gray-200 px-6 py-3 flex items-center gap-4">
        <button
          onClick={() => navigate(-1)}
          className="text-2xl text-[#2166AC] hover:text-blue-800 font-bold w-8 h-8 flex items-center justify-center cursor-pointer"
        >
          ‹
        </button>
        <div className="flex-1 text-center">
          <p className="text-sm font-bold text-gray-900">{formatPeriod(selectedDate, checklist.frequency)}</p>
          <div className="flex items-center justify-center gap-2 mt-1">
            {periodLog ? (
              <>
                <span className={`text-xs font-semibold ${periodLog.isDraft ? "text-amber-600" : "text-green-700"}`}>
                  {periodLog.isDraft ? "Partial" : `Done · ${fmtTime(periodLog.completedAt)}`}
                </span>
                {periodLog.isLate && (
                  <span className="bg-amber-50 text-amber-700 text-xs font-bold px-2 py-0.5 rounded-full">Late</span>
                )}
              </>
            ) : (
              <span className="text-xs text-gray-400">No entry</span>
            )}
          </div>
        </div>
        <button
          onClick={() => navigate(1)}
          disabled={atCurrent}
          className="text-2xl text-[#2166AC] hover:text-blue-800 font-bold w-8 h-8 flex items-center justify-center disabled:text-gray-300 disabled:cursor-not-allowed cursor-pointer"
        >
          ›
        </button>
      </div>

      {isEditing && isPastPeriod() && (
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-2.5">
          <p className="text-xs text-amber-800 font-semibold">
            This period has already passed — submission will be marked as late.
          </p>
        </div>
      )}

      {/* Sections */}
      <div className="flex-1 p-6 space-y-4 pb-40">
        {checklist.sections.map((sec) => {
          const locked = sectionSubmitted(sec);
          const editable = isEditing && !locked;
          const completedAt = sectionCompletedAt(sec);
          const touched = sectionTouched(sec);
          const filled = sectionFilled(sec);

          return (
            <div key={sec.id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              {/* Section header */}
              <div className="bg-gray-700 px-4 py-2.5 flex items-center justify-between">
                <span className="text-sm font-bold text-white">{sec.title}</span>
                {completedAt ? (
                  <span className="text-xs font-semibold text-green-300">
                    {locked && "🔒 "}✓ {fmtDateTime(completedAt)}
                  </span>
                ) : touched ? (
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${filled ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
                    {filled ? "Complete" : "Incomplete"}
                  </span>
                ) : null}
              </div>

              {/* Column headers */}
              <div className="flex items-center border-b border-gray-100 bg-gray-50 px-4 py-2 text-xs font-bold text-gray-500">
                <div className="flex-1 pr-4">Item</div>
                {sec.answerOptions.map((opt) => (
                  <div key={opt} className="w-20 text-center">{opt}</div>
                ))}
                <div className="flex-1 pl-4">Remarks</div>
              </div>

              {/* Items */}
              {sec.items.map((item, ii) => {
                const state = itemStates[item.id] ?? { answer: "", remarks: "" };
                return (
                  <div
                    key={item.id}
                    className={`flex items-center px-4 py-3 border-b border-gray-50 last:border-0 ${ii % 2 === 1 ? "bg-gray-50/50" : ""}`}
                  >
                    <div className="flex-1 pr-4">
                      <p className="text-sm text-gray-800">{ii + 1}. {item.label}</p>
                      {!editable && state.answeredAt && (
                        <p className="text-xs text-gray-400 mt-0.5">Answered {fmtTime(state.answeredAt)}</p>
                      )}
                    </div>
                    {sec.answerOptions.map((opt) => (
                      <div key={opt} className="w-20 flex justify-center">
                        <button
                          onClick={() => editable && setAnswer(item.id, opt)}
                          disabled={!editable}
                          className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                            state.answer === opt
                              ? "border-[#2166AC]"
                              : "border-gray-300"
                          } ${editable ? "cursor-pointer hover:border-[#2166AC]" : "cursor-default"}`}
                        >
                          {state.answer === opt && (
                            <div className="w-2.5 h-2.5 rounded-full bg-[#2166AC]" />
                          )}
                        </button>
                      </div>
                    ))}
                    <div className="flex-1 pl-4">
                      {editable ? (
                        <input
                          type="text"
                          value={state.remarks}
                          onChange={(e) => setRemarks(item.id, e.target.value)}
                          placeholder="—"
                          className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#2166AC]/30 bg-white"
                        />
                      ) : (
                        <span className="text-sm text-gray-500 italic">{state.remarks || "—"}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Footer — sticky submit bar */}
      {isEditing && (
        <div className="fixed bottom-0 left-60 right-0 bg-white border-t border-gray-200 px-6 py-4 shadow-lg">
          <div className="max-w-4xl mx-auto space-y-3">
            {/* Progress */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-2 bg-[#2166AC] rounded-full transition-all"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <span className="text-xs text-gray-500 font-semibold whitespace-nowrap">
                {completeCount}/{total} sections complete
              </span>
            </div>

            {incompleteTitles.length > 0 && (
              <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
                Incomplete (won't be saved): {incompleteTitles.join(", ")}
              </p>
            )}
            {saveMsg && (
              <p className="text-xs text-green-700 bg-green-50 rounded-lg px-3 py-2 font-semibold">{saveMsg}</p>
            )}
            {error && (
              <p className="text-xs text-red-700 bg-red-50 rounded-lg px-3 py-2">{error}</p>
            )}

            <div className="flex gap-3">
              <Link
                href={`/accounts/${accountId}/checklists`}
                className="px-5 py-2.5 border border-gray-200 text-gray-600 rounded-lg text-sm font-semibold hover:bg-gray-50 transition-colors"
              >
                Cancel
              </Link>
              <button
                onClick={handleSubmit}
                disabled={submitting || completeCount === 0}
                className="flex-1 bg-[#2166AC] text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-[#1a5490] disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                {submitting ? "Saving…" : completeCount < total ? "Save Partial" : "Submit Checklist"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
