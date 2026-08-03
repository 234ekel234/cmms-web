"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import api from "@/lib/api";
import EmptyState from "@/components/EmptyState";

type ShiftTemplate = {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
};

type AttendanceRow = {
  employee: { id: string; name: string; position: string | null };
  attendanceId: string | null;
  isPresent: boolean | null;
  isReliever: boolean;
};

type Cutoff = "first" | "second";

type GridRow = {
  id: string;
  name: string;
  position: string | null;
  days: Record<string, "present" | "absent" | "reliever">;
  present: number;
  absent: number;
  reliever: number;
};

type GridData = {
  dates: string[];
  rows: GridRow[];
};

const CELL_CONFIG = {
  present:  { label: "P", bg: "bg-[var(--tu-soft-success)] text-[var(--tu-on-success)]" },
  reliever: { label: "R", bg: "bg-[var(--tu-soft-warning)] text-[var(--tu-on-warning)]" },
  absent:   { label: "A", bg: "bg-[var(--tu-soft-danger)] text-[var(--tu-on-danger)]" },
};

function toDateString(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function addDays(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function formatDate(d: Date) {
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

function formatMonth(d: Date) {
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function endOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth() + 1, 0); }
function addMonths(d: Date, n: number) { return new Date(d.getFullYear(), d.getMonth() + n, 1); }
function lastDayOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); }
function dayNum(ds: string) { return parseInt(ds.slice(8, 10), 10); }

function getCurrentShiftIndex(templates: ShiftTemplate[]): number {
  const now = new Date();
  const cur = now.getHours() * 60 + now.getMinutes();
  for (let i = 0; i < templates.length; i++) {
    const [sh, sm] = templates[i].startTime.split(":").map(Number);
    const [eh, em] = templates[i].endTime.split(":").map(Number);
    const start = sh * 60 + sm;
    const end = eh * 60 + em;
    const inRange = start < end ? cur >= start && cur < end : cur >= start || cur < end;
    if (inRange) return i;
  }
  return 0;
}

export default function AttendancePage() {
  const params = useParams();
  const accountId = params.accountId as string;
  const [shiftTemplates, setShiftTemplates] = useState<ShiftTemplate[]>([]);
  const [templatesLoaded, setTemplatesLoaded] = useState(false);

  const [view, setView] = useState<"daily" | "summary">("daily");

  // Daily state
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [shiftLogId, setShiftLogId] = useState<string | null>(null);
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
  const [loadingAttendance, setLoadingAttendance] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);

  // Summary state
  const [summaryMonth, setSummaryMonth] = useState(new Date());
  const [cutoff, setCutoff] = useState<Cutoff>(new Date().getDate() <= 15 ? "first" : "second");
  const [grid, setGrid] = useState<GridData | null>(null);
  const [loadingGrid, setLoadingGrid] = useState(false);

  useEffect(() => {
    api.get(`/accounts/${accountId}/shift-templates`).then((r) => {
      setShiftTemplates(r.data);
      const idx = getCurrentShiftIndex(r.data);
      setSelectedIndex(idx);
      setTemplatesLoaded(true);
    }).catch(() => setTemplatesLoaded(true));
  }, [accountId]);

  const loadAttendance = useCallback(async (templateId: string, date: Date) => {
    setLoadingAttendance(true);
    setAttendance([]);
    try {
      const logRes = await api.post("/shift-logs", { shiftTemplateId: templateId, date: toDateString(date) });
      const logId = logRes.data.id;
      setShiftLogId(logId);
      const attRes = await api.get(`/shift-logs/${logId}/attendance`);
      setAttendance(attRes.data);
    } catch {
      // silent
    } finally {
      setLoadingAttendance(false);
    }
  }, []);

  useEffect(() => {
    if (templatesLoaded && shiftTemplates.length > 0) {
      loadAttendance(shiftTemplates[selectedIndex].id, selectedDate);
    }
  }, [templatesLoaded]);

  async function selectShift(index: number) {
    setSelectedIndex(index);
    if (shiftTemplates[index]) await loadAttendance(shiftTemplates[index].id, selectedDate);
  }

  async function changeDate(delta: number) {
    const newDate = addDays(selectedDate, delta);
    setSelectedDate(newDate);
    if (shiftTemplates[selectedIndex]) await loadAttendance(shiftTemplates[selectedIndex].id, newDate);
  }

  async function mark(employeeId: string, isPresent: boolean) {
    if (!shiftLogId) return;
    setSaving(employeeId);
    try {
      await api.post(`/shift-logs/${shiftLogId}/attendance`, { employeeId, isPresent });
      setAttendance((prev) => prev.map((r) => r.employee.id === employeeId ? { ...r, isPresent } : r));
    } catch {
      // silent
    } finally {
      setSaving(null);
    }
  }

  async function toggleReliever(employeeId: string, isReliever: boolean) {
    if (!shiftLogId) return;
    try {
      await api.post(`/shift-logs/${shiftLogId}/attendance`, { employeeId, isReliever });
      setAttendance((prev) => prev.map((r) => r.employee.id === employeeId ? { ...r, isReliever } : r));
    } catch {
      // silent
    }
  }

  const loadGrid = useCallback(async (month: Date, half: Cutoff) => {
    setLoadingGrid(true);
    try {
      const fromD = half === "first" ? startOfMonth(month) : new Date(month.getFullYear(), month.getMonth(), 16);
      const toD = half === "first" ? new Date(month.getFullYear(), month.getMonth(), 15) : endOfMonth(month);
      const res = await api.get(`/accounts/${accountId}/attendance/grid?from=${toDateString(fromD)}&to=${toDateString(toD)}`);
      setGrid(res.data);
    } catch {
      // silent
    } finally {
      setLoadingGrid(false);
    }
  }, [accountId]);

  useEffect(() => {
    if (view === "summary") loadGrid(summaryMonth, cutoff);
  }, [view, summaryMonth, cutoff]);

  if (!templatesLoaded) {
    return <div className="p-8"><div className="h-32 bg-[var(--tu-bg-surface)] rounded-xl border border-[var(--tu-border)] animate-pulse" /></div>;
  }

  if (shiftTemplates.length === 0) {
    return (
      <div className="p-8">
        <EmptyState
          icon="schedule"
          title="No shifts yet"
          hint="Attendance is tracked per shift. Add one on the Schedule tab to get started."
          action={
            <Link href={`/accounts/${accountId}/schedule`} className="tu-btn-primary">
              Go to Schedule
            </Link>
          }
        />
      </div>
    );
  }

  const activeTemplate = shiftTemplates[selectedIndex];

  return (
    <div className="p-8">
      {/* View toggle */}
      <div className="flex rounded-xl overflow-hidden border border-[var(--tu-border)] w-fit mb-6">
        {(["daily", "summary"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`px-6 py-2.5 text-sm font-semibold cursor-pointer transition-colors ${
              view === v ? "bg-[var(--tu-text-brand)] text-white" : "bg-[var(--tu-bg-surface)] text-[var(--tu-text-body)] hover:bg-[var(--tu-bg-secondary)]"
            }`}
          >
            {v === "daily" ? "Daily Log" : "Summary"}
          </button>
        ))}
      </div>

      {view === "daily" ? (
        <div>
          {/* Date navigation */}
          <div className="flex items-center justify-center gap-4 mb-4">
            <button onClick={() => changeDate(-1)} className="text-2xl text-[var(--tu-text-brand)] cursor-pointer hover:opacity-70">‹</button>
            <span className="text-sm font-semibold text-[var(--tu-text-body)] min-w-[200px] text-center">{formatDate(selectedDate)}</span>
            <button onClick={() => changeDate(1)} className="text-2xl text-[var(--tu-text-brand)] cursor-pointer hover:opacity-70">›</button>
          </div>

          {/* Shift tabs */}
          <div className="flex rounded-lg border border-[var(--tu-border)] overflow-hidden mb-2 w-fit">
            {shiftTemplates.map((t, i) => (
              <button
                key={t.id}
                onClick={() => selectShift(i)}
                className={`px-4 py-2 text-sm font-semibold cursor-pointer transition-colors ${
                  i === selectedIndex ? "bg-[var(--tu-text-brand)] text-white" : "bg-[var(--tu-bg-surface)] text-[var(--tu-text-body)] hover:bg-[var(--tu-bg-secondary)]"
                }`}
              >
                {t.name}
              </button>
            ))}
          </div>
          <p className="text-xs text-[var(--tu-text-subtle)] mb-6 text-center">
            {activeTemplate?.startTime} – {activeTemplate?.endTime}
          </p>

          {loadingAttendance ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <div key={i} className="h-20 bg-[var(--tu-bg-surface)] rounded-xl border border-[var(--tu-border)] animate-pulse" />)}
            </div>
          ) : attendance.length === 0 ? (
            <EmptyState icon="employee" title="No employees in this account" hint="Assign employees to this account before tracking their attendance." />
          ) : (
            <div className="space-y-3">
              {attendance.map((row) => (
                <div key={row.employee.id} className="bg-[var(--tu-bg-surface)] rounded-xl border border-[var(--tu-border)] shadow-sm p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="font-semibold text-[var(--tu-text-heading)]">{row.employee.name}</p>
                      {row.employee.position && <p className="text-xs text-[var(--tu-text-subtle)]">{row.employee.position}</p>}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => mark(row.employee.id, true)}
                        disabled={saving === row.employee.id}
                        className={`px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer transition-colors ${
                          row.isPresent === true ? "bg-[var(--tu-status-completed)] text-white" : "border border-[var(--tu-border)] text-[var(--tu-text-body)] hover:border-[var(--tu-bd-success)]"
                        }`}
                      >
                        Present
                      </button>
                      <button
                        onClick={() => mark(row.employee.id, false)}
                        disabled={saving === row.employee.id}
                        className={`px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer transition-colors ${
                          row.isPresent === false ? "bg-[var(--tu-priority-critical)] text-white" : "border border-[var(--tu-border)] text-[var(--tu-text-body)] hover:border-[var(--tu-bd-danger)]"
                        }`}
                      >
                        Absent
                      </button>
                    </div>
                  </div>
                  {row.isPresent === true && (
                    <div className="mt-3 pt-3 border-t border-[var(--tu-border)]">
                      <label className="flex items-center gap-2 cursor-pointer text-xs text-[var(--tu-text-subtle)]">
                        <div
                          onClick={() => toggleReliever(row.employee.id, !row.isReliever)}
                          className={`w-4 h-4 rounded border-2 flex items-center justify-center cursor-pointer ${
                            row.isReliever ? "bg-[var(--tu-priority-high)] border-[var(--tu-priority-high)]" : "border-[var(--tu-border-strong)]"
                          }`}
                        >
                          {row.isReliever && <span className="text-white text-[10px] font-bold">✓</span>}
                        </div>
                        Covering (reliever)
                      </label>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div>
          {/* Cut-off toggle */}
          <div className="flex gap-2 mb-4">
            {(["first", "second"] as Cutoff[]).map((c) => (
              <button
                key={c}
                onClick={() => setCutoff(c)}
                className={`px-4 py-2 rounded-lg text-sm font-semibold border cursor-pointer transition-colors ${
                  cutoff === c ? "bg-[var(--tu-text-brand)] text-white border-[var(--tu-text-brand)]" : "bg-[var(--tu-bg-surface)] text-[var(--tu-text-body)] border-[var(--tu-border)] hover:border-[var(--tu-border-strong)]"
                }`}
              >
                {c === "first" ? "1–15" : `16–${lastDayOfMonth(summaryMonth)}`}
              </button>
            ))}
          </div>

          {/* Month navigation */}
          <div className="flex items-center justify-center gap-4 mb-6">
            <button onClick={() => setSummaryMonth((m) => addMonths(m, -1))} className="text-2xl text-[var(--tu-text-brand)] cursor-pointer hover:opacity-70">‹</button>
            <span className="text-sm font-semibold text-[var(--tu-text-body)] min-w-[160px] text-center">{formatMonth(summaryMonth)}</span>
            <button
              onClick={() => setSummaryMonth((m) => addMonths(m, 1))}
              disabled={summaryMonth.getFullYear() === new Date().getFullYear() && summaryMonth.getMonth() === new Date().getMonth()}
              className="text-2xl text-[var(--tu-text-brand)] cursor-pointer hover:opacity-70 disabled:text-[var(--tu-text-disabled)]"
            >
              ›
            </button>
          </div>

          {loadingGrid ? (
            <div className="h-48 bg-[var(--tu-bg-surface)] rounded-xl border border-[var(--tu-border)] animate-pulse" />
          ) : !grid || grid.rows.length === 0 ? (
            <EmptyState icon="employee" title="No employees in this account" hint="Assign employees to this account before tracking their attendance." />
          ) : (
            <div>
              <div className="bg-[var(--tu-bg-surface)] rounded-xl border border-[var(--tu-border)] shadow-sm overflow-x-auto">
                <table className="text-xs">
                  <thead>
                    <tr className="bg-[var(--tu-bg-secondary)] border-b border-[var(--tu-border)]">
                      <th className="px-3 py-2 text-left font-semibold text-[var(--tu-text-subtle)] sticky left-0 bg-[var(--tu-bg-secondary)] min-w-[140px]">Employee</th>
                      {grid.dates.map((d) => (
                        <th key={d} className="px-1 py-2 text-center font-semibold text-[var(--tu-text-subtle)] w-8">{dayNum(d)}</th>
                      ))}
                      <th className="px-3 py-2 text-center font-semibold text-[var(--tu-text-subtle)] min-w-[56px]">P / A</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--tu-border)]">
                    {grid.rows.map((row) => (
                      <tr key={row.id} className="hover:bg-[var(--tu-bg-secondary)]">
                        <td className="px-3 py-2 sticky left-0 bg-[var(--tu-bg-surface)]">
                          <p className="font-semibold text-[var(--tu-text-heading)] text-xs truncate max-w-[130px]">{row.name}</p>
                          {row.position && <p className="text-[10px] text-[var(--tu-text-subtle)] truncate max-w-[130px]">{row.position}</p>}
                        </td>
                        {grid.dates.map((d) => {
                          const status = row.days[d];
                          const cfg = status ? CELL_CONFIG[status] : null;
                          return (
                            <td key={d} className={`w-8 py-2 text-center font-bold ${cfg ? cfg.bg : "text-[var(--tu-text-disabled)]"}`}>
                              {cfg ? cfg.label : "·"}
                            </td>
                          );
                        })}
                        <td className="px-3 py-2 text-center">
                          <span className="text-[var(--tu-on-success)] font-bold">{row.present}</span>
                          <span className="text-[var(--tu-text-disabled)]"> / </span>
                          <span className="text-[var(--tu-on-danger)] font-bold">{row.absent}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* Legend */}
              <div className="flex gap-4 mt-3 text-xs text-[var(--tu-text-subtle)]">
                <div className="flex items-center gap-1"><span className="w-5 h-5 rounded bg-[var(--tu-soft-success)] text-[var(--tu-on-success)] flex items-center justify-center font-bold">P</span> Present</div>
                <div className="flex items-center gap-1"><span className="w-5 h-5 rounded bg-[var(--tu-soft-warning)] text-[var(--tu-on-warning)] flex items-center justify-center font-bold">R</span> Covering</div>
                <div className="flex items-center gap-1"><span className="w-5 h-5 rounded bg-[var(--tu-soft-danger)] text-[var(--tu-on-danger)] flex items-center justify-center font-bold">A</span> Absent</div>
                <div className="flex items-center gap-1"><span className="w-5 h-5 rounded border border-[var(--tu-border)] flex items-center justify-center text-[var(--tu-text-disabled)]">·</span> No shift</div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
