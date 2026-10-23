"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { MANAGERS, hasRole } from "@/lib/rbac";
import Breadcrumbs from "@/components/Breadcrumbs";
import Credentials from "@/components/Credentials";
import EmptyState from "@/components/EmptyState";
import { WORK_ORDER_STATUS, type WorkOrderStatus } from "@/lib/statuses";
import { isClosed, workOrderRef } from "@/lib/workOrders";

/**
 * One person on the company-wide roster: who they are, where they work, their
 * login, and what they have done — attendance, jobs, training, credentials —
 * across the sites the viewer shares with them.
 *
 * Read-only on purpose. Editing, giving a login and removing stay on the
 * registry list, where they already are; this page is for looking someone up.
 * Every section reads an endpoint that already scopes to the viewer's sites
 * (a reliever's other companies are never shown), so nothing here filters.
 */

type Employee = {
  id: string;
  name: string;
  position: string | null;
  categories: string[];
  isReliever: boolean;
  archivedAt: string | null;
  createdAt: string;
  accounts: { id: string; name: string }[];
  login: { id: string; email: string; role: string } | null;
};

type Summary = {
  attendance: {
    present: number;
    absent: number;
    total: number;
    rate: number | null;
    records: { date: string; isPresent: boolean | null; shiftName: string; shiftTime: string; accountName: string }[];
  };
  workOrders: {
    id: string;
    number: number;
    title: string;
    status: WorkOrderStatus;
    dueDate: string | null;
    createdAt: string;
    account: { id: string; name: string };
  }[];
};

type TrainingRow = {
  trainingId: string;
  status: "ASSIGNED" | "COMPLETED";
  assignedAt: string;
  completedAt: string | null;
  training: { id: string; title: string; category: string | null };
};

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

const ROLE_LABEL: Record<string, string> = {
  GENERAL_MANAGER: "General manager", MANAGER: "Manager", SUPERVISOR: "Supervisor",
  TECHNICIAN: "Technician", CLIENT: "Client",
};

export default function EmployeePage() {
  const { employeeId } = useParams<{ employeeId: string }>();
  const { user } = useAuth();
  const isManager = hasRole(user?.role, MANAGERS);

  const [employee, setEmployee] = useState<Employee | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [trainings, setTrainings] = useState<TrainingRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get(`/employees/${employeeId}`);
        if (cancelled) return;
        setEmployee(res.data);
        // The rest is secondary: a section that fails says so on its own
        // rather than taking the page down. (An archived employee shares no
        // site with anyone, so the summary answers 403 — that is expected.)
        const [sum, tr] = await Promise.allSettled([
          api.get(`/employees/${employeeId}/summary`),
          api.get(`/employees/${employeeId}/trainings`),
        ]);
        if (cancelled) return;
        if (sum.status === "fulfilled") setSummary(sum.value.data);
        if (tr.status === "fulfilled") setTrainings(tr.value.data);
      } catch (err: unknown) {
        const status = (err as { response?: { status?: number } })?.response?.status;
        if (!cancelled) setError(status === 404 ? "This employee isn't on any of your sites." : "Couldn't load this employee.");
      }
    })();
    return () => { cancelled = true; };
  }, [employeeId]);

  if (error) {
    return (
      <div className="tu-page">
        <Breadcrumbs items={[{ label: "Employees", href: "/employees" }, { label: "Not found" }]} />
        <div className="tu-error-banner" role="alert">{error}</div>
      </div>
    );
  }
  if (!employee) {
    return (
      <div className="tu-page">
        <div className="tu-skeleton" style={{ height: 28, width: 220, marginBottom: 16 }} />
        <div className="tu-skeleton" style={{ height: 160 }} />
      </div>
    );
  }

  const openJobs = summary?.workOrders.filter((w) => !isClosed(w)) ?? [];
  const doneTrainings = trainings.filter((t) => t.status === "COMPLETED").length;

  return (
    <div className="tu-page">
      <Breadcrumbs items={[{ label: "Employees", href: "/employees" }, { label: employee.name }]} />

      <div className="tu-page-header">
        <div>
          <h1 className="tu-page-title">{employee.name}</h1>
          <p className="tu-page-sub">
            {[employee.position, employee.isReliever ? "Reliever" : "Regular"].filter(Boolean).join(" · ")}
          </p>
        </div>
        {employee.archivedAt && <span className="tu-badge tu-badge-neutral">Archived {fmtDate(employee.archivedAt)}</span>}
      </div>

      {employee.archivedAt && (
        <p className="tu-person-note">
          Archived: off every site&apos;s roster, with all their history kept. Restore them from &ldquo;Show archived employees&rdquo; on the Employees page.
        </p>
      )}

      <div className="tu-kpi-grid">
        <div className="tu-stat-card">
          <p className="tu-stat-label">Attendance, last 30 days</p>
          <p className="tu-stat-value">{summary?.attendance.rate != null ? `${summary.attendance.rate}%` : "—"}</p>
          <p className="tu-stat-sub">
            {summary ? `${summary.attendance.present} present · ${summary.attendance.absent} absent` : "Not available"}
          </p>
        </div>
        <div className="tu-stat-card">
          <p className="tu-stat-label">Open jobs</p>
          <p className="tu-stat-value">{summary ? openJobs.length : "—"}</p>
          <p className="tu-stat-sub">{summary ? `${summary.workOrders.length} assigned in all` : "Not available"}</p>
        </div>
        <div className="tu-stat-card">
          <p className="tu-stat-label">Training</p>
          <p className="tu-stat-value">{trainings.length ? `${doneTrainings}/${trainings.length}` : "—"}</p>
          <p className="tu-stat-sub">completed</p>
        </div>
      </div>

      <div className="tu-person-grid">
        <section className="tu-card">
          <div className="tu-card-header"><h2 className="tu-card-title">Details</h2></div>
          <dl className="tu-person-facts">
            <div>
              <dt>Sites</dt>
              <dd>
                {employee.accounts.length === 0 ? (
                  <span className="tu-person-muted">Not on any of your sites</span>
                ) : (
                  employee.accounts.map((a, i) => (
                    <span key={a.id}>
                      {i > 0 && ", "}
                      <Link href={`/accounts/${a.id}/employees/${employee.id}`} className="tu-link">{a.name}</Link>
                    </span>
                  ))
                )}
              </dd>
            </div>
            <div>
              <dt>Categories</dt>
              <dd>{employee.categories.length ? employee.categories.join(", ") : <span className="tu-person-muted">None</span>}</dd>
            </div>
            <div>
              <dt>Login</dt>
              <dd>
                {employee.login ? (
                  <>
                    {isManager ? (
                      <Link href={`/users/${employee.login.id}`} className="tu-link">{employee.login.email}</Link>
                    ) : (
                      employee.login.email
                    )}
                    <span className="tu-person-muted"> · {ROLE_LABEL[employee.login.role] ?? employee.login.role}</span>
                  </>
                ) : (
                  <span className="tu-person-muted">No login</span>
                )}
              </dd>
            </div>
            <div>
              <dt>On the roster since</dt>
              <dd>{fmtDate(employee.createdAt)}</dd>
            </div>
          </dl>
        </section>

        <section className="tu-card">
          <div className="tu-card-header"><h2 className="tu-card-title">Training</h2></div>
          {trainings.length === 0 ? (
            <EmptyState compact icon="training" title="No training assigned" hint="Assign training from the Training Library." />
          ) : (
            <ul role="list" className="tu-person-list">
              {trainings.map((t) => (
                <li key={t.trainingId}>
                  <Link href={`/trainings/${t.training.id}`} className="tu-link">{t.training.title}</Link>
                  <span className="tu-person-muted">
                    {t.status === "COMPLETED" && t.completedAt ? ` · completed ${fmtDate(t.completedAt)}` : " · assigned"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="tu-card" style={{ marginTop: 24 }}>
        <div className="tu-card-header"><h2 className="tu-card-title">Jobs</h2></div>
        {!summary ? (
          <p className="tu-person-empty">Not available.</p>
        ) : summary.workOrders.length === 0 ? (
          <p className="tu-person-empty">No jobs assigned.</p>
        ) : (
          <ul role="list" className="tu-person-list">
            {summary.workOrders.slice(0, 20).map((w) => (
              <li key={w.id}>
                <Link href={`/accounts/${w.account.id}/work-orders/${w.id}`} className="tu-link">
                  {workOrderRef(w.number)} · {w.title}
                </Link>
                <span className="tu-person-muted"> · {w.account.name} · </span>
                <span className={WORK_ORDER_STATUS[w.status].badge}>{WORK_ORDER_STATUS[w.status].label}</span>
              </li>
            ))}
            {summary.workOrders.length > 20 && (
              <li className="tu-person-muted">…and {summary.workOrders.length - 20} more</li>
            )}
          </ul>
        )}
      </section>

      <section className="tu-card" style={{ marginTop: 24 }}>
        <div className="tu-card-header"><h2 className="tu-card-title">Attendance, last 30 days</h2></div>
        {!summary || summary.attendance.records.length === 0 ? (
          <p className="tu-person-empty">{summary ? "No shifts recorded." : "Not available."}</p>
        ) : (
          <ul role="list" className="tu-person-list">
            {summary.attendance.records.map((r, i) => (
              <li key={`${r.date}-${i}`}>
                {fmtDate(r.date)} · {r.shiftName} ({r.shiftTime}) · {r.accountName}
                <span className={r.isPresent ? "tu-person-ok" : r.isPresent === false ? "tu-person-bad" : "tu-person-muted"}>
                  {" "}— {r.isPresent ? "present" : r.isPresent === false ? "absent" : "not marked"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Credentials are staff-only; this page already is. */}
      <div style={{ marginTop: 24 }}>
        <Credentials employeeId={employee.id} canEdit />
      </div>
    </div>
  );
}
