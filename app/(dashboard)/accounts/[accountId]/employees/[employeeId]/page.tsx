"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { canManage } from "@/lib/rbac";
import Breadcrumbs from "@/components/Breadcrumbs";
import EmptyState from "@/components/EmptyState";

type EmployeeCategory = "ELECTRICAL" | "MECHANICAL" | "PLUMBING" | "CIVIL" | "GENERAL";

type Employee = {
  id: string;
  name: string;
  position: string | null;
  isReliever: boolean;
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

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function EmployeeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const accountId = params.accountId as string;
  const employeeId = params.employeeId as string;

  // This page was already role-aware before clients could reach it; the rule now
  // comes from lib/rbac.ts so it stays in step with every other section.
  const canEdit = canManage(user?.role);

  const [employee, setEmployee] = useState<Employee | null>(null);
  const [trainings, setTrainings] = useState<TrainingAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Edit form state
  const [name, setName] = useState("");
  const [position, setPosition] = useState("");
  const [isReliever, setIsReliever] = useState(false);
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
      setIsReliever(found.isReliever);
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
        isReliever,
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
    setIsReliever(employee.isReliever);
    setCategories(employee.categories ?? []);
    setEditing(false);
    setError(null);
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-[var(--tu-text-brand)] border-t-transparent" />
      </div>
    );
  }

  if (!employee) {
    return <div className="p-8 text-sm text-[var(--tu-on-danger)]">{error ?? "Employee not found."}</div>;
  }

  const completedTrainings = trainings.filter((t) => t.status === "COMPLETED").length;

  return (
    <div className="p-8 max-w-3xl space-y-5">
      <Breadcrumbs
        items={[
          { label: "Employees", href: `/accounts/${accountId}/employees` },
          { label: employee.name },
        ]}
      />

      {/* Profile card */}
      <div className="bg-[var(--tu-bg-surface)] rounded-xl border border-[var(--tu-border)] shadow-sm p-6">
        <div className="flex items-start justify-between gap-4 mb-5">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-[var(--tu-text-brand)]/10 flex items-center justify-center shrink-0">
              <span className="text-[var(--tu-text-brand)] text-lg font-bold">{employee.name[0].toUpperCase()}</span>
            </div>
            {!editing ? (
              <div>
                <h2 className="text-lg font-bold text-[var(--tu-text-heading)]">{employee.name}</h2>
                {employee.position && <p className="text-sm text-[var(--tu-text-subtle)]">{employee.position}</p>}
              </div>
            ) : (
              <div className="space-y-2">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Full name"
                  className="border border-[var(--tu-border)] rounded-lg px-3 py-2 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-[var(--tu-text-brand)]/30"
                />
                <input
                  value={position}
                  onChange={(e) => setPosition(e.target.value)}
                  placeholder="Position / title"
                  className="border border-[var(--tu-border)] rounded-lg px-3 py-2 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-[var(--tu-text-brand)]/30"
                />
              </div>
            )}
          </div>
          {canEdit && (
            <div>
              {editing ? (
                <div className="flex gap-2">
                  <button onClick={cancelEdit} className="text-sm text-[var(--tu-text-subtle)] border border-[var(--tu-border)] px-3 py-1.5 rounded-lg hover:bg-[var(--tu-bg-secondary)] cursor-pointer">Cancel</button>
                  <button onClick={handleSave} disabled={saving} className="text-sm text-white bg-[var(--tu-text-brand)] px-3 py-1.5 rounded-lg hover:bg-[var(--tu-text-brand-strong)] disabled:opacity-50 cursor-pointer">
                    {saving ? "Saving…" : "Save"}
                  </button>
                </div>
              ) : (
                <button onClick={() => setEditing(true)} className="text-sm text-[var(--tu-text-brand)] border border-[var(--tu-text-brand)] px-3 py-1.5 rounded-lg hover:bg-[var(--tu-soft-brand)] cursor-pointer">
                  Edit
                </button>
              )}
            </div>
          )}
        </div>

        {error && <p className="text-sm text-[var(--tu-on-danger)] bg-[var(--tu-soft-danger)] rounded-lg px-3 py-2 mb-4">{error}</p>}

        <div className="grid grid-cols-2 gap-4">
          {/* Type */}
          <div>
            <p className="text-xs font-bold text-[var(--tu-text-subtle)] mb-1.5">Type</p>
            {editing ? (
              <select
                value={isReliever ? "RELIEVER" : "REGULAR"}
                onChange={(e) => setIsReliever(e.target.value === "RELIEVER")}
                className="border border-[var(--tu-border)] rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-[var(--tu-text-brand)]/30"
              >
                <option value="REGULAR">Regular — one account</option>
                <option value="RELIEVER">Reliever — multiple accounts</option>
              </select>
            ) : (
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                employee.isReliever ? "bg-[var(--tu-soft-info)] text-[var(--tu-on-info)]" : "bg-[var(--tu-soft-success)] text-[var(--tu-on-success)]"
              }`}>
                {employee.isReliever ? "Reliever" : "Regular"}
              </span>
            )}
          </div>

          {/* Categories */}
          <div>
            <p className="text-xs font-bold text-[var(--tu-text-subtle)] mb-1.5">Categories</p>
            {editing ? (
              <div className="flex flex-wrap gap-1.5">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat.value}
                    onClick={() => toggleCategory(cat.value)}
                    className={`text-xs font-semibold px-2.5 py-1 rounded-full border transition-colors cursor-pointer ${
                      categories.includes(cat.value)
                        ? "bg-[var(--tu-text-brand)] text-white border-[var(--tu-text-brand)]"
                        : "bg-[var(--tu-bg-surface)] text-[var(--tu-text-subtle)] border-[var(--tu-border)] hover:border-[var(--tu-border-strong)]"
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {(employee.categories ?? []).length === 0 ? (
                  <span className="text-xs text-[var(--tu-text-subtle)]">—</span>
                ) : (
                  (employee.categories ?? []).map((cat) => (
                    <span key={cat} className="text-xs font-semibold bg-[var(--tu-bg-secondary-strong)] text-[var(--tu-text-body)] px-2.5 py-1 rounded-full">
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
          <div className="grid grid-cols-3 gap-4 mt-5 pt-5 border-t border-[var(--tu-border)]">
            <div className="text-center">
              <p className="text-xl font-bold text-[var(--tu-text-heading)]">{employee.openWorkOrders ?? 0}</p>
              <p className="text-xs text-[var(--tu-text-subtle)] mt-0.5">Open WOs</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-bold text-[var(--tu-text-heading)]">
                {employee.attendance?.rate != null ? `${employee.attendance.rate}%` : "—"}
              </p>
              <p className="text-xs text-[var(--tu-text-subtle)] mt-0.5">Attendance (this month)</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-bold text-[var(--tu-text-heading)]">
                {employee.training?.rate != null ? `${employee.training.rate}%` : "—"}
              </p>
              <p className="text-xs text-[var(--tu-text-subtle)] mt-0.5">Training completion</p>
            </div>
          </div>
        )}
      </div>

      {/* Training */}
      <div className="bg-[var(--tu-bg-surface)] rounded-xl border border-[var(--tu-border)] shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--tu-border)]">
          <div>
            <p className="text-sm font-bold text-[var(--tu-text-heading)]">Training</p>
            {trainings.length > 0 && (
              <p className="text-xs text-[var(--tu-text-subtle)] mt-0.5">{completedTrainings}/{trainings.length} completed</p>
            )}
          </div>
          <Link
            href={`/accounts/${accountId}/training`}
            className="text-xs text-[var(--tu-text-brand)] font-semibold hover:underline"
          >
            Manage →
          </Link>
        </div>

        {trainings.length === 0 ? (
          <EmptyState compact icon="training" title="No trainings assigned" hint="Assign modules to track this employee’s certification progress." />
        ) : (
          <div className="divide-y divide-[var(--tu-border)]">
            {trainings.map((a) => (
              <div key={a.trainingId} className="flex items-center justify-between px-5 py-3 gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--tu-text-heading)] truncate">{a.training.title}</p>
                  <p className="text-xs text-[var(--tu-text-subtle)] mt-0.5">
                    {a.training.category ?? "Uncategorized"}
                    {a.training.durationHours ? ` · ${a.training.durationHours}h` : ""}
                    {" · "}Assigned {fmtDate(a.assignedAt)}
                  </p>
                </div>
                <div className="shrink-0">
                  {a.status === "COMPLETED" ? (
                    <div className="text-right">
                      <span className="text-xs font-semibold bg-[var(--tu-soft-success)] text-[var(--tu-on-success)] px-2 py-0.5 rounded-full">Completed</span>
                      {a.completedAt && <p className="text-xs text-[var(--tu-text-subtle)] mt-0.5">{fmtDate(a.completedAt)}</p>}
                    </div>
                  ) : (
                    <span className="text-xs font-semibold bg-[var(--tu-soft-warning)] text-[var(--tu-on-warning)] px-2 py-0.5 rounded-full">Assigned</span>
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
          className="flex-1 bg-[var(--tu-bg-surface)] rounded-xl border border-[var(--tu-border)] shadow-sm p-4 hover:shadow-md transition-shadow text-center"
        >
          <p className="text-sm font-semibold text-[var(--tu-text-heading)]">Work Orders</p>
          <p className="text-xs text-[var(--tu-text-subtle)] mt-0.5">View account work orders</p>
        </Link>
        <Link
          href={`/accounts/${accountId}/attendance`}
          className="flex-1 bg-[var(--tu-bg-surface)] rounded-xl border border-[var(--tu-border)] shadow-sm p-4 hover:shadow-md transition-shadow text-center"
        >
          <p className="text-sm font-semibold text-[var(--tu-text-heading)]">Attendance</p>
          <p className="text-xs text-[var(--tu-text-subtle)] mt-0.5">View account attendance log</p>
        </Link>
      </div>
    </div>
  );
}
