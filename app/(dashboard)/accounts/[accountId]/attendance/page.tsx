"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import api from "@/lib/api";

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
  present:  { label: "P", bg: "bg-green-100 text-green-700" },
  reliever: { label: "R", bg: "bg-amber-100 text-amber-700" },
  absent:   { label: "A", bg: "bg-red-100 text-red-700" },
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
    return <div className="p-8"><div className="h-32 bg-white rounded-xl border border-gray-100 animate-pulse" /></div>;
  }

  if (shiftTemplates.length === 0) {
    return (
      <div className="p-8 text-center text-gray-400 text-sm py-16">
        No shift templates configured for this account.
      </div>
    );
  }

  const activeTemplate = shiftTemplates[selectedIndex];

  return (
    <div className="p-8">
      {/* View toggle */}
      <div className="flex rounded-xl overflow-hidden border border-gray-200 w-fit mb-6">
        {(["daily", "summary"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`px-6 py-2.5 text-sm font-semibold cursor-pointer transition-colors ${
              view === v ? "bg-[#2166AC] text-white" : "bg-white text-gray-600 hover:bg-gray-50"
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
            <button onClick={() => changeDate(-1)} className="text-2xl text-[#2166AC] cursor-pointer hover:opacity-70">‹</button>
            <span className="text-sm font-semibold text-gray-700 min-w-[200px] text-center">{formatDate(selectedDate)}</span>
            <button onClick={() => changeDate(1)} className="text-2xl text-[#2166AC] cursor-pointer hover:opacity-70">›</button>
          </div>

          {/* Shift tabs */}
          <div className="flex rounded-lg border border-gray-200 overflow-hidden mb-2 w-fit">
            {shiftTemplates.map((t, i) => (
              <button
                key={t.id}
                onClick={() => selectShift(i)}
                className={`px-4 py-2 text-sm font-semibold cursor-pointer transition-colors ${
                  i === selectedIndex ? "bg-[#2166AC] text-white" : "bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                {t.name}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-400 mb-6 text-center">
            {activeTemplate?.startTime} – {activeTemplate?.endTime}
          </p>

          {loadingAttendance ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <div key={i} className="h-20 bg-white rounded-xl border border-gray-100 animate-pulse" />)}
            </div>
          ) : attendance.length === 0 ? (
            <div className="text-center text-gray-400 text-sm py-12">No employees in this account yet.</div>
          ) : (
            <div className="space-y-3">
              {attendance.map((row) => (
                <div key={row.employee.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="font-semibold text-gray-800">{row.employee.name}</p>
                      {row.employee.position && <p className="text-xs text-gray-400">{row.employee.position}</p>}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => mark(row.employee.id, true)}
                        disabled={saving === row.employee.id}
                        className={`px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer transition-colors ${
                          row.isPresent === true ? "bg-green-500 text-white" : "border border-gray-200 text-gray-600 hover:border-green-300"
                        }`}
                      >
                        Present
                      </button>
                      <button
                        onClick={() => mark(row.employee.id, false)}
                        disabled={saving === row.employee.id}
                        className={`px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer transition-colors ${
                          row.isPresent === false ? "bg-red-500 text-white" : "border border-gray-200 text-gray-600 hover:border-red-300"
                        }`}
                      >
                        Absent
                      </button>
                    </div>
                  </div>
                  {row.isPresent === true && (
                    <div className="mt-3 pt-3 border-t border-gray-100">
                      <label className="flex items-center gap-2 cursor-pointer text-xs text-gray-500">
                        <div
                          onClick={() => toggleReliever(row.employee.id, !row.isReliever)}
                          className={`w-4 h-4 rounded border-2 flex items-center justify-center cursor-pointer ${
                            row.isReliever ? "bg-amber-500 border-amber-500" : "border-gray-300"
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
                  cutoff === c ? "bg-[#2166AC] text-white border-[#2166AC]" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
                }`}
              >
                {c === "first" ? "1–15" : `16–${lastDayOfMonth(summaryMonth)}`}
              </button>
            ))}
          </div>

          {/* Month navigation */}
          <div className="flex items-center justify-center gap-4 mb-6">
            <button onClick={() => setSummaryMonth((m) => addMonths(m, -1))} className="text-2xl text-[#2166AC] cursor-pointer hover:opacity-70">‹</button>
            <span className="text-sm font-semibold text-gray-700 min-w-[160px] text-center">{formatMonth(summaryMonth)}</span>
            <button
              onClick={() => setSummaryMonth((m) => addMonths(m, 1))}
              disabled={summaryMonth.getFullYear() === new Date().getFullYear() && summaryMonth.getMonth() === new Date().getMonth()}
              className="text-2xl text-[#2166AC] cursor-pointer hover:opacity-70 disabled:text-gray-300"
            >
              ›
            </button>
          </div>

          {loadingGrid ? (
            <div className="h-48 bg-white rounded-xl border border-gray-100 animate-pulse" />
          ) : !grid || grid.rows.length === 0 ? (
            <div className="text-center text-gray-400 text-sm py-12">No employees in this account yet.</div>
          ) : (
            <div>
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-x-auto">
                <table className="text-xs">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="px-3 py-2 text-left font-semibold text-gray-500 sticky left-0 bg-gray-50 min-w-[140px]">Employee</th>
                      {grid.dates.map((d) => (
                        <th key={d} className="px-1 py-2 text-center font-semibold text-gray-400 w-8">{dayNum(d)}</th>
                      ))}
                      <th className="px-3 py-2 text-center font-semibold text-gray-500 min-w-[56px]">P / A</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {grid.rows.map((row) => (
                      <tr key={row.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2 sticky left-0 bg-white">
                          <p className="font-semibold text-gray-800 text-xs truncate max-w-[130px]">{row.name}</p>
                          {row.position && <p className="text-[10px] text-gray-400 truncate max-w-[130px]">{row.position}</p>}
                        </td>
                        {grid.dates.map((d) => {
                          const status = row.days[d];
                          const cfg = status ? CELL_CONFIG[status] : null;
                          return (
                            <td key={d} className={`w-8 py-2 text-center font-bold ${cfg ? cfg.bg : "text-gray-200"}`}>
                              {cfg ? cfg.label : "·"}
                            </td>
                          );
                        })}
                        <td className="px-3 py-2 text-center">
                          <span className="text-green-600 font-bold">{row.present}</span>
                          <span className="text-gray-300"> / </span>
                          <span className="text-red-500 font-bold">{row.absent}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* Legend */}
              <div className="flex gap-4 mt-3 text-xs text-gray-500">
                <div className="flex items-center gap-1"><span className="w-5 h-5 rounded bg-green-100 text-green-700 flex items-center justify-center font-bold">P</span> Present</div>
                <div className="flex items-center gap-1"><span className="w-5 h-5 rounded bg-amber-100 text-amber-700 flex items-center justify-center font-bold">R</span> Covering</div>
                <div className="flex items-center gap-1"><span className="w-5 h-5 rounded bg-red-100 text-red-700 flex items-center justify-center font-bold">A</span> Absent</div>
                <div className="flex items-center gap-1"><span className="w-5 h-5 rounded border border-gray-200 flex items-center justify-center text-gray-300">·</span> No shift</div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
