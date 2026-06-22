"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

type Training = {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  durationHours: number | null;
};

type Assignment = {
  trainingId: string;
  employeeId: string;
  status: "ASSIGNED" | "COMPLETED";
  assignedAt: string;
  completedAt: string | null;
  employee: { id: string; name: string; position: string | null };
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function TrainingDetailPage() {
  const { user } = useAuth();
  const params = useParams();
  const trainingId = params.id as string;

  const [training, setTraining] = useState<Training | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ASSIGNED" | "COMPLETED">("ALL");
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const canManage = user?.role === "GENERAL_MANAGER" || user?.role === "MANAGER" || user?.role === "SUPERVISOR";

  useEffect(() => { load(); }, [trainingId]);

  async function load() {
    setLoading(true);
    try {
      const [trainRes, rosterRes] = await Promise.all([
        api.get("/trainings"),
        api.get(`/trainings/${trainingId}/employees`),
      ]);
      const found = (trainRes.data as Training[]).find((t) => t.id === trainingId);
      setTraining(found ?? null);
      setAssignments(rosterRes.data);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }

  async function markComplete(employeeId: string) {
    setCompletingId(employeeId);
    try {
      const res = await api.patch(`/trainings/${trainingId}/employees/${employeeId}/complete`, {});
      setAssignments((prev) => prev.map((a) => a.employeeId === employeeId ? { ...a, ...res.data } : a));
    } catch {
      // silent
    } finally {
      setCompletingId(null);
    }
  }

  async function remove(employeeId: string) {
    setRemovingId(employeeId);
    try {
      await api.delete(`/employees/${employeeId}/trainings/${trainingId}`);
      setAssignments((prev) => prev.filter((a) => a.employeeId !== employeeId));
    } catch {
      // silent
    } finally {
      setRemovingId(null);
    }
  }

  const filtered = assignments.filter((a) => {
    const matchSearch = !search.trim() || a.employee.name.toLowerCase().includes(search.toLowerCase()) || a.employee.position?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "ALL" || a.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const completedCount = assignments.filter((a) => a.status === "COMPLETED").length;
  const assignedCount = assignments.filter((a) => a.status === "ASSIGNED").length;

  if (loading) {
    return (
      <div className="tu-page">
        <div className="tu-skeleton" style={{ height: 28, width: 260, borderRadius: 6, marginBottom: 8 }} />
        <div className="tu-skeleton" style={{ height: 16, width: 180, borderRadius: 4, marginBottom: 32 }} />
        <div className="tu-card">
          <div style={{ padding: 24 }}>
            {[1,2,3,4].map((i) => <div key={i} className="tu-skeleton" style={{ height: 48, borderRadius: 8, marginBottom: 10 }} />)}
          </div>
        </div>
      </div>
    );
  }

  if (!training) {
    return (
      <div className="tu-page">
        <div className="tu-card" style={{ padding: "48px 24px", textAlign: "center" }}>
          <p style={{ color: "var(--tu-text-body)", fontSize: 14 }}>Training module not found.</p>
          <Link href="/trainings" style={{ display: "inline-block", marginTop: 12, fontSize: 13, color: "var(--tu-text-brand)", fontWeight: 600, textDecoration: "none" }}>
            ← Back to library
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="tu-page">
      {/* Breadcrumb */}
      <div style={{ marginBottom: 4 }}>
        <Link href="/trainings" style={{ fontSize: 13, color: "var(--tu-text-subtle)", textDecoration: "none", fontWeight: 500 }}>
          ← Training Library
        </Link>
      </div>

      {/* Header */}
      <div className="tu-page-header" style={{ marginBottom: 24 }}>
        <div>
          <h1 className="tu-page-title">{training.title}</h1>
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 4, flexWrap: "wrap" }}>
            {training.category && (
              <span className="tu-badge tu-badge-brand">{training.category}</span>
            )}
            {training.durationHours != null && (
              <span style={{ fontSize: 13, color: "var(--tu-text-subtle)" }}>{training.durationHours}h</span>
            )}
            {training.description && (
              <span style={{ fontSize: 13, color: "var(--tu-text-body)" }}>{training.description}</span>
            )}
          </div>
        </div>
      </div>

      {/* Stats strip */}
      <div className="tu-kpi-grid" style={{ marginBottom: 24 }}>
        <div className="tu-stat-card">
          <p className="tu-stat-label">Total Assigned</p>
          <p className="tu-stat-value">{assignments.length}</p>
          <p className="tu-stat-sub">employees</p>
        </div>
        <div className="tu-stat-card">
          <p className="tu-stat-label">Completed</p>
          <p className="tu-stat-value" style={{ color: "#16a34a" }}>{completedCount}</p>
          <p className="tu-stat-sub">
            {assignments.length > 0 ? `${Math.round((completedCount / assignments.length) * 100)}% done` : "no assignees"}
          </p>
        </div>
        <div className="tu-stat-card">
          <p className="tu-stat-label">Pending</p>
          <p className={`tu-stat-value${assignedCount > 0 ? " tu-stat-warning" : ""}`}>{assignedCount}</p>
          <p className="tu-stat-sub">still in progress</p>
        </div>
      </div>

      {/* Roster card */}
      <div className="tu-card">
        <div className="tu-card-header" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <h2 className="tu-card-title" style={{ marginRight: "auto" }}>Employee Roster</h2>
          <input
            className="tu-input"
            style={{ width: 220 }}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search employees…"
          />
          <div className="tu-filter-group" role="group">
            {(["ALL", "ASSIGNED", "COMPLETED"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(s)}
                className={`tu-period-pill${statusFilter === s ? " tu-active-pill" : ""}`}
              >
                {s === "ALL" ? `All (${assignments.length})` : s === "ASSIGNED" ? `Pending (${assignedCount})` : `Done (${completedCount})`}
              </button>
            ))}
          </div>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table className="tu-table" aria-label="Training roster">
            <thead>
              <tr>
                <th scope="col">Employee</th>
                <th scope="col">Position</th>
                <th scope="col">Status</th>
                <th scope="col">Assigned</th>
                <th scope="col">Completed</th>
                {canManage && <th scope="col" style={{ width: 140 }}></th>}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={canManage ? 6 : 5} style={{ textAlign: "center", padding: "40px 24px", color: "var(--tu-text-body)", fontSize: 14 }}>
                    {assignments.length === 0 ? "No employees assigned to this training yet." : "No employees match your search."}
                  </td>
                </tr>
              ) : (
                filtered.map((a) => (
                  <tr key={a.employeeId}>
                    <td className="tu-strong">{a.employee.name}</td>
                    <td style={{ color: "var(--tu-text-body)" }}>
                      {a.employee.position ?? <span style={{ color: "var(--tu-text-subtle)" }}>—</span>}
                    </td>
                    <td>
                      {a.status === "COMPLETED" ? (
                        <span className="tu-badge tu-badge-success">Completed</span>
                      ) : (
                        <span className="tu-badge tu-badge-warning">Assigned</span>
                      )}
                    </td>
                    <td style={{ color: "var(--tu-text-body)", fontSize: 13 }}>{fmtDate(a.assignedAt)}</td>
                    <td style={{ color: "var(--tu-text-body)", fontSize: 13 }}>
                      {a.completedAt ? fmtDate(a.completedAt) : <span style={{ color: "var(--tu-text-subtle)" }}>—</span>}
                    </td>
                    {canManage && (
                      <td>
                        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                          {a.status === "ASSIGNED" && (
                            <button
                              type="button"
                              onClick={() => markComplete(a.employeeId)}
                              disabled={completingId === a.employeeId}
                              style={{ fontSize: 12, color: "#16a34a", background: "none", border: "none", cursor: "pointer", fontWeight: 600, opacity: completingId === a.employeeId ? 0.5 : 1 }}
                            >
                              {completingId === a.employeeId ? "…" : "Mark done"}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => remove(a.employeeId)}
                            disabled={removingId === a.employeeId}
                            style={{ fontSize: 12, color: "#C70036", background: "none", border: "none", cursor: "pointer", fontWeight: 600, opacity: removingId === a.employeeId ? 0.5 : 1 }}
                          >
                            {removingId === a.employeeId ? "…" : "Remove"}
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
