"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import api from "@/lib/api";
import EmptyState from "@/components/EmptyState";

type Training = { id: string; title: string; category: string | null; durationHours: number | null };
type Assignment = {
  trainingId: string;
  training: Training;
  status: "ASSIGNED" | "COMPLETED";
  assignedAt: string;
  completedAt: string | null;
};
type Employee = { id: string; name: string; position: string | null; trainingAssignments: Assignment[] };

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function TrainingPage() {
  const params = useParams();
  const accountId = params.accountId as string;

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [allTrainings, setAllTrainings] = useState<Training[]>([]);
  const [loading, setLoading] = useState(true);

  // Assign modal
  const [assignTarget, setAssignTarget] = useState<Employee | null>(null);
  const [assignSearch, setAssignSearch] = useState("");
  const [assigning, setAssigning] = useState(false);

  // Complete modal
  const [completeTarget, setCompleteTarget] = useState<{ employee: Employee; trainingId: string; title: string } | null>(null);
  const [completing, setCompleting] = useState(false);

  const [search, setSearch] = useState("");

  useEffect(() => { load(); }, [accountId]);

  async function load() {
    setLoading(true);
    try {
      const [empRes, trainRes] = await Promise.all([
        api.get(`/accounts/${accountId}/trainings`),
        api.get("/trainings"),
      ]);
      setEmployees(empRes.data);
      setAllTrainings(trainRes.data);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }

  async function handleAssign(employeeId: string, trainingId: string) {
    setAssigning(true);
    try {
      const res = await api.post(`/employees/${employeeId}/trainings`, { trainingId });
      setEmployees((prev) =>
        prev.map((e) =>
          e.id === employeeId
            ? { ...e, trainingAssignments: [res.data, ...e.trainingAssignments] }
            : e
        )
      );
      setAssignTarget(null);
      setAssignSearch("");
    } catch {
      // silent
    } finally {
      setAssigning(false);
    }
  }

  async function handleComplete(employee: Employee, trainingId: string) {
    setCompleting(true);
    try {
      const res = await api.patch(`/employees/${employee.id}/trainings/${trainingId}/complete`, {});
      setEmployees((prev) =>
        prev.map((e) =>
          e.id === employee.id
            ? {
                ...e,
                trainingAssignments: e.trainingAssignments.map((a) =>
                  a.trainingId === trainingId ? res.data : a
                ),
              }
            : e
        )
      );
      setCompleteTarget(null);
    } catch {
      // silent
    } finally {
      setCompleting(false);
    }
  }

  const filteredEmployees = employees.filter((e) =>
    e.name.toLowerCase().includes(search.toLowerCase())
  );

  const totalAssigned = employees.reduce((sum, e) => sum + e.trainingAssignments.length, 0);
  const totalCompleted = employees.reduce(
    (sum, e) => sum + e.trainingAssignments.filter((a) => a.status === "COMPLETED").length,
    0
  );

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold text-[var(--tu-text-heading)]">Training</h2>
          {!loading && (
            <p className="text-xs text-[var(--tu-text-subtle)] mt-0.5">
              {totalCompleted}/{totalAssigned} completed across {employees.length} employees
            </p>
          )}
        </div>
        <input
          type="text"
          placeholder="Search employees…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border border-[var(--tu-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--tu-text-brand)]/30 w-52"
        />
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-24 bg-[var(--tu-bg-surface)] rounded-xl border border-[var(--tu-border)] animate-pulse" />)}
        </div>
      ) : filteredEmployees.length === 0 ? (
        <div className="tu-card">
          <EmptyState
            icon="employee"
            title="No employees found"
            hint="Assign employees to this account before tracking their training."
          />
        </div>
      ) : (
        <div className="space-y-4">
          {filteredEmployees.map((emp) => {
            const completed = emp.trainingAssignments.filter((a) => a.status === "COMPLETED").length;
            const total = emp.trainingAssignments.length;

            return (
              <div key={emp.id} className="bg-[var(--tu-bg-surface)] rounded-xl border border-[var(--tu-border)] shadow-sm overflow-hidden">
                {/* Employee header */}
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--tu-border)]">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-[var(--tu-text-brand)]/10 flex items-center justify-center shrink-0">
                      <span className="text-[var(--tu-text-brand)] text-sm font-bold">{emp.name[0].toUpperCase()}</span>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[var(--tu-text-heading)]">{emp.name}</p>
                      {emp.position && <p className="text-xs text-[var(--tu-text-subtle)]">{emp.position}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {total > 0 && (
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        completed === total ? "bg-[var(--tu-soft-success)] text-[var(--tu-on-success)]" : "bg-[var(--tu-bg-secondary-strong)] text-[var(--tu-text-subtle)]"
                      }`}>
                        {completed}/{total} done
                      </span>
                    )}
                    <button
                      onClick={() => { setAssignTarget(emp); setAssignSearch(""); }}
                      className="text-xs font-semibold text-[var(--tu-text-brand)] border border-[var(--tu-text-brand)] px-3 py-1.5 rounded-lg hover:bg-[var(--tu-soft-brand)] transition-colors cursor-pointer"
                    >
                      + Assign
                    </button>
                  </div>
                </div>

                {/* Training list */}
                {emp.trainingAssignments.length === 0 ? (
                  <p className="text-xs text-[var(--tu-text-subtle)] px-5 py-3 italic">No trainings assigned.</p>
                ) : (
                  <div className="divide-y divide-[var(--tu-border)]">
                    {emp.trainingAssignments.map((a) => (
                      <div key={a.trainingId} className="flex items-center justify-between px-5 py-3 gap-4">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-[var(--tu-text-heading)] truncate">{a.training.title}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            {a.training.category && (
                              <span className="text-xs text-[var(--tu-text-subtle)]">{a.training.category}</span>
                            )}
                            {a.training.durationHours && (
                              <span className="text-xs text-[var(--tu-text-subtle)]">{a.training.durationHours}h</span>
                            )}
                            <span className="text-xs text-[var(--tu-text-subtle)]">Assigned {fmtDate(a.assignedAt)}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          {a.status === "COMPLETED" ? (
                            <div className="text-right">
                              <span className="text-xs font-semibold bg-[var(--tu-soft-success)] text-[var(--tu-on-success)] px-2 py-0.5 rounded-full">
                                Completed
                              </span>
                              {a.completedAt && (
                                <p className="text-xs text-[var(--tu-text-subtle)] mt-0.5">{fmtDate(a.completedAt)}</p>
                              )}
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold bg-[var(--tu-soft-warning)] text-[var(--tu-on-warning)] px-2 py-0.5 rounded-full">
                                Assigned
                              </span>
                              <button
                                onClick={() => setCompleteTarget({ employee: emp, trainingId: a.trainingId, title: a.training.title })}
                                className="text-xs text-[var(--tu-text-subtle)] hover:text-[var(--tu-on-success)] font-medium transition-colors cursor-pointer"
                              >
                                Mark done
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Assign modal */}
      {assignTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--tu-bg-surface)] rounded-2xl shadow-2xl w-full max-w-md">
            <div className="px-6 pt-6 pb-4 border-b border-[var(--tu-border)]">
              <h3 className="text-base font-bold text-[var(--tu-text-heading)]">Assign Training</h3>
              <p className="text-sm text-[var(--tu-text-subtle)] mt-0.5">to {assignTarget.name}</p>
            </div>
            <div className="p-4">
              <input
                type="text"
                placeholder="Search trainings…"
                value={assignSearch}
                onChange={(e) => setAssignSearch(e.target.value)}
                autoFocus
                className="w-full border border-[var(--tu-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--tu-text-brand)]/30 mb-3"
              />
              <div className="space-y-1 max-h-72 overflow-y-auto">
                {allTrainings
                  .filter((t) => {
                    const alreadyAssigned = assignTarget.trainingAssignments.some((a) => a.trainingId === t.id);
                    const matchSearch = `${t.title} ${t.category ?? ""}`.toLowerCase().includes(assignSearch.toLowerCase());
                    return !alreadyAssigned && matchSearch;
                  })
                  .map((t) => (
                    <button
                      key={t.id}
                      onClick={() => !assigning && handleAssign(assignTarget.id, t.id)}
                      disabled={assigning}
                      className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-[var(--tu-soft-brand)] transition-colors cursor-pointer disabled:opacity-50"
                    >
                      <p className="text-sm font-medium text-[var(--tu-text-heading)]">{t.title}</p>
                      <p className="text-xs text-[var(--tu-text-subtle)] mt-0.5">
                        {t.category ?? "Uncategorized"}{t.durationHours ? ` · ${t.durationHours}h` : ""}
                      </p>
                    </button>
                  ))}
                {allTrainings.filter((t) => {
                  const alreadyAssigned = assignTarget.trainingAssignments.some((a) => a.trainingId === t.id);
                  const matchSearch = `${t.title} ${t.category ?? ""}`.toLowerCase().includes(assignSearch.toLowerCase());
                  return !alreadyAssigned && matchSearch;
                }).length === 0 && (
                  <p className="text-sm text-[var(--tu-text-subtle)] text-center py-6">
                    {assignSearch ? "No matches found." : "All trainings already assigned."}
                  </p>
                )}
              </div>
            </div>
            <div className="px-6 pb-6">
              <button
                onClick={() => { setAssignTarget(null); setAssignSearch(""); }}
                className="w-full border border-[var(--tu-border)] text-[var(--tu-text-body)] py-2.5 rounded-lg text-sm font-semibold hover:bg-[var(--tu-bg-secondary)] transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mark complete modal */}
      {completeTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--tu-bg-surface)] rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <h3 className="text-base font-bold text-[var(--tu-text-heading)] mb-2">Mark Training Complete</h3>
            <p className="text-sm text-[var(--tu-text-subtle)] mb-6">
              Confirm that <strong>{completeTarget.employee.name}</strong> has completed{" "}
              <strong>{completeTarget.title}</strong>?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setCompleteTarget(null)}
                className="flex-1 border border-[var(--tu-border)] text-[var(--tu-text-body)] py-2.5 rounded-lg text-sm font-semibold hover:bg-[var(--tu-bg-secondary)] transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => handleComplete(completeTarget.employee, completeTarget.trainingId)}
                disabled={completing}
                className="flex-1 bg-[var(--tu-status-completed)] text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-[var(--tu-status-completed)] disabled:opacity-50 transition-colors cursor-pointer"
              >
                {completing ? "Saving…" : "Mark Complete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
