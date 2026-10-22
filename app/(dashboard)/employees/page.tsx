"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";
import { EmptyRow } from "@/components/EmptyState";
import { EMPLOYEE_CATEGORIES, orderSkills, skillLabel } from "@/lib/employeeCategories";
import GiveLoginModal, { type LoginTarget } from "@/components/GiveLoginModal";
import { useConfirm } from "@/components/ConfirmDialog";
import ArchivedList from "@/components/ArchivedList";

type EmployeeType = "REGULAR" | "RELIEVER";

type Employee = {
  id: string;
  name: string;
  position: string | null;
  categories: string[];
  isReliever: boolean;
  /** Always sent by the API — see the registry shape in employeeRoutes.js.
   *  Read through `accountsOf` anyway: this list is built from create and
   *  edit responses as well as the initial fetch, and one missing array used
   *  to take the whole page down. */
  accounts: { id: string; name: string }[];
  /** Whether this person already holds a technician login. Sent by every
   *  employee response — list, create and edit — so a row spliced in from a
   *  save renders the same as one from the initial fetch. */
  hasLogin: boolean;
  createdAt: string;
};

const accountsOf = (e: Partial<Employee>) => e.accounts ?? [];

// An employee's classification is derived from isReliever: relievers can cover
// multiple accounts, regulars belong to a single account.
const empType = (e: { isReliever: boolean }): EmployeeType => (e.isReliever ? "RELIEVER" : "REGULAR");

const TYPE_CONFIG: Record<EmployeeType, { label: string; cls: string }> = {
  REGULAR:  { label: "Regular",  cls: "bg-[var(--tu-soft-success)] text-[var(--tu-on-success)]" },
  RELIEVER: { label: "Reliever", cls: "bg-[var(--tu-soft-info)] text-[var(--tu-on-info)]" },
};

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
  const confirm = useConfirm();
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
    isReliever: false,
  });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // A failed removal says why; it used to be swallowed, so the button simply
  // did nothing.
  const [actionError, setActionError] = useState("");
  // Someone with history is archived rather than deleted — say so, since the
  // row leaving the list looks the same either way.
  const [actionNote, setActionNote] = useState("");
  // Bumped after a restore, to refetch the registry.
  const [reloadKey, setReloadKey] = useState(0);
  const [loginFor, setLoginFor] = useState<LoginTarget | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!cancelled) setError(false);
      try {
        const res = await api.get("/employees");
        if (!cancelled) setEmployees(res.data);
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [reloadKey]);

  function openCreate() {
    setEditId(null);
    setForm({ name: "", position: "", categories: [], isReliever: false });
    setFormError("");
    setShowForm(true);
  }

  function openEdit(emp: Employee) {
    setEditId(emp.id);
    setForm({ name: emp.name, position: emp.position ?? "", categories: emp.categories ?? [], isReliever: emp.isReliever });
    setFormError("");
    setShowForm(true);
  }

  // Skills are a fixed vocabulary (see lib/employeeCategories) — picked, never
  // typed. Free text gave the same trade several spellings and a filter that
  // offered all of them, and the API rejects anything off the list anyway.
  function toggleFormCategory(cat: string) {
    setForm((f) => ({
      ...f,
      categories: f.categories.includes(cat)
        ? f.categories.filter((c) => c !== cat)
        : orderSkills([...f.categories, cat]),
    }));
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
    const emp = employees.find((e) => e.id === id);
    if (!(await confirm({
      title: "Remove this employee?",
      message: `${emp?.name ?? "This employee"} will leave the registry and every site's roster. If they have any history — shifts, work, training — they are archived and everything they did is kept; restoring puts them back on the same sites. Someone with no history is deleted, credential scans included.`,
      confirmLabel: "Remove",
    }))) return;
    setDeletingId(id);
    setActionError("");
    setActionNote("");
    try {
      const res = await api.delete(`/employees/${id}`);
      setEmployees((prev) => prev.filter((e) => e.id !== id));
      if (res.data?.archived) setActionNote(`${emp?.name ?? "They"} had history, so they were archived — restore them from “Show archived employees”.`);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setActionError(e?.response?.data?.error ?? "Could not remove that employee.");
    } finally {
      setDeletingId(null);
    }
  }

  // Skills present across the registry, so the filter only offers trades that
  // are actually on someone rather than the whole vocabulary. Ordered the way
  // the picker orders them, not alphabetically, so the two lists agree.
  const allCategories = orderSkills(
    Array.from(new Set(employees.flatMap((e) => e.categories ?? [])))
  );

  function toggleCategory(cat: string) {
    setCategoryFilter((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  }

  // Companies (accounts) that actually have employees assigned, so the filter
  // only offers accounts you'll find someone under.
  const allCompanies = Array.from(
    new Map(employees.flatMap(accountsOf).map((a) => [a.id, a])).values()
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
        (e.categories ?? []).some((c) => skillLabel(c).toLowerCase().includes(search.toLowerCase()));
      const matchType = typeFilter === "ALL" || empType(e) === typeFilter;
      const matchCompany =
        companyFilter === "ALL" ||
        (companyFilter === "UNASSIGNED"
          ? accountsOf(e).length === 0
          : accountsOf(e).some((a) => a.id === companyFilter));
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
          <h1 className="tu-page-title">Employees</h1>
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
      {actionError && (
        <div className="tu-error-banner" role="alert">{actionError}</div>
      )}
      {actionNote && <p className="tu-page-sub" role="status" style={{ marginBottom: 12 }}>{actionNote}</p>}

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
              <label className="tu-label">Skills</label>
              <p style={{ fontSize: 12, color: "var(--tu-text-subtle)", margin: "0 0 8px" }}>
                Tap every trade this person works in.
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {EMPLOYEE_CATEGORIES.map((cat) => {
                  const on = form.categories.includes(cat);
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => toggleFormCategory(cat)}
                      aria-pressed={on}
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        padding: "4px 12px",
                        borderRadius: 9999,
                        cursor: "pointer",
                        border: "1px solid",
                        borderColor: on ? "var(--tu-text-brand)" : "var(--tu-border)",
                        background: on ? "var(--tu-bg-brand-soft)" : "var(--tu-bg-surface)",
                        color: on ? "var(--tu-text-brand)" : "var(--tu-text-body)",
                      }}
                    >
                      {skillLabel(cat)}
                    </button>
                  );
                })}
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
                {saving ? "Saving…" : (editId ? "Save changes" : "Create")}
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
            aria-label="Filter by account"
          >
            <option value="ALL">All accounts</option>
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
                {skillLabel(cat)}
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
                            {orderSkills(emp.categories ?? []).map((c) => (
                              <span
                                key={c}
                                style={{ fontSize: 11, padding: "1px 7px", borderRadius: 9999, background: "var(--tu-bg-brand-soft)", color: "var(--tu-text-brand)", fontWeight: 600 }}
                              >
                                {skillLabel(c)}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span style={{ color: "var(--tu-text-subtle)" }}>—</span>
                        )}
                      </td>
                      <td>
                        {accountsOf(emp).length === 0 ? (
                          <span style={{ fontSize: 11, padding: "1px 8px", borderRadius: 9999, background: "var(--tu-bg-secondary)", color: "var(--tu-text-subtle)", fontWeight: 600 }}>
                            Unassigned
                          </span>
                        ) : (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                            {accountsOf(emp).map((a) => (
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
                        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center" }}>
                          {emp.hasLogin ? (
                            // Stated rather than hidden: "no button" reads as
                            // "not possible", and the useful fact here is that
                            // this person can already sign in.
                            <span
                              style={{ fontSize: 11, fontWeight: 600, color: "var(--tu-text-subtle)" }}
                              title="This employee already has a technician login"
                            >
                              Has login
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setLoginFor({
                                id: emp.id,
                                name: emp.name,
                                position: emp.position,
                                accounts: accountsOf(emp),
                              })}
                              style={{ fontSize: 12, color: "var(--tu-text-brand)", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}
                            >
                              Give login
                            </button>
                          )}
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
                            {deletingId === emp.id ? "…" : "Remove"}
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

      {loginFor && (
        <GiveLoginModal
          employee={loginFor}
          onClose={() => setLoginFor(null)}
          onCreated={(employeeId) =>
            // Flip the row in place rather than refetching the registry: the
            // only thing that changed is this one flag, and a reload would lose
            // the filters and scroll position the user is working in.
            setEmployees((prev) =>
              prev.map((e) => (e.id === employeeId ? { ...e, hasLogin: true } : e))
            )
          }
        />
      )}
      <ArchivedList<Employee & { archivedAt?: string }>
        noun="archived employees"
        load={async () => (await api.get("/employees?archived=true")).data}
        title={(e) => e.name}
        detail={(e) => [e.position, e.archivedAt ? `archived ${new Date(e.archivedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}` : null].filter(Boolean).join(" · ") || null}
        restore={async (e) => { await api.post(`/employees/${e.id}/restore`); }}
        canRestore
        onRestored={() => setReloadKey((k) => k + 1)}
      />
    </div>
  );
}
