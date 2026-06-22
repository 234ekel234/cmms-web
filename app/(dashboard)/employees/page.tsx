"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";

type EmployeeStatus = "PROBATIONARY" | "REGULAR";

type Employee = {
  id: string;
  name: string;
  position: string | null;
  status: EmployeeStatus;
  categories: string[];
  createdAt: string;
};

const STATUS_CONFIG: Record<EmployeeStatus, { label: string; cls: string }> = {
  REGULAR:      { label: "Regular",      cls: "bg-green-50 text-green-700" },
  PROBATIONARY: { label: "Probationary", cls: "bg-amber-50 text-amber-700" },
};

const COMMON_CATEGORIES = [
  "Electrical", "Plumbing", "HVAC", "Mechanical", "Carpentry",
  "Cleaning", "Security", "Landscaping", "IT", "General",
];

function SkeletonRows({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <tr key={i} aria-hidden="true">
          {Array.from({ length: 5 }).map((__, j) => (
            <td key={j} style={{ padding: "14px 24px" }}>
              <div className="tu-skeleton" style={{ height: 14, borderRadius: 4 }} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<EmployeeStatus | "ALL">("ALL");
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    position: "",
    status: "REGULAR" as EmployeeStatus,
    categories: [] as string[],
    catInput: "",
  });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => { fetchEmployees(); }, []);

  async function fetchEmployees() {
    setLoading(true);
    setError(false);
    try {
      const res = await api.get("/employees");
      setEmployees(res.data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setEditId(null);
    setForm({ name: "", position: "", status: "REGULAR", categories: [], catInput: "" });
    setFormError("");
    setShowForm(true);
  }

  function openEdit(emp: Employee) {
    setEditId(emp.id);
    setForm({ name: emp.name, position: emp.position ?? "", status: emp.status, categories: emp.categories ?? [], catInput: "" });
    setFormError("");
    setShowForm(true);
  }

  function addCategory(cat: string) {
    const trimmed = cat.trim();
    if (!trimmed || form.categories.includes(trimmed)) return;
    setForm((f) => ({ ...f, categories: [...f.categories, trimmed], catInput: "" }));
  }

  function removeCategory(cat: string) {
    setForm((f) => ({ ...f, categories: f.categories.filter((c) => c !== cat) }));
  }

  async function save() {
    if (!form.name.trim()) { setFormError("Name is required."); return; }
    setFormError("");
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        position: form.position.trim() || null,
        status: form.status,
        categories: form.categories,
      };
      if (editId) {
        const res = await api.put(`/employees/${editId}`, payload);
        setEmployees((prev) => prev.map((e) => e.id === editId ? res.data : e));
      } else {
        const res = await api.post("/employees", payload);
        setEmployees((prev) => [...prev, res.data].sort((a, b) => a.name.localeCompare(b.name)));
      }
      setShowForm(false);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setFormError(e?.response?.data?.error ?? "Failed to save employee.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteEmployee(id: string) {
    setDeletingId(id);
    try {
      await api.delete(`/employees/${id}`);
      setEmployees((prev) => prev.filter((e) => e.id !== id));
    } catch {
      // silent
    } finally {
      setDeletingId(null);
    }
  }

  const filtered = employees.filter((e) => {
    const matchSearch =
      !search.trim() ||
      e.name.toLowerCase().includes(search.toLowerCase()) ||
      e.position?.toLowerCase().includes(search.toLowerCase()) ||
      (e.categories ?? []).some((c) => c.toLowerCase().includes(search.toLowerCase()));
    const matchStatus = statusFilter === "ALL" || e.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const regularCount = employees.filter((e) => e.status === "REGULAR").length;
  const probCount = employees.filter((e) => e.status === "PROBATIONARY").length;

  return (
    <div className="tu-page">
      {/* Header */}
      <div className="tu-page-header">
        <div>
          <h1 className="tu-page-title">Employee Registry</h1>
          <p className="tu-page-sub">
            {loading ? "Loading…" : `${employees.length} employees · ${regularCount} regular · ${probCount} probationary`}
          </p>
        </div>
        <button
          onClick={openCreate}
          className="tu-btn-primary"
          type="button"
        >
          + New Employee
        </button>
      </div>

      {error && (
        <div className="tu-error-banner" role="alert">Failed to load employees.</div>
      )}

      {/* Create/Edit form */}
      {showForm && (
        <div className="tu-card" style={{ marginBottom: 24 }}>
          <div className="tu-card-header">
            <h2 className="tu-card-title">{editId ? "Edit Employee" : "New Employee"}</h2>
          </div>
          <div style={{ padding: "0 24px 24px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div style={{ gridColumn: "span 2" }}>
              <label className="tu-label">Name *</label>
              <input
                className="tu-input"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Full name"
                autoFocus
              />
            </div>
            <div>
              <label className="tu-label">Position</label>
              <input
                className="tu-input"
                value={form.position}
                onChange={(e) => setForm((f) => ({ ...f, position: e.target.value }))}
                placeholder="e.g. Electrician, Supervisor"
              />
            </div>
            <div>
              <label className="tu-label">Status</label>
              <select
                className="tu-select"
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as EmployeeStatus }))}
              >
                <option value="REGULAR">Regular</option>
                <option value="PROBATIONARY">Probationary</option>
              </select>
            </div>
            <div style={{ gridColumn: "span 2" }}>
              <label className="tu-label">Skills / Categories</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                {(form.categories).map((cat) => (
                  <span key={cat} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "var(--tu-bg-brand-soft)", color: "var(--tu-text-brand)", borderRadius: 9999, padding: "2px 10px", fontSize: 12, fontWeight: 600 }}>
                    {cat}
                    <button
                      type="button"
                      onClick={() => removeCategory(cat)}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", lineHeight: 1, padding: 0, fontSize: 14 }}
                      aria-label={`Remove ${cat}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  className="tu-input"
                  style={{ flex: 1 }}
                  value={form.catInput}
                  onChange={(e) => setForm((f) => ({ ...f, catInput: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCategory(form.catInput); } }}
                  placeholder="Type and press Enter, or pick below"
                />
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                {COMMON_CATEGORIES.filter((c) => !form.categories.includes(c)).map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => addCategory(cat)}
                    style={{ fontSize: 11, padding: "2px 8px", borderRadius: 9999, border: "1px solid var(--tu-border)", background: "var(--tu-bg-secondary)", color: "var(--tu-text-body)", cursor: "pointer" }}
                  >
                    + {cat}
                  </button>
                ))}
              </div>
            </div>
            {formError && (
              <div style={{ gridColumn: "span 2" }}>
                <p style={{ color: "#C70036", fontSize: 13 }}>{formError}</p>
              </div>
            )}
            <div style={{ gridColumn: "span 2", display: "flex", gap: 12, justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="tu-btn-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="tu-btn-primary"
                style={{ opacity: saving ? 0.5 : 1 }}
              >
                {saving ? "Saving…" : (editId ? "Save Changes" : "Create")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: "flex", gap: 12, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
        <input
          className="tu-input"
          style={{ width: 240 }}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, position, skill…"
        />
        <div className="tu-filter-group" role="group" aria-label="Filter by status">
          {(["ALL", "REGULAR", "PROBATIONARY"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={`tu-period-pill${statusFilter === s ? " tu-active-pill" : ""}`}
            >
              {s === "ALL" ? "All" : STATUS_CONFIG[s].label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="tu-card">
        <div style={{ overflowX: "auto" }}>
          <table className="tu-table" aria-label="Employee registry">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Position</th>
                <th scope="col">Status</th>
                <th scope="col">Skills</th>
                <th scope="col" style={{ width: 100 }}></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <SkeletonRows count={5} />
              ) : filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    style={{ textAlign: "center", padding: "40px 24px", color: "var(--tu-text-body)", fontSize: 14 }}
                  >
                    {employees.length === 0 ? "No employees yet. Click \"+ New Employee\" to add one." : "No employees match your search."}
                  </td>
                </tr>
              ) : (
                filtered.map((emp) => {
                  const st = STATUS_CONFIG[emp.status];
                  return (
                    <tr key={emp.id}>
                      <td className="tu-strong">{emp.name}</td>
                      <td style={{ color: "var(--tu-text-body)" }}>
                        {emp.position ?? <span style={{ color: "var(--tu-text-subtle)" }}>—</span>}
                      </td>
                      <td>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${st.cls}`}>
                          {st.label}
                        </span>
                      </td>
                      <td>
                        {(emp.categories ?? []).length > 0 ? (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                            {(emp.categories ?? []).map((c) => (
                              <span
                                key={c}
                                style={{ fontSize: 11, padding: "1px 7px", borderRadius: 9999, background: "var(--tu-bg-brand-soft)", color: "var(--tu-text-brand)", fontWeight: 600 }}
                              >
                                {c}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span style={{ color: "var(--tu-text-subtle)" }}>—</span>
                        )}
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                          <button
                            type="button"
                            onClick={() => openEdit(emp)}
                            style={{ fontSize: 12, color: "var(--tu-text-brand)", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteEmployee(emp.id)}
                            disabled={deletingId === emp.id}
                            style={{ fontSize: 12, color: "#C70036", background: "none", border: "none", cursor: "pointer", fontWeight: 600, opacity: deletingId === emp.id ? 0.5 : 1 }}
                          >
                            {deletingId === emp.id ? "…" : "Delete"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
