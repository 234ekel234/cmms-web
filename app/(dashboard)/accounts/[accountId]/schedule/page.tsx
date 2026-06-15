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

type Employee = {
  id: string;
  name: string;
  position: string | null;
  type?: "PERMANENT" | "RELIEVER";
};

type ScheduleEntry = {
  id: string;
  shiftTemplateId: string;
  employeeId: string;
  employee: Employee;
  date: string;
};

type RecurringEntry = {
  id: string;
  shiftTemplateId: string;
  employeeId: string;
  weekday: number;
  employee: Employee;
};

type AvailabilityEntry = {
  id: string;
  name: string;
  position: string | null;
  status: "AVAILABLE" | "OCCUPIED" | "BUSY" | "ABSENT";
  workOrder: { id: string; title: string; estimatedMinutes: number | null; actualSeconds: number; timerStartedAt: string | null } | null;
};

const AVAIL_CONFIG = {
  AVAILABLE: { label: "Available", cls: "bg-green-50 text-green-700", dot: "bg-green-500" },
  OCCUPIED:  { label: "Occupied",  cls: "bg-orange-50 text-orange-700", dot: "bg-orange-500" },
  BUSY:      { label: "Busy",      cls: "bg-amber-50 text-amber-700", dot: "bg-amber-500" },
  ABSENT:    { label: "Absent",    cls: "bg-red-50 text-red-700", dot: "bg-red-500" },
};

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function toDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function formatWeekRange(start: Date): string {
  const end = addDays(start, 6);
  const s = start.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const e = end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return `${s} – ${e}`;
}

function getIsoWeekday(date: Date): number {
  const d = date.getDay();
  return d === 0 ? 7 : d;
}

export default function SchedulePage() {
  const params = useParams();
  const accountId = params.accountId as string;
  const [shiftTemplates, setShiftTemplates] = useState<ShiftTemplate[]>([]);
  const [weekStart, setWeekStart] = useState<Date>(() => getMonday(new Date()));
  const [schedules, setSchedules] = useState<ScheduleEntry[]>([]);
  const [recurring, setRecurring] = useState<RecurringEntry[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [availability, setAvailability] = useState<AvailabilityEntry[]>([]);
  const [availLoading, setAvailLoading] = useState(true);
  const [modalSlot, setModalSlot] = useState<{ template: ShiftTemplate; date: Date } | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  const [togglingRecurring, setTogglingRecurring] = useState<string | null>(null);
  const [copying, setCopying] = useState(false);
  const [templatesLoaded, setTemplatesLoaded] = useState(false);

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const todayStr = toDateString(new Date());

  useEffect(() => {
    api.get(`/accounts/${accountId}/shift-templates`).then((r) => {
      setShiftTemplates(r.data);
      setTemplatesLoaded(true);
    }).catch(() => setTemplatesLoaded(true));
    api.get(`/accounts/${accountId}/employees`).then((r) => setEmployees(r.data)).catch(() => {});
    fetchAvailability();
  }, [accountId]);

  useEffect(() => {
    if (templatesLoaded) fetchData(weekStart);
  }, [weekStart, templatesLoaded]);

  async function fetchData(start: Date) {
    setLoading(true);
    const startDate = toDateString(start);
    const endDate = toDateString(addDays(start, 6));
    try {
      const [schedRes, recRes] = await Promise.all([
        api.get(`/accounts/${accountId}/schedules?startDate=${startDate}&endDate=${endDate}`),
        api.get(`/accounts/${accountId}/recurring-schedules`).catch(() => ({ data: [] })),
      ]);
      setSchedules(schedRes.data);
      setRecurring(recRes.data);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }

  async function fetchAvailability() {
    setAvailLoading(true);
    try {
      const res = await api.get(`/accounts/${accountId}/availability?date=${todayStr}`);
      setAvailability(res.data);
    } catch {
      // silent
    } finally {
      setAvailLoading(false);
    }
  }

  function getSlotEntries(templateId: string, date: Date): ScheduleEntry[] {
    const ds = toDateString(date);
    return schedules.filter((s) => s.shiftTemplateId === templateId && s.date === ds);
  }

  function findEntry(templateId: string, date: Date, employeeId: string): ScheduleEntry | undefined {
    return getSlotEntries(templateId, date).find((s) => s.employeeId === employeeId);
  }

  async function toggleEmployee(emp: Employee) {
    if (!modalSlot || toggling) return;
    const { template, date } = modalSlot;
    const existing = findEntry(template.id, date, emp.id);
    setToggling(emp.id);
    try {
      if (existing) {
        await api.delete(`/schedules/${existing.id}`);
        setSchedules((prev) => prev.filter((s) => s.id !== existing.id));
      } else {
        const res = await api.post(`/accounts/${accountId}/schedules`, {
          shiftTemplateId: template.id,
          employeeId: emp.id,
          date: toDateString(date),
        });
        setSchedules((prev) => [...prev, res.data]);
      }
    } catch {
      // silent
    } finally {
      setToggling(null);
    }
  }

  async function toggleRecurring(emp: Employee, templateId: string, weekday: number) {
    if (togglingRecurring) return;
    setTogglingRecurring(`${templateId}-${emp.id}-${weekday}`);
    const existing = recurring.find((r) => r.shiftTemplateId === templateId && r.employeeId === emp.id && r.weekday === weekday);
    try {
      if (existing) {
        await api.delete(`/recurring-schedules/${existing.id}`);
        setRecurring((prev) => prev.filter((r) => r.id !== existing.id));
      } else {
        const res = await api.post(`/accounts/${accountId}/recurring-schedules`, {
          shiftTemplateId: templateId, employeeId: emp.id, weekday,
        });
        setRecurring((prev) => [...prev, res.data]);
      }
    } catch {
      // silent
    } finally {
      setTogglingRecurring(null);
    }
  }

  async function copyToNextWeek() {
    if (copying) return;
    setCopying(true);
    try {
      await api.post(`/accounts/${accountId}/schedules/copy`, {
        fromDate: toDateString(weekStart),
        toDate: toDateString(addDays(weekStart, 7)),
      });
      setWeekStart(addDays(weekStart, 7));
    } catch {
      // silent
    } finally {
      setCopying(false);
    }
  }

  const modalEntries = modalSlot ? getSlotEntries(modalSlot.template.id, modalSlot.date) : [];
  const modalWeekday = modalSlot ? getIsoWeekday(modalSlot.date) : 1;
  const WEEKDAY_NAMES = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <div className="p-8">
      {/* Today's Availability */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm mb-6">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700">Today&apos;s Availability</h3>
          <button onClick={fetchAvailability} className="text-xs text-[#2166AC] hover:underline cursor-pointer">Refresh</button>
        </div>
        {availLoading ? (
          <div className="p-6 space-y-2">
            {[1, 2, 3].map((i) => <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />)}
          </div>
        ) : availability.length === 0 ? (
          <p className="px-6 py-4 text-sm text-gray-400">No employees in this account yet.</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {availability.map((emp) => {
              const cfg = AVAIL_CONFIG[emp.status];
              return (
                <div key={emp.id} className="px-6 py-3 flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${cfg.dot}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800">{emp.name}</p>
                    {emp.position && <p className="text-xs text-gray-400">{emp.position}</p>}
                    {(emp.status === "OCCUPIED" || emp.status === "BUSY") && emp.workOrder && (
                      <p className="text-xs text-amber-700 mt-0.5 truncate">› {emp.workOrder.title}</p>
                    )}
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold shrink-0 ${cfg.cls}`}>
                    {cfg.label}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Week navigation */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm mb-4">
        <div className="px-6 py-3 border-b border-gray-100 flex items-center gap-4">
          <button onClick={() => setWeekStart((w) => addDays(w, -7))} className="text-2xl text-[#2166AC] leading-none cursor-pointer hover:opacity-70">‹</button>
          <span className="text-sm font-semibold text-gray-700 flex-1 text-center">{formatWeekRange(weekStart)}</span>
          <button onClick={() => setWeekStart((w) => addDays(w, 7))} className="text-2xl text-[#2166AC] leading-none cursor-pointer hover:opacity-70">›</button>
          <button
            onClick={copyToNextWeek}
            disabled={copying}
            className="text-xs font-semibold text-[#2166AC] border border-[#2166AC] rounded-lg px-3 py-1.5 hover:bg-blue-50 cursor-pointer disabled:opacity-50"
          >
            {copying ? "Copying..." : "Copy →"}
          </button>
        </div>

        {shiftTemplates.length === 0 ? (
          <div className="px-6 py-8 text-center text-gray-400 text-sm">No shift templates configured.</div>
        ) : loading ? (
          <div className="p-6 space-y-3">
            {[1, 2].map((i) => <div key={i} className="h-16 bg-gray-100 rounded animate-pulse" />)}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="px-4 py-3 text-left text-xs text-gray-400 font-semibold w-32">Shift</th>
                  {days.map((day, i) => {
                    const ds = toDateString(day);
                    const isToday = ds === todayStr;
                    return (
                      <th key={ds} className={`px-3 py-3 text-center text-xs font-semibold ${isToday ? "text-[#2166AC]" : "text-gray-400"}`}>
                        <div>{WEEKDAYS[i]}</div>
                        <div className={`text-sm font-bold mt-0.5 ${isToday ? "text-[#2166AC]" : "text-gray-700"}`}>
                          {day.getMonth() + 1}/{day.getDate()}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {shiftTemplates.map((template) => (
                  <tr key={template.id} className="border-b border-gray-50">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-gray-800 text-xs">{template.name}</p>
                      <p className="text-xs text-gray-400">{template.startTime}–{template.endTime}</p>
                    </td>
                    {days.map((day) => {
                      const ds = toDateString(day);
                      const entries = getSlotEntries(template.id, day);
                      const weekday = getIsoWeekday(day);
                      const recurringIds = recurring.filter((r) => r.shiftTemplateId === template.id && r.weekday === weekday).map((r) => r.employeeId);
                      const specificIds = new Set(entries.map((e) => e.employeeId));
                      const totalCount = new Set([...specificIds, ...recurringIds]).size;
                      const hasRecurring = recurringIds.length > 0;
                      return (
                        <td key={ds} className="px-3 py-3 text-center">
                          <button
                            onClick={() => setModalSlot({ template, date: day })}
                            className={`w-full rounded-lg py-2 text-xs font-semibold cursor-pointer transition-colors ${
                              totalCount > 0
                                ? "bg-green-50 text-green-700 hover:bg-green-100"
                                : "bg-gray-50 text-gray-400 hover:bg-gray-100"
                            }`}
                          >
                            {totalCount > 0 ? (
                              <div>
                                <div className="text-base font-bold text-green-700">{totalCount}</div>
                                <div className="text-xs">person{totalCount !== 1 ? "s" : ""}</div>
                                {hasRecurring && <div className="text-[10px] text-[#2166AC]">↺</div>}
                              </div>
                            ) : "+"}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Slot modal */}
      {modalSlot && (
        <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-50" onClick={() => setModalSlot(null)}>
          <div className="bg-white rounded-t-2xl w-full max-w-lg p-6 pb-8 max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4">
              <h2 className="text-lg font-bold text-gray-900">{modalSlot.template.name}</h2>
              <p className="text-sm text-gray-500 mt-0.5">
                {modalSlot.date.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
                {" · "}{modalSlot.template.startTime}–{modalSlot.template.endTime}
              </p>
            </div>

            <p className="text-xs font-semibold text-[#2166AC] mb-3">
              {modalEntries.length === 0 ? "No one assigned" : `${modalEntries.length} assigned`}
            </p>

            <div className="flex-1 overflow-y-auto mb-4">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">One-time Assignment</p>
              <div className="space-y-2 mb-4">
                {employees.length === 0 ? (
                  <p className="text-sm text-gray-400">No employees in this account.</p>
                ) : employees.map((emp) => {
                  const scheduled = !!findEntry(modalSlot.template.id, modalSlot.date, emp.id);
                  const isToggling = toggling === emp.id;
                  return (
                    <button
                      key={emp.id}
                      onClick={() => toggleEmployee(emp)}
                      disabled={!!toggling}
                      className={`w-full flex items-center justify-between p-3 rounded-xl border text-left cursor-pointer transition-colors ${
                        scheduled ? "border-green-300 bg-green-50" : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <div>
                        <p className="text-sm font-semibold text-gray-800">{emp.name}</p>
                        {emp.position && <p className="text-xs text-gray-400">{emp.position}</p>}
                      </div>
                      {isToggling ? (
                        <span className="text-xs text-gray-400">...</span>
                      ) : (
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${scheduled ? "bg-green-500 border-green-500" : "border-gray-300"}`}>
                          {scheduled && <span className="text-white text-xs font-bold">✓</span>}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Recurring section */}
              <div className="border-t border-gray-100 pt-4">
                <p className="text-xs font-bold text-[#2166AC] mb-1">
                  Recurring every {WEEKDAY_NAMES[modalWeekday]}
                </p>
                <p className="text-xs text-gray-400 mb-3">Auto-added to this slot every week.</p>
                <div className="space-y-2">
                  {employees.map((emp) => {
                    const isRecurring = recurring.some(
                      (r) => r.shiftTemplateId === modalSlot.template.id && r.employeeId === emp.id && r.weekday === modalWeekday
                    );
                    const key = `${modalSlot.template.id}-${emp.id}-${modalWeekday}`;
                    const isToggling = togglingRecurring === key;
                    return (
                      <button
                        key={emp.id}
                        onClick={() => toggleRecurring(emp, modalSlot.template.id, modalWeekday)}
                        disabled={!!togglingRecurring}
                        className={`w-full flex items-center justify-between p-3 rounded-xl border text-left cursor-pointer transition-colors ${
                          isRecurring ? "border-[#2166AC] bg-blue-50" : "border-gray-200 hover:border-gray-300"
                        }`}
                      >
                        <div>
                          <p className="text-sm font-semibold text-gray-800">{emp.name}</p>
                          {emp.position && <p className="text-xs text-gray-400">{emp.position}</p>}
                        </div>
                        {isToggling ? (
                          <span className="text-xs text-gray-400">...</span>
                        ) : (
                          <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${isRecurring ? "bg-[#2166AC] border-[#2166AC]" : "border-gray-300"}`}>
                            {isRecurring && <span className="text-white text-xs">↺</span>}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <button
              onClick={() => setModalSlot(null)}
              className="w-full bg-[#2166AC] text-white rounded-xl py-3 font-semibold text-sm hover:bg-[#1a5490] cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
