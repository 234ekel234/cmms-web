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
  DAILY:         { label: "Daily",         cls: "bg-[var(--tu-soft-brand)] text-[var(--tu-on-brand)]" },
  WEEKLY:        { label: "Weekly",        cls: "bg-violet-50 text-violet-700" },
  MONTHLY:       { label: "Monthly",       cls: "bg-[var(--tu-soft-warning)] text-[var(--tu-on-warning)]" },
  QUARTERLY:     { label: "Quarterly",     cls: "bg-teal-50 text-teal-700" },
  SEMI_ANNUALLY: { label: "Semi-Annually", cls: "bg-pink-50 text-pink-700" },
  ANNUALLY:      { label: "Annually",      cls: "bg-[var(--tu-soft-success)] text-[var(--tu-on-success)]" },
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

// Compact chip label for the history strip, per frequency.
function shortPeriodLabel(date: Date, frequency: string): string {
  const y = date.getUTCFullYear(), m = date.getUTCMonth(), d = date.getUTCDate();
  switch (frequency) {
    case "WEEKLY":        return `${MONTHS[m]} ${d}`;
    case "MONTHLY":       return `${MONTHS[m]} '${String(y).slice(2)}`;
    case "QUARTERLY":     return `Q${Math.floor(m / 3) + 1} '${String(y).slice(2)}`;
    case "SEMI_ANNUALLY": return `H${Math.floor(m / 6) + 1} '${String(y).slice(2)}`;
    case "ANNUALLY":      return `${y}`;
    default:              return `${MONTHS[m]} ${d}`; // DAILY
  }
}

// How many recent occurrences the history strip shows, per frequency.
const HISTORY_COUNTS: Record<string, number> = {
  DAILY: 14, WEEKLY: 8, MONTHLY: 12, QUARTERLY: 6, SEMI_ANNUALLY: 4, ANNUALLY: 5,
};

type OccStatus = "done" | "partial" | "missed" | "due";
const OCC_CONFIG: Record<OccStatus, { bg: string; dot: string; text: string; label: string }> = {
  done:    { bg: "bg-[var(--tu-soft-success)]", dot: "bg-[var(--tu-status-completed)]", text: "text-[var(--tu-on-success)]", label: "Done" },
  partial: { bg: "bg-[var(--tu-soft-warning)]", dot: "bg-[var(--tu-priority-high)]", text: "text-[var(--tu-on-warning)]", label: "Partial" },
  missed:  { bg: "bg-[var(--tu-soft-danger)]",   dot: "bg-[var(--tu-priority-critical)]",   text: "text-[var(--tu-on-danger)]",   label: "Missed" },
  due:     { bg: "bg-[var(--tu-bg-surface)]",    dot: "bg-[var(--tu-text-disabled)]",  text: "text-[var(--tu-text-subtle)]",  label: "Due" },
};

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
  // Captured once so the history window stays stable across re-renders.
  const [nowMs] = useState(() => Date.now());

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
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-[var(--tu-text-brand)] border-t-transparent" />
      </div>
    );
  }

  if (!assignment) {
    return <div className="p-8 text-sm text-[var(--tu-on-danger)]">{error ?? "Checklist not found."}</div>;
  }

  const { checklist } = assignment;
  const freq = FREQ_CONFIG[checklist.frequency] ?? { label: checklist.frequency, cls: "bg-[var(--tu-bg-secondary-strong)] text-[var(--tu-text-body)]" };
  const atCurrent = isAtCurrentPeriod();
  const { total, completeCount, incompleteTitles } = sectionStats();
  const progressPct = total > 0 ? Math.round((completeCount / total) * 100) : 0;

  // Recent occurrences (newest first): match each expected period to its log,
  // marking past periods with no log as "missed" and the current one as "due".
  const currentStart = getPeriodStart(new Date(nowMs), checklist.frequency).getTime();
  const selectedStart = getPeriodStart(selectedDate, checklist.frequency).getTime();
  const historyCount = HISTORY_COUNTS[checklist.frequency] ?? 8;
  const history: { time: number; date: Date; status: OccStatus }[] = [];
  {
    let d = getPeriodStart(new Date(nowMs), checklist.frequency);
    for (let i = 0; i < historyCount; i++) {
      const t = d.getTime();
      const log = allLogs.find((l) => new Date(l.scheduledDate).getTime() === t) ?? null;
      const status: OccStatus = log
        ? (log.isDraft ? "partial" : "done")
        : (t >= currentStart ? "due" : "missed");
      history.push({ time: t, date: d, status });
      d = stepPeriod(d, checklist.frequency, -1);
    }
  }
  const doneCount = history.filter((h) => h.status === "done").length;

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <div className="bg-[var(--tu-bg-surface)] border-b border-[var(--tu-border)] px-6 py-4 flex items-center gap-4 sticky top-0 z-10">
        <Link
          href={`/accounts/${accountId}/checklists`}
          className="text-[var(--tu-text-brand)] text-sm font-semibold hover:underline shrink-0"
        >
          ← Checklists
        </Link>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-bold text-[var(--tu-text-heading)] truncate">{checklist.name}</h2>
          {assignment.asset && (
            <Link
              href={`/accounts/${accountId}/assets/${assignment.asset.id}`}
              className="text-xs text-[var(--tu-text-brand)] hover:underline"
            >
              › {assignment.asset.name}
            </Link>
          )}
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold shrink-0 ${freq.cls}`}>
          {freq.label}
        </span>
        {!isEditing && periodLog && !periodLog.isDraft && (
          <button
            onClick={() => setIsEditing(true)}
            className="text-sm text-[var(--tu-text-brand)] font-semibold hover:underline shrink-0 cursor-pointer"
          >
            Edit
          </button>
        )}
      </div>

      {/* Period navigation */}
      <div className="bg-[var(--tu-bg-secondary)] border-b border-[var(--tu-border)] px-6 py-3 flex items-center gap-4">
        <button
          onClick={() => navigate(-1)}
          className="text-2xl text-[var(--tu-text-brand)] hover:text-[var(--tu-on-brand)] font-bold w-8 h-8 flex items-center justify-center cursor-pointer"
        >
          ‹
        </button>
        <div className="flex-1 text-center">
          <p className="text-sm font-bold text-[var(--tu-text-heading)]">{formatPeriod(selectedDate, checklist.frequency)}</p>
          <div className="flex items-center justify-center gap-2 mt-1">
            {periodLog ? (
              <>
                <span className={`text-xs font-semibold ${periodLog.isDraft ? "text-[var(--tu-on-warning)]" : "text-[var(--tu-on-success)]"}`}>
                  {periodLog.isDraft ? "Partial" : `Done · ${fmtTime(periodLog.completedAt)}`}
                </span>
                {periodLog.isLate && (
                  <span className="bg-[var(--tu-soft-warning)] text-[var(--tu-on-warning)] text-xs font-bold px-2 py-0.5 rounded-full">Late</span>
                )}
              </>
            ) : (
              <span className="text-xs text-[var(--tu-text-subtle)]">No entry</span>
            )}
          </div>
        </div>
        <button
          onClick={() => navigate(1)}
          disabled={atCurrent}
          className="text-2xl text-[var(--tu-text-brand)] hover:text-[var(--tu-on-brand)] font-bold w-8 h-8 flex items-center justify-center disabled:text-[var(--tu-text-disabled)] disabled:cursor-not-allowed cursor-pointer"
        >
          ›
        </button>
      </div>

      {/* History strip — recent occurrences at a glance, click to open one */}
      <div className="bg-[var(--tu-bg-surface)] border-b border-[var(--tu-border)] px-6 py-3">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-bold text-[var(--tu-text-subtle)] uppercase tracking-wide">
            History · last {historyCount} {freq.label.toLowerCase()}
          </p>
          <p className="text-xs text-[var(--tu-text-subtle)]">{doneCount}/{historyCount} completed</p>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {history.map(({ time, date, status }) => {
            const cfg = OCC_CONFIG[status];
            const selected = time === selectedStart;
            return (
              <button
                key={time}
                type="button"
                onClick={() => { setSelectedDate(date); setError(null); setSaveMsg(""); }}
                aria-current={selected ? "true" : undefined}
                className={`shrink-0 w-[68px] rounded-lg px-2 py-2 text-center transition-colors cursor-pointer ${cfg.bg} ${
                  selected ? "border-2 border-[var(--tu-text-brand)]" : "border border-[var(--tu-border)] hover:border-[var(--tu-border-strong)]"
                }`}
              >
                <span className={`block w-2 h-2 rounded-full mx-auto mb-1 ${cfg.dot}`} aria-hidden="true" />
                <span className="block text-[11px] font-semibold text-[var(--tu-text-body)] whitespace-nowrap">
                  {shortPeriodLabel(date, checklist.frequency)}
                </span>
                <span className={`block text-[10px] font-semibold ${cfg.text}`}>{cfg.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {isEditing && isPastPeriod() && (
        <div className="bg-[var(--tu-soft-warning)] border-b border-[var(--tu-bd-warning)] px-6 py-2.5">
          <p className="text-xs text-[var(--tu-on-warning)] font-semibold">
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
            <div key={sec.id} className="bg-[var(--tu-bg-surface)] rounded-xl border border-[var(--tu-border)] shadow-sm overflow-hidden">
              {/* Section header */}
              <div className="bg-[var(--tu-text-heading)] px-4 py-2.5 flex items-center justify-between">
                <span className="text-sm font-bold text-white">{sec.title}</span>
                {completedAt ? (
                  <span className="text-xs font-semibold text-[var(--tu-on-success)]">
                    {locked && "🔒 "}✓ {fmtDateTime(completedAt)}
                  </span>
                ) : touched ? (
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${filled ? "bg-[var(--tu-soft-success)] text-[var(--tu-on-success)]" : "bg-[var(--tu-soft-warning)] text-[var(--tu-on-warning)]"}`}>
                    {filled ? "Complete" : "Incomplete"}
                  </span>
                ) : null}
              </div>

              {/* Column headers */}
              <div className="flex items-center border-b border-[var(--tu-border)] bg-[var(--tu-bg-secondary)] px-4 py-2 text-xs font-bold text-[var(--tu-text-subtle)]">
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
                    className={`flex items-center px-4 py-3 border-b border-[var(--tu-border)] last:border-0 ${ii % 2 === 1 ? "bg-[var(--tu-bg-secondary)]/50" : ""}`}
                  >
                    <div className="flex-1 pr-4">
                      <p className="text-sm text-[var(--tu-text-heading)]">{ii + 1}. {item.label}</p>
                      {!editable && state.answeredAt && (
                        <p className="text-xs text-[var(--tu-text-subtle)] mt-0.5">Answered {fmtTime(state.answeredAt)}</p>
                      )}
                    </div>
                    {sec.answerOptions.map((opt) => (
                      <div key={opt} className="w-20 flex justify-center">
                        <button
                          onClick={() => editable && setAnswer(item.id, opt)}
                          disabled={!editable}
                          className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                            state.answer === opt
                              ? "border-[var(--tu-text-brand)]"
                              : "border-[var(--tu-border-strong)]"
                          } ${editable ? "cursor-pointer hover:border-[var(--tu-text-brand)]" : "cursor-default"}`}
                        >
                          {state.answer === opt && (
                            <div className="w-2.5 h-2.5 rounded-full bg-[var(--tu-text-brand)]" />
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
                          className="w-full text-sm border border-[var(--tu-border)] rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-[var(--tu-text-brand)]/30 bg-[var(--tu-bg-surface)]"
                        />
                      ) : (
                        <span className="text-sm text-[var(--tu-text-subtle)] italic">{state.remarks || "—"}</span>
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
        <div className="fixed bottom-0 left-60 right-0 bg-[var(--tu-bg-surface)] border-t border-[var(--tu-border)] px-6 py-4 shadow-lg">
          <div className="max-w-4xl mx-auto space-y-3">
            {/* Progress */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-2 bg-[var(--tu-bg-secondary-strong)] rounded-full overflow-hidden">
                <div
                  className="h-2 bg-[var(--tu-text-brand)] rounded-full transition-all"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <span className="text-xs text-[var(--tu-text-subtle)] font-semibold whitespace-nowrap">
                {completeCount}/{total} sections complete
              </span>
            </div>

            {incompleteTitles.length > 0 && (
              <p className="text-xs text-[var(--tu-on-warning)] bg-[var(--tu-soft-warning)] rounded-lg px-3 py-2">
                Incomplete (won&apos;t be saved): {incompleteTitles.join(", ")}
              </p>
            )}
            {saveMsg && (
              <p className="text-xs text-[var(--tu-on-success)] bg-[var(--tu-soft-success)] rounded-lg px-3 py-2 font-semibold">{saveMsg}</p>
            )}
            {error && (
              <p className="text-xs text-[var(--tu-on-danger)] bg-[var(--tu-soft-danger)] rounded-lg px-3 py-2">{error}</p>
            )}

            <div className="flex gap-3">
              <Link
                href={`/accounts/${accountId}/checklists`}
                className="px-5 py-2.5 border border-[var(--tu-border)] text-[var(--tu-text-body)] rounded-lg text-sm font-semibold hover:bg-[var(--tu-bg-secondary)] transition-colors"
              >
                Cancel
              </Link>
              <button
                onClick={handleSubmit}
                disabled={submitting || completeCount === 0}
                className="flex-1 bg-[var(--tu-text-brand)] text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-[var(--tu-text-brand-strong)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
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
