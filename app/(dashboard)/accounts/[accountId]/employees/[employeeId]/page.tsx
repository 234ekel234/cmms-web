"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

type EmployeeStatus = "REGULAR" | "PROBATIONARY";
type EmployeeCategory = "ELECTRICAL" | "MECHANICAL" | "PLUMBING" | "CIVIL" | "GENERAL";

type Employee = {
  id: string;
  name: string;
  position: string | null;
  status: EmployeeStatus;
  categories: EmployeeCategory[];
  openWorkOrders?: number;
  attendance?: { present: number; absent: number; total: number; rate: number | null } | null;
  training?: { total: number; completed: number; rate: number | null } | null;
};

type Training = { id: string; title: string; category: string | null; durationHours: number | null };
type TrainingAssignment = {
  trainingId: string;
  training: Training;
  status: "ASSIGNED" | "COMPLETED";
  assignedAt: string;
  completedAt: string | null;
};

const CATEGORIES: { value: EmployeeCategory; label: string }[] = [
  { value: "ELECTRICAL", label: "Electrical" },
  { value: "MECHANICAL", label: "Mechanical (Aircon)" },
  { value: "PLUMBING",   label: "Plumbing" },
  { value: "CIVIL",      label: "Civil" },
  { value: "GENERAL",    label: "General / Other" },
];

const STATUS_LABEL: Record<EmployeeStatus, string> = {
  REGULAR:      "Regular",
  PROBATIONARY: "Probationary",
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function EmployeeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const accountId = params.accountId as string;
  const employeeId = params.employeeId as string;

  const canEdit = user?.role === "GENERAL_MANAGER" || user?.role === "MANAGER" || user?.role === "SUPERVISOR";

  const [employee, setEmployee] = useState<Employee | null>(null);
  const [trainings, setTrainings] = useState<TrainingAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Edit form state
  const [name, setName] = useState("");
  const [position, setPosition] = useState("");
  const [status, setStatus] = useState<EmployeeStatus>("REGULAR");
  const [categories, setCategories] = useState<EmployeeCategory[]>([]);

  useEffect(() => { fetchData(); }, [employeeId]);

  async function fetchData() {
    setLoading(true);
    try {
      const [empRes, trainRes] = await Promise.all([
        api.get(`/accounts/${accountId}/employees`),
        api.get(`/employees/${employeeId}/trainings`),
      ]);
      const found: Employee | undefined = empRes.data.find((e: Employee) => e.id === employeeId);
      if (!found) { router.push(`/accounts/${accountId}/employees`); return; }
      setEmployee(found);
      setName(found.name);
      setPosition(found.position ?? "");
      setStatus(found.status);
      setCategories(found.categories ?? []);
      setTrainings(trainRes.data);
    } catch {
      setError("Failed to load employee.");
    } finally {
      setLoading(false);
    }
  }

  function toggleCategory(cat: EmployeeCategory) {
    setCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  }

  async function handleSave() {
    if (!name.trim()) { setError("Name is required."); return; }
    setSaving(true); setError(null);
    try {
      const res = await api.put(`/employees/${employeeId}`, {
        name: name.trim(),
        position: position.trim() || null,
        status,
        categories,
      });
      setEmployee((prev) => prev ? { ...prev, ...res.data } : res.data);
      setEditing(false);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e?.response?.data?.error ?? "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  function cancelEdit() {
    if (!employee) return;
    setName(employee.name);
    setPosition(employee.position ?? "");
    setStatus(employee.status);
    setCategories(employee.categories ?? []);
    setEditing(false);
    setError(null);
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-[#2166AC] border-t-transparent" />
      </div>
    );
  }

  if (!employee) {
    return <div className="p-8 text-sm text-red-600">{error ?? "Employee not found."}</div>;
  }

  const completedTrainings = trainings.filter((t) => t.status === "COMPLETED").length;

  return (
    <div className="p-8 max-w-3xl space-y-5">
      {/* Back */}
      <Link
        href={`/accounts/${accountId}/employees`}
        className="text-sm text-[#2166AC] font-semibold hover:underline"
      >
        ← Employees
      </Link>

      {/* Profile card */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <div className="flex items-start justify-between gap-4 mb-5">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-[#2166AC]/10 flex items-center justify-center shrink-0">
              <span className="text-[#2166AC] text-lg font-bold">{employee.name[0].toUpperCase()}</span>
            </div>
            {!editing ? (
              <div>
                <h2 className="text-lg font-bold text-gray-900">{employee.name}</h2>
                {employee.position && <p className="text-sm text-gray-400">{employee.position}</p>}
              </div>
            ) : (
              <div className="space-y-2">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Full name"
                  className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-[#2166AC]/30"
                />
                <input
                  value={position}
                  onChange={(e) => setPosition(e.target.value)}
                  placeholder="Position / title"
                  className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-[#2166AC]/30"
                />
              </div>
            )}
          </div>
          {canEdit && (
            <div>
              {editing ? (
                <div className="flex gap-2">
                  <button onClick={cancelEdit} className="text-sm text-gray-500 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50 cursor-pointer">Cancel</button>
                  <button onClick={handleSave} disabled={saving} className="text-sm text-white bg-[#2166AC] px-3 py-1.5 rounded-lg hover:bg-[#1a5490] disabled:opacity-50 cursor-pointer">
                    {saving ? "Saving…" : "Save"}
                  </button>
                </div>
              ) : (
                <button onClick={() => setEditing(true)} className="text-sm text-[#2166AC] border border-[#2166AC] px-3 py-1.5 rounded-lg hover:bg-blue-50 cursor-pointer">
                  Edit
                </button>
              )}
            </div>
          )}
        </div>

        {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 mb-4">{error}</p>}

        <div className="grid grid-cols-2 gap-4">
          {/* Status */}
          <div>
            <p className="text-xs font-bold text-gray-400 mb-1.5">Status</p>
            {editing ? (
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as EmployeeStatus)}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-[#2166AC]/30"
              >
                <option value="REGULAR">Regular</option>
                <option value="PROBATIONARY">Probationary</option>
              </select>
            ) : (
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                employee.status === "REGULAR" ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"
              }`}>
                {STATUS_LABEL[employee.status]}
              </span>
            )}
          </div>

          {/* Categories */}
          <div>
            <p className="text-xs font-bold text-gray-400 mb-1.5">Categories</p>
            {editing ? (
              <div className="flex flex-wrap gap-1.5">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat.value}
                    onClick={() => toggleCategory(cat.value)}
                    className={`text-xs font-semibold px-2.5 py-1 rounded-full border transition-colors cursor-pointer ${
                      categories.includes(cat.value)
                        ? "bg-[#2166AC] text-white border-[#2166AC]"
                        : "bg-white text-gray-500 border-gray-200 hover:border-gray-400"
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {(employee.categories ?? []).length === 0 ? (
                  <span className="text-xs text-gray-400">—</span>
                ) : (
                  (employee.categories ?? []).map((cat) => (
                    <span key={cat} className="text-xs font-semibold bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full">
                      {CATEGORIES.find((c) => c.value === cat)?.label ?? cat}
                    </span>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        {/* Stats row */}
        {!editing && (
          <div className="grid grid-cols-3 gap-4 mt-5 pt-5 border-t border-gray-100">
            <div className="text-center">
              <p className="text-xl font-bold text-gray-900">{employee.openWorkOrders ?? 0}</p>
              <p className="text-xs text-gray-400 mt-0.5">Open WOs</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-bold text-gray-900">
                {employee.attendance?.rate != null ? `${employee.attendance.rate}%` : "—"}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">Attendance (this month)</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-bold text-gray-900">
                {employee.training?.rate != null ? `${employee.training.rate}%` : "—"}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">Training completion</p>
            </div>
          </div>
        )}
      </div>

      {/* Training */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
          <div>
            <p className="text-sm font-bold text-gray-900">Training</p>
            {trainings.length > 0 && (
              <p className="text-xs text-gray-400 mt-0.5">{completedTrainings}/{trainings.length} completed</p>
            )}
          </div>
          <Link
            href={`/accounts/${accountId}/training`}
            className="text-xs text-[#2166AC] font-semibold hover:underline"
          >
            Manage →
          </Link>
        </div>

        {trainings.length === 0 ? (
          <p className="text-sm text-gray-400 italic px-5 py-4">No trainings assigned.</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {trainings.map((a) => (
              <div key={a.trainingId} className="flex items-center justify-between px-5 py-3 gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{a.training.title}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {a.training.category ?? "Uncategorized"}
                    {a.training.durationHours ? ` · ${a.training.durationHours}h` : ""}
                    {" · "}Assigned {fmtDate(a.assignedAt)}
                  </p>
                </div>
                <div className="shrink-0">
                  {a.status === "COMPLETED" ? (
                    <div className="text-right">
                      <span className="text-xs font-semibold bg-green-50 text-green-700 px-2 py-0.5 rounded-full">Completed</span>
                      {a.completedAt && <p className="text-xs text-gray-400 mt-0.5">{fmtDate(a.completedAt)}</p>}
                    </div>
                  ) : (
                    <span className="text-xs font-semibold bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">Assigned</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick links */}
      <div className="flex gap-3">
        <Link
          href={`/accounts/${accountId}/work-orders`}
          className="flex-1 bg-white rounded-xl border border-gray-100 shadow-sm p-4 hover:shadow-md transition-shadow text-center"
        >
          <p className="text-sm font-semibold text-gray-800">Work Orders</p>
          <p className="text-xs text-gray-400 mt-0.5">View account work orders</p>
        </Link>
        <Link
          href={`/accounts/${accountId}/attendance`}
          className="flex-1 bg-white rounded-xl border border-gray-100 shadow-sm p-4 hover:shadow-md transition-shadow text-center"
        >
          <p className="text-sm font-semibold text-gray-800">Attendance</p>
          <p className="text-xs text-gray-400 mt-0.5">View account attendance log</p>
        </Link>
      </div>
    </div>
  );
}
