"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import api from "@/lib/api";

type Employee = {
  id: string;
  name: string;
  position: string | null;
  isReliever: boolean;
  openWorkOrders: number;
  occupied: boolean;
  attendance: { present: number; absent: number; total: number; rate: number | null } | null;
};

type GlobalEmployee = {
  id: string;
  name: string;
  position: string | null;
  isReliever: boolean;
};

function attColor(rate: number | null) {
  if (rate === null) return "text-gray-400";
  if (rate >= 90) return "text-green-600";
  if (rate >= 70) return "text-amber-600";
  return "text-red-600";
}

export default function EmployeesPage() {
  const params = useParams();
  const accountId = params.accountId as string;
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [showAssign, setShowAssign] = useState(false);
  const [registry, setRegistry] = useState<GlobalEmployee[]>([]);
  const [registryLoading, setRegistryLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [assigning, setAssigning] = useState(false);
  const [assignError, setAssignError] = useState("");
  const [unassigning, setUnassigning] = useState<string | null>(null);
  // Filters for the assigned-employee list (separate from the assign modal's search).
  const [listSearch, setListSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"ALL" | "REGULAR" | "RELIEVER">("ALL");
  const [availFilter, setAvailFilter] = useState<"ALL" | "AVAILABLE" | "OCCUPIED">("ALL");

  useEffect(() => { fetchEmployees(); }, [accountId]);

  async function fetchEmployees() {
    setLoading(true);
    setError(false);
    try {
      const res = await api.get(`/accounts/${accountId}/employees`);
      setEmployees(res.data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  async function openAssignModal() {
    setShowAssign(true);
    setSearch("");
    setSelectedIds([]);
    setAssignError("");
    setRegistryLoading(true);
    try {
      const res = await api.get("/employees");
      setRegistry(res.data);
    } catch {
      // silent
    } finally {
      setRegistryLoading(false);
    }
  }

  const assignedIds = new Set(employees.map((e) => e.id));
  const available = registry.filter(
    (e) =>
      !assignedIds.has(e.id) &&
      (!search.trim() ||
        e.name.toLowerCase().includes(search.toLowerCase()) ||
        e.position?.toLowerCase().includes(search.toLowerCase()))
  );

  function toggleSelect(id: string) {
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }

  async function assignSelected() {
    if (selectedIds.length === 0) { setShowAssign(false); return; }
    setAssigning(true);
    setAssignError("");
    try {
      const res = await api.post(`/accounts/${accountId}/employees`, { employeeIds: selectedIds });
      setEmployees((prev) => [...prev, ...res.data].sort((a, b) => a.name.localeCompare(b.name)));
      setShowAssign(false);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setAssignError(e?.response?.data?.error ?? "Failed to assign. Regular employees can only belong to one account.");
    } finally {
      setAssigning(false);
    }
  }

  const filtersActive = listSearch.trim() !== "" || typeFilter !== "ALL" || availFilter !== "ALL";
  function clearFilters() {
    setListSearch("");
    setTypeFilter("ALL");
    setAvailFilter("ALL");
  }

  const visible = employees.filter((e) => {
    const q = listSearch.trim().toLowerCase();
    const matchSearch = !q || e.name.toLowerCase().includes(q) || (e.position ?? "").toLowerCase().includes(q);
    const matchType = typeFilter === "ALL" || (typeFilter === "RELIEVER" ? e.isReliever : !e.isReliever);
    const matchAvail =
      availFilter === "ALL" || (availFilter === "OCCUPIED" ? e.occupied : !e.occupied);
    return matchSearch && matchType && matchAvail;
  });

  async function unassign(emp: Employee) {
    setUnassigning(emp.id);
    try {
      await api.delete(`/accounts/${accountId}/employees/${emp.id}`);
      setEmployees((prev) => prev.filter((e) => e.id !== emp.id));
    } catch {
      // silent
    } finally {
      setUnassigning(null);
    }
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-bold text-gray-900">Employees</h2>
        <button
          onClick={openAssignModal}
          className="bg-[#2166AC] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#1a5490] transition-colors cursor-pointer"
        >
          + Assign
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mb-6">
          Failed to load employees.
        </div>
      )}

      {/* Filter bar — only when there are assigned employees to filter */}
      {!loading && employees.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <input
            className="w-56 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2166AC]"
            placeholder="Search name or position…"
            value={listSearch}
            onChange={(e) => setListSearch(e.target.value)}
          />
          <div className="inline-flex gap-1" role="group" aria-label="Filter by type">
            {(["ALL", "REGULAR", "RELIEVER"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setTypeFilter(s)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors cursor-pointer ${
                  typeFilter === s ? "bg-[#2166AC] text-white border-[#2166AC]" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
                }`}
              >
                {s === "ALL" ? "All" : s === "REGULAR" ? "Regular" : "Reliever"}
              </button>
            ))}
          </div>
          <div className="inline-flex gap-1" role="group" aria-label="Filter by availability">
            {(["ALL", "AVAILABLE", "OCCUPIED"] as const).map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => setAvailFilter(a)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors cursor-pointer ${
                  availFilter === a ? "bg-[#2166AC] text-white border-[#2166AC]" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
                }`}
              >
                {a === "ALL" ? "Any" : a === "AVAILABLE" ? "Available" : "Occupied"}
              </button>
            ))}
          </div>
          <span className="ml-auto text-xs text-gray-400">
            {filtersActive ? `${visible.length} of ${employees.length}` : `${employees.length} employee${employees.length === 1 ? "" : "s"}`}
          </span>
          {filtersActive && (
            <button type="button" onClick={clearFilters} className="text-xs font-semibold text-[#2166AC] hover:underline cursor-pointer">
              Clear
            </button>
          )}
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-24 bg-white rounded-xl border border-gray-100 animate-pulse" />)}
        </div>
      ) : employees.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-12 text-center text-gray-400 text-sm">
          No employees assigned. Click &quot;+ Assign&quot; to add employees.
        </div>
      ) : visible.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-12 text-center text-gray-400 text-sm">
          No employees match these filters.
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((emp) => (
            <Link key={emp.id} href={`/accounts/${accountId}/employees/${emp.id}`} className="block bg-white rounded-xl border border-gray-100 shadow-sm p-4 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-gray-800">{emp.name}</p>
                    {emp.position && <p className="text-sm text-gray-500">{emp.position}</p>}
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${emp.isReliever ? "bg-indigo-50 text-indigo-700" : "bg-green-50 text-green-700"}`}>
                      {emp.isReliever ? "Reliever" : "Regular"}
                    </span>
                    {emp.occupied && (
                      <span className="rounded-full px-2 py-0.5 text-xs font-semibold bg-orange-50 text-orange-700">
                        Occupied
                      </span>
                    )}
                    {emp.openWorkOrders > 0 && (
                      <span className="rounded-full px-2 py-0.5 text-xs font-semibold bg-blue-50 text-blue-700">
                        {emp.openWorkOrders} active WO{emp.openWorkOrders > 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => unassign(emp)}
                  disabled={unassigning === emp.id}
                  className="text-xs text-red-500 border border-red-100 rounded-lg px-3 py-1.5 hover:bg-red-50 cursor-pointer disabled:opacity-50"
                >
                  {unassigning === emp.id ? "..." : "Remove"}
                </button>
              </div>
              {emp.attendance && emp.attendance.total > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-100 flex gap-4 text-xs">
                  <div>
                    <span className="text-gray-400">Attendance:</span>{" "}
                    <span className={`font-semibold ${attColor(emp.attendance.rate)}`}>
                      {emp.attendance.rate != null ? `${emp.attendance.rate}%` : "—"}
                    </span>
                    <span className="text-gray-400 ml-1">({emp.attendance.present}P / {emp.attendance.absent}A)</span>
                  </div>
                </div>
              )}
            </Link>
          ))}
        </div>
      )}

      {/* Assign modal */}
      {showAssign && (
        <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-50" onClick={() => setShowAssign(false)}>
          <div className="bg-white rounded-t-2xl w-full max-w-lg p-6 pb-8 max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-gray-900 mb-4">Assign Employee</h2>
            <input
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2166AC] mb-4"
              placeholder="Search registry..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
            <div className="flex-1 overflow-y-auto mb-4">
              {registryLoading ? (
                <div className="text-sm text-gray-400 text-center py-8">Loading...</div>
              ) : available.length === 0 ? (
                <div className="text-sm text-gray-400 text-center py-8">
                  {search ? "No matching employees." : "All employees are already assigned."}
                </div>
              ) : (
                <div className="space-y-2">
                  {available.map((emp) => {
                    const sel = selectedIds.includes(emp.id);
                    return (
                      <button
                        key={emp.id}
                        onClick={() => toggleSelect(emp.id)}
                        className={`w-full flex items-center justify-between p-3 rounded-xl border text-left cursor-pointer transition-colors ${
                          sel ? "border-[#2166AC] bg-blue-50" : "border-gray-200 hover:border-gray-300"
                        }`}
                      >
                        <div>
                          <p className="text-sm font-semibold text-gray-800">
                            {emp.name}
                            {emp.isReliever && (
                              <span className="ml-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold bg-indigo-50 text-indigo-700">
                                Reliever
                              </span>
                            )}
                          </p>
                          {emp.position && <p className="text-xs text-gray-400">{emp.position}</p>}
                        </div>
                        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${sel ? "bg-[#2166AC] border-[#2166AC]" : "border-gray-300"}`}>
                          {sel && <span className="text-white text-xs font-bold">✓</span>}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            {assignError && (
              <p className="text-red-600 text-xs mb-3 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{assignError}</p>
            )}
            <button
              onClick={assignSelected}
              disabled={assigning}
              className="w-full bg-[#2166AC] text-white rounded-xl py-3 font-semibold text-sm hover:bg-[#1a5490] disabled:opacity-50 cursor-pointer"
            >
              {assigning ? "Assigning..." : selectedIds.length > 0 ? `Assign ${selectedIds.length} Employee${selectedIds.length > 1 ? "s" : ""}` : "Done"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
