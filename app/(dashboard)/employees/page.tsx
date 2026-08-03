"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";
import { EmptyRow } from "@/components/EmptyState";

type EmployeeType = "REGULAR" | "RELIEVER";

type Employee = {
  id: string;
  name: string;
  position: string | null;
  categories: string[];
  isReliever: boolean;
  accounts: { id: string; name: string }[];
  createdAt: string;
};

// An employee's classification is derived from isReliever: relievers can cover
// multiple accounts, regulars belong to a single account.
const empType = (e: { isReliever: boolean }): EmployeeType => (e.isReliever ? "RELIEVER" : "REGULAR");

const TYPE_CONFIG: Record<EmployeeType, { label: string; cls: string }> = {
  REGULAR:  { label: "Regular",  cls: "bg-[var(--tu-soft-success)] text-[var(--tu-on-success)]" },
  RELIEVER: { label: "Reliever", cls: "bg-[var(--tu-soft-info)] text-[var(--tu-on-info)]" },
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
          {Array.from({ length: 6 }).map((__, j) => (
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
  const [typeFilter, setTypeFilter] = useState<EmployeeType | "ALL">("ALL");
  const [companyFilter, setCompanyFilter] = useState<string>("ALL"); // "ALL" | accountId | "UNASSIGNED"
  const [categoryFilter, setCategoryFilter] = useState<string[]>([]);
  const [sortKey, setSortKey] = useState<"name" | "recent" | "type">("name");
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    position: "",
    categories: [] as string[],
    catInput: "",
    isReliever: false,
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
    setForm({ name: "", position: "", categories: [], catInput: "", isReliever: false });
    setFormError("");
    setShowForm(true);
  }

  function openEdit(emp: Employee) {
    setEditId(emp.id);
    setForm({ name: emp.name, position: emp.position ?? "", categories: emp.categories ?? [], catInput: "", isReliever: emp.isReliever });
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
        categories: form.categories,
        isReliever: form.isReliever,
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

  // Skills present across the registry, so the filter only offers categories
  // that actually exist on someone (not the full COMMON_CATEGORIES wishlist).
  const allCategories = Array.from(
    new Set(employees.flatMap((e) => e.categories ?? []))
  ).sort((a, b) => a.localeCompare(b));

  function toggleCategory(cat: string) {
    setCategoryFilter((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  }

  // Companies (accounts) that actually have employees assigned, so the filter
  // only offers accounts you'll find someone under.
  const allCompanies = Array.from(
    new Map(employees.flatMap((e) => e.accounts).map((a) => [a.id, a])).values()
  ).sort((a, b) => a.name.localeCompare(b.name));

  const filtersActive =
    search.trim() !== "" || typeFilter !== "ALL" || companyFilter !== "ALL" || categoryFilter.length > 0;

  function clearFilters() {
    setSearch("");
    setTypeFilter("ALL");
    setCompanyFilter("ALL");
    setCategoryFilter([]);
  }

  const filtered = employees
    .filter((e) => {
      const matchSearch =
        !search.trim() ||
        e.name.toLowerCase().includes(search.toLowerCase()) ||
        e.position?.toLowerCase().includes(search.toLowerCase()) ||
        (e.categories ?? []).some((c) => c.toLowerCase().includes(search.toLowerCase()));
      const matchType = typeFilter === "ALL" || empType(e) === typeFilter;
      const matchCompany =
        companyFilter === "ALL" ||
        (companyFilter === "UNASSIGNED"
          ? e.accounts.length === 0
          : e.accounts.some((a) => a.id === companyFilter));
      // Match any selected skill (OR) — "show me electricians or plumbers".
      const matchCategory =
        categoryFilter.length === 0 ||
        (e.categories ?? []).some((c) => categoryFilter.includes(c));
      return matchSearch && matchType && matchCompany && matchCategory;
    })
    .sort((a, b) => {
      if (sortKey === "recent") {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      if (sortKey === "type") {
        if (a.isReliever !== b.isReliever) return a.isReliever ? 1 : -1;
        return a.name.localeCompare(b.name);
      }
      return a.name.localeCompare(b.name);
    });

  const regularCount = employees.filter((e) => !e.isReliever).length;
  const relieverCount = employees.filter((e) => e.isReliever).length;

  return (
    <div className="tu-page">
      {/* Header */}
      <div className="tu-page-header">
        <div>
          <h1 className="tu-page-title">Employee Registry</h1>
          <p className="tu-page-sub">
            {loading ? "Loading…" : `${employees.length} employees · ${regularCount} regular · ${relieverCount} reliever`}
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
              <label className="tu-label">Type</label>
              <select
                className="tu-select"
                value={form.isReliever ? "RELIEVER" : "DEDICATED"}
                onChange={(e) => setForm((f) => ({ ...f, isReliever: e.target.value === "RELIEVER" }))}
              >
                <option value="DEDICATED">Regular — one account</option>
                <option value="RELIEVER">Reliever — multiple accounts</option>
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
      <div style={{ display: "flex", gap: 12, marginBottom: 12, alignItems: "center", flexWrap: "wrap" }}>
        <input
          className="tu-input"
          style={{ width: 240 }}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, position, skill…"
        />
        <div className="tu-filter-group" role="group" aria-label="Filter by type">
          {(["ALL", "REGULAR", "RELIEVER"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setTypeFilter(s)}
              className={`tu-period-pill${typeFilter === s ? " tu-active-pill" : ""}`}
            >
              {s === "ALL" ? "All" : TYPE_CONFIG[s].label}
            </button>
          ))}
        </div>
        {allCompanies.length > 0 && (
          <select
            className="tu-select"
            style={{ minWidth: 180 }}
            value={companyFilter}
            onChange={(e) => setCompanyFilter(e.target.value)}
            aria-label="Filter by company"
          >
            <option value="ALL">All companies</option>
            {allCompanies.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
            <option value="UNASSIGNED">Unassigned</option>
          </select>
        )}
        <select
          className="tu-select"
          style={{ minWidth: 160, marginLeft: "auto" }}
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as typeof sortKey)}
          aria-label="Sort employees"
        >
          <option value="name">Sort: Name (A–Z)</option>
          <option value="recent">Sort: Newest first</option>
          <option value="type">Sort: Type</option>
        </select>
      </div>

      {/* Skill / category filter */}
      {allCategories.length > 0 && (
        <div style={{ display: "flex", gap: 6, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--tu-text-subtle)", marginRight: 2 }}>
            Skills:
          </span>
          {allCategories.map((cat) => {
            const on = categoryFilter.includes(cat);
            return (
              <button
                key={cat}
                type="button"
                onClick={() => toggleCategory(cat)}
                aria-pressed={on}
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  padding: "3px 10px",
                  borderRadius: 9999,
                  cursor: "pointer",
                  border: "1px solid",
                  borderColor: on ? "var(--tu-text-brand)" : "var(--tu-border)",
                  background: on ? "var(--tu-bg-brand-soft)" : "var(--tu-bg-surface)",
                  color: on ? "var(--tu-text-brand)" : "var(--tu-text-body)",
                }}
              >
                {cat}
              </button>
            );
          })}
        </div>
      )}

      {/* Result count + clear */}
      {!loading && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <span style={{ fontSize: 13, color: "var(--tu-text-subtle)" }}>
            {filtersActive
              ? `Showing ${filtered.length} of ${employees.length}`
              : `${employees.length} employee${employees.length === 1 ? "" : "s"}`}
          </span>
          {filtersActive && (
            <button
              type="button"
              onClick={clearFilters}
              style={{ fontSize: 13, fontWeight: 600, color: "var(--tu-text-brand)", background: "none", border: "none", cursor: "pointer" }}
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* Table */}
      <div className="tu-card">
        <div style={{ overflowX: "auto" }}>
          <table className="tu-table" aria-label="Employee registry">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Position</th>
                <th scope="col">Type</th>
                <th scope="col">Skills</th>
                <th scope="col">Assigned to</th>
                <th scope="col" style={{ width: 100 }}></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <SkeletonRows count={5} />
              ) : employees.length === 0 ? (
                <EmptyRow
                  colSpan={6}
                  icon="employee"
                  title="No employees yet"
                  hint="The registry holds every technician you can assign to an account. Add the first one to get started."
                />
              ) : filtered.length === 0 ? (
                <EmptyRow
                  colSpan={6}
                  icon="search"
                  title="No matching employees"
                  hint="Nothing matches the current search and filters."
                />
              ) : (
                filtered.map((emp) => {
                  const ty = TYPE_CONFIG[empType(emp)];
                  return (
                    <tr key={emp.id}>
                      <td className="tu-strong">{emp.name}</td>
                      <td style={{ color: "var(--tu-text-body)" }}>
                        {emp.position ?? <span style={{ color: "var(--tu-text-subtle)" }}>—</span>}
                      </td>
                      <td>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${ty.cls}`}>
                          {ty.label}
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
                        {emp.accounts.length === 0 ? (
                          <span style={{ fontSize: 11, padding: "1px 8px", borderRadius: 9999, background: "var(--tu-bg-secondary)", color: "var(--tu-text-subtle)", fontWeight: 600 }}>
                            Unassigned
                          </span>
                        ) : (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                            {emp.accounts.map((a) => (
                              <span
                                key={a.id}
                                style={{ fontSize: 11, padding: "1px 8px", borderRadius: 9999, background: "var(--tu-bg-brand-soft)", color: "var(--tu-text-brand)", fontWeight: 600 }}
                              >
                                {a.name}
                              </span>
                            ))}
                          </div>
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
