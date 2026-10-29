"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { canManage } from "@/lib/rbac";
import Breadcrumbs from "@/components/Breadcrumbs";
import Credentials from "@/components/Credentials";
import EmptyState from "@/components/EmptyState";
import EmployeeForm from "@/components/EmployeeForm";
import { skillLabel } from "@/lib/employeeCategories";

type Employee = {
  id: string;
  name: string;
  position: string | null;
  /** Staff only — the API leaves it out for a client. */
  phone?: string | null;
  isReliever: boolean;
  categories: string[];
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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Set explicitly rather than relying on the initial state: this effect
      // re-runs in place when the route param changes, where `loading` is
      // already false and the previous record's data would otherwise sit
      // there with no affordance until the new request returned.
      if (!cancelled) setLoading(true);
      try {
        const [empRes, trainRes] = await Promise.all([
          api.get(`/accounts/${accountId}/employees`),
          api.get(`/employees/${employeeId}/trainings`),
        ]);
        const found: Employee | undefined = empRes.data.find((e: Employee) => e.id === employeeId);
        if (!found) { router.push(`/accounts/${accountId}/employees`); return; }
        if (!cancelled) setEmployee(found);
        if (!cancelled) setTrainings(trainRes.data);
      } catch {
        if (!cancelled) setError("Failed to load employee.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [accountId, employeeId, router]);

  if (loading) {
    return (
      <div className="px-4 py-5 sm:p-8 flex items-center justify-center min-h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-[var(--tu-text-brand)] border-t-transparent" />
      </div>
    );
  }

  if (!employee) {
    return <div className="px-4 py-5 sm:p-8 text-sm text-[var(--tu-on-danger)]">{error ?? "Employee not found."}</div>;
  }

  const completedTrainings = trainings.filter((t) => t.status === "COMPLETED").length;

  return (
    <div className="px-4 py-5 sm:p-8 max-w-3xl space-y-5">
      <Breadcrumbs
        items={[
          { label: "Employees", href: `/accounts/${accountId}/employees` },
          { label: employee.name },
        ]}
      />

      {/* Profile card */}
      <div className="bg-[var(--tu-bg-surface)] rounded-xl border border-[var(--tu-border)] shadow-sm p-6">
        {editing ? (
          <>
            <h2 className="text-sm font-bold text-[var(--tu-text-heading)]">Edit details</h2>
            <EmployeeForm<Employee>
              employee={employee}
              onSaved={(saved) => { setEmployee((prev) => (prev ? { ...prev, ...saved } : saved)); setEditing(false); }}
              onCancel={() => setEditing(false)}
            />
          </>
        ) : (
          <>
        <div className="flex items-start justify-between gap-4 mb-5">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-[var(--tu-text-brand)]/10 flex items-center justify-center shrink-0">
              <span className="text-[var(--tu-text-brand)] text-lg font-bold">{employee.name[0].toUpperCase()}</span>
            </div>
            <div>
              <h2 className="text-lg font-bold text-[var(--tu-text-heading)]">{employee.name}</h2>
              {employee.position && <p className="text-sm text-[var(--tu-text-subtle)]">{employee.position}</p>}
            </div>
          </div>
          {canEdit && (
            <button onClick={() => setEditing(true)} className="text-sm text-[var(--tu-text-brand)] border border-[var(--tu-text-brand)] px-3 py-1.5 rounded-lg hover:bg-[var(--tu-soft-brand)] cursor-pointer">
              Edit details
            </button>
          )}
        </div>

        {error && <p className="text-sm text-[var(--tu-on-danger)] bg-[var(--tu-soft-danger)] rounded-lg px-3 py-2 mb-4">{error}</p>}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs font-bold text-[var(--tu-text-subtle)] mb-1.5">Type</p>
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
              employee.isReliever ? "bg-[var(--tu-soft-info)] text-[var(--tu-on-info)]" : "bg-[var(--tu-soft-success)] text-[var(--tu-on-success)]"
            }`}>
              {employee.isReliever ? "Reliever" : "Regular"}
            </span>
          </div>

          {/* Phone — staff only; a client's roster read carries none. */}
          {canEdit && (
            <div>
              <p className="text-xs font-bold text-[var(--tu-text-subtle)] mb-1.5">Phone</p>
              {employee.phone ? (
                <a href={`tel:${employee.phone.replace(/[^\d+]/g, "")}`} className="text-sm text-[var(--tu-text-brand)] hover:underline">{employee.phone}</a>
              ) : (
                <span className="text-xs text-[var(--tu-text-subtle)]">Not recorded</span>
              )}
            </div>
          )}

          <div className="col-span-2">
            <p className="text-xs font-bold text-[var(--tu-text-subtle)] mb-1.5">Skills</p>
            <div className="flex flex-wrap gap-1.5">
              {(employee.categories ?? []).length === 0 ? (
                <span className="text-xs text-[var(--tu-text-subtle)]">—</span>
              ) : (
                (employee.categories ?? []).map((cat) => (
                  <span key={cat} className="text-xs font-semibold bg-[var(--tu-bg-secondary-strong)] text-[var(--tu-text-body)] px-2.5 py-1 rounded-full">
                    {skillLabel(cat)}
                  </span>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Stats row */}
          <div className="grid grid-cols-3 gap-4 mt-5 pt-5 border-t border-[var(--tu-border)]">
            <div className="text-center">
              <p className="text-xl font-bold text-[var(--tu-text-heading)]">{employee.openWorkOrders ?? 0}</p>
              <p className="text-xs text-[var(--tu-text-subtle)] mt-0.5">Open work orders</p>
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
          </>
        )}
      </div>

      {/* Credentials — staff only. A client reads everything else on their
          account, but a scanned licence carries a licence number, an address
          and a birth date, which is not theirs to read. The API returns 404 for
          them regardless; this keeps the section from rendering as an empty
          shell that only ever fails. */}
      {canEdit && <Credentials employeeId={employeeId} canEdit={canEdit} />}

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
